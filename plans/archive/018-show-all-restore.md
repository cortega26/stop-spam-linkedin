# Plan 018: Add a "Show all hidden posts" button to the popup (session restore)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js popup/ _locales/en/messages.json _locales/es/messages.json tests/extension-smoke.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 014 adds a fuller popup e2e file; this plan's
  scenario goes into `tests/extension-smoke.js`, which always exists)
- **Category**: direction
- **Planned at**: commit `1f7f4e3`, 2026-08-14

## Why this matters

The README's "Reversible" positioning promises undoing blocked posts, but
today that's strictly per-post: the popup undo list holds at most the last
5 blocks, and on a bad day (a new false-positive pattern, or the starter
pack catching legitimate posts) restoring everything means clicking
through placeholders one by one. `content.js` already has exactly the
function needed — `restoreBlocked()` (lines 822-830) — wired to disable
and snooze but not to any user-facing single action. A "Show all" button
in the popup exposes the session restore that the machinery already
supports: one click, all hidden posts visible again, badge cleared. It's
the cheapest high-value addition the current architecture makes possible:
no new storage, no new scanning behavior, one message case and one button.

## Current state

`content.js:822-830` — the restore function that will back the new message
case:
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

`content.js:349-360` — the message case to model after (the undo case):
```js
      case "undoBlock":
        {
          const entry = lastBlocked[msg.index];
          if (entry) {
            restorePost(entry.post);
            lastBlocked.splice(msg.index, 1);
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false });
          }
        }
        break;
```

`popup/popup.html:324-325` — where the button goes (next to snooze/reset):
```html
    <button id="snoozeBtn">__MSG_snooze30__</button>
    <button id="resetBtn">__MSG_resetCount__</button>
```

`popup/popup.js` — `send()` helper (lines 44-58) and `refreshState()`
(lines 289-302); the popup is connected (`hasLiveState === true`) only
when a LinkedIn tab responds to `getState`.

`_locales/en/messages.json` and `_locales/es/messages.json` — where new
i18n keys must be added (both files, or the key falls back to its raw
name via `t()`).

**Conventions**: placeholder-adjacent elements use `data-ss-ph`; popup
buttons are plain `<button>` with `__MSG_` text; `renderState(response,
hasLiveState)` in `popup.js:178` is the single render path. The e2e smoke
test asserts placeholder counts and `getComputedStyle(el).display` — the
new scenario follows that pattern (locale is `en` in the test browser).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `npm run smoke` | exit 0 |
| e2e unpacked | `npm run test:extension` | exit 0, "Extension smoke test passed." |
| Locale parity | `node -e "const e=require('./_locales/en/messages.json'), s=require('./_locales/es/messages.json'); for (const k of ['showAll','showAllTooltip']) if (!e[k] || !s[k]) process.exit(1); console.log('ok')"` | `ok` |

## Scope

**In scope**:
- `content.js` (new `restoreAll` message case)
- `popup/popup.html` (the button)
- `popup/popup.js` (click handler + hide when not connected)
- `_locales/en/messages.json`, `_locales/es/messages.json` (2 keys each)
- `README.md` (one bullet under "Controls", English file only — the
  translated docs/README.* files are maintained by the language process in
  plan 012 and are out of scope here)
- `tests/extension-smoke.js` (one scenario at the end)

**Out of scope**:
- Changing `restoreBlocked()`'s behavior — it's shared with disable and
  snooze paths; this plan only adds the message case that calls it.
- Clearing `lastBlocked` in `restoreBlocked()` itself — the undo list is
  cleared only by this plan's new handler (see Step 2) to keep the
  disable/snooze paths byte-identical.
- `CHANGELOG.md` / `RELEASE_NOTES.md` / version bumps — the maintainer does
  those at release time (per `RELEASE_CHECKLIST.md`); do not touch them.
- The "report missed spam" placeholder button (plan 019) and any change to
  placeholder internals.

## Git workflow

- Branch: `advisor/018-show-all`
- Commit message style: `feat(popup): add "Show all" to restore every hidden post`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Content-script message case

In `content.js`, inside the `chrome.runtime.onMessage` switch, after the
`"undoBlock"` case (line 360), add:

```js
      case "restoreAll":
        restoreBlocked();
        lastBlocked.length = 0;
        sendResponse({ ok: true });
        break;
```

`restoreBlocked()` already clears the badge and removes every placeholder.
Clearing `lastBlocked` keeps the popup's undo list from offering stale
entries for posts that are now visible again.

