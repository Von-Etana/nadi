const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');
const supabase = require('../utils/supabase');
const quidaxService = require('../services/quidax');

// Price cache (60 seconds expiration)
let priceCache = null;
let priceCacheExpiry = 0;

// @route   GET /api/v1/crypto/assets
// @desc    Get supported crypto assets and current balances
// @access  Private
router.get('/assets', auth, async (req, res) => {
  try {
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('crypto_balances')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    const dbBalances = wallet?.crypto_balances || [];
    
    // Supported Nadi assets
    const supportedAssets = [
      { symbol: 'btc', name: 'Bitcoin', icon: '₿', decimals: 8 },
      { symbol: 'eth', name: 'Ethereum', icon: 'Ξ', decimals: 18 },
      { symbol: 'usdt', name: 'Tether', icon: '₮', decimals: 6 },
    ];

    // Merge database balances into assets
    const assets = supportedAssets.map(asset => {
      const matching = dbBalances.find(b => b.symbol.toLowerCase() === asset.symbol.toLowerCase());
      return {
        ...asset,
        balance: matching ? parseFloat(matching.balance) : 0.00
      };
    });

    res.json({ success: true, assets });
  } catch (error) {
    logger.error('Get assets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assets' });
  }
});

// @route   GET /api/v1/crypto/prices
// @desc    Get crypto prices (NGN) with caching
// @access  Private
router.get('/prices', auth, async (req, res) => {
  try {
    if (!priceCache || Date.now() > priceCacheExpiry) {
      const rates = await quidaxService.getLiveRates();
      priceCache = {
        BTC: { ngn: rates.btc, usd: rates.btc / 1500, change24h: 2.4 },
        ETH: { ngn: rates.eth, usd: rates.eth / 1500, change24h: -1.2 },
        USDT: { ngn: rates.usdt, usd: rates.usdt / 1500, change24h: 0.0 }
      };
      priceCacheExpiry = Date.now() + 60 * 1000;
    }

    res.json({ 
      success: true, 
      prices: priceCache, 
      changes: { btc: 2.4, eth: -1.2, usdt: 0.0 },
      lastUpdated: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Get prices error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch prices' });
  }
});

// @route   GET /api/v1/crypto/wallet/:asset
// @desc    Get crypto wallet address for deposit (generates Quidax subuser if needed)
// @access  Private
router.get('/wallet/:asset', auth, async (req, res) => {
  try {
    const { asset } = req.params;
    const symbol = asset.toLowerCase();
    
    if (!['btc', 'eth', 'usdt'].includes(symbol)) {
      return res.status(400).json({ success: false, message: 'Unsupported cryptocurrency' });
    }

    // 1. Fetch or create the user's Quidax sub-user ID
    const quidaxUserId = await quidaxService.getOrCreateSubuser(
      req.user.id,
      req.user.email,
      req.user.first_name,
      req.user.last_name
    );

    // 2. Fetch/generate deposit address from Quidax
    const address = await quidaxService.getDepositAddress(quidaxUserId, symbol);

    res.json({
      success: true,
      address: address
    });
  } catch (error) {
    logger.error('Get wallet address error:', error);
    res.status(500).json({ success: false, message: 'Failed to get wallet address' });
  }
});

// @route   POST /api/v1/crypto/buy
// @desc    Buy crypto (Naira to Crypto conversion)
// @access  Private
router.post('/buy', auth, [
  body('crypto').isIn(['btc', 'eth', 'usdt']).withMessage('Unsupported cryptocurrency'),
  body('amount').isFloat({ min: 100 }).withMessage('Minimum purchase amount is ₦100'),
  body('paymentMethod').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { crypto, amount } = req.body; // amount is in NGN Naira
    const symbol = crypto.toLowerCase();

    // 1. Fetch current price to calculate coin quantity
    const rates = await quidaxService.getLiveRates();
    const price = rates[symbol];
    if (!price || price <= 0) {
      return res.status(400).json({ success: false, message: 'Failed to retrieve market conversion price' });
    }

    const cryptoQty = amount / price;
    const reference = `CRY-BUY-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 2. Call atomic DB stored procedure
    const { data: txResult, error: dbError } = await supabase.rpc('execute_crypto_purchase', {
      p_user_id: req.user.id,
      p_symbol: symbol,
      p_amount_naira: amount,
      p_crypto_qty: cryptoQty,
      p_ref: reference
    });

    if (dbError || !txResult?.success) {
      logger.error('Crypto purchase database error:', dbError);
      return res.status(400).json({
        success: false,
        message: dbError ? dbError.message : 'Purchase failed'
      });
    }

    res.json({
      success: true,
      message: 'Purchase completed successfully',
      transaction: {
        id: txResult.tx_id,
        reference,
        amount,
        cryptoQty,
        cryptoSymbol: symbol.toUpperCase()
      }
    });
  } catch (error) {
    logger.error('Buy crypto error:', error);
    res.status(500).json({ success: false, message: 'Purchase failed' });
  }
});

// @route   POST /api/v1/crypto/sell
// @desc    Sell crypto (Crypto to Naira conversion)
// @access  Private
router.post('/sell', auth, [
  body('crypto').isIn(['btc', 'eth', 'usdt']).withMessage('Unsupported cryptocurrency'),
  body('amount').isFloat({ min: 0.000001 }).withMessage('Invalid crypto quantity'),
  body('destination').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { crypto, amount } = req.body; // amount is in Crypto coin quantity
    const symbol = crypto.toLowerCase();

    // 1. Fetch current price to calculate Naira payout
    const rates = await quidaxService.getLiveRates();
    const price = rates[symbol];
    if (!price || price <= 0) {
      return res.status(400).json({ success: false, message: 'Failed to retrieve market conversion price' });
    }

    const nairaCredit = amount * price;
    const reference = `CRY-SEL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 2. Call atomic DB stored procedure
    const { data: txResult, error: dbError } = await supabase.rpc('execute_crypto_sale', {
      p_user_id: req.user.id,
      p_symbol: symbol,
      p_crypto_qty: amount,
      p_naira_credit: nairaCredit,
      p_ref: reference
    });

    if (dbError || !txResult?.success) {
      logger.error('Crypto sale database error:', dbError);
      return res.status(400).json({
        success: false,
        message: dbError ? dbError.message : 'Sale failed'
      });
    }

    res.json({
      success: true,
      message: 'Crypto sold successfully',
      transaction: {
        id: txResult.tx_id,
        reference,
        amount: nairaCredit,
        cryptoQty: amount,
        cryptoSymbol: symbol.toUpperCase()
      }
    });
  } catch (error) {
    logger.error('Sell crypto error:', error);
    res.status(500).json({ success: false, message: 'Sale failed' });
  }
});

// @route   POST /api/v1/crypto/swap
// @desc    Swap crypto (Crypto A to Crypto B)
// @access  Private
router.post('/swap', auth, [
  body('fromCrypto').isIn(['btc', 'eth', 'usdt']).withMessage('Unsupported from cryptocurrency'),
  body('toCrypto').isIn(['btc', 'eth', 'usdt']).withMessage('Unsupported to cryptocurrency'),
  body('amount').isFloat({ min: 0.000001 }).withMessage('Invalid swap quantity')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { fromCrypto, toCrypto, amount } = req.body;
    const fromSymbol = fromCrypto.toLowerCase();
    const toSymbol = toCrypto.toLowerCase();

    if (fromSymbol === toSymbol) {
      return res.status(400).json({ success: false, message: 'Cannot swap identical assets' });
    }

    // 1. Fetch live rates to compute exchange multiplier
    const rates = await quidaxService.getLiveRates();
    const fromPrice = rates[fromSymbol];
    const toPrice = rates[toSymbol];

    if (!fromPrice || !toPrice) {
      return res.status(400).json({ success: false, message: 'Failed to retrieve conversion rates' });
    }

    const toQty = amount * (fromPrice / toPrice);
    const reference = `CRY-SWP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 2. Call atomic DB stored procedure
    const { data: txResult, error: dbError } = await supabase.rpc('execute_crypto_swap', {
      p_user_id: req.user.id,
      p_from_symbol: fromSymbol,
      p_to_symbol: toSymbol,
      p_from_qty: amount,
      p_to_qty: toQty,
      p_ref: reference
    });

    if (dbError || !txResult?.success) {
      logger.error('Crypto swap database error:', dbError);
      return res.status(400).json({
        success: false,
        message: dbError ? dbError.message : 'Swap failed'
      });
    }

    res.json({
      success: true,
      message: 'Swap completed successfully',
      transaction: {
        id: txResult.tx_id,
        reference,
        fromCrypto: fromSymbol.toUpperCase(),
        toCrypto: toSymbol.toUpperCase(),
        fromQty: amount,
        toQty
      }
    });
  } catch (error) {
    logger.error('Swap crypto error:', error);
    res.status(500).json({ success: false, message: 'Swap failed' });
  }
});

// @route   POST /api/v1/crypto/withdraw
// @desc    Withdraw crypto to external wallet
// @access  Private
router.post('/withdraw', auth, [
  body('crypto').isIn(['btc', 'eth', 'usdt']).withMessage('Unsupported cryptocurrency'),
  body('amount').isFloat({ min: 0.00001 }).withMessage('Invalid amount'),
  body('address').notEmpty().withMessage('Recipient address is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { crypto, amount, address } = req.body;
    const symbol = crypto.toLowerCase();
    const reference = `CRY-WTH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 1. Execute DB transaction atomically (checks balance and debits)
    const { data: txResult, error: dbErr } = await supabase.rpc('execute_crypto_withdrawal', {
      p_user_id: req.user.id,
      p_symbol: symbol,
      p_amount: amount,
      p_ref: reference,
      p_address: address
    });

    if (dbErr || !txResult?.success) {
      logger.error('Crypto withdrawal DB init failed:', dbErr);
      return res.status(400).json({
        success: false,
        message: dbErr ? dbErr.message : 'Withdrawal failed'
      });
    }

    const txId = txResult.tx_id;

    try {
      // 2. Fetch sub-user ID
      const quidaxUserId = await quidaxService.getOrCreateSubuser(
        req.user.id,
        req.user.email,
        req.user.first_name,
        req.user.last_name
      );

      // 3. Trigger Quidax API withdrawal
      const quidaxResponse = await quidaxService.createWithdrawal(
        quidaxUserId,
        symbol,
        amount,
        address
      );

      if (quidaxResponse.status === 'success') {
        // Update transaction reference from Quidax
        await supabase
          .from('transactions')
          .update({
            provider: {
              name: 'quidax',
              reference: String(quidaxResponse.data.id)
            }
          })
          .eq('id', txId);

        res.json({
          success: true,
          message: 'Crypto withdrawal initiated',
          transaction: {
            id: txId,
            reference,
            amount,
            status: 'pending'
          }
        });
      } else {
        throw new Error('Quidax returned failure status');
      }
    } catch (quidaxError) {
      logger.error('Quidax payout error, triggering refund:', quidaxError.response?.data || quidaxError.message);

      // Check if it was an explicit client/validation rejection from Quidax
      const hasResponse = !!quidaxError.response;
      const flwStatus = quidaxError.response?.status;
      const errMsg = quidaxError.response?.data?.message || quidaxError.message || 'Payment gateway failed';

      if (hasResponse && flwStatus >= 400 && flwStatus < 500) {
        logger.info(`Refunding crypto withdrawal ${txId} due to explicit rejection (${flwStatus})`);
        
        await supabase.rpc('refund_crypto_withdrawal', {
          p_tx_id: txId,
          p_user_id: req.user.id,
          p_symbol: symbol,
          p_amount: amount,
          p_reason: errMsg
        });

        return res.status(400).json({
          success: false,
          message: `Withdrawal failed: ${errMsg}. Crypto refunded.`
        });
      }

      // Keep it pending if it is a network timeout or unknown 5xx server state
      logger.warn(`Keep crypto withdrawal ${txId} in pending status due to uncertain network state`);
      
      res.json({
        success: true,
        message: 'Crypto withdrawal is processing. We are verifying the transaction state on the blockchain.',
        transaction: {
          id: txId,
          reference,
          amount,
          status: 'pending'
        }
      });
    }
  } catch (error) {
    logger.error('Crypto withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Withdrawal failed' });
  }
});

// @route   GET /api/v1/crypto/transactions
// @desc    Get user's crypto transactions
// @access  Private
router.get('/transactions', auth, async (req, res) => {
  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('category', 'crypto')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, transactions });
  } catch (error) {
    logger.error('Get crypto transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

module.exports = router;
