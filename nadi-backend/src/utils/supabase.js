const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('🔴 SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.');
  process.exit(1);
}

// Service role client bypasses RLS, used securely in backend
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

logger.info('✅ Supabase Client initialized successfully');

module.exports = supabase;