**Verify**: `npm run smoke` → exit 0; `grep -n '"restoreAll"' content.js` → 1 match.

### Step 2: Popup button

In `popup/popup.html`, after the `resetBtn` line, add:

```html
    <button id="showAllBtn">__MSG_showAll__</button>
```

In `popup/popup.js`:
1. Add the element ref near the other refs (line ~21):
   `const showAllBtn = document.getElementById("showAllBtn");`
2. In `renderState()` (line ~178), hide the button when there's no live
   tab — restoring only makes sense against a connected content script:
   ```js
   showAllBtn.style.display = hasLiveState ? "" : "none";
   ```
3. Add the click handler near the other button handlers (after the snooze
   handler, ~line 379):
   ```js
   showAllBtn.addEventListener("click", () => {
     send({ action: "restoreAll" }, (response) => {
       if (response && response.ok) refreshState();
     });
   });
   ```

**Verify**: `npm run smoke` → exit 0; `grep -n "showAllBtn" popup/popup.js popup/popup.html` → 3 matches (html id, js ref, js handler).

### Step 3: Locale keys

Add to `_locales/en/messages.json` and `_locales/es/messages.json` (follow
the exact shape of a neighboring key, including `"message"` and
`"description"` fields; Spanish values are your own native-level
translations of the English ones):

- `showAll` — en: "Show all" / es: "Mostrar todas"
- `showAllTooltip` — en: "Restore all hidden posts for this session" /
  es: "Restaurar todas las publicaciones ocultas de esta sesión"

**Verify**: `npm run smoke` → exit 0 (it validates both locale files with
`jq`); the locale-parity command above prints `ok`.

### Step 4: README bullet

In `README.md`'s "Controls" list (lines 52-59), after the undo bullet,
add:

```markdown
- "Show all" from the popup to restore every hidden post for the session
```

**Verify**: `grep -n "Show all" README.md` → 1 match.

### Step 5: e2e scenario

Append to `tests/extension-smoke.js`, after the placeholder-text assertion
(~line 103, before the final success log):

1. Open the popup as a page (the mock LinkedIn page is the active tab):
   ```js
   const worker = context.serviceWorkers()[0];
   const extId = new URL(worker.url()).host;
   const popup = await context.newPage();
   await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
   ```
2. Wait for the popup's live state (spam-1 was blocked on page load, so
   `#blockedCount` shows `1`): `await popup.locator("#blockedCount").waitFor();`
3. Click `#showAllBtn`.
4. Assert: `[data-ss-ph]` count is 0 and the spam section's `display` is
   not `none` (reuse `assertCount` and the `getComputedStyle` pattern).

**Verify**: `npm run test:extension` → exit 0, "Extension smoke test
passed."

## Test plan

- One new e2e scenario (Step 5) in `tests/extension-smoke.js`: blocked
  post exists → popup "Show all" → post visible, placeholders gone.
- Existing scenarios (hide, whitelist, clean) must stay green — the new
  message case doesn't touch `blockPost()`.
- Manual check (optional but recommended): on a real LinkedIn feed with
  several blocked posts, confirm the button also clears the extension
  badge (assert `chrome.action.getBadgeText` in the worker after the
  scenario if you want it automated — not required).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0, "Extension smoke test passed."
- [ ] `grep -n '"restoreAll"' content.js` → 1; `grep -n "showAllBtn" popup/popup.js popup/popup.html` → 3
- [ ] `node -e "..."` locale-parity check passes for `showAll`/`showAllTooltip`
- [ ] `grep -n "Show all" README.md` → 1
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 013 has landed and `restoreBlocked()` differs from the excerpt (it
  shouldn't — 013 touches `blockPost`/`restorePost`, not `restoreBlocked`
  — but verify before editing).
- The popup never shows live state in the e2e scenario (noConnection
  visible) — the active-tab assumption failed; report rather than
  working around it.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- "Show all" is session-only by design: a reload re-scans and re-blocks.
  If users ask for a persistent "don't re-block these", that's a new
  feature (per-post exclusions exist; a bulk "Not spam" is a different
  product decision) — record the request, don't expand this plan.
- Plan 014's interactions file will drive the popup — if it lands first,
  the show-all click could move there later; the smoke scenario is kept
  here so this plan stays independent of 014.
- A reviewer should scrutinize: the button is hidden when the popup has no
  live tab (Step 2.2) — without that, clicking it on a non-LinkedIn tab
  would silently no-op.
- The undo list (`lastBlocked`) is intentionally cleared on restore-all —
  stale undo rows after a bulk restore would be a confusing no-op.
