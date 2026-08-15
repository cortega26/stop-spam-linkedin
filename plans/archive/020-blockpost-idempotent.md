# Plan 020: Make `blockPost` idempotent so the toggle-on double-scan can't block a post twice

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js tests/extension-smoke.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3aba455`, 2026-08-14

## Why this matters

Toggling the extension off and back on can hide the same post twice: the
`toggle` message handler resets `processed` and schedules a scan, then
writes `ss_enabled` to sync storage — which fires the *same content
script's* `storage.onChanged` listener, which resets `processed` again and
schedules a second scan. The second scan re-finds the same text node and
`blockPost()` runs again on the same post element, producing two identical
`[data-ss-ph]` placeholders stacked after the post and two entries in the
popup's "last blocked" undo list. The counters stay correct (the `counted`
guard from plan 003 makes counting idempotent) — which is why this went
unnoticed: it's a duplicate-UI defect, not a stats defect. It was hit by
three separate executor runs (plans 003, 013, 014) before being fully
characterized: confirmed reproducible on commit `48e882e` (pre-013) and on
the current stack, with two `blockPost` calls landing in the same tick.

The fix is at the right layer: `blockPost()` should be idempotent — a post
that already has a placeholder attached is already hidden; there is nothing
a second call can add. This kills the duplicate placeholder, the duplicate
undo entry, and the redundant storage write in one line, regardless of how
many scans race.

## Current state

`content.js` — the start of `blockPost()` (verified current in the stacked
worktree at commit 3aba455; plan 013 landed, so the cooldown guard is the
`data-id`-keyed store):

```js
  function blockPost(post, textNode) {
    /* Re-block cooldown — skip if user recently clicked "Show". */
    const postKey = post.getAttribute("data-id");
    if (postKey && cooldownStore.has(postKey)) return;
    if (processed.has(post) || forceShow.has(post)) return;

    /* Skip if author is whitelisted. */
    const authorId = textNode ? getAuthorId(post) : null;
    if (authorId && whitelistedAuthors.has(authorId)) return;

    processed.add(post);
    post.style.display = "none";
    blockedPosts.add(post);
    if (!counted.has(post)) {
      counted.add(post);
      blockedCount++;
      const key = getTodayKey();
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    }
    setBadge(String(blockedCount));
    ...
```

The placeholder is inserted after the post at the end of `blockPost()`
(`post.parentNode?.insertBefore(placeholder, post.nextSibling)`), so a
blocked post always has the placeholder as its immediate next sibling —
`restorePost()` and `restoreBlocked()` remove it on restore, so its
presence is a reliable "this post is currently blocked" signal.

`tests/extension-smoke.js` — plan 003's toggle-count scenario currently
tolerates the duplicate with a `>= 1` placeholder assertion (because the
count was nondeterministic 1-or-2):

```js
    await assert.ok(
      (await page.locator("[data-ss-ph]").count()) >= 1,
      "expected post to be re-blocked with a placeholder after toggle-on"
    );
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax | `npm run smoke` | exit 0 |
| Unit | `npm run test:unit` | exit 0, 16/16 |
| e2e unpacked | `npm run test:extension` | exit 0, "Extension smoke test passed." |
| e2e packaged | `npm run test:package` | exit 0, same message |

## Scope

**In scope**:
- `content.js` (the idempotency guard in `blockPost()`)
- `tests/extension-smoke.js` (tighten plan 003's toggle-count assertion
  from `>= 1` to `=== 1` — it is now deterministic)

**Out of scope**:
- The redundant scan scheduling itself (the toggle handler AND the
  `storage.onChanged` listener both scheduling scans). The idempotency
  guard makes the duplicate scan harmless; removing the redundancy is a
  performance nicety with cross-context correctness risk (the onChanged
  path is the ONLY path that reacts to toggles from *other* tabs or the
  popup's storage-fallback path) — do not touch it here.
- The multi-tab counter race (documented accepted risk in content.js).
- Any change to popup/, options/, shared/.

## Git workflow

- Branch: `advisor/020-blockpost-idempotent`
- Commit message style: `fix(blocking): make blockPost idempotent so toggle-on can't duplicate the placeholder`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the idempotency guard to `blockPost()`

In `content.js`, inside `blockPost()`, immediately after the
`if (processed.has(post) || forceShow.has(post)) return;` line, add:

```js
    /* Idempotency guard: a placeholder as the post's next sibling means
       it is already blocked — a duplicate scan (toggle-on schedules one
       while storage.onChanged schedules another) must not block it again,
       which would stack a second placeholder and a second undo entry. */
    const existingPh = post.nextElementSibling;
    if (existingPh && existingPh.dataset && existingPh.dataset.ssPh) return;
```

Do not change anything else in the function.

**Verify**: `npm run smoke` → exit 0; `node --check content.js` → exit 0.

### Step 2: Tighten plan 003's toggle-count assertion

In `tests/extension-smoke.js`, change the toggle-count scenario's placeholder
assertion from `>= 1` to an exact count of 1:

```js
    await assertCount(page.locator("[data-ss-ph]"), 1);
```

(replacing the `assert.ok(... >= 1, ...)` block). The duplicate was the
only reason the loose assertion existed — with Step 1, exactly one
placeholder can exist for spam-1 after toggle-on. If the e2e run shows the
count is not 1, STOP and report (that would mean another placeholder
source exists that this plan doesn't know about).

**Verify**: `npm run test:extension` → exit 0, "Extension smoke test
passed."; `npm run test:package` → exit 0, same message.

## Test plan

- The tightened assertion in Step 2 IS the regression test: before Step 1,
  the count after toggle-on was nondeterministically 1 or 2 (reproduced
  repeatedly by plan 014's executor); with Step 1 it is deterministically
  1. Sanity-check the regression strength by temporarily reverting Step 1
  (git stash the content.js change) and confirming the scenario fails at
  the strict assertion on a run where the race fires (may need 1-3 runs —
  if it doesn't fire in 3 tries, rely on plan 014's documented
  reproductions and restore Step 1 anyway).
- Full suite: `npm run smoke`, `npm run test:unit` (16/16), `npm run
  test:extension`, `npm run test:package`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:unit` exits 0, 16/16
- [ ] `npm run test:extension` exits 0, "Extension smoke test passed."
- [ ] `npm run test:package` exits 0, same message
- [ ] `grep -n "existingPh" content.js` shows the guard in `blockPost()`
- [ ] `grep -n "\[data-ss-ph\]").count()) >= 1` tests/extension-smoke.js` returns nothing (loose assertion removed)
- [ ] `git diff 1f7f4e3..HEAD -- popup/ options/ shared/ background.js` is empty (no out-of-scope production changes from THIS plan — verify against `3aba455..HEAD` for the plan's own diff)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `blockPost()`'s guard sequence differs from the excerpt (the cooldown /
  processed / forceShow ordering must be as shown — if a later plan
  reordered them, re-derive where the new guard belongs rather than
  force-applying the position).
- The strict `=== 1` assertion fails and the placeholder count is not 1 —
  investigate the placeholder source before assuming this plan is wrong;
  report findings.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `blockPost()` is now idempotent per post: placeholder-present means
  blocked. Future features that add placeholder siblings (plan 019's
  "Report" button lives INSIDE the placeholder, so it's unaffected) must
  keep that invariant — the placeholder must remain the post's immediate
  next sibling.
- Plan 014 (e2e interactions) is BLOCKED on this plan: its toggle-on
  scenario asserted an exact placeholder count and failed on the
  duplicate. Once this lands, 014's executor resumes on top of this
  branch.
- A reviewer should scrutinize: the guard returns BEFORE the whitelist
  check — that's correct (a blocked post stays blocked; the whitelist
  check only matters at first-block time), but call it out if it reads
  oddly.
- The redundant double-scan scheduling remains as a known inefficiency
  (see "Out of scope") — if a profiling pass ever shows scan latency as a
  problem, revisit deduplicating the schedule, not the idempotency guard.
