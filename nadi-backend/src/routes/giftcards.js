const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');
const supabase = require('../utils/supabase');
const reloadly = require('../services/reloadly');

const DEFAULT_RATES = {
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

const FALLBACK_CARDS = [
  { id: 'amazon', name: 'Amazon', currencies: ['USD', 'GBP', 'EUR'], minValue: 10, maxValue: 500, provider: 'manual' },
  { id: 'itunes', name: 'iTunes/Apple', currencies: ['USD', 'GBP'], minValue: 10, maxValue: 200, provider: 'manual' },
  { id: 'google-play', name: 'Google Play', currencies: ['USD'], minValue: 10, maxValue: 200, provider: 'manual' },
  { id: 'steam', name: 'Steam', currencies: ['USD'], minValue: 10, maxValue: 100, provider: 'manual' },
  { id: 'xbox', name: 'Xbox', currencies: ['USD'], minValue: 10, maxValue: 100, provider: 'manual' },
  { id: 'playstation', name: 'PlayStation', currencies: ['USD'], minValue: 10, maxValue: 100, provider: 'manual' },
  { id: 'netflix', name: 'Netflix', currencies: ['USD'], minValue: 15, maxValue: 100, provider: 'manual' },
  { id: 'spotify', name: 'Spotify', currencies: ['USD'], minValue: 10, maxValue: 60, provider: 'manual' }
];

function normalizeProduct(product) {
  const minValue = product.minRecipientDenomination || product.minSenderDenomination || product.minValue || 1;
  const maxValue = product.maxRecipientDenomination || product.maxSenderDenomination || product.maxValue || minValue;
  const currency = product.recipientCurrencyCode || product.senderCurrencyCode || product.currency || 'USD';

  return {
    id: String(product.productId || product.id),
    productId: product.productId || product.id,
    name: product.productName || product.name,
    brand: product.brand?.brandName || product.brandName || product.productName || product.name,
    currencies: [currency].filter(Boolean),
    minValue,
    maxValue,
    fixedValues: product.fixedRecipientDenominations || product.fixedSenderDenominations || [],
    provider: 'reloadly'
  };
}

async function getGiftcardSettings() {
  const { data, error } = await supabase
    .from('operational_settings')
    .select('value')
    .eq('key', 'giftcards')
    .maybeSingle();

  if (error) {
    logger.warn('Gift card settings unavailable, using defaults:', error.message);
    return {};
  }

  return data?.value || {};
}

function getRate(rates, cardType, currency) {
  const typeKey = String(cardType).toLowerCase();
  const currencyKey = String(currency).toUpperCase();
  return rates?.[typeKey]?.[currencyKey] || DEFAULT_RATES[typeKey]?.[currencyKey] || 750;
}

function validateAmountAgainstCard(card, amount) {
  if (!card) return null;
  if (amount < Number(card.minValue || 0)) return `Minimum card amount is ${card.minValue}`;
  if (amount > Number(card.maxValue || Number.MAX_SAFE_INTEGER)) return `Maximum card amount is ${card.maxValue}`;
  if (Array.isArray(card.fixedValues) && card.fixedValues.length > 0 && !card.fixedValues.map(Number).includes(Number(amount))) {
    return `Amount must be one of: ${card.fixedValues.join(', ')}`;
  }
  return null;
}

router.get('/available', auth, async (req, res) => {
  try {
    try {
      const products = await reloadly.getGiftCardProducts(process.env.GIFTCARD_COUNTRY_CODE || 'NG');
      const cards = (products || []).map(normalizeProduct).filter(card => card.id && card.name);
      return res.json({ success: true, cards, provider: 'reloadly' });
    } catch (providerError) {
      logger.warn('Using fallback gift card catalog:', providerError.message);
      return res.json({
        success: true,
        cards: FALLBACK_CARDS,
        provider: 'fallback',
        message: 'Gift card provider catalog is unavailable'
      });
    }
  } catch (error) {
    logger.error('Get available cards error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch gift cards' });
  }
});

router.get('/rates', auth, async (req, res) => {
  try {
    const settings = await getGiftcardSettings();
    res.json({ success: true, rates: settings.rates || DEFAULT_RATES });
  } catch (error) {
    logger.error('Get rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rates' });
  }
});

