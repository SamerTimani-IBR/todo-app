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
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', userId)
    .single();
  if (error || !profile) return null;
  return {
    id: userId,
    email,
    name: profile.name || email,
    role: profile.role
  };
}

// ---------- Auth ----------

export async function signUp({ name, email, password }) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await withTimeout(
    supabase.auth.signUp({
      email: normalized,
      password,
      options: { data: { name: name.trim() } }
    }),
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

export async function login({ email, password, role }) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({ email: normalized, password }),
    15000,
    'login'
  );
  if (error) {
    // Surface the real Supabase error so we can debug slow / blocked logins.
    if (/email not confirmed/i.test(error.message)) {
      throw new Error(
        'This account exists but its email is not confirmed. ' +
        'In Supabase Dashboard → Authentication → Users, click the user → "Confirm user".'
      );
    }
    throw new Error(error.message || 'Invalid email or password.');
  }

  const session = await fetchSession(data.user.id, data.user.email);
  if (!session) {
    await supabase.auth.signOut();
    throw new Error('Account profile is missing.');
  }
  if (session.role !== role) {
    await supabase.auth.signOut();
    throw new Error('Invalid credentials for the selected role.');
  }
  return session;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return await fetchSession(session.user.id, session.user.email);
}

// ---------- Todos ----------

export async function getTodos(userId) {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(mapTodo);
}

export async function addTodo(userId, { title, note, imageFile }) {
  let imageUrl = null;
  if (imageFile) {
    const { publicUrl } = await uploadTodoImage(userId, imageFile);
    imageUrl = publicUrl;
  }

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
}

export async function updateTodo(id, updates) {
  const payload = {};
  if ('title' in updates) payload.title = updates.title;
  if ('note' in updates) payload.note = updates.note;
  if ('completed' in updates) payload.completed = updates.completed;

  // Image change: either upload a replacement or clear the field.
  // We need the old URL + user_id (for the storage folder) before we touch anything.
  const wantsImageChange = 'imageFile' in updates || updates.removeImage;
  let oldImageUrl = null;

  if (wantsImageChange) {
    const { data: existing, error: lookupErr } = await supabase
      .from('todos')
      .select('image_url, user_id')
      .eq('id', id)
      .single();
    if (lookupErr) throw new Error(lookupErr.message);
    oldImageUrl = existing?.image_url || null;

    if (updates.imageFile) {
      const { publicUrl } = await uploadTodoImage(existing.user_id, updates.imageFile);
      payload.image_url = publicUrl;
    } else if (updates.removeImage) {
      payload.image_url = null;
    }
  }

  const { data, error } = await supabase
    .from('todos')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Best-effort: delete the old file from storage when it was replaced or cleared.
  if (oldImageUrl && oldImageUrl !== data.image_url) {
    const path = pathFromPublicUrl(oldImageUrl);
    if (path) {
      supabase.storage.from(IMAGES_BUCKET).remove([path]).catch(() => {});
    }
  }

  return mapTodo(data);
}

export async function deleteTodo(id) {
  // Look up the row first so we know whether there's an image to clean up.
  const { data: existing } = await supabase
    .from('todos')
    .select('image_url')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) throw new Error(error.message);

  // Best-effort image cleanup. Don't fail the delete if storage cleanup errors.
  const path = pathFromPublicUrl(existing?.image_url);
  if (path) {
    supabase.storage.from(IMAGES_BUCKET).remove([path]).catch(() => {});
  }
}

// ---------- Word of the day ----------

export async function getWordOfDay() {
  const { data, error } = await supabase
    .from('word_of_day')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) return null;
  return mapWord(data);
}

export async function setWordOfDay(message, adminName) {
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
}

export async function clearWordOfDay() {
  const { error } = await supabase
    .from('word_of_day')
    .update({
      message: '',
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);
  if (error) throw new Error(error.message);
}
