const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');
const supabase = require('../utils/supabase');

// @route   GET /api/v1/giftcards/available
// @desc    Get available gift cards
// @access  Private
router.get('/available', auth, async (req, res) => {
  try {
    const cards = [
      { id: 'amazon', name: 'Amazon', currencies: ['USD', 'GBP', 'EUR'], minValue: 10, maxValue: 500 },
      { id: 'itunes', name: 'iTunes/Apple', currencies: ['USD', 'GBP'], minValue: 10, maxValue: 200 },
      { id: 'google-play', name: 'Google Play', currencies: ['USD'], minValue: 10, maxValue: 200 },
      { id: 'steam', name: 'Steam', currencies: ['USD'], minValue: 10, maxValue: 100 },
      { id: 'xbox', name: 'Xbox', currencies: ['USD'], minValue: 10, maxValue: 100 },
      { id: 'playstation', name: 'PlayStation', currencies: ['USD'], minValue: 10, maxValue: 100 },
      { id: 'netflix', name: 'Netflix', currencies: ['USD'], minValue: 15, maxValue: 100 },
      { id: 'spotify', name: 'Spotify', currencies: ['USD'], minValue: 10, maxValue: 60 },
    ];

    res.json({ success: true, cards });
  } catch (error) {
    logger.error('Get available cards error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch gift cards' });
  }
});

// @route   GET /api/v1/giftcards/rates
// @desc    Get gift card exchange rates
// @access  Private
router.get('/rates', auth, async (req, res) => {
  try {
    const rates = {
      amazon: { USD: 850, GBP: 950, EUR: 890 },
      apple: { USD: 880, GBP: 980 },
      itunes: { USD: 880, GBP: 980 },
      'google-play': { USD: 820 },
      steam: { USD: 800 },
      netflix: { USD: 900 },
      spotify: { USD: 870 },
      xbox: { USD: 810 },
      playstation: { USD: 830 }
    };

    res.json({ success: true, rates });
  } catch (error) {
    logger.error('Get rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rates' });
  }
});

