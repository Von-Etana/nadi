const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const supabase = require('../utils/supabase');
const { auth } = require('../middleware/auth');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

// Flutterwave config
const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_BASE_URL = 'https://api.flutterwave.com/v3';

// Bank list in-memory cache (24 hours expiration)
let cachedBanks = null;
let banksCacheExpiry = 0;

// @route   GET /api/v1/wallet/balance
// @desc    Get wallet balance
// @access  Private
router.get('/balance', auth, async (req, res) => {
  try {
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    res.json({
      success: true,
      balance: {
        naira: {
          balance: parseFloat(wallet.naira_balance),
          ledgerBalance: parseFloat(wallet.naira_ledger_balance)
        },
        crypto: wallet.crypto_balances || []
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
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id);

    if (type) {
      query = query.eq('type', type);
    }
    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString());
    }

    const startIdx = (parsedPage - 1) * parsedLimit;
    const endIdx = startIdx + parsedLimit - 1;

    const { data: transactions, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(startIdx, endIdx);

    if (error) throw error;

    res.json({
      success: true,
      transactions,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
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
// @desc    Fund wallet (Initialize payment)
// @access  Private
router.post('/fund', auth, [
  body('amount').isFloat({ min: 100 }).withMessage('Minimum amount is ₦100'),
  body('method').isIn(['card', 'bank_transfer', 'ussd']).withMessage('Invalid payment method'),
  body('provider').optional().isIn(['paystack', 'flutterwave']).withMessage('Invalid provider')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { amount, method, cardId, provider } = req.body;
    const reference = `FND-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create pending transaction in Supabase
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        reference,
        user_id: req.user.id,
        type: 'deposit',
        category: 'wallet',
        amount,
        currency: 'NGN',
        net_amount: amount,
        status: 'pending',
        direction: 'credit',
        payment_method: method,
        description: `Wallet funding via ${method}`
      })
      .select()
      .single();

    if (txError || !transaction) {
      logger.error('Create deposit transaction DB error:', txError);
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize transaction'
      });
    }

    // If using Flutterwave, return details immediately for inline checkout
    if (provider === 'flutterwave') {
      return res.json({
        success: true,
        message: 'Flutterwave payment initialized',
        transaction: {
          id: transaction.id,
          reference: transaction.reference,
          amount: transaction.amount
        },
        payment: {
          provider: 'flutterwave',
          reference: transaction.reference
        }
      });
    }

    // Initialize Paystack payment (default / fallback)
    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: req.user.email,
        amount: amount * 100, // kobo
        reference,
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/callback`,
        metadata: {
          transactionId: transaction.id,
          userId: req.user.id,
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
          id: transaction.id,
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
      // Delete pending transaction if initialization failed
      await supabase.from('transactions').delete().eq('id', transaction.id);
      res.status(400).json({
        success: false,
        message: 'Payment initialization failed'
      });
    }
  } catch (error) {
    logger.error('Fund wallet error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment'
    });
  }
});

// @route   POST /api/v1/wallet/transfer
// @desc    Transfer money to another user (Atomic procedure call)
// @access  Private
router.post('/transfer', auth, [
  body('recipient').notEmpty().withMessage('Recipient is required'),
  body('amount').isFloat({ min: 100 }).withMessage('Minimum transfer is ₦100'),
  body('transactionPin').notEmpty().withMessage('Transaction PIN is required'),
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

    const { recipient, amount, transactionPin, narration } = req.body;

    // Verify transaction PIN (bcrypt stored in users table)
    const { data: userProfile, error: profileErr } = await supabase
      .from('users')
      .select('transaction_pin, first_name, last_name')
      .eq('id', req.user.id)
      .single();

    if (profileErr || !userProfile || !userProfile.transaction_pin) {
      return res.status(400).json({
        success: false,
        message: 'Please set up a transaction PIN in settings before making transfers'
      });
    }

    const isPinValid = await bcrypt.compare(transactionPin, userProfile.transaction_pin);
    if (!isPinValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid transaction PIN'
      });
    }

    // Find sender's wallet
    const { data: senderWallet, error: walletErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (walletErr || !senderWallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Check balance
    if (parseFloat(senderWallet.naira_balance) < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }



    // Find recipient (by email, phone, or virtual account number)
    let recipientUser = null;
    if (recipient.includes('@')) {
      const { data } = await supabase.from('users').select('id, first_name, last_name, email').eq('email', recipient.trim().toLowerCase()).maybeSingle();
      recipientUser = data;
    } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
      const cleanPhone = recipient.trim();
      const { data } = await supabase.from('users').select('id, first_name, last_name, email').eq('phone', cleanPhone).maybeSingle();
      recipientUser = data;
    } else {
      // JSONB query matching virtual account number
      const { data: recipientWallet } = await supabase
        .from('wallets')
        .select('user_id')
        .eq('virtual_account->>accountNumber', recipient.trim())
        .maybeSingle();

      if (recipientWallet) {
        const { data } = await supabase.from('users').select('id, first_name, last_name, email').eq('id', recipientWallet.user_id).single();
        recipientUser = data;
      }
    }

    if (!recipientUser) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    if (recipientUser.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer to yourself'
      });
    }

    // Generate references
    const senderReference = `TRF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const recipientReference = `RCV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute ATOMIC Postgres transfer function
    const { data: txResult, error: execError } = await supabase.rpc('execute_wallet_transfer', {
      p_sender_id: req.user.id,
      p_recipient_id: recipientUser.id,
      p_amount: amount,
      p_sender_ref: senderReference,
      p_recipient_ref: recipientReference,
      p_narration: narration || `Transfer to ${recipientUser.first_name} ${recipientUser.last_name}`
    });

    if (execError || !txResult?.success) {
      logger.error('Wallet transfer execution error:', execError);
      return res.status(400).json({
        success: false,
        message: execError ? execError.message : 'Transfer failed'
      });
    }



    const recipientName = `${recipientUser.first_name} ${recipientUser.last_name}`;
    const senderName = `${userProfile.first_name} ${userProfile.last_name}`;

    // Send notifications
    await createNotification({
      user_id: req.user.id,
      type: 'transaction',
      title: 'Transfer Successful',
      message: `You sent ₦${amount.toLocaleString()} to ${recipientName}`,
      related_to: { table: 'transactions', id: txResult.sender_tx_id }
    }).catch(err => logger.error('Failed to notify sender:', err));

    await createNotification({
      user_id: recipientUser.id,
      type: 'transaction',
      title: 'Money Received',
      message: `You received ₦${amount.toLocaleString()} from ${senderName}`,
      related_to: { table: 'transactions', id: txResult.recipient_tx_id }
    }).catch(err => logger.error('Failed to notify recipient:', err));

    res.json({
      success: true,
      message: 'Transfer successful',
      transaction: {
        id: txResult.sender_tx_id,
        reference: senderReference,
        amount,
        recipient: recipientName
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
// @desc    Withdraw money to bank account (Atomic debit, Paystack integration, and safety rollback)
// @access  Private
router.post('/withdraw', auth, [
  body('amount').isFloat({ min: 500 }).withMessage('Minimum withdrawal is ₦500'),
  body('bankCode').notEmpty(),
  body('accountNumber').isLength({ min: 10, max: 10 }),
  body('accountName').notEmpty(),
  body('transactionPin').notEmpty().withMessage('Transaction PIN is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { amount, bankCode, accountNumber, accountName, transactionPin } = req.body;

    // Verify PIN
    const { data: userProfile, error: profileErr } = await supabase
      .from('users')
      .select('transaction_pin')
      .eq('id', req.user.id)
      .single();

    if (profileErr || !userProfile || !userProfile.transaction_pin) {
      return res.status(400).json({
        success: false,
        message: 'Please set up a transaction PIN first'
      });
    }

    const isPinValid = await bcrypt.compare(transactionPin, userProfile.transaction_pin);
    if (!isPinValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid transaction PIN'
      });
    }

    const reference = `WTH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute atomic DB withdrawal initialization (covers balance check, locked FOR UPDATE and limits validations)
    const { data: txResult, error: dbErr } = await supabase.rpc('execute_wallet_withdrawal', {
      p_user_id: req.user.id,
      p_amount: amount,
      p_ref: reference,
      p_account_name: accountName,
      p_account_number: accountNumber,
      p_bank_code: bankCode
    });

    if (dbErr || !txResult?.success) {
      logger.error('DB withdrawal init failed:', dbErr);
      return res.status(400).json({
        success: false,
        message: dbErr ? dbErr.message : 'Withdrawal failed'
      });
    }

    const txId = txResult.tx_id;

    try {
      // Trigger Flutterwave transfer API
      const transferResponse = await axios.post(
        `${FLUTTERWAVE_BASE_URL}/transfers`,
        {
          account_bank: bankCode,
          account_number: accountNumber,
          amount: amount,
          narration: 'Nadi Wallet withdrawal',
          currency: 'NGN',
          reference: reference,
          debit_currency: 'NGN'
        },
        {
          headers: {
            Authorization: `Bearer ${FLUTTERWAVE_SECRET}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000 // 15 seconds timeout
        }
      );

      if (transferResponse.data.status === 'success') {
        // Update transaction provider details
        await supabase
          .from('transactions')
          .update({
            provider: {
              name: 'flutterwave',
              reference: String(transferResponse.data.data.id)
            }
          })
          .eq('id', txId);

        res.json({
          success: true,
          message: 'Withdrawal initiated',
          transaction: {
            id: txId,
            reference,
            amount,
            status: 'pending'
          }
        });
      } else {
        throw new Error('Flutterwave returned failure status');
      }
    } catch (flwError) {
      logger.error('Flutterwave transfer error:', flwError.response?.data || flwError.message);

      // Check if we received a response from Flutterwave
      const hasResponse = !!flwError.response;
      const flwStatus = flwError.response?.status;
      const errorMessage = flwError.response?.data?.message || flwError.message || 'Payment gateway failed';

      // If it's an explicit client validation error, we can safely refund immediately
      if (hasResponse && flwStatus >= 400 && flwStatus < 500) {
        logger.info(`Refunding withdrawal ${txId} due to explicit Flutterwave rejection (${flwStatus})`);
        
        await supabase.rpc('refund_wallet_withdrawal', {
          p_tx_id: txId,
          p_user_id: req.user.id,
          p_amount: amount,
          p_reason: errorMessage
        });

        return res.status(400).json({
          success: false,
          message: `Withdrawal failed: ${errorMessage}. Balance refunded.`
        });
      }

      // If there was no response (timeout) or server error, transaction state is uncertain.
      // Do NOT refund immediately. Keep it pending so that the webhook or verification script resolves it.
      logger.warn(`Keep withdrawal ${txId} in pending status due to uncertain transaction state (status: ${flwStatus || 'timeout'})`);

      res.json({
        success: true,
        message: 'Withdrawal is processing. We are verifying the transaction status with the bank.',
        transaction: {
          id: txId,
          reference,
          amount,
          status: 'pending'
        }
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
// @desc    Get list of banks (cached for 24h)
// @access  Private
router.get('/banks', auth, async (req, res) => {
  try {
    if (cachedBanks && Date.now() < banksCacheExpiry) {
      return res.json({
        success: true,
        banks: cachedBanks
      });
    }

    const response = await axios.get(`${FLUTTERWAVE_BASE_URL}/banks/NGN`, {
      headers: {
        Authorization: `Bearer ${FLUTTERWAVE_SECRET}`
      }
    });

    if (response.data.status === 'success') {
      const banks = response.data.data.map(b => ({
        id: b.id,
        name: b.name,
        code: b.code
      }));

      cachedBanks = banks;
      banksCacheExpiry = Date.now() + 24 * 60 * 60 * 1000;

      res.json({
        success: true,
        banks
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to fetch banks'
      });
    }
  } catch (error) {
    logger.error('Get banks error:', error.response?.data || error.message);
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

    const response = await axios.post(
      `${FLUTTERWAVE_BASE_URL}/accounts/resolve`,
      {
        account_number: accountNumber,
        account_bank: bankCode
      },
      {
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === 'success') {
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
    logger.error('Verify account error:', error.response?.data || error.message);
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
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('cards')
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;

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
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('id, cards')
      .eq('user_id', req.user.id)
      .single();

    if (error || !wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    const updatedCards = (wallet.cards || []).filter(
      card => (card.id || card._id || '').toString() !== req.params.cardId
    );

    await supabase
      .from('wallets')
      .update({ cards: updatedCards })
      .eq('id', wallet.id);

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
