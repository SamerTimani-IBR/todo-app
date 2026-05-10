import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[supabase] init', {
  url: url || '(missing)',
  keyPrefix: key ? key.slice(0, 12) + '…' : '(missing)'
});

if (!url || !key) {
  console.error(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing. ' +
    'Check .env.local and restart `npm run dev`.'
  );
}

export const supabase = createClient(url || 'https://invalid.local', key || 'invalid', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
