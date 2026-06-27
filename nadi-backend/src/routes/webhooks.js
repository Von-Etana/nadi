const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const supabase = require('../utils/supabase');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

// Webhook secrets
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

// @route   POST /api/v1/webhooks/paystack
// @desc    Handle Paystack webhooks
// @access  Public (but verified with signature)
router.post('/paystack', async (req, res) => {
  try {
    // Verify webhook signature using raw body buffer
    if (!req.rawBody) {
      logger.error('Paystack webhook signature verification failed: req.rawBody is missing');
      return res.status(400).json({ message: 'Missing raw body' });
    }

    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET)
      .update(req.rawBody)
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      logger.warn('Paystack webhook signature verification failed');
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

    // Respond 200 only after database processing succeeds
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Paystack webhook error:', error);
    // Still return 500/400 if it failed, so provider can retry
    res.status(500).json({ message: error.message });
  }
});

/**
 * Handle successful charge (wallet funding, payments)
 */
async function handleChargeSuccess(data) {
  const { reference, amount, customer } = data;

  // Resolve user ID
  let userId = null;
  const { data: tx } = await supabase
    .from('transactions')
    .select('user_id')
    .eq('reference', reference)
    .maybeSingle();

  if (tx) {
    userId = tx.user_id;
  } else {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', customer.email)
      .maybeSingle();

    if (user) {
      userId = user.id;
    }
  }

  if (!userId) {
    throw new Error(`User not found for charge success webhook: ${customer.email}`);
  }

  // Call atomic wallet deposit RPC
  const { data: result, error } = await supabase.rpc('execute_wallet_deposit', {
    p_user_id: userId,
    p_amount: amount / 100, // kobo to NGN
    p_ref: reference,
    p_provider_name: 'paystack',
    p_provider_ref: String(data.id),
    p_auth_code: data.authorization?.authorization_code || null
  });

  if (error || !result?.success) {
    throw new Error(error ? error.message : 'execute_wallet_deposit RPC failed');
  }

  if (result.already_processed) {
    logger.info(`Paystack charge success ${reference} already processed (idempotent)`);
    return;
  }

  // Send notification outside the lock
  await createNotification({
    user: userId,
    type: 'transaction',
    title: 'Wallet Funded',
    message: `Your wallet has been credited with ₦${(amount / 100).toLocaleString()}`,
    relatedTo: { table: 'transactions', id: result.tx_id },
    channels: { inApp: true, email: true }
  }).catch(err => logger.error('Webhook notification error:', err));

  logger.info(`Wallet funded: ${amount / 100} for user ${userId}`);
}

/**
 * Handle successful transfer (withdrawal)
 */
