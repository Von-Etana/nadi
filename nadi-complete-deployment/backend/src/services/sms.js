const axios = require('axios');
const logger = require('../utils/logger');

// Termii configuration (popular Nigerian SMS provider)
const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_BASE_URL = 'https://api.ng.termii.com/api';

// Send SMS via Termii
const sendTermiiSMS = async ({ to, message, sender = 'NadiDigital' }) => {
  try {
    const response = await axios.post(`${TERMII_BASE_URL}/sms/send`, {
      api_key: TERMII_API_KEY,
      to: to.replace('+', ''), // Remove + for Termii
      from: sender,
      sms: message,
      type: 'plain',
      channel: 'generic'
    });

    logger.info(`SMS sent to ${to}: ${response.data.message}`);
    return { success: true, data: response.data };
  } catch (error) {
    logger.error('Termii SMS error:', error);
    return { success: false, error: error.message };
  }
};

// Send SMS via Twilio (alternative)
const sendTwilioSMS = async ({ to, message }) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message
      }),
      {
        auth: {
          username: accountSid,
          password: authToken
        }
      }
    );

    logger.info(`SMS sent to ${to}: ${response.data.sid}`);
    return { success: true, data: response.data };
  } catch (error) {
    logger.error('Twilio SMS error:', error);
    return { success: false, error: error.message };
  }
};

// Main SMS function
const sendSMS = async ({ to, message, provider = 'termii' }) => {
  // Format phone number
  let formattedNumber = to;
  if (!to.startsWith('+')) {
    // Assume Nigerian number if no country code
    formattedNumber = `+234${to.replace(/^0/, '')}`;
  }

  switch (provider) {
    case 'termii':
      return sendTermiiSMS({ to: formattedNumber, message });
    case 'twilio':
      return sendTwilioSMS({ to: formattedNumber, message });
    default:
      return { success: false, error: 'Invalid SMS provider' };
  }
};

// Send OTP
const sendOTP = async ({ to, code, provider = 'termii' }) => {
  const message = `Your Nadi Digital Service verification code is: ${code}. Valid for 10 minutes.`;
  return sendSMS({ to, message, provider });
};

module.exports = { sendSMS, sendOTP };
