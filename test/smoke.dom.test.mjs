/* ==========================================================================
   smoke.dom.test.mjs — end-to-end UI smoke test (JUN-6 acceptance)

   Drives the *real* UI views inside a jsdom DOM, walking the entire
   first-value path: landing -> signup -> 3-step wizard -> publish ->
   public profile. Asserts the CEO success definition is reached:
   profile.published === true AND content blocks >= 1.

   Auth is the REAL adapter (src/js/auth.js) running against an in-memory
   Supabase fake injected before the app boots — so this drives production
   auth code offline. signUp is async, so the signup step awaits the UI.

   Run with: npm test   (jsdom is a devDependency)
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { configureAuth } from '../src/js/auth.js';
import { createFakeSupabase } from './helpers/fake-supabase.js';

/* ---- DOM environment ---------------------------------------------------- */
const dom = new JSDOM(
  '<!doctype html><html><body><div id="app"></div></body></html>',
  { url: 'http://localhost:4173/', pretendToBeVisual: true },
);
const { window } = dom;

/* Wire the globals the app modules expect (must be set BEFORE importing). */
globalThis.window = window;
globalThis.document = window.document;
globalThis.location = window.location;
globalThis.localStorage = window.localStorage;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.HTMLElement = window.HTMLElement;
globalThis.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
window.scrollTo = () => {};

/* ---- helpers ----------------------------------------------------------- */
const app = () => document.getElementById('app');
const txt = () => app().textContent || '';
const primary = () => app().querySelector('.btn--primary');
const byText = (sel, needle) =>
  [...app().querySelectorAll(sel)].find((n) => (n.textContent || '').includes(needle));

function setInput(id, value) {
  const ctrl = document.getElementById(id);
  assert.ok(ctrl, `input #${id} should exist`);
  ctrl.value = value;
  ctrl.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function fireHashChange() {
  window.dispatchEvent(new window.Event('hashchange'));
}
/* Let pending async work (the real, awaited auth calls and dynamic imports) settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/* Warm the module cache for every view so dynamic import() resolves as a
   microtask in tests (cache hit), keeping settle() reliable. */
await Promise.all([
  import('../src/js/views/landing.js'),
  import('../src/js/views/signup.js'),
  import('../src/js/views/onboarding.js'),
  import('../src/js/views/dashboard.js'),
  import('../src/js/views/profile.js'),
  import('../src/js/views/resetPassword.js'),
  import('../src/js/views/notFound.js'),
]);

/* Inject the in-memory auth client BEFORE the app boots, so app.js skips its
   browser-only (CDN) client and runs entirely offline. */
configureAuth(createFakeSupabase());

/* Boot the app. app.js registers routes then starts the router once the auth
   session is restored; `ready` resolves when that initial render is done. */
const appModule = await import('../src/js/app.js');
await appModule.ready;

/* ---- the walk ---------------------------------------------------------- */
test('1. landing page renders with a single primary CTA', () => {
  const cta = primary();
  assert.ok(cta, 'landing should have a primary CTA');
  assert.match(cta.textContent, /Create my profile/i);
  assert.equal(app().querySelectorAll('.btn--primary').length, 1,
    'exactly one primary CTA on the landing page');
});

test('2. CTA navigates to the signup screen', async () => {
  primary().click();           // onClick -> nav('/signup')
  fireHashChange();            // force deterministic route resolution
  await settle();              // wait for dynamic import of signup.js
  assert.ok(document.getElementById('f-email'), 'signup email field present');
  assert.ok(document.getElementById('f-password'), 'signup password field present');
});

test('3. signup creates an account and enters the wizard', async () => {
  setInput('f-email', 'newuser@example.com');
  setInput('f-password', 'secret123');
  app().querySelector('form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();              // signup is async — let signUp() + nav resolve
  fireHashChange();            // signup -> nav('/onboarding')
  await settle();              // wait for dynamic import of onboarding.js
  assert.ok(app().querySelector('[role="progressbar"]'),
    'wizard progress stepper should be visible');
});

test('4. wizard step 1 is pre-filled (no empty state)', () => {
  const name = document.getElementById('f-displayName');
  assert.ok(name, 'display name field present');
  assert.ok(name.value.trim().length > 0, 'display name pre-filled by smart defaults');
});

test('5. step 2 starts with >= 2 seeded content blocks', () => {
  primary().click();           // Continue -> step 2
  const rows = app().querySelectorAll('.block-row');
  assert.ok(rows.length >= 2, `expected >=2 seeded blocks, got ${rows.length}`);
});

test('6. step 3 shows the review + publish CTA', () => {
  primary().click();           // Continue -> step 3
  const publish = byText('.btn--primary', 'Publish');
  assert.ok(publish, 'publish CTA present on review step');
});

test('7. publishing reaches the first-value moment (shareable URL)', () => {
  byText('.btn--primary', 'Publish').click();   // doPublish()
  const url = app().querySelector('.share-box__url');
  assert.ok(url, 'success screen shows a shareable URL');
  assert.match(url.textContent, /#\/u\//, 'URL is a shareable profile link');
  assert.match(txt(), /published/i, 'success copy confirms the profile is live');
});

test('8. store confirms CEO success definition: published && blocks >= 1', async () => {
  const { getProfile } = await import('../src/js/store.js');
  const p = getProfile();
  assert.equal(p.published, true, 'profile.published must be true');
  assert.ok(p.blocks.length >= 1, 'profile must have >= 1 content block');
  assert.ok(p.slug, 'profile has a shareable slug');
});

test('9. the public profile page renders at #/u/:slug', async () => {
  const { getProfile } = await import('../src/js/store.js');
  const slug = getProfile().slug;
  window.location.hash = `#/u/${slug}`;
  fireHashChange();
  await settle();              // wait for dynamic import of profile.js
  assert.ok(app().querySelector('.profile-card'), 'public profile card renders');
  assert.ok(app().querySelector('.profile-name'), 'public profile shows a name');
});

test('10. funnel metrics record signup + publish events', async () => {
  const { getEvents, getFunnel } = await import('../src/js/metrics.js');
  const events = getEvents().map((e) => e.event);
  assert.ok(events.includes('signup_complete'), 'signup_complete tracked');
  assert.ok(events.includes('profile_published'), 'profile_published tracked');
  const funnel = getFunnel();
  assert.ok(funnel.publishes >= 1, 'funnel counts at least one publish');
});
