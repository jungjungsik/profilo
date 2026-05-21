/* ==========================================================================
   app.js — application bootstrap
   Builds the hash router, registers routes, wires guards, restores the auth
   session, and starts routing.

   Views are lazy-loaded per route with dynamic import() so the landing
   visitor only downloads landing.js, not all 7 view modules.
   ========================================================================== */

import { Router } from './router.js';
import {
  isAuthenticated, isAuthConfigured, configureAuth, authReady,
} from './auth.js';
import { getProfile } from './store.js';
import { initErrorTracking } from './errorTracking.js';

const router = new Router();

/* Make the router available to every view for navigation, without each view
   needing to import the singleton instance. */
window.__profilo_navigate = (path) => router.navigate(path);

/* ---- Route guard helper ----------------------------------------------- */
function requireAuth(render) {
  return async (ctx) => {
    if (!isAuthenticated()) {
      router.navigate('/signup');
      return;
    }
    await render(ctx);
  };
}

/* ---- Routes ------------------------------------------------------------ */
router.add('/', async () => {
  /* If a returning user is already authenticated, send them to the place
     that matches their progress: dashboard. The landing page is for
     first-time / signed-out visitors. */
  if (isAuthenticated()) {
    const existing = getProfile();
    router.navigate(existing ? '/dashboard' : '/onboarding');
    return;
  }
  const { render } = await import('./views/landing.js');
  render();
});

router.add('/signup', async () => {
  /* Already signed in? No reason to see the signup screen. */
  if (isAuthenticated()) {
    router.navigate('/dashboard');
    return;
  }
  const { render } = await import('./views/signup.js');
  render('signup');
});

/* Same auth screen, opened straight to sign-in mode. A returning visitor who
   clicks "Sign in" should land on "Welcome back" in one click rather than the
   signup form they then have to toggle out of (JUN-15). */
router.add('/signin', async () => {
  if (isAuthenticated()) {
    router.navigate('/dashboard');
    return;
  }
  const { render } = await import('./views/signup.js');
  render('signin');
});

router.add('/onboarding', requireAuth(async () => {
  const { render } = await import('./views/onboarding.js');
  render();
}));

router.add('/dashboard', requireAuth(async () => {
  const { render } = await import('./views/dashboard.js');
  render();
}));

router.add('/u/:slug', async ({ params }) => {
  const { render } = await import('./views/profile.js');
  render(params.slug);
});

// Supabase redirects here after the user clicks the password-reset email link.
router.add('/reset-password', async () => {
  const { render } = await import('./views/resetPassword.js');
  render();
});

router.notFound(async () => {
  const { render } = await import('./views/notFound.js');
  render();
});

/* ---- Boot -------------------------------------------------------------- */
/* Wire the auth client and restore any persisted session BEFORE routing, so
   the "/" redirect and route guards see the real signed-in state on a fresh
   page load — this is what makes a session survive a reload.

   The test suite injects an in-memory client before importing this module, so
   the dynamic import below (and its CDN dependency) runs in the browser only.
   `ready` is exported so tests can await a fully-booted app. */
export const ready = (async () => {
  initErrorTracking();
  if (!isAuthConfigured()) {
    const { createSupabaseClient } = await import('./supabaseClient.js');
    const _supabase = createSupabaseClient();
    configureAuth(_supabase);
    window.__profilo_supabase = _supabase;
  }
  await authReady();
  await router.start();
})();
