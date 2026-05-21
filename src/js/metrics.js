/**
 * metrics.js — funnel tracking.
 *
 * Records onboarding-funnel events to local storage so the team can measure
 * the two success metrics:
 *   - signup -> publish median time  (target < 5 min)
 *   - onboarding completion rate     (target >= 60%)
 *
 * Events are append-only: { event, props, t }.
 */

import storage from './storage.js';

const EVENTS_KEY = 'metrics:events';

/**
 * Canonical event names. Use these constants everywhere instead of raw
 * strings so the funnel computation and call sites can never drift apart.
 */
export const EVENTS = Object.freeze({
  LANDING_VIEW: 'landing_view',
  SIGNUP_COMPLETE: 'signup_complete',
  ONBOARDING_STEP: 'onboarding_step',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  PROFILE_PUBLISHED: 'profile_published',
  PROFILE_VIEWED: 'profile_viewed',
});

/** Load the append-only event log. */
function loadEvents() {
  return storage.get(EVENTS_KEY) || [];
}

/**
 * Record a funnel event.
 * @param {string} event one of the EVENTS values (any string accepted).
 * @param {object} [props] arbitrary structured metadata (e.g. { userId }).
 */
export function track(event, props = {}) {
  const events = loadEvents();
  const entry = { event, props: props || {}, t: Date.now() };
  events.push(entry);
  storage.set(EVENTS_KEY, events);

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
 * @returns {{
 *   landingViews:number,
 *   signups:number,
 *   onboardingCompletions:number,
 *   publishes:number,
 *   completionRate:number,            // onboardingCompletions / signups, 0..1
 *   medianTimeToValueMs:number|null   // median signup->publish across users
 * }}
 */
export function getFunnel() {
  const events = loadEvents();

  const count = (name) => events.filter((e) => e.event === name).length;

  const landingViews = count(EVENTS.LANDING_VIEW);
  const signups = count(EVENTS.SIGNUP_COMPLETE);
  const onboardingCompletions = count(EVENTS.ONBOARDING_COMPLETE);
  const publishes = count(EVENTS.PROFILE_PUBLISHED);

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
    signups,
    onboardingCompletions,
    publishes,
    completionRate,
    medianTimeToValueMs: median(ttvSamples),
  };
}
