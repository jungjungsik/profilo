import { readFileSync } from 'fs';
import { join } from 'path';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/js/config.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    res.status(400).end('Invalid slug');
    return;
  }

  let profile = null;
  try {
    const supaRes = await fetch(
      `${SUPABASE_URL}/rest/v1/public_profiles?slug=eq.${encodeURIComponent(slug)}&select=display_name,headline,bio,avatar_color,slug&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    const rows = await supaRes.json();
    profile = Array.isArray(rows) ? rows[0] : null;
  } catch {
    // serve generic page on fetch failure
  }

  const baseHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');

  if (!profile) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
    res.end(baseHtml);
    return;
  }

  const name = escapeHtml(profile.display_name);
  const headline = escapeHtml(profile.headline);
  const bio = escapeHtml(profile.bio);
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'profilo.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const profileUrl = `${proto}://${host}/u/${slug}`;

  const injectedTags = `
  <title>${name} — Profilo</title>
  <link rel="canonical" href="${profileUrl}" />
  <meta property="og:title" content="${name} — Profilo" />
  <meta property="og:description" content="${headline || bio || 'View this profile on Profilo.'}" />
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${profileUrl}" />
  <meta property="og:site_name" content="Profilo" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${name}" />
  <meta name="twitter:description" content="${headline || bio || 'View this profile on Profilo.'}" />`;

  const html = baseHtml
    .replace(/<title>[^<]*<\/title>/, '')
    .replace('</head>', `${injectedTags}\n</head>`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  res.end(html);
}
