/**
 * auth.js — authentication adapter.
 *
 * Public interface — STABLE; store.js and every view depend only on this:
 *   signUp / signIn / signOut          async → resolve to {id,email,createdAt}
 *   resetPassword / updatePassword     async
 *   currentUser / isAuthenticated      sync  → read a cached session snapshot
 *
 * Backed by Supabase Auth. The Supabase client is INJECTED via configureAuth()
 * rather than constructed here, for two reasons:
 *
 *   1. This module then imports cleanly under `node --test` — no CDN ESM URL
 *      in the static graph, no network at import time.
 *   2. The test suite injects an in-memory fake implementing the same
 *      `supabase.auth.*` surface, so the suite exercises THIS real adapter
 *      (error mapping, the synchronous session cache, onAuthStateChange
 *      wiring) offline and deterministically — not a parallel stub module.
 *
 * The browser wires the real client in app.js (see src/js/supabaseClient.js).
 */

// The injected Supabase-compatible client (real client or test fake).
let _client = null;

// Synchronous snapshot of the signed-in user. Kept fresh by onAuthStateChange
// and by the async calls below — this is what currentUser()/isAuthenticated()
// read, so callers never have to await just to ask "who is signed in?".
let _cachedUser = null;

// Resolves once the persisted session (if any) has been restored.
let _ready = Promise.resolve();

/** Project a raw Supabase user onto the app's stable public shape. */
function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at ?? user.createdAt ?? null,
  };
}

/** Return the injected client, or fail loudly if configureAuth() was skipped. */
function client() {
  if (!_client) {
    throw new Error('Auth is not configured — call configureAuth() first.');
  }
  return _client;
}

/**
 * Inject the Supabase-compatible client and wire the session cache.
 * Safe to call again (tests re-inject a fresh fake per test).
 * @param {{auth:object}} supabaseClient
 * @returns {Promise<void>} resolves once any persisted session is restored.
 */
export function configureAuth(supabaseClient) {
  _client = supabaseClient;
  _cachedUser = null;

  // Mirror every session change into the synchronous cache.
  _client.auth.onAuthStateChange((_event, session) => {
    _cachedUser = session && session.user ? toPublicUser(session.user) : null;
  });

  // Restore whatever session the client persisted — this is what lets a
  // signed-in user survive a full page reload.
  _ready = Promise.resolve(_client.auth.getSession()).then(({ data } = {}) => {
    const session = data && data.session;
    _cachedUser = session && session.user ? toPublicUser(session.user) : null;
  });

  return _ready;
}

/** Whether a client has been injected yet. */
export function isAuthConfigured() {
  return _client !== null;
}

/** Resolves once the initial session-restore performed by configureAuth() is done. */
export function authReady() {
  return _ready;
}

/**
 * Register a new user with email + password.
 * @param {{email:string, password:string}} credentials
 * @returns {Promise<{id:string, email:string, createdAt:string}>}
 */
export async function signUp({ email, password } = {}) {
  const { data, error } = await client().auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data || !data.user) throw new Error('Sign-up failed — please try again.');
  _cachedUser = toPublicUser(data.user);
  return _cachedUser;
}

/**
 * Sign in an existing user.
 * @param {{email:string, password:string}} credentials
 * @returns {Promise<{id:string, email:string, createdAt:string}>}
 */
export async function signIn({ email, password } = {}) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data || !data.user) throw new Error('Sign-in failed — please try again.');
  _cachedUser = toPublicUser(data.user);
  return _cachedUser;
}

/**
 * Sign out and clear the local session.
 * @returns {Promise<void>}
 */
export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw new Error(error.message);
  _cachedUser = null;
}

/**
 * Send a password-reset email. The link redirects to #/reset-password.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function resetPassword(email) {
  const redirectTo =
    typeof location !== 'undefined' && location
      ? `${location.origin}${location.pathname}#/reset-password`
      : undefined;
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

/**
 * Update the authenticated user's password (after clicking the reset link).
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export async function updatePassword(newPassword) {
  const { data, error } = await client().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
  if (data && data.user) _cachedUser = toPublicUser(data.user);
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
