/**
 * flow.test.mjs — end-to-end logic-core tests for the profile builder.
 *
 * Uses only node:test + node:assert/strict — zero npm dependencies.
 * Run with:  node --test test/
 *
 * In Node there is no globalThis.localStorage, so storage.js transparently
 * uses its in-memory Map backend. storage.clear() resets it between tests,
 * keeping every test deterministic and independent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import storage from '../src/js/storage.js';
import {
  signUp,
  signIn,
  signOut,
  currentUser,
  isAuthenticated,
} from '../src/js/auth.js';
import {
  ensureProfile,
  getProfile,
  updateProfile,
  addBlock,
  removeBlock,
  publishProfile,
  getProfileBySlug,
} from '../src/js/store.js';
import {
  track,
  getEvents,
  getFunnel,
  timeToValue,
  EVENTS,
} from '../src/js/metrics.js';
import {
  smartProfileDefaults,
  generateSlug,
  uniqueSlug,
} from '../src/js/defaults.js';

/** Reset all persisted state and the session before each test. */
function resetState() {
  signOut();
  storage.clear();
}

test('1. signUp creates a user and authenticates the session', () => {
  resetState();

  const user = signUp({ email: 'jane.doe@example.com', password: 'secret123' });

  assert.ok(user, 'signUp should return a user');
  assert.equal(typeof user.id, 'string');
  assert.equal(user.email, 'jane.doe@example.com');
  assert.equal(typeof user.createdAt, 'string');
  assert.equal(isAuthenticated(), true, 'user should be authenticated after signUp');
  assert.equal(currentUser().id, user.id, 'currentUser should match the new user');

  // Invalid input must throw.
  assert.throws(() => signUp({ email: 'not-an-email', password: 'secret123' }));
  assert.throws(() => signUp({ email: 'short@pw.com', password: '123' }));
  // Duplicate email must throw.
  assert.throws(() => signUp({ email: 'jane.doe@example.com', password: 'another1' }));
});

