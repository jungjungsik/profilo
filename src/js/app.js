/* ==========================================================================
   app.js — application bootstrap
   Builds the hash router, registers routes, wires guards, restores the auth
   session, and starts routing.
   ========================================================================== */

import { Router } from './router.js';
import {
  isAuthenticated, isAuthConfigured, configureAuth, authReady,
} from './auth.js';
import { getProfile } from './store.js';
import { initErrorTracking } from './errorTracking.js';

import * as landing       from './views/landing.js';
import * as signup        from './views/signup.js';
import * as onboarding    from './views/onboarding.js';
import * as dashboard     from './views/dashboard.js';
import * as profile       from './views/profile.js';
import * as resetPassword from './views/resetPassword.js';
import * as notFound      from './views/notFound.js';

const router = new Router();

/* Make the router available to every view for navigation, without each view
   needing to import the singleton instance. */
window.__profilo_navigate = (path) => router.navigate(path);

/* ---- Route guard helper ----------------------------------------------- */
function requireAuth(render) {
  return (ctx) => {
    if (!isAuthenticated()) {
      router.navigate('/signup');
      return;
    }
    render(ctx);
  };
}

/* ---- Routes ------------------------------------------------------------ */
router.add('/', () => {
  /* If a returning user is already authenticated, send them to the place
     that matches their progress: dashboard. The landing page is for
     first-time / signed-out visitors. */
  if (isAuthenticated()) {
    const existing = getProfile();
    router.navigate(existing ? '/dashboard' : '/onboarding');
    return;
  }
  landing.render();
});

router.add('/signup', () => {
  /* Already signed in? No reason to see the signup screen. */
  if (isAuthenticated()) {
    router.navigate('/dashboard');
    return;
  }
  signup.render();
});

router.add('/onboarding', requireAuth(() => onboarding.render()));

router.add('/dashboard', requireAuth(() => dashboard.render()));

router.add('/u/:slug', ({ params }) => profile.render(params.slug));

// Supabase redirects here after the user clicks the password-reset email link.
router.add('/reset-password', () => resetPassword.render());

router.notFound(() => notFound.render());

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
    configureAuth(createSupabaseClient());
  }
  await authReady();
  router.start();
})();
