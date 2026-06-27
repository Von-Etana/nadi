const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const supabase = require('../utils/supabase');
const { auth } = require('../middleware/auth');
const what3words = require('../services/what3words');
const { createNotification } = require('../services/notification');
const quidaxService = require('../services/quidax');
const logger = require('../utils/logger');

// Helper function to resolve addresses (checking for what3words format)
async function resolveAddress(addressStr) {
  if (!addressStr) return null;
  const trimmed = addressStr.trim();
  // Check if it starts with /// or matches the three-word pattern "word.word.word"
  const isW3W = trimmed.startsWith('///') || (/^[a-zA-Z\u00C0-\u017F]+[.\u2022][a-zA-Z\u00C0-\u017F]+[.\u2022][a-zA-Z\u00C0-\u017F]+$/.test(trimmed));
  
  if (isW3W) {
    try {
      const coords = await what3words.convertToCoordinates(trimmed);
      return {
        address: trimmed,
        coordinates: { lat: coords.lat, lng: coords.lng },
        nearestPlace: coords.nearestPlace,
        country: coords.country,
        isWhat3words: true
      };
    } catch (err) {
      logger.warn(`Failed to resolve what3words address: "${trimmed}". Storing as raw text.`);
    }
  }

  return {
    address: trimmed,
    coordinates: null,
    isWhat3words: false
  };
}

