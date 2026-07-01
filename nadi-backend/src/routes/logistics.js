const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const supabase = require('../utils/supabase');
const { auth, authorize } = require('../middleware/auth');
const what3words = require('../services/what3words');
const { createNotification } = require('../services/notification');
const quidaxService = require('../services/quidax');
const logger = require('../utils/logger');

const DISPATCHABLE_STATUSES = ['accepted', 'picked_up', 'in_transit', 'delivered'];
const TERMINAL_STATUSES = ['cancelled', 'delivered'];
const STATUS_FLOW = {
  pending: ['accepted', 'cancelled'],
  order_created: ['accepted', 'cancelled'],
  accepted: ['picked_up', 'in_transit'],
  picked_up: ['in_transit', 'delivered'],
  in_transit: ['delivered'],
  delivered: [],
  cancelled: []
};

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeScheduledDate(scheduledDate) {
  if (!scheduledDate) return null;
  const parsed = new Date(scheduledDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildTrackingLog(status, message, extra = {}) {
  return {
    status,
    timestamp: new Date().toISOString(),
    message,
    ...extra
  };
}

function appendTrackingEvent(tracking, status, message, extra = {}) {
  const existingLogs = Array.isArray(tracking?.logs) ? tracking.logs : [];
  return {
    ...(tracking || {}),
    status,
    logs: [...existingLogs, buildTrackingLog(status, message, extra)]
  };
}

function isValidTransition(currentStatus, nextStatus) {
  const allowed = STATUS_FLOW[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function buildShipmentPaymentSummary({
  paymentMethod,
  reference,
  amount,
  cryptoCoin,
  cryptoQty
}) {
  return {
    method: paymentMethod,
    reference,
    status: 'completed',
    amount,
    currency: paymentMethod === 'crypto' ? cryptoCoin.toUpperCase() : 'NGN',
    cryptoCoin: paymentMethod === 'crypto' ? cryptoCoin : null,
    cryptoQty: paymentMethod === 'crypto' ? cryptoQty : 0
  };
}

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
  body('pickupAddress').trim().notEmpty().withMessage('Pickup address is required'),
  body('deliveryAddress').trim().notEmpty().withMessage('Delivery address is required'),
  body('recipientName').trim().notEmpty().withMessage('Recipient name is required'),
  body('recipientPhone').trim().notEmpty().withMessage('Recipient phone is required'),
  body('itemDescription').trim().notEmpty().withMessage('Item description is required'),
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

    const normalizedPickupAddress = sanitizeText(pickupAddress);
    const normalizedDeliveryAddress = sanitizeText(deliveryAddress);
    const normalizedRecipientName = sanitizeText(recipientName);
    const normalizedRecipientPhone = sanitizeText(recipientPhone);
    const normalizedItemDescription = sanitizeText(itemDescription);
    const normalizedScheduledDate = normalizeScheduledDate(scheduledDate);

    if (!normalizedPickupAddress || !normalizedDeliveryAddress || !normalizedRecipientName || !normalizedRecipientPhone || !normalizedItemDescription) {
      return res.status(400).json({
        success: false,
        message: 'Shipment details must not be empty'
      });
    }

    if (scheduledDate && !normalizedScheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled delivery date is invalid'
      });
    }

    const weightNum = parseFloat(weight);
    if (Number.isNaN(weightNum) || weightNum < 0.1) {
      return res.status(400).json({
        success: false,
        message: 'Weight must be at least 0.1kg'
      });
    }

    const baseRate = Math.max(1500, weightNum * 500);
    let amount = baseRate;
    if (serviceType === 'express') amount = baseRate * 1.5;
    if (serviceType === 'sameDay') amount = baseRate * 2.5;

    // Apply adjustments based on mode/category
    if (deliveryMode === 'interstate') amount += 3000;
    if (deliveryCategory === 'document') amount = Math.max(1000, amount - 500);

    // Resolve what3words addresses
    const resolvedPickup = await resolveAddress(normalizedPickupAddress);
    const resolvedDelivery = await resolveAddress(normalizedDeliveryAddress);

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
        p_description: `Delivery charge paid with ${selectedCoin.toUpperCase()}: ${normalizedItemDescription}`,
        p_metadata: { serviceType, weight, paymentMethod, cryptoCoin: selectedCoin, deliveryCategory, deliveryMode, scheduledDate: normalizedScheduledDate },
        p_details: {
          pickup: resolvedPickup,
          delivery: { ...resolvedDelivery, recipientName: normalizedRecipientName, recipientPhone: normalizedRecipientPhone }
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
        p_description: `Delivery charge: ${normalizedItemDescription}`,
        p_metadata: { serviceType, weight, paymentMethod, deliveryCategory, deliveryMode, scheduledDate: normalizedScheduledDate },
        p_details: {
          pickup: resolvedPickup,
          delivery: { ...resolvedDelivery, recipientName: normalizedRecipientName, recipientPhone: normalizedRecipientPhone }
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
            recipientName: normalizedRecipientName,
            recipientPhone: normalizedRecipientPhone
          },
          items: [{ description: normalizedItemDescription, weight: weightNum, category: deliveryCategory }],
          package: { weight: weightNum, serviceType, deliveryCategory, deliveryMode, scheduledDate: normalizedScheduledDate },
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
        order: {
          ...order,
          reference: order.order_number,
          initialStatus: 'pending'
        },
        payment: buildShipmentPaymentSummary({
          paymentMethod,
          reference,
          amount,
          cryptoCoin: paymentMethod === 'crypto' ? selectedCoin : null,
          cryptoQty
        })
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
    const isOpsUser = ['admin', 'super_admin'].includes(req.user?.role);

    let query = supabase
      .from('logistics_orders')
      .select('*')
      .eq('order_number', trackingNumber);

    if (!isOpsUser) {
      query = query.eq('user_id', req.user.id);
    }

    const { data: shipment, error } = await query.maybeSingle();

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

    const {
      weight,
      serviceType = 'standard',
      deliveryCategory = 'parcel',
      deliveryMode = 'door_to_door'
    } = req.body;
    const weightNum = parseFloat(weight);
    const baseRate = Math.max(1500, weightNum * 500);
    const standard = Math.max(1500, baseRate + (deliveryMode === 'interstate' ? 3000 : 0) + (deliveryCategory === 'document' ? -500 : 0));
    const express = Math.max(1500, baseRate * 1.5 + (deliveryMode === 'interstate' ? 3000 : 0) + (deliveryCategory === 'document' ? -500 : 0));
    const sameDay = Math.max(1500, baseRate * 2.5 + (deliveryMode === 'interstate' ? 3000 : 0) + (deliveryCategory === 'document' ? -500 : 0));

    const serviceRate = serviceType === 'express' ? express : serviceType === 'sameDay' ? sameDay : standard;

    res.json({
      success: true,
      rate: {
        standard,
        express,
        sameDay,
        total: serviceRate,
        serviceType,
        deliveryCategory,
        deliveryMode,
        currency: 'NGN'
      }
    });
  } catch (error) {
    logger.error('Calculate rate error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate rate' });
  }
});

