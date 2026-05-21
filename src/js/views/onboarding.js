/* ==========================================================================
   views/onboarding.js — the 3-step activation wizard (core deliverable)

   Step 1  Who are you?     — identity, pre-filled, live avatar preview
   Step 2  What to show?    — content-block editor (starts with 2 seeded blocks)
   Step 3  Review & publish — live profile preview + publish + success moment

   Principles enforced here:
   - ensureProfile() runs on entry so NO step ever shows an empty form.
   - Every edit is persisted to the store immediately (Back / refresh safe).
   - Exactly ONE primary CTA per step.
   - publishProfile() requires >=1 block; step 2 keeps that invariant.
   ========================================================================== */

import {
  el, mount, button, field, appShell, avatar, banner, toast,
  progressStepper, copyToClipboard, shareUrl, globalNav,
} from '../components.js';
import { currentUser } from '../auth.js';
import {
  ensureProfile, getProfile, updateProfile,
  addBlock, updateBlock, removeBlock, moveBlock, publishProfile,
} from '../store.js';
import { track, EVENTS } from '../metrics.js';
import { profileCard } from './profile.js';

const nav = (path) => window.__profilo_navigate(path);

const STEP_LABELS = ['Who you are', 'What to show', 'Review & publish'];
const TOTAL_STEPS = 3;

/* Avatar color options — coherent with the brand palette. */
const AVATAR_COLORS = [
  '#1f8a5a', '#0f5132', '#2563a8', '#7a4ec2',
  '#c2562e', '#b3261e', '#1a1c1a', '#c79a1e',
];

