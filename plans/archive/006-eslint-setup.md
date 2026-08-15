# Plan 006: Add an ESLint config so JS style/correctness issues are caught before shipping

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- package.json .github/workflows/ci.yml .codacy/codacy.yaml`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

This repo has no JavaScript linter. `.codacy/codacy.yaml` (the project's
static-analysis config) enables `lizard` (complexity metrics), `pmd` (mostly
Java-oriented, with some cross-language copy-paste detection), `opengrep`
(semgrep-based SAST), and `trivy` (dependency/container vulnerability
scanning) — none of these is a JS linter checking for the class of issues
`eslint` catches (unused variables, undefined globals, accidental
`==`/`===` mismatches, unreachable code, etc.). `npm run smoke` currently
only runs `node --check` on each file, which catches syntax errors but not
these correctness/style issues. This extension is entirely hand-written
vanilla JS with no build step and no type checker, so a linter is the
cheapest available guardrail against an accidental typo (e.g. a misspelled
`chrome.storaqe.sync`) shipping to two browser stores.

## Current state

`package.json`'s current `scripts` block has no `lint` entry:
```json
  "scripts": {
    "smoke": "jq empty manifest.json _locales/en/messages.json _locales/es/messages.json && node --check content.js && node --check background.js && node --check popup/popup.js && node --check options/options.js && node --check i18n.js && node --check tests/extension-smoke.js",
    "test:extension": "if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js; else xvfb-run -a node tests/extension-smoke.js; fi",
    "test:package": "npm run package && ZIP=$(node -p \"'dist/linkedin-spam-blocker-' + require('./manifest.json').version + '.zip'\") && if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js \"$ZIP\"; else xvfb-run -a node tests/extension-smoke.js \"$ZIP\"; fi",
    "package": "node scripts/package-extension.js",
    "submit:chrome": "node scripts/submit-stores.js chrome",
    "submit:firefox": "node scripts/submit-stores.js firefox"
  },
  "devDependencies": {
    "chrome-webstore-upload": "^6.0.0",
    "playwright": "^1.57.0"
  }
