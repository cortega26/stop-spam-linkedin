# Plan 016: Add a repo-root `AGENTS.md` capturing this repo's conventions and verification commands

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- AGENTS.md README.md package.json RELEASE_CHECKLIST.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `1f7f4e3`, 2026-08-14

## Why this matters

This repo has no `AGENTS.md`/`CLAUDE.md` — only gitignored agent config
dirs (`.agents/`, `.claude/`). It already runs an agent plan workflow
(`plans/README.md`, 12 plans with executors) and will be audited again, so
every agent session re-derives the same facts by hand: how to verify
(`npm run smoke` / `test:extension` / `test:package`), that there is no
build step, how shared modules are loaded in four contexts, where storage
keys live, how i18n keys flow, and the commit style. A single committed
`AGENTS.md` makes agent runs (including the executors for plans in this
folder) faster and more accurate, and it costs the maintainer nothing — it
is documentation of facts already spread across `README.md`,
`RELEASE_CHECKLIST.md`, and the code.

## Current state

Facts the file must capture, with their current sources:

- No build step (README "Development" section: "No build step is required.
  The extension is vanilla JavaScript and Manifest V3.").
- Verification commands (`package.json` scripts):
  - `npm run smoke` — `jq` JSON validation of manifests/locales +
    `node --check` on every JS file
  - `npm run test:extension` — Playwright e2e against the repo dir
  - `npm run test:package` — packages to `dist/`, then e2e against the zip
  - `npm run test:unit` — Node built-in test runner over `tests/unit/`
    (added by plan 005 — write the section conditionally: "if present")
  - `npm run package` — creates `dist/linkedin-spam-blocker-{version}.zip`
- Architecture: MV3 extension; `content.js` (scan/detect/block, ~1070
  lines), `background.js` (service worker: context menu + badge relay, 80
  lines), `popup/` (388-line script), `options/` (758-line script),
  `i18n.js` (`__MSG_*__` token substitution for pages), `shared/` (UMD
  modules for Node-testable pure logic — created by plan 004:
  `pattern-data.js`, and plan 015's `constants.js`).
- Conventions to document:
  - Every file is a `"use strict"` IIFE; shared modules use the UMD
    global + `module.exports` pattern (see `shared/pattern-data.js`).
  - Load surfaces for shared files: `manifest.json` `content_scripts[].js`
    array, `<script>` tags in `popup.html`/`options.html`,
    `importScripts()` in `background.js`.
  - Storage layout: `ss_`-prefixed keys; runtime counters/state in
    `chrome.storage.local`, preferences in `chrome.storage.sync`, with a
    sync→local migration helper duplicated in `content.js:142-167` and
    `popup.js:66-91`. Keys live in `shared/constants.js` after plan 015.
  - i18n: user-facing strings are `t("key")` in JS or `__MSG_key__` in
    HTML, with keys added to BOTH `_locales/en/messages.json` and
    `_locales/es/messages.json`; detection-language coverage (5 languages)
    is separate from UI localization.
  - Content-script details: placeholder elements use `data-ss-ph`; blocked
    posts are tracked via `processed`/`forceShow` WeakSets; badge relay
    via `chrome.runtime.sendMessage({action:"updateBadge"})`; message
    listeners verify `sender.id === chrome.runtime.id`.
  - Commit style: conventional-ish prefixes (`fix(badge): ...`,
    `refactor(...)`, `test(...)`, `docs(...)`) — see `git log --oneline`.
  - Release flow: `RELEASE_CHECKLIST.md` owns it (bump
    `manifest.json`/`package.json`/`VERSION`/`RELEASE_NOTES.md`/
    `CHANGELOG.md` together; tag `v*` triggers store submission).
  - Tests must not be added to `scripts/package-extension.js`'s `files`
    list (tests are excluded from the zip by design).
- This repo's `plans/` workflow: plans are the deliverable of `/improve`
  runs; executors update status rows in `plans/README.md`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `npm run smoke` | exit 0 |
| Markdown sanity | `grep -c '^#' AGENTS.md` | ≥ 5 (headings exist) |

## Scope

**In scope**:
- New file: `AGENTS.md` (repo root)

**Out of scope**:
- `CLAUDE.md` — don't create a second file; `AGENTS.md` is the
  cross-tool convention this repo's ecosystem uses.
- `.agents/` / `.claude/` (gitignored tool configs) — don't touch them.
- Editing `README.md` or any other existing doc. (If you find a fact
  below that contradicts README, STOP and report rather than reconciling.)
- `scripts/package-extension.js` — the zip must NOT gain `AGENTS.md`
  (it's a dev-facing file; the current `files` list stays untouched).
- Any `.github/workflows` change.

## Git workflow

- Branch: `advisor/016-agents-md`
- Commit message style: `docs(agents): add repo conventions and verification commands for agent runs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write `AGENTS.md`

Create the file with these sections (write it in the repo's own voice —
plain, factual, no marketing; ~80-120 lines total):

1. **Project** — one paragraph: vanilla-JS Manifest V3 browser extension
   that hides LinkedIn engagement-bait spam; zero runtime dependencies; no
   network requests; source-available license. Point at `README.md` and
   `PRIVACY_POLICY.md` for the product story.
2. **Verification** — the command table from "Current state", with a note
   that `test:extension`/`test:package` need Playwright's Chromium
   (`npx playwright install --with-deps chromium`) and a display
   (scripts fall back to `xvfb-run`). Add: "After any change, run
   `npm run smoke` first, then the test suite that covers the change."
3. **Architecture & conventions** — the bullet list from "Current state":
   file roles, IIFE + UMD shared-module pattern with the exact global
   name (`SS_CONSTANTS` for constants, `PATTERN_DATA`-style global for
   pattern data — read `shared/pattern-data.js` for the canonical shape),
   load surfaces for shared files, storage layout + migration, i18n key
   discipline, placeholder/scanning markers, message security
   (`sender.id` check).
4. **Conventions checklist** — commit style with 2 examples from
   `git log`; "no build step"; "never commit secrets"; "tests/ is excluded
   from the packaged zip".
5. **Release process** — point at `RELEASE_CHECKLIST.md`; list the five
   files that must move in lockstep on a version bump.
6. **Agent workflow** — the `plans/` directory: plans are the audit
   deliverable, executors follow them step-by-step and update the status
   table in `plans/README.md` when done.

Exact command examples are in "Current state" above — copy them verbatim;
do not invent new flags.

**Verify**: `grep -c '^#' AGENTS.md` ≥ 5; `git diff --stat HEAD -- AGENTS.md`
shows exactly one added file.

### Step 2: Validate facts against the repo

Walk each factual claim in the file against the code:
- `npm run smoke` actually exits 0 right now (run it).
- Every file/function named in the file exists at the named location
  (`grep` for the symbol names).
- The commit-style examples are real (`git log --oneline -10`).

Correct only your own file if a fact is wrong — do not edit source to make
the doc true.

**Verify**: `npm run smoke` → exit 0; every named symbol resolves via grep.

## Test plan

- No code changes, so no tests. Verification is: the file's claims all
  check out against the live repo (Step 2), and the smoke command still
  passes.
- Optional (do it, it's cheap): open the file fresh and confirm a stranger
  could reproduce `npm run test:extension` from it without asking
  anything.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `AGENTS.md` exists at repo root with all six sections from Step 1
- [ ] `npm run smoke` exits 0
- [ ] Every command in the file is a real `package.json` script or a
      documented npm/`node` command (no invented flags) — verified by
      reading the file against `package.json`
- [ ] Every file path and symbol named in the file exists in the repo
- [ ] `git status` shows only `AGENTS.md` added
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" fact can't be confirmed against the repo (e.g. the
  `test:unit` script doesn't exist and isn't clearly referenced as
  conditional) — report the discrepancy instead of documenting a guess.
- README contradicts a fact you were about to write (e.g. a command that
  changed) — report both versions, don't pick.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This file is the single source of truth for agent onboarding — when
  future plans change the repo shape (new shared files, new scripts, new
  storage keys), `AGENTS.md` should be updated in the same change.
- A reviewer should scrutinize: nothing is documented that isn't verifiable
  in the repo right now — docs that describe an aspirational state are
  worse than none.
- Plans 004/005/015/018/019 will add files and keys this document mentions
  — if this plan lands before them, the conditional phrasing ("after plan
  015, keys live in shared/constants.js") keeps it accurate either way.
