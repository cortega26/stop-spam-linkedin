# Plan 014: Extend the e2e suite to cover the interactive flows — placeholder buttons, popup actions, options page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- tests/ package.json content.js popup/ options/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (soft: the snooze-RESUME scenario is intentionally
  excluded — it belongs to plan 002; the "Show" button's re-created-node
  behavior is covered by plan 013's scenario, not duplicated here)
- **Category**: tests
- **Planned at**: commit `1f7f4e3`, 2026-08-14

## Why this matters

`tests/extension-smoke.js` (192 lines) verifies exactly one thing: that a
matching post gets hidden, that a whitelisted author's post stays visible,
and that a clean post stays visible. None of the extension's interactive
surfaces have automated coverage — the placeholder buttons ("Show", "Not
spam", "Never block this author"), the popup (toggle, snooze, reset, undo),
and the options page (add/toggle/delete phrases, import, language toggles)
are exercised only by hand. The two most recent correctness fixes planned
in this folder (002 snooze-resume, 003 toggle double-count) both live in
exactly this untested territory. This plan builds a second e2e file that
drives those flows for real, plus a shared harness extracted from the smoke
test so the two files don't each maintain a divergent copy of the Playwright
setup.

## Current state

`tests/extension-smoke.js` — structure to mirror and mine for the harness:
- lines 12-48: `repoRoot`, `resolveExtensionPath()` (handles dir-or-zip,
  used by both `test:extension` and `test:package`), `userDataDir`,
  `mockLinkedInFeed` fixture (3 sections: `spam-1` blocked, `whitelisted-1`
  with a `/in/trusted/` author link, `clean-1`), imports of `chromium`,
  `fs`, `os`, `path`, `assert/strict`.
- lines 50-110: `main()` — `chromium.launchPersistentContext` with
  `--disable-extensions-except` / `--load-extension` args, `headless: false`,
  `setSyncStorage(context, { ss_whitelist: ["trusted"] })`, a
  `context.route("https://www.linkedin.com/feed/**")` that fulfills the mock
  feed, `page.goto("https://www.linkedin.com/feed/")`, then assertions.
- lines 112-182: `resolveExtensionPath()`, `setSyncStorage()` (reaches the
  extension service worker via `context.serviceWorkers()[0]` and
  `worker.evaluate(...)` against `chrome.storage.sync`), `assertPackageVersion()`,
  `readJson()`, `execUnzip()`.
- line 184-187: `assertCount()` helper.

`package.json` scripts (lines 7-10 of that file):
```json
    "test:extension": "if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js; else xvfb-run -a node tests/extension-smoke.js; fi",
    "test:package": "npm run package && ZIP=$(node -p \"'dist/linkedin-spam-blocker-' + require('./manifest.json').version + '.zip'\") && if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js \"$ZIP\"; else xvfb-run -a node tests/extension-smoke.js \"$ZIP\"; fi",
```

The extension's message surface (what the popup drives) is in
`content.js:290-429` (`getState`, `toggle`, `resetCount`, `snooze`,
`clearSnooze`, `undoBlock`, `addSuggestion`, `dismissSuggestion`, plus
whitelist actions). The popup page is `popup/popup.html` + `popup/popup.js`
(388 lines); the options page is `options/options.html` + `options/options.js`
(758 lines). Both are ordinary extension pages reachable at
`chrome-extension://<id>/popup/popup.html` and `.../options/options.html`,
so Playwright can open them as pages. The popup's `send()` helper
(`popup/popup.js:44-58`) messages the **active tab** via
`chrome.tabs.query({ active: true, currentWindow: true })` — the tests must
keep the mock LinkedIn page as the active tab whenever the popup is being
driven (see Steps).

`content.js`'s placeholder buttons: "Show" (`content.js:782-792`,
`t("show")`), "Not spam" (`content.js:743-759`, `t("notSpam")`), and
"Never block this author" (`content.js:762-780`, `t("neverBlock")`,
rendered only when an author ID is found). Button labels are localized —
in the test browser the locale is `en`, so the labels are "Show",
"Not spam", "Never block this author".

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax   | `npm run smoke` | exit 0 |
| e2e unpacked | `npm run test:extension` | exit 0, both files print success |
| e2e packaged | `npm run test:package` | exit 0, both files print success |
| Format check | `node --check tests/helpers.js tests/extension-interactions.js tests/extension-smoke.js` | exit 0 |

