const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const supabase = require('../utils/supabase');
const { auth } = require('../middleware/auth');
const { createNotification } = require('../services/notification');
const reloadly = require('../services/reloadly');
const logger = require('../utils/logger');

// @route   GET /api/v1/utilities/categories
// @desc    Get utility categories
// @access  Private
router.get('/categories', auth, async (req, res) => {
  try {
    const categories = [
      { id: 'electricity', name: 'Electricity', icon: 'zap' },
      { id: 'water', name: 'Water', icon: 'droplet' },
      { id: 'cable', name: 'Cable TV', icon: 'tv' },
      { id: 'internet', name: 'Internet', icon: 'wifi' },
      { id: 'airtime', name: 'Airtime', icon: 'phone' },
      { id: 'data', name: 'Data Bundle', icon: 'smartphone' }
    ];

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    logger.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get categories'
    });
  }
});

// @route   GET /api/v1/utilities/providers
// @desc    Get utility providers by category
// @access  Private
router.get('/providers', auth, async (req, res) => {
  try {
    const { category } = req.query;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    if (category === 'airtime' || category === 'data') {
      const operators = await reloadly.getOperators('NG');
      const providersList = operators.map(op => ({
        id: op.operatorId.toString(),
        name: op.name,
        code: op.operatorId.toString()
      }));

      return res.json({
        success: true,
        providers: providersList
      });
    }

    // Utilities billers (electricity, water, cable, internet)
    const billers = await reloadly.getBillers('NG');
    let filteredBillers = [];

    if (category === 'electricity') {
      filteredBillers = billers.filter(b => b.type === 'ELECTRICITY');
    } else if (category === 'water') {
      filteredBillers = billers.filter(b => b.type === 'WATER' || b.type === 'UTILITY');
    } else if (category === 'cable') {
      filteredBillers = billers.filter(b => b.type === 'CABLE_TV');
    } else if (category === 'internet') {
      filteredBillers = billers.filter(b => b.type === 'INTERNET');
    }

    const providersList = filteredBillers.map(b => ({
      id: b.billerId.toString(),
      name: b.name,
      code: b.billerId.toString()
    }));

    res.json({
      success: true,
      providers: providersList
    });
  } catch (error) {
    logger.error('Get providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get providers'
    });
  }
});

// @route   POST /api/v1/utilities/validate-meter
// @desc    Validate electricity meter or utility account
// @access  Private
router.post('/validate-meter', auth, [
  body('provider').notEmpty().withMessage('Provider is required'),
  body('meterNumber').notEmpty().withMessage('Meter/Account number is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { provider, meterNumber } = req.body;

    const response = await reloadly.validateBillerAccount({
      billerId: parseInt(provider),
      accountNumber: meterNumber
    });

    const customerName = response.subscriberName || response.name || response.customerName || response.subscriber?.name || 'Valued Customer';

    res.json({
      success: true,
      customer: {
        name: customerName,
        address: response.address || 'N/A',
        meterNumber: meterNumber,
        customerReference: meterNumber
      }
    });
  } catch (error) {
    logger.error('Validate meter error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Account validation failed'
    });
  }
});