async function handleTransferSuccess(data) {
  const { data: transaction, error } = await supabase
    .from('transactions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('provider->>reference', data.transfer_code)
    .neq('status', 'completed')
    .select()
    .maybeSingle();

  if (error) throw error;

  if (!transaction) {
    logger.info(`Transfer success ${data.transfer_code} already processed or not found`);
    return;
  }

  // Send notification
  await createNotification({
    user: transaction.user_id,
    type: 'transaction',
    title: 'Withdrawal Successful',
    message: `₦${parseFloat(transaction.amount).toLocaleString()} has been sent to your bank account`,
    relatedTo: { table: 'transactions', id: transaction.id },
    channels: { inApp: true, email: true }
  }).catch(err => logger.error('Webhook notification error:', err));

  logger.info(`Withdrawal successful: ${transaction.amount} for user ${transaction.user_id}`);
}

/**
 * Handle failed transfer — refund wallet atomically
 */
async function handleTransferFailed(data) {
  const { data: transaction } = await supabase
    .from('transactions')
    .select('*')
    .eq('provider->>reference', data.transfer_code)
    .neq('status', 'failed')
    .neq('status', 'reversed')
    .maybeSingle();

  if (!transaction) {
    logger.info(`Transfer failure ${data.transfer_code} already processed or not found`);
    return;
  }

  // Refund wallet balance using custom stored procedure
  const { error } = await supabase.rpc('refund_wallet_withdrawal', {
    p_tx_id: transaction.id,
    p_user_id: transaction.user_id,
    p_amount: parseFloat(transaction.amount),
    p_reason: data.reason || 'Transfer failed'
  });

  if (error) throw error;

  // Send notification
  await createNotification({
    user: transaction.user_id,
    type: 'transaction',
    title: 'Withdrawal Failed',
    message: `Your withdrawal of ₦${parseFloat(transaction.amount).toLocaleString()} failed. The amount has been refunded to your wallet.`,
    relatedTo: { table: 'transactions', id: transaction.id },
    channels: { inApp: true, email: true }
  }).catch(err => logger.error('Webhook notification error:', err));

  logger.info(`Withdrawal failed and refunded: ${transaction.amount} for user ${transaction.user_id}`);
}

/**
 * Handle reversed transfer — refund wallet atomically
 */
async function handleTransferReversed(data) {
  const { data: transaction } = await supabase
    .from('transactions')
    .select('*')
    .eq('provider->>reference', data.transfer_code)
    .neq('status', 'failed')
    .neq('status', 'reversed')
    .maybeSingle();

  if (!transaction) {
    logger.info(`Transfer reversal ${data.transfer_code} already processed or not found`);
    return;
  }

  // Refund wallet balance using custom stored procedure
  const { error } = await supabase.rpc('refund_wallet_withdrawal', {
    p_tx_id: transaction.id,
    p_user_id: transaction.user_id,
    p_amount: parseFloat(transaction.amount),
    p_reason: 'Transfer reversed'
  });

  if (error) throw error;

  // Send notification
  await createNotification({
    user: transaction.user_id,
    type: 'transaction',
    title: 'Withdrawal Reversed',
    message: `Your withdrawal of ₦${parseFloat(transaction.amount).toLocaleString()} was reversed. The amount has been refunded to your wallet.`,
    relatedTo: { table: 'transactions', id: transaction.id },
    channels: { inApp: true, email: true }
  }).catch(err => logger.error('Webhook notification error:', err));

  logger.info(`Withdrawal reversed: ${transaction.amount} for user ${transaction.user_id}`);
}

// @route   POST /api/v1/webhooks/flutterwave
// @desc    Handle Flutterwave webhooks
// @access  Public
router.post('/flutterwave', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['verif-hash'];
    if (!signature || signature !== FLUTTERWAVE_WEBHOOK_SECRET) {
      logger.warn('Flutterwave webhook signature verification failed');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;
    logger.info(`Flutterwave webhook received: ${event.event}`);

    if (event.event === 'transfer.completed') {
      const { reference, status, complete_status } = event.data;
      const isSuccess = (status === 'SUCCESSFUL' || complete_status === 'SUCCESSFUL');

      logger.info(`Flutterwave transfer webhook status for ${reference}: ${status} (success: ${isSuccess})`);

      if (isSuccess) {
        // Find transaction and mark completed
        const { data: transaction, error } = await supabase
          .from('transactions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('reference', reference)
          .neq('status', 'completed')
          .select()
          .maybeSingle();

        if (error) throw error;

        if (transaction) {
          await createNotification({
            user_id: transaction.user_id,
            type: 'transaction',
            title: 'Withdrawal Successful',
            message: `₦${parseFloat(transaction.amount).toLocaleString()} has been sent to your bank account`,
            related_to: { table: 'transactions', id: transaction.id },
            channels: { inApp: true, email: true }
          }).catch(err => logger.error('Webhook notification error:', err));
        }
      } else {
        // Transfer failed, trigger refund
        const { data: transaction } = await supabase
          .from('transactions')
          .select('*')
          .eq('reference', reference)
          .neq('status', 'failed')
          .neq('status', 'reversed')
          .maybeSingle();

        if (transaction) {
          // Refund wallet balance using stored procedure
          const { error: refundError } = await supabase.rpc('refund_wallet_withdrawal', {
            p_tx_id: transaction.id,
            p_user_id: transaction.user_id,
            p_amount: parseFloat(transaction.amount),
            p_reason: event.data.complete_status || 'Transfer failed'
          });

          if (refundError) throw refundError;

          await createNotification({
            user_id: transaction.user_id,
            type: 'transaction',
            title: 'Withdrawal Failed',
            message: `Your withdrawal of ₦${parseFloat(transaction.amount).toLocaleString()} failed. The amount has been refunded to your wallet.`,
            related_to: { table: 'transactions', id: transaction.id },
            channels: { inApp: true, email: true }
          }).catch(err => logger.error('Webhook notification error:', err));
        }
      }
    } else if (event.event === 'charge.completed' || (event.data && event.data.status === 'successful')) {
      const { tx_ref, amount, customer, id } = event.data;

      let userId = null;
      const { data: tx } = await supabase
        .from('transactions')
        .select('user_id')
        .eq('reference', tx_ref)
        .maybeSingle();

      if (tx) {
        userId = tx.user_id;
      } else {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('email', customer.email)
          .maybeSingle();

        if (user) {
          userId = user.id;
        }
      }

      if (!userId) {
        throw new Error(`User not found for Flutterwave charge: ${customer.email}`);
      }

      // Call atomic wallet deposit RPC
      const { data: result, error } = await supabase.rpc('execute_wallet_deposit', {
        p_user_id: userId,
        p_amount: parseFloat(amount),
        p_ref: tx_ref,
        p_provider_name: 'flutterwave',
        p_provider_ref: String(id),
        p_auth_code: null
      });

      if (error || !result?.success) {
        throw new Error(error ? error.message : 'execute_wallet_deposit RPC failed');
      }

      if (!result.already_processed) {
        // Send notification
        await createNotification({
          user: userId,
          type: 'transaction',
          title: 'Wallet Funded',
          message: `Your wallet has been credited with ₦${parseFloat(amount).toLocaleString()}`,
          relatedTo: { table: 'transactions', id: result.tx_id },
          channels: { inApp: true, email: true }
        }).catch(err => logger.error('Webhook notification error:', err));
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Flutterwave webhook error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

