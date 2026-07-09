import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

// Warn if Supabase credentials look invalid — auth will malfunction
if (SUPABASE_URL.includes('placeholder')) {
  console.error(
    '⚠️  VITE_SUPABASE_URL is a placeholder. Set a real Supabase project URL in your .env file.'
  );
}
if (!SUPABASE_ANON_KEY.startsWith('eyJ')) {
  console.warn(
    '⚠️  VITE_SUPABASE_ANON_KEY does not look like a valid Supabase anon key (expected JWT starting with "eyJ..."). ' +
    'Check your Supabase dashboard → Settings → API for the correct anon/public key.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
