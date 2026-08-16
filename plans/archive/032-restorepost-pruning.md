# Plan 032: Prune `blockedPosts`/`labelBlockedPosts` in `restorePost` — no stale-node re-processing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js tests/extension-interactions.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (soft: 023 first — both touch `restoreAuthorPosts`-adjacent code; 023 is a behavior fix, this is a cleanup)
- **Category**: perf
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`blockedPosts` and `labelBlockedPosts` are strong Sets that only grow:
`restorePost` (called by undo, "Show", "Never block this author", and
`restoreAuthorPosts`) never deletes from them, and the MutationObserver
callback only inspects `addedNodes` — removed/virtualized feed posts are
never pruned. On a long scrolling session every blocked post's full DOM
subtree stays strongly referenced for the tab's lifetime, and every
whitelist add runs `restoreAuthorPosts` (8 `querySelectorAll` per post)
over **every post ever blocked**, including already-restored ones whose
15-minute cooldown gets re-armed needlessly.

## Current state

- `content.js:98, 102` — `const blockedPosts = new Set();` and `const labelBlockedPosts = new Set();`
- `content.js:785-786` — added on block.
- `content.js:1218-1231` — `restorePost`:
  ```js
  function restorePost(post) {
    forceShow.add(post);
    processed.delete(post);
    const postKey = post.getAttribute("data-id");
    if (postKey) cooldownStore.set(postKey);
    post.style.display = "";
    const ph = post.nextElementSibling;
    if (ph && ph.dataset && ph.dataset.ssPh) ph.remove();
    /* Keep lastBlocked in sync ... */
    for (let i = lastBlocked.length - 1; i >= 0; i--) { ... }
  }
  ```
  (no `blockedPosts.delete(post)` / `labelBlockedPosts.delete(post)`)
- `content.js:1006-1015` — `restoreBlocked` clears both sets in bulk (the only shrink path).
- `content.js:1076-1089` — observer callback handles `addedNodes` only; no `removedNodes` pruning.

Repo conventions: Set/WeakSet state is pruned on the same path that
renders it inert (`forceShow`/`processed` already do this); a Set delete
during iteration is safe in JS (skip semantics, no crash).

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
- `content.js`

**Out of scope** (do NOT touch):
- `restoreAuthorPosts`'s iteration shape — it must keep working on a Set
  that shrinks under it (safe; add a comment if useful).
- The observer's `removedNodes` handling — a *separate* pruning concern
  (virtual-scroll eviction) that is deliberately out of scope here to
  keep this change minimal; note it in Maintenance notes.
- `restoreBlocked` — already clears both sets; leave it.

## Git workflow

- Branch: `advisor/032-restorepost-pruning`
- Commit message style: conventional, e.g. `perf(restore): prune blockedPosts on per-post restore`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Delete from both sets in `restorePost`

In `content.js:1218-1231`, add after the placeholder removal (before the
`lastBlocked` sync, or after — pick the spot that reads cleanest):

```js
blockedPosts.delete(post);
labelBlockedPosts.delete(post);
```

Add a one-line comment: restored posts are no longer "blocked"; pruning
keeps whitelist restores and bulk restore from re-processing them.

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all pass.

### Step 2: Confirm the iteration-safety and e2e flows

`restoreAuthorPosts` (`content.js:1021-1026`) iterates `blockedPosts`
and calls `restorePost` inside the loop — with the delete added, the
iteration is still valid (Set deletion of the current/next element is
defined behavior). Run the e2e suite to prove the whitelist-restore,
undo, Show, and label-hide flows still behave:

`npm run test:extension` → both files pass.

Also run `npm run test:package` if that's part of your standard
verification, to exercise the packaged-zip path.

**Verify**: e2e files pass (repeat once for stability).

## Test plan

No new tests — the existing e2e (whitelist restore, undo-by-id, Show
cooldown, Promoted/Featured hides) is the regression net, and a
micro-benchmark of Set size isn't worth a test. If you want a guard,
add one assertion to the existing whitelist e2e in
`tests/extension-interactions.js` that after a whitelist-add restore the
restored post stays hidden-free across a subsequent re-scan (i.e. it
isn't re-blocked) — but verify it's not already covered by the existing
scenario before adding.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes
- [ ] `grep -n "blockedPosts.delete(post)" content.js` matches inside `restorePost`
- [ ] `grep -n "labelBlockedPosts.delete(post)" content.js` matches
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- An e2e flow regresses in a way that traces back to the delete (e.g.
  a re-scan re-blocking a "Shown" post — that would mean `forceShow`
  isn't guarding as expected; report it, don't paper over it).

## Maintenance notes

- The observer `removedNodes` pruning (virtual-scroll eviction) remains
  an open perf item; this plan fixes only the restore path. A future
  plan should prune `blockedPosts`/`labelBlockedPosts` on node removal.
- After this lands, `restoreBlocked`'s bulk clear is the only remaining
  shrink path — its loop is now guaranteed to see only genuinely-blocked
  posts.
- Reviewer should verify the `labelBlockedPosts` guard in
  `restoreAuthorPosts` (`content.js:1023`) is still meaningful: label-
  blocked posts are only in that set while actually blocked, which is
  now true by construction.