// @route   POST /api/v1/utilities/pay
// @desc    Pay utility bill
// @access  Private
router.post('/pay', auth, [
  body('category').notEmpty().withMessage('Category is required'),
  body('provider').notEmpty().withMessage('Provider (biller ID) is required'),
  body('customerReference').notEmpty().withMessage('Customer reference is required'),
  body('amount').isFloat({ min: 100 }).withMessage('Minimum amount is ₦100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { category, provider, customerReference, amount, metadata = {} } = req.body;
    const reference = `UTL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Get Biller details to find name for description
    let providerName = 'Utility';
    try {
      const billers = await reloadly.getBillers('NG');
      const biller = billers.find(b => b.billerId.toString() === provider.toString());
      if (biller) {
        providerName = biller.name;
      }
    } catch (e) {
      logger.warn('Failed to fetch billers list for description mapping');
    }

    // Execute atomic DB wallet debit and transaction insertion
    const { data: txResult, error: dbErr } = await supabase.rpc('execute_wallet_debit', {
      p_user_id: req.user.id,
      p_amount: amount,
      p_ref: reference,
      p_type: 'utility_payment',
      p_category: 'utility',
      p_description: `${providerName} ${category} payment`,
      p_metadata: metadata,
      p_details: {
        provider,
        serviceType: category,
        customerReference
      }
    });

    if (dbErr || !txResult?.success) {
      logger.error('Wallet debit execution error:', dbErr);
      return res.status(400).json({
        success: false,
        message: dbErr ? dbErr.message : 'Debit failed'
      });
    }

    const txId = txResult.tx_id;

    try {
      // Call Reloadly API to process payment
      const reloadlyResponse = await reloadly.payBill({
        billerId: parseInt(provider),
        amount,
        accountNumber: customerReference,
        referenceId: reference
      });

      // Update transaction status to completed
      const token = reloadlyResponse.token || reloadlyResponse.pinCode || null;
      await supabase
        .from('transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          utility_details: {
            provider,
            serviceType: category,
            customerReference,
            token
          }
        })
        .eq('id', txId);

      // Create notification
      await createNotification({
        user_id: req.user.id,
        type: 'transaction',
        title: 'Payment Successful',
        message: `Your ${providerName} payment of ₦${amount.toLocaleString()} was successful`,
        related_to: { table: 'transactions', id: txId }
      }).catch(err => logger.error('Failed to create notification:', err));

      res.json({
        success: true,
        message: 'Payment successful',
        transaction: {
          id: txId,
          reference: reference,
          amount,
          token
        }
      });
    } catch (reloadlyError) {
      logger.error('Reloadly payment failed, rolling back debit:', reloadlyError.message);

      // Refund the debit
      await supabase.rpc('refund_wallet_debit', {
        p_tx_id: txId,
        p_user_id: req.user.id,
        p_amount: amount,
        p_reason: reloadlyError.message || 'Payment gateway failed'
      });

      res.status(400).json({
        success: false,
        message: reloadlyError.message || 'Payment failed. Wallet refunded.'
      });
    }
  } catch (error) {
    logger.error('Utility payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment failed'
    });
  }
});

// @route   POST /api/v1/utilities/airtime
// @desc    Buy airtime
// @access  Private
router.post('/airtime', auth, [
  body('network').notEmpty().withMessage('Network (operator ID) is required'),
  body('phoneNumber').notEmpty().withMessage('Phone number is required'),
  body('amount').isFloat({ min: 50 }).withMessage('Minimum airtime is ₦50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { network, phoneNumber, amount } = req.body;
    const reference = `AIR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute atomic DB wallet debit and transaction insertion
    const { data: txResult, error: dbErr } = await supabase.rpc('execute_wallet_debit', {
      p_user_id: req.user.id,
      p_amount: amount,
      p_ref: reference,
      p_type: 'airtime',
      p_category: 'utility',
      p_description: `Airtime purchase for ${phoneNumber}`,
      p_metadata: {},
      p_details: {
        operatorId: network,
        phoneNumber
      }
    });

    if (dbErr || !txResult?.success) {
      logger.error('Wallet debit execution error:', dbErr);
      return res.status(400).json({
        success: false,
        message: dbErr ? dbErr.message : 'Debit failed'
      });
    }

    const txId = txResult.tx_id;

    try {
      // Process topup via Reloadly
      await reloadly.sendTopup({
        operatorId: parseInt(network),
        amount,
        phoneNumber,
        customIdentifier: reference
      });

      // Update transaction status to completed
      await supabase
        .from('transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', txId);

      // Create notification
      await createNotification({
        user_id: req.user.id,
        type: 'transaction',
        title: 'Airtime Purchased',
        message: `Your ₦${amount.toLocaleString()} airtime purchase for ${phoneNumber} was successful`,
        related_to: { table: 'transactions', id: txId }
      }).catch(err => logger.error('Failed to create notification:', err));

      res.json({
        success: true,
        message: 'Airtime purchased successfully',
        transaction: {
          id: txId,
          reference: reference,
          amount
        }
      });
    } catch (reloadlyError) {
      logger.error('Reloadly airtime purchase failed, rolling back:', reloadlyError.message);

      // Refund the debit
      await supabase.rpc('refund_wallet_debit', {
        p_tx_id: txId,
        p_user_id: req.user.id,
        p_amount: amount,
        p_reason: reloadlyError.message || 'Payment gateway failed'
      });

      res.status(400).json({
        success: false,
        message: reloadlyError.message || 'Purchase failed. Wallet refunded.'
      });
    }
  } catch (error) {
    logger.error('Airtime purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Purchase failed'
    });
  }
});

