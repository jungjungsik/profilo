/**
 * router.js — hash-based client-side router.
 *
 * Routes are matched against `location.hash` (e.g. "#/u/jane-doe"). Patterns
 * support `:name` segments, captured into the `params` object passed to the
 * handler as `({ params })`.
 *
 * Node-safe: every access to `window` / `location` is guarded so the module
 * can be imported in tests without a DOM. `start()`/`navigate()` simply
 * become no-ops when no browser environment is present.
 */

/**
 * Compile a route pattern like "/u/:slug" into a matcher.
 * @param {string} pattern
 * @returns {{ regex:RegExp, keys:string[] }}
 */
function compilePattern(pattern) {
  const keys = [];

  // Normalize: ensure a single leading slash, drop any trailing slash.
  const normalized = `/${String(pattern).replace(/^\/+|\/+$/g, '')}`;

  // Build a regex, capturing each :segment and recording its name.
  const source = normalized
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';        // capture one non-slash segment
      }
      // Escape regex-significant characters in literal segments.
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  return { regex: new RegExp(`^${source}/?$`), keys };
}

/** Read the current hash path ("/foo"), Node-safe. Defaults to "/". */
function currentPath() {
  if (typeof location === 'undefined' || !location) return '/';
  const hash = location.hash || '';
  // Strip the leading "#", keep the path. "" -> "/".
  const path = hash.replace(/^#/, '');
  return path || '/';
}

export class Router {
  constructor() {
    /** @type {Array<{pattern:string, regex:RegExp, keys:string[], handler:Function}>} */
    this._routes = [];
    /** @type {Function|null} */
    this._notFound = null;
    // Bound so it can be added/removed as an event listener cleanly.
    this._onHashChange = this._resolve.bind(this);
  }

  /**
   * Register a route.
   * @param {string} pattern  e.g. '/', '/signup', '/u/:slug'
   * @param {Function} handler called with ({ params }).
   * @returns {Router} this, for chaining.
   */
  add(pattern, handler) {
    const { regex, keys } = compilePattern(pattern);
    this._routes.push({ pattern, regex, keys, handler });
    return this;
  }

  /**
   * Register the fallback handler for unmatched routes.
   * @param {Function} handler called with ({ params:{} }).
   * @returns {Router} this, for chaining.
   */
  notFound(handler) {
    this._notFound = handler;
    return this;
  }

  /**
   * Begin routing: bind to hashchange and resolve the current URL once.
   * Returns a Promise that resolves after the initial route handler completes,
   * so callers can await the first render (e.g. `await router.start()`).
   * No-op in non-browser environments.
   * @returns {Promise<Router>}
   */
  start() {
    if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
      window.addEventListener('hashchange', this._onHashChange);
    }
    // Resolve the initial location and return the promise so boot can await it.
    return this._resolve().then(() => this);
  }

  /** Stop listening for hash changes. Safe to call anytime. */
  stop() {
    if (typeof window !== 'undefined' && window && typeof window.removeEventListener === 'function') {
      window.removeEventListener('hashchange', this._onHashChange);
    }
    return this;
  }

  /**
   * Navigate to a path by updating the hash. This triggers a hashchange
   * event in the browser, which in turn re-runs resolution.
   * In Node it resolves directly so handlers still fire for tests.
   * @param {string} path e.g. '/dashboard'
   */
  navigate(path) {
    const clean = `/${String(path).replace(/^[#/]+/, '')}`;
    if (typeof location !== 'undefined' && location) {
      // Setting the hash fires 'hashchange' -> _resolve runs via the listener.
      // If the hash is unchanged, no event fires, so resolve explicitly too.
      const nextHash = `#${clean}`;
      if (location.hash === nextHash) {
        this._resolve();
      } else {
        location.hash = nextHash;
      }
    } else {
      // No browser: nothing to update, just resolve against the default path.
      this._resolve();
    }
  }

  /**
   * Match the current path against registered routes and invoke the handler.
   * Returns a Promise so async handlers (e.g. those using dynamic import) can
   * be awaited by start() and navigate() in test environments.
   * @private
   * @returns {Promise<void>}
   */
  async _resolve() {
    const path = currentPath();

    for (const route of this._routes) {
      const match = route.regex.exec(path);
      if (match) {
        // Build params from the captured groups.
        const params = {};
        route.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(match[i + 1]);
        });
        await route.handler({ params });
        return;
      }
    }

    // Nothing matched — fall back if a handler was registered.
    if (typeof this._notFound === 'function') {
      await this._notFound({ params: {} });
    }
  }
}

export default Router;
