# Plan 058: Give new installs a first-run walkthrough on the options page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- background.js options/options.html options/options.js shared/constants.js content.js _locales tests/extension-smoke.js tests/extension-interactions.js tests/helpers.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED — not because the code is hard, but because opening a tab at
  install time touches the e2e harness's assumptions (see Step 4) and adds a
  user-facing surface at the exact moment a user decides whether to keep the
  extension
- **Depends on**: none
- **Category**: direction (build — shape decided below)
- **Planned at**: commit `4f80330`, 2026-09-13 (branch `advisor/b1-stopspam-lock`, 3 commits ahead of `main`)

## Why this matters

Everything this extension does well is invisible on day one. After install,
`chrome.runtime.onInstalled` creates two context menus and nothing else; the
only onboarding is `showFirstRunToast()`, a green banner that appears for
five seconds *after the first post is blocked* — which requires the user to
already be scrolling LinkedIn, and which says only how many posts were
blocked. A new user never learns that five detection languages can be
toggled, that a hidden post can be restored or marked "Not spam", that
custom phrases exist, or — the point most likely to earn trust — that
nothing leaves their browser.

That gap costs exactly where a store-distributed extension can least afford
it: the first session decides retention and the review. A one-time
walkthrough on a surface that already exists (the options page, already
`open_in_tab: true`) closes it without inventing a new page, a new
permission, or a build step.

## Decisions already made — implement these, do not re-derive

**Decision 1 — reuse the options page; do not add a welcome page.** A
dedicated `welcome/` page would mean new files in two hardcoded lists (the
`files` array in `scripts/package-extension.js` and the file loop in
`npm run smoke`), new HTML/CSS to maintain, and a second place to localize.
The options page already has the i18n plumbing, the styling, and — crucially
— the controls the walkthrough is pointing at.

**Decision 2 — open it only on `reason === "install"`.** Not on `"update"`.
An existing user who gets a tab opened by an auto-update experiences that as
a hijack; the current `onInstalled` handler deliberately runs its menu setup
for both reasons, and that stays as-is.

**Decision 3 — `chrome.runtime.openOptionsPage()`, not `chrome.tabs.create`.**
It needs no permission, honors `options_ui.open_in_tab`, and focuses an
already-open options tab instead of stacking duplicates. The manifest's
`permissions` array must stay exactly `["storage", "contextMenus"]`.

