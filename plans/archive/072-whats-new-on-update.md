# Plan 072: Show version-pinned what's-new notes on update

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3aef7b9..HEAD -- options/options.html options/options.js shared/constants.js _locales/en/messages.json _locales/es/messages.json background.js AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (serial discipline only: run after no one, before
  073 — both touch `_locales/*.json` and the e2e files, so parallel
  worktrees would conflict on merge)
- **Category**: direction
- **Planned at**: commit `3aef7b9`, 2026-09-14

## Why this matters

Release 1.5.0 shipped seven user-facing features (never-hide phrases,
match tester, school/showcase coverage, comment-level blocking, first-run
walkthrough, per-pattern stats, persistent suggestions) and no user who
upgraded ever saw a word about them inside the extension: the update path
recreates context menus and stays silent. New installs get a guided
welcome card; updating users — the loyal majority — get nothing. This plan
adds a small, dismissible, version-pinned what's-new card to the options
page that appears once per version bump, reusing the exact welcome-card
infrastructure, with no background changes and no auto-opened tabs.

## Current state

The facts the executor needs, inlined:

- **Update path is silent by construction** (`background.js:24-66`):
  `onInstalled` handles `install` + `update` for menu recreation
  (lines 26-56), but only the `install` reason sets
  `WELCOME_PENDING` and opens the options page (lines 58-65). The
  `update` reason falls through with no user-visible signal. This plan
  deliberately leaves `background.js` untouched — the whole feature is
  options-page-local.
- **Welcome-card pattern to reuse** (`options/options.html:521-530`):
  ```html
  <!-- First-run welcome (plan 058) -->
  <div class="lang-section" id="welcomeCard" style="display:none">
    <div class="lang-section-title">__MSG_welcomeTitle__</div>
    <div class="welcome-body">__MSG_welcomeIntro__</div>
    ...
    <button class="action-bar-button" id="welcomeDismissBtn">__MSG_welcomeDismiss__</button>
  </div>
  ```
  Controller (`options/options.js:146-163`): `loadWelcomeState()` shows
  the card when `STORAGE_KEYS.WELCOME_PENDING === true`;
  `dismissWelcome()` hides it and writes `false` (with a
  `chrome.runtime.lastError` guard). Element handles are grabbed near
  `options.js:73-74` (`welcomeCard`, `welcomeDismissBtn` + listener at
  line 79). New card reuses the `.lang-section` / `.welcome-body` /
  `.action-bar-button` classes — no new CSS.
- **Storage-key convention** (`shared/constants.js:12-30`): every key is
  `ss_`-prefixed and defined once in the frozen `STORAGE_KEYS` object;
  runtime state (counters, flags like `ONBOARDED`, `WELCOME_PENDING`)
  lives in `chrome.storage.local`, preferences in `chrome.storage.sync`
  (AGENTS.md). The new key follows the same split: local, not synced
  (seen-version is per-device state, like onboarding).
- **Locale convention**: user-facing strings via `SS_t("key")` in JS or
  `__MSG_key__` in HTML; every new key goes in BOTH
  `_locales/en/messages.json` and `_locales/es/messages.json` (172 keys
  each at `3aef7b9`); `npm run smoke` enforces en↔es key + `$N`
  placeholder parity. None of the new strings take substitutions, so
  parity is trivially safe — still run smoke.
- **e2e harness**: `tests/helpers.js` (shared Playwright harness, mock
  LinkedIn feed with `spam-1`/`clean-1` fixtures); interaction scenarios
  live in `tests/extension-interactions.js` (2858 lines). Find the
  options-page scenarios (grep `WELCOME_PENDING` / `welcomeCard` in
  `tests/` — plan 058 added install-time coverage) and model the new
  scenarios on them.
- **Every JS file is a `"use strict"` IIFE**; repo commits are
  conventional-ish (`feat(options): ...`).

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke (incl. locale parity) | `npm run smoke` | declared | exit 0, prints `true` for parity |
| Lint | `npm run lint` | declared | exit 0 |
| Typecheck | `npm run typecheck` | declared | exit 0, no errors |
| Unit | `npm run test:unit` | declared | all pass (81 at `3aef7b9`) |
| Extension e2e | `npm run test:extension` | declared | both scripts exit 0 |
| Packaged e2e | `npm run test:package` | declared | exit 0 |

