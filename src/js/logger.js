/**
 * logger.js — structured application logger.
 *
 * Usage:
 *   import { createLogger } from './logger.js';
 *   const log = createLogger('auth');
 *   log.error('Sign-in failed', { error, email });
 *
 * In development (localhost) all levels including debug are shown.
 * In production only info+ is shown, keeping console noise low while
 * preserving error and warn visibility.
 *
 * Errors are automatically forwarded to Sentry when the SDK is loaded
 * and initialised (via errorTracking.js).
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel() {
  if (typeof window === 'undefined') return LEVELS.warn;
  const h = window.location && window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ? LEVELS.debug : LEVELS.info;
}

function emit(level, module, message, context) {
  if (LEVELS[level] < minLevel()) return;

  const prefix = `[${level.toUpperCase()}][${module}]`;

  if (level === 'error') {
    console.error(prefix, message, context ?? '');
    const Sentry = typeof window !== 'undefined' && window.Sentry;
    if (Sentry && context && context.error instanceof Error) {
      Sentry.captureException(context.error, {
        extra: { module, message, ...context },
      });
    }
  } else if (level === 'warn') {
    console.warn(prefix, message, context ?? '');
  } else if (level === 'info') {
    console.info(prefix, message, context ?? '');
  } else {
    console.debug(prefix, message, context ?? '');
  }
}

/**
 * Create a logger bound to a named module.
 * @param {string} module  Short label shown in every log line (e.g. 'auth').
 */
export function createLogger(module) {
  return {
    debug: (msg, ctx) => emit('debug', module, msg, ctx),
    info:  (msg, ctx) => emit('info',  module, msg, ctx),
    warn:  (msg, ctx) => emit('warn',  module, msg, ctx),
    error: (msg, ctx) => emit('error', module, msg, ctx),
  };
}
