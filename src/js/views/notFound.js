/* ==========================================================================
   views/notFound.js — friendly 404
   ========================================================================== */

import { el, mount, button, appShell } from '../components.js';

const nav = (path) => window.__profilo_navigate(path);

export function render() {
  const view = appShell({ onBrandClick: () => nav('/') }, [
    el('section', { class: 'section notfound reveal' }, [
      el('div', { class: 'notfound__code' }, '404'),
      el('h1', { class: 'title', style: { 'margin-top': '0.75rem' } },
        'We can’t find that page'),
      el('p', { class: 'subtitle', style: { 'margin-top': '0.5rem' } },
        'The link may be broken or the page may have moved.'),
      el('div', { style: { 'margin-top': '1.5rem' } }, [
        button('Back to home', {
          variant: 'primary',
          size: 'lg',
          block: true,
          icon: '←',
          onClick: () => nav('/'),
        }),
      ]),
    ]),
  ]);

  mount(view);
}