// @route   POST /api/v1/giftcards/buy
// @desc    Buy a gift card
// @access  Private
router.post('/buy', auth, [
  body('cardType').notEmpty().withMessage('Card type is required'),
  body('amount').isFloat({ min: 10 }).withMessage('Minimum amount is $10'),
  body('currency').notEmpty().withMessage('Currency is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { cardType, amount, currency } = req.body;
    
    // Resolve rate
    const rates = {
      amazon: { USD: 850, GBP: 950, EUR: 890 },
      apple: { USD: 880, GBP: 980 },
      itunes: { USD: 880, GBP: 980 },
      'google-play': { USD: 820 },
      steam: { USD: 800 },
      netflix: { USD: 900 },
      spotify: { USD: 870 },
      xbox: { USD: 810 },
      playstation: { USD: 830 }
    };

    const typeKey = cardType.toLowerCase();
    const rate = rates[typeKey]?.[currency.toUpperCase()] || 750;
    const costNaira = amount * rate;

    const reference = `GFT-BUY-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 1. Debit Naira Wallet
    const { data: debitResult, error: debitError } = await supabase.rpc('execute_wallet_debit', {
      p_user_id: req.user.id,
      p_amount: costNaira,
      p_ref: reference,
      p_type: 'giftcard_purchase',
      p_category: 'giftcard',
      p_description: `Purchased ${currency.toUpperCase()} ${amount} ${cardType.toUpperCase()} Gift Card`,
      p_details: { cardType, amount, currency }
    });

    if (debitError || !debitResult?.success) {
      logger.error('Giftcard buy wallet debit failed:', debitError);
      return res.status(400).json({
        success: false,
        message: debitError ? debitError.message : 'Debit failed. Check your wallet balance.'
      });
    }

    const txId = debitResult.tx_id;
    const mockCode = `NADI-${cardType.substring(0, 4).toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const mockPin = Math.floor(1000 + Math.random() * 9000).toString();

    try {
      // 2. Insert card into user_giftcards
      const { data: userCard, error: insertError } = await supabase
        .from('user_giftcards')
        .insert({
          user_id: req.user.id,
          transaction_id: txId,
          type: 'buy',
          card_type: cardType,
          card_value: amount,
          card_currency: currency,
          card_code: mockCode,
          card_pin: mockPin,
          rate: rate,
          payout_amount: costNaira,
          payout_currency: 'NGN',
          status: 'completed'
        })
        .select()
        .single();

      if (insertError || !userCard) {
        throw insertError || new Error('Failed to insert giftcard record');
      }

      // 3. Complete transaction
      await supabase
        .from('transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', txId);

      res.status(201).json({
        success: true,
        message: `Purchased ${currency} ${amount} ${cardType.toUpperCase()} Gift Card successfully!`,
        card: userCard
      });
    } catch (err) {
      logger.error('Giftcard insert failed, rolling back debit:', err);

      await supabase.rpc('refund_wallet_debit', {
        p_tx_id: txId,
        p_user_id: req.user.id,
        p_amount: costNaira,
        p_reason: 'Database insertion failure during gift card creation'
      });

      res.status(500).json({ success: false, message: 'Failed to complete gift card purchase. Balance refunded.' });
    }
  } catch (error) {
    logger.error('Buy gift card error:', error);
    res.status(500).json({ success: false, message: 'Purchase failed' });
  }
});

// @route   POST /api/v1/giftcards/sell
// @desc    Sell a gift card (Instant settlement to Naira balance)
// @access  Private
router.post('/sell', auth, [
  body('cardType').notEmpty().withMessage('Card type is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount is required'),
  body('currency').notEmpty().withMessage('Currency is required'),
  body('cardCode').notEmpty().withMessage('Card code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { cardType, amount, currency, cardCode, cardPin, cardImage } = req.body;

    // Resolve rate
    const rates = {
      amazon: { USD: 850, GBP: 950, EUR: 890 },
      apple: { USD: 880, GBP: 980 },
      itunes: { USD: 880, GBP: 980 },
      'google-play': { USD: 820 },
      steam: { USD: 800 },
      netflix: { USD: 900 },
      spotify: { USD: 870 },
      xbox: { USD: 810 },
      playstation: { USD: 830 }
    };

    const typeKey = cardType.toLowerCase();
    const rate = rates[typeKey]?.[currency.toUpperCase()] || 750;
    const payoutNaira = amount * rate;

    const reference = `GFT-SEL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 1. Credit wallet instantly (Instant settlement)
    const { data: creditResult, error: creditError } = await supabase.rpc('execute_wallet_credit', {
      p_user_id: req.user.id,
      p_amount: payoutNaira,
      p_ref: reference,
      p_type: 'giftcard_sale',
      p_category: 'giftcard',
      p_description: `Sold ${currency.toUpperCase()} ${amount} ${cardType.toUpperCase()} Gift Card`,
      p_details: { cardType, amount, currency, cardCode }
    });

    if (creditError || !creditResult?.success) {
      logger.error('Giftcard sell wallet credit failed:', creditError);
      return res.status(400).json({
        success: false,
        message: creditError ? creditError.message : 'Credit failed'
      });
    }

    const txId = creditResult.tx_id;

    // 2. Insert record into user_giftcards
    const { data: userCard, error: insertError } = await supabase
      .from('user_giftcards')
      .insert({
        user_id: req.user.id,
        transaction_id: txId,
        type: 'sell',
        card_type: cardType,
        card_value: amount,
        card_currency: currency,
        card_code: cardCode,
        card_pin: cardPin || null,
        card_image: cardImage || null,
        rate: rate,
        payout_amount: payoutNaira,
        payout_currency: 'NGN',
        status: 'completed'
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to log sold giftcard record:', insertError);
      // Payout is already done, so we don't rollback the user money, just log the card.
    }

    res.json({
      success: true,
      message: `Gift card submitted successfully. Instant settlement processed: ₦${payoutNaira.toLocaleString()} credited to your wallet balance.`,
      card: userCard
    });
  } catch (error) {
    logger.error('Sell gift card error:', error);
    res.status(500).json({ success: false, message: 'Sale failed' });
  }
});

// @route   POST /api/v1/giftcards/redeem
// @desc    Redeem a Nadi gift voucher back to Naira wallet balance
// @access  Private
router.post('/redeem', auth, [
  body('code').notEmpty().withMessage('Gift card code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { code } = req.body;

    // 1. Locate the gift card purchased by this user (or anyone) that is completed and not redeemed
    const { data: card, error: cardError } = await supabase
      .from('user_giftcards')
      .select('*')
      .eq('card_code', code)
      .eq('type', 'buy')
      .eq('status', 'completed')
      .maybeSingle();

    if (cardError || !card) {
      return res.status(400).json({
        success: false,
        message: 'Invalid, already redeemed, or expired gift voucher code'
      });
    }

    // 2. Mark card status as redeemed
    const { error: updateError } = await supabase
      .from('user_giftcards')
      .update({ status: 'redeemed' })
      .eq('id', card.id);

    if (updateError) {
      throw updateError;
    }

    // 3. Credit Naira wallet
    const reference = `GFT-RED-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const payoutAmount = parseFloat(card.payout_amount);

    const { data: creditResult, error: creditError } = await supabase.rpc('execute_wallet_credit', {
      p_user_id: req.user.id,
      p_amount: payoutAmount,
      p_ref: reference,
      p_type: 'giftcard_redemption',
      p_category: 'giftcard',
      p_description: `Redeemed ${card.card_currency} ${card.card_value} ${card.card_type.toUpperCase()} Gift Voucher`,
      p_details: { cardType: card.card_type, amount: card.card_value, currency: card.card_currency }
    });

    if (creditError || !creditResult?.success) {
      logger.error('Wallet credit for redemption failed:', creditError);
      // Attempt to roll back status
      await supabase.from('user_giftcards').update({ status: 'completed' }).eq('id', card.id);
      return res.status(500).json({ success: false, message: 'Failed to credit wallet balance' });
    }

    res.json({
      success: true,
      message: `Gift voucher redeemed successfully! ₦${payoutAmount.toLocaleString()} credited to your wallet balance.`
    });
  } catch (error) {
    logger.error('Redeem gift card error:', error);
    res.status(500).json({ success: false, message: 'Redemption failed' });
  }
});

// @route   GET /api/v1/giftcards/my-cards
// @desc    Get user's gift cards
// @access  Private
router.get('/my-cards', auth, async (req, res) => {
  try {
    const { data: cards, error } = await supabase
      .from('user_giftcards')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('type', 'buy')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, cards });
  } catch (error) {
    logger.error('Get my cards error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cards' });
  }
});

// @route   GET /api/v1/giftcards/transactions
// @desc    Get gift card transaction history
// @access  Private
router.get('/transactions', auth, async (req, res) => {
  try {
    const { data: transactions, error } = await supabase
      .from('user_giftcards')
      .select('*, amount:card_value')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, transactions: transactions || [] });
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

module.exports = router;