**Decision 4 — a dismissible card, gated by a local flag.** New
`chrome.storage.local` key `ss_welcome_pending`, set to `true` by the
installer branch and cleared when the user dismisses the card. Local, not
sync: it is per-install runtime state, matching how `ss_onboarded` is
handled (`AGENTS.md`: "Runtime counters/state live in
`chrome.storage.local`, preferences in `chrome.storage.sync`").

**Decision 5 — leave `showFirstRunToast()` alone.** It answers a different
question ("something just happened, here is the count") at a different
moment. Removing or merging it is out of scope.

## Current state

The facts the executor needs, inlined:

- **The install hook today** (`background.js:22-29`) — menus only:
  ```js
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "install" && details.reason !== "update") return;
    chrome.contextMenus.removeAll(() => {
      const createMenu = (options) => {
        chrome.contextMenus.create(options, () => {
          if (chrome.runtime.lastError) {
            console.warn("contextMenus.create failed:", chrome.runtime.lastError.message);
  ```
- **The entire current onboarding** (`content.js:1158-1189`,
  `showFirstRunToast`): sets `ss_onboarded`, injects a green banner with
  `SS_t("blockedToast", [String(blockedCount)])`, removes it after 5000 ms.
- **Storage keys are declared once** (`shared/constants.js:12-25`), frozen
  and `ss_`-prefixed; `ONBOARDED: "ss_onboarded"` already lives there.
- **The options page opens in a tab** (`manifest.json:26-29`):
  ```json
    "options_ui": {
      "page": "options/options.html",
      "open_in_tab": true
    },
  ```
- **Permissions must not change** (`manifest.json:15`):
  `"permissions": ["storage", "contextMenus"],`
- **The service worker keeps its own helpers by design** (`AGENTS.md`):
  `background.js` has local `t`/`uid`/`estimatePhraseBytes` copies —
  "do not consolidate them without a dedicated plan". Use its local `t()`
  for any string it needs.
- **Options-page section markup** to model the card on
  (`options/options.html:539-542`), and its rendering counterpart
  `renderWhitelist` (`options/options.js:1134-1181`), which toggles
  `section.style.display` between `"none"` and `"block"`. Section headings
  are `<div class="lang-section-title">`, NOT `<h2>`.
- **`.import-hint` is the wrong class for the card body.** It is the page's
  DE-EMPHASIS style (`options/options.html:402`: `font-size: 11px; color:
  var(--text-tertiary)`) — correct for a hint beside an input, wrong for the
  walkthrough's body copy. Step 3 says what to use instead.
- **Sections that already read local storage** — the options page currently
  reads only `chrome.storage.sync` in `load()` (`options/options.js:115-136`).
  Reading `ss_welcome_pending` means adding a `chrome.storage.local.get`
  call; keep it separate from the sync read rather than merging the two.
- **Every `set()` needs a `lastError` guard** (plan 031 audited all 40 call
  sites). Pattern at `options/options.js:309-313`.
- **i18n**: new keys go in BOTH `_locales/en/messages.json` and
  `_locales/es/messages.json` (136 keys each today); HTML uses
  `__MSG_key__`, JS uses `SS_t("key")` (`background.js` uses its local
  `t("key")`).
- **The e2e harness installs the extension fresh on every run**
  (`tests/extension-smoke.js:27-35`): `chromium.launchPersistentContext`
  into a brand-new temp `userDataDir` with `--load-extension`. That means
  `onInstalled` fires with `reason === "install"` on **every test run**, and
  after this change an options tab will open during every run. Both e2e
  files must still pass — see Step 4.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Syntax + JSON smoke | `npm run smoke` | executed | exit 0 |
| Lint | `npm run lint` | executed | exit 0 |
| Typecheck | `npm run typecheck` | executed | exit 0 |
| Unit tests | `npm run test:unit` | executed | exit 0, 64 tests pass |
| Browser e2e | `npm run test:extension` | declared | exit 0 |
| Packaged e2e | `npm run test:package` | declared | exit 0 |
| Firefox smoke | `npm run test:firefox` | declared | exit 0 |

`executed` rows ran clean on an unmodified checkout at `4f80330`.
`test:firefox` is listed because this plan changes install-time behavior and
Firefox runs the same `onInstalled` path.

## Scope

**In scope**:
- `background.js` — the install branch
- `shared/constants.js` — `STORAGE_KEYS.WELCOME_PENDING`
- `options/options.html`, `options/options.js` — the card and its dismissal
- `_locales/en/messages.json`, `_locales/es/messages.json`
- `tests/extension-interactions.js` — the walkthrough scenarios
- `tests/extension-smoke.js` and/or `tests/helpers.js` — ONLY if Step 4
  proves the new install-time tab disturbs them
- `plans/README.md` — your status row

**Out of scope**:
- Any new file (`welcome/` page, new CSS file). Decision 1. A new file would
  also require editing `scripts/package-extension.js`'s `files` array and
  the hardcoded loop in `npm run smoke`, neither of which is in scope.
- `content.js`'s `showFirstRunToast()` and `ss_onboarded`. Decision 5.
- `manifest.json` — no new permission, no new page, no
  `options_ui` change.
- `popup/` — the popup is not an onboarding surface here.
- Any tutorial overlay injected into LinkedIn itself.

## Git workflow

- Branch: `advisor/058-first-run-onboarding`
- Commit per logical unit (install hook / options card / locales / tests).
  Example message: `feat(onboarding): open a first-run walkthrough on install`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 64 tests. Then run `npm run test:extension` and record that it passes BEFORE your change — Step 4 depends on knowing the suite was green.

A `declared` command that is missing or fails on the unmodified checkout is a
broken baseline: STOP and report, do not repair it.

### Step 1: Add the storage key

In `shared/constants.js`, add `WELCOME_PENDING: "ss_welcome_pending",` to the
frozen `STORAGE_KEYS` object, placed next to `ONBOARDED` (both are
first-run runtime state).

**Verify**:
```
npm run smoke && node -e 'console.log(require("./shared/constants.js").STORAGE_KEYS.WELCOME_PENDING)'
```
→ exit 0, prints `ss_welcome_pending`.

### Step 2: Open the options page on fresh install

In `background.js`, inside the existing `onInstalled` listener and AFTER the
`contextMenus` setup (so a failure there cannot skip menu creation), add a
branch that runs only for a fresh install:

```js
    if (details.reason === "install") {
      chrome.storage.local.set({ [STORAGE_KEYS.WELCOME_PENDING]: true }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to set welcome flag (local.set):", chrome.runtime.lastError.message);
        }
        chrome.runtime.openOptionsPage();
      });
    }
```

Note the ordering: the flag is written *before* the page opens, so the
options page cannot race ahead of it and render without the card.
`STORAGE_KEYS` is already destructured at `background.js:7`.

**Verify**: `npm run smoke && npm run lint && npm run typecheck` → exit 0, and
```
node -e 'const m=require("./manifest.json");console.log(JSON.stringify(m.permissions))'
```
→ `["storage","contextMenus"]` (unchanged).

### Step 3: Render the dismissible card on the options page

**HTML** (`options/options.html`): add as the FIRST child inside the page's
main content, before the phrase-input row, hidden by default:

```html
  <div class="lang-section" id="welcomeCard" style="display:none">
    <div class="lang-section-title">__MSG_welcomeTitle__</div>
    <div class="welcome-body">__MSG_welcomeIntro__</div>
    <div class="welcome-body">__MSG_welcomeStepDetect__</div>
    <div class="welcome-body">__MSG_welcomeStepTune__</div>
    <div class="welcome-body">__MSG_welcomeStepRestore__</div>
    <div class="welcome-body">__MSG_welcomeStepPrivacy__</div>
    <button class="action-bar-button" id="welcomeDismissBtn">__MSG_welcomeDismiss__</button>
  </div>
```

Reuse existing class names only. `lang-section`, `lang-section-title` and `action-bar-button` already exist
in `options/options.html`'s `<style>` block and are used as-is.
`welcome-body` does NOT exist yet, and this is the one place this plan
authorizes new CSS: this card is the first thing a new user reads, so its
body copy must be readable, not the page's 11px tertiary hint style.

Do this in order:
1. Grep the existing `<style>` block for a class already used for normal
   body copy at full contrast. If one exists, use it and drop
   `welcome-body` entirely.
2. Only if none exists, add ONE rule to the existing `<style>` block, in
   its formatting conventions and using its CSS variables — e.g.
   `.welcome-body { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }`
   (confirm those variable names exist before using them).

Report which branch you took. Do not add a stylesheet file, and do not
render the walkthrough in `.import-hint`.

**JS** (`options/options.js`):
- DOM refs beside the others (`welcomeCard`, `welcomeDismissBtn`)
- a `loadWelcomeState()` called from the bootstrap section that does a
  `chrome.storage.local.get([STORAGE_KEYS.WELCOME_PENDING], ...)` and shows
  the card (`welcomeCard.style.display = "block"`) only when the value is
  strictly `true`
- a dismiss handler that hides the card and clears the flag with
  `chrome.storage.local.set({ [STORAGE_KEYS.WELCOME_PENDING]: false }, cb)`,
  `cb` carrying the standard `chrome.runtime.lastError` guard
- do NOT wire the card into `render()`; it is not part of the phrase-list
  render cycle and must not re-appear on every re-render

**Verify**: `npm run smoke && npm run lint && npm run typecheck` → exit 0.

### Step 4: Prove the install-time tab did not break the e2e suite

This is the step most likely to surface a problem. Every e2e run installs
the extension into a fresh profile, so after Step 2 an options tab opens
during each run — a page the existing tests did not expect. Two known ways
this bites: `context.newPage()` no longer yields the only page, and a
`context.pages()`-based lookup picks the options tab.

Run both suites and read the failures carefully:

```
npm run test:extension
npm run test:package
```

- **If both pass**: record that and move on. Do not preemptively "harden"
  the harness.
- **If either fails**: fix the HARNESS, not the feature — e.g. select the
  LinkedIn page explicitly by URL rather than by index. Keep the change
  minimal and note in your report exactly what you changed and why.

**Verify**: `npm run test:extension && npm run test:package` → exit 0, and your report states whether harness changes were needed.

### Step 5: Locale keys (BOTH files)

Add to `_locales/en/messages.json` and `_locales/es/messages.json`:

| key | EN message |
|-----|------------|
| `welcomeTitle` | `Welcome — you're set up` |
| `welcomeIntro` | `LinkedIn Spam Blocker is already running. Here's what it does and how to tune it.` |
| `welcomeStepDetect` | `It hides posts that ask you to comment a keyword to get a file — in five languages, each toggleable below.` |
| `welcomeStepTune` | `Add your own phrases, or turn off any built-in pattern that gets it wrong.` |
| `welcomeStepRestore` | `Every hidden post leaves a placeholder: Show it, mark it Not spam, or block its author.` |
| `welcomeStepPrivacy` | `Nothing leaves your browser — no analytics, no network requests, ever.` |
| `welcomeDismiss` | `Got it` |

Write natural Spanish (match the register of the existing ES strings, e.g.
`"Se alcanzó el límite de frases personalizadas ($1)."`).

**Verify**:
```
npm run smoke
python3 -c "
import json
en=json.load(open('_locales/en/messages.json')); es=json.load(open('_locales/es/messages.json'))
print(len(en), len(es), sorted(set(en)^set(es)))"
```
→ smoke exit 0; the two counts are EQUAL and the symmetric difference is
`[]`. The absolute number is `143` if this plan lands alone, `153` if plan
056 landed first — assert equality and the empty difference, not the
absolute number.

### Step 6: e2e scenarios for the card

Add to `tests/extension-interactions.js`, following its existing options-page
scenarios (they navigate to `chrome-extension://${extensionId}/options/options.html`):

1. **Fresh install shows the card**: with `ss_welcome_pending` set to `true`
   via `setLocalStorage`, open the options page and assert `#welcomeCard` is
   visible.
2. **Dismiss persists**: click `#welcomeDismissBtn`, assert the card hides,
   then assert `getLocalStorage(context, "ss_welcome_pending")` is `false`;
   reload the options page and assert the card is NOT visible.
3. **No flag, no card**: with the flag absent, open the options page and
   assert `#welcomeCard` is hidden — this is the every-subsequent-visit case.

**Verify**: `npm run test:extension` → exit 0 with all three scenarios.

### Step 7: Full gate

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package && npm run test:firefox` → all exit 0.

## Test plan

- **e2e** (`tests/extension-interactions.js`): the three scenarios in Step 6.
  Scenario 2 is the important one — it pins that the card does not come back,
  which is the difference between onboarding and nagging.
- **Regression**: the pre-existing e2e suites must still pass with an options
  tab opening at install time (Step 4). If you changed the harness, say which
  assertion forced it.
- **Firefox**: `npm run test:firefox` covers the same install path on Gecko.
- No unit tests: this plan adds no pure logic.
- Verification: `npm run test:extension && npm run test:package && npm run test:firefox` → exit 0.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` exits 0 (64 tests, unchanged)
- [ ] `npm run test:extension`, `npm run test:package`, `npm run test:firefox` exit 0
- [ ] The three new scenarios exist and pass; the report states whether any
      harness change was needed in Step 4
- [ ] `node -e 'console.log(JSON.stringify(require("./manifest.json").permissions))'` → `["storage","contextMenus"]`
- [ ] `grep -n "openOptionsPage" background.js` shows it inside a
      `details.reason === "install"` branch only — `grep -n "reason" background.js`
      confirms the `"update"` path does NOT open a tab
- [ ] `grep -c "welcome" options/options.js` > 0 and `grep -n "welcomeCard" options/options.html` returns a match
- [ ] The walkthrough body copy is NOT rendered in `.import-hint`:
      `grep -n "import-hint" options/options.html` shows only the
      pre-existing `importHint` line
- [ ] Locale parity: EN and ES key counts equal, symmetric difference `[]`
- [ ] `git diff --name-only main...HEAD -- content.js` returns NOTHING
      (Decision 5: `showFirstRunToast` untouched)
- [ ] `git diff --name-only main...HEAD` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `_locales/fr/`, `_locales/pt/`, or `_locales/de/` exists (check with
  `ls _locales`). That means plan 050 landed first and its parity check
  requires every new key in all shipped locales. Do NOT add FR/PT/DE
  strings yourself — unvalidated translations are what plan 050 forbids.
  Report it so the maintainer can source translations or resequence.
- Fixing Step 4 requires more than a targeted page-selection change in the
  harness — a broad test rewrite means the install-time tab is a worse idea
  than it looks, and that is a product call.
- `chrome.runtime.openOptionsPage()` behaves differently on Firefox in
  `npm run test:firefox` (e.g. throws, or is undefined in the Gecko service
  worker). Report the exact error; do not add a `chrome.tabs.create`
  fallback without saying so — that path has different permission
  implications.
- The card cannot be made readable within the one rule Step 3 authorizes
  (plus any existing class you found) — report what is missing rather than
  growing the stylesheet.
- You conclude a dedicated welcome page would be better. That is Decision 1,
  already made against; if the evidence is strong, report it as a
  recommendation rather than switching approach mid-plan.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Reviewer focus**: (1) the `"update"` path must not open a tab — a
  regression here annoys the entire installed base at once; (2) the flag is
  cleared on dismiss and the card is not wired into `render()`; (3) no
  permission change.
- **Interacts with plan 050 (UI localization, TODO)**: this adds 7 EN/ES
  keys to 050's translation packet. Whichever lands second re-runs 050's key
  inventory. If plan 056 also lands, the packet grows by 17 total.
- **Interacts with the release checklist**: nothing here changes the five
  lockstep version files, but the walkthrough text describes features. If a
  future release removes one of the four bullets' features, the locale
  strings must move with it.
- **Deferred:** measuring whether the walkthrough actually helps (open rate,
  dismissal, retention). Unblocked by: nothing — and deliberately so. The
  extension makes no network requests and has no telemetry
  (`PRIVACY_POLICY.md`); measuring this would contradict the product's core
  positioning. Judge it by store reviews instead.
- **Deferred:** an "updated in this version" card on `reason === "update"`.
  Unblocked by: a release where the change is worth interrupting users for.
