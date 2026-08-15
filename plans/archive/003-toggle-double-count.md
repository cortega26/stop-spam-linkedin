# Plan 003: Stop toggling the extension off/on from double-counting blocked-post stats

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js`
> If `content.js` changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. In particular, re-check whether
> `plans/002-snooze-resume-bug.md` has already landed — it edits
> `restoreBlocked()` in the same file (see "Dependency note" below).

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but touches code adjacent to `plans/002-snooze-resume-bug.md` — see "Dependency note")
- **Category**: bug
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

The popup shows "Today," "This week," and lifetime blocked-post counts as
if they were accurate running totals. They aren't: switching the extension
off and back on (via the popup toggle) resets the per-page "already
evaluated" tracking, which causes every spam post still visible on the page
to be re-detected and re-blocked — incrementing `blockedCount` and
`dailyCounts` again for posts that were already counted before the toggle.
A user who toggles the extension off and on a few times while browsing the
same feed will see inflated stats that don't reflect how many distinct
spam posts were actually blocked. This is a stats-accuracy bug, not a
security or detection-accuracy issue — the actual hiding behavior (which
posts are visible) is correct; only the counters are wrong.

## Current state

`content.js:309-326` — the `toggle` message handler:
```js
      case "toggle":
        enabled = msg.enabled;
        if (enabled) {
          clearSnooze();
          processed = new WeakSet();
          forceShow = new WeakSet();
          scheduleInitialScan();
          startObserver();
        } else {
          clearSnooze();
          restoreBlocked();
          stopObserver();
        }
        chrome.storage.sync.set({
          [STORAGE_KEYS.ENABLED]: enabled,
        });
        sendResponse({ enabled });
        break;
