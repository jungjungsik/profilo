/* ==========================================================================
   smoke.dom.test.mjs — end-to-end UI smoke test (JUN-6 acceptance)

   Drives the *real* UI views inside a jsdom DOM, walking the entire
   first-value path: landing -> signup -> 3-step wizard -> publish ->
   public profile. Asserts the CEO success definition is reached:
   profile.published === true AND content blocks >= 1.

   Run with: npm test   (jsdom is a devDependency)
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

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

/* Boot the app. app.js calls router.start() at import time -> renders '/'. */
await import('../src/js/app.js');

/* ---- the walk ---------------------------------------------------------- */
test('1. landing page renders with a single primary CTA', () => {
  const cta = primary();
  assert.ok(cta, 'landing should have a primary CTA');
  assert.match(cta.textContent, /Create my profile/i);
  assert.equal(app().querySelectorAll('.btn--primary').length, 1,
    'exactly one primary CTA on the landing page');
});

test('2. CTA navigates to the signup screen', () => {
  primary().click();           // onClick -> nav('/signup')
  fireHashChange();            // force deterministic route resolution
  assert.ok(document.getElementById('f-email'), 'signup email field present');
  assert.ok(document.getElementById('f-password'), 'signup password field present');
});

test('3. signup creates an account and enters the wizard', () => {
  setInput('f-email', 'newuser@example.com');
  setInput('f-password', 'secret123');
  app().querySelector('form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  fireHashChange();            // signup -> nav('/onboarding')
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
