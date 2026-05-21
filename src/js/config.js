/**
 * config.js — shared Supabase project configuration.
 *
 * Plain constants only — no CDN ESM imports — so this module stays in the
 * `node --test` static graph cleanly. Both supabaseClient.js (the browser
 * auth client) and metrics.js (the telemetry sink) read the project URL and
 * anon key from here instead of hard-coding their own copies.
 *
 * SUPABASE_ANON_KEY is a public, RLS-gated key. It is designed to ship in
 * client code: every table it can reach is protected by row-level security.
 */

export const SUPABASE_URL = 'https://ztyvlgvxffssyamsibpf.supabase.co';

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0eXZsZ3Z4ZmZzc3lhbXNpYnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MzU0MTYsImV4cCI6MjA3ODIxMTQxNn0.7tNgomPNQMgkv90KmmpG3gfpeeUu1fKrJ5rkmvbLU-M';