```

Resetting `processed = new WeakSet()` on re-enable is intentional and
correct — it's what makes newly-loaded content get scanned again. The bug is
downstream, in `blockPost()`, which has no way to distinguish "this post is
being blocked for the first time" from "this post was already counted once,
got unhidden by `restoreBlocked()`, and is now being re-blocked by a fresh
scan":

`content.js:661-677` — the start of `blockPost()`, where the count is
incremented unconditionally:
```js
  function blockPost(post, textNode) {
    /* Re-block cooldown — skip if user recently clicked "Show". */
    if (showCooldowns.has(post)) {
      if (Date.now() < showCooldowns.get(post)) return;
      showCooldowns.delete(post);
    }
    if (processed.has(post) || forceShow.has(post)) return;

    /* Skip if author is whitelisted. */
    const authorId = textNode ? getAuthorId(post) : null;
    if (authorId && whitelistedAuthors.has(authorId)) return;

    processed.add(post);
    post.style.display = "none";
    blockedPosts.add(post);
    blockedCount++;
    setBadge(String(blockedCount));
```

`content.js:822-830` — `restoreBlocked()` (called by the toggle-off branch
above), which unhides posts but has no memory of which ones were already
counted:
```js
  function restoreBlocked() {
    for (const post of blockedPosts) {
      post.style.display = "";
      const ph = post.nextElementSibling;
      if (ph && ph.dataset && ph.dataset.ssPh) ph.remove();
    }
    blockedPosts.clear();
    setBadge("");
  }
```

The DOM elements themselves persist across the toggle-off/on cycle (LinkedIn
doesn't remove them; `restoreBlocked()` only changes `display` and removes
the placeholder). Since `processed` is reset to an empty `WeakSet` on
re-enable, the same `post` element passes `!processed.has(post)` again on
the next scan, and `blockPost()` treats it as brand new.

## Dependency note

`plans/002-snooze-resume-bug.md` also edits `restoreBlocked()` in this same
file (adding a `processed`/`forceShow` reset there, for a different reason —
making snooze resume blocking correctly). If that plan has already landed
when you start this one, `restoreBlocked()` will look different from the
"Current state" excerpt above (it will already reset the two WeakSets). That
change is compatible with this plan's fix — this plan tracks *counted*
posts, which is orthogonal to the *evaluated* tracking `processed`/`forceShow`
handle — but re-read the live `restoreBlocked()` before editing it, and if
its shape doesn't match either this plan's excerpt or plan 002's expected
result, treat that as a STOP condition rather than guessing.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0, "Extension smoke test passed." |
| Packaged extension e2e | `npm run test:package` | exit 0, same message |

## Scope

**In scope** (the only file you should modify):
- `content.js`

**Out of scope**:
- `popup/popup.js` — only displays the counts; no change needed there.
- The multi-tab counter race documented in the comment at `content.js:796-799`
  ("multi-tab race — two LinkedIn tabs can overwrite each other's count+stats
  since each content script has independent state") — that's a separate,
  already-acknowledged, accepted-risk issue. Do not attempt to fix it as
  part of this plan; it would expand scope well beyond a single-page fix.

## Git workflow

- Branch: `advisor/003-toggle-double-count`
- Commit message style: `fix(stats): don't recount posts re-blocked after a toggle off/on`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Track already-counted posts independently of `processed`

Add a new `WeakSet` alongside the existing ones at `content.js:94-103`,
specifically for "this post has already been counted toward `blockedCount`,
regardless of whether it's currently marked processed":

```js
  let enabled = true;
  let blockedCount = 0;
  let observer = null;
  let processed = new WeakSet();
  let forceShow = new WeakSet();
  let counted = new WeakSet();
  let snoozeTimer = null;
  let snoozeUntil = 0;
```

Unlike `processed`, `counted` must **not** be reset when the toggle is
switched back on — its entire purpose is to survive that reset. Do not add
`counted = new WeakSet()` to the `toggle` handler's `enabled` branch.

**Verify**: `node --check content.js` → exit 0.

### Step 2: Only increment `blockedCount`/`dailyCounts` the first time a post is counted

In `blockPost()` (`content.js:661-677` shown above), change the
unconditional increment into a guarded one:

```js
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
```

**`setBadge` must stay OUTSIDE the guard.** `restoreBlocked()` (called on
toggle-off) clears the badge to `""`. If `setBadge` only ran inside the
`if (!counted.has(post))` block, then after a toggle off→on every re-blocked
post would already be in `counted` (it survives the toggle by design — see
Step 1), the guard would never fire, and the badge would stay stuck at `""`
even though N posts are hidden on the page. The badge reflects "how many
posts are currently hidden," which should update on every block regardless
of counting; only the running-total counters (`blockedCount`,
`dailyCounts`) are what must not double-increment. `blockedPosts.add(post)`
and `processed.add(post)` similarly stay outside the guard — they track
"is this post currently blocked," not "was this post ever counted," and
must run on every re-block for the extension's hide/restore behavior to
keep working.

This requires moving the existing "Daily stats" block (currently a few lines
further down in the function, right before "First-run toast" — see
`content.js:720-722` in the original file) up into this guarded block, and
removing it from its old location. After this change, `blockPost()` should
still do everything else unconditionally (tracking `lastBlocked`, the
suggestion logic, creating the placeholder, writing to
`chrome.storage.local`) — only the count increment and daily-stats increment
move inside the `if (!counted.has(post))` guard; `setBadge` moves to run
once at the end of this block, after the guard, using whatever
`blockedCount` currently holds. Re-blocking a post that was already counted
should still hide it, update the badge, and show the placeholder normally;
it just shouldn't move the running-total counters again.

Also update the trailing `chrome.storage.local.set(...)` call at the end of
`blockPost()` (`content.js:800-803`) — it currently always writes
`blockedCount`/`dailyCounts` unconditionally, which is harmless (writing the
same values again isn't wrong) but wasteful on every re-block. Leave it as
is; don't over-optimize this as part of the fix — the correctness fix is the
guard around the increment, not the storage write.

**Verify**: `node --check content.js` → exit 0.

## Test plan

Add a scenario to `tests/extension-smoke.js` (or a sibling test file
following its structure) that:

1. Loads a mock feed with one spam post (reuse `mockLinkedInFeed`).
2. Waits for the post to be blocked and reads `blockedCount` from storage
   (via `worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get(["ss_blocked_count"], resolve)))`,
   mirroring the `setSyncStorage()` helper already in this file for the
   read direction).
3. Sends `{ action: "toggle", enabled: false }` then `{ action: "toggle",
   enabled: true }` to the content script (via `chrome.tabs.sendMessage`
   from a page-context `evaluate`, or by simulating the popup's message
   pattern — see `popup/popup.js`'s `send()` for the message shape).
4. Waits for the post to be re-blocked (same placeholder-visible assertion
   pattern already used in this file).
5. Reads `blockedCount` again and asserts it is **unchanged** from step 2 —
   this is the regression check: before this fix, it would have incremented
   by 1 again.

If reaching into the content script's toggle handling proves awkward from
Playwright (the content script doesn't expose a public API beyond
`chrome.runtime.onMessage`), sending the message via
`chrome.tabs.sendMessage(tabId, { action: "toggle", enabled: false })`
executed inside a `page.evaluate(...)` that has access to `chrome.runtime`
(content scripts do) is the right approach — do not attempt to call internal
`content.js` functions directly; they're not exposed (that capability is
added separately in `plans/005-unit-test-coverage.md`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0 (including the new toggle-recount regression scenario)
- [ ] `npm run test:package` exits 0
- [ ] `grep -n "let counted = new WeakSet" content.js` shows the new tracking set
- [ ] `grep -n "counted.has(post)" content.js` shows the guard in `blockPost()`
- [ ] `setBadge` is called unconditionally near the end of `blockPost()`, outside the `if (!counted.has(post))` block (confirm by reading the function — a `grep` alone can't distinguish inside/outside the guard)
- [ ] Manual check: toggle the extension off then on while a spam post is visible on the page; confirm the badge shows a nonzero count again after the post is re-blocked (this is the scenario the misplaced-`setBadge` bug would break)
- [ ] The `toggle` handler's `enabled` branch does NOT reset `counted`
      (confirm by reading the handler, not just grepping — a reset there
      would silently undo this fix)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (drift since this plan was written) — re-read "Dependency note" first,
  since `plans/002-snooze-resume-bug.md` touching the same function is the
  most likely cause.
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt.
- You find `counted` would also need resetting somewhere for correct
  behavior (e.g. on page navigation) — page navigation already fully
  reloads `content.js` and reinitializes all module state including
  `counted`, so this shouldn't be necessary; if you believe it is, STOP and
  report the specific scenario rather than adding a reset that could
  reintroduce this bug.

## Maintenance notes

- If a future feature needs to know "was this specific post counted," reuse
  `counted` rather than inferring it from `processed` (which has a different
  lifecycle — it's reset far more often, by design, to allow re-evaluation
  of content that scrolled back into view).
- A reviewer should scrutinize: that the daily-stats block was *moved*, not
  *duplicated* — grep for `dailyCounts[key]` in `content.js` after the
  change and confirm it appears exactly once inside `blockPost()`.
- This fix does not address the multi-tab counting race documented at
  `content.js:796-799` — that remains a known, accepted-risk limitation.
