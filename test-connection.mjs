// Quick connection test using plain fetch (avoids the SDK's WebSocket requirement on Node 20).
// Run with: node test-connection.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('='))
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

console.log('URL:', url);
console.log('Key:', key ? key.slice(0, 25) + '...' : '(missing)');

if (!url || !key) {
  console.error('Missing env vars in .env.local');
  process.exit(1);
}

console.log('\nProbing public.word_of_day…');

const res = await fetch(`${url}/rest/v1/word_of_day?select=*&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
});

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = text; }

if (res.ok) {
  console.log('Connection OK. Rows in word_of_day:', body);
  process.exit(0);
}

if (body && (body.code === '42P01' || /does not exist/i.test(body.message || ''))) {
  console.log('Connection OK — auth + URL valid.');
  console.log('   But the tables do NOT exist yet. Next: run supabase/schema.sql in the SQL Editor.');
  process.exit(0);
}

if (res.status === 401 || /JWT|api key/i.test(body.message || '')) {
  console.error('Auth failed. Check the anon key.');
  console.error(body);
  process.exit(1);
}

console.error(`HTTP ${res.status}:`, body);
process.exit(1);
