/**
 * auth.js — STUB authentication.
 *
 * STUB — to be replaced by real auth from issue JUN-5; keep this interface stable.
 *
 * This module provides a fully working signup/signin flow backed entirely by
 * local storage so the rest of the app can be built and tested end-to-end.
 * It is NOT secure: passwords are stored with a trivial reversible "hash"
 * (base64). Do not ship this to production — JUN-5 swaps the backend while
 * keeping these exported function signatures identical.
 */

import storage from './storage.js';

// Storage keys.
const USERS_KEY = 'auth:users';        // map of email -> user record (incl. pw hash)
const SESSION_KEY = 'auth:session';    // id of the currently signed-in user

// Basic email shape check — intentionally permissive, real validation is JUN-5.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

/**
 * STUB-only password "hash". btoa is base64 — trivially reversible and NOT
 * secure. Real auth (JUN-5) must use a proper one-way hash + salt server-side.
 */
function stubHash(password) {
  if (typeof btoa === 'function') return btoa(password);
  // Node may not expose btoa on older runtimes; Buffer is the equivalent.
  return Buffer.from(String(password), 'utf-8').toString('base64');
}

/** Load the email -> userRecord map. */
function loadUsers() {
  return storage.get(USERS_KEY) || {};
}

/** Persist the email -> userRecord map. */
function saveUsers(users) {
  storage.set(USERS_KEY, users);
}

/** Normalize emails so lookups are case/whitespace insensitive. */
function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** Strip the internal password hash before handing a user to callers. */
function publicUser(record) {
  if (!record) return null;
  const { id, email, createdAt } = record;
  return { id, email, createdAt };
}

/** Generate a reasonably unique id without external dependencies. */
function makeId() {
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Register a new user.
 * @param {{email:string, password:string}} credentials
 * @returns {{id:string, email:string, createdAt:string}}
 * @throws {Error} on invalid email, short password, or duplicate email.
 */
export function signUp({ email, password } = {}) {
  const normEmail = normalizeEmail(email);

  if (!EMAIL_RE.test(normEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const users = loadUsers();
  if (users[normEmail]) {
    throw new Error('An account with that email already exists.');
  }

  const record = {
    id: makeId(),
    email: normEmail,
    createdAt: new Date().toISOString(),
    passwordHash: stubHash(password),
  };
  users[normEmail] = record;
  saveUsers(users);

  // New signups are immediately signed in.
  storage.set(SESSION_KEY, record.id);

  return publicUser(record);
}

/**
 * Sign in an existing user.
 * @param {{email:string, password:string}} credentials
 * @returns {{id:string, email:string, createdAt:string}}
 * @throws {Error} on unknown email or wrong password.
 */
export function signIn({ email, password } = {}) {
  const normEmail = normalizeEmail(email);
  const users = loadUsers();
  const record = users[normEmail];

  if (!record) {
    throw new Error('No account found for that email.');
  }
  if (record.passwordHash !== stubHash(password)) {
    throw new Error('Incorrect password.');
  }

  storage.set(SESSION_KEY, record.id);
  return publicUser(record);
}

/** Clear the current session. Always safe to call. */
export function signOut() {
  storage.remove(SESSION_KEY);
}

/**
 * The currently signed-in user, or null.
 * @returns {{id:string, email:string, createdAt:string}|null}
 */
export function currentUser() {
  const sessionId = storage.get(SESSION_KEY);
  if (!sessionId) return null;

  const users = loadUsers();
  for (const record of Object.values(users)) {
    if (record.id === sessionId) return publicUser(record);
  }
  // Session points at a user that no longer exists — treat as signed out.
  return null;
}

/** @returns {boolean} whether a user is currently signed in. */
export function isAuthenticated() {
  return currentUser() !== null;
}
