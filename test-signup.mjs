// Direct signup test bypassing the SDK.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('='))
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

const testEmail = `cli-test-${Date.now()}@example.com`;
console.log('Hitting /auth/v1/signup with', testEmail);

const start = Date.now();
const res = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: testEmail,
    password: 'Test12345',
    data: { name: 'CLI Test' }
  })
});
const elapsed = Date.now() - start;
const body = await res.json();

console.log(`\nHTTP ${res.status} in ${elapsed}ms`);
console.log(JSON.stringify(body, null, 2));
