const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const supabase = require('../utils/supabase');
const { auth } = require('../middleware/auth');
const what3words = require('../services/what3words');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

const prices = {
  fuel: {
    pms: { price: 617, unit: 'per litre', name: 'Premium Motor Spirit (Petrol)' },
    ago: { price: 1100, unit: 'per litre', name: 'Automotive Gas Oil (Diesel)' },
  },
  gas: {
    '3kg': { price: 3500, name: '3kg Cylinder' },
    '6kg': { price: 6500, name: '6kg Cylinder' },
    '12.5kg': { price: 12500, name: '12.5kg Cylinder' },
    '25kg': { price: 24000, name: '25kg Cylinder' },
    '50kg': { price: 47000, name: '50kg Cylinder' },
  },
  deliveryFee: 1500
};

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

// @route   GET /api/v1/fuel/prices
// @desc    Get current fuel and gas prices
// @access  Private
router.get('/prices', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      prices: {
        ...prices,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get fuel prices error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch prices' });
  }
});

// @route   POST /api/v1/fuel/orders
// @desc    Create a fuel/gas order & charge wallet
// @access  Private
router.post('/orders', auth, [
  body('type').isIn(['fuel', 'gas']).withMessage('Type must be fuel or gas'),
  body('subtype').notEmpty().withMessage('Subtype is required'),
  body('quantity').isFloat({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('deliveryAddress').notEmpty().withMessage('Delivery address is required'),
  body('phoneNumber').notEmpty().withMessage('Phone number is required'),
  body('priority').optional().isIn(['normal', 'high']).withMessage('Invalid priority'),
  body('scheduledDate').optional().isISO8601().withMessage('Invalid scheduled date format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      type,
      subtype,
      quantity,
      deliveryAddress,
      phoneNumber,
      priority = 'normal',
      scheduledDate,
      customerNotes
    } = req.body;

    const qtyNum = parseFloat(quantity);
    let unitPrice = 0;
    let description = '';

    if (type === 'fuel') {
      if (!prices.fuel[subtype]) {
        return res.status(400).json({ success: false, message: 'Invalid fuel subtype' });
      }
      unitPrice = prices.fuel[subtype].price;
      description = `${qtyNum}L of ${prices.fuel[subtype].name}`;
    } else {
      if (!prices.gas[subtype]) {
        return res.status(400).json({ success: false, message: 'Invalid gas cylinder size' });
      }
      unitPrice = prices.gas[subtype].price;
      description = `${qtyNum}x ${prices.gas[subtype].name} Refill`;
    }

    const itemAmount = unitPrice * qtyNum;
    const totalAmount = itemAmount + prices.deliveryFee;

    // Resolve what3words addresses
    const resolvedDelivery = await resolveAddress(deliveryAddress);

    const reference = `FUEL-TX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // 1. Atomic debit from user wallet
    const { data: debitResult, error: debitError } = await supabase.rpc('execute_wallet_debit', {
      p_user_id: req.user.id,
      p_amount: totalAmount,
      p_ref: reference,
      p_type: 'fuel_payment',
      p_category: 'fuel',
      p_description: `Delivery: ${description}`,
      p_metadata: { type, subtype, quantity: qtyNum },
      p_details: {
        orderType: type,
        subtype,
        quantity: qtyNum,
        deliveryAddress: resolvedDelivery
      }
    });

    if (debitError || !debitResult?.success) {
      logger.error('Fuel wallet debit failed:', debitError);
      return res.status(400).json({
        success: false,
        message: debitError ? debitError.message : 'Debit failed'
      });
    }

    const txId = debitResult.tx_id;
    const orderNumber = `NADI-FUEL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    try {
      // 2. Insert into fuel_orders
      const { data: order, error: orderError } = await supabase
        .from('fuel_orders')
        .insert({
          order_number: orderNumber,
          user_id: req.user.id,
          transaction_id: txId,
          order_type: type,
          fuel_details: type === 'fuel' ? { subtype, quantity: qtyNum, unitPrice } : null,
          gas_details: type === 'gas' ? { subtype, quantity: qtyNum, unitPrice } : null,
          delivery_address: resolvedDelivery,
          contact_phone: phoneNumber,
          pricing: { itemAmount, deliveryFee: prices.deliveryFee, total: totalAmount },
          status: 'pending',
          priority,
          scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
          customer_notes: customerNotes || null,
          tracking: {
            status: 'order_created',
            logs: [{ status: 'order_created', timestamp: new Date().toISOString(), message: 'Order submitted' }]
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
        title: 'Fuel Order Placed',
        message: `Your fuel/gas order ${orderNumber} has been successfully created.`,
        related_to: { table: 'fuel_orders', id: order.id }
      }).catch(err => logger.error('Fuel order notification error:', err));

      res.status(201).json({
        success: true,
        message: 'Order placed successfully',
        order
      });
    } catch (dbErr) {
      logger.error('Fuel order insertion failed, initiating refund:', dbErr);

      // Refund the wallet debit
      await supabase.rpc('refund_wallet_debit', {
        p_tx_id: txId,
        p_user_id: req.user.id,
        p_amount: totalAmount,
        p_reason: 'Database insertion failure during order creation'
      });

      res.status(500).json({
        success: false,
        message: 'Failed to complete fuel order. Wallet refunded.'
      });
    }
  } catch (error) {
    logger.error('Create fuel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

// @route   GET /api/v1/fuel/orders
// @desc    Get user's fuel/gas orders
// @access  Private
router.get('/orders', auth, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('fuel_orders')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    logger.error('Get fuel orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// @route   GET /api/v1/fuel/orders/:id/track
// @desc    Track a fuel/gas order
// @access  Private
router.get('/orders/:id/track', auth, async (req, res) => {
  try {
    const orderId = req.params.id;

    const { data: order, error } = await supabase
      .from('fuel_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order,
      tracking: order.tracking
    });
  } catch (error) {
    logger.error('Track fuel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to track order' });
  }
});

// @route   POST /api/v1/fuel/orders/:id/cancel
// @desc    Cancel a fuel/gas order and refund wallet
// @access  Private
router.post('/orders/:id/cancel', auth, async (req, res) => {
  try {
    const orderId = req.params.id;

    // Fetch the order
    const { data: order, error } = await supabase
      .from('fuel_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because its status is already: ${order.status}`
      });
    }

    const refundAmount = parseFloat(order.pricing.total);

    // Update status to cancelled
    const tracking = order.tracking || {};
    tracking.status = 'cancelled';
    tracking.logs = tracking.logs || [];
    tracking.logs.push({
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      message: 'Order cancelled by user'
    });

    await supabase
      .from('fuel_orders')
      .update({ status: 'cancelled', tracking })
      .eq('id', orderId);

    // Call wallet refund procedure
    await supabase.rpc('refund_wallet_debit', {
      p_tx_id: order.transaction_id,
      p_user_id: req.user.id,
      p_amount: refundAmount,
      p_reason: 'Order cancelled by user'
    });

    // Create notification
    await createNotification({
      user_id: req.user.id,
      type: 'order',
      title: 'Order Cancelled',
      message: `Your fuel/gas order ${order.order_number} has been cancelled and ₦${refundAmount.toLocaleString()} refunded to your wallet.`,
      related_to: { table: 'fuel_orders', id: order.id }
    }).catch(err => logger.error('Failed to notify cancellation:', err));

    res.json({
      success: true,
      message: 'Order cancelled successfully and funds refunded'
    });
  } catch (error) {
    logger.error('Cancel fuel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

module.exports = router;
