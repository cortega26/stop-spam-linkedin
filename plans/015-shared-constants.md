# Plan 015: Extract storage keys and shared limits into `shared/constants.js`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js background.js popup/ options/ manifest.json scripts/package-extension.js package.json shared/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/001-phrase-storage-quota.md` (recommended: land
  after it — 001 edits the same limits in the same files; see Dependency
  notes in `plans/README.md`). Also soft-interacts with 004 (which creates
  the `shared/` directory this plan's file joins) and 006 (whose
  `eslint.config.js` `files` globs already cover `shared/**/*.js`)
- **Category**: tech-debt
- **Planned at**: commit `1f7f4e3`, 2026-08-14

## Why this matters

The same storage keys and limit constants are hand-copied across four
contexts with only comments holding them together:

- `content.js:25-36` — `PHRASES_STORAGE_KEY` + `STORAGE_KEYS` (8 keys)
- `popup/popup.js:4-12` — its own `STORAGE_KEYS` (5 keys) + `SNOOZE_DURATION_MS`
- `background.js:8-11` — `STORAGE_KEY` + `MAX_CUSTOM_PHRASES` + `MAX_PHRASE_LENGTH`
- `options/options.js:4-9` — `STORAGE_KEY`, `LANG_STORAGE_KEY`,
  `WHITELIST_STORAGE_KEY`, limits, `MAX_IMPORT_BYTES`
- `content.js:63` and `options/options.js:14,55` — the same
  `DEFAULT_ENABLED_LANGS` array

