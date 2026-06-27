const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const axios = require('axios');

const { Transaction } = require('../models');
const { auth } = require('../middleware/auth');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

// VTPass configuration (Nigerian bill payment API)
const VTPASS_API_KEY = process.env.VTPASS_API_KEY;
const VTPASS_SECRET_KEY = process.env.VTPASS_SECRET_KEY;
const VTPASS_BASE_URL = 'https://vtpass.com/api';

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

    const providers = {
      electricity: [
        { id: 'ikedc', name: 'Ikeja Electric (IKEDC)', code: 'ikedc' },
        { id: 'ekedc', name: 'Eko Electric (EKEDC)', code: 'ekedc' },
        { id: 'aedc', name: 'Abuja Electric (AEDC)', code: 'abuja-electric' },
        { id: 'phedc', name: 'Port Harcourt Electric (PHEDC)', code: 'portharcourt-electric' },
        { id: 'ibedc', name: 'Ibadan Electric (IBEDC)', code: 'ibadan-electric' },
        { id: 'kedco', name: 'Kano Electric (KEDCO)', code: 'kano-electric' },
        { id: 'jedc', name: 'Jos Electric (JEDC)', code: 'jos-electric' },
        { id: 'kaedco', name: 'Kaduna Electric (KAEDCO)', code: 'kaduna-electric' }
      ],
      water: [
        { id: 'lagos_water', name: 'Lagos Water Corporation', code: 'lagos-water' },
        { id: 'fct_water', name: 'FCT Water Board', code: 'fct-water' }
      ],
      cable: [
        { id: 'dstv', name: 'DSTV', code: 'dstv' },
        { id: 'gotv', name: 'GOTV', code: 'gotv' },
        { id: 'startimes', name: 'Startimes', code: 'startimes' },
        { id: 'showmax', name: 'Showmax', code: 'showmax' }
      ],
      internet: [
        { id: 'mtn', name: 'MTN', code: 'mtn' },
        { id: 'airtel', name: 'Airtel', code: 'airtel' },
        { id: 'glo', name: 'Glo', code: 'glo' },
        { id: '9mobile', name: '9mobile', code: 'etisalat' },
        { id: 'spectranet', name: 'Spectranet', code: 'spectranet' },
        { id: 'smile', name: 'Smile', code: 'smile' }
      ],
      airtime: [
        { id: 'mtn', name: 'MTN', code: 'mtn' },
        { id: 'airtel', name: 'Airtel', code: 'airtel' },
        { id: 'glo', name: 'Glo', code: 'glo' },
        { id: '9mobile', name: '9mobile', code: 'etisalat' }
      ],
      data: [
        { id: 'mtn', name: 'MTN', code: 'mtn' },
        { id: 'airtel', name: 'Airtel', code: 'airtel' },
        { id: 'glo', name: 'Glo', code: 'glo' },
        { id: '9mobile', name: '9mobile', code: 'etisalat' }
      ]
    };

    res.json({
      success: true,
      providers: providers[category] || []
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
// @desc    Validate electricity meter
// @access  Private
router.post('/validate-meter', auth, [
  body('provider').notEmpty(),
  body('meterNumber').notEmpty(),
  body('meterType').isIn(['prepaid', 'postpaid'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { provider, meterNumber, meterType } = req.body;

    // Call VTPass API to validate meter
    const response = await axios.post(
      `${VTPASS_BASE_URL}/merchant-verify`,
      {
        billersCode: meterNumber,
        serviceID: provider,
        type: meterType
      },
      {
        headers: {
          'api-key': VTPASS_API_KEY,
          'secret-key': VTPASS_SECRET_KEY
        }
      }
    );

    if (response.data.code === '000') {
      res.json({
        success: true,
        customer: {
          name: response.data.content.Customer_Name,
          address: response.data.content.Address,
          meterNumber: response.data.content.MeterNumber,
          customerReference: response.data.content.Customer_Reference
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: response.data.response_description || 'Meter validation failed'
      });
    }
  } catch (error) {
    logger.error('Validate meter error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate meter'
    });
  }
});

// @route   POST /api/v1/utilities/pay
// @desc    Pay utility bill
// @access  Private
router.post('/pay', auth, [
  body('category').notEmpty(),
  body('provider').notEmpty(),
  body('customerReference').notEmpty(),
  body('amount').isFloat({ min: 100 })
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

    // Check wallet balance
    const { Wallet } = require('../models');
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet || wallet.naira.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Generate reference
    const reference = `UTL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create pending transaction
    const transaction = await Transaction.create({
      reference,
      user: req.user._id,
      type: 'utility_payment',
      category: 'utility',
      amount,
      currency: 'NGN',
      direction: 'debit',
      status: 'pending',
      paymentMethod: 'wallet',
      description: `${provider} ${category} payment`,
      utilityDetails: {
        provider,
        serviceType: category,
        customerReference
      },
      metadata
    });

    // Call VTPass API to process payment
    const vtpassResponse = await axios.post(
      `${VTPASS_BASE_URL}/pay`,
      {
        request_id: reference,
        serviceID: provider,
        billersCode: customerReference,
        variation_code: metadata.variationCode || '',
        amount,
        phone: req.user.phone
      },
      {
        headers: {
          'api-key': VTPASS_API_KEY,
          'secret-key': VTPASS_SECRET_KEY
        }
      }
    );

    if (vtpassResponse.data.code === '000') {
      // Update transaction
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      transaction.utilityDetails.token = vtpassResponse.data.content.token;
      await transaction.save();

      // Deduct from wallet
      wallet.naira.balance -= amount;
      await wallet.save();

      // Send notification
      await createNotification({
        user: req.user._id,
        type: 'transaction',
        title: 'Payment Successful',
        message: `Your ${provider} payment of ₦${amount.toLocaleString()} was successful`,
        relatedTo: { model: 'Transaction', id: transaction._id },
        channels: { inApp: true, email: true }
      });

      res.json({
        success: true,
        message: 'Payment successful',
        transaction: {
          id: transaction._id,
          reference: transaction.reference,
          amount: transaction.amount,
          token: transaction.utilityDetails.token
        }
      });
    } else {
      // Mark transaction as failed
      transaction.status = 'failed';
      transaction.failureReason = vtpassResponse.data.response_description;
      await transaction.save();

      res.status(400).json({
        success: false,
        message: vtpassResponse.data.response_description || 'Payment failed'
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
  body('network').notEmpty(),
  body('phoneNumber').notEmpty(),
  body('amount').isFloat({ min: 50 })
], async (req, res) => {
  try {
    const { network, phoneNumber, amount } = req.body;

    // Check wallet balance
    const { Wallet } = require('../models');
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet || wallet.naira.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    const reference = `AIR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create transaction
    const transaction = await Transaction.create({
      reference,
      user: req.user._id,
      type: 'airtime',
      category: 'utility',
      amount,
      currency: 'NGN',
      direction: 'debit',
      status: 'pending',
      description: `Airtime purchase for ${phoneNumber}`
    });

    // Process via VTPass
    const response = await axios.post(
      `${VTPASS_BASE_URL}/pay`,
      {
        request_id: reference,
        serviceID: network,
        amount,
        phone: phoneNumber
      },
      {
        headers: {
          'api-key': VTPASS_API_KEY,
          'secret-key': VTPASS_SECRET_KEY
        }
      }
    );

    if (response.data.code === '000') {
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      await transaction.save();

      wallet.naira.balance -= amount;
      await wallet.save();

      res.json({
        success: true,
        message: 'Airtime purchased successfully',
        transaction: {
          id: transaction._id,
          reference: transaction.reference,
          amount: transaction.amount
        }
      });
    } else {
      transaction.status = 'failed';
      await transaction.save();

      res.status(400).json({
        success: false,
        message: response.data.response_description || 'Purchase failed'
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

    // Fetch data plans from VTPass
    const response = await axios.get(
      `${VTPASS_BASE_URL}/service-variations?serviceID=${network}`,
      {
        headers: {
          'api-key': VTPASS_API_KEY
        }
      }
    );

    if (response.data.response_description === '000') {
      res.json({
        success: true,
        plans: response.data.content.variations.map(plan => ({
          code: plan.variation_code,
          name: plan.name,
          price: plan.variation_amount,
          validity: plan.validity
        }))
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to fetch data plans'
      });
    }
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
  body('network').notEmpty(),
  body('phoneNumber').notEmpty(),
  body('planCode').notEmpty()
], async (req, res) => {
  try {
    const { network, phoneNumber, planCode } = req.body;

    // Get plan details to get price
    const plansResponse = await axios.get(
      `${VTPASS_BASE_URL}/service-variations?serviceID=${network}`,
      {
        headers: {
          'api-key': VTPASS_API_KEY
        }
      }
    );

    const plan = plansResponse.data.content.variations.find(p => p.variation_code === planCode);
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan code'
      });
    }

    const amount = parseFloat(plan.variation_amount);

    // Check wallet balance
    const { Wallet } = require('../models');
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet || wallet.naira.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    const reference = `DAT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create transaction
    const transaction = await Transaction.create({
      reference,
      user: req.user._id,
      type: 'data',
      category: 'utility',
      amount,
      currency: 'NGN',
      direction: 'debit',
      status: 'pending',
      description: `Data bundle for ${phoneNumber}`
    });

    // Process via VTPass
    const response = await axios.post(
      `${VTPASS_BASE_URL}/pay`,
      {
        request_id: reference,
        serviceID: network,
        variation_code: planCode,
        phone: phoneNumber
      },
      {
        headers: {
          'api-key': VTPASS_API_KEY,
          'secret-key': VTPASS_SECRET_KEY
        }
      }
    );

    if (response.data.code === '000') {
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      await transaction.save();

      wallet.naira.balance -= amount;
      await wallet.save();

      res.json({
        success: true,
        message: 'Data bundle purchased successfully',
        transaction: {
          id: transaction._id,
          reference: transaction.reference,
          amount: transaction.amount,
          plan: plan.name
        }
      });
    } else {
      transaction.status = 'failed';
      await transaction.save();

      res.status(400).json({
        success: false,
        message: response.data.response_description || 'Purchase failed'
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
