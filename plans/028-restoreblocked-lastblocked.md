# Plan 028: Clear `lastBlocked` in `restoreBlocked` — no duplicate undo rows after snooze/disable

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
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`restoreBlocked()` (called on snooze, on disable, and via the popup's
"Show all") restores every hidden post and clears `blockedPosts` +
`processed` — but leaves `lastBlocked` untouched. When the snooze timer
fires or the extension is re-enabled, `scheduleInitialScan` re-blocks the
same posts and `blockPost` unshifts fresh `lastBlocked` entries with no
dedup. The popup's 5-slot undo window then holds two or more rows for the
same post, crowding out genuinely distinct posts (the `pop()` at the
window cap evicts the oldest). Undoing one duplicate row makes all
matching rows vanish together (the splice in `restorePost` removes every
entry for that post), so the duplicates are also misleading.

## Current state

- `content.js:1006-1015` — `restoreBlocked`:
  ```js
  function restoreBlocked() {
    for (const post of blockedPosts) {
      post.style.display = "";
      const ph = post.nextElementSibling;
      if (ph && ph.dataset && ph.dataset.ssPh) ph.remove();
    }
    blockedPosts.clear();
    processed = new WeakSet();
    setBadge("");
  }
  ```
  (does not clear `lastBlocked`, and `restoreBlocked` never touches the
  cooldown store — that's why re-scan re-blocks the same posts)
- `content.js:1055-1067` — snooze: `restoreBlocked();` then a timer that
  calls `scheduleInitialScan(); startObserver();` on expiry.
- `content.js:288, 363` — disable path and toggle-off also call `restoreBlocked()`.
- `content.js:1218-1231` — `restorePost` splices matching entries from `lastBlocked` (the dedup that exists per-post, but only on explicit restore).
- `content.js:803-814` — `blockPost` unshifts a fresh entry on every block.

Repo conventions: `lastBlocked` is the popup's undo window; its rows are
rendered in order in `popup/popup.js:199`. State that is semantically
reset must be cleared together (e.g. `restoreBlocked` already resets
`processed`).

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
- `tests/extension-interactions.js`

**Out of scope** (do NOT touch):
- `popup/popup.js` — it renders whatever `lastBlocked` it's sent; no change needed.
- The cooldown store / 15-minute re-block protection (plan 013) — semantics unchanged.
- `restorePost`'s per-post splice — leave it.

## Git workflow

- Branch: `advisor/028-restoreblocked-lastblocked`
- Commit message style: conventional, e.g. `fix(undo): clear lastBlocked on bulk restore to avoid duplicate rows`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Clear `lastBlocked` in `restoreBlocked`

In `content.js:1006-1015`, after `blockedPosts.clear();`, add
`lastBlocked.length = 0;` with a comment explaining why (bulk restore
invalidates the undo window; the same posts will be re-blocked by the
next scan and re-added). Optionally also dedup by post in `blockPost`'s
unshift (skip pushing when `lastBlocked.some(e => e.post === post)`) as
a belt-and-braces guard — pick one approach and note it; the `clear` is
the required fix, the dedup is optional.

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all pass.

### Step 2: e2e regression — snooze/resume does not duplicate undo rows

In `tests/extension-interactions.js`, extend the existing snooze scenario
(or add a new one after it): after a snooze→resume cycle with one blocked
post, open the popup (reuse the popup-driving pattern: refocus the feed
tab, reload the popup) and assert `#lastBlockedList` contains exactly
**one** `.last-blocked-item` row. With the bug, the popup shows two rows
for the same post after the re-scan.

**Verify**: `npm run test:extension` → both files pass. Run twice for
stability (popup timing).

## Test plan

One e2e assertion (Step 2). The existing undo/cooldown e2e
(`tests/extension-interactions.js` plan-013/014 scenarios) must keep
passing as regression.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes with the single-row assertion
- [ ] `grep -n "lastBlocked.length = 0" content.js` matches (inside `restoreBlocked`)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- Clearing `lastBlocked` breaks the "Show all" → immediate-undo flow in
  the popup (the popup already handles an empty list; verify it renders
  the empty state, don't invent a new one).

## Maintenance notes

- If a future feature makes the undo window persistent across snooze
  (e.g. storing it in `storage.local`), the `clear` here must be revisited.
- The optional per-post dedup in `blockPost` would also protect against
  the multi-tab counter race double-block (separate, accepted issue) —
  keep it scoped to `lastBlocked` only.
- Reviewer should confirm the popup's "last blocked" section hides
  cleanly when the list is empty (existing `else` branch in
  `popup/popup.js:242-243`).