## Scope

**In scope**:
- New file: `tests/helpers.js` (shared harness: extension path resolution,
  zip unpacking/version assertions, `setSyncStorage` + a new
  `setLocalStorage`, extension-ID discovery, the mock feed fixture
  extended with one new section)
- `tests/extension-smoke.js` (rewire to import the harness; the existing
  assertions stay exactly as they are)
- New file: `tests/extension-interactions.js` (the new scenarios)
- `package.json` (run both e2e files in `test:extension` and `test:package`)

**Out of scope**:
- The snooze-RESUME scenario (snooze expiry → posts re-blocked): owned by
  plan 002's test plan. Do not assert DOM re-blocking after snooze/cancel
  here — it currently fails on unfixed code.
- The "Show" button + re-created-node scenario: owned by plan 013. Do not
  duplicate it.
- Testing `findBySiblingHeuristic` / shadow-DOM scanning (needs a live
  real-LinkedIn DOM; unit-testing is deferred by plan 005).
- Any production-code change. If a scenario exposes a bug, record it in
  your report and in `plans/README.md`; do not fix it in this plan.
- `dist/`, `.github/workflows/*` (the CI scripts call `npm run test:*`,
  so they pick the new file up automatically).

## Git workflow

- Branch: `advisor/014-e2e-interactions`
- Commit message style: `test(e2e): drive popup, placeholder, and options flows in Playwright`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract `tests/helpers.js`

Create `tests/helpers.js` and move these from `tests/extension-smoke.js`
(unchanged bodies): `repoRoot`, `resolveExtensionPath()`,
`assertPackageVersion()`, `readJson()`, `execUnzip()`, `setSyncStorage()`,
`assertCount()`. Export them via `module.exports`. Also add two new
functions:

```js
async function setLocalStorage(context, patch) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
  await worker.evaluate((value) => new Promise((resolve) => {
    chrome.storage.local.set(value, resolve);
  }), patch);
}

async function getExtensionId(context) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
  return new URL(worker.url()).host;
}
```

Move `mockLinkedInFeed` into `helpers.js` too, and add a fourth section to
it (before the closing `</main>`), used by the never-block-author scenario:

```html
      <section data-id="urn:li:activity:author-block-1">
        <div class="update-components-actor">
          <a href="/in/spammer/">Spammy Author</a>
        </div>
        <p>
          Comment "SECRET" and I'll send you the full growth framework,
          template pack, and checklist right now today.
        </p>
      </section>
```

Export the fixture as `mockLinkedInFeed`. Rewire `tests/extension-smoke.js`
to `require("./helpers")` and delete the moved code from it — the file's
`main()` and its assertions must remain byte-identical apart from the
imports. (Note: helpers must use `path.resolve(__dirname, "..")` still —
moving into `tests/` doesn't change `__dirname`; verify with the zip check
below.)

**Verify**: `npm run test:extension` → exit 0, "Extension smoke test
passed." (This proves the harness extraction didn't break the existing
scenario, including the `--package` zip path if you also run
`npm run test:package`.)

### Step 2: New e2e file — scaffold + undo scenario

Create `tests/extension-interactions.js` following the smoke file's shape:
launch the persistent context with the same args, `setSyncStorage(context,
{})`, route the feed, `page.goto("https://www.linkedin.com/feed/")`, wait
for the first `[data-ss-ph]` placeholder (timeout 10000). Keep a reference
to the mock page as `linkedInPage`. Then scenario 1:

