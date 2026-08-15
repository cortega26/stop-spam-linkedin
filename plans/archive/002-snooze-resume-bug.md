# Plan 002: Make snooze actually resume blocking for posts hidden before it started

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
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

The popup advertises "Snooze for 30 minutes with automatic resume," and the
README lists "Snooze for 30 minutes with automatic resume" as a feature.
That promise is broken for any post that was already hidden by the extension
at the moment the user clicked "Snooze": those specific posts never get
re-blocked after the snooze period ends, because the DOM elements that were
already marked as "processed" before snooze started stay marked that way
forever — the code path that clears that marking only exists on the
enable/disable toggle, not on snooze start/end. Newly-loaded posts (ones
LinkedIn's feed hasn't shown yet when snooze started) are unaffected and
will be detected normally, which is what makes this easy to miss in casual
testing — it only reproduces for posts visible before snoozing.

## Current state

`content.js` is a single content-script IIFE. The relevant pieces:

`content.js:94-103` — the module-level state, including the WeakSets that
track which DOM elements have already been evaluated:
```js
  let enabled = true;
  let blockedCount = 0;
  let observer = null;
  let processed = new WeakSet();
  let forceShow = new WeakSet();
  let snoozeTimer = null;
  let snoozeUntil = 0;

  /* Strong set of blocked elements so we can restore them on disable. */
  const blockedPosts = new Set();
```

`content.js:510-522` — `makeTextFilter()`, used by the `TreeWalker` in
`forEachTextNode()`, rejects any text node whose parent element is already
in `processed`:
```js
  function makeTextFilter() {
    return function (textNode) {
      if (!textNode.parentElement) return NodeFilter.FILTER_REJECT;
      const tag = textNode.parentElement.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
        return NodeFilter.FILTER_REJECT;
      if (processed.has(textNode.parentElement))
        return NodeFilter.FILTER_REJECT;
      if (textNode.textContent.trim().length < CONFIG.MIN_TEXT_LENGTH)
        return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    };
  }
```

`content.js:631-646` — `scan()` also skips any post container already in
`processed`:
```js
  function scan(root) {
    if (!enabled || Date.now() < snoozeUntil) return;
    root = root || document.body;

    const matches = findSpamTextNodes(root);
    for (const textNode of matches) {
      const container = findPostContainer(textNode);
      if (
        container &&
        !processed.has(container) &&
        !forceShow.has(container)
      ) {
        blockPost(container, textNode);
      }
    }
  }
```

`content.js:822-830` — `restoreBlocked()`, called when snooze starts (and
also when the toggle is switched off) — unhides posts and clears
`blockedPosts`, but **does not touch `processed` or `forceShow`**:
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

`content.js:836-872` — `snooze()`/`clearSnooze()`/`syncSnoozeState()`, the
full snooze lifecycle. Note that neither the "enter snooze" branch (calls
`restoreBlocked()`) nor the "snooze ends" branches (the early return, and the
`setTimeout` callback) reset `processed`/`forceShow`:
```js
  function snooze() {
    syncSnoozeState(Date.now() + CONFIG.SNOOZE_DURATION_MS);
    chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: snoozeUntil });
  }

  function clearSnooze() {
    syncSnoozeState(0);
    chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: 0 });
  }

  function syncSnoozeState(nextSnoozeUntil) {
    snoozeUntil = nextSnoozeUntil || 0;

    if (snoozeTimer) {
      clearTimeout(snoozeTimer);
      snoozeTimer = null;
    }

    if (!snoozeUntil || Date.now() >= snoozeUntil) {
      snoozeUntil = 0;
      if (enabled) {
        scheduleInitialScan();
        startObserver();
      }
      return;
    }

    restoreBlocked();
    snoozeTimer = setTimeout(() => {
      snoozeUntil = 0;
      chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: 0 });
      if (enabled) {
        scheduleInitialScan();
        startObserver();
      }
    }, snoozeUntil - Date.now());
  }
```

Contrast with `content.js:309-326`, the `toggle` message handler, which
**does** reset both WeakSets when re-enabling — this is the pattern to
mirror:
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
- `popup/popup.js` — reads snooze state but doesn't drive this logic; no
  change needed there.
- The toggle handler at `content.js:309-326` — it already resets the
  WeakSets correctly; don't touch it except to confirm your fix is
  consistent with it.
- `plans/003-toggle-double-count.md` touches the same toggle handler for a
  different reason (stat inflation, not stale `processed` state). If both
  plans are being executed close together, coordinate rather than let one
  silently overwrite the other's change to `content.js:309-326`.

