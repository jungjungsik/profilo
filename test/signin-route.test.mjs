/* ==========================================================================
   signin-route.test.mjs — JUN-15 verification

   Gap G5: the landing "Sign in" link routed to '/signup', which opens the
   account-creation form. A returning visitor then had to notice and click
   "Sign in instead" — an extra step on a high-intent action.

   Fix: a dedicated '/signin' route opens the same auth view pre-set to
   sign-in mode, and the landing "Sign in" link points there.

   Success metric: a returning visitor reaches the sign-in screen in ONE click.

   Driven through the real UI inside jsdom, the same way smoke.dom.test.mjs
   walks the first-value path. Run with: npm test
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
const byText = (sel, needle) =>
  [...app().querySelectorAll(sel)].find((n) => (n.textContent || '').includes(needle));
const fireHashChange = () => window.dispatchEvent(new window.Event('hashchange'));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/* Warm the module cache so dynamic import() resolves as a microtask. */
await Promise.all([
  import('../src/js/views/landing.js'),
  import('../src/js/views/signup.js'),
  import('../src/js/views/onboarding.js'),
  import('../src/js/views/dashboard.js'),
  import('../src/js/views/profile.js'),
  import('../src/js/views/resetPassword.js'),
  import('../src/js/views/notFound.js'),
]);

/* Boot the real app offline against the in-memory auth fake (no session). */
configureAuth(createFakeSupabase());
const appModule = await import('../src/js/app.js');
await appModule.ready;

/* ==========================================================================
   The fix
   ========================================================================== */
test('landing "Sign in" link reaches the sign-in screen in one click', async () => {
  /* Land on the marketing page first. */
  window.location.hash = '#/';
  fireHashChange();
  await settle();

  const signIn = byText('.link-action', 'Sign in');
  assert.ok(signIn, 'the landing page exposes a "Sign in" link');

  signIn.click();              // onClick -> nav('/signin')
  fireHashChange();            // force deterministic route resolution
  await settle();              // wait for dynamic import of signup.js

  assert.match(txt(), /Welcome back/i,
    'one click on "Sign in" opens the sign-in screen');
  assert.doesNotMatch(txt(), /Create your account/i,
    'the signup ("Create your account") heading is NOT shown — no extra toggle');
});

test('#/signin opens the auth view in sign-in mode', async () => {
  window.location.hash = '#/signin';
  fireHashChange();
  await settle();

  assert.match(txt(), /Welcome back/i, '#/signin renders the sign-in screen');
  assert.ok(byText('.link-action', 'Create an account'),
    'sign-in screen still offers a toggle to create an account');
});

test('#/signup is unchanged — still opens in signup mode', async () => {
  window.location.hash = '#/signup';
  fireHashChange();
  await settle();

  assert.match(txt(), /Create your account/i, '#/signup still defaults to signup');
  assert.ok(byText('.link-action', 'Sign in instead'),
    'signup screen still offers the "Sign in instead" toggle');
});
