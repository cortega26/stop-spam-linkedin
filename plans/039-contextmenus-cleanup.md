# Plan 039: `contextMenus.create` — remove stale items on update and surface errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- background.js`
> If background.js changed since this plan was written, compare the
> "Current state" excerpt against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`background.js` creates the two context-menu items only in
`onInstalled` with no `removeAll()` and no error callback. On an
extension update, the previous version's items may still exist; the
duplicate-id `create` calls then fail silently (Chrome surfaces the
error only through `chrome.runtime.lastError`), leaving the *old* item —
with the old title and, more importantly, the old `targetUrlPatterns`
(`background.js:32-37`) — in place. When a release adds `school/*` or
`showcase/*` patterns or renames a title, users keep seeing the stale
menu. `removeAll()` before create is the canonical pattern; an error
check turns silent failure into a trace.

## Current state

- `background.js:21-39`:
  ```js
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "install" && details.reason !== "update") return;
    chrome.contextMenus.create({
      id: MENU_ID,
      title: t("contextMenuTitle"),
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_ID_BLOCK_AUTHOR,
      title: t("blockAuthorMenu"),
      contexts: ["link"],
      targetUrlPatterns: [
        "*://*.linkedin.com/in/*",
        "*://*.linkedin.com/company/*",
        "*://*.linkedin.com/school/*",
        "*://*.linkedin.com/showcase/*",
      ],
    });
  });
  ```
- `background.js:43` — the message listener verifies `sender.id` (the house pattern for callbacks: check `chrome.runtime.lastError` in the callback).

Repo conventions: `chrome.runtime.lastError` is checked in callbacks
throughout the extension (content.js:172-178 pattern); `background.js`
is a `"use strict"` IIFE. MV3 supports `removeAll` returning a promise —
match the file's callback style unless promises are already used there
(they are not).

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
- `background.js`

**Out of scope** (do NOT touch):
- `content.js` — context-menu click handling lives in background.js only.
- The menu items' titles/patterns themselves — keep them identical.
- `popup/popup.js`, `options/options.js`.

## Git workflow

- Branch: `advisor/039-contextmenus-cleanup`
- Commit message style: conventional, e.g. `fix(background): remove stale context menus on update and log create errors`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: `removeAll()` then create, with error reporting

In `background.js:21-39`, wrap the creates: call
`chrome.contextMenus.removeAll()` first (callback style), then run the
two `create` calls inside its callback, each with an error check:

```js
chrome.contextMenus.removeAll(() => {
  const createMenu = (options) => {
    chrome.contextMenus.create(options, () => {
      if (chrome.runtime.lastError) {
        console.warn("contextMenus.create failed:", chrome.runtime.lastError.message);
      }
    });
  };
  createMenu({ id: MENU_ID, title: t("contextMenuTitle"), contexts: ["selection"] });
  createMenu({ id: MENU_ID_BLOCK_AUTHOR, title: t("blockAuthorMenu"), contexts: ["link"], targetUrlPatterns: [...] });
});
```

Match the file's callback style; keep `id`s and `targetUrlPatterns`
identical to today.

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all pass.

### Step 2: e2e — menu creation doesn't error the service worker

The e2e suite installs the extension fresh (install reason), so the
removeAll path is exercised on every run. Run the suite and assert the
background service worker has no uncaught error / `contextMenus.create
failed` warning:

`npm run test:extension` → both files pass, and (inspect via the
service worker console if your harness exposes it — if not, rely on the
suite's pass and the absence of new console assertions failing).

**Verify**: e2e files pass.

## Test plan

No new tests — fresh-install e2e already covers the happy path; the
error-check is defensive. If the e2e harness asserts on console
messages, add an assertion that no `contextMenus.create failed` warning
appears; otherwise note the limitation.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes
- [ ] `grep -n "contextMenus.removeAll" background.js` matches
- [ ] `grep -n "lastError" background.js` shows the contextMenus check
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpt (drift).
- A verification fails twice after a reasonable fix attempt.
- `removeAll` proves unavailable in Firefox MV3 (check the manifest's
  `browser_specific_settings` support; it is supported — if a runtime
  error says otherwise, report it).

## Maintenance notes

- When a release changes menu titles or `targetUrlPatterns`, this
  removeAll guarantees the new config wins — that's the point.
- If Firefox's contextMenus differs from Chrome's (e.g. no removeAll
  promise), the callback form used here is the compatible middle
  ground; keep it.
- Reviewer should verify the menu ids (`MENU_ID`, `MENU_ID_BLOCK_AUTHOR`)
  are unchanged so the block-author click handler in the same file
  (`onClicked`, ~line 50-60) still matches.
