# AGENTS.md — repo conventions for agent runs

This file is the onboarding contract for agent runs in this repo. Every
claim below is verified against the current tree; if a plan or doc says
otherwise, trust the code. Keep this file updated in the same change that
alters the facts it records (new shared files, new scripts, new storage
keys).

## Project

LinkedIn Spam Blocker is a vanilla-JavaScript Manifest V3 browser
extension (Chrome + Firefox) that hides LinkedIn engagement-bait posts
("comment CLAUDE and I'll send you the framework"). It has zero runtime
dependencies, makes no network requests of any kind (permissions are
`storage` + `contextMenus` only), and is source-available proprietary —
see `LICENSE`. Product story: `README.md`; privacy guarantees:
`PRIVACY_POLICY.md`. No build step is required; the code you see is what
ships.

## Verification

| Command | What it does |
|---------|--------------|
| `npm run smoke` | `jq` JSON validation of `manifest.json` + both locale files, then `node --check` on the runtime files listed in the smoke script (`content.js`, `background.js`, `popup/popup.js`, `options/options.js`, `i18n.js`, `shared/constants.js`, `shared/pattern-data.js`) plus `tests/extension-smoke.js` and `tests/unit/pattern-data.test.js`. Note: shipped file `shared/post-container.js` is not in the smoke chain (lint/CI covers it; adding it is plan 038) |
| `npm run lint` | ESLint 9 flat config — recommended rules per execution context (`eslint.config.js`) |
| `npm run typecheck` | TypeScript checkJs — JSDoc type-checking of runtime files with zero build step (`tsconfig.json`) |
| `npm run test:unit` | Node's built-in test runner over `tests/unit/*.test.js` (glob form — needs Node ≥ 24); currently 16 tests |
| `npm run test:extension` | Playwright e2e against the unpacked repo: `tests/extension-smoke.js` then `tests/extension-interactions.js` |
| `npm run test:package` | `npm run package`, then the same two e2e files against `dist/linkedin-spam-blocker-{version}.zip` |
| `npm run package` | Creates `dist/linkedin-spam-blocker-{version}.zip` (version from `manifest.json`) |

The e2e scripts share a Playwright harness in `tests/helpers.js` and need
Playwright's Chromium installed (`npx playwright install --with-deps
chromium`); the scripts fall back to `xvfb-run -a` automatically when
`$DISPLAY` is unset. After any change, run `npm run smoke` first, then
the test suite that covers the change.

## Architecture & conventions

- **Files**: `content.js` (~1300 lines) is the content script —
  scan/detect/block. `background.js` (92 lines) is the MV3 service worker:
  context menu + badge relay only, loads no other modules. `popup/popup.js`
  (~410 lines) and `options/options.js` (~1600 lines) drive their pages.
  `i18n.js` does `__MSG_key__` token substitution on popup/options pages.
- **Every JS file is a `"use strict"` IIFE.** Shared pure logic lives in
  `shared/pattern-data.js` as a UMD module: it exposes globals on the page
  (`SS_PATTERN_DATA`, plus `SS_escapeRegex`, `SS_isLinkedInHost`,
  `SS_parseAuthorId`, `SS_hashString`, `SS_getExcludedSignature`,
  `SS_createCooldownStore`) and `module.exports` for Node unit tests. It
  holds the built-in pattern regexes (5 languages) and those pure helpers.
- **Load surfaces for shared files**: the `content_scripts[].js` array in
  `manifest.json` (`["shared/constants.js", "shared/pattern-data.js",
  "shared/post-container.js", "content.js"]` — shared must come first),
  and `<script>` tags in `popup.html`/`options.html` (both load
  `shared/constants.js` + `shared/pattern-data.js`). `background.js` loads
  nothing extra.
- **Storage**: all keys are `ss_`-prefixed and defined once in
  `shared/constants.js` as `SS_CONSTANTS` (`STORAGE_KEYS`, `LIMITS`,
  `DEFAULT_ENABLED_LANGS`); every runtime file destructures it
  (`content.js:4`, `popup/popup.js:4`, `options/options.js:4`,
  `background.js:7`). Runtime counters/state live in `chrome.storage.local`,
  preferences in `chrome.storage.sync`, with a sync→local migration helper
  duplicated as `migrateRuntimeStorage` (`content.js`) and
  `migrateRuntimeState` (`popup.js`). `ss_excluded` entries are `{sig,
  preview, created}` objects.
- **i18n**: user-facing strings use `t("key")` in JS or `__MSG_key__` in
  HTML; a new key must be added to BOTH `_locales/en/messages.json` and
  `_locales/es/messages.json`. Detection-language coverage (5 languages,
  toggleable) is separate from UI localization.
- **Content-script details**: placeholder elements use `data-ss-ph`;
  blocked posts are tracked via `processed`/`forceShow` WeakSets; badge
  relay is `chrome.runtime.sendMessage({ action: "updateBadge", text })`
  handled in `background.js`; message listeners verify
  `sender.id === chrome.runtime.id`.

## Conventions checklist

- **Commits**: conventional-ish `type(scope): summary`, e.g. `fix(badge):
  use shields.io URL and move to last position` and `test(e2e): drive
  popup, placeholder, and options flows in Playwright`. See
  `git log --oneline` for more.
- **No build step** — do not introduce one.
- **Never commit secrets.** Dev/agent config dirs (`.agents/`, `.claude/`,
  etc.) are gitignored; do not commit them.
- **The packaged zip is fixed-list.** `scripts/package-extension.js` has a
  hardcoded `files` array; `tests/`, `scripts/`, and this file are excluded
  from the zip by design — do not add test files to that list.

## Release process

Owned by `RELEASE_CHECKLIST.md`. A version bump must move five files in
lockstep: `manifest.json`, `package.json`, `VERSION`,
`RELEASE_NOTES.md`, and `CHANGELOG.md`. Pushing a `v*` tag triggers
`.github/workflows/release.yml`, which packages and submits to both
stores; the same can be done locally with `npm run submit:chrome` /
`npm run submit:firefox`.

## Agent workflow

`plans/` holds implementation plans produced by `/improve` audits (one
markdown file per plan plus a `README.md` status table). Executors work in
a dedicated branch, follow the plan step by step — running every
verification command — and update their status row in `plans/README.md`
when done (status values: TODO | IN PROGRESS | DONE | BLOCKED (with
reason) | REJECTED (with rationale)). Honor each plan's STOP conditions:
verify before assuming, and report discrepancies instead of improvising.
