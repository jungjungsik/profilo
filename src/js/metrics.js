/**
 * metrics.js — funnel tracking with a central telemetry sink.
 *
 * track() does two things for every event:
 *   1. appends it to a local append-only log in storage (drives the local,
 *      single-browser getFunnel() / getEvents() / timeToValue() helpers); and
 *   2. enqueues it for delivery to a central backend so the company can
 *      measure the funnel across every visitor's device — not just whichever
 *      browser happens to call getFunnel().
 *
 * Telemetry sink (JUN-11):
 *   - Events POST to the Supabase `metrics_events` table via its REST API.
 *   - Delivery is best-effort and asynchronous; track() never blocks or throws.
 *   - Unsent events sit in a localStorage queue and are retried on the next
 *     track(), on page load, and when the browser regains connectivity — so a
 *     transient network failure loses nothing.
 *   - Each event carries a client-generated event_id (idempotent re-sends) and
 *     an anonymous session_id, so anonymous landing/signup events still group.
 *   - The sink auto-activates in a production browser only. Under `node --test`
 *     and on localhost it stays dormant unless configureTelemetry() wires it.
 *
 * Cross-device aggregation (the server-side equivalent of getFunnel()) lives
 * in the `metrics_funnel` and `metrics_time_to_value` SQL views — see
 * supabase/migrations/20260522000000_metrics_events_telemetry_sink.sql.
 *
 * Events are append-only: { event, props, t }.
 */

import storage from './storage.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const EVENTS_KEY = 'metrics:events';
const QUEUE_KEY = 'metrics:queue';
const SESSION_KEY = 'metrics:session';

// Hard cap on the unsent queue so a permanently-unreachable backend can never
// grow localStorage without bound. Oldest events are dropped first.
const MAX_QUEUE = 500;

/**
 * Canonical event names. Use these constants everywhere instead of raw
 * strings so the funnel computation and call sites can never drift apart.
 */
export const EVENTS = Object.freeze({
  LANDING_VIEW: 'landing_view',
  SIGNUP_START: 'signup_start',
  SIGNUP_COMPLETE: 'signup_complete',
  ONBOARDING_STEP: 'onboarding_step',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  PROFILE_PUBLISHED: 'profile_published',
  PROFILE_VIEWED: 'profile_viewed',
  EDIT_PROFILE: 'edit_profile',
});

/* ------------------------------------------------------------------ ids -- */

/** A UUID when the platform offers one, else a collision-resistant fallback. */
function genId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * A stable anonymous session id, persisted so a visitor's events stay grouped
 * across reloads — including the landing/signup events fired before sign-up.
 * @returns {string}
 */
export function getSessionId() {
  let id = storage.get(SESSION_KEY);
  if (typeof id !== 'string' || !id) {
    id = genId();
    storage.set(SESSION_KEY, id);
  }
  return id;
}

/* -------------------------------------------------------------- runtime -- */

/** Coarse runtime classification — mirrors errorTracking.js. */
function environment() {
  if (typeof window === 'undefined') return 'test';
  const host = window.location && window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || !host) return 'development';
  return 'production';
}

/* ----------------------------------------------------------- the sink --- */

// A sink is any object exposing `async send(entries)`; it resolves on a
// confirmed delivery and rejects on failure (so the queue is retried).
let _sink = null;
let _sinkResolved = false;
let _autoFlush = true;
let _flushScheduled = false;

/** Map an internal queue entry onto the `metrics_events` table row shape. */
function toRow(entry) {
  return {
    event_id: entry.event_id,
    event: entry.event,
    props: entry.props || {},
    session_id: entry.session_id,
    occurred_at: new Date(entry.t).toISOString(),
  };
}

/**
 * Build the default sink: a POST to the Supabase `ingest_metrics_events` RPC.
 *
 * The RPC dedupes on the client-generated event_id (ON CONFLICT DO NOTHING),
 * so re-sending a batch after a missed acknowledgement never double-counts —
 * delivery is idempotent and the whole batch can be retried safely.
 */
