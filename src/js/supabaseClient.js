/**
 * supabaseClient.js — constructs the real Supabase client (browser only).
 *
 * Kept in its own module so the CDN ESM import never reaches Node's static
 * module graph: auth.js stays import-clean for `node --test`, and app.js
 * pulls this in with a dynamic import() during browser boot only.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

/**
 * Create a configured Supabase client. Sessions persist to localStorage and
 * auto-refresh, so a signed-in user survives a page reload.
 * @returns {object} a Supabase client exposing the `auth.*` surface.
 */
export function createSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