(`test:unit` needs Node ≥ 24; e2e needs Playwright Chromium and falls
back to `xvfb-run -a` without `$DISPLAY`.)

## Scope

**In scope** (the only files you should modify):
- `shared/constants.js` (one new `STORAGE_KEYS` entry)
- `options/options.html` (one new card after `#welcomeCard`)
- `options/options.js` (show/dismiss controller + version read)
- `_locales/en/messages.json`, `_locales/es/messages.json` (new keys
  below, exact copy)
- `tests/extension-interactions.js` (new scenarios)
- `AGENTS.md` (storage-keys bullet — it records storage keys, and its
  header instructs updating it in the same change; one bullet only)

**Out of scope** (do NOT touch, even though they look related):
- `background.js` — no `onInstalled` change, no new menu, no tab logic.
  Auto-opening the options page on update is explicitly rejected
  (intrusive; the install-only precedent in `background.js:58-65`
  stands).
- `popup/` — no popup surface for release notes (popup is glanceable
  status, not reading material).
- Multi-version history / changelog page in the extension — this plan
  shows the *current* version's notes only. History stays in
  `CHANGELOG.md`/`RELEASE_NOTES.md` (repo files, not UI).
- Any badge/dot/count change; any network fetch of release notes (the
  copy ships in the locale files — local-only contract holds).

## Git workflow

- Branch: `advisor/072-whats-new`
- Commit per step; message style: conventional-ish, e.g.
  `feat(options): show version-pinned whats-new card on update`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run smoke, lint, typecheck, unit on the unmodified checkout.

**Verify**: all exit 0 / pass. A `declared` failure here is a broken
baseline — STOP and report.

### Step 1: Add the storage key

In `shared/constants.js`, add to the frozen `STORAGE_KEYS`
(`constants.js:12-30` pattern):

```js
SEEN_RELEASE: "ss_seen_release",
```

