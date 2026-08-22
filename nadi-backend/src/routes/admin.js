const express = require('express');
const router = express.Router();

const supabase = require('../utils/supabase');
const { auth, authorize } = require('../middleware/auth');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

const DEFAULT_OPERATIONAL_SETTINGS = {
  giftcards: {
    rates: {
      amazon: { USD: 850, GBP: 950, EUR: 890 },
      apple: { USD: 880, GBP: 980 },
      itunes: { USD: 880, GBP: 980 },
      'google-play': { USD: 820 },
      steam: { USD: 800 },
      netflix: { USD: 900 },
      spotify: { USD: 870 },
      xbox: { USD: 810 },
      playstation: { USD: 830 }
    }
  },
  fuel: {
    fuel: {
      pms: { price: 617, unit: 'per litre', name: 'Premium Motor Spirit (Petrol)' },
      ago: { price: 1100, unit: 'per litre', name: 'Automotive Gas Oil (Diesel)' }
    },
    gas: {
      '3kg': { price: 3500, name: '3kg Cylinder' },
      '6kg': { price: 6500, name: '6kg Cylinder' },
      '12.5kg': { price: 12500, name: '12.5kg Cylinder' },
      '25kg': { price: 24000, name: '25kg Cylinder' },
      '50kg': { price: 47000, name: '50kg Cylinder' }
    },
    deliveryFee: 1500
  },
  platform: {
    maintenanceMode: false,
    registrationEnabled: true,
    minTransferAmount: 100,
    maxTransferAmount: 5000000
  }
};

async function readOperationalSettings() {
  const { data, error } = await supabase
    .from('operational_settings')
    .select('key,value');

  if (error) {
    logger.warn('Admin settings table unavailable, using defaults:', error.message);
    return DEFAULT_OPERATIONAL_SETTINGS;
  }

  return (data || []).reduce((settings, row) => {
    settings[row.key] = row.value;
    return settings;
  }, { ...DEFAULT_OPERATIONAL_SETTINGS });
}

