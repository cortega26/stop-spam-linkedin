# Plan 055: Scan LinkedIn school and showcase pages (close the author-surface coverage gap)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- manifest.json README.md docs/ tests/extension-smoke.js tests/helpers.js shared/pattern-data.js background.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (two additional match patterns on a host the extension already runs on; no detection-logic change)
- **Depends on**: none
- **Category**: direction (build — a decided, small shape)
- **Planned at**: commit `4f80330`, 2026-09-13 (branch `advisor/b1-stopspam-lock`, 3 commits ahead of `main`)

## Why this matters

The extension already treats LinkedIn schools and showcase pages as
first-class author identities: `SS_parseAuthorId` mints `school:` and
`showcase:` ids, the right-click "Block this author" menu accepts links to
both, and the README promises "Author whitelist for profile, company,
school, and showcase pages". But `manifest.json` never asks to run on
`https://www.linkedin.com/school/*` or `https://www.linkedin.com/showcase/*`,
so the content script never loads there: bait posts on a school or showcase
feed stay visible, and neither "Never block this author" nor "Not spam" can
be used on those pages. The user-visible result is a feature that looks
half-wired — you can blocklist a school from a link, then visit the school
page and watch its spam render untouched. Two match patterns on a host the
extension already runs on close it.

## Current state

The facts the executor needs, inlined:

- `manifest.json:33-44` — the content-script match list as it exists today.
  Note every entry is the same scheme+host (`https://www.linkedin.com`),
  differing only in path:
  ```json
      "matches": [
        "https://www.linkedin.com/feed/*",
        "https://www.linkedin.com/in/*",
        "https://www.linkedin.com/posts/*",
        "https://www.linkedin.com/company/*",
        "https://www.linkedin.com/groups/*",
        "https://www.linkedin.com/search/*",
        "https://www.linkedin.com/mynetwork/*",
        "https://www.linkedin.com/notifications/*",
        "https://www.linkedin.com/jobs/*",
        "https://www.linkedin.com/newsletters/*",
        "https://www.linkedin.com/pulse/*"
      ],
  ```
- `shared/pattern-data.js:180-182` — `SS_parseAuthorId` already understands
  both surfaces:
  ```js
      { re: /^\/company\/([^/?#]+)/, prefix: "company:" },
      { re: /^\/school\/([^/?#]+)/, prefix: "school:" },
      { re: /^\/showcase\/([^/?#]+)/, prefix: "showcase:" },
  ```
- `background.js:41-46` — the "Block this author" context menu is already
  offered on school/showcase links:
  ```js
        targetUrlPatterns: [
          "*://*.linkedin.com/in/*",
          "*://*.linkedin.com/company/*",
          "*://*.linkedin.com/school/*",
          "*://*.linkedin.com/showcase/*",
        ],
  ```
- `README.md:60` claims whitelist support for school and showcase pages;
  `README.md:72` lists supported pages and omits both. The same
  supported-pages line exists translated at `docs/README.es.md:67`,
  `docs/README.fr.md:67`, `docs/README.pt.md:67`, `docs/README.de.md:67`.
- The e2e harness fakes LinkedIn by routing a URL glob to a mock document —
  `tests/extension-smoke.js:40-51`:
  ```js
      await context.route("https://www.linkedin.com/feed/**", (route) => {
        route.fulfill({
  ```
  The mock document is `mockLinkedInFeed` in `tests/helpers.js:12-41`; it
  contains a spam post (`data-id="urn:li:activity:spam-1"`) and a clean post
  (`urn:li:activity:clean-1`).
- Repo conventions that apply (from `AGENTS.md`): no build step; every JS
  file is a `"use strict"` IIFE; `npm run smoke` validates JSON with `jq`
  before `node --check`; commits are conventional-ish
  (`type(scope): summary`).

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Syntax + JSON smoke | `npm run smoke` | executed | exit 0 |
| Lint | `npm run lint` | executed | exit 0 |
| Typecheck | `npm run typecheck` | executed | exit 0 |
| Unit tests | `npm run test:unit` | executed | exit 0, 64 tests pass |
| Browser e2e | `npm run test:extension` | declared | exit 0 |
| Packaged e2e | `npm run test:package` | declared | exit 0 |

`executed` rows were run by the advisor on an unmodified checkout at
`4f80330` and all exited 0 (unit: 64/64). The browser suites need
Playwright's Chromium (`npx playwright install --with-deps chromium`); the
advisor is not permitted to install it, hence `declared`.

## Scope

**In scope** (the only files you should modify):
- `manifest.json` — add two match patterns
- `README.md` and `docs/README.es.md`, `docs/README.fr.md`,
  `docs/README.pt.md`, `docs/README.de.md` — supported-pages line
