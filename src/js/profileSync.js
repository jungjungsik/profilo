/**
 * profileSync.js — push a published profile to Supabase public_profiles.
 *
 * Called after publishProfile() succeeds in the onboarding flow.
 * Uses window.__profilo_supabase (the authenticated client set in app.js).
 * Fails silently: localStorage is always the source of truth for the SPA.
 */

/**
 * Upsert the published profile into public_profiles so the Vercel edge
 * function can serve per-profile OG meta tags without client-side JS.
 *
 * @param {object} profile - the full profile object from store.js
 */
export async function syncPublishedProfile(profile) {
  const supabase = typeof window !== 'undefined' && window.__profilo_supabase;
  if (!supabase) return;

  try {
    await supabase.from('public_profiles').upsert(
      {
        slug: profile.slug,
        user_id: profile.userId,
        display_name: profile.displayName || '',
        headline: profile.headline || '',
        bio: profile.bio || '',
        avatar_color: profile.avatarColor || '#1f8a5a',
        blocks: profile.blocks || [],
        published_at: profile.publishedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' },
    );
  } catch {
    // sync failure is non-fatal; the SPA works without it
  }
}