router.post('/buy', auth, [
  body('cardType').notEmpty().withMessage('Card type is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount is required'),
  body('currency').notEmpty().withMessage('Currency is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { cardType, amount, currency } = req.body;
    const amountNum = Number(amount);
    const settings = await getGiftcardSettings();
    const rate = getRate(settings.rates, cardType, currency);
    const costNaira = amountNum * rate;
    const reference = `GFT-BUY-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    let selectedCard = null;
    try {
      const products = await reloadly.getGiftCardProducts(process.env.GIFTCARD_COUNTRY_CODE || 'NG');
      selectedCard = (products || []).map(normalizeProduct).find(card => String(card.id) === String(cardType));
      const amountError = validateAmountAgainstCard(selectedCard, amountNum);
      if (amountError) {
        return res.status(400).json({ success: false, message: amountError });
      }
    } catch (providerError) {
      return res.status(503).json({
        success: false,
        message: `${providerError.message || 'Gift card provider unavailable'}. Purchase was not charged.`
      });
    }

    const { data: debitResult, error: debitError } = await supabase.rpc('execute_wallet_debit', {
      p_user_id: req.user.id,
      p_amount: costNaira,
      p_ref: reference,
      p_type: 'giftcard_purchase',
      p_category: 'giftcard',
      p_description: `Purchased ${String(currency).toUpperCase()} ${amountNum} gift card`,
      p_details: { cardType, amount: amountNum, currency, provider: 'reloadly' }
    });

    if (debitError || !debitResult?.success) {
      logger.error('Gift card buy wallet debit failed:', debitError);
      return res.status(400).json({
        success: false,
        message: debitError ? debitError.message : 'Debit failed. Check your wallet balance.'
      });
    }

    const txId = debitResult.tx_id;

    try {
      const providerOrder = await reloadly.orderGiftCard({
        productId: Number.isNaN(Number(cardType)) ? cardType : Number(cardType),
        quantity: 1,
        unitPrice: amountNum,
        senderName: 'Nadi Digital',
        recipientEmail: req.user.email,
        recipientPhone: req.user.phone,
        customIdentifier: reference
      });

      const providerCardCode = providerOrder.cardNumber || providerOrder.code || providerOrder.pinCode || providerOrder.transactionId || reference;
      const providerCardPin = providerOrder.pin || providerOrder.pinCode || null;

      const { data: userCard, error: insertError } = await supabase
        .from('user_giftcards')
        .insert({
          user_id: req.user.id,
          transaction_id: txId,
          type: 'buy',
          card_type: selectedCard?.name || cardType,
          card_value: amountNum,
          card_currency: currency,
          card_code: providerCardCode,
          card_pin: providerCardPin,
          rate,
          payout_amount: costNaira,
          payout_currency: 'NGN',
          status: 'completed',
          review: {
            provider: 'reloadly',
            providerProductId: cardType,
            providerOrder
          }
        })
        .select()
        .single();

      if (insertError || !userCard) throw insertError || new Error('Failed to insert gift card record');

      await supabase
        .from('transactions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', txId);

      res.status(201).json({
        success: true,
        message: 'Gift card purchased successfully.',
        card: userCard,
        provider: {
          name: 'reloadly',
          reference: providerOrder.transactionId || providerOrder.orderId || reference
        }
      });
    } catch (providerOrDbError) {
      logger.error('Gift card purchase failed after debit, refunding:', providerOrDbError);
      await supabase.rpc('refund_wallet_debit', {
        p_tx_id: txId,
        p_user_id: req.user.id,
        p_amount: costNaira,
        p_reason: providerOrDbError.message || 'Gift card purchase failed'
      });

      res.status(400).json({
        success: false,
        message: `${providerOrDbError.message || 'Gift card purchase failed'}. Wallet refunded.`
      });
    }
  } catch (error) {
    logger.error('Buy gift card error:', error);
    res.status(500).json({ success: false, message: 'Purchase failed' });
  }
});

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
    const amountNum = Number(amount);
    const settings = await getGiftcardSettings();
    const rate = getRate(settings.rates, cardType, currency);
    const payoutNaira = amountNum * rate;
    const reference = `GFT-SEL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const { data: userCard, error: insertError } = await supabase
      .from('user_giftcards')
      .insert({
        user_id: req.user.id,
        transaction_id: null,
        type: 'sell',
        card_type: cardType,
        card_value: amountNum,
        card_currency: currency,
        card_code: cardCode,
        card_pin: cardPin || null,
        card_image: cardImage || null,
        rate,
        payout_amount: payoutNaira,
        payout_currency: 'NGN',
        status: 'pending_review',
        review: {
          reference,
          reviewStatus: 'pending'
        }
      })
      .select()
      .single();

    if (insertError || !userCard) throw insertError || new Error('Failed to record gift card sale');

    res.status(201).json({
      success: true,
      message: `Gift card submitted for review. Estimated payout: NGN ${payoutNaira.toLocaleString()}.`,
      card: userCard
    });
  } catch (error) {
    logger.error('Sell gift card error:', error);
    res.status(500).json({ success: false, message: 'Sale submission failed' });
  }
});

router.post('/redeem', auth, [
  body('code').notEmpty().withMessage('Gift card code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { code } = req.body;

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

    const { error: updateError } = await supabase
      .from('user_giftcards')
      .update({ status: 'redeemed' })
      .eq('id', card.id);

    if (updateError) throw updateError;

    const reference = `GFT-RED-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const payoutAmount = parseFloat(card.payout_amount);

    const { data: creditResult, error: creditError } = await supabase.rpc('execute_wallet_credit', {
      p_user_id: req.user.id,
      p_amount: payoutAmount,
      p_ref: reference,
      p_type: 'giftcard_redemption',
      p_category: 'giftcard',
      p_description: `Redeemed ${card.card_currency} ${card.card_value} ${card.card_type} Gift Voucher`,
      p_details: { cardType: card.card_type, amount: card.card_value, currency: card.card_currency }
    });

    if (creditError || !creditResult?.success) {
      logger.error('Wallet credit for redemption failed:', creditError);
      await supabase.from('user_giftcards').update({ status: 'completed' }).eq('id', card.id);
      return res.status(500).json({ success: false, message: 'Failed to credit wallet balance' });
    }

    res.json({
      success: true,
      message: `Gift voucher redeemed successfully. NGN ${payoutAmount.toLocaleString()} credited to your wallet.`
    });
  } catch (error) {
    logger.error('Redeem gift card error:', error);
    res.status(500).json({ success: false, message: 'Redemption failed' });
  }
});

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