## Git workflow

- Branch: `advisor/002-snooze-resume-bug`
- Commit message style: `fix(snooze): reset processed state on restoreBlocked
  so snooze actually resumes blocking`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reset `processed` (only) in `restoreBlocked()`

`restoreBlocked()` is called both when snooze starts and when the toggle is
switched off. In both cases, the intent is "nothing currently on the page
should be treated as already-evaluated for spam" — either because we're
about to re-scan from scratch (toggle back on) or because the
previously-hidden posts are now visible again and need to be re-evaluated
once scanning resumes (snooze ends). Add the reset directly inside
`restoreBlocked()` so every caller gets it automatically:

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

**Reset `processed` only — do NOT add `forceShow = new WeakSet()` here.**
`forceShow` marks posts the user explicitly chose to keep visible via the
"Show" or "Not spam" buttons (`restorePost()`, see `content.js:984-996`,
adds to `forceShow` and sets a 15-minute re-block cooldown via
`showCooldowns`/`COOLDOWN_DURATION_MS`). Snooze lasts 30 minutes
(`CONFIG.SNOOZE_DURATION_MS`). If `restoreBlocked()` also cleared
`forceShow`, then a post the user deliberately un-hid *before* snoozing
would lose that protection the moment snooze starts, and could get
re-blocked once snooze ends and a fresh scan runs — overriding a decision
the user already made, which is a second, different bug from the one this
plan is fixing. `processed` is the only set that both `makeTextFilter()`
(`content.js:510-522`) and `scan()` (`content.js:631-646`) gate on for
"has this been evaluated" — clearing just that one is sufficient to make
already-hidden-then-restored posts eligible for re-detection again, without
touching the user's explicit show/not-spam choices.

