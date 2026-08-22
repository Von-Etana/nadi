const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const supabase = require('../utils/supabase');
const { createNotification } = require('../services/notification');
const logger = require('../utils/logger');

const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;
const QUIDAX_WEBHOOK_SECRET = process.env.QUIDAX_WEBHOOK_SECRET;

// -------------------------------------------------------------
// 1. FLUTTERWAVE WEBHOOK
// -------------------------------------------------------------
router.post('/flutterwave', async (req, res) => {
  try {
    const signature = req.headers['verif-hash'];
    if (FLUTTERWAVE_WEBHOOK_SECRET && (!signature || signature !== FLUTTERWAVE_WEBHOOK_SECRET)) {
      logger.warn('Flutterwave webhook signature verification failed');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;
    const eventId = req.headers['x-event-id'] || event.id || event.data?.id || event.data?.tx_ref;

    logger.info(`Flutterwave webhook received: ${event.event} (eventId: ${eventId})`);

    if (eventId) {
      const { data: existingKey } = await supabase
        .from('idempotency_keys')
        .select('id')
        .eq('event_id', String(eventId))
        .maybeSingle();

      if (existingKey) {
        logger.info(`Duplicate webhook event skipped: ${eventId}`);
        return res.status(200).json({ received: true, skipped: true, message: 'Already processed' });
      }
    }

    if (event.event === 'transfer.completed') {
      await handleTransferCompleted(event.data);
    } else if (event.event === 'charge.completed' || event.data?.status === 'successful') {
      await handleChargeCompleted(event.data, 'flutterwave');
    }

    if (eventId) {
      await supabase.from('idempotency_keys').insert({
        event_id: String(eventId),
        event_type: event.event || 'charge.completed',
        reference: event.data?.tx_ref || event.data?.reference || String(eventId),
        payload: event
      }).catch(err => logger.warn('Failed to record idempotency key:', err));
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Flutterwave webhook error:', error);
    res.status(500).json({ message: error.message });
  }
});

// -------------------------------------------------------------
// 2. PAYSTACK WEBHOOK
// -------------------------------------------------------------
router.post('/paystack', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (PAYSTACK_SECRET_KEY) {
      const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== signature) {
        logger.warn('Paystack webhook signature mismatch');
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    const event = req.body;
    const eventId = `paystack_${event.data?.id || event.data?.reference || Date.now()}`;

    logger.info(`Paystack webhook received: ${event.event} (${eventId})`);

    const { data: existingKey } = await supabase
      .from('idempotency_keys')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingKey) {
      logger.info(`Duplicate Paystack event skipped: ${eventId}`);
      return res.status(200).json({ received: true, skipped: true });
    }

    const data = event.data || {};

    if (event.event === 'charge.success') {
      const amountNaira = (data.amount || 0) / 100;
      await handleChargeCompleted({
        tx_ref: data.reference,
        amount: amountNaira,
        customer: data.customer,
        id: data.id
      }, 'paystack');
    } else if (event.event === 'transfer.success') {
      await handleTransferCompleted({
        reference: data.reference,
        status: 'SUCCESSFUL',
        complete_status: 'SUCCESSFUL'
      });
    } else if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      await handleTransferCompleted({
        reference: data.reference,
        status: 'FAILED',
        complete_status: data.reason || 'Transfer failed on Paystack'
      });
    }

    await supabase.from('idempotency_keys').insert({
      event_id: eventId,
      event_type: event.event,
      reference: data.reference || eventId,
      payload: event
    }).catch(err => logger.warn('Failed to save idempotency key:', err));

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Paystack webhook error:', error);
    res.status(500).json({ message: error.message });
  }
});

