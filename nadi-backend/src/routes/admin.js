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
    res.json({ success: true, message: 'User suspended' });
  } catch (error) {
    logger.error('Admin suspend user error:', error);
    res.status(500).json({ success: false, message: 'Failed to suspend user' });
  }
});

// @route   GET /api/v1/admin/transactions
// @desc    Get all transactions
// @access  Admin
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    let query = supabase.from('transactions').select('*, user:users(first_name, last_name, email)', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);

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

router.patch('/fuel/orders/:id/status', async (req, res) => {
  try {
    const { status, note, assignedTo, proofUrl } = req.body;
    const allowed = ['pending', 'accepted', 'dispatched', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid fuel order status' });
    }

    const { data: order, error: orderError } = await supabase
      .from('fuel_orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (orderError || !order) return res.status(404).json({ success: false, message: 'Fuel order not found' });
    if (order.status === 'cancelled' || order.status === 'delivered') {
      return res.status(400).json({ success: false, message: `Order is already ${order.status}` });
    }

    const tracking = appendTrackingLog(order, status, `Fuel order marked ${status}`, req.user.id, note);
    const { data: updated, error: updateError } = await supabase
      .from('fuel_orders')
      .update({
        status,
        assigned_driver: assignedTo || order.assigned_driver || null,
        delivery_proof: proofUrl ? { ...(order.delivery_proof || {}), proofUrl } : order.delivery_proof,
        admin_notes: note || order.admin_notes || null,
        tracking
      })
      .eq('id', order.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Fuel order status updated', order: updated });
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
      .filter(([key]) => ['platform', 'fuel', 'giftcards'].includes(key))
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

module.exports = router;