// @route   POST /api/v1/logistics/shipments
// @desc    Create a new shipment & charge wallet (Naira or Crypto)
// @access  Private
router.post('/shipments', auth, [
  body('pickupAddress').notEmpty().withMessage('Pickup address is required'),
  body('deliveryAddress').notEmpty().withMessage('Delivery address is required'),
  body('recipientName').notEmpty().withMessage('Recipient name is required'),
  body('recipientPhone').notEmpty().withMessage('Recipient phone is required'),
  body('itemDescription').notEmpty().withMessage('Item description is required'),
  body('weight').isFloat({ min: 0.1 }).withMessage('Weight must be at least 0.1kg'),
  body('serviceType').optional().isIn(['standard', 'express', 'sameDay']).withMessage('Invalid service type'),
  body('paymentMethod').optional().isIn(['wallet', 'crypto']).withMessage('Invalid payment method'),
  body('cryptoCoin').optional().isIn(['btc', 'eth', 'usdt', 'BTC', 'ETH', 'USDT']).withMessage('Unsupported cryptocurrency')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      pickupAddress,
      deliveryAddress,
      recipientName,
      recipientPhone,
      itemDescription,
      weight,
      serviceType = 'standard',
      insuranceOptIn = false,
      paymentMethod = 'wallet',
      cryptoCoin = 'usdt',
      deliveryCategory = 'parcel',
      deliveryMode = 'door_to_door',
      scheduledDate = null
    } = req.body;

    const weightNum = parseFloat(weight);
    const baseRate = Math.max(1500, weightNum * 500);
    let amount = baseRate;
    if (serviceType === 'express') amount = baseRate * 1.5;
    if (serviceType === 'sameDay') amount = baseRate * 2.5;

    // Apply adjustments based on mode/category
    if (deliveryMode === 'interstate') amount += 3000;
    if (deliveryCategory === 'document') amount = Math.max(1000, amount - 500);

    // Resolve what3words addresses
    const resolvedPickup = await resolveAddress(pickupAddress);
    const resolvedDelivery = await resolveAddress(deliveryAddress);

    const reference = `LOG-TX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    let debitResult, debitError;
    let cryptoQty = 0;
    const selectedCoin = cryptoCoin.toLowerCase();

    if (paymentMethod === 'crypto') {
      // Fetch current price to calculate crypto quantity
      const rates = await quidaxService.getLiveRates().catch(() => ({ btc: 98500000, eth: 5200000, usdt: 1550 }));
      const price = rates[selectedCoin];
      if (!price || price <= 0) {
        return res.status(400).json({ success: false, message: 'Failed to retrieve market conversion price' });
      }

      cryptoQty = amount / price;

      // Atomic debit from crypto wallet
      const dbRes = await supabase.rpc('execute_crypto_debit', {
        p_user_id: req.user.id,
        p_symbol: selectedCoin,
        p_amount_crypto: cryptoQty,
        p_amount_naira: amount,
        p_ref: reference,
        p_type: 'logistics_payment',
        p_category: 'logistics',
        p_description: `Delivery charge paid with ${selectedCoin.toUpperCase()}: ${itemDescription}`,
        p_metadata: { serviceType, weight, paymentMethod, cryptoCoin: selectedCoin, deliveryCategory, deliveryMode, scheduledDate },
        p_details: {
          pickup: resolvedPickup,
          delivery: { ...resolvedDelivery, recipientName, recipientPhone }
        }
      });
      debitResult = dbRes.data;
      debitError = dbRes.error;
    } else {
      // Atomic debit from sender Naira wallet
      const dbRes = await supabase.rpc('execute_wallet_debit', {
        p_user_id: req.user.id,
        p_amount: amount,
        p_ref: reference,
        p_type: 'logistics_payment',
        p_category: 'logistics',
        p_description: `Delivery charge: ${itemDescription}`,
        p_metadata: { serviceType, weight, paymentMethod, deliveryCategory, deliveryMode, scheduledDate },
        p_details: {
          pickup: resolvedPickup,
          delivery: { ...resolvedDelivery, recipientName, recipientPhone }
        }
      });
      debitResult = dbRes.data;
      debitError = dbRes.error;
    }

    if (debitError || !debitResult?.success) {
      logger.error('Logistics wallet debit failed:', debitError);
      return res.status(400).json({
        success: false,
        message: debitError ? debitError.message : 'Debit failed. Check your balance.'
      });
    }

    const txId = debitResult.tx_id;
    const orderNumber = `NADI-LOG-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    try {
      // 2. Insert into logistics_orders
      const { data: order, error: orderError } = await supabase
        .from('logistics_orders')
        .insert({
          order_number: orderNumber,
          user_id: req.user.id,
          transaction_id: txId,
          pickup: resolvedPickup,
          delivery: {
            address: resolvedDelivery.address,
            coordinates: resolvedDelivery.coordinates,
            isWhat3words: resolvedDelivery.isWhat3words,
            recipientName,
            recipientPhone
          },
          items: [{ description: itemDescription, weight: weightNum, category: deliveryCategory }],
          package: { weight: weightNum, serviceType, deliveryCategory, deliveryMode, scheduledDate },
          pricing: { baseAmount: amount, insurance: 0, total: amount, paymentMethod, cryptoCoin: paymentMethod === 'crypto' ? selectedCoin : null, cryptoQty },
          insurance: { optedIn: insuranceOptIn },
          status: 'pending',
          tracking: {
            status: 'order_created',
            logs: [{ status: 'order_created', timestamp: new Date().toISOString(), message: 'Shipment request received' }]
          }
        })
        .select()
        .single();

      if (orderError || !order) {
        throw orderError || new Error('Failed to create order row');
      }

      // 3. Mark transaction as completed
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
        type: 'order',
        title: 'Shipment Created',
        message: `Your shipment order ${orderNumber} has been successfully created.`,
        related_to: { table: 'logistics_orders', id: order.id }
      }).catch(err => logger.error('Logistics order notification error:', err));

      res.status(201).json({
        success: true,
        message: 'Shipment order created successfully',
        order
      });
    } catch (dbErr) {
      logger.error('Logistics order insertion failed, initiating refund:', dbErr);

      // Refund the wallet debit (crypto or Naira)
      if (paymentMethod === 'crypto') {
        await supabase.rpc('refund_crypto_debit', {
          p_tx_id: txId,
          p_user_id: req.user.id,
          p_symbol: selectedCoin,
          p_amount_crypto: cryptoQty,
          p_reason: 'Database insertion failure during order creation'
        });
      } else {
        await supabase.rpc('refund_wallet_debit', {
          p_tx_id: txId,
          p_user_id: req.user.id,
          p_amount: amount,
          p_reason: 'Database insertion failure during order creation'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to complete shipment order. Wallet refunded.'
      });
    }
  } catch (error) {
    logger.error('Create shipment error:', error);
    res.status(500).json({ success: false, message: 'Failed to create shipment' });
  }
});

// @route   GET /api/v1/logistics/shipments
// @desc    Get user's shipments
// @access  Private
router.get('/shipments', auth, async (req, res) => {
  try {
    const { data: shipments, error } = await supabase
      .from('logistics_orders')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      shipments
    });
  } catch (error) {
    logger.error('Get shipments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shipments' });
  }
});

