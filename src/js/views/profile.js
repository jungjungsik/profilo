/* ==========================================================================
   views/profile.js — the PUBLIC published profile page
   This is the product's shop window: what a visitor sees at #/u/<slug>.
   It also exports profileCard() so the onboarding "Review" step can show an
   identical live preview.
   ========================================================================== */

import { el, mount, button, appShell, avatar, hostLabel } from '../components.js';
import { getProfileBySlug } from '../store.js';
import { track, EVENTS } from '../metrics.js';

const nav = (path) => window.__profilo_navigate(path);

/* Slightly darken a hex color for the cover gradient's second stop. */
function darken(hex, amount = 0.32) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#0f5132';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/* Render a single content block. */
function renderBlock(block) {
  if (block.type === 'link') {
    const url = block.value || '#';
    const label = block.label || hostLabel(url) || 'Visit link';
    return el('a', {
      class: 'pblock-link',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, [
      el('span', { class: 'pblock-link__label' }, label),
      el('span', { class: 'pblock-link__arrow', 'aria-hidden': 'true' }, '↗'),
    ]);
  }
  /* text block */
  return el('div', { class: 'pblock-text' }, [
    block.label
      ? el('div', { class: 'pblock-text__label' }, block.label)
      : null,
    el('p', { class: 'pblock-text__body' }, block.value || ''),
  ]);
}

/**
 * profileCard(profile) — the visual profile, framed as a self-contained card.
 * Used both for the public page and the onboarding review preview.
 */
export function profileCard(profile) {
  const color = profile.avatarColor || '#1f8a5a';
  const blocks = Array.isArray(profile.blocks) ? profile.blocks : [];

  return el('article', { class: 'profile-card' }, [
    el('div', {
      class: 'profile-cover',
      style: { '--cover-a': color, '--cover-b': darken(color) },
      'aria-hidden': 'true',
    }),
    el('div', { class: 'profile-body' }, [
      el('div', { class: 'profile-avatar-wrap', style: { 'margin-top': '-58px' } },
        avatar(profile, 'xl')),

      el('div', { class: 'profile-identity' }, [
        el('h1', { class: 'profile-name' }, profile.displayName || 'Untitled profile'),
        profile.headline
          ? el('p', { class: 'profile-headline' }, profile.headline)
          : null,
        profile.bio
          ? el('p', { class: 'profile-bio' }, profile.bio)
          : null,
      ]),

      blocks.length
        ? el('div', { class: 'profile-blocks reveal-stagger' },
            blocks.map(renderBlock))
        : null,
    ]),
  ]);
}

/* Friendly state when a slug doesn't resolve to a published profile. */
function notFoundState() {
  return appShell({ onBrandClick: () => nav('/') }, [
    el('section', { class: 'section notfound reveal' }, [
      el('div', { class: 'notfound__code' }, '∅'),
      el('h1', { class: 'title', style: { 'margin-top': '0.5rem' } },
        'This profile isn’t here'),
      el('p', { class: 'subtitle', style: { 'margin-top': '0.5rem' } },
        'The link may be mistyped, or the profile hasn’t been published yet.'),
      el('div', { style: { 'margin-top': '1.5rem' } }, [
        button('Create your own profile', {
          variant: 'primary',
          size: 'lg',
          block: true,
          onClick: () => nav('/'),
        }),
      ]),
    ]),
  ]);
}

/**
 * render(slug) — public profile route handler.
 */
export function render(slug) {
  const profile = getProfileBySlug(slug);

  if (!profile || !profile.published) {
    mount(notFoundState());
    return;
  }

  track(EVENTS.PROFILE_VIEWED, { slug });

  const view = appShell({ onBrandClick: () => nav('/') }, [
    el('section', { class: 'section profile-page' }, [
      el('div', { class: 'profile-canvas reveal' }, [
        profileCard(profile),
        el('footer', { class: 'profile-footer' }, [
          el('span', {}, 'Made with '),
          el('a', { href: '#/' }, 'Profilo'),
          el('span', {}, ' — build your own in minutes.'),
        ]),
      ]),
    ]),
  ]);

  mount(view);
}