1. Open the popup as a page:
   `const popup = await context.newPage(); await popup.goto(`chrome-extension://${await getExtensionId(context)}/popup/popup.html`);`
   Pre-check: the popup shows LIVE state — assert
   `popup.locator("#noConnection")` is hidden and `#blockedCount` shows `1`.
   (Before every popup interaction in this file, do
   `await linkedInPage.bringToFront();` — the popup messages the active tab.)
2. The "Last blocked" row for spam-1 is rendered (`.last-blocked-item`
   count ≥ 1). Click its undo button (`.lb-undo`).
3. Assert spam-1's `display` is not `none` and the placeholder count is 0.

**Verify**: `npm run test:extension` → exit 0 with both files' success
lines; the new file's scenario passes.

### Step 3: Popup toggle, snooze, reset scenarios

Continuing in the same file, in this exact order (each with
`linkedInPage.bringToFront()` before clicking):

1. **Toggle off**: uncheck `#toggleEnabled` → wait ~700ms → all three
   spam sections (`spam-1`, `author-block-1`) have `display` not `none`;
   `[data-ss-ph]` count is 0. Assert storage `ss_enabled === false`
   (via `worker.evaluate` reading `chrome.storage.sync`).
2. **Toggle on**: check it again → wait ~1500ms (debounce 500ms + scan) →
   `[data-ss-ph]` count is 2 (spam-1 and author-block-1 are blocked;
   whitelisted-1 and clean-1 are not). Assert `ss_enabled === true`.
3. **Snooze**: click `#snoozeBtn` → wait ~700ms → all spam sections
   visible again; read `ss_snooze_until` from `chrome.storage.local` and
   assert it's `> Date.now() + 25 * 60 * 1000`.
4. **Cancel snooze**: click `#snoozeBtn` (its label is now the cancel
   variant) → assert `ss_snooze_until === 0` in storage. Do NOT assert any
   DOM re-blocking (that's plan 002's territory).
5. **Reset count**: click `#resetBtn` once (arms confirmation), click again
   within 3s → assert `ss_blocked_count === 0` in `chrome.storage.local`.

**Verify**: `npm run test:extension` → both files pass.

### Step 4: Placeholder-button scenarios

1. **Not spam**: spam-1 is blocked again after Step 3.2's re-block (if it
   isn't — e.g. a plan landed that changed this — stop and report). Click
   the placeholder's "Not spam" button on spam-1 → spam-1 visible, its
   placeholder gone. Then append a NEW section with the identical spam text
   (page.evaluate: create `document.createElement("section")`, set
   `data-id="urn:li:activity:spam-2"`, set `textContent` to the same
   "Comment CLAUDE..." paragraph) → wait 1500ms → assert no placeholder
   exists in that new section (the exclusion signature is global) and
   `ss_excluded` in sync storage has length ≥ 1.
2. **Never block this author**: author-block-1 is still blocked; its
   placeholder has the author button. Click "Never block this author" →
   section visible, placeholder gone; assert `ss_whitelist` in sync storage
   contains `"spammer"`.
3. **Re-block is still possible**: append another new section
   (`data-id="urn:li:activity:spam-3"`) with the same author-block-1 text
   but a different author link (`/in/other-spammer/`) → wait 1500ms →
   assert it IS blocked (proves the whitelist is author-scoped, not
   text-scoped).

**Verify**: `npm run test:extension` → both files pass.

### Step 5: Options-page scenarios

Open the options page as a page:
`await optionsPage.goto(`chrome-extension://${await getExtensionId(context)}/options/options.html`)`.

1. **Add phrase**: fill `#phraseInput` with `"TESTWORD"`, click `#addBtn` →
   assert `ss_phrases` in sync storage contains an entry with
   `text === "TESTWORD"` and `enabled === true`.
2. **Toggle off**: click the row's checkbox for TESTWORD (the
   `.phrase-row.custom` row whose `.text` is "TESTWORD", then `input[type=checkbox]`)
   → assert that entry has `enabled === false` in storage.
3. **Edit**: click the row's edit button, clear+type `"TESTWORD2"`, press
   Enter → assert storage has `"TESTWORD2"` and no `"TESTWORD"`.