// @route   GET /api/v1/logistics/track/:trackingNumber
// @desc    Track a shipment
// @access  Private
router.get('/track/:trackingNumber', auth, async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const { data: shipment, error } = await supabase
      .from('logistics_orders')
      .select('*')
      .eq('order_number', trackingNumber)
      .maybeSingle();

    if (error || !shipment) {
      return res.status(404).json({
        success: false,
        message: 'Shipment order not found'
      });
    }

    res.json({
      success: true,
      shipment
    });
  } catch (error) {
    logger.error('Track shipment error:', error);
    res.status(500).json({ success: false, message: 'Failed to track shipment' });
  }
});

// @route   POST /api/v1/logistics/calculate-rate
// @desc    Calculate shipping rate
// @access  Private
router.post('/calculate-rate', auth, [
  body('pickupLocation').notEmpty().withMessage('Pickup location is required'),
  body('deliveryLocation').notEmpty().withMessage('Delivery location is required'),
  body('weight').isFloat({ min: 0.1 }).withMessage('Weight must be at least 0.1kg')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { weight } = req.body;
    const weightNum = parseFloat(weight);
    const baseRate = Math.max(1500, weightNum * 500);

    res.json({
      success: true,
      rate: {
        standard: baseRate,
        express: baseRate * 1.5,
        sameDay: baseRate * 2.5,
        currency: 'NGN'
      }
    });
  } catch (error) {
    logger.error('Calculate rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate rate' });
  }
});

// @route   POST /api/v1/logistics/shipments/:id/cancel
// @desc    Cancel a pending shipment and refund wallet
// @access  Private
router.post('/shipments/:id/cancel', auth, async (req, res) => {
  try {
    const orderId = req.params.id;

    // Fetch the order
    const { data: order, error } = await supabase
      .from('logistics_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !order) {
      return res.status(404).json({ success: false, message: 'Shipment order not found' });
    }

    if (order.status !== 'pending' && order.status !== 'order_created') {
      return res.status(400).json({
        success: false,
        message: `Shipment cannot be cancelled because its status is already: ${order.status}`
      });
    }

    const refundAmount = parseFloat(order.pricing.total);
    const paymentMethod = order.pricing.paymentMethod || 'wallet';
    const cryptoCoin = order.pricing.cryptoCoin;
    const cryptoQty = parseFloat(order.pricing.cryptoQty || 0);

    // Update status to cancelled
    const tracking = order.tracking || {};
    tracking.status = 'cancelled';
    tracking.logs = tracking.logs || [];
    tracking.logs.push({
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      message: 'Shipment cancelled by user'
    });

    await supabase
      .from('logistics_orders')
      .update({ status: 'cancelled', tracking })
      .eq('id', orderId);

    // Call wallet/crypto refund procedure
    if (paymentMethod === 'crypto' && cryptoCoin && cryptoQty > 0) {
      await supabase.rpc('refund_crypto_debit', {
        p_tx_id: order.transaction_id,
        p_user_id: req.user.id,
        p_symbol: cryptoCoin,
        p_amount_crypto: cryptoQty,
        p_reason: 'Shipment order cancelled by user'
      });
    } else {
      await supabase.rpc('refund_wallet_debit', {
        p_tx_id: order.transaction_id,
        p_user_id: req.user.id,
        p_amount: refundAmount,
        p_reason: 'Shipment order cancelled by user'
      });
    }

    const refundMsg = paymentMethod === 'crypto'
      ? `${cryptoQty.toFixed(6)} ${cryptoCoin.toUpperCase()} refunded to your crypto balance.`
      : `₦${refundAmount.toLocaleString()} refunded to your wallet.`;

    // Create notification
    await createNotification({
      user_id: req.user.id,
      type: 'order',
      title: 'Shipment Cancelled',
      message: `Your shipment order ${order.order_number} has been cancelled and ${refundMsg}`,
      related_to: { table: 'logistics_orders', id: order.id }
    }).catch(err => logger.error('Failed to notify cancellation:', err));

    res.json({
      success: true,
      message: 'Shipment cancelled successfully and funds refunded'
    });
  } catch (error) {
    logger.error('Cancel shipment error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel shipment' });
  }
});

module.exports = router;
