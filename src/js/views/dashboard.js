/* ==========================================================================
   views/dashboard.js — post-onboarding home for a returning user
   Shows profile status (published / draft), the shareable link if published,
   and the next best action. If there's no profile yet, route to onboarding.
   ========================================================================== */

import {
  el, mount, button, appShell, avatar, banner, toast,
  copyToClipboard, shareUrl,
} from '../components.js';
import { currentUser, signOut } from '../auth.js';
import { getProfile } from '../store.js';

const nav = (path) => window.__profilo_navigate(path);

export function render() {
  const profile = getProfile();

  /* No profile at all → straight into onboarding (never a blank dashboard). */
  if (!profile) {
    nav('/onboarding');
    return;
  }

  const user = currentUser();
  const published = !!profile.published;
  const blockCount = (profile.blocks || []).length;

  function buildView() {
    const statusPill = el('span', {
      class: `status-pill status-pill--${published ? 'published' : 'draft'}`,
    }, [
      el('span', { class: 'status-pill__dot', 'aria-hidden': 'true' }),
      published ? 'Published' : 'Draft',
    ]);

    /* profile summary card */
    const summaryCard = el('div', { class: 'card reveal' }, [
      el('div', { class: 'dash-profile-row' }, [
        avatar(profile, ''),
        el('div', { class: 'dash-profile-row__meta' }, [
          el('div', { class: 'dash-profile-row__name' },
            profile.displayName || 'Your profile'),
          el('div', { class: 'muted', style: { 'font-size': '0.875rem' } },
            profile.headline || 'No headline yet'),
        ]),
      ]),
      el('div', {
        style: { 'margin-top': '1rem', display: 'flex', gap: '0.5rem',
                 'align-items': 'center', 'flex-wrap': 'wrap' },
      }, [
        statusPill,
        el('span', { class: 'faint', style: { 'font-size': '0.78rem' } },
          `${blockCount} content block${blockCount === 1 ? '' : 's'}`),
      ]),
    ]);

    /* share row — only meaningful once published */
    const shareSection = published
      ? el('div', { class: 'card card--brand reveal' }, [
          el('p', { class: 'eyebrow' }, 'Your shareable link'),
          el('div', { class: 'share-box', style: { 'margin-top': '0.75rem' } }, [
            el('span', {
              class: 'share-box__url',
              title: shareUrl(profile.slug),
            }, shareUrl(profile.slug)),
            button('Copy', {
              variant: 'primary',
              size: 'sm',
              onClick: async (e) => {
                const ok = await copyToClipboard(shareUrl(profile.slug));
                if (ok) {
                  e.target.textContent = 'Copied ✓';
                  toast('Link copied', 'success');
                  setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
                } else {
                  toast('Could not copy — select the link manually', 'error');
                }
              },
            }),
          ]),
        ])
      : banner(
          'Your profile is still a draft. Finish onboarding to publish and get a shareable link.',
          'info',
        );

    /* action stack — exactly one primary CTA */
    const actions = el('div', { class: 'dash-actions' }, [
      published
        ? button('View my public profile', {
            variant: 'primary',
            size: 'lg',
            block: true,
            icon: '↗',
            onClick: () => nav(`/u/${profile.slug}`),
          })
        : button('Finish & publish my profile', {
            variant: 'primary',
            size: 'lg',
            block: true,
            icon: '✦',
            onClick: () => nav('/onboarding'),
          }),

      button(published ? 'Edit my profile' : 'Continue editing', {
        variant: 'secondary',
        block: true,
        icon: '✎',
        onClick: () => nav('/onboarding'),
      }),

      button('Sign out', {
        variant: 'ghost',
        block: true,
        onClick: () => {
          signOut();
          toast('Signed out', 'default');
          nav('/');
        },
      }),
    ]);

    return appShell({ onBrandClick: () => nav('/dashboard') }, [
      el('section', { class: 'section stack-lg' }, [
        el('div', { class: 'stack-sm' }, [
          el('p', { class: 'eyebrow' }, 'Your dashboard'),
          el('h1', { class: 'title' },
            user ? greeting(user.email) : 'Welcome back'),
          el('p', { class: 'subtitle' },
            published
              ? 'Your profile is live. Share it, or keep polishing.'
              : 'Pick up where you left off and publish when you’re ready.'),
        ]),
        summaryCard,
        shareSection,
        actions,
      ]),
    ]);
  }

  mount(buildView());
}

/* "Welcome back, name" using the local part of the email. */
function greeting(email) {
  const name = String(email || '').split('@')[0] || 'there';
  const pretty = name.charAt(0).toUpperCase() + name.slice(1);
  return `Welcome back, ${pretty}`;
}