// @route   POST /api/v1/logistics/shipments/:id/assign
// @desc    Assign shipment to dispatcher/admin workflow
// @access  Admin
router.post('/shipments/:id/assign', auth, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const assignedTo = sanitizeText(req.body.assignedTo || req.body.assigned_to);
    const notes = sanitizeText(req.body.notes);

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Assigned dispatcher is required'
      });
    }

    const { data: order, error } = await supabase
      .from('logistics_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: 'Shipment order not found'
      });
    }

    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Shipment cannot be assigned because its status is already: ${order.status}`
      });
    }

    const tracking = appendTrackingEvent(
      order.tracking,
      'accepted',
      notes || `Shipment assigned to ${assignedTo}`,
      {
        assigned_to: assignedTo,
        actor: req.user?.role || 'admin'
      }
    );

    const updates = {
      assigned_to: assignedTo,
      status: 'accepted',
      tracking,
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('logistics_orders')
      .update(updates)
      .eq('id', id);

    const shipment = {
      ...order,
      ...updates
    };

    await createNotification({
      user_id: order.user_id,
      type: 'order',
      title: 'Shipment Assigned',
      message: `Your shipment order ${order.order_number} has been assigned and is awaiting pickup.`,
      related_to: { table: 'logistics_orders', id: order.id }
    }).catch(err => logger.error('Shipment assignment notification error:', err));

    res.json({
      success: true,
      message: 'Shipment assigned successfully',
      shipment
    });
  } catch (error) {
    logger.error('Assign shipment error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign shipment' });
  }
});

// @route   PATCH /api/v1/logistics/shipments/:id/status
// @desc    Update shipment status, notes and proof
// @access  Admin
router.patch('/shipments/:id/status', auth, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const nextStatus = sanitizeText(req.body.status);
    const notes = sanitizeText(req.body.notes);
    const proof = req.body.proof ?? req.body.deliveryProof ?? null;

    if (!DISPATCHABLE_STATUSES.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shipment status'
      });
    }

    const { data: order, error } = await supabase
      .from('logistics_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: 'Shipment order not found'
      });
    }

    if (!isValidTransition(order.status, nextStatus)) {
      return res.status(400).json({
        success: false,
        message: `Shipment cannot transition from ${order.status} to ${nextStatus}`
      });
    }

    const tracking = appendTrackingEvent(
      order.tracking,
      nextStatus,
      notes || `Shipment status updated to ${nextStatus.replaceAll('_', ' ')}`,
      {
        actor: req.user?.role || 'admin',
        proof: proof || undefined
      }
    );

    const updates = {
      status: nextStatus,
      tracking,
      updated_at: new Date().toISOString()
    };

    if (proof) {
      updates.delivery_proof = proof;
    }

    await supabase
      .from('logistics_orders')
      .update(updates)
      .eq('id', id);

    const shipment = {
      ...order,
      ...updates
    };

    if (nextStatus === 'delivered') {
      await createNotification({
        user_id: order.user_id,
        type: 'order',
        title: 'Shipment Delivered',
        message: `Your shipment order ${order.order_number} has been delivered.`,
        related_to: { table: 'logistics_orders', id: order.id }
      }).catch(err => logger.error('Shipment delivery notification error:', err));
    }

    res.json({
      success: true,
      message: 'Shipment status updated successfully',
      shipment
    });
  } catch (error) {
    logger.error('Update shipment status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update shipment status' });
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