// -------------------------------------------------------------
// 3. MONNIFY WEBHOOK
// -------------------------------------------------------------
router.post('/monnify', async (req, res) => {
  try {
    const signature = req.headers['monnify-signature'];
    if (MONNIFY_SECRET_KEY && signature) {
      const computedHash = crypto.createHash('sha512')
        .update(MONNIFY_SECRET_KEY + '|' + JSON.stringify(req.body))
        .digest('hex');

      if (computedHash !== signature) {
        logger.warn('Monnify webhook signature mismatch');
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    const event = req.body;
    const eventType = event.eventType;
    const data = event.eventData || {};
    const eventId = `monnify_${data.transactionReference || data.paymentReference || Date.now()}`;

    logger.info(`Monnify webhook received: ${eventType} (${eventId})`);

    const { data: existingKey } = await supabase
      .from('idempotency_keys')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingKey) {
      return res.status(200).json({ received: true, skipped: true });
    }

    if (eventType === 'SUCCESSFUL_TRANSACTION') {
      await handleChargeCompleted({
        tx_ref: data.paymentReference || data.transactionReference,
        amount: parseFloat(data.amountPaid || data.amount || 0),
        customer: { email: data.customer?.email },
        id: data.transactionReference
      }, 'monnify');
    } else if (eventType === 'SUCCESSFUL_DISBURSEMENT') {
      await handleTransferCompleted({
        reference: data.reference,
        status: 'SUCCESSFUL',
        complete_status: 'SUCCESSFUL'
      });
    } else if (eventType === 'FAILED_DISBURSEMENT') {
      await handleTransferCompleted({
        reference: data.reference,
        status: 'FAILED',
        complete_status: data.comment || 'Disbursement failed on Monnify'
      });
    }

    await supabase.from('idempotency_keys').insert({
      event_id: eventId,
      event_type: eventType || 'collection',
      reference: data.paymentReference || eventId,
      payload: event
    }).catch(err => logger.warn('Failed to save idempotency key:', err));

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Monnify webhook error:', error);
    res.status(500).json({ message: error.message });
  }
});

// -------------------------------------------------------------
// 4. QUIDAX CRYPTO WEBHOOK
// -------------------------------------------------------------
router.post('/quidax', async (req, res) => {
  try {
    const signature = req.headers['quidax-signature'] || req.headers['x-quidax-signature'];
    if (QUIDAX_WEBHOOK_SECRET && signature) {
      const hash = crypto.createHmac('sha512', QUIDAX_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== signature) {
        logger.warn('Quidax webhook signature mismatch');
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    const event = req.body;
    const eventType = event.event;
    const data = event.data || {};
    const eventId = `quidax_${data.id || data.txid || Date.now()}`;

    logger.info(`Quidax crypto webhook received: ${eventType} (${eventId})`);

    if (eventType === 'deposit.confirmed' || eventType === 'deposit.successful') {
      const cryptoSymbol = (data.currency || 'btc').toLowerCase();
      const cryptoAmount = parseFloat(data.amount || 0);
      const recipientAddress = data.recipient?.address || data.address;

      const { data: userProfile } = await supabase
        .from('users')
        .select('id, email, first_name, preferences')
        .or(`preferences->cryptoAddresses->${cryptoSymbol}->>address.eq.${recipientAddress},id.eq.${data.user?.id || ''}`)
        .maybeSingle();

      if (userProfile && cryptoAmount > 0) {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', userProfile.id)
          .maybeSingle();

        if (wallet) {
          const currentCryptoBalances = wallet.crypto_balances || [];
          const existingIdx = currentCryptoBalances.findIndex(b => b.symbol.toLowerCase() === cryptoSymbol);
          let newBalances = [...currentCryptoBalances];

          if (existingIdx >= 0) {
            newBalances[existingIdx].balance = parseFloat(newBalances[existingIdx].balance || 0) + cryptoAmount;
          } else {
            newBalances.push({ symbol: cryptoSymbol, balance: cryptoAmount });
          }

          await supabase
            .from('wallets')
            .update({ crypto_balances: newBalances, updated_at: new Date().toISOString() })
            .eq('id', wallet.id);

          const ref = `CRY-DEP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          await supabase.from('transactions').insert({
            user_id: userProfile.id,
            category: 'crypto',
            type: 'crypto_deposit',
            amount: 0,
            status: 'completed',
            reference: ref,
            description: `Received ${cryptoAmount} ${cryptoSymbol.toUpperCase()} on blockchain`,
            metadata: { cryptoSymbol, cryptoAmount, txHash: data.txid || data.hash }
          });

          await createNotification({
            user: userProfile.id,
            type: 'transaction',
            title: 'Crypto Deposit Confirmed',
            message: `Your deposit of ${cryptoAmount} ${cryptoSymbol.toUpperCase()} has been confirmed and credited.`,
            channels: { inApp: true, email: true, sms: true }
          }).catch(err => logger.error('Notification error:', err));
        }
      }
    } else if (eventType === 'withdraw.confirmed' || eventType === 'withdraw.successful') {
      const providerRef = String(data.id);
      await supabase
        .from('transactions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('provider->>reference', providerRef)
        .neq('status', 'completed');
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Quidax webhook error:', error);
    res.status(500).json({ message: error.message });
  }
});

// -------------------------------------------------------------
// SHARED HANDLERS
// -------------------------------------------------------------
async function handleTransferCompleted(data) {
  const { reference, status, complete_status } = data;
  const isSuccess = status === 'SUCCESSFUL' || complete_status === 'SUCCESSFUL';

  logger.info(`Transfer webhook status for ${reference}: ${status} (success: ${isSuccess})`);

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
        user: transaction.user_id,
        type: 'transaction',
        title: 'Withdrawal Successful',
        message: `NGN ${parseFloat(transaction.amount).toLocaleString()} has been sent to your bank account`,
        relatedTo: { table: 'transactions', id: transaction.id },
        channels: { inApp: true, email: true, sms: true }
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
    p_reason: complete_status || 'Transfer failed'
  });

  if (refundError) throw refundError;

  await createNotification({
    user: transaction.user_id,
    type: 'transaction',
    title: 'Withdrawal Failed',
    message: `Your withdrawal of NGN ${parseFloat(transaction.amount).toLocaleString()} failed. The amount has been refunded to your wallet.`,
    relatedTo: { table: 'transactions', id: transaction.id },
    channels: { inApp: true, email: true, sms: true }
  }).catch(err => logger.error('Webhook notification error:', err));
}

async function handleChargeCompleted(data, providerName = 'flutterwave') {
  const { tx_ref, amount, customer, id } = data;

  let userId = null;
  const { data: tx } = await supabase
    .from('transactions')
    .select('user_id')
    .eq('reference', tx_ref)
    .maybeSingle();

  if (tx) {
    userId = tx.user_id;
  } else if (customer?.email) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', customer.email)
      .maybeSingle();

    if (user) userId = user.id;
  }

  if (!userId) {
    logger.warn(`User not found for charge: ${customer?.email || tx_ref}`);
    return;
  }

  const { data: result, error } = await supabase.rpc('execute_wallet_deposit', {
    p_user_id: userId,
    p_amount: parseFloat(amount),
    p_ref: tx_ref,
    p_provider_name: providerName,
    p_provider_ref: String(id || tx_ref),
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
      message: `Your wallet has been credited with NGN ${parseFloat(amount).toLocaleString()} via ${providerName.toUpperCase()}`,
      relatedTo: { table: 'transactions', id: result.tx_id },
      channels: { inApp: true, email: true, sms: true }
    }).catch(err => logger.error('Webhook notification error:', err));
  }
}

module.exports = router;
