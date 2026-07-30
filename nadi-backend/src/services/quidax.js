const axios = require('axios');
const supabase = require('../utils/supabase');
const logger = require('../utils/logger');

class QuidaxService {
  constructor() {
    this.apiKey = process.env.QUIDAX_API_KEY;
    if (!this.apiKey) {
      logger.error('🔴 QUIDAX_API_KEY is missing from environment variables.');
    }
    
    this.client = axios.create({
      baseURL: process.env.QUIDAX_BASE_URL || 'https://openapi.quidax.io/exchange-open-api/api/v1',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  }

  ensureConfigured() {
    if (!this.apiKey) {
      throw new Error('QUIDAX_API_KEY is not configured');
    }
  }

  normalizeApiData(response) {
    return response?.data?.data ?? response?.data;
  }

  extractAddress(payload) {
    if (!payload) return null;
    if (typeof payload === 'string') return payload;
    if (Array.isArray(payload)) {
      const itemWithAddress = payload.find(item => this.extractAddress(item));
      return this.extractAddress(itemWithAddress);
    }

    return payload.address
      || payload.wallet_address
      || payload.fund_uid
      || payload.deposit_address
      || this.extractAddress(payload.addresses)
      || this.extractAddress(payload.payment_addresses)
      || null;
  }

  /**
   * Retrieves or dynamically registers a Quidax subuser for Nadi transaction isolation
   */
  async getOrCreateSubuser(userId, email, firstName, lastName) {
    try {
      this.ensureConfigured();

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
    this.ensureConfigured();

    const coin = currency.toLowerCase();

    try {
      const walletRes = await this.client.get(`/users/${quidaxUserId}/wallets/${coin}`);
      const wallet = this.normalizeApiData(walletRes);
      const walletAddress = this.extractAddress(wallet);
      if (walletAddress) {
        return {
          address: walletAddress,
          network: wallet?.network || wallet?.currency || coin,
          status: 'active',
          providerAddressId: wallet?.id || null,
          providerResponse: wallet,
          message: 'Wallet address ready'
        };
      }
    } catch (err) {
      logger.warn(`Failed to fetch wallet for sub-user ${quidaxUserId} on ${coin}: ${err.message}`);
    }

    try {
      const listRes = await this.client.get(`/users/${quidaxUserId}/wallets/${coin}/addresses`);
      const listed = this.normalizeApiData(listRes);
      const listedAddress = this.extractAddress(listed);
      if (listedAddress) {
        const firstAddress = Array.isArray(listed) ? listed.find(item => this.extractAddress(item)) : listed;
        return {
          address: listedAddress,
          network: firstAddress?.network || firstAddress?.currency || coin,
          status: 'active',
          providerAddressId: firstAddress?.id || null,
          providerResponse: firstAddress,
          message: 'Wallet address ready'
        };
      }
    } catch (err) {
      logger.warn(`Failed to list addresses for sub-user ${quidaxUserId} on ${coin}: ${err.message}`);
    }

    // Generate new deposit address
    logger.info(`Generating new ${coin} deposit address for sub-user ${quidaxUserId}`);
    const generateRes = await this.client.post(`/users/${quidaxUserId}/wallets/${coin}/addresses`);
    const generated = this.normalizeApiData(generateRes);
    const generatedAddress = this.extractAddress(generated);
    
    if (generateRes.data?.status === 'success' || generated) {
      return {
        address: generatedAddress,
        network: generated?.network || generated?.currency || coin,
        status: generatedAddress ? 'active' : 'pending',
        providerAddressId: generated?.id || null,
        providerResponse: generated,
        message: generatedAddress
          ? 'Wallet address generated successfully'
          : 'Wallet address generation has started. Please try again shortly.'
      };
    } else {
      throw new Error('Address generation failed on payment gateway');
    }
  }

  /**
   * Fetch live currency conversion rates for NGN trading pairs
   */
  async getLiveRates() {
    this.ensureConfigured();

    try {
      const res = await this.client.get('/markets/tickers');
      const tickers = this.normalizeApiData(res) || {};
      const getLast = (pair) => {
        const ticker = tickers[pair]?.ticker || tickers[pair];
        const value = ticker?.last || ticker?.price || ticker?.close || ticker?.sell || ticker?.buy;
        return Number(value);
      };

      const rates = {
        btc: getLast('btcngn'),
        eth: getLast('ethngn'),
        usdt: getLast('usdtngn')
      };

      if (!rates.btc || !rates.eth || !rates.usdt) {
        throw new Error('Quidax returned incomplete market rates');
      }

      return rates;
    } catch (err) {
      logger.error(`Quidax getLiveRates error: ${err.message}`);
      throw new Error(err.message || 'Failed to retrieve Quidax rates');
    }
  }

  /**
   * Request cryptocurrency payout to external address
   */
  async createWithdrawal(quidaxUserId, currency, amount, address) {
    try {
      this.ensureConfigured();

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
