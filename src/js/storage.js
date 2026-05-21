/**
 * storage.js — environment-aware key/value persistence.
 *
 * Browser: backed by globalThis.localStorage.
 * Node:    backed by an in-memory Map (so tests run with zero dependencies).
 *
 * All keys are namespaced under the "pb:" prefix so the app never collides
 * with other localStorage consumers on the same origin.
 */

const PREFIX = 'pb:';

/**
 * Pick a backend at module load time. We feature-detect localStorage rather
 * than sniffing for `window`, because some Node environments expose partial
 * globals. The backend exposes the minimal subset of the Web Storage API we need.
 */
function selectBackend() {
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === 'function') {
      // Probe write access — private-mode browsers can throw on setItem.
      const probeKey = `${PREFIX}__probe__`;
      ls.setItem(probeKey, '1');
      ls.removeItem(probeKey);
      return ls;
    }
  } catch {
    // Fall through to the in-memory backend.
  }

  // In-memory fallback shaped like the Web Storage API surface we use.
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    // `key(i)` + `length` let us enumerate keys uniformly with localStorage.
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    _map: map, // exposed only for the in-memory backend; harmless if unused
  };
}

const backend = selectBackend();

/** Prefix a caller-facing key with the app namespace. */
const withPrefix = (key) => `${PREFIX}${key}`;

/** Enumerate every namespaced raw key currently in the backend. */
function rawNamespacedKeys() {
  const out = [];
  for (let i = 0; i < backend.length; i++) {
    const rawKey = backend.key(i);
    if (rawKey != null && rawKey.startsWith(PREFIX)) {
      out.push(rawKey);
    }
  }
  return out;
}

const storage = {
  /**
   * Read and JSON-parse a value.
   * @returns {*} parsed value, or null if missing / unparseable.
   */
  get(key) {
    const raw = backend.getItem(withPrefix(key));
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt entry — treat as absent rather than throwing into callers.
      return null;
    }
  },

  /**
   * JSON-stringify and persist a value.
   * @param {string} key
   * @param {*} value  any JSON-serializable value
   */
  set(key, value) {
    backend.setItem(withPrefix(key), JSON.stringify(value));
  },

  /** Delete a single key. */
  remove(key) {
    backend.removeItem(withPrefix(key));
  },

  /** Delete every key owned by this app (leaves foreign keys untouched). */
  clear() {
    for (const rawKey of rawNamespacedKeys()) {
      backend.removeItem(rawKey);
    }
  },

  /**
   * List all app keys WITHOUT the "pb:" prefix.
   * @returns {string[]}
   */
  keys() {
    return rawNamespacedKeys().map((rawKey) => rawKey.slice(PREFIX.length));
  },
};

export default storage;
