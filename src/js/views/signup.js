/* ==========================================================================
   views/signup.js — account creation / sign-in
   One screen, one primary CTA. Toggle flips between signup and signin modes.
   ========================================================================== */

import { el, mount, button, field, appShell, banner, toast } from '../components.js';
import { signUp, signIn, resetPassword } from '../auth.js';
import { track, EVENTS } from '../metrics.js';

const nav = (path) => window.__profilo_navigate(path);

function makeState() {
  return {
    mode: 'signup',          // 'signup' | 'signin' | 'forgot'
    email: '',
    password: '',
    errors: {},
    submitting: false,
    forgotSent: false,
  };
}

function validate(state) {
  const errors = {};
  const email = state.email.trim();
  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'That doesn’t look like a valid email.';
  }
  if (state.mode !== 'forgot') {
    if (!state.password) {
      errors.password = 'Enter a password.';
    } else if (state.mode === 'signup' && state.password.length < 6) {
      errors.password = 'Use at least 6 characters.';
    }
  }
  return errors;
}

export function render() {
  const state = makeState();

  function rerender() {
    mount(buildView());
  }

  async function submit(e) {
    e.preventDefault();
    if (state.submitting) return;

    state.errors = validate(state);
    if (Object.keys(state.errors).length > 0) {
      rerender();
      focusFirstError();
      return;
    }

    state.submitting = true;
    rerender();

    try {
      if (state.mode === 'forgot') {
        await resetPassword(state.email.trim());
        state.forgotSent = true;
        state.submitting = false;
        rerender();
        return;
      }

      const creds = { email: state.email.trim(), password: state.password };
      const user = state.mode === 'signup'
        ? await signUp(creds)
        : await signIn(creds);

      if (state.mode === 'signup') {
        track(EVENTS.SIGNUP_COMPLETE, { userId: user.id });
        toast('Account created — let’s build your profile', 'success');
      } else {
        toast(`Welcome back, ${user.email}`, 'success');
      }
      nav('/onboarding');
    } catch (err) {
      state.submitting = false;
      state.errors = { form: err?.message || 'Something went wrong. Try again.' };
      rerender();
    }
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const bad = document.querySelector('.field--error .input, .field--error .textarea');
      if (bad) bad.focus();
    });
  }

  function toggleMode() {
    state.mode = state.mode === 'signup' ? 'signin' : 'signup';
    state.errors = {};
    rerender();
  }

  function showForgot() {
    state.mode = 'forgot';
    state.errors = {};
    state.forgotSent = false;
    rerender();
  }

  function buildView() {
    const isSignup = state.mode === 'signup';
    const isForgot = state.mode === 'forgot';

    if (isForgot) {
      const card = el('div', { class: 'card auth-card reveal' }, [
        el('div', { class: 'stack-sm', style: { 'margin-bottom': '1.25rem' } }, [
          el('h1', { class: 'title' }, 'Reset your password'),
          el('p', { class: 'subtitle' },
            state.forgotSent
              ? 'Check your email for a reset link. It may take a minute.'
              : 'Enter your email and we’ll send you a reset link.'),
        ]),
        state.forgotSent ? null : el('form', { class: 'stack', onSubmit: submit, novalidate: 'true' }, [
          state.errors.form ? banner(state.errors.form, 'error') : null,
          field({
            name: 'email',
            label: 'Email address',
            type: 'email',
            value: state.email,
            placeholder: 'you@example.com',
            autocomplete: 'email',
            inputmode: 'email',
            error: state.errors.email,
            onInput: (v) => { state.email = v; },
          }),
          button(
            state.submitting ? 'Sending…' : 'Send reset link',
            { variant: 'primary', size: 'lg', block: true, type: 'submit', disabled: state.submitting },
          ),
        ]),
        el('div', { class: 'auth-switch' }, [
          el('button', { type: 'button', class: 'link-action', onClick: toggleMode }, 'Back to sign in'),
        ]),
      ]);

      return appShell({ onBrandClick: () => nav('/') }, [
        el('section', { class: 'section' }, [card]),
      ]);
    }

    const form = el('form', { class: 'stack', onSubmit: submit, novalidate: 'true' }, [
      state.errors.form ? banner(state.errors.form, 'error') : null,

      field({
        name: 'email',
        label: 'Email address',
        type: 'email',
        value: state.email,
        placeholder: 'you@example.com',
        autocomplete: 'email',
        inputmode: 'email',
        error: state.errors.email,
        onInput: (v) => { state.email = v; },
      }),

      field({
        name: 'password',
        label: 'Password',
        type: 'password',
        value: state.password,
        placeholder: isSignup ? 'At least 6 characters' : 'Your password',
        autocomplete: isSignup ? 'new-password' : 'current-password',
        hint: isSignup ? 'Min. 6 characters' : null,
        error: state.errors.password,
        onInput: (v) => { state.password = v; },
      }),

      !isSignup
        ? el('div', { class: 'auth-forgot' }, [
            el('button', { type: 'button', class: 'link-action', onClick: showForgot }, 'Forgot password?'),
          ])
        : null,

      button(
        state.submitting
          ? (isSignup ? 'Creating account…' : 'Signing in…')
          : 'Continue',
        { variant: 'primary', size: 'lg', block: true, type: 'submit', disabled: state.submitting },
      ),
    ]);

    const card = el('div', { class: 'card auth-card reveal' }, [
      el('div', { class: 'stack-sm', style: { 'margin-bottom': '1.25rem' } }, [
        el('h1', { class: 'title' },
          isSignup ? 'Create your account' : 'Welcome back'),
        el('p', { class: 'subtitle' },
          isSignup
            ? 'It takes seconds — then we’ll set up your profile together.'
            : 'Sign in to keep editing and sharing your profile.'),
      ]),
      form,
      el('div', { class: 'auth-switch' }, [
        isSignup ? 'Already have an account? ' : 'New to Profilo? ',
        el('button', { type: 'button', class: 'link-action', onClick: toggleMode },
          isSignup ? 'Sign in instead' : 'Create an account'),
      ]),
      el('p', { class: 'auth-aside' }, [
        el('span', { 'aria-hidden': 'true' }, '🔒'),
        'Secured by Supabase Auth. Passwords are never stored in plain text.',
      ]),
    ]);

    return appShell({ onBrandClick: () => nav('/') }, [
      el('section', { class: 'section' }, [card]),
    ]);
  }

  rerender();
}
