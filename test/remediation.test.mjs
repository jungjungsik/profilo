/* ==========================================================================
   remediation.test.mjs — JUN-7 UX/UI remediation verification

   Verifies the top-3 audit fixes, each with its defined success metric:

     Fix 1  CTA clarity        — one primary CTA per screen; the landing CTA
                                 records a signup_start event; getFunnel()
                                 exposes signupStartRate (landing → signup
                                 click-through, target >= 25%).
     Fix 2  Mobile 360px       — every interactive control declares a
                                 >= 44px touch target in the stylesheet.
     Fix 3  Navigation clarity — a consistent global nav puts the editor one
                                 click away from every signed-in screen;
                                 reaching the editor records edit_profile
                                 (profile-edit task, target success >= 90%).

   Driven through the real UI inside jsdom, the same way smoke.dom.test.mjs
   walks the first-value path. Run with: npm test
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { configureAuth } from '../src/js/auth.js';
import { createFakeSupabase } from './helpers/fake-supabase.js';

/* ---- DOM environment ---------------------------------------------------- */
const dom = new JSDOM(
  '<!doctype html><html><body><div id="app"></div></body></html>',
  { url: 'http://localhost:4173/', pretendToBeVisual: true },
);
const { window } = dom;

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
const primaries = () => app().querySelectorAll('.btn--primary');
const byText = (sel, needle) =>
  [...app().querySelectorAll(sel)].find((n) => (n.textContent || '').includes(needle));

function setInput(id, value) {
  const ctrl = document.getElementById(id);
  assert.ok(ctrl, `input #${id} should exist`);
  ctrl.value = value;
  ctrl.dispatchEvent(new window.Event('input', { bubbles: true }));
}
const fireHashChange = () => window.dispatchEvent(new window.Event('hashchange'));
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

/* Boot the real app offline against the in-memory auth fake. */
configureAuth(createFakeSupabase());
const appModule = await import('../src/js/app.js');
await appModule.ready;

const { getEvents, getFunnel } = await import('../src/js/metrics.js');
const hasEvent = (name) => getEvents().some((e) => e.event === name);

/* ==========================================================================
   Fix 2 — mobile responsive: touch targets >= 44px
   A static stylesheet assertion: jsdom does not lay out CSS, so we verify the
   source of truth. This is the regression guard for "360px P1 breakage = 0".
   ========================================================================== */
test('Fix 2: every interactive touch target declares >= 44px in the stylesheet', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../src/css/styles.css', import.meta.url)), 'utf8');

  /* Grab the declaration body of a top-level "selector { ... }" rule. */
  const ruleFor = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[},])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm');
    const m = re.exec(css);
    assert.ok(m, `stylesheet should define a "${selector}" rule`);
    return m[2];
  };
  const px = (decls, prop) => {
    const m = new RegExp(`${prop}\\s*:\\s*(\\d+)px`).exec(decls);
    return m ? Number(m[1]) : null;
  };

  /* Height-based controls: min-height must reach 44px. */
  for (const sel of ['.btn', '.btn--sm', '.btn--lg', '.btn--ghost',
                      '.link-action', '.nav-link']) {
    const h = px(ruleFor(sel), 'min-height');
    assert.ok(h !== null && h >= 44, `${sel} min-height must be >= 44px (got ${h})`);
  }

  /* Square icon controls: both width and height must reach 44px. */
  for (const sel of ['.icon-btn', '.swatch']) {
    const decls = ruleFor(sel);
    const w = px(decls, 'width');
    const h = px(decls, 'height');
    assert.ok(w !== null && w >= 44, `${sel} width must be >= 44px (got ${w})`);
    assert.ok(h !== null && h >= 44, `${sel} height must be >= 44px (got ${h})`);
  }
});

/* ==========================================================================
   Fix 1 — CTA clarity
   ========================================================================== */
test('Fix 1: the landing page shows exactly one primary CTA', () => {
  assert.equal(primaries().length, 1, 'landing must have exactly one primary CTA');
  assert.match(primaries()[0].textContent, /Create my profile/i);
});

test('Fix 1: clicking the landing CTA records a signup_start event', async () => {
  assert.equal(hasEvent('signup_start'), false, 'no signup_start before the click');
  primaries()[0].click();          // track(SIGNUP_START) + nav('/signup')
  fireHashChange();
  await settle();                  // wait for dynamic import of signup.js
  assert.equal(hasEvent('signup_start'), true, 'CTA click tracks signup_start');
  assert.ok(document.getElementById('f-email'), 'CTA routed to the signup screen');
});

test('Fix 1: getFunnel exposes signupStartRate (landing → signup click-through)', () => {
  const f = getFunnel();
  assert.equal(typeof f.signupStartRate, 'number', 'signupStartRate is computed');
  assert.ok(f.landingViews >= 1, 'at least one landing view recorded');
  assert.ok(f.signupStarts >= 1, 'at least one signup start recorded');
  assert.equal(f.signupStartRate, f.signupStarts / f.landingViews,
    'signupStartRate = signupStarts / landingViews');
});

test('Fix 1: publishing reaches a success screen with exactly one primary CTA', async () => {
  setInput('f-email', 'remediation@example.com');
  setInput('f-password', 'secret123');
  app().querySelector('form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();                              // async signUp() + nav resolve
  fireHashChange();                            // -> /onboarding wizard
  await settle();                              // wait for dynamic import of onboarding.js
  assert.ok(app().querySelector('[role="progressbar"]'), 'wizard renders');

  byText('.btn--primary', 'Continue').click(); // step 1 -> 2
  byText('.btn--primary', 'Continue').click(); // step 2 -> 3
  byText('.btn--primary', 'Publish').click();  // publish -> success

  assert.match(txt(), /published/i, 'reached the success screen');
  assert.equal(primaries().length, 1, 'success screen has exactly one primary CTA');
  assert.match(primaries()[0].textContent, /View my profile/i,
    'the single primary CTA is "View my profile"');
});

/* ==========================================================================
   Fix 3 — navigation / layout clarity
   ========================================================================== */
test('Fix 3: the success screen carries the consistent global nav', () => {
  assert.ok(app().querySelector('.global-nav'), 'global nav present on success screen');
  assert.ok(byText('.nav-link', 'Edit profile'), '"Edit profile" link present');
  assert.ok(byText('.nav-link', 'Dashboard'), '"Dashboard" link present');
});

test('Fix 3: "Edit profile" is a one-click route into the editor', async () => {
  byText('.nav-link', 'Edit profile').click();   // a single click
  fireHashChange();
  await settle();              // wait for dynamic import of onboarding.js
  assert.ok(app().querySelector('[role="progressbar"]'),
    'one click on "Edit profile" opens the editor wizard');
});

test('Fix 3: reaching the editor records an edit_profile event', () => {
  assert.equal(hasEvent('edit_profile'), true,
    'opening the editor on an existing profile tracks edit_profile');
  assert.ok(getFunnel().editProfileEntries >= 1,
    'funnel counts at least one edit-profile entry');
});

test('Fix 3: the dashboard carries the same global nav (consistency)', async () => {
  window.location.hash = '#/dashboard';
  fireHashChange();
  await settle();              // wait for dynamic import of dashboard.js
  assert.ok(app().querySelector('.global-nav'), 'global nav present on the dashboard');
  assert.ok(byText('.nav-link', 'Edit profile'),
    'dashboard keeps "Edit profile" one click away');
});
