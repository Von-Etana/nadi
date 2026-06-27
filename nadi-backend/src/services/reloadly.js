const axios = require('axios');
const logger = require('../utils/logger');

const CLIENT_ID = process.env.RELOADLY_CLIENT_ID;
const CLIENT_SECRET = process.env.RELOADLY_API_KEY; // The provided key
const IS_SANDBOX = process.env.RELOADLY_SANDBOX !== 'false'; // Default to sandbox/test

const TOPUPS_AUDIENCE = IS_SANDBOX ? 'https://topups-sandbox.reloadly.com' : 'https://topups.reloadly.com';
const UTILITIES_AUDIENCE = IS_SANDBOX ? 'https://utilities-sandbox.reloadly.com' : 'https://utilities.reloadly.com';
const AUTH_URL = 'https://auth.reloadly.com/oauth/token';

let tokenCache = {
  topups: null,
  utilities: null,
  topupsExpiry: null,
  utilitiesExpiry: null
};

// Obtain OAuth2 token from Reloadly
async function getAccessToken(audienceType) {
  const now = Date.now();
  if (audienceType === 'topups' && tokenCache.topups && tokenCache.topupsExpiry > now) {
    return tokenCache.topups;
  }
  if (audienceType === 'utilities' && tokenCache.utilities && tokenCache.utilitiesExpiry > now) {
    return tokenCache.utilities;
  }

  const audience = audienceType === 'topups' ? TOPUPS_AUDIENCE : UTILITIES_AUDIENCE;

  // If no Client ID is configured, fallback to using Client Secret (API Key) directly
  if (!CLIENT_ID) {
    logger.warn(`RELOADLY_CLIENT_ID not found, using Client Secret directly as bearer token for ${audienceType}`);
    return CLIENT_SECRET;
  }

  try {
    const response = await axios.post(AUTH_URL, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience: audience
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const token = response.data.access_token;
    const expiresIn = response.data.expires_in || 86400; // default 24h

    if (audienceType === 'topups') {
      tokenCache.topups = token;
      tokenCache.topupsExpiry = now + (expiresIn - 60) * 1000; // buffer of 1 minute
    } else {
      tokenCache.utilities = token;
      tokenCache.utilitiesExpiry = now + (expiresIn - 60) * 1000;
    }

    return token;
  } catch (error) {
    logger.error(`Failed to retrieve Reloadly access token for ${audienceType}:`, error.response?.data || error.message);
    throw new Error('Reloadly authentication failed');
  }
}

// Reloadly Topup APIs (Airtime/Data)
async function sendTopup({ operatorId, amount, phoneNumber, customIdentifier }) {
  try {
    const token = await getAccessToken('topups');
    const response = await axios.post(`${TOPUPS_AUDIENCE}/topups`, {
      operatorId,
      amount,
      useLocalAmount: true,
      recipientPhone: {
        countryCode: 'NG',
        number: phoneNumber.replace('+234', '').replace(/^0/, '') // Local phone without country code prefix
      },
      customIdentifier
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/com.reloadly.topups-v1+json'
      }
    });
    return response.data;
  } catch (error) {
    logger.error('Reloadly Topup Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Topup processing failed');
  }
}

// Get Reloadly Operators for topups/data
async function getOperators(countryCode = 'NG') {
  try {
    const token = await getAccessToken('topups');
    const response = await axios.get(`${TOPUPS_AUDIENCE}/operators/countries/${countryCode}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/com.reloadly.topups-v1+json'
      }
    });
    return response.data;
  } catch (error) {
    logger.error('Reloadly Get Operators Error:', error.response?.data || error.message);
    throw new Error('Failed to retrieve mobile operators');
  }
}

// Reloadly Utilities APIs (Electricity/Cable/Water)
async function getBillers(countryCode = 'NG') {
  try {
    const token = await getAccessToken('utilities');
    const response = await axios.get(`${UTILITIES_AUDIENCE}/billers?countryCode=${countryCode}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/com.reloadly.utilities-v1+json'
      }
    });
    return response.data.content || response.data;
  } catch (error) {
    logger.error('Reloadly Get Billers Error:', error.response?.data || error.message);
    throw new Error('Failed to retrieve utility billers');
  }
}

async function validateBillerAccount({ billerId, accountNumber }) {
  try {
    const token = await getAccessToken('utilities');
    const response = await axios.post(`${UTILITIES_AUDIENCE}/billers/validate`, {
      billerId,
      subscriberAccountNumber: accountNumber
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/com.reloadly.utilities-v1+json'
      }
    });
    return response.data;
  } catch (error) {
    logger.error('Reloadly Account Validation Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Verification failed');
  }
}

async function payBill({ billerId, amount, accountNumber, referenceId }) {
  try {
    const token = await getAccessToken('utilities');
    const response = await axios.post(`${UTILITIES_AUDIENCE}/transactions`, {
      subscriberAccountNumber: accountNumber,
      billerId,
      amount,
      useLocalAmount: true,
      referenceId
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/com.reloadly.utilities-v1+json'
      }
    });
    return response.data;
  } catch (error) {
    logger.error('Reloadly Bill Payment Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Bill payment failed');
  }
}

async function getOperatorById(operatorId) {
  try {
    const token = await getAccessToken('topups');
    const response = await axios.get(`${TOPUPS_AUDIENCE}/operators/${operatorId}`, {
      params: {
        suggestedAmountsMap: true,
        includeRange: true,
        includeData: true,
        includePin: true,
        includeBundles: true
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/com.reloadly.topups-v1+json'
      }
    });
    return response.data;
  } catch (error) {
    logger.error(`Reloadly Get Operator By ID ${operatorId} Error:`, error.response?.data || error.message);
    throw new Error('Failed to retrieve operator details');
  }
}

module.exports = {
  sendTopup,
  getOperators,
  getBillers,
  validateBillerAccount,
  payBill,
  getOperatorById
};