export function render() {
  /* A returning user with a profile already on file is opening the EDITOR,
     not running first-time onboarding — record it so the team can measure the
     "profile edit" task (JUN-7 navigation-clarity metric). */
  if (getProfile()) track(EVENTS.EDIT_PROFILE);

  /* Pre-fill: create-or-fetch a profile with smart defaults + 2 starter blocks.
     This is what guarantees the wizard is never blank. */
  const profile = ensureProfile();

  const state = {
    step: 1,
    published: false,   // becomes true after a successful publish
    publishError: null,
  };

  /* ---- step transitions ------------------------------------------------ */
  function goToStep(n) {
    state.step = Math.max(1, Math.min(TOTAL_STEPS, n));
    track(EVENTS.ONBOARDING_STEP, { step: state.step });
    rerender();
  }

  function rerender() {
    mount(buildView());
  }

  /* ---- STEP 1 — identity ---------------------------------------------- */
  function buildStep1() {
    const p = getProfile();

    /* Live preview node — updated in place as the user types, so we avoid a
       full re-render on every keystroke (keeps input focus + caret steady). */
    const previewAvatar = avatar(p, 'lg');
    const previewName = el('div', { class: 'identity-preview__name' },
      p.displayName || 'Your name');
    const previewHeadline = el('div', { class: 'identity-preview__headline' },
      p.headline || 'Your headline');

    const refreshPreview = () => {
      const cur = getProfile();
      previewAvatar.style.background = cur.avatarColor;
      previewAvatar.textContent = initialsFrom(cur.displayName);
      previewName.textContent = cur.displayName || 'Your name';
      previewHeadline.textContent = cur.headline || 'Your headline';
    };

    const swatches = AVATAR_COLORS.map((color) =>
      el('button', {
        type: 'button',
        class: `swatch${p.avatarColor === color ? ' swatch--active' : ''}`,
        style: { background: color },
        'aria-label': `Avatar color ${color}`,
        'aria-pressed': p.avatarColor === color ? 'true' : 'false',
        onClick: (e) => {
          updateProfile({ avatarColor: color });
          /* update swatch selection without a full rerender */
          e.currentTarget.parentElement
            .querySelectorAll('.swatch')
            .forEach((s) => {
              s.classList.remove('swatch--active');
              s.setAttribute('aria-pressed', 'false');
            });
          e.currentTarget.classList.add('swatch--active');
          e.currentTarget.setAttribute('aria-pressed', 'true');
          refreshPreview();
        },
      }),
    );

    return el('div', { class: 'stack reveal' }, [
      el('div', { class: 'identity-preview' }, [
        previewAvatar,
        el('div', { class: 'identity-preview__meta' }, [
          previewName,
          previewHeadline,
        ]),
      ]),

      field({
        name: 'displayName',
        label: 'Display name',
        value: p.displayName || '',
        placeholder: 'e.g. Maya Okafor',
        maxLength: 50,
        autocomplete: 'name',
        onInput: (v) => {
          updateProfile({ displayName: v });
          refreshPreview();
        },
      }),

      field({
        name: 'headline',
        label: 'Headline',
        hint: 'One line about you',
        value: p.headline || '',
        placeholder: 'e.g. Product designer & ceramicist',
        maxLength: 80,
        onInput: (v) => {
          updateProfile({ headline: v });
          refreshPreview();
        },
      }),

      field({
        name: 'bio',
        label: 'Short bio',
        hint: 'A friendly intro',
        value: p.bio || '',
        placeholder: 'Tell visitors what you’re about…',
        multiline: true,
        rows: 3,
        maxLength: 240,
        onInput: (v) => updateProfile({ bio: v }),
      }),

      el('div', { class: 'field' }, [
        el('span', { class: 'field__label' }, [
          el('span', {}, 'Avatar color'),
        ]),
        el('div', { class: 'swatches' }, swatches),
      ]),
    ]);
  }

  /* ---- STEP 2 — content blocks ---------------------------------------- */
  function buildStep2() {
    const p = getProfile();
    const blocks = p.blocks || [];

    const list = el('div', { class: 'blocks reveal-stagger' },
      blocks.map((block, idx) => blockRow(block, idx, blocks.length)));

    const addRow = el('div', { class: 'block-add' }, [
      button('Add text', {
        variant: 'secondary',
        icon: '✎',
        onClick: () => {
          addBlock({ type: 'text', label: '', value: '' });
          rerender();
          toast('Text block added', 'default');
        },
      }),
      button('Add link', {
        variant: 'secondary',
        icon: '🔗',
        onClick: () => {
          addBlock({ type: 'link', label: '', value: '' });
          rerender();
          toast('Link block added', 'default');
        },
      }),
    ]);

    return el('div', { class: 'stack' }, [
      el('p', { class: 'subtitle' },
        'These appear on your profile. We’ve added two to get you started — '
        + 'edit them, reorder, or add your own.'),
      blocks.length
        ? list
        : el('div', { class: 'empty-hint' },
            'Add at least one block so you can publish.'),
      addRow,
      el('p', { class: 'faint', style: { 'font-size': '0.78rem', 'text-align': 'center' } },
        `${blocks.length} block${blocks.length === 1 ? '' : 's'} · `
        + 'you need at least one to publish'),
    ]);
  }

  /* A single editable content-block row. */
  function blockRow(block, idx, total) {
    const isLink = block.type === 'link';

    const fields = isLink
      ? [
          field({
            name: `b-${block.id}-label`,
            value: block.label || '',
            placeholder: 'Link text — e.g. See my portfolio',
            maxLength: 60,
            onInput: (v) => updateBlock(block.id, { label: v }),
          }),
          field({
            name: `b-${block.id}-value`,
            value: block.value || '',
            type: 'url',
            inputmode: 'url',
            placeholder: 'https://…',
            onInput: (v) => updateBlock(block.id, { value: v }),
          }),
        ]
      : [
          field({
            name: `b-${block.id}-label`,
            value: block.label || '',
            placeholder: 'Label — e.g. About',
            maxLength: 40,
            onInput: (v) => updateBlock(block.id, { label: v }),
          }),
          field({
            name: `b-${block.id}-value`,
            value: block.value || '',
            placeholder: 'Write something…',
            multiline: true,
            rows: 2,
            maxLength: 280,
            onInput: (v) => updateBlock(block.id, { value: v }),
          }),
        ];

    const canDelete = total > 1;   // never let the last block be removed

    return el('div', { class: 'block-row' }, [
      el('div', { class: 'block-row__handle' }, [
        el('span', {
          class: 'block-row__type',
          'aria-hidden': 'true',
          title: isLink ? 'Link block' : 'Text block',
        }, isLink ? '🔗' : '✎'),
      ]),

      el('div', { class: 'block-row__body' }, [
        el('span', { class: 'block-row__tag' }, isLink ? 'Link' : 'Text'),
        ...fields,
      ]),

      el('div', { class: 'block-row__actions' }, [
        iconButton('↑', 'Move up', idx === 0, () => {
          moveBlock(block.id, -1);
          rerender();
        }),
        iconButton('↓', 'Move down', idx === total - 1, () => {
          moveBlock(block.id, 1);
          rerender();
        }),
        iconButton('✕', 'Remove block', !canDelete, () => {
          removeBlock(block.id);
          rerender();
          toast('Block removed', 'default');
        }, 'danger'),
      ]),
    ]);
  }

  function iconButton(glyph, label, disabled, onClick, variant) {
    return el('button', {
      type: 'button',
      class: `icon-btn${variant === 'danger' ? ' icon-btn--danger' : ''}`,
      'aria-label': label,
      title: label,
      disabled,
      onClick,
    }, glyph);
  }

  /* ---- STEP 3 — review & publish -------------------------------------- */
  function buildStep3() {
    const p = getProfile();
    const blockCount = (p.blocks || []).length;
    const canPublish = blockCount >= 1;

    return el('div', { class: 'stack reveal' }, [
      el('p', { class: 'subtitle' },
        'Here’s your profile exactly as visitors will see it. '
        + 'Looks good? Publish to get your shareable link.'),

      state.publishError ? banner(state.publishError, 'error') : null,

      !canPublish
        ? banner('Add at least one content block in step 2 before publishing.', 'error')
        : null,

      el('div', { class: 'profile-canvas' }, [profileCard(p)]),

      button('Publish my profile', {
        variant: 'primary',
        size: 'lg',
        block: true,
        icon: '✦',
        disabled: !canPublish,
        onClick: doPublish,
      }),
    ]);
  }

  function doPublish() {
    state.publishError = null;
    try {
      const published = publishProfile();
      const user = currentUser();
      track(EVENTS.ONBOARDING_COMPLETE);
      track(EVENTS.PROFILE_PUBLISHED, {
        userId: user ? user.id : null,
        slug: published.slug,
      });
      state.published = true;
      rerender();
    } catch (err) {
      state.publishError = err && err.message
        ? err.message
        : 'We couldn’t publish your profile. Please try again.';
      rerender();
    }
  }

  /* ---- SUCCESS — the first-value moment ------------------------------- */
  function buildSuccess() {
    const p = getProfile();
    const url = shareUrl(p.slug);

    const copyBtn = button('Copy', {
      variant: 'secondary',
      size: 'sm',
      onClick: async (e) => {
        const ok = await copyToClipboard(url);
        if (ok) {
          e.target.textContent = 'Copied ✓';
          toast('Link copied to clipboard', 'success');
          setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
        } else {
          toast('Press and hold the link to copy', 'error');
        }
      },
    });

    return appShell({
      onBrandClick: () => nav('/'),
      headerRight: globalNav(),
    }, [
      el('section', { class: 'section success reveal' }, [
        el('div', { class: 'success__burst', 'aria-hidden': 'true' }, '✦'),
        el('p', { class: 'eyebrow' }, 'You’re live'),
        el('h1', { class: 'display' }, 'Your profile is published!'),
        el('p', { class: 'subtitle', style: { 'margin-top': '0.5rem' } },
          'Share this link anywhere — it works on every device.'),

        el('div', { class: 'share-box' }, [
          el('span', { class: 'share-box__url', title: url }, url),
          copyBtn,
        ]),

        el('div', { class: 'success__actions' }, [
          /* One primary CTA per screen: viewing the live profile is the
             headline next step right after publishing. */
          button('View my profile', {
            variant: 'primary',
            size: 'lg',
            block: true,
            icon: '↗',
            onClick: () => nav(`/u/${p.slug}`),
          }),
          button('Go to my dashboard', {
            variant: 'ghost',
            block: true,
            onClick: () => nav('/dashboard'),
          }),
        ]),
      ]),
    ]);
  }

  /* ---- composite view ------------------------------------------------- */
  function buildWizardNav() {
    const isLast = state.step === TOTAL_STEPS;
    const isFirst = state.step === 1;

    /* Step 3 has its own primary CTA (Publish) inside the body, so the nav
       there only carries a Back button — preserving one-primary-per-screen. */
    if (isLast) {
      return el('div', { class: 'wizard__nav' }, [
        button('Back', {
          variant: 'secondary',
          icon: '←',
          onClick: () => goToStep(state.step - 1),
        }),
        el('span', { style: { flex: '1' } }),
      ]);
    }

    return el('div', { class: 'wizard__nav' }, [
      !isFirst
        ? button('Back', {
            variant: 'secondary',
            icon: '←',
            onClick: () => goToStep(state.step - 1),
          })
        : null,
      button('Continue', {
        variant: 'primary',
        onClick: () => goToStep(state.step + 1),
        attrs: { 'aria-label': `Continue to step ${state.step + 1}` },
      }),
    ]);
  }

  function buildView() {
    if (state.published) return buildSuccess();

    let body;
    if (state.step === 1) body = buildStep1();
    else if (state.step === 2) body = buildStep2();
    else body = buildStep3();

    const headings = [
      ['Who are you?', 'Start with the basics. We’ve filled in a draft for you.'],
      ['What do you want to show?', 'Add the content visitors should see.'],
      ['Review & publish', 'One last look before you go live.'],
    ];
    const [title, sub] = headings[state.step - 1];

    return appShell({
      onBrandClick: () => nav('/dashboard'),
      headerRight: globalNav('editor'),
    }, [
      el('section', { class: 'section wizard' }, [
        el('div', { class: 'wizard__head' }, [
          progressStepper(state.step, TOTAL_STEPS, STEP_LABELS),
        ]),
        el('div', { class: 'wizard__heading stack-sm' }, [
          el('h1', { class: 'title' }, title),
          el('p', { class: 'subtitle' }, sub),
        ]),
        el('div', { class: 'wizard__body' }, [body]),
        buildWizardNav(),
      ]),
    ]);
  }

  /* Entry: record step 1 view, then render. */
  track(EVENTS.ONBOARDING_STEP, { step: 1 });
  rerender();
}

/* Small local copy of initials logic for the in-place preview refresh. */
function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