```

There is no `.eslintrc*` or `eslint.config.js` anywhere in the repo (confirm
with `find . -maxdepth 1 -iname '.eslintrc*' -o -maxdepth 1 -iname 'eslint.config.*'`
before starting — this plan assumes none exists).

Source files run in three distinct global environments that a flat ESLint
config needs to account for separately:
- `content.js`, `background.js` — Chrome/Firefox extension APIs (`chrome`
  global), plus browser globals (`document`, `window`, `MutationObserver`,
  etc. for `content.js`; service-worker globals for `background.js`, which
  notably does NOT have `document`/`window`).
- `popup/popup.js`, `options/options.js`, `i18n.js` — browser globals
  (`document`, `window`) plus `chrome`.
- `scripts/*.js`, `tests/*.js` (and `tests/unit/*.js`, if
  `plans/005-unit-test-coverage.md` has landed) — Node.js globals
  (`require`, `module`, `process`, `__dirname`).
- `shared/pattern-data.js` (if `plans/004-shared-pattern-data.md` has
  landed) — must lint clean under **both** a browser-ish/no-globals context
  and a Node context, since it's designed to run in both (see that plan's
  Step 1 for the dual-context IIFE pattern).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (dev only, no repo mutation beyond `package.json`/lockfile) | `npm install --save-dev eslint@^9` | exit 0 |
| Lint | `npm run lint` | exit 0, no errors reported |
| Syntax check (regression) | `npm run smoke` | exit 0 |

Installing a new devDependency modifies `package.json` and
`package-lock.json` — that's the intended, in-scope effect of this plan, not
an out-of-bounds mutation; it's different from the "no installs" restriction
that applies to the *advisor* role that wrote this plan (see this skill's
hard rules), which does not apply to the executor role carrying it out.

## Scope

**In scope**:
- New file: `eslint.config.js` (flat config — the current default for
  ESLint 9.x, which avoids needing the deprecated `.eslintrc*` format)
- `package.json` (add `eslint` devDependency, add `lint` script)
- `package-lock.json` (updated automatically by `npm install`)
- `.github/workflows/ci.yml` (add a lint step)
- Whatever minimal source fixes are needed to make existing files pass the
  new lint config cleanly (see Step 3 — expect this to be small; the
  codebase is already careful about `"use strict"`, consistent `const`/`let`
  usage, etc.)

**Out of scope**:
- Adopting a stricter/opinionated ruleset (e.g. `airbnb`, `standard`) beyond
  ESLint's own recommended rules plus the minimum environment/global
  configuration needed for this repo's three execution contexts. A big
  ruleset invites a large, unrelated reformatting diff — not this plan's
  goal.
- Auto-formatting tools (Prettier, etc.) — a separate concern from linting;
  don't bundle it in here.
- Fixing every existing pattern the linter might flag as a *style*
  preference if it's not an actual correctness risk and would require
  touching many files broadly (e.g. if the recommended ruleset flags
  something purely stylistic across dozens of lines) — for those, prefer
  disabling the specific rule in `eslint.config.js` with a one-line comment
  explaining why, rather than reformatting the whole codebase. Reserve
  actual source edits for rules that catch real bugs (unused vars,
  undefined globals, etc.).

## Git workflow

- Branch: `advisor/006-eslint-setup`
- Commit message style: `chore(lint): add ESLint flat config and CI step`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install ESLint

```
npm install --save-dev eslint@^9
```

**Verify**: `node -e "console.log(require('eslint/package.json').version)"` → prints a `9.x.x` version.

### Step 2: Write `eslint.config.js`

Create `eslint.config.js` at the repo root using ESLint 9's flat-config
format, with per-directory environment globals matching "Current state"
above:

```js
"use strict";

const js = require("@eslint/js");

const browserExtensionGlobals = {
  chrome: "readonly",
  document: "readonly",
  window: "readonly",
  MutationObserver: "readonly",
  NodeFilter: "readonly",
  Node: "readonly",
  FormData: "readonly",
  Blob: "readonly",
  URL: "readonly",
  crypto: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  requestIdleCallback: "readonly",
  fetch: "readonly",
  navigator: "readonly",
  globalThis: "readonly",
  self: "readonly",
  module: "writable",
  /* Only present if plans/004-shared-pattern-data.md and/or
     plans/005-unit-test-coverage.md have landed — content.js reads these
     as globals set by shared/pattern-data.js, loaded via an earlier
     <script> tag (see manifest.json's content_scripts order). If neither
     plan has landed yet, these five entries are harmless no-ops (ESLint
     just won't see anything using them) — leave them in rather than
     conditionally including them, to save a lint-config edit later. */
  SS_PATTERN_DATA: "readonly",
  SS_escapeRegex: "readonly",
  SS_isLinkedInHost: "readonly",
  SS_parseAuthorId: "readonly",
  SS_hashString: "readonly",
  SS_getExcludedSignature: "readonly",
};

const serviceWorkerGlobals = {
  chrome: "readonly",
  crypto: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  globalThis: "readonly",
  self: "readonly",
};

const nodeGlobals = {
  require: "readonly",
  module: "writable",
  process: "readonly",
  __dirname: "readonly",
  console: "readonly",
  Buffer: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  Blob: "readonly",
};

module.exports = [
  js.configs.recommended,
  {
    files: ["content.js", "popup/popup.js", "options/options.js", "i18n.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserExtensionGlobals,
    },
  },
  {
    files: ["background.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: serviceWorkerGlobals,
    },
  },
  {
    files: ["shared/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserExtensionGlobals, ...nodeGlobals },
    },
  },
  {
    files: ["scripts/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", "assets/**"],
  },
];
```

Adjust the `files` glob lists if `plans/004-shared-pattern-data.md` and/or
`plans/005-unit-test-coverage.md` haven't landed yet (in that case, drop the
`shared/**/*.js` block and the `tests/unit` coverage is just whatever
already matches `tests/**/*.js`).

This depends on `@eslint/js` (bundled with the `eslint` package's
recommended-config export as of ESLint 9 — confirm with
`node -e "require('@eslint/js')"` after Step 1; if it's not resolvable as a
separate package in this ESLint version, use `require("eslint").configs.recommended` or the equivalent documented for the installed version instead, and note the discrepancy in your commit message).

**Verify**: `node --check eslint.config.js` → exit 0.

### Step 3: Run the linter and fix what it finds

```
npx eslint . --ext .js
```

Expect a small number of findings, if any — this codebase is disciplined
about `"use strict"` and declared variables. For each finding:
- If it's a real correctness issue (unused variable, undefined global you
  forgot to add to the config above, accidental global leak), fix the
  source.
- If it's a global genuinely used but missing from the config (e.g. a
  browser API not in the lists above), add it to the relevant globals
  object in `eslint.config.js` rather than suppressing the warning per-line.
- Do not use `eslint-disable` comments to silence anything without also
  writing a one-line comment explaining why the flagged pattern is
  intentional (e.g. genuinely dead code kept for a documented reason).

**Verify**: `npx eslint . --ext .js` → exit 0, no output.

### Step 4: Add the `lint` script and CI step

`package.json`:
```json
  "scripts": {
    "smoke": "jq empty manifest.json _locales/en/messages.json _locales/es/messages.json && node --check content.js && node --check background.js && node --check popup/popup.js && node --check options/options.js && node --check i18n.js && node --check tests/extension-smoke.js",
    "lint": "eslint . --ext .js",
    "test:extension": "if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js; else xvfb-run -a node tests/extension-smoke.js; fi",
    "test:package": "npm run package && ZIP=$(node -p \"'dist/linkedin-spam-blocker-' + require('./manifest.json').version + '.zip'\") && if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js \"$ZIP\"; else xvfb-run -a node tests/extension-smoke.js \"$ZIP\"; fi",
    "package": "node scripts/package-extension.js",
    "submit:chrome": "node scripts/submit-stores.js chrome",
    "submit:firefox": "node scripts/submit-stores.js firefox"
  },
