const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const axios = require('axios');

const { User, Wallet, Transaction } = require('../models');
const { auth } = require('../middleware/auth');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

// Paystack configuration
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// @route   GET /api/v1/wallet/balance
// @desc    Get wallet balance
// @access  Private
router.get('/balance', auth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    res.json({
      success: true,
      balance: {
        naira: wallet.naira,
        crypto: wallet.crypto
      }
    });
  } catch (error) {
    logger.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get balance'
    });
  }
});

// @route   GET /api/v1/wallet/transactions
// @desc    Get transaction history
// @access  Private
router.get('/transactions', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, startDate, endDate } = req.query;
    
    const query = { user: req.user._id };
    
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transactions'
    });
  }
});

// @route   POST /api/v1/wallet/fund
// @desc    Fund wallet
// @access  Private
router.post('/fund', auth, [
  body('amount').isFloat({ min: 100 }).withMessage('Minimum amount is ₦100'),
  body('method').isIn(['card', 'bank_transfer', 'ussd']).withMessage('Invalid payment method')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { amount, method, cardId } = req.body;

    // Generate transaction reference
    const reference = `FND-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create pending transaction
    const transaction = await Transaction.create({
      reference,
      user: req.user._id,
      type: 'deposit',
      category: 'wallet',
      amount,
      currency: 'NGN',
      direction: 'credit',
      status: 'pending',
      paymentMethod: method,
      description: `Wallet funding via ${method}`
    });

    // Initialize Paystack payment
    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: req.user.email,
        amount: amount * 100, // Convert to kobo
        reference,
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        metadata: {
          transactionId: transaction._id.toString(),
          userId: req.user._id.toString(),
          type: 'wallet_funding'
        },
        ...(cardId && { authorization_code: cardId })
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (paystackResponse.data.status) {
      res.json({
        success: true,
        message: 'Payment initialized',
        transaction: {
          id: transaction._id,
          reference: transaction.reference,
          amount: transaction.amount
        },
        payment: {
          authorization_url: paystackResponse.data.data.authorization_url,
          access_code: paystackResponse.data.data.access_code,
          reference: paystackResponse.data.data.reference
        }
      });
    } else {
      await transaction.deleteOne();
      res.status(400).json({
        success: false,
        message: 'Payment initialization failed'
      });
    }
  } catch (error) {
    logger.error('Fund wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment'
    });
  }
});

// @route   POST /api/v1/wallet/transfer
// @desc    Transfer money to another user
// @access  Private
router.post('/transfer', auth, [
  body('recipient').notEmpty().withMessage('Recipient is required'),
  body('amount').isFloat({ min: 100 }).withMessage('Minimum transfer is ₦100'),
  body('narration').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { recipient, amount, narration } = req.body;

    // Find sender's wallet
    const senderWallet = await Wallet.findOne({ user: req.user._id });
    if (!senderWallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Check balance
    if (senderWallet.naira.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Find recipient (by email, phone, or account number)
    let recipientUser;
    if (recipient.includes('@')) {
      recipientUser = await User.findOne({ email: recipient });
    } else if (recipient.startsWith('+') || /^\d{11}$/.test(recipient)) {
      recipientUser = await User.findOne({ phone: recipient });
    } else {
      // Check virtual account
      const recipientWallet = await Wallet.findOne({ 'virtualAccount.accountNumber': recipient });
      if (recipientWallet) {
        recipientUser = await User.findById(recipientWallet.user);
      }
    }

    if (!recipientUser) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    if (recipientUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer to yourself'
      });
    }

    // Find recipient's wallet
    const recipientWallet = await Wallet.findOne({ user: recipientUser._id });
    if (!recipientWallet) {
      return res.status(404).json({
        success: false,
        message: 'Recipient wallet not found'
      });
    }

    // Generate references
    const senderReference = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const recipientReference = `RCV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create transactions
    const senderTransaction = await Transaction.create({
      reference: senderReference,
      user: req.user._id,
      type: 'transfer',
      category: 'wallet',
      amount,
      currency: 'NGN',
      direction: 'debit',
      status: 'completed',
      counterparty: {
        user: recipientUser._id,
        name: recipientUser.fullName,
        email: recipientUser.email
      },
      description: narration || `Transfer to ${recipientUser.fullName}`
    });

    const recipientTransaction = await Transaction.create({
      reference: recipientReference,
      user: recipientUser._id,
      type: 'transfer',
      category: 'wallet',
      amount,
      currency: 'NGN',
      direction: 'credit',
      status: 'completed',
      counterparty: {
        user: req.user._id,
        name: req.user.fullName,
        email: req.user.email
      },
      description: narration || `Transfer from ${req.user.fullName}`
    });

    // Update wallets
    senderWallet.naira.balance -= amount;
    await senderWallet.save();

    recipientWallet.naira.balance += amount;
    await recipientWallet.save();

    // Send notifications
    await createNotification({
      user: req.user._id,
      type: 'transaction',
      title: 'Transfer Successful',
      message: `You sent ₦${amount.toLocaleString()} to ${recipientUser.fullName}`,
      relatedTo: { model: 'Transaction', id: senderTransaction._id }
    });

    await createNotification({
      user: recipientUser._id,
      type: 'transaction',
      title: 'Money Received',
      message: `You received ₦${amount.toLocaleString()} from ${req.user.fullName}`,
      relatedTo: { model: 'Transaction', id: recipientTransaction._id }
    });

    res.json({
      success: true,
      message: 'Transfer successful',
      transaction: {
        id: senderTransaction._id,
        reference: senderTransaction.reference,
        amount: senderTransaction.amount,
        recipient: recipientUser.fullName
      }
    });
  } catch (error) {
    logger.error('Transfer error:', error);
    res.status(500).json({
      success: false,
      message: 'Transfer failed'
    });
  }
});

