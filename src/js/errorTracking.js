/**
 * errorTracking.js — global error handling and observability.
 *
 * Installs two global handlers:
 *   window.onerror             — synchronous JS exceptions
 *   window.unhandledrejection  — unhandled Promise rejections
 *
 * Optionally initialises Sentry when a DSN is configured:
 *   Set  window.__PROFILO_SENTRY_DSN__ = '<your-dsn>'  in index.html
 *   BEFORE the app module loads. Without a DSN every captured error is
 *   still logged to the console via logger.js (always-on behaviour).
 *
 * Other modules can call captureError() inside catch blocks for errors
 * that won't naturally bubble to the global handlers.
 */

import { createLogger } from './logger.js';

const log = createLogger('errorTracking');

function environment() {
  if (typeof window === 'undefined') return 'test';
  const h = window.location && window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'development';
  return 'production';
}

function getSentry() {
  return typeof window !== 'undefined' ? window.Sentry : null;
}

function tryInitSentry(dsn) {
  if (!dsn) return false;
  const Sentry = getSentry();
  if (!Sentry) {
    log.warn('Sentry DSN is set but the SDK script is not loaded — check index.html');
    return false;
  }
  Sentry.init({ dsn, environment: environment(), tracesSampleRate: 0 });
  log.info('Sentry initialised', { environment: environment() });
  return true;
}

function handleError(error, context = {}) {
  log.error(error.message || String(error), { error, ...context });
  const Sentry = getSentry();
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  }
}

/**
 * Install global error handlers and optionally initialise Sentry.
 * Must be called as early as possible in app boot — before any async work.
 */
export function initErrorTracking() {
  if (typeof window === 'undefined') return;

  const dsn = window.__PROFILO_SENTRY_DSN__;
  const sentryActive = tryInitSentry(dsn);

  window.addEventListener('error', (event) => {
    const error = event.error ?? new Error(event.message);
    handleError(error, {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason ?? 'Unhandled promise rejection'));
    handleError(error, { source: 'unhandledrejection' });
  });

  if (!sentryActive) {
    log.info('Error tracking active (console-only). Set window.__PROFILO_SENTRY_DSN__ to enable Sentry.');
  }
}

/**
 * Manually capture an exception. Use inside catch blocks where the error
 * won't naturally bubble to the global handlers.
 *
 * @param {Error} error
 * @param {object} [context]  Arbitrary key/value pairs added to the report.
 */
export function captureError(error, context = {}) {
  handleError(error, context);
}