4. **Delete**: click the row's delete button twice (confirmation) → assert
   storage no longer contains it.
5. **Language toggle**: click the `.lang-tog` whose text is `Español` (it
   starts enabled) → assert `ss_enabled_langs` in sync storage no longer
   contains `"ES"`. Click it again → contains `"ES"` again.
6. **Import**: write a temp JSON file (e.g. `os.tmpdir()` +
   `lsb-import-test.json`): `[{"text":"IMPORTED-ONE","enabled":true,"mode":"exact"},{"text":"IMPORTED-TWO","enabled":false,"mode":"contains"}]`
   → `optionsPage.setInputFiles("#importFile", tmpPath)` → assert
   `ss_phrases` contains both entries (with the stored `mode`/`enabled`
   preserved), then delete the temp file.

**Verify**: `npm run test:extension` → both files pass.

### Step 6: Wire up package.json

Update the two scripts so both e2e files run (keep the existing
`$DISPLAY`/`xvfb-run` guards and the `$ZIP` argument pass-through exactly as
they are):

```json
    "test:extension": "if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js && node tests/extension-interactions.js; else xvfb-run -a node tests/extension-smoke.js && xvfb-run -a node tests/extension-interactions.js; fi",
    "test:package": "npm run package && ZIP=$(node -p \"'dist/linkedin-spam-blocker-' + require('./manifest.json').version + '.zip'\") && if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js \"$ZIP\" && node tests/extension-interactions.js \"$ZIP\"; else xvfb-run -a node tests/extension-smoke.js \"$ZIP\" && xvfb-run -a node tests/extension-interactions.js \"$ZIP\"; fi",
```

**Verify**: `npm run test:extension` → exit 0, both files' success lines;
`npm run test:package` → exit 0 (this also confirms `tests/` files stay out
of the zip — the zip path exercises `resolveExtensionPath`'s unpacking).

## Test plan

- All scenarios live in `tests/extension-interactions.js`, one sequential
  flow (each scenario's assertions documented in Steps 2–5), reusing the
  harness from `tests/helpers.js`.
- Regression targets: undo (popup), toggle off/on (popup), snooze start +
  cancel (popup), reset count (popup), Not-spam exclusion persistence
  (placeholder), never-block-author whitelist write + author-scoping
  (placeholder), options CRUD + lang toggles + import (options page).
- Existing smoke scenarios must keep passing unchanged (Step 1 verifies).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0; both files print success
- [ ] `npm run test:package` exits 0 (zip path exercises both files)
- [ ] `tests/helpers.js` exists and is required by both e2e files
- [ ] `grep -n '"test:extension"\|"test:package"' package.json` shows both
      files in each script
- [ ] `git diff --stat 1f7f4e3..HEAD -- content.js popup/ options/` shows NO
      production-code changes from this plan
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A scenario fails because of a genuine product bug (e.g. toggling off
  doesn't restore posts, the undo button mis-targets). Record the bug in
  your report and STOP — do not change production code, and do not weaken
  the test to make it pass.
- The popup page never shows live state (`#noConnection` stays visible) —
  the active-tab assumption in the harness is broken in this environment;
  report before inventing a workaround.
- `npm run test:package` fails on version mismatch — check whether
  `manifest.json`/`package.json`/`VERSION` were bumped outside your scope;
  report rather than editing them.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Plan 002 owns the snooze-resume DOM assertion; when it lands, the
  cancel-snooze scenario here (Step 3.4) can be extended with the
  re-blocking assertion — add it to plan 002's follow-ups, not here.
- Plan 018 (popup "Show all" button) and plan 019 (placeholder "Report"
  button) both add UI this file drives — their plans add their own
  scenarios; keep this file's scenarios ordered and self-contained so new
  ones can append after Step 5 without renumbering.
- If LinkedIn's mock markup ever changes (e.g. `data-id` format), update
  `helpers.js`'s fixture in one place — that's the point of the extraction.
- A reviewer should scrutinize: the extraction in Step 1 is a pure move —
  any behavioral change to `extension-smoke.js`'s assertions is a red flag.
