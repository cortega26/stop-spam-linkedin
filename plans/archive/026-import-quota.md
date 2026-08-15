# Plan 026: Enforce the sync byte quota on versioned-import merges (whitelist + excluded)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- options/options.js tests/extension-smoke.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (soft: 022 lands first, so the shared pruner
  `SS_pruneExcludedByBytes` is available to reuse)
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

Every writer of `ss_excluded` prunes it to ~90% of
`QUOTA_BYTES_PER_ITEM` — except the versioned-import path in
`options/options.js`, which caps only by item count (512) and then writes
the whole merged value with `chrome.storage.sync.set(...)` and no
callback. ~70+ exclusion entries with previews serialize to more than the
8 KB per-item sync quota, so the write fails silently: the in-memory
`excluded` array is already mutated and rendered, the UI toasts success,
and the entries vanish on the next page load. The same pattern applies to
the whitelist merge (no size discipline, no error check). The repo
already has the byte math — reuse it.

## Current state

- `options/options.js:667` — whitelist merge write:
  ```js
  chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: whitelist });
  ```
  (no pre-check, no callback)
- `options/options.js:672-701` — excluded merge: item-count cap
  (`excluded.length + excludedAdded >= LIMITS.MAX_EXCLUDED_ITEMS`) then
  `chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: serializeExcluded(excluded) })` — no byte check, no callback.
- `options/options.js:1025-1034` — the near-cap byte math already exists
  in `renderExcluded()` (`STORAGE_KEYS.EXCLUDED.length + JSON.stringify(serializeExcluded(excluded)).length` vs `QUOTA_BYTES_PER_ITEM * 0.9`).
- `content.js` (after plan 022) — `SS_pruneExcludedByBytes(map, storageKey, safeByteLimit)` in `shared/pattern-data.js`, the canonical pruner.
- `options/options.js:725-776` — success toast with merged counts; `skipped` counters feed the summary.
- `shared/constants.js:44` — `MAX_IMPORT_BYTES: 128 * 1024` (import file cap — larger than the sync item quota; that's the gap).

Repo conventions: storage writes that can fail at quota boundaries check
`chrome.runtime.lastError` (e.g. `options/options.js:158-169` phrase save
with revert+toast); the import path is the exception.

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
- `options/options.js`
- `tests/extension-smoke.js` (import e2e scenario)

**Out of scope** (do NOT touch):
- The phrase-import path — already quota-guarded (`options/options.js:585`).
- `content.js` — its write path is already correct.
- The export payload shape (plan 027's territory).

## Git workflow

- Branch: `advisor/026-import-quota`
- Commit message style: conventional, e.g. `fix(import): enforce sync byte quota on whitelist/excluded merges`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Pre-check + prune the excluded merge with the shared pruner

In `options/options.js` excluded-merge block (after the merge loop,
before the `set`): if plan 022 has landed, use
`SS_pruneExcludedByBytes(excludedMap, STORAGE_KEYS.EXCLUDED, Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9))` on a temporary Map
built from the merged array, then write the pruned array. If 022 has not
landed, implement the same math inline (the `renderExcluded` byte
formula at options/options.js:1025-1034 is the pattern). Count
byte-pruned entries into `excludedSkipped` so the summary toast is
truthful. Ensure `excluded` (the page state) matches what was written.

Add a `chrome.runtime.lastError` check on the `set` callback for both the
excluded and whitelist writes: on failure, restore the pre-merge arrays
and show the error toast (mirror the phrase-save revert at
`options/options.js:158-169`).

Also cap the whitelist merge by total serialized bytes the same way
(whitelist is small strings, but a poisoned file can carry long ones).

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all pass.

### Step 2: e2e — oversized import does not claim success

In `tests/extension-smoke.js`, extend the import scenario block (the
existing export/import e2e, around the `#excludedList` assertions).
Scenario: build a backup JSON with ~90 excluded entries (each with a
60-char preview) — over the 8 KB per-item quota — plus one whitelist
entry; import it; assert:
1. The import toast/summary reports `excludedSkipped > 0` (no false
   "success" claiming all merged).
2. `getSyncStorage(context, "ss_excluded")` round-trips — the stored
   value parses and its serialized size is ≤ `QUOTA_BYTES_PER_ITEM * 0.9`
   (compute in the test with the same formula).
3. The whitelist entry either persisted or was counted as skipped
   (assert the storage state matches what the toast said).

**Verify**: `npm run test:extension` → both files pass.

## Test plan

One e2e scenario (Step 2). Unit tests are not practical here — the
quota math is exercised through the real `chrome.storage.sync` in e2e.
Existing import e2e (5 scenarios in `tests/extension-smoke.js`) must
keep passing as regression.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes, including the new oversized-import scenario
- [ ] `grep -n "QUOTA_BYTES_PER_ITEM" options/options.js` shows the byte check in the import path
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- Plan 022 is NOT yet landed and reusing its helper isn't possible —
  implement the inline math instead (documented in Step 1) and note it.

## Maintenance notes

- The import summary toast counts (`*Added`/`*Skipped`) are user-facing;
  keep the wording consistent with the existing keys
  (`importSummary*`, `imported*` in `_locales`).
- If plan 022's `SS_pruneExcludedByBytes` is used here, both files now
  share one pruner — future policy changes land in one place.
- Reviewer should confirm the pre-merge state restore on write failure
  actually reverts the UI list (not just storage).