Do **not** change the `toggle` message handler at `content.js:309-326` in
this plan. It already resets both `processed` and `forceShow` explicitly on
re-enable — trace why that's still needed even after this step: `case
"toggle"` with `enabled = true` calls `clearSnooze()` first, which calls
`syncSnoozeState(0)`. Since `nextSnoozeUntil` is `0`, the branch taken is
`if (!snoozeUntil || Date.now() >= snoozeUntil)` — **not**
`restoreBlocked()`. So `restoreBlocked()` (and this step's fix) is never
reached on the toggle-on path; the toggle handler's own explicit resets are
the only thing clearing state there, and they intentionally reset
`forceShow` too (toggling fully off and back on is a stronger "start over"
action than snoozing, so clearing the user's show/not-spam choices on that
path is existing, correct behavior — don't change it).

**Verify**: `node --check content.js` → exit 0.

### Step 2: Confirm the snooze-end paths now pick up the reset

Because `restoreBlocked()` is called synchronously inside `syncSnoozeState()`
right before entering the "snooze active" branch (see the excerpt in
"Current state" — `restoreBlocked()` runs, then `snoozeTimer = setTimeout(...)`
is scheduled), the reset now happens at the moment snooze *starts*, not when
it ends. That's correct and sufficient: once `processed` is empty, the
subsequent scan that runs when the `setTimeout` fires (or when
`syncSnoozeState` is called again and takes the early-return branch because
the snooze already expired) will treat every visible post — including the
ones that were hidden right before snooze started — as unevaluated, and
`blockPost()` will run for the ones that are still spam.

No additional code change is needed for this step — it's a confirmation
step. Read through `syncSnoozeState()` once more after Step 1's edit and
verify the ordering: `restoreBlocked()` (now resets WeakSets) →
`snoozeTimer = setTimeout(...)` (fires later, calls `scheduleInitialScan()`
+ `startObserver()`, which will re-scan against the now-empty `processed`
set). If this ordering doesn't hold after your edit, STOP — the fix is in
the wrong place.

**Verify**: manually re-read `content.js`'s `syncSnoozeState()` and confirm
`restoreBlocked()` (with the Step 1 edit) runs before the `setTimeout` is
scheduled, and that nothing between them re-populates `processed` before the
timer fires.

## Test plan

`tests/extension-smoke.js` doesn't currently exercise snooze at all — it's
the right place to add a regression test, but adding full snooze-timing
coverage (waiting out a real 30-minute timer, or mocking `Date.now()`
inside the extension's own execution context) is more than this plan's
effort budget covers. Instead:

1. Add a new scenario to `tests/extension-smoke.js` (or a new test file
   following its exact structure — look at how it uses
   `context.serviceWorkers()[0]` and `worker.evaluate(...)` to reach into
   extension storage) that:
   - Loads the mock feed (reuse `mockLinkedInFeed` from the existing file,
     or add a second fixture) so a spam post gets blocked.
   - Sends a `{ action: "snooze" }` message to the content script (via
     `chrome.tabs.sendMessage` from the service worker, mirroring how
     `popup/popup.js`'s `send()` helper talks to the content script) and
     confirms the post becomes visible again.
   - Sets `ss_snooze_until` in storage to a timestamp in the past (simulating
     snooze having already expired) via `chrome.storage.local.set`, matching
     the pattern `setSyncStorage()` already uses in this file for
     `chrome.storage.sync.set` (you'll want a `local` variant).
   - Triggers a fresh scan somehow — reloading the page is the simplest
     reliable way to force `content.js` to re-initialize and read the
     expired snooze state — and asserts the previously-snoozed spam post is
     hidden again.
   - Model the new test's assertions after the existing `assertCount()` /
     `getComputedStyle(el).display` checks already in this file.
2. If writing a robust automated version of the reload-based check proves
   awkward within this plan's effort budget, it's acceptable to instead add
   a narrower test that only exercises `restoreBlocked()`'s WeakSet reset via
   a direct content-script evaluation (inject a small script that calls the
   internal function... but note `content.js`'s functions are not exposed
   outside its IIFE, so this isn't currently possible without the module
   boundary added in `plans/005-unit-test-coverage.md`). If you hit this
   wall, it is acceptable to skip the automated regression test for this
   plan and instead do a thorough manual verification (documented below),
   noting in your commit message and in `plans/README.md`'s status row that
   automated coverage for this fix is deferred to
   `plans/005-unit-test-coverage.md`. Do not spend more than one extra
   iteration trying to force a Playwright-only solution before falling back
   to this.
3. Manual verification (do this regardless of whether Step 1/2's automated
   test lands): load the extension unpacked, open a real LinkedIn feed with
   at least one visible spam post, click "Snooze" in the popup, confirm the
   post reappears, then in the extension's service worker console run
   `chrome.storage.local.set({ ss_snooze_until: Date.now() - 1000 })` to
   force-expire the snooze, reload the LinkedIn tab, and confirm the same
   post is hidden again.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0
- [ ] `npm run test:package` exits 0
- [ ] `grep -n "processed = new WeakSet" content.js` shows the reset present
      inside `restoreBlocked()`
- [ ] Read `restoreBlocked()` directly and confirm it does NOT reset
      `forceShow` (a `grep` for `forceShow = new WeakSet` should show it
      appearing only in the `toggle` handler, not inside `restoreBlocked()`)
- [ ] The `toggle` handler at `content.js` still resets `processed`/`forceShow`
      explicitly on enable, unchanged from before this plan (this plan does
      not touch the toggle handler at all)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (including a note if the
      automated regression test was deferred per Test plan step 2)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (drift since this plan was written).
- After the Step 1 edit, the trace in Step 2 doesn't hold (i.e.
  `restoreBlocked()` no longer runs before the snooze timer is scheduled) —
  that means `syncSnoozeState()`'s structure changed and the fix needs to be
  re-derived, not force-applied.
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt.
- You find that removing the toggle handler's explicit WeakSet reset (which
  Step 1 says NOT to do) is actually required for tests to pass — that means
  the trace in Step 1 was wrong for the current code and you should
  re-verify rather than deleting the guard blind.

## Maintenance notes

- Any future feature that introduces another "temporarily suspend blocking"
  mode (beyond toggle-off and snooze) should reset `processed` when it
  resumes — ideally by routing through `restoreBlocked()` (now fixed by this
  plan) rather than reimplementing the unhide logic separately. Whether it
  should also reset `forceShow` depends on whether that mode is meant to be
  a "soft pause" (like snooze — don't reset `forceShow`, respect prior
  show/not-spam choices) or a "hard restart" (like the toggle — reset both).
- A reviewer should scrutinize: that this fix doesn't change behavior for
  the toggle-off/on path (it shouldn't — this plan doesn't touch the toggle
  handler at all) and that it only changes behavior for the snooze path
  (which previously never reset `processed` at all). Also confirm
  `forceShow` is untouched by this plan — a post the user manually restored
  via "Show" or "Not spam" before snoozing should still be exempt from
  re-blocking after snooze ends (modulo the existing 15-minute
  `showCooldowns` window, which is unrelated to this fix).
- `plans/003-toggle-double-count.md` touches the same toggle-handler area of
  `content.js` for an unrelated stat-accuracy fix — read that plan's Scope
  section before starting if both are being executed in the same session.