function createSupabaseSink({ url, apiKey, fetchImpl }) {
  const endpoint = `${url}/rest/v1/rpc/ingest_metrics_events`;
  return {
    async send(entries) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ events: entries.map(toRow) }),
      });
      if (!res || !res.ok) {
        throw new Error(`telemetry ingest failed: ${res ? res.status : 'no response'}`);
      }
    },
  };
}

/**
 * Resolve the active sink, lazily auto-wiring the Supabase sink the first time
 * it is needed in a production browser. configureTelemetry() overrides this.
 */
function resolveSink() {
  if (_sinkResolved) return _sink;
  _sinkResolved = true;
  if (environment() === 'production' && typeof globalThis.fetch === 'function') {
    _sink = createSupabaseSink({
      url: SUPABASE_URL,
      apiKey: SUPABASE_ANON_KEY,
      fetchImpl: (input, init) => globalThis.fetch(input, init),
    });
  }
  return _sink;
}

/**
 * Override telemetry wiring. Production needs none (the sink auto-resolves);
 * tests use this to inject a fake sink and disable auto-flush for determinism.
 *
 * @param {object}  [opts]
 * @param {object}  [opts.sink]       object with `async send(entries)`
 * @param {boolean} [opts.enabled]    when false, no events are ever sent
 * @param {boolean} [opts.autoFlush]  when false, track() will not auto-flush
 */
export function configureTelemetry({ sink = null, enabled = true, autoFlush = true } = {}) {
  _sink = enabled ? sink : null;
  _sinkResolved = true;
  _autoFlush = autoFlush;
}

/* --------------------------------------------------------- the queue ---- */

/** Load the unsent telemetry queue. */
function loadQueue() {
  return storage.get(QUEUE_KEY) || [];
}

/** Append an event to the unsent queue, enforcing the size cap. */
function enqueue(row) {
  const queue = loadQueue();
  queue.push(row);
  if (queue.length > MAX_QUEUE) {
    queue.splice(0, queue.length - MAX_QUEUE);
  }
  storage.set(QUEUE_KEY, queue);
}

/** The events still waiting to be delivered (mainly for tests/debugging). */
export function getTelemetryQueue() {
  return loadQueue();
}

/**
 * Flush the unsent queue through the active sink.
 *
 * On a confirmed send only the just-sent events are removed, so events that
 * track() appended while the request was in flight survive for the next
 * flush. On failure the queue is left intact and retried later.
 *
 * @returns {Promise<{ok:boolean, sent:number, reason?:string}>}
 */
export async function flushTelemetry() {
  const sink = resolveSink();
  if (!sink) return { ok: false, sent: 0, reason: 'no-sink' };

  const batch = loadQueue();
  if (batch.length === 0) return { ok: true, sent: 0 };

  try {
    await sink.send(batch);
  } catch (err) {
    return { ok: false, sent: 0, reason: String((err && err.message) || err) };
  }

  // Drop exactly the delivered events; keep anything enqueued meanwhile.
  const delivered = new Set(batch.map((e) => e.event_id));
  storage.set(QUEUE_KEY, loadQueue().filter((e) => !delivered.has(e.event_id)));
  return { ok: true, sent: batch.length };
}

/** Coalesce many track() calls in one tick into a single async flush. */
function scheduleFlush() {
  if (_flushScheduled) return;
  _flushScheduled = true;
  const run = () => {
    _flushScheduled = false;
    flushTelemetry().catch(() => {});
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else Promise.resolve().then(run);
}

/* ----------------------------------------------------------- tracking -- */

/** Load the append-only event log. */
function loadEvents() {
  return storage.get(EVENTS_KEY) || [];
}

/**
 * Record a funnel event: append it to the local log and queue it for the
 * central telemetry sink. Never blocks and never throws — a metrics failure
 * must not break a user flow.
 *
 * @param {string} event one of the EVENTS values (any string accepted).
 * @param {object} [props] arbitrary structured metadata (e.g. { userId }).
 */
export function track(event, props = {}) {
  const safeProps = props || {};
  const entry = { event, props: safeProps, t: Date.now() };

  // 1. Local append-only log — drives getEvents()/getFunnel()/timeToValue().
  const events = loadEvents();
  events.push(entry);
  storage.set(EVENTS_KEY, events);

  // 2. Queue a copy for the central sink, tagged for idempotent retries and
  //    grouped by an anonymous session id.
  enqueue({
    event_id: genId(),
    event,
    props: safeProps,
    session_id: getSessionId(),
    t: entry.t,
  });

  // 3. Best-effort async delivery (a no-op until a sink resolves).
  if (_autoFlush) scheduleFlush();

  // Lightweight visibility during development; harmless in production.
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[metrics]', event, entry.props);
  }
}

