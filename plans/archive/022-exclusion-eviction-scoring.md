# Plan 022: Fix exclusion-eviction scoring (1e12 inversion) and extract the pruner for unit testing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js shared/pattern-data.js tests/unit/pattern-data.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`pruneExcludedByBytes` in `content.js` decides which persisted "Not spam"
exclusion is silently evicted when the `ss_excluded` sync-storage item
nears the byte quota. Its victim-selection score uses a constant `1e12` to
dominate timestamps — but `Date.now()` is ~1.78e12 in 2026, so the
constant no longer dominates. The documented policy ("preview-less entries
evict first, regardless of created time") is inverted for every entry
created since 2001: a legacy exclusion with a recoverable preview is now
dropped before a cryptic recent hash-only entry survives. This is
user-data-loss logic, and the loop has zero test coverage (no test ever
fills `ss_excluded` past the budget). This plan fixes the scoring, moves
the pure logic to `shared/pattern-data.js` so it becomes unit-testable,
and pins the policy with tests.

## Current state

- `content.js:1294-1315` — `pruneExcludedByBytes(map, storageKey, safeByteLimit)`:
  ```js
  while (map.size > 0 && estimateEntriesBytes(map, storageKey) > safeByteLimit) {
    /* ... */
    let victimSig = null;
    let victimScore = Infinity;
    for (const [sig, meta] of map) {
      /* 1e12 — sort-priority constant, exact and well below 2^53: makes
         preview-less entries evict first regardless of created time. */
      const score = (meta.preview ? 1e12 : 0) + (meta.created || 0);
      if (score < victimScore) { victimScore = score; victimSig = sig; }
    }
    if (victimSig === null) break;
    map.delete(victimSig);
  }
  ```
  The bug: with `created` ≈ 1.78e12, a preview-ful entry with `created:
  null` scores exactly 1e12 (evicts first) while a preview-less entry with
  recent `created` scores ~1.78e12 (survives). Inverted.
- `content.js:1290-1292` — `estimateEntriesBytes(map, storageKey)` (byte math, also unused by any test).
- `content.js:867-876` — the only call site: "Not spam" button writes the exclusion then prunes to `0.9 * QUOTA_BYTES_PER_ITEM`.
- `shared/pattern-data.js` — UMD module with pure helpers; the natural home for the extracted pruner. Existing precedent: `SS_createCooldownStore` (`shared/pattern-data.js:212-232`) is a pure helper exported to both worlds.
- `tests/unit/pattern-data.test.js` — 23 unit tests against `module.exports` of pattern-data.js; the pattern to follow for the new tests.

Repo conventions: every runtime file is a `"use strict"` IIFE; shared pure
logic lives in `shared/pattern-data.js` as a UMD (globals `SS_*` on `root`,
`module.exports` for Node). Match those. `Map` semantics: keys with equal
scores tie arbitrarily — the fix must make ties deterministic (see Step 2).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass (currently 36) |

## Scope

**In scope**:
- `shared/pattern-data.js`
- `content.js`
- `tests/unit/pattern-data.test.js`

**Out of scope** (do NOT touch, even though they look related):
- `options/options.js` — the near-cap *warning* byte math there is a
  separate concern (plan 026 territory); it computes the same bytes but is
  display-only. Leave it.
- The victim policy itself beyond the tier ordering: preview-less first,
  then oldest `created` — that is the documented intent; preserve it.
- `serializeExcluded`/`normalizeExcludedEntries` in content.js — leave the
  shapes as they are; the extraction must not change serialization.

## Git workflow

- Branch: `advisor/022-exclusion-eviction-scoring`
- Commit per logical unit; message style: conventional commits, e.g.
  `fix(exclusions): evict preview-less entries first regardless of created` 
  and `test(exclusions): unit-test byte-budget eviction policy`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the pure pruner into `shared/pattern-data.js`

Move `estimateEntriesBytes` and `pruneExcludedByBytes` into
`shared/pattern-data.js` as exported functions operating on the same Map
shape (`Map<string, {preview, created}>`), with a new signature that keeps
byte estimation intact:

```js
function estimateEntriesBytes(map, storageKey) {
  return storageKey.length + JSON.stringify(Array.from(map, ([sig, meta]) => ({
    sig, preview: meta.preview, created: meta.created,
  }))).length;
}

function pruneExcludedByBytes(map, storageKey, safeByteLimit) { /* moved body */ }
```

Export them as `SS_estimateEntriesBytes` / `SS_pruneExcludedByBytes` on
`root` and add to `module.exports`. Do NOT copy `serializeExcluded` — keep
the serialization inline in the byte estimator (content.js keeps its own
`serializeExcluded` for the write path, unchanged).

In `content.js`, delete the local copies (lines ~1290-1315) and call
`SS_pruneExcludedByBytes(excludedSignatures, STORAGE_KEYS.EXCLUDED, Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9))` at the call site (~line 871).

Add `SS_estimateEntriesBytes`/`SS_pruneExcludedByBytes` to the browser
globals in `eslint.config.js` (browserExtensionGlobals block) and to
`types/globals.d.ts`.

**Verify**:
- `npm run smoke` → exit 0
- `npm run lint` → exit 0
- `npm run typecheck` → exit 0
- `npm run test:unit` → 36 pass (no new tests yet, nothing broke)

### Step 2: Fix the victim scoring

Replace the `1e12 + created` numeric score with a two-key comparison that
cannot be defeated by the current epoch: preview-less entries always sort
before preview-ful entries; ties break by `created` ascending (nulls sort
as oldest, i.e. evict first — `(meta.created || 0)`).

Target shape (conceptual — write it to match the module's style):

```js
function victimRank(meta) {
  return {
    tier: meta.preview ? 1 : 0,   /* 0 = evict first (no preview) */
    created: meta.created || 0,
  };
}
```

Pick the entry with the lowest tier, then lowest created. Keep the
`while (estimateEntriesBytes(...) > safeByteLimit)` loop structure.

**Verify**:
- Add unit tests first (Step 3 says when), or after — but run:
  `node -e "const pd = require('./shared/pattern-data.js'); const m = new Map([['a',{preview:'x',created:null}],['b',{preview:null,created:Date.now()}]]); pd.SS_pruneExcludedByBytes(m, 'ss_excluded', 0); console.log([...m.keys()]);"` → expect `[ 'b' ]` (preview-less survives; preview-ful legacy evicted). NOTE: this inverts today's behavior — that is the fix.

### Step 3: Unit tests for the eviction policy

Add to `tests/unit/pattern-data.test.js` (import `SS_pruneExcludedByBytes`
/ `estimateEntriesBytes` from `module.exports`):

1. "preview-less entries evict before preview-ful entries, even with recent created timestamps" — use `created: Date.now()` (current epoch, > 1e12) for the preview-less entry and `created: null` for the preview-ful one; assert the preview-ful one is evicted.
2. "preview-less ties break by oldest created first".
3. "the loop stops exactly at the byte budget" — budget so exactly N entries survive; assert size and that `estimateEntriesBytes` of the survivor ≤ budget.
4. "estimateEntriesBytes counts key length plus serialized entries" — assert a known value for a small Map.

Model after the existing `test("getLocalDayKey ...")` block in the same
file for style.

**Verify**: `npm run test:unit` → all pass, including 4 new tests (total 40).

## Test plan

Covered in Step 3. The four cases pin: tier ordering under current-epoch
timestamps (the bug), tie-break, budget stop, and byte math. No e2e
changes — the existing e2e exclusion flows (`tests/extension-smoke.js`)
must keep passing as regression protection.

## Done criteria

- [ ] `npm run smoke` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0 with 40 passing tests (36 + 4 new)
- [ ] `grep -rn "1e12" content.js shared/pattern-data.js` returns no matches
- [ ] `grep -rn "SS_pruneExcludedByBytes" content.js` shows the shared call, not a local def
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited locations doesn't match the excerpts (drift).
- A step's verification fails twice after a reasonable fix attempt.
- You find a call site of `pruneExcludedByBytes` other than the one cited.
- `Date.now()`-era timestamps turn out NOT to exceed 1e12 in this
  environment (that would invalidate the bug premise — report, don't
  "fix" the fix).

## Maintenance notes

- If the exclusion entry shape ever changes (`{sig, preview, created}`),
  the shared pruner and the content.js `normalizeExcludedEntries` must
  change together — they're now in different files; keep the shape docs in
  `shared/pattern-data.js` in sync.
- The options-page near-cap warning (plan 026/007 territory) should
  eventually reuse `SS_estimateEntriesBytes`; note the duplication in that
  plan, don't fold it in here.
- Reviewer should scrutinize: the byte math is identical to before (only
  the victim *choice* changed), and the eviction loop still guarantees the
  size cap.
