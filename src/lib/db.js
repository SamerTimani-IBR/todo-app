// Data layer — Supabase backed.
// Every function returns a Promise. Components and AuthContext await these.

import { supabase } from './supabaseClient.js';

// Wrap any promise so it rejects after `ms` if it hasn't settled.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

// ---------- timing ----------
// Lightweight wrapper so we can see exactly which Supabase calls are slow
// in the browser console. Open DevTools → Console and look for "[db] …" rows.
async function timed(label, work) {
  const t0 = performance.now();
  try {
    const result = await work();
    const ms = Math.round(performance.now() - t0);
    if (ms > 1500) console.warn(`[db] ${label} took ${ms}ms (slow)`);
    else console.log(`[db] ${label} ${ms}ms`);
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    console.warn(`[db] ${label} FAILED in ${ms}ms:`, err?.message);
    throw err;
  }
}

// ---------- local cache (stale-while-revalidate) ----------
const TODOS_CACHE_PREFIX = 'todoapp.cache.todos.';
const WORD_CACHE_KEY = 'todoapp.cache.word';

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Sync read — returns cached todos for this user, or null. Safe in useState init. */
export function getCachedTodos(userId) {
  return readCache(TODOS_CACHE_PREFIX + userId);
}
/** Sync read — returns cached word, or null. Safe in useState init. */
export function getCachedWordOfDay() {
  return readCache(WORD_CACHE_KEY);
}

// ---------- helpers ----------

function mapTodo(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    note: row.note || '',
    completed: row.completed,
    imageUrl: row.image_url || null,
    createdAt: new Date(row.created_at).getTime()
  };
}

const IMAGES_BUCKET = 'todo-images';

