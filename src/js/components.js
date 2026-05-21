/* ==========================================================================
   components.js — shared UI helpers
   A tiny, dependency-free DOM toolkit. All views build their trees with `el`
   and `mount` so markup stays declarative and DRY.
   ========================================================================== */

/**
 * el(tag, props, children) — declarative DOM builder.
 *
 *   el('button', { class: 'btn', onClick: fn }, 'Save')
 *   el('div', { class: 'card' }, [childA, childB])
 *
 * props special keys:
 *   class      -> className
 *   dataset    -> { k: v } applied to element.dataset
 *   style      -> { k: v } applied to element.style
 *   html       -> innerHTML (use sparingly; prefer text children)
 *   onX        -> addEventListener('x', fn)  (e.g. onClick, onInput)
 *   ref        -> function called with the created node
 * children: string | number | Node | array (nullish entries skipped)
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;

    if (key === 'class' || key === 'className') {
      node.className = value;
    } else if (key === 'dataset') {
      for (const [d, v] of Object.entries(value)) node.dataset[d] = v;
    } else if (key === 'style' && typeof value === 'object') {
      for (const [s, v] of Object.entries(value)) node.style.setProperty(s, v);
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'ref' && typeof value === 'function') {
      // deferred below so the node is fully built first
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') {
      node.value = value;
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, value);
    }
  }

  appendChildren(node, children);

  if (typeof props?.ref === 'function') props.ref(node);
  return node;
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false || child === true) continue;
    if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }
}

/**
 * Signal that the next mount() call is a view transition (route change or
 * wizard step change). mount() consumes this flag to move focus to the new
 * heading and announce it to screen readers without re-reading the full page.
 */
let _focusNextHeading = false;
export function signalViewTransition() {
  _focusNextHeading = true;
}

/** Replace the contents of #app with the given node(s) and scroll to top. */
export function mount(node) {
  const app = document.getElementById('app');
  app.replaceChildren();
  appendChildren(app, node);
  window.scrollTo(0, 0);
  if (_focusNextHeading) {
    _focusNextHeading = false;
    const h1 = app.querySelector('h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
      const announcer = document.getElementById('route-announcer');
      if (announcer) announcer.textContent = h1.textContent;
    }
  }
}

/* ---- Buttons ----------------------------------------------------------- */
/**
 * button(label, { variant, size, onClick, type, block, icon, disabled, attrs })
 * variant: 'primary' | 'secondary' | 'ghost' | 'danger-ghost'
 */
export function button(label, opts = {}) {
  const {
    variant = 'secondary',
    size = '',
    onClick,
    type = 'button',
    block = false,
    icon,
    disabled = false,
    attrs = {},
  } = opts;

  const classes = ['btn', `btn--${variant}`];
  if (size) classes.push(`btn--${size}`);
  if (block) classes.push('btn--block');

  return el('button', {
    class: classes.join(' '),
    type,
    disabled,
    onClick,
    ...attrs,
  }, [
    icon ? el('span', { class: 'btn__icon', 'aria-hidden': 'true' }, icon) : null,
    label,
  ]);
}

/* ---- Form field -------------------------------------------------------- */
/**
 * field({ name, label, value, type, placeholder, hint, error, multiline,
 *         maxLength, onInput, autocomplete, inputmode })
 * Returns a labelled input/textarea row with focus + error styling.
 * The returned node carries `.input` (the control) for direct access.
 */
export function field(opts = {}) {
  const {
    name,
    label,
    value = '',
    type = 'text',
    placeholder = '',
    hint,
    error,
    multiline = false,
    maxLength,
    onInput,
    autocomplete,
    inputmode,
    rows,
  } = opts;

  const id = `f-${name}`;
  const errId = `${id}-err`;
  const controlTag = multiline ? 'textarea' : 'input';

  const control = el(controlTag, {
    id,
    name,
    class: multiline ? 'textarea' : 'input',
    placeholder,
    value,
    'aria-invalid': error ? 'true' : null,
    'aria-describedby': error ? errId : null,
    autocomplete,
    inputmode,
    maxlength: maxLength,
    rows: multiline ? (rows || 3) : null,
    type: multiline ? null : type,
    onInput: onInput
      ? (e) => onInput(e.target.value, e)
      : null,
  });

  const wrap = el('label', {
    class: `field${error ? ' field--error' : ''}`,
    for: id,
  }, [
    label
      ? el('span', { class: 'field__label' }, [
          el('span', {}, label),
          hint ? el('span', { class: 'field__hint' }, hint) : null,
        ])
      : null,
    control,
    error
      ? el('span', { class: 'field__error', id: errId, role: 'alert' }, [
          el('span', { 'aria-hidden': 'true' }, '⚠ '),
          error,
        ])
      : null,
  ]);

  wrap.input = control;
  return wrap;
}

/* ---- Avatar ------------------------------------------------------------ */
/** Derive up-to-2-letter initials from a display name. */
export function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * avatar(profile, size) — initials circle tinted by profile.avatarColor.
 * size: '' (default 64px) | 'sm' | 'lg' | 'xl'
 */
export function avatar(profile, size = '') {
  const color = (profile && profile.avatarColor) || '#1f8a5a';
  const name = (profile && profile.displayName) || '';
  return el('div', {
    class: `avatar${size ? ` avatar--${size}` : ''}`,
    style: { background: color },
    'aria-hidden': 'true',
    title: name || 'Avatar',
  }, initialsOf(name));
}