```

`.github/workflows/ci.yml` — add a `Lint` step to the `extension` job,
right after `Install dependencies` and before `Install Playwright browsers`
(fail fast on lint errors before spending time installing a browser):

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
```

**Verify**: `npm run lint` → exit 0. Confirm `.github/workflows/ci.yml`'s
indentation matches the surrounding steps (2-space, list items under
`steps:`).

## Test plan

There's no new runtime behavior to test — this plan adds a static-analysis
gate, not a feature. Verification is:

1. `npm run lint` exits 0 against the current codebase (post any Step 3
   fixes).
2. `npm run smoke`, and, if they were already passing before this plan,
   `npm run test:extension` / `npm run test:package` still pass — confirms
   any Step 3 source fixes didn't change runtime behavior.
3. As a sanity check that the linter actually catches something: temporarily
   introduce an obvious unused variable into a copy of `content.js` (e.g.
   `const unusedTestVar = 1;` near the top) and confirm `npm run lint`
   reports it, then revert.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0
- [ ] `npm run test:package` exits 0
- [ ] `eslint.config.js` exists at the repo root
- [ ] `package.json`'s `scripts.lint` is defined
- [ ] `.github/workflows/ci.yml` contains a `Lint` step before `Install Playwright browsers`
- [ ] No files outside the in-scope list are modified beyond the minimal
      Step 3 fixes (`git status`; if Step 3 required source changes, they
      should be small and each traceable to a specific lint finding)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 3 surfaces more than ~10 findings, or any finding that looks like it
  requires understanding detection-logic intent (as opposed to an obvious
  unused-variable/undefined-global fix) — a large or judgment-heavy cleanup
  is a sign this plan's scope should be split, not absorbed silently into a
  "lint setup" commit.
- `npm run test:extension` or `npm run test:package` starts failing after a
  Step 3 source fix — that means the "fix" changed behavior, not just style;
  revert that specific fix and instead suppress the specific rule for that
  line with an explanatory comment, or report back if you're unsure which
  is correct.
- The ESLint version installed in Step 1 doesn't support the flat-config
  format shown in Step 2 (it should, for `eslint@^9`, but if `npm install`
  resolves an unexpected major version, check before proceeding rather than
  reworking the config to the older `.eslintrc` format blind).

## Maintenance notes

- Future contributors should run `npm run lint` before committing; consider
  a pre-commit hook as a separate future improvement if lint failures start
  slipping through in practice — not needed as part of this plan.
- If `plans/004-shared-pattern-data.md` and/or
  `plans/005-unit-test-coverage.md` land after this plan, double check
  `eslint.config.js`'s `files` globs still cover `shared/**/*.js` and
  `tests/unit/**/*.js` correctly — the config above already anticipates
  both, but confirm the actual file paths those plans used match.
- `plans/013-show-cooldown.md` (adds `shared/pattern-data.js` exports and
  `tests/unit/cooldown-store.test.js`) and `plans/015-shared-constants.md`
  (adds `shared/constants.js`) both land inside the globs above — if any
  lint error appears in their files after they land, fix the config globs
  (not their code) in a follow-up.
- A reviewer should scrutinize: that any `eslint-disable` comments added
  during Step 3 have a genuine justification attached, not just a bare
  suppression.
