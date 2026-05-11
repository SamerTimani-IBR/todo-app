import { createContext, useContext, useEffect, useState } from 'react';
import * as db from './db.js';
import { supabase } from './supabaseClient.js';

const AuthContext = createContext(null);

// We cache the resolved user object (id + name + role + email) in localStorage
// so a page refresh restores the dashboard instantly instead of waiting for a
// network round-trip to /profiles. Background verification still happens — if
// the role or name changed, the UI updates a moment later.
const USER_CACHE_KEY = 'todoapp.user';

function readCachedUser() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user) {
  if (user) {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_CACHE_KEY);
  }
}

// Background-verify timeout. Plenty of headroom for a free-tier cold start.
const VERIFY_TIMEOUT_MS = 10000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

export function AuthProvider({ children }) {
  // Hydrate from cache synchronously so the first render already knows whether
  // we're signed in. ProtectedRoute won't redirect to /login on refresh.
  const [user, setUser] = useState(() => readCachedUser());
  const [loading, setLoading] = useState(() => readCachedUser() === null);

  useEffect(() => {
    let mounted = true;
    console.log('[auth] bootstrapping (cache:', readCachedUser()?.email ?? 'empty', ')');

    // Background verification. We only flip to "signed out" if Supabase
    // explicitly says the session is gone — never on transient network errors.
    withTimeout(db.getCurrentUser(), VERIFY_TIMEOUT_MS, 'getCurrentUser')
      .then((u) => {
        if (!mounted) return;
        if (u) {
          console.log('[auth] verified:', u.email, '(' + u.role + ')');
          setUser(u);
          writeCachedUser(u);
        } else {
          // Supabase has no session — actually signed out.
          console.log('[auth] no session, clearing cache');
          setUser(null);
          writeCachedUser(null);
        }
      })
      .catch((err) => {
        // Network failed / timed out. Keep the cached user — they're still
        // logged in as far as Supabase knows; we just couldn't reach it now.
        console.warn('[auth] verify deferred:', err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      console.log('[auth] state change:', event);

      if (event === 'SIGNED_OUT') {
        if (mounted) {
          setUser(null);
          writeCachedUser(null);
        }
        return;
      }

      // The bootstrap useEffect already fetches the profile on mount, and
      // login()/signUp() set the user directly. INITIAL_SESSION and SIGNED_IN
      // would otherwise trigger a duplicate /profiles round-trip in the same
      // tick. db.getCurrentUser() dedupes concurrent calls internally, but we
      // skip here entirely to avoid even the extra await.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') return;

      // For TOKEN_REFRESHED / USER_UPDATED, refresh the profile.
      try {
        const u = await withTimeout(db.getCurrentUser(), VERIFY_TIMEOUT_MS, 'getCurrentUser (event)');
        if (!mounted) return;
        if (u) {
          setUser(u);
          writeCachedUser(u);
        }
      } catch (err) {
        console.warn('[auth] event refresh failed:', err.message);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    loading,
    signUp: async (data) => {
      const session = await db.signUp(data);
      setUser(session);
      writeCachedUser(session);
      return session;
    },
    login: async (data) => {
      const session = await db.login(data);
      setUser(session);
      writeCachedUser(session);
      return session;
    },
    logout: async () => {
      await db.logout();
      setUser(null);
      writeCachedUser(null);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