/* ---- Wizard stepper ---------------------------------------------------- */
/**
 * progressStepper(currentStep, total, labels?) — accessible progress bar.
 * currentStep is 1-based.
 */
export function progressStepper(currentStep, total, labels = []) {
  const segs = [];
  for (let i = 1; i <= total; i++) {
    let mod = '';
    if (i < currentStep) mod = ' stepper__seg--done';
    else if (i === currentStep) mod = ' stepper__seg--active';
    segs.push(el('span', { class: `stepper__seg${mod}` }));
  }

  return el('div', {
    class: 'stepper',
    role: 'progressbar',
    'aria-valuemin': '1',
    'aria-valuemax': String(total),
    'aria-valuenow': String(currentStep),
    'aria-label': `Step ${currentStep} of ${total}`,
  }, [
    el('div', { class: 'stepper__bar' }, segs),
    el('div', { class: 'stepper__meta' }, [
      el('span', { class: 'stepper__count' }, `Step ${currentStep} of ${total}`),
      labels[currentStep - 1]
        ? el('span', { class: 'stepper__label' }, labels[currentStep - 1])
        : null,
    ]),
  ]);
}

/* ---- Toast ------------------------------------------------------------- */
let toastLayer = null;
function ensureToastLayer() {
  if (!toastLayer || !document.body.contains(toastLayer)) {
    toastLayer = el('div', { class: 'toast-layer', 'aria-live': 'polite' });
    document.body.appendChild(toastLayer);
  }
  return toastLayer;
}

/**
 * toast(message, type) — transient bottom-centered notification.
 * type: 'default' | 'success' | 'error'
 */
export function toast(message, type = 'default') {
  const layer = ensureToastLayer();
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  const node = el('div', {
    class: `toast${type !== 'default' ? ` toast--${type}` : ''}`,
    role: 'status',
  }, [
    el('span', { class: 'toast__icon', 'aria-hidden': 'true' }, icon),
    el('span', {}, message),
  ]);
  layer.appendChild(node);

  const remove = () => {
    node.classList.add('toast--leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  };
  setTimeout(remove, 3200);
  return node;
}

/* ---- Banner ------------------------------------------------------------ */
/** Inline, persistent message block. type: 'info' | 'error' */
export function banner(message, type = 'info') {
  const icon = type === 'error' ? '⚠' : 'ℹ';
  return el('div', { class: `banner banner--${type}`, role: type === 'error' ? 'alert' : 'status' }, [
    el('span', { class: 'banner__icon', 'aria-hidden': 'true' }, icon),
    el('span', {}, message),
  ]);
}

/* ---- Brand mark & header ---------------------------------------------- */
export function brandMark(onClick) {
  return el('a', {
    class: 'brand',
    href: '#/',
    'aria-label': 'Profilo — home',
    onClick: onClick
      ? (e) => { e.preventDefault(); onClick(); }
      : null,
  }, [
    el('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'P'),
    el('span', {}, 'Profilo'),
  ]);
}

/**
 * appShell({ wide, headerRight, onBrandClick }, children)
 * Wraps a view with the standard header + a centered content column.
 */
export function appShell(opts = {}, children = []) {
  const { wide = false, headerRight = null, onBrandClick } = opts;
  return el('div', { class: 'app-root' }, [
    el('header', { class: `app-header${wide ? ' app-header--wide' : ''}` }, [
      brandMark(onBrandClick),
      headerRight || el('span'),
    ]),
    el('main', { class: `shell${wide ? ' shell--wide' : ''}` }, children),
  ]);
}

/* ---- Global account nav ------------------------------------------------ */
/**
 * globalNav(current) — consistent header nav for an authenticated user.
 *
 * Renders the same two destinations on every signed-in screen so the editor
 * is always one click away (dashboard, onboarding, the user's own public
 * profile). Pass it as `appShell({ headerRight })`.
 *
 * @param {('dashboard'|'editor')} [current] highlights the active destination.
 * @returns {Node} a <nav> of plain (non-primary) nav buttons.
 */
export function globalNav(current) {
  const go = (path) => window.__profilo_navigate(path);

  const link = (label, path, key) =>
    el('button', {
      type: 'button',
      class: `nav-link${current === key ? ' nav-link--current' : ''}`,
      'aria-current': current === key ? 'page' : null,
      onClick: () => go(path),
    }, label);

  return el('nav', { class: 'global-nav', 'aria-label': 'Account navigation' }, [
    link('Dashboard', '/dashboard', 'dashboard'),
    link('Edit profile', '/onboarding', 'editor'),
  ]);
}

/* ---- Misc helpers ------------------------------------------------------ */
/** Copy text to clipboard with graceful fallback. Returns a Promise<boolean>. */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall through */ }
  // Legacy fallback
  try {
    const ta = el('textarea', {
      value: text,
      style: { position: 'fixed', opacity: '0', top: '-1000px' },
    });
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

/** Build the full shareable URL for a profile slug. */
export function shareUrl(slug) {
  return `${location.origin}/u/${slug}`;
}

/** Best-effort label for a hostname from a URL string. */
export function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return url;
  }
}