async function uploadTodoImage(userId, file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
  if (error) throw new Error('Image upload failed: ' + error.message);
  const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

function pathFromPublicUrl(publicUrl) {
  if (!publicUrl) return null;
  const marker = `/${IMAGES_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
}

function mapWord(row) {
  if (!row || !row.message) return null;
  return {
    message: row.message,
    updatedAt: new Date(row.updated_at).getTime(),
    updatedBy: row.updated_by
  };
}

async function fetchSession(userId, email) {
  return timed('fetchProfile', async () => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('name, role, tokens')
      .eq('id', userId)
      .single();
    if (error || !profile) return null;
    return {
      id: userId,
      email,
      name: profile.name || email,
      role: profile.role,
      tokens: profile.tokens ?? 0
    };
  });
}

// ---------- Auth ----------

export async function signUp({ name, email, password }) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await withTimeout(
    timed('auth.signUp', () =>
      supabase.auth.signUp({
        email: normalized,
        password,
        options: { data: { name: name.trim() } }
      })
    ),
    15000,
    'signUp'
  );
  if (error) throw new Error(error.message);
  if (!data.session) {
    throw new Error(
      'Signup succeeded but no session was returned. ' +
      'Make sure "Confirm email" is disabled in Supabase Auth → Providers → Email.'
    );
  }
  return await fetchSession(data.user.id, data.user.email);
}

export async function login({ email, password }) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await withTimeout(
    timed('auth.signIn', () =>
      supabase.auth.signInWithPassword({ email: normalized, password })
    ),
    15000,
    'login'
  );
  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      throw new Error(
        'This account exists but its email is not confirmed. ' +
        'In Supabase Dashboard → Authentication → Users, click the user → "Confirm user".'
      );
    }
    throw new Error(error.message || 'Invalid email or password.');
  }

  // Role comes from the database — callers route to /admin or /user based on
  // session.role, no client-side pre-selection needed.
  const session = await fetchSession(data.user.id, data.user.email);
  if (!session) {
    await supabase.auth.signOut();
    throw new Error('Account profile is missing.');
  }
  return session;
}

export async function logout() {
  await supabase.auth.signOut();
}

// Dedupe concurrent getCurrentUser calls. AuthContext can fire from the
// bootstrap useEffect AND from onAuthStateChange's INITIAL_SESSION event in
// the same tick; without this, we'd hit /profiles twice for no reason.
let inFlightCurrentUser = null;
export function getCurrentUser() {
  if (inFlightCurrentUser) return inFlightCurrentUser;
  inFlightCurrentUser = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return await fetchSession(session.user.id, session.user.email);
  })().finally(() => {
    inFlightCurrentUser = null;
  });
  return inFlightCurrentUser;
}

// ---------- Todos ----------

export async function getTodos(userId) {
  const todos = await timed('getTodos', async () => {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(mapTodo);
  });
  writeCache(TODOS_CACHE_PREFIX + userId, todos);
  return todos;
}

export async function addTodo(userId, { title, note, imageFile }) {
  let imageUrl = null;
  if (imageFile) {
    const { publicUrl } = await timed('uploadImage', () =>
      uploadTodoImage(userId, imageFile)
    );
    imageUrl = publicUrl;
  }

  const created = await timed('addTodo', async () => {
    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: userId,
        title: title.trim(),
        note: (note || '').trim(),
        image_url: imageUrl
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapTodo(data);
  });

  // Keep the cache in sync so the next page load sees the new row.
  const cached = readCache(TODOS_CACHE_PREFIX + userId) || [];
  writeCache(TODOS_CACHE_PREFIX + userId, [created, ...cached]);

  return created;
}

export async function updateTodo(id, updates) {
  const payload = {};
  if ('title' in updates) payload.title = updates.title;
  if ('note' in updates) payload.note = updates.note;
  if ('completed' in updates) payload.completed = updates.completed;

  const wantsImageChange = 'imageFile' in updates || updates.removeImage;
  let oldImageUrl = null;
  let userIdForCache = null;

  if (wantsImageChange) {
    const { data: existing, error: lookupErr } = await supabase
      .from('todos')
      .select('image_url, user_id')
      .eq('id', id)
      .single();
    if (lookupErr) throw new Error(lookupErr.message);
    oldImageUrl = existing?.image_url || null;
    userIdForCache = existing?.user_id || null;

    if (updates.imageFile) {
      const { publicUrl } = await timed('uploadImage', () =>
        uploadTodoImage(existing.user_id, updates.imageFile)
      );
      payload.image_url = publicUrl;
    } else if (updates.removeImage) {
      payload.image_url = null;
    }
  }

  const updated = await timed('updateTodo', async () => {
    const { data, error } = await supabase
      .from('todos')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapTodo(data);
  });

  if (oldImageUrl && oldImageUrl !== updated.imageUrl) {
    const path = pathFromPublicUrl(oldImageUrl);
    if (path) {
      supabase.storage.from(IMAGES_BUCKET).remove([path]).catch(() => {});
    }
  }

  // Update cache in place.
  const uid = userIdForCache || updated.userId;
  const cached = readCache(TODOS_CACHE_PREFIX + uid);
  if (cached) {
    writeCache(
      TODOS_CACHE_PREFIX + uid,
      cached.map((t) => (t.id === updated.id ? updated : t))
    );
  }

  return updated;
}

export async function deleteTodo(id) {
  const { data: existing } = await supabase
    .from('todos')
    .select('image_url, user_id')
    .eq('id', id)
    .maybeSingle();

  await timed('deleteTodo', async () => {
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) throw new Error(error.message);
  });

  const path = pathFromPublicUrl(existing?.image_url);
  if (path) {
    supabase.storage.from(IMAGES_BUCKET).remove([path]).catch(() => {});
  }

  // Remove from cache.
  if (existing?.user_id) {
    const cached = readCache(TODOS_CACHE_PREFIX + existing.user_id);
    if (cached) {
      writeCache(
        TODOS_CACHE_PREFIX + existing.user_id,
        cached.filter((t) => t.id !== id)
      );
    }
  }
}

// ---------- Word of the day ----------

export async function getWordOfDay() {
  const word = await timed('getWord', async () => {
    const { data, error } = await supabase
      .from('word_of_day')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) return null;
    return mapWord(data);
  });
  writeCache(WORD_CACHE_KEY, word);
  return word;
}

export async function setWordOfDay(message, adminName) {
  const entry = await timed('setWord', async () => {
    const { data, error } = await supabase
      .from('word_of_day')
      .update({
        message: message.trim(),
        updated_by: adminName || 'Admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapWord(data);
  });
  writeCache(WORD_CACHE_KEY, entry);
  return entry;
}

export async function clearWordOfDay() {
  await timed('clearWord', async () => {
    const { error } = await supabase
      .from('word_of_day')
      .update({
        message: '',
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);
    if (error) throw new Error(error.message);
  });
  writeCache(WORD_CACHE_KEY, null);
}

// ---------- Tokens & Transactions ----------

/** Returns the current user's token balance from the profiles table. */
export async function getMyTokens() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return 0;
  return timed('getMyTokens', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('tokens')
      .eq('id', session.user.id)
      .single();
    if (error) return 0;
    return data?.tokens ?? 0;
  });
}

/**
 * Atomically decrement the caller's token balance by 1. Throws if the
 * balance is already zero. Returns the new balance.
 */
export async function consumeToken() {
  return timed('consumeToken', async () => {
    const { data, error } = await supabase.rpc('consume_token');
    if (error) {
      if (/INSUFFICIENT_TOKENS/i.test(error.message)) {
        throw new Error("You're out of tokens — buy more to keep adding to-dos.");
      }
      throw new Error(error.message);
    }
    return data;
  });
}

/**
 * Maps Tap's terse failure codes/messages into friendly user-facing text.
 * The raw code/reason still gets logged to the console for debugging.
 */
function friendlyPaymentError(status, reason) {
  const s = String(status || '').toUpperCase();
  const r = String(reason || '').toUpperCase();
  if (s === 'DECLINED' || r.includes('DECLINED')) {
    return 'Your card was declined. Please try another card.';
  }
  if (s === 'EXPIRED_CARD' || r.includes('EXPIRED')) {
    return 'This card has expired. Please use a different one.';
  }
  if (s === 'TIMED_OUT' || r.includes('TIMEOUT') || r.includes('TIMED')) {
    return 'The payment timed out. Please check your connection and try again.';
  }
  if (s === 'INSUFFICIENT_FUNDS' || r.includes('INSUFFICIENT')) {
    return 'Your card doesn\'t have enough funds for this purchase.';
  }
  if (s === 'INVALID_PIN' || r.includes('PIN')) {
    return 'PIN was rejected by your bank. Please try again or use another card.';
  }
  if (s === 'LIMIT_EXCEEDED' || r.includes('LIMIT')) {
    return 'This card has reached its spending limit.';
  }
  if (s === 'REFER_TO_ISSUER' || r.includes('ISSUER')) {
    return 'Your bank asked us to refer this transaction to them. Please contact your bank or try a different card.';
  }
  if (s === 'CREDIT_FAILED') {
    return 'Payment was successful, but we couldn\'t add the tokens to your account. Please contact support.';
  }
  if (
    s === 'ACQUIRER_SYSTEM_ERROR' ||
    s === 'UNSPECIFIED_FAILURE' ||
    s === 'UNKNOWN' ||
    s === 'FAILED'
  ) {
    return 'Something went wrong with this payment. Please try again in a moment.';
  }
  return 'Payment couldn\'t be completed. Please try again.';
}

const PENDING_PURCHASE_KEY = 'todoapp.pending_purchase';

async function callChargeFunction(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('Your session has expired. Please log in again.');
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-charge`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('[purchase] network/fetch failed:', err);
    throw new Error(
      'We couldn\'t reach the payment service. Please check your connection and try again.'
    );
  }
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[purchase] HTTP', res.status, result);
    throw new Error(
      friendlyPaymentError(result.status, result.error || result.reason)
    );
  }
  return result;
}

