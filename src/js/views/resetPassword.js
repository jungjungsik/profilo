/* ==========================================================================
   views/resetPassword.js — password-reset confirmation screen
   Reached via the email link from Supabase (contains #/reset-password plus
   an access_token fragment that Supabase's client picks up automatically).
   ========================================================================== */

import { el, mount, button, field, appShell, banner, toast } from '../components.js';
import { updatePassword, isAuthenticated } from '../auth.js';

const nav = (path) => window.__profilo_navigate(path);

export function render() {
  const state = {
    password: '',
    confirm: '',
    errors: {},
    submitting: false,
    done: false,
  };

  function rerender() {
    mount(buildView());
  }

  async function submit(e) {
    e.preventDefault();
    if (state.submitting) return;

    const errors = {};
    if (!state.password || state.password.length < 6) {
      errors.password = 'Use at least 6 characters.';
    }
    if (state.password !== state.confirm) {
      errors.confirm = 'Passwords don’t match.';
    }
    if (Object.keys(errors).length > 0) {
      state.errors = errors;
      rerender();
      return;
    }

    state.submitting = true;
    rerender();

    try {
      await updatePassword(state.password);
      state.done = true;
      state.submitting = false;
      toast('Password updated — you’re signed in', 'success');
      rerender();
      setTimeout(() => nav('/dashboard'), 1500);
    } catch (err) {
      state.submitting = false;
      state.errors = { form: err?.message || 'Something went wrong. Try again.' };
      rerender();
    }
  }

  function buildView() {
    const card = el('div', { class: 'card auth-card reveal' }, [
      el('div', { class: 'stack-sm', style: { 'margin-bottom': '1.25rem' } }, [
        el('h1', { class: 'title' }, 'Choose a new password'),
        el('p', { class: 'subtitle' },
          state.done
            ? 'Done! Redirecting you to your dashboard…'
            : 'Pick something strong — at least 6 characters.'),
      ]),
      state.done ? null : el('form', { class: 'stack', onSubmit: submit, novalidate: 'true' }, [
        state.errors.form ? banner(state.errors.form, 'error') : null,

        field({
          name: 'password',
          label: 'New password',
          type: 'password',
          value: state.password,
          placeholder: 'At least 6 characters',
          autocomplete: 'new-password',
          error: state.errors.password,
          onInput: (v) => { state.password = v; },
        }),

        field({
          name: 'confirm',
          label: 'Confirm new password',
          type: 'password',
          value: state.confirm,
          placeholder: 'Same as above',
          autocomplete: 'new-password',
          error: state.errors.confirm,
          onInput: (v) => { state.confirm = v; },
        }),

        button(
          state.submitting ? 'Updating…' : 'Update password',
          { variant: 'primary', size: 'lg', block: true, type: 'submit', disabled: state.submitting },
        ),
      ]),
    ]);

    return appShell({ onBrandClick: () => nav('/') }, [
      el('section', { class: 'section' }, [card]),
    ]);
  }

  rerender();
}