function appendTrackingLog(entity, status, message, actorId, note) {
  const tracking = entity.tracking || {};
  const logs = Array.isArray(tracking.logs) ? tracking.logs : [];
  return {
    ...tracking,
    status,
    logs: [
      ...logs,
      {
        status,
        message,
        note: note || null,
        actorId,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

const FUEL_TERMINAL_STATUSES = ['cancelled', 'delivered'];
const FUEL_STATUS_TRANSITIONS = {
  pending: ['accepted', 'cancelled'],
  accepted: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

function isValidFuelTransition(currentStatus, nextStatus) {
  const allowed = FUEL_STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function fuelStatusMessage(status, orderNumber) {
  switch (status) {
    case 'accepted':
      return `Your fuel/gas order ${orderNumber} has been accepted and assigned for fulfillment.`;
    case 'dispatched':
      return `Your fuel/gas order ${orderNumber} is on the way.`;
    case 'delivered':
      return `Your fuel/gas order ${orderNumber} has been delivered.`;
    case 'cancelled':
      return `Your fuel/gas order ${orderNumber} has been cancelled.`;
    default:
      return `Your fuel/gas order ${orderNumber} was updated.`;
  }
}

function adminReference(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

function normalizeAdminText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function bucketLabel(date, granularity) {
  const current = new Date(date);
  if (granularity === 'monthly') {
    return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'weekly') {
    const firstDay = new Date(current.getFullYear(), 0, 1);
    const week = Math.ceil((((current - firstDay) / 86400000) + firstDay.getDay() + 1) / 7);
    return `${current.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return current.toISOString().slice(0, 10);
}

function groupTransactionSeries(rows, granularity) {
  const groups = {};
  (rows || []).forEach(row => {
    const label = bucketLabel(row.created_at, granularity);
    if (!groups[label]) {
      groups[label] = { label, count: 0, volume: 0, completed: 0, failed: 0 };
    }
    groups[label].count += 1;
    groups[label].volume += Number(row.amount || 0);
    if (row.status === 'completed') groups[label].completed += 1;
    if (row.status === 'failed') groups[label].failed += 1;
  });
  return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
}

function groupUserSeries(rows, granularity) {
  const groups = {};
  (rows || []).forEach(row => {
    const label = bucketLabel(row.created_at, granularity);
    if (!groups[label]) {
      groups[label] = { label, registrations: 0, active: 0, verified: 0 };
    }
    groups[label].registrations += 1;
    if (row.is_active) groups[label].active += 1;
    if (row.kyc_status === 'verified') groups[label].verified += 1;
  });
  return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
}

function countBy(rows, key) {
  return (rows || []).reduce((acc, row) => {
    const value = row[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sanitizeSupportTicket(ticket) {
  if (!ticket) return ticket;
  return {
    ...ticket,
    user: ticket.user || null,
    reply_count: Array.isArray(ticket.replies) ? ticket.replies.length : 0
  };
}

// All admin routes require authentication + admin/super_admin role
router.use(auth);
router.use(authorize('admin', 'super_admin'));

// @route   GET /api/v1/admin/users
// @desc    Get all users (paginated)
// @access  Admin
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, kycStatus } = req.query;
    let query = supabase.from('users').select('*', { count: 'exact' });

    if (search) {
      // Search first_name, last_name, email, phone
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'inactive') query = query.eq('is_active', false);
    if (kycStatus) query = query.eq('kyc_status', kycStatus);

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIdx = (pageNum - 1) * limitNum;
    const endIdx = startIdx + limitNum - 1;

    const { data: users, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(startIdx, endIdx);

    if (error) throw error;

    res.json({
      success: true,
      users: users.map(user => {
        // Remove secrets
        delete user.transaction_pin;
        delete user.two_factor_auth;
        return user;
      }),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Admin get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// @route   GET /api/v1/admin/users/:id
// @desc    Get user details
// @access  Admin
router.get('/users/:id', async (req, res) => {
  try {
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (userErr || !user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Remove secrets
    delete user.transaction_pin;
    delete user.two_factor_auth;

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: recentTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      user,
      wallet,
      recentTransactions
    });
  } catch (error) {
    logger.error('Admin get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

// @route   PUT /api/v1/admin/users/:id
// @desc    Update user (admin)
// @access  Admin
router.put('/users/:id', async (req, res) => {
  try {
    const allowedUpdates = ['isActive', 'kycStatus', 'role', 'accountType'];
    const updates = {};

    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;
    if (req.body.kycStatus) updates.kyc_status = req.body.kycStatus;
    if (req.body.role) updates.role = req.body.role;
    if (req.body.accountType) updates.account_type = req.body.accountType;

    // Secure role promotion: Only super_admin can set/demote role to super_admin or admin
    if (updates.role) {
      // Get current user role from DB to be absolutely safe (prevent token bypass)
      const { data: adminUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', req.user.id)
        .single();

      if (adminUser?.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Only a super admin can alter administrative roles'
        });
      }
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    delete user.transaction_pin;
    delete user.two_factor_auth;

    logger.info(`Admin ${req.user.email} updated user ${user.email}: ${JSON.stringify(updates)}`);

    // Dispatch real-time user notification on status / role / KYC changes
    if (updates.kyc_status) {
      await createNotification({
        user_id: user.id,
        type: 'account',
        title: `KYC Status: ${updates.kyc_status.toUpperCase()}`,
        message: updates.kyc_status === 'verified'
          ? 'Your KYC verification has been approved. You now have full platform access.'
          : `Your KYC status has been updated to ${updates.kyc_status}.`,
        related_to: { table: 'users', id: user.id }
      }).catch(err => logger.error('User KYC update notification error:', err));
    }

    if (updates.is_active !== undefined) {
      await createNotification({
        user_id: user.id,
        type: 'account',
        title: updates.is_active ? 'Account Activated' : 'Account Deactivated',
        message: updates.is_active
          ? 'Your Nadi Digital account has been activated.'
          : 'Your Nadi Digital account has been deactivated by administrator.',
        related_to: { table: 'users', id: user.id }
      }).catch(err => logger.error('User status update notification error:', err));
    }

    res.json({ success: true, message: 'User updated', user });
  } catch (error) {
    logger.error('Admin update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

// @route   POST /api/v1/admin/users/:id/suspend
// @desc    Suspend user
// @access  Admin
router.post('/users/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.info(`Admin ${req.user.email} suspended user ${user.email}: ${reason || 'No reason provided'}`);

    await createNotification({
      user_id: user.id,
      type: 'account',
      title: 'Account Suspended',
      message: `Your account has been suspended. Reason: ${reason || 'Administrative review'}`,
      related_to: { table: 'users', id: user.id }
    }).catch(err => logger.error('User suspension notification error:', err));

    res.json({ success: true, message: 'User suspended' });
  } catch (error) {
    logger.error('Admin suspend user error:', error);
    res.status(500).json({ success: false, message: 'Failed to suspend user' });
  }
});

// @route   POST /api/v1/admin/users/:id/wallet-adjust
// @desc    Manually credit or debit a user's wallet with audit trail
// @access  Admin
router.post('/users/:id/wallet-adjust', async (req, res) => {
  try {
    const { type, amount, reason } = req.body;
    const numericAmount = parsePositiveNumber(amount);
    const normalizedType = normalizeAdminText(type).toLowerCase();
    const explanation = normalizeAdminText(reason);

    if (!['credit', 'debit'].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: 'Adjustment type must be credit or debit' });
    }
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'A positive adjustment amount is required' });
    }
    if (!explanation) {
      return res.status(400).json({ success: false, message: 'A reason for wallet adjustment is required' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id,email,first_name,last_name')
      .eq('id', req.params.id)
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const reference = adminReference('NADI-ADJ-ADMIN');
    let rpcResult = null;

    if (normalizedType === 'credit') {
      const { data, error } = await supabase.rpc('execute_wallet_credit', {
        p_user_id: user.id,
        p_amount: numericAmount,
        p_ref: reference,
        p_type: 'admin_adjustment',
        p_category: 'wallet',
        p_description: `Admin Credit: ${explanation}`,
        p_details: {
          adjustedBy: req.user.id,
          adminEmail: req.user.email,
          reason: explanation,
          type: 'credit'
        }
      });
      if (error || !data?.success) {
        return res.status(400).json({ success: false, message: error?.message || 'Failed to credit user wallet' });
      }
      rpcResult = data;
    } else {
      const { data, error } = await supabase.rpc('execute_wallet_debit', {
        p_user_id: user.id,
        p_amount: numericAmount,
        p_ref: reference,
        p_type: 'admin_adjustment',
        p_category: 'wallet',
        p_description: `Admin Debit: ${explanation}`,
        p_details: {
          adjustedBy: req.user.id,
          adminEmail: req.user.email,
          reason: explanation,
          type: 'debit'
        }
      });
      if (error || !data?.success) {
        return res.status(400).json({ success: false, message: error?.message || 'Failed to debit user wallet. Insufficient balance.' });
      }
      rpcResult = data;
    }

    // Mark transaction completed
    if (rpcResult?.tx_id) {
      await supabase
        .from('transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', rpcResult.tx_id);
    }

    // Notify the user
    await createNotification({
      user_id: user.id,
      type: 'wallet',
      title: normalizedType === 'credit' ? 'Wallet Credited' : 'Wallet Debited',
      message: `Your wallet was ${normalizedType}ed with ₦${numericAmount.toLocaleString()}. Reason: ${explanation}`,
      related_to: { table: 'transactions', id: rpcResult.tx_id }
    }).catch(err => logger.error('Wallet adjust notification error:', err));

    logger.info(`Admin ${req.user.email} adjusted wallet for ${user.email} (${normalizedType} ₦${numericAmount}): ${explanation}`);

    res.json({
      success: true,
      message: `User wallet successfully ${normalizedType}ed`,
      reference,
      transactionId: rpcResult.tx_id,
      balance: rpcResult.balance
    });
  } catch (error) {
    logger.error('Admin wallet adjustment error:', error);
    res.status(500).json({ success: false, message: 'Failed to adjust user wallet' });
  }
});

// @route   GET /api/v1/admin/transactions
// @desc    Get all transactions
// @access  Admin
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, category, search } = req.query;
    let query = supabase.from('transactions').select('*, user:users(first_name, last_name, email, phone)', { count: 'exact' });

    if (status && status !== 'all') query = query.eq('status', status);
    if (type && type !== 'all') query = query.eq('type', type);
    if (category && category !== 'all') query = query.eq('category', category);
    if (search) {
      const needle = String(search).trim();
      query = query.or(`reference.ilike.%${needle}%,description.ilike.%${needle}%`);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIdx = (pageNum - 1) * limitNum;
    const endIdx = startIdx + limitNum - 1;

    const { data: transactions, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(startIdx, endIdx);

    if (error) throw error;

    res.json({
      success: true,
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Admin get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

// @route   GET /api/v1/admin/transactions/:id
// @desc    Get transaction details
// @access  Admin
router.get('/transactions/:id', async (req, res) => {
  try {
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*, user:users(first_name, last_name, email, phone)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error || !transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({ success: true, transaction });
  } catch (error) {
    logger.error('Admin get transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transaction' });
  }
});

// @route   PATCH /api/v1/admin/transactions/:id/status
// @desc    Update/resolve transaction status
// @access  Admin
router.patch('/transactions/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body;
    const allowed = ['completed', 'failed', 'reversed', 'pending'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid transaction status' });
    }

    const { data: tx, error: fetchErr } = await supabase
      .from('transactions')
      .select('*, user:users(id, email, first_name, last_name)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr || !tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const updates = {
      status,
      details: {
        ...(tx.details || {}),
        resolvedBy: req.user.id,
        resolvedAt: new Date().toISOString(),
        adminNote: note || null
      },
      updated_at: new Date().toISOString()
    };

    if (status === 'completed' && !tx.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', tx.id)
      .select('*, user:users(first_name, last_name, email, phone)')
      .single();

    if (updateErr) throw updateErr;

    // Send user notification on transaction resolution
    if (tx.user_id) {
      await createNotification({
        user_id: tx.user_id,
        type: 'transaction',
        title: `Transaction ${status.toUpperCase()}`,
        message: `Your transaction ${tx.reference || tx.id} for ₦${Number(tx.amount || 0).toLocaleString()} is now marked as ${status}.`,
        related_to: { table: 'transactions', id: tx.id }
      }).catch(err => logger.error('Transaction resolution notification error:', err));
    }

    logger.info(`Admin ${req.user.email} updated transaction ${tx.reference || tx.id} to ${status}: ${note || ''}`);

    res.json({ success: true, message: `Transaction status updated to ${status}`, transaction: updated });
  } catch (error) {
    logger.error('Admin update transaction status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update transaction status' });
  }
});

// @route   GET /api/v1/admin/orders
// @desc    Get manual-operations orders across gift card sales, logistics, and fuel
// @access  Admin
router.get('/orders', async (req, res) => {
  try {
    const [giftcardsRes, logisticsRes, fuelRes] = await Promise.all([
      supabase
        .from('user_giftcards')
        .select('*, user:users(first_name,last_name,email,phone)')
        .eq('type', 'sell')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('logistics_orders')
        .select('*, user:users(first_name,last_name,email,phone)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('fuel_orders')
        .select('*, user:users(first_name,last_name,email,phone)')
        .order('created_at', { ascending: false })
        .limit(50)
    ]);

    const firstError = giftcardsRes.error || logisticsRes.error || fuelRes.error;
    if (firstError) throw firstError;

    const orders = [
      ...(giftcardsRes.data || []).map(order => ({
        id: order.id,
        module: 'giftcards',
        type: 'Gift Card Sale',
        status: order.status,
        amount: Number(order.payout_amount || 0),
        user: order.user,
        created_at: order.created_at,
        raw: order
      })),
      ...(logisticsRes.data || []).map(order => ({
        id: order.id,
        module: 'logistics',
        type: 'Delivery',
        status: order.status,
        amount: Number(order.pricing?.total || order.pricing?.totalAmount || 0),
        user: order.user,
        created_at: order.created_at,
        raw: order
      })),
      ...(fuelRes.data || []).map(order => ({
        id: order.id,
        module: 'fuel',
        type: order.order_type === 'gas' ? 'Gas Delivery' : 'Fuel Delivery',
        status: order.status,
        amount: Number(order.pricing?.total || 0),
        user: order.user,
        created_at: order.created_at,
        raw: order
      }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ success: true, orders });
  } catch (error) {
    logger.error('Admin get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch operation orders' });
  }
});

router.get('/giftcards/sales', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('user_giftcards')
      .select('*, user:users(first_name,last_name,email,phone)')
      .eq('type', 'sell')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: sales, error } = await query;
    if (error) throw error;

    res.json({ success: true, sales: sales || [] });
  } catch (error) {
    logger.error('Admin get gift card sales error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch gift card sales' });
  }
});

router.post('/giftcards/sales', async (req, res) => {
  try {
    const {
      userId,
      cardType,
      cardValue,
      cardCurrency = 'USD',
      rate,
      cardCode,
      cardPin,
      cardImage,
      note
    } = req.body;

    const targetUserId = normalizeAdminText(userId);
    const normalizedCardType = normalizeAdminText(cardType).toLowerCase();
    const numericValue = parsePositiveNumber(cardValue);

    if (!targetUserId || !normalizedCardType || !numericValue) {
      return res.status(400).json({ success: false, message: 'User, card type and card value are required' });
    }

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id,email,first_name,last_name')
      .eq('id', targetUserId)
      .maybeSingle();

    if (userError || !targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const settings = await readOperationalSettings();
    const currency = String(cardCurrency || 'USD').toUpperCase();
    const settingsRate = settings.giftcards?.rates?.[normalizedCardType]?.[currency];
    const numericRate = parsePositiveNumber(rate, Number(settingsRate || 0));
    if (!numericRate) {
      return res.status(400).json({ success: false, message: 'A valid gift card rate is required' });
    }

    const payoutAmount = numericValue * numericRate;
    const reference = adminReference('GFT-ADMIN');
    const { data: sale, error } = await supabase
      .from('user_giftcards')
      .insert({
        user_id: targetUserId,
        type: 'sell',
        card_type: normalizedCardType,
        card_value: numericValue,
        card_currency: currency,
        card_code: cardCode || null,
        card_pin: cardPin || null,
        card_image: cardImage || null,
        rate: numericRate,
        payout_amount: payoutAmount,
        payout_currency: 'NGN',
        status: 'pending_review',
        review: {
          reference,
          source: 'admin_assisted',
          createdBy: req.user.id,
          createdAt: new Date().toISOString(),
          note: note || null
        }
      })
      .select('*, user:users(first_name,last_name,email,phone)')
      .single();

    if (error) throw error;

    await createNotification({
      user_id: targetUserId,
      type: 'giftcard',
      title: 'Gift Card Trade Submitted',
      message: `An admin submitted your ${currency} ${numericValue} ${normalizedCardType} gift card for review.`,
      related_to: { table: 'user_giftcards', id: sale.id }
    }).catch(err => logger.error('Admin gift card sale notification error:', err));

    res.status(201).json({ success: true, message: 'Gift card sale submitted for review', sale });
  } catch (error) {
    logger.error('Admin create gift card sale error:', error);
    res.status(500).json({ success: false, message: 'Failed to create gift card sale' });
  }
});

router.post('/giftcards/sales/:id/approve', async (req, res) => {
  try {
    const { note } = req.body;
    const { data: sale, error: saleError } = await supabase
      .from('user_giftcards')
      .select('*')
      .eq('id', req.params.id)
      .eq('type', 'sell')
      .maybeSingle();

    if (saleError || !sale) return res.status(404).json({ success: false, message: 'Gift card sale not found' });
    if (sale.status !== 'pending_review') {
      return res.status(400).json({ success: false, message: `Sale is already ${sale.status}` });
    }

    const reference = sale.review?.reference || `GFT-APP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const payoutAmount = Number(sale.payout_amount);
    const { data: creditResult, error: creditError } = await supabase.rpc('execute_wallet_credit', {
      p_user_id: sale.user_id,
      p_amount: payoutAmount,
      p_ref: reference,
      p_type: 'giftcard_sale',
      p_category: 'giftcard',
      p_description: `Approved ${sale.card_currency} ${sale.card_value} ${sale.card_type} gift card sale`,
      p_details: {
        giftcardId: sale.id,
        cardType: sale.card_type,
        amount: sale.card_value,
        currency: sale.card_currency
      }
    });

    if (creditError || !creditResult?.success) {
      logger.error('Gift card sale approval payout failed:', creditError);
      return res.status(400).json({ success: false, message: creditError?.message || 'Payout failed' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_giftcards')
      .update({
        transaction_id: creditResult.tx_id,
        status: 'approved',
        review: {
          ...(sale.review || {}),
          reviewStatus: 'approved',
          reviewedBy: req.user.id,
          reviewedAt: new Date().toISOString(),
          note: note || null
        }
      })
      .eq('id', sale.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Gift card sale approved and wallet credited', sale: updated });
  } catch (error) {
    logger.error('Admin approve gift card sale error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve gift card sale' });
  }
});

router.post('/giftcards/sales/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: sale, error: saleError } = await supabase
      .from('user_giftcards')
      .select('*')
      .eq('id', req.params.id)
      .eq('type', 'sell')
      .maybeSingle();

    if (saleError || !sale) return res.status(404).json({ success: false, message: 'Gift card sale not found' });
    if (sale.status !== 'pending_review') {
      return res.status(400).json({ success: false, message: `Sale is already ${sale.status}` });
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_giftcards')
      .update({
        status: 'rejected',
        review: {
          ...(sale.review || {}),
          reviewStatus: 'rejected',
          reviewedBy: req.user.id,
          reviewedAt: new Date().toISOString(),
          reason: reason || 'Card could not be verified'
        }
      })
      .eq('id', sale.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Gift card sale rejected', sale: updated });
  } catch (error) {
    logger.error('Admin reject gift card sale error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject gift card sale' });
  }
});

router.put('/giftcards/rates/:cardType', authorize('super_admin'), async (req, res) => {
  try {
    const { cardType } = req.params;
    const { rate, currency = 'USD' } = req.body;
    const numericRate = Number(rate);

    if (!numericRate || numericRate <= 0) {
      return res.status(400).json({ success: false, message: 'A positive rate is required' });
    }

    const settings = await readOperationalSettings();
    const giftcards = settings.giftcards || DEFAULT_OPERATIONAL_SETTINGS.giftcards;
    const rates = giftcards.rates || {};
    const cardRates = rates[cardType] || {};

    const nextGiftcards = {
      ...giftcards,
      rates: {
        ...rates,
        [cardType]: {
          ...cardRates,
          [String(currency).toUpperCase()]: numericRate
        }
      }
    };

    const { error } = await supabase
      .from('operational_settings')
      .upsert({
        key: 'giftcards',
        value: nextGiftcards,
        updated_by: req.user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) throw error;

    res.json({ success: true, message: 'Gift card rate updated', giftcards: nextGiftcards });
  } catch (error) {
    logger.error('Admin update gift card rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to update gift card rate' });
  }
});

router.get('/fuel/orders', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('fuel_orders')
      .select('*, user:users(first_name,last_name,email,phone)')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: orders, error } = await query;
    if (error) throw error;

    res.json({ success: true, orders: orders || [] });
  } catch (error) {
    logger.error('Admin get fuel orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fuel orders' });
  }
});

router.post('/logistics/shipments', async (req, res) => {
  try {
    const {
      userId,
      pickupAddress,
      deliveryAddress,
      recipientName,
      recipientPhone,
      itemDescription,
      weight,
      serviceType = 'standard',
      deliveryCategory = 'parcel',
      deliveryMode = 'door_to_door',
      scheduledDate,
      assignedTo,
      notes
    } = req.body;

    const targetUserId = normalizeAdminText(userId);
    const pickup = normalizeAdminText(pickupAddress);
    const delivery = normalizeAdminText(deliveryAddress);
    const recipient = normalizeAdminText(recipientName);
    const phone = normalizeAdminText(recipientPhone);
    const description = normalizeAdminText(itemDescription);
    const weightNum = parsePositiveNumber(weight);

    if (!targetUserId || !pickup || !delivery || !recipient || !phone || !description || !weightNum) {
      return res.status(400).json({ success: false, message: 'User, pickup, delivery, recipient, item and weight are required' });
    }

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id,email,first_name,last_name')
      .eq('id', targetUserId)
      .maybeSingle();

    if (userError || !targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const baseRate = Math.max(1500, weightNum * 500);
    let amount = baseRate;
    if (serviceType === 'express') amount = baseRate * 1.5;
    if (serviceType === 'sameDay') amount = baseRate * 2.5;
    if (deliveryMode === 'interstate') amount += 3000;
    if (deliveryCategory === 'document') amount = Math.max(1000, amount - 500);

    const orderNumber = adminReference('NADI-LOG-ADMIN');
    const status = assignedTo ? 'accepted' : 'pending';
    const { data: order, error } = await supabase
      .from('logistics_orders')
      .insert({
        order_number: orderNumber,
        user_id: targetUserId,
        transaction_id: null,
        pickup: { address: pickup, coordinates: null, isWhat3words: false },
        delivery: { address: delivery, coordinates: null, isWhat3words: false, recipientName: recipient, recipientPhone: phone },
        items: [{ description, weight: weightNum, category: deliveryCategory }],
        package: { weight: weightNum, serviceType, deliveryCategory, deliveryMode, scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : null },
        pricing: { baseAmount: amount, insurance: 0, total: amount, paymentMethod: 'admin_created', paymentStatus: 'manual_or_unpaid' },
        insurance: { optedIn: false },
        status,
        assigned_to: assignedTo || null,
        tracking: {
          status,
          logs: [{
            status,
            timestamp: new Date().toISOString(),
            message: assignedTo ? `Admin created and assigned shipment to ${assignedTo}` : 'Admin created delivery request',
            actorId: req.user.id,
            note: notes || null
          }]
        }
      })
      .select('*, user:users(first_name,last_name,email,phone)')
      .single();

    if (error) throw error;

    await createNotification({
      user_id: targetUserId,
      type: 'order',
      title: 'Delivery Request Created',
      message: `An admin created delivery request ${orderNumber} for you.`,
      related_to: { table: 'logistics_orders', id: order.id }
    }).catch(err => logger.error('Admin delivery creation notification error:', err));

    res.status(201).json({ success: true, message: 'Delivery request created', order });
  } catch (error) {
    logger.error('Admin create delivery order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create delivery request' });
  }
});

router.get('/reports/overview', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '90', 10) || 90, 7), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [transactionsRes, usersRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,created_at,amount,status,category,type,user_id')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true }),
      supabase
        .from('users')
        .select('id,created_at,is_active,kyc_status,role,account_type')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
    ]);

    const firstError = transactionsRes.error || usersRes.error;
    if (firstError) throw firstError;

    const txRows = transactionsRes.data || [];
    const userRows = usersRes.data || [];
    const completedRows = txRows.filter(row => row.status === 'completed');
    const volume = txRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const completedVolume = completedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    res.json({
      success: true,
      range: { days, since: since.toISOString(), generatedAt: new Date().toISOString() },
      transactions: {
        summary: {
          total: txRows.length,
          completed: completedRows.length,
          failed: txRows.filter(row => row.status === 'failed').length,
          pending: txRows.filter(row => row.status === 'pending').length,
          volume,
          completedVolume,
          averageAmount: txRows.length ? volume / txRows.length : 0
        },
        daily: groupTransactionSeries(txRows, 'daily'),
        weekly: groupTransactionSeries(txRows, 'weekly'),
        monthly: groupTransactionSeries(txRows, 'monthly'),
        byStatus: countBy(txRows, 'status'),
        byCategory: countBy(txRows, 'category'),
        byType: countBy(txRows, 'type')
      },
      users: {
        summary: {
          newUsers: userRows.length,
          active: userRows.filter(row => row.is_active).length,
          verified: userRows.filter(row => row.kyc_status === 'verified').length,
          admins: userRows.filter(row => ['admin', 'super_admin'].includes(row.role)).length
        },
        daily: groupUserSeries(userRows, 'daily'),
        weekly: groupUserSeries(userRows, 'weekly'),
        monthly: groupUserSeries(userRows, 'monthly'),
        byKyc: countBy(userRows, 'kyc_status'),
        byRole: countBy(userRows, 'role'),
        byAccountType: countBy(userRows, 'account_type')
      }
    });
  } catch (error) {
    logger.error('Admin reports overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reports overview' });
  }
});

