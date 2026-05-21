/**
 * auth.js — Supabase-backed authentication (JUN-5).
 *
 * Replaces the localStorage stub. Public interface is identical:
 * signUp, signIn, signOut, currentUser, isAuthenticated, plus new resetPassword / updatePassword.
 *
 * signUp / signIn / signOut / resetPassword / updatePassword are async.
 * currentUser / isAuthenticated are synchronous — they read from a cached
 * session kept fresh via onAuthStateChange.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ztyvlgvxffssyamsibpf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0eXZsZ3Z4ZmZzc3lhbXNpYnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MzU0MTYsImV4cCI6MjA3ODIxMTQxNn0.7tNgomPNQMgkv90KmmpG3gfpeeUu1fKrJ5rkmvbLU-M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Cached user for synchronous reads. Populated on module load and kept
// current by the onAuthStateChange listener.
let _cachedUser = null;

// Bootstrap the cache from whatever session Supabase already restored from
// localStorage (fire-and-forget; module stays synchronously importable).
supabase.auth.getSession().then(({ data }) => {
  _cachedUser = data?.session?.user ? toPublicUser(data.session.user) : null;
});

supabase.auth.onAuthStateChange((_event, session) => {
  _cachedUser = session?.user ? toPublicUser(session.user) : null;
});

function toPublicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, createdAt: user.created_at };
}

/**
 * Register a new user with email + password.
 * @param {{email:string, password:string}} credentials
 * @returns {Promise<{id:string, email:string, createdAt:string}>}
 */
export async function signUp({ email, password } = {}) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Sign-up failed — please try again.');
  return toPublicUser(data.user);
}

/**
 * Sign in an existing user.
 * @param {{email:string, password:string}} credentials
 * @returns {Promise<{id:string, email:string, createdAt:string}>}
 */
export async function signIn({ email, password } = {}) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return toPublicUser(data.user);
}

/**
 * Sign out and clear the local session.
 * @returns {Promise<void>}
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/**
 * Send a password-reset email. The link redirects to #/reset-password.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function resetPassword(email) {
  const redirectTo = `${location.origin}${location.pathname}#/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

/**
 * Update the authenticated user's password (called after clicking the reset link).
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/**
 * The currently signed-in user, or null. Synchronous.
 * @returns {{id:string, email:string, createdAt:string}|null}
 */
export function currentUser() {
  return _cachedUser;
}

/**
 * Whether a user is currently signed in. Synchronous.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return _cachedUser !== null;
}