Place it adjacent to `ONBOARDED`/`WELCOME_PENDING` (runtime-state
group). No other shared change. Check `types/globals.d.ts` only if it
enumerates storage keys (grep first; if it does, mirror the entry —
if it doesn't, leave it alone and note that in the commit message).

**Verify**: `npm run smoke` exits 0; `rg -n "ss_seen_release"
shared/constants.js` returns the definition line.

### Step 2: Add the card markup + locale strings

- In `options/options.html`, immediately after the `#welcomeCard` div
  (lines 521-530), add:
  ```html
  <!-- What's-new on update (plan 072) -->
  <div class="lang-section" id="whatsNewCard" style="display:none">
    <div class="lang-section-title">__MSG_whatsNewTitle__</div>
    <div class="welcome-body">__MSG_whatsNewIntro__</div>
    <div class="welcome-body">__MSG_whatsNewPoint__</div>
    <button class="action-bar-button" id="whatsNewDismissBtn">__MSG_whatsNewDismiss__</button>
  </div>
  ```
  One intro line + one consolidated points line (a single string with
  the highlights; per-point keys would bloat the locale files for a
  card users dismiss once). No new CSS classes.
- Add all four keys to BOTH locale files with the exact copy below (no
  `$N` placeholders anywhere):

  EN:
  - `whatsNewTitle`: `What's new in this version`
  - `whatsNewIntro`: `This update adds requested tuning tools. Highlights:`
  - `whatsNewPoint`: `Never-hide phrases, a match tester for any post text, per-pattern stats, comment-level blocking, and school/showcase coverage. Open Settings anytime to tune detection.`
  - `whatsNewDismiss`: `Got it`
  
  ES:
  - `whatsNewTitle`: `Novedades de esta versión`
  - `whatsNewIntro`: `Esta actualización agrega herramientas de ajuste solicitadas. Destacados:`
  - `whatsNewPoint`: `Frases que nunca se ocultan, probador de coincidencias para cualquier texto, estadísticas por patrón, bloqueo a nivel de comentario y cobertura de escuelas y showcases. Abre los ajustes cuando quieras afinar la detección.`
  - `whatsNewDismiss`: `Entendido`

**Verify**: `npm run smoke` exits 0 (parity holds; key count = baseline
+ 4 per locale);
`jq -r 'keys[]' _locales/en/messages.json | grep -c whatsNew` → `4`
(same for es).

### Step 3: Add the show/dismiss controller

In `options/options.js`, mirroring `loadWelcomeState`/`dismissWelcome`
(`options.js:146-163`):

- Grab `whatsNewCard` / `whatsNewDismissBtn` next to the welcome handles
  (~line 73-79) and wire the click listener the same way.
- On load (alongside `loadWelcomeState`): read the running version via
  `chrome.runtime.getManifest().version`, `chrome.storage.local.get` the
  new key; show the card iff stored value !== running version. (First
  run after this ships: key absent → card shows once — acceptable and
  consistent with welcome behavior; do NOT special-case it away.)
- Dismiss writes `{ [STORAGE_KEYS.SEEN_RELEASE]: <running version> }`
  with the same `chrome.runtime.lastError` guard idiom as
  `dismissWelcome`.
- The card must never fight the welcome card: both may show on a fresh
  install of a new version (welcome first in DOM order — keep it that
  way; no mutual exclusion logic).

**Verify**: `npm run lint` + `npm run typecheck` exit 0.

### Step 4: e2e scenarios + AGENTS.md one-liner

- In `tests/extension-interactions.js`, modeled on the existing
  options-page scenarios: (a) preset `ss_seen_release` to an older
  version string → options shows `#whatsNewCard`; (b) click dismiss →
  card hides and `ss_seen_release` equals the manifest version;
  (c) reload with equal version → card stays hidden. Assert via
  visible/hidden checks, not implementation internals.
- In `AGENTS.md`, extend the Storage bullet's key list with the new key
  (one bullet edit; follow the existing parenthetical style).

**Verify**: `npm run test:extension` exits 0 (both scripts);
`npm run test:package` exits 0.

## Test plan

- New e2e scenarios in `tests/extension-interactions.js` (Step 4 a–c:
  show-on-stale, dismiss-persists, hidden-when-current).
- Locale parity is machine-checked by `npm run smoke` (176/176 keys,
  `$N` sets equal).
- No unit-test change (controller is DOM + storage glue; the e2e
  scenarios are the coverage, same as plan 058's welcome card).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0 (key counts = drift-check baseline + 4
  new `whatsNew*` keys in each locale — 176/176 if nothing else landed
  first; adjust the expected number if the drift check recorded
  earlier-merged keys)
- [ ] `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` all pass
- [ ] `npm run test:extension`, `npm run test:package` exit 0, including
  the 3 new what's-new scenarios
- [ ] `rg -n "SEEN_RELEASE" shared/constants.js options/options.js`
  returns definition + 2+ use sites; `background.js` unmodified
  (`git diff --name-only 3aef7b9...HEAD` excludes it)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match live code (drift —
  especially if a pending build already added a `SEEN_*` key or
  restructured the welcome card).
- `chrome.runtime.getManifest` is unavailable in the options context in
  either browser gate (it should be — extension page — but if the
  Firefox gate disagrees, stop; do not invent a version-passing message
  protocol through the background worker).
- A step's verification fails twice after a reasonable fix attempt.
- The change appears to require touching `background.js`, `popup/`, or
  any file outside the in-scope list.
- The ES copy needs rewording beyond the inlined strings — do not
  improvise new ES voice; keep the inlined strings verbatim (translator
  review is maintainer follow-up, recorded below, not an executor edit).

## Maintenance notes

For the human/agent who owns this code after the change lands:

- Each release must refresh the four `whatsNew*` strings (both locales)
  to the new version's highlights — add a line to
  `RELEASE_CHECKLIST.md`'s version-bump section if it lists lockstep
  files (check; if the checklist enumerates files, extend it, otherwise
  leave it and note why in the commit).
- ES copy above is maintainer-drafted, not translator-reviewed; flag it
  for review by an ES speaker at the next release (same standing rule
  as plan 012/050 — no action here, just the flag).
- **Deferred:** multi-version history UI (rejected scope — keep the
  single-version card unless maintainer demand says otherwise).
- Reviewers should scrutinize: the absent-key first-run behavior
  (card shows once — intended), and that dismiss writes local (not
  sync) storage.
