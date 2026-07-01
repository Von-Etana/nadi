const logger = require('./logger');

const requiredVars = {
  // Critical — server cannot function without these
  critical: [
    { key: 'SUPABASE_URL', description: 'Supabase Project URL' },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Supabase Service Role Key' },
    { key: 'SUPABASE_ANON_KEY', description: 'Supabase Anon Key' },
    { key: 'FLUTTERWAVE_SECRET_KEY', description: 'Flutterwave secret key for payments and transfers' },
    { key: 'FLUTTERWAVE_WEBHOOK_SECRET', description: 'Flutterwave webhook verification hash' }
  ],
  // Important — features will be degraded without these
  important: [
    { key: 'FRONTEND_URL', description: 'Frontend URL for CORS and email links' },
    { key: 'FLUTTERWAVE_PUBLIC_KEY', description: 'Flutterwave public key for payments' },
    { key: 'RESEND_API_KEY', description: 'Resend API key for emails' },
    { key: 'TERMII_API_KEY', description: 'Termii SMS API key for OTPs' },
    { key: 'WHAT3WORDS_API_KEY', description: 'what3words API key for address resolution' },
    { key: 'RELOADLY_API_KEY', description: 'Reloadly client secret (API Key) for bill payments' },
    { key: 'QUIDAX_API_KEY', description: 'Quidax API key for crypto features' }
  ],
  // Optional — nice to have
  optional: [
    { key: 'RELOADLY_CLIENT_ID', description: 'Reloadly client ID for OAuth2 token generation' }
  ]
};

function validateEnv() {
  const missing = { critical: [], important: [], optional: [] };

  for (const [level, vars] of Object.entries(requiredVars)) {
    for (const { key, description } of vars) {
      if (!process.env[key] || process.env[key].trim() === '') {
        missing[level].push({ key, description });
      }
    }
  }

  // Critical vars — crash if missing
  if (missing.critical.length > 0) {
    logger.error('🔴 FATAL: Missing critical environment variables:');
    missing.critical.forEach(({ key, description }) => {
      logger.error(`   ❌ ${key} — ${description}`);
    });
    logger.error('Server cannot start without these. Check your .env file.');
    process.exit(1);
  }

  // Important vars — warn loudly
  if (missing.important.length > 0) {
    logger.warn('🟠 WARNING: Missing important environment variables:');
    missing.important.forEach(({ key, description }) => {
      logger.warn(`   ⚠️  ${key} — ${description}`);
    });
    logger.warn('Some features will be degraded or unavailable.');
  }

  // Optional vars — info only
  if (missing.optional.length > 0) {
    logger.info('🔵 Optional environment variables not set:');
    missing.optional.forEach(({ key, description }) => {
      logger.info(`   ℹ️  ${key} — ${description}`);
    });
  }

  logger.info('✅ Environment validation complete');
}

module.exports = validateEnv;
