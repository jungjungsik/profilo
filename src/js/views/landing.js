/* ==========================================================================
   views/landing.js — marketing landing page
   ONE dominant primary CTA. Shows a sample profile so visitors see the
   outcome before they commit.
   ========================================================================== */

import { el, mount, button, appShell, avatar } from '../components.js';
import { track, EVENTS } from '../metrics.js';

const nav = (path) => window.__profilo_navigate(path);

/* A static sample profile so the landing page is never abstract. */
const SAMPLE = {
  displayName: 'Maya Okafor',
  headline: 'Product designer & ceramicist',
  avatarColor: '#1f8a5a',
};

function valuePoint(title, detail) {
  return el('div', { class: 'value-point' }, [
    el('span', { class: 'value-point__tick', 'aria-hidden': 'true' }, '✓'),
    el('span', {}, [
      el('strong', {}, title + ' '),
      detail,
    ]),
  ]);
}

/* Compact preview of what a finished profile looks like. */
function samplePreview() {
  return el('div', { class: 'landing-hero__art' }, [
    el('div', { class: 'glow', 'aria-hidden': 'true' }),
    el('div', { class: 'preview-card reveal' }, [
      el('span', { class: 'preview-card__badge' }, 'Live profile'),
      el('div', { class: 'stack-sm', style: { 'text-align': 'center' } }, [
        el('div', { style: { display: 'flex', 'justify-content': 'center' } },
          avatar(SAMPLE, 'lg')),
        el('div', { class: 'profile-name', style: { 'margin-top': '0.75rem' } },
          SAMPLE.displayName),
        el('div', { class: 'profile-headline' }, SAMPLE.headline),
      ]),
      el('div', { class: 'profile-blocks' }, [
        el('div', { class: 'pblock-text' }, [
          el('div', { class: 'pblock-text__label' }, 'About'),
          el('div', { class: 'pblock-text__body' },
            'I help small studios ship calmer, more human products.'),
        ]),
        el('div', { class: 'pblock-link' }, [
          el('span', { class: 'pblock-link__label' }, 'See my portfolio'),
          el('span', { class: 'pblock-link__arrow', 'aria-hidden': 'true' }, '↗'),
        ]),
      ]),
    ]),
  ]);
}

export function render() {
  track(EVENTS.LANDING_VIEW);

  const hero = el('div', { class: 'landing-hero' }, [
    /* --- copy column --- */
    el('div', { class: 'stack reveal' }, [
      el('p', { class: 'eyebrow' }, 'Your corner of the internet'),
      el('h1', { class: 'display display--xl' },
        'A shareable profile, ready in minutes.'),
      el('p', { class: 'lead' },
        'Profilo turns who you are into one clean, link-anywhere page — '
        + 'no design skills, no blank pages, no fuss.'),

      el('div', { class: 'value-points' }, [
        valuePoint('Start with smart defaults —', 'we pre-fill everything so you only polish.'),
        valuePoint('Three quick steps —', 'add your story, your links, then publish.'),
        valuePoint('Share one link —', 'works on every phone, every browser.'),
      ]),

      el('div', { class: 'cta-block' }, [
        button('Create my profile', {
          variant: 'primary',
          size: 'lg',
          block: true,
          icon: '✦',
          onClick: () => nav('/signup'),
        }),
        el('p', { class: 'cta-sub muted' }, [
          'Already have an account? ',
          el('button', {
            class: 'link-action',
            onClick: () => nav('/signup'),
          }, 'Sign in'),
        ]),
      ]),
    ]),

    /* --- preview column --- */
    samplePreview(),
  ]);

  const view = appShell({ wide: true, onBrandClick: () => nav('/') }, [
    el('section', { class: 'section landing-hero-wrap' }, [hero]),
  ]);

  mount(view);
}