router.post('/fuel/orders', async (req, res) => {
  try {
    const {
      userId,
      type,
      subtype,
      quantity,
      deliveryAddress,
      phoneNumber,
      priority = 'normal',
      scheduledDate,
      customerNotes,
      assignedTo
    } = req.body;

    const targetUserId = normalizeAdminText(userId);
    const normalizedType = normalizeAdminText(type);
    const normalizedSubtype = normalizeAdminText(subtype);
    const qtyNum = parsePositiveNumber(quantity);
    const address = normalizeAdminText(deliveryAddress);

    if (!targetUserId || !['fuel', 'gas'].includes(normalizedType) || !normalizedSubtype || !qtyNum || !address || !normalizeAdminText(phoneNumber)) {
      return res.status(400).json({ success: false, message: 'User, type, subtype, quantity, address and phone number are required' });
    }

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id,email,first_name,last_name')
      .eq('id', targetUserId)
      .maybeSingle();

    if (userError || !targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const settings = await readOperationalSettings();
    const fuelSettings = settings.fuel || DEFAULT_OPERATIONAL_SETTINGS.fuel;
    const priceRecord = normalizedType === 'fuel'
      ? fuelSettings.fuel?.[normalizedSubtype]
      : fuelSettings.gas?.[normalizedSubtype];

    if (!priceRecord?.price) {
      return res.status(400).json({ success: false, message: 'Invalid fuel/gas subtype' });
    }

    const itemAmount = Number(priceRecord.price) * qtyNum;
    const deliveryFee = Number(fuelSettings.deliveryFee || 0);
    const total = itemAmount + deliveryFee;
    const orderNumber = adminReference('NADI-FUEL-ADMIN');
    const status = assignedTo ? 'accepted' : 'pending';

    const { data: order, error } = await supabase
      .from('fuel_orders')
      .insert({
        order_number: orderNumber,
        user_id: targetUserId,
        transaction_id: null,
        order_type: normalizedType,
        fuel_details: normalizedType === 'fuel' ? { subtype: normalizedSubtype, quantity: qtyNum, unitPrice: Number(priceRecord.price) } : null,
        gas_details: normalizedType === 'gas' ? { subtype: normalizedSubtype, quantity: qtyNum, unitPrice: Number(priceRecord.price) } : null,
        delivery_address: { address, coordinates: null, isWhat3words: false },
        contact_phone: phoneNumber,
        pricing: { itemAmount, deliveryFee, total, paymentMethod: 'admin_created', paymentStatus: 'manual_or_unpaid' },
        status,
        priority,
        assigned_driver: assignedTo || null,
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        customer_notes: customerNotes || null,
        admin_notes: `Created by admin ${req.user.email || req.user.id}`,
        tracking: {
          status,
          logs: [{
            status,
            timestamp: new Date().toISOString(),
            message: assignedTo ? `Admin created and assigned order to ${assignedTo}` : 'Admin created fuel/gas request',
            actorId: req.user.id
          }]
        }
      })
      .select('*, user:users(first_name,last_name,email,phone)')
      .single();

    if (error) throw error;

    await createNotification({
      user_id: targetUserId,
      type: 'order',
      title: 'Fuel/Gas Request Created',
      message: `An admin created fuel/gas request ${orderNumber} for you.`,
      related_to: { table: 'fuel_orders', id: order.id }
    }).catch(err => logger.error('Admin fuel creation notification error:', err));

    res.status(201).json({ success: true, message: 'Fuel/gas request created', order });
  } catch (error) {
    logger.error('Admin create fuel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create fuel/gas request' });
  }
});

