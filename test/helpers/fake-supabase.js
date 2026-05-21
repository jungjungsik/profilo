/**
 * fake-supabase.js — in-memory test double for the Supabase client.
 *
 * Implements the subset of the `supabase.auth.*` surface that src/js/auth.js
 * depends on, backed by plain objects. This lets the suite exercise the REAL
 * auth.js adapter offline and deterministically — no network, no CDN ESM URL.
 *
 * Pass a shared `store` object to persist users + session across client
 * instances; that is how "a session survives a page reload" is exercised
 * (a fresh client over the same store restores the session).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

let _seq = 0;
function makeId() {
  _seq += 1;
  return `usr_fake_${Date.now().toString(36)}_${_seq}`;
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** Shape an error result the way the real Supabase auth client does. */
function authError(message) {
  return { data: { user: null, session: null }, error: { message } };
}

/**
 * Create an in-memory Supabase-compatible client.
 * @param {{store?:object}} [options] pass a shared `store` to persist across
 *   "reloads"; omit it for an isolated, per-test client.
 * @returns {{auth:object}}
 */
export function createFakeSupabase(options = {}) {
  // The store is the "localStorage": keep it across instances to survive a
  // reload, or leave it fresh for an isolated client.
  const store = options.store || {};
  store.users = store.users || {}; // email -> { id, email, password, created_at }
  // store.session -> { access_token, user } | null | undefined

  const listeners = new Set();

  function publicUser(record) {
    return { id: record.id, email: record.email, created_at: record.created_at };
  }

  function emit(event) {
    for (const cb of listeners) cb(event, store.session || null);
  }

  function startSession(record) {
    store.session = { access_token: `fake-token-${record.id}`, user: publicUser(record) };
    emit('SIGNED_IN');
  }

  const auth = {
    async signUp({ email, password } = {}) {
      const normEmail = normalizeEmail(email);
      if (!EMAIL_RE.test(normEmail)) {
        return authError('Please enter a valid email address.');
      }
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return authError(`Password should be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      if (store.users[normEmail]) {
        return authError('User already registered');
      }
      const record = {
        id: makeId(),
        email: normEmail,
        password,
        created_at: new Date().toISOString(),
      };
      store.users[normEmail] = record;
      startSession(record);
      return { data: { user: publicUser(record), session: store.session }, error: null };
    },

    async signInWithPassword({ email, password } = {}) {
      const record = store.users[normalizeEmail(email)];
      if (!record || record.password !== password) {
        return authError('Invalid login credentials');
      }
      startSession(record);
      return { data: { user: publicUser(record), session: store.session }, error: null };
    },

    async signOut() {
      store.session = null;
      emit('SIGNED_OUT');
      return { error: null };
    },

    async getSession() {
      return { data: { session: store.session || null }, error: null };
    },

    onAuthStateChange(callback) {
      listeners.add(callback);
      return {
        data: { subscription: { unsubscribe: () => listeners.delete(callback) } },
      };
    },

    async resetPasswordForEmail(email /* , options */) {
      // Always succeeds — mirrors Supabase not leaking whether an email exists.
      void email;
      return { data: {}, error: null };
    },

    async updateUser({ password } = {}) {
      if (!store.session) return authError('Not authenticated');
      const record = store.users[normalizeEmail(store.session.user.email)];
      if (record && typeof password === 'string') {
        record.password = password;
      }
      return { data: { user: store.session.user }, error: null };
    },
  };

  return { auth };
}