/**
 * Server-verified purchase. Sends the Tap token to our Supabase Edge Function
 * which charges the card via Tap's Charges API (3DS-enabled).
 *
 * Three outcomes:
 *  1. CAPTURED immediately  → returns new balance.
 *  2. INITIATED (3DS needed) → stashes pending purchase in localStorage and
 *     redirects to Tap's 3DS challenge page. After the user completes the
 *     challenge, Tap redirects back to our app; UserDashboard then calls
 *     completePendingPurchase() to verify the charge and credit tokens.
 *     This function never returns in that case (the page navigates away).
 *  3. Anything else → throws with a user-friendly message.
 */
export async function purchaseTokens({ tokens, amount, currency, referenceId }) {
  return timed('purchaseTokens', async () => {
    if (!referenceId || !referenceId.startsWith('tok_')) {
      console.warn('[purchase] missing or invalid token:', referenceId);
      throw new Error(
        'Card details didn\'t go through. Please try entering them again.'
      );
    }

    const returnUrl = window.location.origin + '/user';

    const result = await callChargeFunction({
      token: referenceId,
      amount,
      currency,
      tokens,
      return_url: returnUrl
    });

    if (result.status === 'CAPTURED') {
      return result.newBalance;
    }

    if (result.status === 'INITIATED' && result.redirectUrl) {
      // Stash the purchase data so we can verify on return.
      localStorage.setItem(
        PENDING_PURCHASE_KEY,
        JSON.stringify({
          tokens,
          amount,
          currency,
          chargeId: result.chargeId,
          startedAt: Date.now()
        })
      );
      // Hand off to Tap's 3DS challenge page. Never returns.
      window.location.href = result.redirectUrl;
      // Tell caller the page is navigating away — they should keep the
      // modal in a "Processing…" state until unmount.
      return { redirecting: true };
    }

    console.error('[purchase] non-CAPTURED:', result.status, result.reason);
    throw new Error(friendlyPaymentError(result.status, result.reason));
  });
}

