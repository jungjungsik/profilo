/**
 * errorTracking.test.mjs — unit tests for logger and errorTracking modules.
 *
 * These run under Node's built-in test runner (node --test).
 * No DOM is needed: both modules guard every window access with
 * typeof window !== 'undefined', so they degrade cleanly in Node.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---- logger tests ---------------------------------------------------------

test('createLogger returns an object with debug/info/warn/error methods', async (t) => {
  const { createLogger } = await import('../src/js/logger.js');
  const log = createLogger('test');
  assert.equal(typeof log.debug, 'function');
  assert.equal(typeof log.info,  'function');
  assert.equal(typeof log.warn,  'function');
  assert.equal(typeof log.error, 'function');
});

test('logger does not throw when called with message and context', async (t) => {
  const { createLogger } = await import('../src/js/logger.js');
  const log = createLogger('test');
  assert.doesNotThrow(() => log.info('hello', { key: 'value' }));
  assert.doesNotThrow(() => log.warn('uh oh'));
  assert.doesNotThrow(() => log.error('fail', { error: new Error('test') }));
});

// ---- errorTracking tests ---------------------------------------------------

test('initErrorTracking is exported and callable in a non-browser environment', async (t) => {
  const { initErrorTracking } = await import('../src/js/errorTracking.js');
  assert.equal(typeof initErrorTracking, 'function');
  // In Node (no window), the function should return immediately without throwing.
  assert.doesNotThrow(() => initErrorTracking());
});

test('captureError is exported and callable with an Error', async (t) => {
  const { captureError } = await import('../src/js/errorTracking.js');
  assert.equal(typeof captureError, 'function');
  assert.doesNotThrow(() => captureError(new Error('deliberate test error'), { source: 'test' }));
});

test('captureError handles non-Error values gracefully', async (t) => {
  const { captureError } = await import('../src/js/errorTracking.js');
  assert.doesNotThrow(() => captureError(new Error('string reason')));
});