// @route   GET /api/v1/utilities/data-plans
// @desc    Get data plans
// @access  Private
router.get('/data-plans', auth, async (req, res) => {
  try {
    const { network } = req.query;

    if (!network) {
      return res.status(400).json({
        success: false,
        message: 'Network (operator ID) is required'
      });
    }

    const operator = await reloadly.getOperatorById(network);
    const plans = [];

    if (operator.fixedAmountsDescriptions) {
      for (const [amount, description] of Object.entries(operator.fixedAmountsDescriptions)) {
        plans.push({
          code: amount,
          name: description,
          price: parseFloat(amount),
          validity: null
        });
      }
    } else if (operator.fixedAmounts) {
      operator.fixedAmounts.forEach(amount => {
        plans.push({
          code: amount.toString(),
          name: `${amount} Data Plan`,
          price: parseFloat(amount),
          validity: null
        });
      });
    }

    res.json({
      success: true,
      plans
    });
  } catch (error) {
    logger.error('Get data plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch data plans'
    });
  }
});

// @route   POST /api/v1/utilities/data
// @desc    Buy data bundle
// @access  Private
router.post('/data', auth, [
  body('network').notEmpty().withMessage('Network (operator ID) is required'),
  body('phoneNumber').notEmpty().withMessage('Phone number is required'),
  body('planCode').notEmpty().withMessage('Plan code (amount) is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { network, phoneNumber, planCode } = req.body;

    // Get operator details to verify the plan and get its price/name
    const operator = await reloadly.getOperatorById(network);
    const isPlanValid = (operator.fixedAmountsDescriptions && operator.fixedAmountsDescriptions[planCode]) ||
                        (operator.fixedAmounts && operator.fixedAmounts.map(a => a.toString()).includes(planCode.toString()));

    if (!isPlanValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan code'
      });
    }

    const amount = parseFloat(planCode);
    const planName = (operator.fixedAmountsDescriptions && operator.fixedAmountsDescriptions[planCode]) || `${amount} Data Plan`;
    const reference = `DAT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute atomic DB wallet debit and transaction insertion
    const { data: txResult, error: dbErr } = await supabase.rpc('execute_wallet_debit', {
      p_user_id: req.user.id,
      p_amount: amount,
      p_ref: reference,
      p_type: 'data',
      p_category: 'utility',
      p_description: `Data purchase for ${phoneNumber} (${planName})`,
      p_metadata: {},
      p_details: {
        operatorId: network,
        phoneNumber,
        planCode,
        planName
      }
    });

    if (dbErr || !txResult?.success) {
      logger.error('Wallet debit execution error:', dbErr);
      return res.status(400).json({
        success: false,
        message: dbErr ? dbErr.message : 'Debit failed'
      });
    }

    const txId = txResult.tx_id;

    try {
      // Process data purchase (same topup endpoint with fixed amount representing a data plan in Reloadly)
      await reloadly.sendTopup({
        operatorId: parseInt(network),
        amount,
        phoneNumber,
        customIdentifier: reference
      });

      // Update transaction status to completed
      await supabase
        .from('transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', txId);

      // Create notification
      await createNotification({
        user_id: req.user.id,
        type: 'transaction',
        title: 'Data Purchased',
        message: `Your ${planName} data purchase for ${phoneNumber} was successful`,
        related_to: { table: 'transactions', id: txId }
      }).catch(err => logger.error('Failed to create notification:', err));

      res.json({
        success: true,
        message: 'Data bundle purchased successfully',
        transaction: {
          id: txId,
          reference: reference,
          amount,
          plan: planName
        }
      });
    } catch (reloadlyError) {
      logger.error('Reloadly data purchase failed, rolling back:', reloadlyError.message);

      // Refund the debit
      await supabase.rpc('refund_wallet_debit', {
        p_tx_id: txId,
        p_user_id: req.user.id,
        p_amount: amount,
        p_reason: reloadlyError.message || 'Payment gateway failed'
      });

      res.status(400).json({
        success: false,
        message: reloadlyError.message || 'Purchase failed. Wallet refunded.'
      });
    }
  } catch (error) {
    logger.error('Data purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Purchase failed'
    });
  }
});

module.exports = router;