- `tests/extension-smoke.js` — one new scenario
- `plans/README.md` — your status row

**Out of scope** (do NOT touch, even though they look related):
- `content.js`, `shared/post-container.js` — detection and container
  heuristics are unchanged by this plan. If school/showcase markup turns
  out to need different container selectors, that is a separate finding:
  record it, do not fix it here.
- `background.js` — its `targetUrlPatterns` already cover both surfaces.
- Adding any other match pattern (`/events/`, `/learning/`, the bare
  `https://www.linkedin.com/*`). Broadening the host or adding surfaces
  nobody asked for is out of scope; `/school/` and `/showcase/` are in
  scope precisely because `SS_parseAuthorId` and the context menu already
  support them.
- `optional_host_permissions` or any new permission entry.

## Git workflow

- Branch: `advisor/055-school-showcase-coverage`
- One commit is fine; message style example from `git log`:
  `fix(stores): complete Firefox version creation and check upload validity`.
  Suggested: `feat(manifest): scan school and showcase pages`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run every command in the table on the unmodified checkout.

- If they all pass: record that and proceed.
- If a `declared` command does not exist or fails on the unmodified
  checkout: that is a broken baseline, not something you introduced. **STOP
  and report it** with the exact output.
- If an `executed` command fails: the repo drifted. Treat it as a drift STOP
  condition.

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 64 unit tests pass.

### Step 1: Prove the gap with a failing e2e scenario (write the test FIRST)

Add a scenario to `tests/extension-smoke.js` that routes a school URL to the
existing mock document and asserts the spam post is hidden there. Model it
structurally on the existing feed scenario at `tests/extension-smoke.js:40-51`
— same `context.route(...)` + `page.goto(...)` shape, same
`mockLinkedInFeed` import from `./helpers`.

The scenario must:
1. `await context.route("https://www.linkedin.com/school/**", ...)` fulfilling
   with `mockLinkedInFeed`.
2. Navigate to `https://www.linkedin.com/school/example-university/`.
3. Wait for the extension's placeholder the same way the existing feed
   scenario does (look for how it awaits `[data-ss-ph]` — copy that exact
   wait, do not invent a bare `waitForTimeout`).
4. Assert exactly one `[data-ss-ph]` placeholder exists and that
   `urn:li:activity:clean-1` is still visible.

Run it against the UNMODIFIED `manifest.json` first.

**Verify**: `npm run test:extension` → the new school scenario **FAILS**
(no placeholder appears, because the content script does not run there).
Record the failure output in your report. If it PASSES before the manifest
change, the gap does not exist as described — that is a STOP condition.

### Step 2: Add the two match patterns

In `manifest.json`, add to `content_scripts[0].matches`, keeping the
existing entries and their order, and inserting the two new ones after
`"https://www.linkedin.com/company/*"` (grouping the identity surfaces
together):

```json
        "https://www.linkedin.com/school/*",
        "https://www.linkedin.com/showcase/*",
```

**Verify**:
```
npm run smoke
node -e 'const m=require("./manifest.json");const s=m.content_scripts[0].matches;console.log(s.length);console.log(s.filter(p=>p.startsWith("https://www.linkedin.com/")).length)'
```
→ smoke exits 0; both printed numbers are `13`.

### Step 3: Confirm the permission surface did NOT widen

This is the one thing that could turn an S into a no-go: a new permission
warning on an installed base forces re-consent, and users who do not
re-consent lose the extension. Chrome derives the host warning from the
scheme+host of each match pattern, not from its path — every pattern here is
`https://www.linkedin.com`, so adding paths should change nothing. Confirm
it rather than assuming:

```
node -e 'const m=require("./manifest.json");const hosts=new Set(m.content_scripts[0].matches.map(p=>p.split("/").slice(0,3).join("/")));console.log([...hosts])'
```
**Verify**: prints exactly `[ "https://www.linkedin.com" ]` — one host, the
same one as before this change. Also confirm `m.permissions` is unchanged
(`["storage","contextMenus"]`) and that no `host_permissions` key was added:
```
node -e 'const m=require("./manifest.json");console.log(JSON.stringify(m.permissions), "host_permissions" in m)'
```
→ `["storage","contextMenus"] false`.

If either check shows a second host or a new permission key, **STOP and
report** — do not proceed to the docs step.

### Step 4: Make the e2e scenario pass, and add the showcase case

Re-run the suite with the new manifest.

**Verify**: `npm run test:extension` → exit 0; the school scenario now
passes. Then add a second, identical-shaped scenario for
`https://www.linkedin.com/showcase/**` navigating to
`https://www.linkedin.com/showcase/example-product/`, and re-run:
`npm run test:extension` → exit 0 with both new scenarios passing.