router.patch('/fuel/orders/:id/status', async (req, res) => {
  try {
    const { status, note, assignedTo, proofUrl } = req.body;
    const allowed = ['accepted', 'dispatched', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid fuel order status' });
    }

    const { data: order, error: orderError } = await supabase
      .from('fuel_orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (orderError || !order) return res.status(404).json({ success: false, message: 'Fuel order not found' });
    if (FUEL_TERMINAL_STATUSES.includes(order.status)) {
      return res.status(400).json({ success: false, message: `Order is already ${order.status}` });
    }
    if (!isValidFuelTransition(order.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Fuel order cannot transition from ${order.status} to ${status}`
      });
    }
    if (status === 'dispatched' && !(assignedTo || order.assigned_driver)) {
      return res.status(400).json({ success: false, message: 'Assign an operator before dispatching this order' });
    }

    let refundResult = null;
    if (status === 'cancelled' && order.transaction_id) {
      const refundAmount = Number(order.pricing?.total || 0);
      const { data, error: refundError } = await supabase.rpc('refund_wallet_debit', {
        p_tx_id: order.transaction_id,
        p_user_id: order.user_id,
        p_amount: refundAmount,
        p_reason: note || 'Fuel/gas order cancelled by admin'
      });

      if (refundError || data?.success === false) {
        logger.error('Admin fuel cancellation refund failed:', refundError || data);
        return res.status(400).json({
          success: false,
          message: refundError?.message || data?.message || 'Failed to refund cancelled fuel order'
        });
      }
      refundResult = data;
    }

    const proof = proofUrl ? {
      ...(order.delivery_proof || {}),
      proofUrl,
      recordedBy: req.user.id,
      recordedAt: new Date().toISOString()
    } : order.delivery_proof;

    const tracking = appendTrackingLog(
      order,
      status,
      note || `Fuel order marked ${status.replaceAll('_', ' ')}`,
      req.user.id,
      note
    );

    const updates = {
      status,
      assigned_driver: assignedTo || order.assigned_driver || null,
      delivery_proof: proof,
      admin_notes: note || order.admin_notes || null,
      tracking,
      updated_at: new Date().toISOString()
    };

    if (status === 'cancelled') {
      updates.cancellation = {
        ...(order.cancellation || {}),
        cancelledBy: req.user.id,
        cancelledAt: new Date().toISOString(),
        reason: note || 'Cancelled by admin',
        refund: refundResult
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('fuel_orders')
      .update(updates)
      .eq('id', order.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await createNotification({
      user_id: order.user_id,
      type: 'order',
      title: `Fuel Order ${status.replaceAll('_', ' ')}`,
      message: fuelStatusMessage(status, order.order_number),
      related_to: { table: 'fuel_orders', id: order.id }
    }).catch(err => logger.error('Fuel admin status notification error:', err));

    res.json({
      success: true,
      message: status === 'cancelled' ? 'Fuel order cancelled and refunded' : 'Fuel order status updated',
      order: updated,
      refund: refundResult
    });
  } catch (error) {
    logger.error('Admin update fuel order status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update fuel order status' });
  }
});

router.get('/support/tickets', async (req, res) => {
  try {
    const { status, priority, category, search, limit = 100 } = req.query;
    let query = supabase
      .from('support_tickets')
      .select('*, user:users(first_name,last_name,email,phone)')
      .order('updated_at', { ascending: false })
      .limit(Number(limit) || 100);

    if (status && status !== 'all') query = query.eq('status', status);
    if (priority && priority !== 'all') query = query.eq('priority', priority);
    if (category && category !== 'all') query = query.eq('category', category);
    if (search) {
      const needle = String(search).replaceAll(',', ' ');
      query = query.or(`reference.ilike.%${needle}%,subject.ilike.%${needle}%,message.ilike.%${needle}%`);
    }

    const { data: tickets, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      tickets: (tickets || []).map(sanitizeSupportTicket)
    });
  } catch (error) {
    logger.error('Admin get support tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch support tickets' });
  }
});

router.patch('/support/tickets/:id', async (req, res) => {
  try {
    const allowedStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
    const allowedPriorities = ['low', 'normal', 'high', 'urgent'];
    const updates = {};

    if (req.body.status) {
      if (!allowedStatuses.includes(req.body.status)) {
        return res.status(400).json({ success: false, message: 'Invalid support ticket status' });
      }
      updates.status = req.body.status;
      if (req.body.status === 'closed') updates.closed_at = new Date().toISOString();
    }

    if (req.body.priority) {
      if (!allowedPriorities.includes(req.body.priority)) {
        return res.status(400).json({ success: false, message: 'Invalid support ticket priority' });
      }
      updates.priority = req.body.priority;
    }

    if (req.body.assignedTo !== undefined) updates.assigned_to = String(req.body.assignedTo || '').trim() || null;
    if (req.body.adminNotes !== undefined) updates.admin_notes = String(req.body.adminNotes || '').trim() || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No ticket updates provided' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, user:users(first_name,last_name,email,phone)')
      .maybeSingle();

    if (error || !ticket) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    await createNotification({
      user_id: ticket.user_id,
      type: 'support',
      title: 'Support Ticket Updated',
      message: `Your support ticket ${ticket.reference} is now ${ticket.status.replaceAll('_', ' ')}.`,
      related_to: { table: 'support_tickets', id: ticket.id }
    }).catch(err => logger.error('Support ticket update notification error:', err));

    res.json({ success: true, message: 'Support ticket updated', ticket: sanitizeSupportTicket(ticket) });
  } catch (error) {
    logger.error('Admin update support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to update support ticket' });
  }
});

router.post('/support/tickets/:id/reply', async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, message: 'Reply message is required' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (existingError || !existing) {
      return res.status(404).json({ success: false, message: 'Support ticket not found' });
    }

    const replies = Array.isArray(existing.replies) ? existing.replies : [];
    const nextReplies = [
      ...replies,
      {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        authorId: req.user.id,
        authorName: req.user.email || 'Admin',
        authorType: 'admin',
        message,
        createdAt: new Date().toISOString()
      }
    ];

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .update({
        replies: nextReplies,
        status: req.body.status || 'waiting_customer',
        assigned_to: req.body.assignedTo || existing.assigned_to || req.user.email || req.user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select('*, user:users(first_name,last_name,email,phone)')
      .single();

    if (error) throw error;

    await createNotification({
      user_id: ticket.user_id,
      type: 'support',
      title: 'Support Replied',
      message: `Support replied to ticket ${ticket.reference}.`,
      related_to: { table: 'support_tickets', id: ticket.id }
    }).catch(err => logger.error('Support reply notification error:', err));

    res.json({ success: true, message: 'Support reply sent', ticket: sanitizeSupportTicket(ticket) });
  } catch (error) {
    logger.error('Admin reply support ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to reply to support ticket' });
  }
});

// @route   GET /api/v1/admin/analytics/dashboard
// @desc    Get dashboard stats
// @access  Admin
router.get('/analytics/dashboard', async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalTransactions },
      { count: pendingTransactions },
      { data: revenueRows }
    ] = await Promise.all([
      supabase.from('users').select('*', { head: true, count: 'exact' }),
      supabase.from('users').select('*', { head: true, count: 'exact' }).eq('is_active', true),
      supabase.from('transactions').select('*', { head: true, count: 'exact' }),
      supabase.from('transactions').select('*', { head: true, count: 'exact' }).eq('status', 'pending'),
      supabase.from('transactions').select('amount').eq('status', 'completed').eq('type', 'fee').gte('created_at', startOfMonth.toISOString())
    ]);

    const monthlyRevenue = revenueRows?.reduce((sum, row) => sum + parseFloat(row.amount), 0) || 0;

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        totalTransactions,
        pendingTransactions,
        monthlyRevenue
      }
    });
  } catch (error) {
    logger.error('Admin dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// @route   GET /api/v1/admin/analytics/revenue
// @desc    Get revenue report
// @access  Admin
router.get('/analytics/revenue', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = supabase.from('transactions').select('created_at, amount').eq('status', 'completed');
    
    if (startDate) query = query.gte('created_at', new Date(startDate).toISOString());
    if (endDate) query = query.lte('created_at', new Date(endDate).toISOString());

    const { data: rows, error } = await query;
    if (error) throw error;

    // Group completed transaction revenues by day
    const groups = {};
    (rows || []).forEach(row => {
      const dateStr = row.created_at.split('T')[0];
      if (!groups[dateStr]) {
        groups[dateStr] = { _id: dateStr, total: 0, count: 0 };
      }
      groups[dateStr].total += parseFloat(row.amount);
      groups[dateStr].count += 1;
    });

    const revenue = Object.values(groups).sort((a, b) => a._id.localeCompare(b._id));

    res.json({ success: true, revenue });
  } catch (error) {
    logger.error('Admin revenue report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue report' });
  }
});

// @route   GET /api/v1/admin/settings
// @desc    Get platform settings
// @access  Admin
router.get('/settings', async (req, res) => {
  try {
    const settings = await readOperationalSettings();
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
});

// @route   PUT /api/v1/admin/settings
// @desc    Update platform settings
// @access  Super Admin
router.put('/settings', authorize('super_admin'), async (req, res) => {
  try {
    const updates = req.body.settings || req.body;
    const entries = Object.entries(updates)
      .filter(([key]) => ['platform', 'fuel', 'giftcards', 'crypto'].includes(key))
      .map(([key, value]) => ({
        key,
        value,
        updated_by: req.user.id,
        updated_at: new Date().toISOString()
      }));

    if (entries.length === 0) {
      return res.status(400).json({ success: false, message: 'No supported settings were provided' });
    }

    const { error } = await supabase
      .from('operational_settings')
      .upsert(entries, { onConflict: 'key' });

    if (error) throw error;

    logger.info(`Admin ${req.user.email} updated platform settings: ${JSON.stringify(Object.keys(updates))}`);
    res.json({ success: true, message: 'Settings updated', settings: await readOperationalSettings() });
  } catch (error) {
    logger.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

// @route   GET /api/v1/admin/export
// @desc    Export transactions, users, or operations as CSV
// @access  Admin
router.get('/export', async (req, res) => {
  try {
    const { type = 'transactions' } = req.query;
    let csvData = '';
    const filename = `nadi_${type}_export_${Date.now()}.csv`;

    if (type === 'transactions') {
      const { data: rows } = await supabase
        .from('transactions')
        .select('*, user:users(first_name, last_name, email, phone)')
        .order('created_at', { ascending: false })
        .limit(2000);

      const header = ['Reference', 'Customer Name', 'Customer Email', 'Category', 'Type', 'Amount (NGN)', 'Status', 'Date Created', 'Description'];
      const body = (rows || []).map(r => [
        `"${r.reference || r.id}"`,
        `"${(r.user?.first_name || '') + ' ' + (r.user?.last_name || '')}"`,
        `"${r.user?.email || ''}"`,
        `"${r.category || ''}"`,
        `"${r.type || ''}"`,
        r.amount || 0,
        `"${r.status || ''}"`,
        `"${r.created_at || ''}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`
      ].join(','));

      csvData = [header.join(','), ...body].join('\n');
    } else if (type === 'users') {
      const { data: rows } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);

      const header = ['User ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Role', 'KYC Status', 'Account Status', 'Date Joined'];
      const body = (rows || []).map(r => [
        `"${r.id}"`,
        `"${r.first_name || ''}"`,
        `"${r.last_name || ''}"`,
        `"${r.email || ''}"`,
        `"${r.phone || ''}"`,
        `"${r.role || 'user'}"`,
        `"${r.kyc_status || 'pending'}"`,
        r.is_active ? 'Active' : 'Suspended',
        `"${r.created_at || ''}"`
      ].join(','));

      csvData = [header.join(','), ...body].join('\n');
    } else if (type === 'operations') {
      const [logisticsRes, fuelRes] = await Promise.all([
        supabase.from('shipments').select('*, user:users(first_name, last_name, email)').limit(1000),
        supabase.from('fuel_orders').select('*, user:users(first_name, last_name, email)').limit(1000)
      ]);

      const header = ['Order Number', 'Module', 'Customer', 'Status', 'Driver / Assigned', 'Date Created'];
      const logisticsRows = (logisticsRes.data || []).map(s => [
        `"${s.tracking_number || s.id}"`,
        'Logistics Delivery',
        `"${(s.user?.first_name || '') + ' ' + (s.user?.last_name || '')}"`,
        `"${s.status || ''}"`,
        `"${s.assigned_to || 'Unassigned'}"`,
        `"${s.created_at || ''}"`
      ].join(','));

      const fuelRows = (fuelRes.data || []).map(f => [
        `"${f.order_number || f.id}"`,
        'Fuel & Gas',
        `"${(f.user?.first_name || '') + ' ' + (f.user?.last_name || '')}"`,
        `"${f.status || ''}"`,
        `"${f.assigned_driver || 'Unassigned'}"`,
        `"${f.created_at || ''}"`
      ].join(','));

      csvData = [header.join(','), ...logisticsRows, ...fuelRows].join('\n');
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported export type' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvData);
  } catch (error) {
    logger.error('Export CSV error:', error);
    res.status(500).json({ success: false, message: 'Failed to export CSV' });
  }
});

module.exports = router;