/**
 * If the user is returning from a 3DS challenge there'll be a pending
 * purchase in localStorage plus a `tap_id` query param on the URL.
 * Verify the charge with our backend and, if CAPTURED, credit tokens.
 * Returns { ok, newBalance, tokens } on success or throws on failure.
 * Returns null if there's nothing to complete.
 */
export async function completePendingPurchase(chargeIdFromUrl) {
  const raw = localStorage.getItem(PENDING_PURCHASE_KEY);
  if (!raw) return null;

  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    localStorage.removeItem(PENDING_PURCHASE_KEY);
    return null;
  }

  // Always clear the stash so we don't loop on errors.
  localStorage.removeItem(PENDING_PURCHASE_KEY);

  // Prefer the charge id from the URL (proves Tap redirected us) but fall
  // back to the stashed one if Tap omitted the param.
  const chargeId = chargeIdFromUrl || pending.chargeId;
  if (!chargeId) return null;

  const result = await callChargeFunction({
    verify_charge_id: chargeId,
    tokens: pending.tokens,
    amount: pending.amount,
    currency: pending.currency
  });

  if (result.status === 'CAPTURED') {
    return { ok: true, newBalance: result.newBalance, tokens: pending.tokens };
  }
  throw new Error(friendlyPaymentError(result.status, result.reason));
}

/** Admin only — list every transaction across all users. */
export async function getAllTransactions({ limit = 200 } = {}) {
  return timed('getAllTransactions', async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map(mapTransaction);
  });
}

/** Current user — list their own transactions. */
export async function getMyTransactions({ limit = 100 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];
  return timed('getMyTransactions', async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map(mapTransaction);
  });
}

function mapTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username || '',
    status: row.status,
    amount: Number(row.amount),
    currency: row.currency,
    tokensAdded: row.tokens_added,
    referenceId: row.reference_id || '',
    createdAt: new Date(row.created_at).getTime()
  };
}

// ---------- Admin dashboards ----------

/** Admin only — aggregate stats for the dashboard header. */
export async function getAdminStats() {
  return timed('getAdminStats', async () => {
    const { data, error } = await supabase.rpc('admin_get_stats');
    if (error) throw new Error(error.message);
    return {
      userCount: Number(data?.user_count ?? 0),
      todoCount: Number(data?.todo_count ?? 0),
      completedTodoCount: Number(data?.completed_todo_count ?? 0),
      tokensInCirculation: Number(data?.tokens_in_circulation ?? 0),
      transactionsToday: Number(data?.transactions_today ?? 0),
      revenueToday: Number(data?.revenue_today ?? 0),
      revenueTotal: Number(data?.revenue_total ?? 0)
    };
  });
}

/** Admin only — full users list joined with their email + activity. */
export async function getAllUsers() {
  return timed('getAllUsers', async () => {
    const { data, error } = await supabase.rpc('admin_get_users');
    if (error) throw new Error(error.message);
    return (data || []).map((row) => ({
      id: row.id,
      email: row.email || '',
      name: row.name || '',
      role: row.role,
      tokens: Number(row.tokens ?? 0),
      createdAt: new Date(row.created_at).getTime(),
      todosCount: Number(row.todos_count ?? 0),
      totalSpent: Number(row.total_spent ?? 0)
    }));
  });
}