// @route   POST /api/v1/wallet/withdraw
// @desc    Withdraw to bank account
// @access  Private
router.post('/withdraw', auth, [
  body('amount').isFloat({ min: 500 }).withMessage('Minimum withdrawal is ₦500'),
  body('bankCode').notEmpty(),
  body('accountNumber').isLength({ min: 10, max: 10 }),
  body('accountName').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { amount, bankCode, accountNumber, accountName } = req.body;

    // Check wallet balance
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet || wallet.naira.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Generate reference
    const reference = `WTH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create pending transaction
    const transaction = await Transaction.create({
      reference,
      user: req.user._id,
      type: 'withdrawal',
      category: 'wallet',
      amount,
      currency: 'NGN',
      direction: 'debit',
      status: 'pending',
      counterparty: {
        name: accountName,
        accountNumber,
        bankName: bankCode // Will be resolved to bank name
      },
      description: `Withdrawal to ${accountName}`
    });

    // Initiate transfer via Paystack
    const transferResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transfer`,
      {
        source: 'balance',
        amount: amount * 100,
        reference,
        recipient: {
          type: 'nuban',
          name: accountName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN'
        },
        reason: 'Wallet withdrawal'
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (transferResponse.data.status) {
      // Update transaction with provider reference
      transaction.provider = {
        name: 'paystack',
        reference: transferResponse.data.data.transfer_code
      };
      await transaction.save();

      // Deduct from wallet
      wallet.naira.balance -= amount;
      await wallet.save();

      res.json({
        success: true,
        message: 'Withdrawal initiated',
        transaction: {
          id: transaction._id,
          reference: transaction.reference,
          amount: transaction.amount,
          status: 'pending'
        }
      });
    } else {
      await transaction.deleteOne();
      res.status(400).json({
        success: false,
        message: 'Withdrawal failed'
      });
    }
  } catch (error) {
    logger.error('Withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Withdrawal failed'
    });
  }
});

// @route   GET /api/v1/wallet/banks
// @desc    Get list of banks
// @access  Private
router.get('/banks', auth, async (req, res) => {
  try {
    const response = await axios.get(`${PAYSTACK_BASE_URL}/bank`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`
      }
    });

    if (response.data.status) {
      res.json({
        success: true,
        banks: response.data.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to fetch banks'
      });
    }
  } catch (error) {
    logger.error('Get banks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banks'
    });
  }
});

// @route   POST /api/v1/wallet/verify-account
// @desc    Verify bank account
// @access  Private
router.post('/verify-account', auth, [
  body('bankCode').notEmpty(),
  body('accountNumber').isLength({ min: 10, max: 10 })
], async (req, res) => {
  try {
    const { bankCode, accountNumber } = req.body;

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`
        }
      }
    );

    if (response.data.status) {
      res.json({
        success: true,
        account: {
          number: response.data.data.account_number,
          name: response.data.data.account_name
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Account verification failed'
      });
    }
  } catch (error) {
    logger.error('Verify account error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid account details'
    });
  }
});

// @route   GET /api/v1/wallet/cards
// @desc    Get saved cards
// @access  Private
router.get('/cards', auth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id }).select('cards');
    
    res.json({
      success: true,
      cards: wallet?.cards || []
    });
  } catch (error) {
    logger.error('Get cards error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cards'
    });
  }
});

// @route   DELETE /api/v1/wallet/cards/:cardId
// @desc    Delete saved card
// @access  Private
router.delete('/cards/:cardId', auth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    
    wallet.cards = wallet.cards.filter(card => card._id.toString() !== req.params.cardId);
    await wallet.save();

    res.json({
      success: true,
      message: 'Card removed successfully'
    });
  } catch (error) {
    logger.error('Delete card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove card'
    });
  }
});

module.exports = router;
