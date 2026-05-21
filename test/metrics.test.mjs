/**
 * metrics.test.mjs — unit tests for the telemetry sink (JUN-11).
 *
 * Runs under Node's built-in runner (node --test). There is no DOM and no
 * network: a fake sink is injected via configureTelemetry(), and storage.js
 * transparently uses its in-memory backend. autoFlush is disabled so each
 * test drives flushTelemetry() deterministically.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import storage from '../src/js/storage.js';
import {
  track,
  getEvents,
  getFunnel,
  getSessionId,
  getTelemetryQueue,
  configureTelemetry,
  flushTelemetry,
  EVENTS,
} from '../src/js/metrics.js';

/**
 * A controllable in-memory sink. `failTimes` makes the first N send() calls
 * reject, so retry behaviour can be exercised.
 */
function makeFakeSink({ failTimes = 0 } = {}) {
  let calls = 0;
  const received = [];
  return {
    received,
    get calls() { return calls; },
    async send(entries) {
      calls += 1;
      if (calls <= failTimes) throw new Error('simulated network failure');
      received.push(...entries);
    },
  };
}

/** Reset persisted state and telemetry wiring before each test. */
function reset({ sink = null, enabled = true } = {}) {
  storage.clear();
  configureTelemetry({ sink, enabled, autoFlush: false });
}

test('track appends to the local log AND enqueues a telemetry row', () => {
  reset();

  track(EVENTS.LANDING_VIEW);

  const events = getEvents();
  assert.equal(events.length, 1, 'local log has the event');
  assert.equal(events[0].event, EVENTS.LANDING_VIEW);

  const queue = getTelemetryQueue();
  assert.equal(queue.length, 1, 'telemetry queue has the event');
  const row = queue[0];
  assert.equal(row.event, EVENTS.LANDING_VIEW);
  assert.equal(typeof row.event_id, 'string', 'row carries a client event_id');
  assert.equal(typeof row.session_id, 'string', 'row carries a session_id');
  assert.equal(typeof row.t, 'number', 'row carries a timestamp');
});

test('session id is stable across events and reused for every row', () => {
  reset();
  const sid = getSessionId();

  track(EVENTS.LANDING_VIEW);
  track(EVENTS.SIGNUP_START);

  const queue = getTelemetryQueue();
  assert.equal(queue.length, 2);
  assert.equal(queue[0].session_id, sid);
  assert.equal(queue[1].session_id, sid, 'both events share one session id');
  assert.equal(getSessionId(), sid, 'getSessionId stays stable');
});

test('every queued event gets a distinct event_id', () => {
  reset();
  track(EVENTS.LANDING_VIEW);
  track(EVENTS.LANDING_VIEW);

  const [a, b] = getTelemetryQueue();
  assert.notEqual(a.event_id, b.event_id, 'event ids are unique per event');
});

test('flushTelemetry delivers queued events and clears the queue', async () => {
  const sink = makeFakeSink();
  reset({ sink });

  track(EVENTS.SIGNUP_START);
  track(EVENTS.SIGNUP_COMPLETE, { userId: 'u-1' });

  const result = await flushTelemetry();

  assert.equal(result.ok, true);
  assert.equal(result.sent, 2, 'both queued events were sent');
  assert.equal(sink.received.length, 2, 'the sink received both events');
  assert.equal(sink.received[1].props.userId, 'u-1', 'props are delivered intact');
  assert.equal(getTelemetryQueue().length, 0, 'queue is cleared after delivery');
});

test('a failed send keeps the queue and the events retry on the next flush', async () => {
  const sink = makeFakeSink({ failTimes: 1 });
  reset({ sink });

  track(EVENTS.PROFILE_PUBLISHED, { userId: 'u-2' });

  const first = await flushTelemetry();
  assert.equal(first.ok, false, 'first flush fails');
  assert.equal(getTelemetryQueue().length, 1, 'failed event stays queued');

  const second = await flushTelemetry();
  assert.equal(second.ok, true, 'retry succeeds');
  assert.equal(second.sent, 1);
  assert.equal(getTelemetryQueue().length, 0, 'queue drains after the retry');
  assert.equal(sink.received[0].event, EVENTS.PROFILE_PUBLISHED);
});

test('flush is a no-op (queue retained) when telemetry is disabled', async () => {
  reset({ enabled: false });

  track(EVENTS.LANDING_VIEW);
  const result = await flushTelemetry();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-sink');
  assert.equal(getTelemetryQueue().length, 1, 'events are kept, not dropped');
});

test('the unsent queue is capped so an unreachable backend cannot grow it forever', () => {
  reset({ enabled: false });

  const total = 530;
  for (let i = 0; i < total; i++) {
    track(EVENTS.LANDING_VIEW, { n: i });
  }

  const queue = getTelemetryQueue();
  assert.equal(queue.length, 500, 'queue is capped at 500 events');
  assert.equal(queue[0].props.n, total - 500, 'oldest events are dropped first');
  assert.equal(queue[queue.length - 1].props.n, total - 1, 'newest event is kept');
});

test('regression: local getFunnel still aggregates the local log', () => {
  const sink = makeFakeSink();
  reset({ sink });

  track(EVENTS.LANDING_VIEW);
  track(EVENTS.SIGNUP_START);
  track(EVENTS.SIGNUP_COMPLETE, { userId: 'u-3' });
  track(EVENTS.ONBOARDING_COMPLETE);
  track(EVENTS.PROFILE_PUBLISHED, { userId: 'u-3' });

  const funnel = getFunnel();
  assert.equal(funnel.landingViews, 1);
  assert.equal(funnel.signupStarts, 1);
  assert.equal(funnel.signups, 1);
  assert.equal(funnel.onboardingCompletions, 1);
  assert.equal(funnel.publishes, 1);
  assert.equal(funnel.signupStartRate, 1);
  assert.equal(funnel.completionRate, 1);
});