test('2. ensureProfile creates a non-empty profile from smart defaults', () => {
  resetState();
  signUp({ email: 'sam.smith@example.com', password: 'secret123' });

  const profile = ensureProfile();

  assert.ok(profile, 'ensureProfile should return a profile');
  assert.equal(typeof profile.id, 'string');
  assert.equal(typeof profile.userId, 'string');
  assert.ok(Array.isArray(profile.blocks), 'profile.blocks should be an array');
  assert.ok(profile.blocks.length >= 1, 'profile must have at least one starter block');
  assert.equal(profile.published, false, 'a fresh profile is not published');
  assert.ok(profile.displayName, 'displayName should be populated (no empty state)');
  assert.match(profile.avatarColor, /^#[0-9a-f]{6}$/, 'avatarColor is a hex color');

  // Every block has an id and a valid type.
  for (const block of profile.blocks) {
    assert.equal(typeof block.id, 'string');
    assert.ok(block.type === 'text' || block.type === 'link');
  }

  // Calling again returns the same profile (idempotent).
  assert.equal(ensureProfile().id, profile.id);

  // ensureProfile must throw when not authenticated.
  signOut();
  assert.throws(() => ensureProfile());
});

test('3. addBlock and updateProfile persist changes', () => {
  resetState();
  signUp({ email: 'pat@example.com', password: 'secret123' });
  ensureProfile();

  const beforeCount = getProfile().blocks.length;

  const afterAdd = addBlock({ type: 'text', label: 'New section', value: 'Hello world' });
  assert.equal(afterAdd.blocks.length, beforeCount + 1, 'addBlock appends a block');

  // The change must be readable back from storage.
  assert.equal(getProfile().blocks.length, beforeCount + 1, 'added block is persisted');

  const updated = updateProfile({ headline: 'Senior Widget Engineer' });
  assert.equal(updated.headline, 'Senior Widget Engineer');
  assert.equal(getProfile().headline, 'Senior Widget Engineer', 'headline change is persisted');
});

test('4. publishProfile sets published, slug, and publishedAt', () => {
  resetState();
  signUp({ email: 'casey@example.com', password: 'secret123' });
  ensureProfile();

  const published = publishProfile();

  assert.equal(published.published, true, 'profile should be marked published');
  assert.ok(published.slug, 'a slug should be set');
  assert.equal(typeof published.publishedAt, 'string', 'publishedAt should be an ISO string');
  assert.notEqual(published.publishedAt, null);
});

test('5. getProfileBySlug returns the published profile', () => {
  resetState();
  signUp({ email: 'robin@example.com', password: 'secret123' });
  ensureProfile();

  const published = publishProfile();
  const found = getProfileBySlug(published.slug);

  assert.ok(found, 'getProfileBySlug should find the profile');
  assert.equal(found.id, published.id, 'found profile matches the published one');

  // Unknown slug yields null.
  assert.equal(getProfileBySlug('no-such-slug'), null);
});

test('6. publishProfile throws when the profile has no blocks', () => {
  resetState();
  signUp({ email: 'alex@example.com', password: 'secret123' });

  let profile = ensureProfile();

  // Remove every block so the profile has an empty blocks array.
  for (const block of profile.blocks.slice()) {
    profile = removeBlock(block.id);
  }
  assert.equal(profile.blocks.length, 0, 'all blocks should be removed');

  // Publishing an empty profile must throw.
  assert.throws(() => publishProfile(), /at least one block/i);
});

test('7. metrics: timeToValue and funnel completionRate are computed', () => {
  resetState();
  const user = signUp({ email: 'morgan@example.com', password: 'secret123' });

  // Record a signup, then a publish a measurable moment later. We capture
  // explicit timestamps and assert ordering rather than relying on wall-clock
  // gaps, keeping the test deterministic.
  track(EVENTS.SIGNUP_COMPLETE, { userId: user.id });
  track(EVENTS.ONBOARDING_COMPLETE, { userId: user.id });
  track(EVENTS.PROFILE_PUBLISHED, { userId: user.id });

  // Both events exist for this user, so timeToValue is a non-negative number.
  const ttv = timeToValue(user.id);
  assert.equal(typeof ttv, 'number', 'timeToValue should return a number');
  assert.ok(ttv >= 0, 'timeToValue should be non-negative');

  // Manually verify positivity by inspecting the recorded event timestamps.
  const events = getEvents();
  const signupEvent = events.find((e) => e.event === EVENTS.SIGNUP_COMPLETE);
  const publishEvent = events.find((e) => e.event === EVENTS.PROFILE_PUBLISHED);
  assert.ok(signupEvent && publishEvent, 'both funnel events were recorded');
  assert.ok(
    publishEvent.t >= signupEvent.t,
    'publish event is timestamped at or after signup',
  );

  const funnel = getFunnel();
  assert.equal(funnel.signups, 1, 'one signup recorded');
  assert.equal(funnel.onboardingCompletions, 1, 'one onboarding completion recorded');
  assert.equal(funnel.publishes, 1, 'one publish recorded');
  assert.equal(
    funnel.completionRate,
    1,
    'completionRate = onboardingCompletions / signups',
  );
  assert.equal(typeof funnel.completionRate, 'number');
});

test('7b. metrics: timeToValue returns a positive number for spaced events', async () => {
  resetState();
  const user = signUp({ email: 'jordan@example.com', password: 'secret123' });

  track(EVENTS.SIGNUP_COMPLETE, { userId: user.id });
  // Wait a few milliseconds so the publish event has a strictly later stamp.
  await new Promise((resolve) => setTimeout(resolve, 5));
  track(EVENTS.PROFILE_PUBLISHED, { userId: user.id });

  const ttv = timeToValue(user.id);
  assert.equal(typeof ttv, 'number');
  assert.ok(ttv > 0, `timeToValue should be strictly positive, got ${ttv}`);

  // Missing-event cases return null.
  assert.equal(timeToValue('unknown-user'), null);
});

test('8. defaults: generateSlug and uniqueSlug behave correctly', () => {
  resetState();

  // generateSlug produces lowercase, hyphenated, ascii slugs.
  assert.equal(generateSlug('Hello World'), 'hello-world');
  assert.equal(generateSlug('  Trim  Me  '), 'trim-me');
  assert.equal(generateSlug('Café Münchën'), 'cafe-munchen', 'accents reduced to ascii');
  assert.equal(generateSlug('!!!'), 'profile', 'empty result falls back to "profile"');

  // uniqueSlug avoids collisions by appending -2, -3, ...
  assert.equal(uniqueSlug('jane', []), 'jane');
  assert.equal(uniqueSlug('jane', ['jane']), 'jane-2');
  assert.equal(uniqueSlug('jane', ['jane', 'jane-2']), 'jane-3');
  assert.equal(uniqueSlug('jane', ['jane', 'jane-2', 'jane-3']), 'jane-4');

  // smartProfileDefaults yields a non-empty starting point.
  const defaults = smartProfileDefaults({ email: 'taylor.quinn@example.com' });
  assert.equal(defaults.displayName, 'Taylor Quinn', 'displayName is titleized local-part');
  assert.ok(defaults.headline, 'headline is non-empty');
  assert.ok(defaults.bio, 'bio is non-empty');
  assert.match(defaults.avatarColor, /^#[0-9a-f]{6}$/);
  assert.equal(defaults.blocks.length, 2, 'exactly two starter blocks');
  const types = defaults.blocks.map((b) => b.type).sort();
  assert.deepEqual(types, ['link', 'text'], 'one text block and one link block');
});

test('9. auth: signIn rejects wrong credentials, accepts correct ones', () => {
  resetState();
  signUp({ email: 'dana@example.com', password: 'secret123' });
  signOut();
  assert.equal(isAuthenticated(), false, 'signed out after signOut');

  // Wrong password / unknown email throw.
  assert.throws(() => signIn({ email: 'dana@example.com', password: 'wrongpw' }));
  assert.throws(() => signIn({ email: 'ghost@example.com', password: 'secret123' }));

  // Correct credentials succeed and restore the session.
  const user = signIn({ email: 'dana@example.com', password: 'secret123' });
  assert.equal(user.email, 'dana@example.com');
  assert.equal(isAuthenticated(), true);
});
