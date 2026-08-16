# Plan 037: Refresh `AGENTS.md` — storage-keys, smoke coverage, and line counts are stale

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- AGENTS.md`
> If AGENTS.md changed since this plan was written, compare the
> "Current state" excerpts against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (write it LAST in a batch — it documents facts
  that other plans may change)
- **Category**: docs
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`AGENTS.md` is the onboarding contract for agent runs and human
contributors. Three of its claims are now factually wrong, and each
actively misleads: (1) it says storage keys are "defined per file
(`STORAGE_KEYS` in `content.js`/`popup.js`, `STORAGE_KEY` in
`background.js`, `EXCLUDED_STORAGE_KEY` in `options.js`) — there is no
shared constants module yet," but plan 015 landed `shared/constants.js`
and all four runtime files destructure `globalThis.SS_CONSTANTS`; (2) it
says smoke runs `node --check` on "every runtime JS file," but
`shared/post-container.js` (a shipped content-script file) is missing
from the smoke chain; (3) line counts (~1100 / ~1170) are stale
(actual: 1323 / 1299). Agents onboarding via this file will search for
per-file key constants that don't exist and could re-introduce the
duplication plan 015 removed.

## Current state

- `AGENTS.md:56-65` — Storage bullet: "Keys are currently defined per
  file (`STORAGE_KEYS` in `content.js`/`popup.js`, `STORAGE_KEY` in
  `background.js`, `EXCLUDED_STORAGE_KEY` in `options.js`) — there is no
  shared constants module yet."
- `AGENTS.md:35` — "run `npm run smoke` first" (implied "every runtime
  JS file" at the Verification table intro).
- `AGENTS.md:40, 43` — "content.js (~1100 lines)", "options/options.js (~1170 lines)".
- Facts (verified): `shared/constants.js` exports `SS_CONSTANTS` with
  `STORAGE_KEYS`/`LIMITS`/`DEFAULT_ENABLED_LANGS`; `content.js:4`,
  `popup/popup.js:4`, `options/options.js:4`, `background.js:7`
  destructure it; `package.json:6` smoke chain checks
  `shared/constants.js` + `shared/pattern-data.js` but NOT
  `shared/post-container.js`.

Repo conventions: `AGENTS.md` must be kept in lockstep with the tree;
the file itself says "Keep this file updated in the same change that
alters the facts it records."

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |

## Scope

**In scope**:
- `AGENTS.md`

**Out of scope** (do NOT touch):
- `package.json` — plan 038 fixes the smoke chain itself; this plan
  only makes the documentation accurate (it may describe the gap as
  "known — see plan 038" if that plan is pending).
- Any source file.

## Git workflow

- Branch: `advisor/037-agents-md-refresh`
- Commit message style: conventional, e.g. `docs(agents): correct storage-keys and smoke-coverage facts`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Rewrite the Storage bullet

Replace the "defined per file ... no shared constants module yet" text
with the current architecture:

- All storage keys live in `shared/constants.js` as `SS_CONSTANTS`
  (`STORAGE_KEYS`, `LIMITS`, `DEFAULT_ENABLED_LANGS`); every runtime
  file destructures it (`content.js:4`, `popup.js:4`, `options.js:4`,
  `background.js:7`).
- Runtime counters in `chrome.storage.local`, preferences in
  `chrome.storage.sync`, with the sync→local migration helpers
  (`migrateRuntimeStorage` content.js / `migrateRuntimeState` popup.js).
- `ss_excluded` entries remain `{sig, preview, created}` objects.

**Verify**: `grep -n "shared constants" AGENTS.md` → no stale phrase;
`grep -n "SS_CONSTANTS" AGENTS.md` → the new description present.

### Step 2: Correct the smoke description and line counts

- Update the verification-table intro or smoke row to state the exact
  coverage: `node --check` on the runtime files listed in the smoke
  script, and note (if plan 038 is still TODO) that
  `shared/post-container.js` is covered by lint/CI but not yet in the
  smoke chain — or simply describe what `npm run smoke` does today
  without claiming "every runtime JS file."
- Refresh line counts: `content.js` (~1320), `options/options.js`
  (~1300). Verify against the live files with `wc -l` before writing.

**Verify**: `wc -l content.js options/options.js` numbers match what you
wrote; `npm run smoke` → exit 0; `npm run lint` → exit 0.

## Test plan

None — documentation only. Done criteria below are the checks.

## Done criteria

- [ ] `npm run smoke` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "no shared constants module" AGENTS.md` returns nothing
- [ ] `grep -n "SS_CONSTANTS" AGENTS.md` matches
- [ ] Line counts in AGENTS.md match `wc -l` of the live files (±10)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited AGENTS.md text doesn't match the excerpts (drift).
- Plan 015's `shared/constants.js` is missing from the tree (someone
  reverted it) — that would change the whole premise; report.

## Maintenance notes

- Future plans that add shared modules or change the smoke chain MUST
  update AGENTS.md in the same commit (repo rule).
- This plan's facts depend on plans 026/029/031/034 only if they change
  the storage architecture — they don't; no cross-plan rewrites needed.
- Reviewer should read AGENTS.md top-to-bottom once for any other stale
  claim (the file is the audit trail's contract; keep it honest).