### Step 5: Sync the docs

Update the supported-pages line in all five files, inserting the two
surfaces in the same position they occupy in the manifest (after company
pages). Keep each file's existing language and its existing
no-accent/accent convention — do NOT re-accent the translations, they are
deliberately plain-ASCII in places:

- `README.md:72` — add `school pages, showcase pages` after `company pages`
- `docs/README.es.md:67` — after `paginas de empresa`
- `docs/README.fr.md:67` — after `pages entreprise`
- `docs/README.pt.md:67` — after `paginas de empresa`
- `docs/README.de.md:67` — after `Unternehmensseiten`

If a translated line's wording differs from the excerpt in "Current state",
match that file's actual wording rather than forcing the English shape.

**Verify**:
```
grep -c -i "showcase" README.md docs/README.es.md docs/README.fr.md docs/README.pt.md docs/README.de.md
```
→ every file reports at least `2` (the pre-existing whitelist line plus the
supported-pages line).

### Step 6: Full gate

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package` → all exit 0.

`test:package` matters here specifically: `scripts/package-extension.js`
ships a hardcoded file list and the packaged zip carries the manifest you
just edited — this proves the shipped artifact has the new matches.

## Test plan

- New tests, both in `tests/extension-smoke.js`, modeled on the existing
  feed scenario at lines 40-51:
  1. **school page blocks bait** — route `/school/**` to `mockLinkedInFeed`,
     assert one `[data-ss-ph]` placeholder, assert `clean-1` still visible.
     This test must be proven non-vacuous: it fails on the unmodified
     manifest (Step 1) and passes after (Step 4).
  2. **showcase page blocks bait** — same shape for `/showcase/**`.
- No unit tests: this plan changes no pure logic.
- Verification: `npm run test:extension` → exit 0, both new scenarios pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0 (64 tests)
- [ ] `npm run test:extension` exits 0, including the two new scenarios
- [ ] `npm run test:package` exits 0
- [ ] `node -e 'console.log(require("./manifest.json").content_scripts[0].matches.length)'` → `13`.
      A different number means another plan added a match pattern
      meanwhile: confirm both new patterns are present, re-check the
      single-host invariant below, and report the number rather than
      treating it as a failure.
- [ ] `node -e 'const m=require("./manifest.json");console.log([...new Set(m.content_scripts[0].matches.map(p=>p.split("/").slice(0,3).join("/")))].join(","))'` → `https://www.linkedin.com`
- [ ] `node -e 'const m=require("./manifest.json");console.log(JSON.stringify(m.permissions),"host_permissions" in m)'` → `["storage","contextMenus"] false`
- [ ] `grep -l -i showcase README.md docs/README.es.md docs/README.fr.md docs/README.pt.md docs/README.de.md | wc -l` → `5`
- [ ] Step 1 recorded the school scenario FAILING on the unmodified manifest
      (non-vacuous test evidence, quoted in your report)
- [ ] `git diff --name-only main...HEAD` lists only the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The new school scenario PASSES before the manifest change (Step 1) — the
  gap is not what this plan describes; report what you observed.
- Step 3's host check prints more than one host, or a new permission key
  appears — the change would trigger re-consent on the installed base, which
  is a product decision, not an executor decision.
- The e2e suite cannot run because Playwright's Chromium is missing — report
  it; do NOT install browsers as part of this plan without saying so.
- Any translated supported-pages line is missing or worded so differently
  that the insertion point is ambiguous.
- Blocking on a school/showcase page turns out to hide the wrong element
  (e.g. a whole page section rather than a post) — that is a container-
  heuristic finding, out of scope here. Report the observed DOM.

## Maintenance notes

- Any future match pattern must keep the single-host invariant Step 3
  checks; that check is the guard against silently widening the permission
  warning. Keep it in the done criteria of any plan that touches
  `content_scripts[].matches`.
- The whitelist/blocklist author-id vocabulary (`school:`, `showcase:`) now
  has a page where those ids can actually be created in-flow. A reviewer
  should confirm the placeholder's "Never block this author" button resolves
  a sensible id on a school page rather than `null`.
- **Deferred:** other unscanned surfaces (`/events/`, `/learning/`, bare
  `https://www.linkedin.com/`). Not planned — no evidence users hit bait
  there, and each one widens the scan surface. Unblocked by: a concrete user
  report naming the surface.
- **Deferred:** verifying the container heuristic against real school /
  showcase markup. The e2e uses the generic feed mock. Unblocked by: real
  DOM captured from a live school page (see plan 057's method for how to
  turn DOM evidence into a measurement).
