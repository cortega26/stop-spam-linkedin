# Plan 033: Evict cooldown-store entries by expiry, not insertion order

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- shared/pattern-data.js tests/unit/cooldown-store.test.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`createCooldownStore` bounds memory at `maxEntries` by evicting
`map.keys().next()` — the earliest **inserted** key. But `Map.set` on an
existing key preserves insertion order, so a key whose expiry was just
refreshed (inserted long ago, still active for the longest) can be
evicted while an earlier-expiring key survives. With >100 distinct posts
"Shown" within 15 minutes, a freshly-refreshed cooldown is the one
dropped, and that post gets re-blocked before its grace period elapses —
the exact failure the store exists to prevent. Edge-case, but the fix is
one line and the store is the pure-helper pattern the repo wants tested.

## Current state

- `shared/pattern-data.js:212-232` — `createCooldownStore`:
  ```js
  set(key) {
    map.set(key, Date.now() + expiryMs);
    while (map.size > maxEntries) {
      const oldest = map.keys().next().value;
      map.delete(oldest);
    }
  },
  ```
- `tests/unit/cooldown-store.test.js` — 5 tests: expiry, eviction,
  refresh. The refresh test (`:40-44`) covers `has` after refresh, not
  the refresh-then-evict interplay.

Repo conventions: pure helper in `shared/pattern-data.js`, unit-tested
via `module.exports` (`tests/unit/cooldown-store.test.js` is the pattern
file).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass (36→37)    |

## Scope

**In scope**:
- `shared/pattern-data.js`
- `tests/unit/cooldown-store.test.js`

**Out of scope** (do NOT touch):
- `content.js` — the store's wiring (`:103-107`) is unchanged.
- The eviction policy beyond ordering (LRU-by-insertion vs. min-expiry):
  the minimal fix keeps O(1) eviction; do not introduce a full priority
  queue.

## Git workflow

- Branch: `advisor/033-cooldown-eviction`
- Commit message style: conventional, e.g. `fix(cooldown): evict least-recently-refreshed keys, not oldest-inserted`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Re-insert on refresh so insertion order tracks expiry

In `shared/pattern-data.js` `set(key)`:

```js
set(key) {
  /* Re-insert refreshes so eviction (keys().next()) drops the key
     with the shortest remaining lifetime, not the longest. */
  if (map.has(key)) map.delete(key);
  map.set(key, Date.now() + expiryMs);
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
},
```

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all 36 pass (existing tests must not regress).

### Step 2: Unit test the refresh-then-evict case

Add to `tests/unit/cooldown-store.test.js`:

1. "refreshing a key re-orders it so the earlier-expiring key is evicted
   first" — with `maxEntries: 2`, set key A, set key B, refresh A (now
   A expires later), add key C → eviction must drop **B** (the
   shorter-lived), leaving A and C, and `store.has(A)` must be true.

Model the style on the existing eviction test in the same file.

**Verify**: `npm run test:unit` → all pass, 37 total.

## Test plan

One unit test (Step 2). No e2e — the store is a pure helper; the
existing e2e cooldown scenario (`tests/extension-smoke.js` Show →
re-creation) is the regression net and must keep passing.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 with 37 passing tests
- [ ] `grep -n "map.has(key)" shared/pattern-data.js` matches inside `createCooldownStore.set`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- An existing cooldown test's expectation contradicts the new ordering
  (i.e. the old test *pinned* insertion-order eviction) — report it
  rather than weakening it.

## Maintenance notes

- The eviction is now LRU-by-refresh, which is the semantically correct
  victim choice for a cooldown store. If the store is ever repurposed
  (e.g. general key cache), revisit the comment.
- Plan 013's 15-minute re-block protection relies on this store; the
  e2e scenario there is the live regression test.
- Reviewer should check the `while` eviction still terminates when all
  keys are unique (it does — each iteration removes one).
