/**
 * supabaseClient.js — constructs the real Supabase client (browser only).
 *
 * Kept in its own module so the CDN ESM import never reaches Node's static
 * module graph: auth.js stays import-clean for `node --test`, and app.js
 * pulls this in with a dynamic import() during browser boot only.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ztyvlgvxffssyamsibpf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0eXZsZ3Z4ZmZzc3lhbXNpYnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MzU0MTYsImV4cCI6MjA3ODIxMTQxNn0.7tNgomPNQMgkv90KmmpG3gfpeeUu1fKrJ5rkmvbLU-M';

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