Today they happen to agree. A typo in one copy (say, `ss_whitelst`) silently
breaks that feature with no error anywhere. This plan creates one
`shared/constants.js` (UMD-style, matching plan 004's `shared/pattern-data.js`)
and makes all four contexts read from it. No values change — this is a pure
extraction, and the verification gates are designed to prove it.

## Current state

The constants to move, with their exact current values:

| Constant | Value | Currently at |
|----------|-------|--------------|
| `PHRASES_STORAGE_KEY` | `"ss_phrases"` | `content.js:25`, `background.js:8`, `options.js:4` |
| `STORAGE_KEYS.ENABLED` | `"ss_enabled"` | `content.js:28`, `popup.js:5` |
| `STORAGE_KEYS.COUNT` | `"ss_blocked_count"` | `content.js:29`, `popup.js:6` |
| `STORAGE_KEYS.ONBOARDED` | `"ss_onboarded"` | `content.js:30`, `popup.js:9` |
| `STORAGE_KEYS.DAILY_COUNTS` | `"ss_daily_counts"` | `content.js:31`, `popup.js:7` |
| `STORAGE_KEYS.SNOOZE_UNTIL` | `"ss_snooze_until"` | `content.js:32`, `popup.js:8` |
| `STORAGE_KEYS.EXCLUDED` | `"ss_excluded"` | `content.js:33` |
| `STORAGE_KEYS.LANGS` | `"ss_enabled_langs"` | `content.js:34`, `options.js:5` |
| `STORAGE_KEYS.WHITELIST` | `"ss_whitelist"` | `content.js:35`, `options.js:6` |
| `MAX_CUSTOM_PHRASES` | `200` | `content.js:19`, `background.js:10`, `options.js:7` |
| `MAX_PHRASE_LENGTH` | `120` | `content.js:20`, `background.js:11`, `options.js:8` |
| `MAX_EXCLUSIONS` | `100` | `content.js:21` |
| `MAX_WHITELIST` | `100` | `content.js:22` |
| `SNOOZE_DURATION_MS` | `30 * 60 * 1000` | `content.js:18` (as `CONFIG.SNOOZE_DURATION_MS`), `popup.js:12` |
| `MAX_IMPORT_BYTES` | `128 * 1024` | `options.js:9` |
| `DEFAULT_ENABLED_LANGS` | `["EN","ES","FR","PT","DE"]` | `content.js:63`, `options.js:14,55` |

Note: `content.js`'s `CONFIG` also holds scanning tunables
(`MIN_TEXT_LENGTH`, `DEPTH_LIMIT`, etc.) that are NOT shared — leave them
in `content.js`.

**Conventions to match**: plan 004's `shared/pattern-data.js` is a UMD
IIFE:
```js
(function (global) {
  "use strict";
  ...
})(typeof self !== "undefined" ? self : globalThis);
```
with `if (typeof module !== "undefined" && module.exports) {
module.exports = { ... }; }` at the end so Node tests can require it.
`content.js` is loaded as a manifest content script; the shared file must be
listed in `manifest.json`'s `content_scripts[].js` array BEFORE `content.js`.
`background.js` is a service worker — it uses `importScripts()` (classic
scripts; supported in both Chrome MV3 service workers and Firefox MV3
background scripts). Pages load it with a `<script>` tag before their own
script.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax   | `npm run smoke` | exit 0 (Step 5 extends the smoke list) |
| e2e unpacked | `npm run test:extension` | exit 0, "Extension smoke test passed." (and the interactions file if plan 014 landed) |
| e2e packaged | `npm run test:package` | exit 0 — proves the zip now includes `shared/constants.js` |
| Key-drift check | `node -e "const c=require('./shared/constants.js'); console.log(Object.keys(c.STORAGE_KEYS).length, c.MAX_CUSTOM_PHRASES, c.SNOOZE_DURATION_MS)"` | prints `8 200 1800000` |

## Scope

**In scope**:
- New file: `shared/constants.js`
- `content.js`, `background.js`, `popup/popup.js`, `options/options.js`
- `manifest.json` (content-script `js` array: add `"shared/constants.js"`
  before `"content.js"`)
- `popup/popup.html`, `options/options.html` (add `<script>` tag for the
  shared file before their own scripts — note both currently load
  `../i18n.js` first; order: `../shared/constants.js` can go before or
  after `../i18n.js`, but must precede the page's own script)
- `scripts/package-extension.js` (add `"shared/constants.js"` to `files`)
- `package.json` (add `node --check shared/constants.js` to the `smoke`
  script)
- `.github/workflows/ci.yml` — NO change needed (it runs `npm run smoke` /
  `npm run test:*`); if plan 006's `eslint.config.js` exists when this plan
  runs, confirm its `files` globs include `shared/**/*.js` (they were
  designed to) — do not edit it unless a lint run actually misses the file.

**Out of scope**:
- `CONFIG`'s scanning tunables (they stay in `content.js`).
- Plan 001's quota pre-check logic — if 001 already landed, leave its code
  untouched; just change where the constants come from. If 001 has NOT
  landed, do not implement its quota logic here either.
- Renaming any storage key or limit value.
- The `"Keep in sync"` comment in `content.js:38` — plan 004 handles the
  pattern-data side; this plan only removes the constants duplicates.

## Git workflow

- Branch: `advisor/015-shared-constants`
- Commit message style: `refactor(storage): single source for storage keys and limits`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `shared/constants.js`

Model the file on `shared/pattern-data.js` (UMD IIFE). Contents:

```js
(function (global) {
  "use strict";

  const PHRASES_STORAGE_KEY = "ss_phrases";

  const STORAGE_KEYS = Object.freeze({
    ENABLED: "ss_enabled",
    COUNT: "ss_blocked_count",
    ONBOARDED: "ss_onboarded",
    DAILY_COUNTS: "ss_daily_counts",
    SNOOZE_UNTIL: "ss_snooze_until",
    EXCLUDED: "ss_excluded",
    LANGS: "ss_enabled_langs",
    WHITELIST: "ss_whitelist",
  });

  const LIMITS = Object.freeze({
    MAX_CUSTOM_PHRASES: 200,
    MAX_PHRASE_LENGTH: 120,
    MAX_EXCLUSIONS: 100,
    MAX_WHITELIST: 100,
    MAX_IMPORT_BYTES: 128 * 1024,
    SNOOZE_DURATION_MS: 30 * 60 * 1000,
  });

  const DEFAULT_ENABLED_LANGS = Object.freeze(["EN", "ES", "FR", "PT", "DE"]);

  global.SS_CONSTANTS = Object.freeze({
    PHRASES_STORAGE_KEY,
    STORAGE_KEYS,
    LIMITS,
    DEFAULT_ENABLED_LANGS,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.SS_CONSTANTS;
  }
})(typeof self !== "undefined" ? self : globalThis);
```

**Verify**: `node -e "const c=require('./shared/constants.js'); if (c.LIMITS.MAX_CUSTOM_PHRASES !== 200) process.exit(1); console.log('ok')"` → `ok`

### Step 2: Rewire the four consumers

For each file, delete the local copies and read from the global instead.
Exact replacements:

- `content.js` — delete lines 25-36 (`PHRASES_STORAGE_KEY` +
  `STORAGE_KEYS`) and the `DEFAULT_ENABLED_LANGS` at line 63; delete
  `CONFIG.MAX_CUSTOM_PHRASES` / `MAX_PHRASE_LENGTH` / `MAX_EXCLUSIONS` /
  `MAX_WHITELIST` / `SNOOZE_DURATION_MS` (lines 17-22) from `CONFIG`.
  Then at the top of the IIFE (after the `"use strict"` line) add:
  ```js
  const { STORAGE_KEYS, LIMITS, DEFAULT_ENABLED_LANGS, PHRASES_STORAGE_KEY } = globalThis.SS_CONSTANTS;
  ```
  Replace every usage: `CONFIG.MAX_CUSTOM_PHRASES` → `LIMITS.MAX_CUSTOM_PHRASES`,
  `CONFIG.MAX_PHRASE_LENGTH` → `LIMITS.MAX_PHRASE_LENGTH`,
  `CONFIG.MAX_EXCLUSIONS` → `LIMITS.MAX_EXCLUSIONS`,
  `CONFIG.MAX_WHITELIST` → `LIMITS.MAX_WHITELIST`,
  `CONFIG.SNOOZE_DURATION_MS` → `LIMITS.SNOOZE_DURATION_MS`.
  (Plan 013 may already have touched `COOLDOWN_DURATION_MS` — that one
  stays in `CONFIG`.) `PHRASES_STORAGE_KEY` and `STORAGE_KEYS` keep their
  names (used ~20 places). Leave the remaining `CONFIG` scanning tunables
  alone.
- `background.js` — delete lines 8-11; add `importScripts("shared/constants.js");`
  as the first line inside the IIFE; destructure
  `const { PHRASES_STORAGE_KEY, LIMITS } = globalThis.SS_CONSTANTS;` and
  replace `STORAGE_KEY` → `PHRASES_STORAGE_KEY`,
  `MAX_CUSTOM_PHRASES` → `LIMITS.MAX_CUSTOM_PHRASES`,
  `MAX_PHRASE_LENGTH` → `LIMITS.MAX_PHRASE_LENGTH`.
- `popup/popup.js` — delete lines 4-12; add the script-tag load in Step 3;
  destructure `const { STORAGE_KEYS, LIMITS } = globalThis.SS_CONSTANTS;`
  and replace `SNOOZE_DURATION_MS` (used at `popup.js:373`) →
  `LIMITS.SNOOZE_DURATION_MS`. Note `STORAGE_KEYS` in the popup only ever
  used 5 of the 8 keys — that's fine, the object is shared whole.
- `options/options.js` — delete lines 4-9 and the `enabledLangs` default
  arrays at lines 14 and 55; destructure
  `const { PHRASES_STORAGE_KEY, STORAGE_KEYS, LIMITS, DEFAULT_ENABLED_LANGS } = globalThis.SS_CONSTANTS;`
  and replace `STORAGE_KEY` → `PHRASES_STORAGE_KEY`,
  `LANG_STORAGE_KEY` → `STORAGE_KEYS.LANGS`,
  `WHITELIST_STORAGE_KEY` → `STORAGE_KEYS.WHITELIST`,
  `MAX_CUSTOM_PHRASES`/`MAX_PHRASE_LENGTH`/`MAX_IMPORT_BYTES` →
  `LIMITS.*`, and `["EN", "ES", "FR", "PT", "DE"]` →
  `DEFAULT_ENABLED_LANGS` (both occurrences).

**Verify**: `grep -rn 'const STORAGE_KEYS\|const STORAGE_KEY\|SNOOZE_DURATION_MS = \|MAX_CUSTOM_PHRASES = \|MAX_PHRASE_LENGTH = \|MAX_IMPORT_BYTES = ' content.js background.js popup/ options/` → no matches; `npm run smoke` → exit 0.

### Step 3: Load the file in all four contexts

- `manifest.json` — `content_scripts[0].js` becomes:
  `["shared/constants.js", "content.js"]`
- `popup/popup.html` — add `<script src="../shared/constants.js"></script>`
  before `<script src="popup.js"></script>` (line 337).
- `options/options.html` — add `<script src="../shared/constants.js"></script>`
  before its own script tag.
- `scripts/package-extension.js` — add `"shared/constants.js"` to the
  `files` array (alphabetically next to `_locales` entries or after
  `"options/options.js"` — anywhere in the list).

**Verify**: `npm run test:extension` → exit 0 ("Extension smoke test
passed." — proves the content-script chain loads and `SS_CONSTANTS` is
visible; also exercise the popup + options pages by hand OR by running
`npm run test:extension` after plan 014's interactions file exists).

### Step 4: Smoke script + packaged-zip verification

Add `node --check shared/constants.js` to the `smoke` script in
`package.json` (before or after the existing `node --check` calls).

**Verify**: `npm run smoke` → exit 0; `npm run test:package` → exit 0
(proves the zip now contains the shared file — the packaged test loads the
extension from the unpacked zip and would fail hard if `SS_CONSTANTS` were
missing).

## Test plan

- No new tests: this is a mechanical extraction with no behavior change.
  The existing suite is the safety net — `npm run test:extension` +
  `npm run test:package` must both pass (they load the extension from both
  the repo dir and the zip, exercising all four load surfaces).
- Manual spot-check (document in the commit message): load the unpacked
  extension, add a phrase in options, confirm it appears in the popup —
  storage reads/writes are the main risk of a key typo.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0 and its script now includes
      `node --check shared/constants.js`
- [ ] `npm run test:extension` exits 0
- [ ] `npm run test:package` exits 0
- [ ] `node -e "const c=require('./shared/constants.js'); console.log(Object.keys(c.STORAGE_KEYS).length, c.LIMITS.MAX_CUSTOM_PHRASES, c.LIMITS.SNOOZE_DURATION_MS)"` prints `8 200 1800000`
- [ ] `grep -rn 'const STORAGE_KEYS\|MAX_CUSTOM_PHRASES = ' content.js background.js popup/ options/` returns nothing
- [ ] `manifest.json` lists `"shared/constants.js"` before `"content.js"`;
      `scripts/package-extension.js` lists it in `files`
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `shared/pattern-data.js` does not exist AND you were told plan 004 has
  not landed — the `shared/` directory may not exist yet; create it (it's
  in scope via this plan's new file) but do NOT extract anything from
  pattern-data.js itself.
- Any of the four consumer files has drifted from the excerpts such that a
  listed replacement target (e.g. `STORAGE_KEY`) is missing — likely a plan
  renamed it first; report instead of guessing.
- A storage key's string value differs between any two files (someone
  already broke the sync) — STOP and report the mismatch; don't silently
  pick one side.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- From now on, new storage keys and limits go in `shared/constants.js`
  only. When plan 007 (exclusions UI) and plan 009 (full backup) land,
  they'll add keys here rather than in their own files.
- `background.js`'s `importScripts` is the one non-obvious load surface —
  if the service worker ever needs `importScripts` for a second file, keep
  the list in one place at the top of `background.js`.
- A reviewer should scrutinize: the diff is deletions + one-line
  substitutions; any changed constant VALUE (not just location) is a red
  flag — the values above are the ground truth.
- `plans/README.md`'s dependency notes record that this plan should run
  after plan 001 (both edit `MAX_CUSTOM_PHRASES` handling in the same
  files). If 001 hasn't landed when this plan runs, 001's executor will
  need to read the constants from `SS_CONSTANTS` instead of local copies —
  plan 001's maintenance notes carry that note.
