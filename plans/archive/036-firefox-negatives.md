# Plan 036: Firefox smoke — negative controls and a whitelist-path assertion

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- tests/firefox-smoke.js tests/helpers.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`tests/firefox-smoke.js` (added in batch 021) proves the extension
installs and blocks a known spam post in Firefox — but asserts only
positives. An over-matching regression (a pattern that hides everything)
would still pass: nothing asserts that the mock's `clean-1` post stays
visible, and nothing exercises the whitelist branch (the harness comment
at `:312-314` notes the whitelist isn't seeded, so `whitelisted-1` gets
blocked and `content.js:781`'s whitelist skip never runs under Firefox).
Firefox is a supported store; its smoke should carry the same negative
controls the Chromium e2e has.

## Current state

- `tests/firefox-smoke.js:301-335` — after install + navigate:
  ```js
  const blocked = await driver.execute(`
    const post = document.querySelector('[data-id="urn:li:activity:spam-1"]');
    return post && getComputedStyle(post).display === "none";
  `);
  assert.equal(blocked, true, ...);
  const placeholderCount = await driver.execute(
    "return document.querySelectorAll('[data-ss-ph]').length;"
  );
  assert.equal(placeholderCount, 2, "expected two placeholders");
  ```
- `tests/helpers.js:12-44` — the mock feed: `spam-1` (blocked), `whitelisted-1` (author `trusted`, bait text), `clean-1` (ordinary text).
- The harness can't reach `chrome.storage` from the page context (WebDriver executes in the page, not the extension) — seeding the whitelist requires an extension-context handle, which geckodriver doesn't expose. Scope this plan accordingly: negative control + author-parse check only.

Repo conventions: e2e asserts computed display, not element existence.
The Firefox harness drives via raw WebDriver `execute` scripts.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Firefox   | `npm run test:firefox`   | "Firefox smoke test passed." |

## Scope

**In scope**:
- `tests/firefox-smoke.js`

**Out of scope** (do NOT touch):
- `tests/helpers.js` — the mock feed stays as-is (its `whitelisted-1`
  post is load-bearing for the Chromium e2e count assertions).
- The whitelist-branch e2e under Firefox — impossible without
  extension-context storage access via geckodriver; note it in
  Maintenance notes.
- Chromium test files.

## Git workflow

- Branch: `advisor/036-firefox-negatives`
- Commit message style: conventional, e.g. `test(firefox): assert clean post stays visible and author is parsed`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Negative control — clean post stays visible

After the existing placeholder-count assertion in
`tests/firefox-smoke.js`, add:

```js
const cleanVisible = await driver.execute(`
  const post = document.querySelector('[data-id="urn:li:activity:clean-1"]');
  return post && getComputedStyle(post).display !== "none";
`);
assert.equal(cleanVisible, true,
  "expected the clean post to stay visible in Firefox (over-match regression)");
```

**Verify**: `npm run test:firefox` → "Firefox smoke test passed."

### Step 2: Author-parse smoke — the whitelisted post's author resolves

Add an assertion that the content-script's author parsing runs under
Firefox (the whitelist skip path can't be driven directly, but the
author-link reading can): execute a script that reads the
`whitelisted-1` section's actor link href and asserts it's a LinkedIn
profile URL — OR, if the content script exposes no global you can call,
assert the `whitelisted-1` post IS hidden (its bait text matches; it
blocks because the whitelist is empty in this harness) — i.e. the
existing 2-placeholder count already covers it. Pick the stronger check
that works: if `window.SS_parseAuthorId` is exposed on the page (check
`shared/pattern-data.js` root assignment — it is NOT; globals are
`SS_*` on the extension's isolated world, not the page), you cannot call
it from the page. In that case, assert instead that `whitelisted-1` is
hidden (bait match) and leave the author-parse to the Chromium e2e.

**Verify**: `npm run test:firefox` → passes. Update the comment at
`:312-314` to reflect what the harness does and doesn't cover.

### Step 3: Run the full suite

`npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit`,
`npm run test:extension`, `npm run test:firefox` — all pass.

## Test plan

The two new assertions (Steps 1-2). No other files change.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes (mock feed unchanged)
- [ ] `npm run test:firefox` passes with the clean-post assertion
- [ ] `grep -n "clean-1" tests/firefox-smoke.js` matches
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- The clean post is NOT visible in Firefox (an over-match regression
  exists) — that's a real bug; report it as a finding, don't adjust the
  assertion.
- You find a way to reach the extension context from WebDriver (e.g. a
  documented `moz-extension://` navigation path geckodriver permits) —
  then the whitelist-branch assertion becomes possible; implement it and
  note the method for future harness work.

## Maintenance notes

- The whitelist-branch-under-Firefox gap remains (geckodriver can't seed
  extension storage); the Chromium e2e covers that path.
- When the mock feed gains posts (e.g. plan 025's FR/PT/DE injections
  don't touch it, but any future feed edit must), keep the
  negative-control assertion in mind: `clean-1` must stay clean.
- Reviewer should confirm the harness's `finally` block still cleans up
  when the new assertions fail.
