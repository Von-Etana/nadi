const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { Wallet, Transaction, User } = require('../models');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

// Paystack webhook secret
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// @route   POST /api/v1/webhooks/paystack
// @desc    Handle Paystack webhooks
// @access  Public (but verified with signature)
router.post('/paystack', async (req, res) => {
  try {
    // Verify webhook signature
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;
    logger.info(`Paystack webhook received: ${event.event}`);

    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data);
        break;

      case 'transfer.success':
        await handleTransferSuccess(event.data);
        break;

      case 'transfer.failed':
        await handleTransferFailed(event.data);
        break;

      case 'transfer.reversed':
        await handleTransferReversed(event.data);
        break;

      default:
        logger.info(`Unhandled Paystack event: ${event.event}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Paystack webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

// Handle successful charge (wallet funding, payments)
async function handleChargeSuccess(data) {
  const { reference, amount, customer, metadata } = data;

  // Find transaction
  let transaction = await Transaction.findOne({ reference });

  if (!transaction) {
    // Create transaction if not exists
    const user = await User.findOne({ email: customer.email });
    if (!user) {
      logger.error(`User not found for email: ${customer.email}`);
      return;
    }

    transaction = await Transaction.create({
      reference,
      user: user._id,
      type: 'deposit',
      category: 'wallet',
      amount: amount / 100,
      currency: 'NGN',
      direction: 'credit',
      status: 'completed',
      paymentMethod: 'card',
      provider: {
        name: 'paystack',
        reference: data.id
      },
      description: 'Wallet funding'
    });
  }

  if (transaction.status === 'completed') {
    logger.info(`Transaction ${reference} already processed`);
    return;
  }

  // Update transaction
  transaction.status = 'completed';
  transaction.completedAt = new Date();
  transaction.provider = {
    name: 'paystack',
    reference: data.id,
    authorizationCode: data.authorization?.authorization_code
  };
  await transaction.save();

  // Credit wallet
  const wallet = await Wallet.findOne({ user: transaction.user });
  if (wallet) {
    wallet.naira.balance += transaction.amount;
    await wallet.save();

    // Send notification
    await createNotification({
      user: transaction.user,
      type: 'transaction',
      title: 'Wallet Funded',
      message: `Your wallet has been credited with ₦${transaction.amount.toLocaleString()}`,
      relatedTo: { model: 'Transaction', id: transaction._id },
      channels: { inApp: true, email: true }
    });

    logger.info(`Wallet funded: ${transaction.amount} for user ${transaction.user}`);
  }
}

// Handle successful transfer (withdrawal)
async function handleTransferSuccess(data) {
  const { reference, recipient, amount } = data;

  const transaction = await Transaction.findOne({ 'provider.reference': data.transfer_code });

  if (!transaction) {
    logger.error(`Transaction not found for transfer: ${data.transfer_code}`);
    return;
  }

  if (transaction.status === 'completed') {
    return;
  }

  // Update transaction
  transaction.status = 'completed';
  transaction.completedAt = new Date();
  await transaction.save();

  // Send notification
  await createNotification({
    user: transaction.user,
    type: 'transaction',
    title: 'Withdrawal Successful',
    message: `₦${transaction.amount.toLocaleString()} has been sent to your bank account`,
    relatedTo: { model: 'Transaction', id: transaction._id },
    channels: { inApp: true, email: true }
  });

  logger.info(`Withdrawal successful: ${transaction.amount} for user ${transaction.user}`);
}

// Handle failed transfer
async function handleTransferFailed(data) {
  const transaction = await Transaction.findOne({ 'provider.reference': data.transfer_code });

  if (!transaction) {
    logger.error(`Transaction not found for transfer: ${data.transfer_code}`);
    return;
  }

  // Update transaction
  transaction.status = 'failed';
  transaction.failedAt = new Date();
  transaction.failureReason = data.reason;
  await transaction.save();

  // Refund wallet
  const wallet = await Wallet.findOne({ user: transaction.user });
  if (wallet) {
    wallet.naira.balance += transaction.amount;
    await wallet.save();

    // Send notification
    await createNotification({
      user: transaction.user,
      type: 'transaction',
      title: 'Withdrawal Failed',
      message: `Your withdrawal of ₦${transaction.amount.toLocaleString()} failed. The amount has been refunded to your wallet.`,
      relatedTo: { model: 'Transaction', id: transaction._id },
      channels: { inApp: true, email: true }
    });
  }

  logger.info(`Withdrawal failed: ${transaction.amount} for user ${transaction.user}`);
}

// Handle reversed transfer
async function handleTransferReversed(data) {
  const transaction = await Transaction.findOne({ 'provider.reference': data.transfer_code });

  if (!transaction) {
    logger.error(`Transaction not found for transfer: ${data.transfer_code}`);
    return;
  }

  // Update transaction
  transaction.status = 'reversed';
  await transaction.save();

  // Refund wallet
  const wallet = await Wallet.findOne({ user: transaction.user });
  if (wallet) {
    wallet.naira.balance += transaction.amount;
    await wallet.save();
  }

  logger.info(`Transfer reversed: ${transaction.amount} for user ${transaction.user}`);
}

// @route   POST /api/v1/webhooks/flutterwave
// @desc    Handle Flutterwave webhooks
// @access  Public
router.post('/flutterwave', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['verif-hash'];
    if (signature !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;
    logger.info(`Flutterwave webhook received: ${event.event}`);

    // Handle Flutterwave events
    // Similar implementation to Paystack

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Flutterwave webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

module.exports = router;
