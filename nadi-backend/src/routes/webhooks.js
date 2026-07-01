const express = require('express');
const router = express.Router();

const supabase = require('../utils/supabase');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

// @route   POST /api/v1/webhooks/flutterwave
// @desc    Handle Flutterwave webhooks
// @access  Public, verified with Flutterwave verif-hash header
router.post('/flutterwave', async (req, res) => {
  try {
    const signature = req.headers['verif-hash'];
    if (!signature || signature !== FLUTTERWAVE_WEBHOOK_SECRET) {
      logger.warn('Flutterwave webhook signature verification failed');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;
    logger.info(`Flutterwave webhook received: ${event.event}`);

    if (event.event === 'transfer.completed') {
      await handleTransferCompleted(event.data);
    } else if (event.event === 'charge.completed' || event.data?.status === 'successful') {
      await handleChargeCompleted(event.data);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Flutterwave webhook error:', error);
    res.status(500).json({ message: error.message });
  }
});

async function handleTransferCompleted(data) {
  const { reference, status, complete_status } = data;
  const isSuccess = status === 'SUCCESSFUL' || complete_status === 'SUCCESSFUL';

  logger.info(`Flutterwave transfer webhook status for ${reference}: ${status} (success: ${isSuccess})`);

  if (isSuccess) {
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
        message: `NGN ${parseFloat(transaction.amount).toLocaleString()} has been sent to your bank account`,
        related_to: { table: 'transactions', id: transaction.id },
        channels: { inApp: true, email: true }
      }).catch(err => logger.error('Webhook notification error:', err));
    }

    return;
  }

  const { data: transaction } = await supabase
    .from('transactions')
    .select('*')
    .eq('reference', reference)
    .neq('status', 'failed')
    .neq('status', 'reversed')
    .maybeSingle();

  if (!transaction) return;

  const { error: refundError } = await supabase.rpc('refund_wallet_withdrawal', {
    p_tx_id: transaction.id,
    p_user_id: transaction.user_id,
    p_amount: parseFloat(transaction.amount),
    p_reason: data.complete_status || 'Transfer failed'
  });

  if (refundError) throw refundError;

  await createNotification({
    user_id: transaction.user_id,
    type: 'transaction',
    title: 'Withdrawal Failed',
    message: `Your withdrawal of NGN ${parseFloat(transaction.amount).toLocaleString()} failed. The amount has been refunded to your wallet.`,
    related_to: { table: 'transactions', id: transaction.id },
    channels: { inApp: true, email: true }
  }).catch(err => logger.error('Webhook notification error:', err));
}

async function handleChargeCompleted(data) {
  const { tx_ref, amount, customer, id } = data;

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

    if (user) userId = user.id;
  }

  if (!userId) {
    throw new Error(`User not found for Flutterwave charge: ${customer.email}`);
  }

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
    await createNotification({
      user: userId,
      type: 'transaction',
      title: 'Wallet Funded',
      message: `Your wallet has been credited with NGN ${parseFloat(amount).toLocaleString()}`,
      relatedTo: { table: 'transactions', id: result.tx_id },
      channels: { inApp: true, email: true }
    }).catch(err => logger.error('Webhook notification error:', err));
  }
}

module.exports = router;
