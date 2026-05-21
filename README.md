# Profilo

> Build a beautiful, shareable profile page in minutes — no design skills, no blank pages.

Profilo is a **static, zero-dependency, hash-routed single-page app**. It runs
on browser-native ES modules: no bundler, no npm install, no build step. Open
the folder behind any static file server and it works.

Related issue: **JUN-6**.

---

## First-value definition

The **first-value moment** (the company's central activation metric) is when a
new user **publishes a shareable profile URL with real content** — a profile
with at least one content block, reachable at `#/u/<slug>`.

The entire path **sign up → 3-step wizard → published link** is designed to be
completable in **well under 5 minutes**, and the user is **never shown a blank
or empty state** — the wizard pre-fills smart defaults (including two starter
content blocks) the moment onboarding begins.

---

## How to run

This is a static site. Any static file server works; the app uses ES modules,
so it must be served over HTTP (opening `index.html` via `file://` will not
load modules).

```bash
# from the project root
python -m http.server 4173
# then open:
#   http://localhost:4173
```

Run the logic-core test suite (Node's built-in test runner):

```bash
node --test test/
```

> `test/` and the logic-core modules are delivered by a parallel workstream —
> see **Handoff** below.

---

## Architecture & file map

```
index.html                  SPA shell — viewport meta, mounts #app, loads app.js
README.md                   this file

src/css/
  styles.css                the design system: tokens, components, page styles

src/js/
  app.js                    bootstrap — builds Router, registers routes, guards
  components.js              shared UI toolkit: el(), mount(), button(), field(),
                             avatar(), progressStepper(), toast(), banner(),
                             appShell(), copyToClipboard(), shareUrl()

  views/
    landing.js              marketing landing — one primary CTA + sample preview
    signup.js               email/password sign-up & sign-in (one screen)
    onboarding.js           the 3-step activation wizard (core deliverable)
    dashboard.js            returning-user home — status, share link, actions
    profile.js              public published profile page (the "shop window")
    notFound.js             friendly 404

  --- LOGIC CORE (built by a parallel workstream — do not edit here) ---
    storage.js              localStorage wrapper: .get/.set/.remove/.clear/.keys
    auth.js                 STUB auth: signUp/signIn/signOut/currentUser/...
    store.js                profile + content-block data layer
    defaults.js             smartProfileDefaults / generateSlug / uniqueSlug
    metrics.js              track() funnel instrumentation + EVENTS
    router.js               minimal hash router

test/                       Node --test suite for the logic core
package.json                Node test wiring
```

### Layering

```
            ┌─────────────┐
            │   app.js    │  routes + guards
            └──────┬──────┘
                   │
        ┌──────────┴──────────┐
        │      views/*        │  one module per screen, render() into #app
        └──────────┬──────────┘
                   │ uses
        ┌──────────┴──────────┐
        │   components.js     │  DOM builder + reusable UI pieces
        └─────────────────────┘
                   │ imports the LOGIC CORE contract
   storage · auth · store · defaults · metrics · router
```

Views are pure presentation: they render with `el()`/`mount()` and call into the
logic core for all data. Each view exports `render(...)` and is the single owner
of its screen's markup.

---

## The 3-step onboarding flow

The wizard (`src/js/views/onboarding.js`) is the activation surface. On entry it
calls `ensureProfile()`, so **every field is pre-filled** — there is no empty
state at any point.

| Step | Title | What happens |
|------|-------|--------------|
| 1 | **Who are you?** | Edit display name, headline, bio; pick an avatar color. A live avatar preview updates as you type. |
| 2 | **What do you want to show?** | Content-block editor. Starts with the **2 pre-seeded blocks**. Add text/link blocks, edit inline, reorder, remove. Always keeps ≥ 1 block so publishing stays possible. |
| 3 | **Review & publish** | A live preview of the profile *exactly as visitors see it*, then the primary CTA **Publish my profile**. |

On publish: `publishProfile()` runs (it throws if there are no blocks), funnel
events fire, and the user lands on the **success screen** — the first-value
moment — with the full `#/u/<slug>` link, a copy-to-clipboard button, and a
"View my profile" button.

Every edit is persisted to the store immediately, so **Back and refresh never
lose work**.

Funnel instrumentation (`metrics.js` / `EVENTS`):
`landing_view → signup_complete → onboarding_step ×3 → onboarding_complete →
profile_published`, plus `profile_viewed` on the public page.

---

## Design notes

- **Aesthetic direction:** "Quiet Confidence" — editorial and trustworthy. A
  deep evergreen brand accent on warm paper-white, a serif display face
  (Fraunces) for personality paired with a clean sans for UI.
- **Mobile-first:** base styles target a 360px viewport; touch targets are
  ≥ 44px; there is zero horizontal overflow at 360px. `min-width` media queries
  progressively enhance for tablet and desktop.
- **One primary CTA per screen**, always visually dominant.
- Restrained, accessible motion; honours `prefers-reduced-motion`.

---

## Handoff

This repository is split across parallel workstreams:

- **UI (this deliverable, JUN-6):** `index.html`, `src/css/styles.css`,
  `src/js/app.js`, `src/js/components.js`, and all of `src/js/views/`.
- **Logic core (parallel workstream):** `src/js/storage.js`, `auth.js`,
  `store.js`, `defaults.js`, `metrics.js`, `router.js`, plus `package.json`
  and `test/`. The UI imports these strictly through the agreed interface
  contract.

> **`auth.js` is a STUB.** It currently provides client-side, localStorage-only
> credentials so the flow is end-to-end testable. **JUN-5** will replace it with
> real authentication. The contract (`signUp` / `signIn` / `signOut` /
> `currentUser` / `isAuthenticated`) is intentionally stable so the UI needs no
> changes when the real implementation lands.

> **CI/CD:** **JUN-4** will add the build/deploy pipeline. Because this app has
> no build step, deployment is a static-file publish of the project root.

### Interface contract the UI depends on

```
storage          .get/.set/.remove/.clear/.keys
auth             signUp({email,password})→user · signIn(...)→user · signOut()
                 currentUser()→user|null · isAuthenticated()→bool
store            getProfile · ensureProfile · updateProfile
                 addBlock · updateBlock · removeBlock · moveBlock
                 publishProfile · getProfileBySlug
defaults         smartProfileDefaults · generateSlug · uniqueSlug
metrics          track(eventName, props) · getFunnel · EVENTS
router           new Router() · .add(pattern,handler) · .notFound(fn)
                 .start() · .navigate(path) ; handler receives { params }
```

If the logic-core contract changes, only `src/js/views/*` and `components.js`
should need to adapt.