/**
 * The full ordered event log.
 * @returns {Array<{event:string, props:object, t:number}>}
 */
export function getEvents() {
  return loadEvents();
}

/**
 * Compute time-to-value for one user: ms between their signup_complete and
 * their first profile_published.
 *
 * @param {string} userId
 * @returns {number|null} milliseconds, or null if either event is missing.
 */
export function timeToValue(userId) {
  if (!userId) return null;
  const events = loadEvents();

  // Earliest signup_complete for this user.
  const signup = events.find(
    (e) => e.event === EVENTS.SIGNUP_COMPLETE && e.props && e.props.userId === userId,
  );
  // Earliest profile_published for this user.
  const published = events.find(
    (e) => e.event === EVENTS.PROFILE_PUBLISHED && e.props && e.props.userId === userId,
  );

  if (!signup || !published) return null;

  const delta = published.t - signup.t;
  // Guard against clock skew / out-of-order events.
  return delta >= 0 ? delta : null;
}

/** Median of a numeric array; null for an empty array. */
function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Aggregate the whole funnel.
 *
 * NOTE: this aggregates only the calling browser's local log. The
 * cross-device funnel — the metric the company actually reports on — is
 * computed server-side by the `metrics_funnel` SQL view over the telemetry
 * the sink delivers.
 *
 * @returns {{
 *   landingViews:number,
 *   signupStarts:number,
 *   signups:number,
 *   onboardingCompletions:number,
 *   publishes:number,
 *   editProfileEntries:number,
 *   signupStartRate:number,           // signupStarts / landingViews, 0..1
 *   completionRate:number,            // onboardingCompletions / signups, 0..1
 *   medianTimeToValueMs:number|null   // median signup->publish across users
 * }}
 *
 * signupStartRate is the JUN-7 "CTA clarity" metric: the share of landing
 * visitors who clicked the primary CTA through to the signup screen. edit
 * ProfileEntries is the JUN-7 "navigation clarity" signal: how many times a
 * returning user reached the profile editor.
 */
export function getFunnel() {
  const events = loadEvents();

  const count = (name) => events.filter((e) => e.event === name).length;

  const landingViews = count(EVENTS.LANDING_VIEW);
  const signupStarts = count(EVENTS.SIGNUP_START);
  const signups = count(EVENTS.SIGNUP_COMPLETE);
  const onboardingCompletions = count(EVENTS.ONBOARDING_COMPLETE);
  const publishes = count(EVENTS.PROFILE_PUBLISHED);
  const editProfileEntries = count(EVENTS.EDIT_PROFILE);

  // CTA click-through: share of landing views that started signup (0 when no views).
  const signupStartRate = landingViews > 0 ? signupStarts / landingViews : 0;

  // Completion rate: share of signups that finished onboarding (0 when no signups).
  const completionRate = signups > 0 ? onboardingCompletions / signups : 0;

  // Median time-to-value across every user who has both a signup and a publish.
  const signupUserIds = new Set(
    events
      .filter((e) => e.event === EVENTS.SIGNUP_COMPLETE && e.props && e.props.userId)
      .map((e) => e.props.userId),
  );
  const ttvSamples = [];
  for (const userId of signupUserIds) {
    const ttv = timeToValue(userId);
    if (ttv != null) ttvSamples.push(ttv);
  }

  return {
    landingViews,
    signupStarts,
    signups,
    onboardingCompletions,
    publishes,
    editProfileEntries,
    signupStartRate,
    completionRate,
    medianTimeToValueMs: median(ttvSamples),
  };
}

/* ------------------------------------------------------------ wiring ---- */

// In a browser: retry leftover queue on load and whenever connectivity
// returns. Both are no-ops until the sink resolves (production only).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => scheduleFlush());
  scheduleFlush();
}
