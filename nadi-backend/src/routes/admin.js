const express = require('express');
const router = express.Router();

const supabase = require('../utils/supabase');
const { auth, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

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
    // Platform settings configuration (Admin mock/fallback config)
    res.json({
      success: true,
      settings: {
        maintenanceMode: false,
        registrationEnabled: true,
        minTransferAmount: 100,
        maxTransferAmount: 5000000,
      }
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
    logger.info(`Admin ${req.user.email} updated platform settings: ${JSON.stringify(req.body)}`);
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    logger.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

module.exports = router;
