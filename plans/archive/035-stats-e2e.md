# Plan 035: e2e coverage for the daily-counts stats pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- tests/extension-smoke.js tests/extension-interactions.js popup/popup.js content.js`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

The stats pipeline — incrementing `dailyCounts[key]` on block,
persisting to `ss_daily_counts`, reading it in the popup, and the
today/7-day sums — has zero end-to-end test coverage: no test in the
suite references `ss_daily_counts` at all. The local-midnight bucketing
(plan de3042e, batch 021) is verified only at the helper level
(`getLocalDayKey` unit tests). A regression in the increment, the
storage write, `resetCount`, or the popup's week-sum window ships
untested. Stats are a core popup surface ("today/week/lifetime").

## Current state

- `content.js:793-794` — `dailyCounts[key] = (dailyCounts[key] || 0) + 1;` on block (non-label only).
- `content.js:984-987` — persisted via `chrome.storage.local.set({ [STORAGE_KEYS.COUNT]: blockedCount, [STORAGE_KEYS.DAILY_COUNTS]: dailyCounts })`.
- `content.js:372-381` — `resetCount` clears both.
- `popup/popup.js:180-193` — today + 7-day sums via `SS_getLocalDayKey`.
- `tests/helpers.js:85-101` — `setLocalStorage`/`getLocalStorage` helpers exist for asserting storage.
- `tests/extension-smoke.js:113-147` — asserts `ss_blocked_count` only; no `ss_daily_counts`.

Repo conventions: e2e asserts real outcomes (storage shape, computed
display) via the helpers; popup driving pattern (refocus feed tab,
reload popup) is established in `tests/extension-interactions.js`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass            |
| E2E       | `npm run test:extension` | both files pass     |

## Scope

**In scope**:
- `tests/extension-smoke.js`
- `tests/extension-interactions.js`

**Out of scope** (do NOT touch):
- `content.js`, `popup/popup.js` — unless a test exposes a bug; then STOP and report (it would be a new finding).
- `shared/pattern-data.js` — `getLocalDayKey` is already unit-tested.

## Git workflow

- Branch: `advisor/035-stats-e2e`
- Commit message style: conventional, e.g. `test(stats): e2e coverage for daily-counts pipeline`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Smoke-test the storage shape

In `tests/extension-smoke.js`, in the existing block-flow scenario
(after the placeholder appears, ~line 56-100), add:

1. `const daily = await getLocalStorage(context, "ss_daily_counts");` —
   assert it's an object with exactly one key, `key === SS_getLocalDayKey()`-equivalent (compute the expected key in the test the same way the extension does: local-time `YYYY-MM-DD`), and `daily[key] === 1`.
2. After the existing reset flow (if the smoke file has one — check;
   otherwise add a mini flow): assert `ss_daily_counts` is `{}` and
   `ss_blocked_count` is 0.

**Verify**: `npm run smoke` → exit 0; `npm run test:extension` → both files pass.

### Step 2: Popup numbers e2e

In `tests/extension-interactions.js`, in the popup-live-state section
(reuse the popup-driving pattern: refocus feed, reload popup), assert:

- `#todayCount` text is `"1"` after one block.
- `#weekCount` is `"1"` (same-day block counts toward both).
- `#lifetimeCount` is `"1"`.
- After the existing resetCount flow (check the interactions file for a
  reset scenario; add one if absent): the three counters show `0` and
  storage reflects the reset.

**Verify**: `npm run test:extension` → both files pass. Run twice for
stability (popup timing).

## Test plan

Two e2e scenarios (Steps 1-2). No unit tests — the pipeline is
chrome-storage + IIFE logic; the popup's `SS_getLocalDayKey` use is
already unit-covered.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes with the new storage-shape + popup-number assertions
- [ ] `grep -rn "ss_daily_counts" tests/` shows assertions in both files
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- The storage shape or popup numbers don't match the expected values
  (a real bug in content.js/popup.js) — report it as a new finding; do
  not adjust the test to match broken behavior.

## Maintenance notes

- If the stats shape ever changes (e.g. plan 041's per-pattern stats),
  these assertions are the baseline to extend.
- The local-day key computation is duplicated in the test (the extension
  computes it via `SS_getLocalDayKey`); if the two ever disagree, the
  test is doing its job.
- Reviewer should check the reset scenario leaves storage in the exact
  `{}` state, not just a zeroed value.
