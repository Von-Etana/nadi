const axios = require('axios');
const supabase = require('../utils/supabase');
const logger = require('../utils/logger');

class QuidaxService {
  constructor() {
    this.apiKey = process.env.VITE_QUIDAX_API_KEY;
    if (!this.apiKey) {
      logger.error('🔴 VITE_QUIDAX_API_KEY is missing from environment variables.');
    }
    
    this.client = axios.create({
      baseURL: 'https://api.quidax.com/v1',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  }

  /**
   * Retrieves or dynamically registers a Quidax subuser for Nadi transaction isolation
   */
  async getOrCreateSubuser(userId, email, firstName, lastName) {
    try {
      // 1. Fetch user from Nadi DB to check for existing quidaxUserId
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      let quidaxUserId = userProfile?.preferences?.quidaxUserId;
      if (quidaxUserId) {
        return quidaxUserId;
      }

      // 2. Call Quidax to create sub-user
      try {
        const createResponse = await this.client.post('/subusers', {
          email: email.toLowerCase(),
          first_name: firstName || 'Nadi',
          last_name: lastName || 'User'
        });
        
        if (createResponse.data?.status === 'success') {
          quidaxUserId = createResponse.data.data.id;
        }
      } catch (createError) {
        const status = createError.response?.status;
        const msg = createError.response?.data?.message || '';

        // If email is already taken / user exists in Quidax, fetch subusers list to locate ID
        if (status === 422 || msg.includes('taken') || msg.includes('exists')) {
          logger.info(`Sub-user already exists in Quidax for email: ${email}. Querying list...`);
          const listResponse = await this.client.get('/subusers');
          const matchingSubuser = (listResponse.data?.data || []).find(
            s => s.email.toLowerCase() === email.toLowerCase()
          );
          if (matchingSubuser) {
            quidaxUserId = matchingSubuser.id;
          }
        }
        
        if (!quidaxUserId) throw createError;
      }

      // 3. Save quidaxUserId to preferences in DB
      const preferences = userProfile?.preferences || {};
      preferences.quidaxUserId = quidaxUserId;

      await supabase
        .from('users')
        .update({ preferences })
        .eq('id', userId);

      logger.info(`Registered Quidax sub-user ID ${quidaxUserId} for Nadi User ${userId}`);
      return quidaxUserId;
    } catch (err) {
      logger.error(`getOrCreateSubuser error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Fetch deposit address for a specific currency
   */
  async getDepositAddress(quidaxUserId, currency) {
    const coin = currency.toLowerCase();
    try {
      // Try listing existing addresses
      const listRes = await this.client.get(`/users/${quidaxUserId}/wallets/${coin}/addresses`);
      if (listRes.data?.data && listRes.data.data.length > 0) {
        return listRes.data.data[0].address;
      }
    } catch (err) {
      logger.warn(`Failed to list addresses for sub-user ${quidaxUserId} on ${coin}: ${err.message}`);
    }

    // Generate new deposit address
    logger.info(`Generating new ${coin} deposit address for sub-user ${quidaxUserId}`);
    const generateRes = await this.client.post(`/users/${quidaxUserId}/wallets/${coin}/addresses`);
    
    if (generateRes.data?.status === 'success') {
      return generateRes.data.data.address;
    } else {
      throw new Error('Address generation failed on payment gateway');
    }
  }

  /**
   * Fetch live currency conversion rates for NGN trading pairs
   */
  async getLiveRates() {
    try {
      const res = await this.client.get('/markets/tickers');
      const tickers = res.data || {};
      
      return {
        btc: parseFloat(tickers.btcngn?.ticker?.last || 98500000),
        eth: parseFloat(tickers.ethngn?.ticker?.last || 5200000),
        usdt: parseFloat(tickers.usdtngn?.ticker?.last || 1550)
      };
    } catch (err) {
      logger.error(`Quidax getLiveRates error: ${err.message}. Falling back to default rates.`);
      return {
        btc: 98500000,
        eth: 5200000,
        usdt: 1550
      };
    }
  }

  /**
   * Request cryptocurrency payout to external address
   */
  async createWithdrawal(quidaxUserId, currency, amount, address) {
    try {
      const res = await this.client.post(`/users/${quidaxUserId}/withdraws`, {
        currency: currency.toLowerCase(),
        amount: amount,
        fund_uid: address,
        transaction_note: 'Nadi Crypto Withdrawal'
      });
      return res.data;
    } catch (err) {
      logger.error(`Quidax createWithdrawal error: ${err.response?.data || err.message}`);
      throw err;
    }
  }
}

module.exports = new QuidaxService();
