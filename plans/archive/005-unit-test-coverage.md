# Plan 005: Add unit tests for the security- and detection-relevant pure functions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js shared/pattern-data.js package.json .github/workflows/ci.yml`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition. **This plan requires
> `plans/004-shared-pattern-data.md` to have already landed** — see
> "Depends on" below.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/004-shared-pattern-data.md` (this plan extends the
  `shared/pattern-data.js` file that plan creates)
- **Category**: tests
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

This repo has exactly one automated test: `tests/extension-smoke.js`, a
Playwright end-to-end scenario that loads a single mock LinkedIn feed and
checks that one specific spam post gets hidden. That's valuable as a
smoke test, but it gives zero regression signal for the individual pure
functions that do the actual work, several of which are security- or
correctness-relevant on their own:

- `parseAuthorId` / `isLinkedInHost` — the author-whitelist boundary. A
  regression here (e.g. a hostname check that's too permissive) could let a
  spoofed URL be treated as a legitimate LinkedIn author link, or could
  break the whitelist feature entirely by never matching real LinkedIn
  URLs. Neither would be caught by the one e2e scenario, which doesn't
  exercise the whitelist path.
- `escapeRegex` / the custom-phrase regex construction inside
  `buildPatterns` — a regression here could make user-added phrases silently
  stop matching (a phrase with regex-special characters like `.` or `?`
  could start matching too broadly, or stop matching at all).
- `getExcludedSignature` / `hashString` — the "Not spam" exclusion
  mechanism. A regression here could make exclusions stop working (a
  previously-excluded post gets re-blocked) or, in the other direction,
  make unrelated posts collide onto the same signature and get incorrectly
  excluded.

None of these were testable before `plans/004-shared-pattern-data.md`
landed, because `content.js` is a single unexported IIFE with no module
boundary — `require("../content.js")` from a Node test would execute the
file's top-level side effects (`chrome.storage.sync.get(...)`,
`document.createElement(...)`, `chrome.runtime.onMessage.addListener(...)`)
immediately and throw, since `chrome`/`document` don't exist outside a
browser or extension context. This plan avoids touching that structure at
all: it extracts the specific pure functions above into the
`shared/pattern-data.js` file plan 004 already created (which has no
`chrome`/`document` dependency and already has a `module.exports` guard
mirroring `i18n.js`'s existing environment-detection style), and adds
`content.js` calls to the extracted, now-shared versions in place of its own
local copies.

## Current state

(Read `plans/004-shared-pattern-data.md`'s "Current state" and "Steps"
sections first if it hasn't landed yet in your working copy — this plan
builds directly on the file it creates.)

After plan 004, `shared/pattern-data.js` looks like:
```js
(function (root) {
  "use strict";

  const PATTERN_DATA = Object.freeze({ /* ... EN/ES/FR/PT/DE entries ... */ });

  root.SS_PATTERN_DATA = PATTERN_DATA;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PATTERN_DATA };
  }
})(typeof self !== "undefined" ? self : globalThis);
```

The functions this plan extracts, as they exist in `content.js` **before**
this plan's changes:

`content.js:435-437` — `escapeRegex`:
```js
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
```

`content.js:1010-1040` — `parseAuthorId` and `isLinkedInHost`:
```js
  function parseAuthorId(href) {
    if (!href) return null;

    const patterns = [
      { re: /^\/in\/([^/?#]+)/, prefix: "" },
      { re: /^\/company\/([^/?#]+)/, prefix: "company:" },
      { re: /^\/school\/([^/?#]+)/, prefix: "school:" },
      { re: /^\/showcase\/([^/?#]+)/, prefix: "showcase:" },
    ];

    let url;
    try {
      url = new URL(href, window.location.origin);
    } catch (_) {
      return null;
    }
    if (!isLinkedInHost(url.hostname)) return null;

    for (const pattern of patterns) {
      const match = url.pathname.match(pattern.re);
      if (match) {
        return pattern.prefix + decodeURIComponent(match[1].toLowerCase());
      }
    }

    return null;
  }

  function isLinkedInHost(hostname) {
    return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  }
```
Note `parseAuthorId` reads `window.location.origin` as the base for relative
URL resolution — `window` doesn't exist in a Node test context. This plan's
extraction changes the signature to accept the base origin as a parameter
instead (see Step 2), since the function is only ever called with
same-origin LinkedIn URLs in practice and the base is only used when `href`
is a relative path like `/in/someone`.

`content.js:1050-1062` — `getExcludedSignature` and `hashString`:
```js
  function getExcludedSignature(text) {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    return "sig:" + hashString(normalized);
  }

  function hashString(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }
```

`content.js:999-1008` — `getAuthorId`, which calls `parseAuthorId` and stays
in `content.js` (it needs live DOM access via `post.querySelectorAll`, so it
is not extracted — only the pure `parseAuthorId`/`isLinkedInHost` it
delegates to are):
```js
  function getAuthorId(post) {
    for (const selector of AUTHOR_LINK_SELECTORS) {
      for (const link of post.querySelectorAll(selector)) {
        const authorId = parseAuthorId(link.getAttribute("href"));
        if (authorId) return authorId;
      }
    }

    return null;
  }
```

`package.json`'s current `scripts` block (no `test:unit` entry yet):
```json
  "scripts": {
    "smoke": "jq empty manifest.json _locales/en/messages.json _locales/es/messages.json && node --check content.js && node --check background.js && node --check popup/popup.js && node --check options/options.js && node --check i18n.js && node --check tests/extension-smoke.js",
    "test:extension": "if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js; else xvfb-run -a node tests/extension-smoke.js; fi",
    "test:package": "npm run package && ZIP=$(node -p \"'dist/linkedin-spam-blocker-' + require('./manifest.json').version + '.zip'\") && if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js \"$ZIP\"; else xvfb-run -a node tests/extension-smoke.js \"$ZIP\"; fi",
    "package": "node scripts/package-extension.js",
    "submit:chrome": "node scripts/submit-stores.js chrome",
    "submit:firefox": "node scripts/submit-stores.js firefox"
  },
```

`.github/workflows/ci.yml`'s `Extension checks` job runs, in order: `npm
run smoke`, `npm run test:extension`, `npm run test:package`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 (update this script in Step 5 to also check the new files) |
| New unit tests | `npm run test:unit` | exit 0, all tests pass (added in Step 5 as `npm run test:unit`) |

Note: on Node ≥21 the test runner treats positional args as glob patterns,
so the script must use the glob form `node --test "tests/unit/*.test.js"`
(verified 2026-08-14 during execution — the bare directory form
`node --test tests/unit/` throws `MODULE_NOT_FOUND` on Node 24, which is
also what CI uses).
| Unpacked extension e2e | `npm run test:extension` | exit 0, "Extension smoke test passed." |
| Packaged extension e2e | `npm run test:package` | exit 0, same message |

Node's built-in test runner (`node:test` + `node:assert/strict`) requires
no new dependency — this repo already uses `node:assert/strict` in
`tests/extension-smoke.js`, so this matches its existing zero-test-framework
style.

## Scope

**In scope**:
- `shared/pattern-data.js` (add the extracted function exports)
- `content.js` (remove the now-duplicated local function bodies; call the
  shared versions instead)
- New file: `tests/unit/pattern-data.test.js`
- `package.json` (add a `test:unit` script)
- `.github/workflows/ci.yml` (add a step to run `npm run test:unit`)

**Out of scope**:
- Extracting or testing `findBySiblingHeuristic` / `findByKnownSelectors` /
  any function that needs a live DOM (`document`, `Element`,
  `NodeFilter`) — testing these would require a DOM-simulation dependency
  (e.g. jsdom) this repo doesn't currently have, and adding one is a
  larger decision than this plan's scope. Leave these untested; note it in
  "Maintenance notes" as deferred, not silently dropped.
- `buildPatterns`'s custom-phrase branch (the `p.mode === "contains"` /
  exact-match `\b`-anchoring logic) — this one is genuinely useful to test
  and doesn't need a DOM, but it currently lives inside `content.js` next to
  `CONFIG.MAX_PHRASE_LENGTH` and isn't purely a function of its arguments in
  the exported sense (it reads the module-level `CONFIG` constant). Testing
  it well requires either passing `CONFIG.MAX_PHRASE_LENGTH` as a parameter
  or extracting `CONFIG` too, which expands scope. Leave it out of this
  plan; note it in "Maintenance notes" as a natural next step once
  `CONFIG` is also touched by some other refactor.
- `scripts/package-extension.js`'s `files` array — the new
  `tests/unit/pattern-data.test.js` file must **not** be added there (test
  files are explicitly excluded from the shipped zip per
  `RELEASE_CHECKLIST.md`'s packaging checklist, which lists `tests/` as an
  excluded path).

## Git workflow

- Branch: `advisor/005-unit-test-coverage`
- Commit message style: `test(detection): add unit tests for author-ID
  parsing, phrase regex escaping, and exclusion hashing`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend `shared/pattern-data.js` with the extracted functions

Add the following functions inside the existing IIFE in
`shared/pattern-data.js` (from `plans/004-shared-pattern-data.md`), after
the `PATTERN_DATA` constant and before the `root.SS_PATTERN_DATA = ...`
assignment:

```js
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isLinkedInHost(hostname) {
    return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  }

  /* baseOrigin defaults to a real LinkedIn origin so relative hrefs like
     "/in/someone" resolve correctly even when window.location isn't
     available (e.g. under Node in a unit test). Callers running inside the
     actual content script should pass window.location.origin explicitly to
     preserve the original behavior exactly. */
  function parseAuthorId(href, baseOrigin) {
    if (!href) return null;

    const patterns = [
      { re: /^\/in\/([^/?#]+)/, prefix: "" },
      { re: /^\/company\/([^/?#]+)/, prefix: "company:" },
      { re: /^\/school\/([^/?#]+)/, prefix: "school:" },
      { re: /^\/showcase\/([^/?#]+)/, prefix: "showcase:" },
    ];

    let url;
    try {
      url = new URL(href, baseOrigin || "https://www.linkedin.com");
    } catch (_) {
      return null;
    }
    if (!isLinkedInHost(url.hostname)) return null;

    for (const pattern of patterns) {
      const match = url.pathname.match(pattern.re);
      if (match) {
        return pattern.prefix + decodeURIComponent(match[1].toLowerCase());
      }
    }

    return null;
  }

  function hashString(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function getExcludedSignature(text) {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    return "sig:" + hashString(normalized);
  }
```

Then update the exports at the bottom of the file:

```js
  root.SS_PATTERN_DATA = PATTERN_DATA;
  root.SS_escapeRegex = escapeRegex;
  root.SS_isLinkedInHost = isLinkedInHost;
  root.SS_parseAuthorId = parseAuthorId;
  root.SS_hashString = hashString;
  root.SS_getExcludedSignature = getExcludedSignature;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PATTERN_DATA,
      escapeRegex,
      isLinkedInHost,
      parseAuthorId,
      hashString,
      getExcludedSignature,
    };
  }
```

**Verify**: `node --check shared/pattern-data.js` → exit 0.

### Step 2: Remove the now-duplicated local copies from `content.js`, call the shared versions

Delete the local `escapeRegex`, `isLinkedInHost`, `parseAuthorId`,
`hashString`, and `getExcludedSignature` function declarations from
`content.js` (their locations are shown in "Current state" above — line
numbers assume plan 004 already landed and only removed `BASE_PATTERNS`,
so these should be otherwise unchanged from the excerpts shown; re-locate by
function name if line numbers drifted).

Every call site inside `content.js` keeps the exact same call shape except
`parseAuthorId`, which now needs the base origin passed explicitly. There is
exactly one call site — inside `getAuthorId()`:

Before:
```js
        const authorId = parseAuthorId(link.getAttribute("href"));
```
After:
```js
        const authorId = SS_parseAuthorId(link.getAttribute("href"), window.location.origin);
```

All other call sites (`escapeRegex(...)` inside `buildPatterns` and the
`isCustom` check in `blockPost`; `isLinkedInHost(...)` inside the old
`parseAuthorId` — now removed entirely since it moved; `getExcludedSignature(...)`
/`hashString(...)` in `isSpam`, `normalizeExcludedEntries`, and the
`notSpamBtn` click handler) just get the `SS_` prefix added to the function
name, with the same arguments as before:

```js
SS_escapeRegex(text)
SS_getExcludedSignature(text)
SS_hashString(value)   // only if hashString is called directly anywhere outside getExcludedSignature — check with grep first; if it's only ever called from inside getExcludedSignature, you don't need to touch its call sites in content.js at all since that whole function moved
```

Use `grep -n "escapeRegex\|isLinkedInHost\|parseAuthorId\|hashString\|getExcludedSignature" content.js` before and after this step to find every call site and confirm none were missed.

**Verify**: `node --check content.js` → exit 0, and
`grep -n "^  function escapeRegex\|^  function isLinkedInHost\|^  function parseAuthorId\|^  function hashString\|^  function getExcludedSignature" content.js`
returns no matches (confirms the local definitions were removed, not just
shadowed).

### Step 3: Add the new script tag so `content.js` can see the shared globals

Confirm `manifest.json`'s `content_scripts[0].js` already lists
`shared/pattern-data.js` before `content.js` (added by plan 004 — if it's
missing, that plan hasn't actually landed; treat as a STOP condition per
the "Depends on" note at the top of this plan).

**Verify**: `grep -A3 '"content_scripts"' manifest.json` shows
`"shared/pattern-data.js"` listed before `"content.js"`.

### Step 4: Write the unit tests

Create `tests/unit/pattern-data.test.js`:

```js
#!/usr/bin/env node

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  escapeRegex,
  isLinkedInHost,
  parseAuthorId,
  hashString,
  getExcludedSignature,
} = require(path.join(__dirname, "..", "..", "shared", "pattern-data.js"));

test("escapeRegex escapes every regex-special character", () => {
  assert.equal(escapeRegex("a.b*c?d"), "a\\.b\\*c\\?d");
  assert.equal(escapeRegex("[hello]"), "\\[hello\\]");
  assert.equal(escapeRegex("plain text"), "plain text");
});

test("isLinkedInHost accepts the apex domain and subdomains", () => {
  assert.equal(isLinkedInHost("linkedin.com"), true);
  assert.equal(isLinkedInHost("www.linkedin.com"), true);
  assert.equal(isLinkedInHost("mobile.linkedin.com"), true);
});

test("isLinkedInHost rejects lookalike and unrelated hosts", () => {
  assert.equal(isLinkedInHost("linkedin.com.evil.com"), false);
  assert.equal(isLinkedInHost("notlinkedin.com"), false);
  assert.equal(isLinkedInHost("evil-linkedin.com"), false);
  assert.equal(isLinkedInHost("example.com"), false);
});

test("parseAuthorId extracts profile IDs from /in/ links", () => {
  assert.equal(parseAuthorId("/in/jane-doe/"), "jane-doe");
  assert.equal(parseAuthorId("https://www.linkedin.com/in/JaneDoe"), "janedoe");
});

test("parseAuthorId prefixes company/school/showcase IDs", () => {
  assert.equal(parseAuthorId("/company/acme-corp/"), "company:acme-corp");
  assert.equal(parseAuthorId("/school/example-university/"), "school:example-university");
  assert.equal(parseAuthorId("/showcase/acme-showcase/"), "showcase:acme-showcase");
});

test("parseAuthorId returns null for non-LinkedIn hosts, even with a matching path shape", () => {
  assert.equal(parseAuthorId("https://linkedin.com.evil.com/in/jane-doe"), null);
  assert.equal(parseAuthorId("https://evil.com/in/jane-doe"), null);
});

test("parseAuthorId returns null for unrecognized paths or missing href", () => {
  assert.equal(parseAuthorId(null), null);
  assert.equal(parseAuthorId(""), null);
  assert.equal(parseAuthorId("/feed/"), null);
});

test("hashString is deterministic for the same input", () => {
  assert.equal(hashString("hello world"), hashString("hello world"));
});

test("hashString produces different output for different input (no trivial collisions on close inputs)", () => {
  assert.notEqual(hashString("hello world"), hashString("hello worlds"));
  assert.notEqual(hashString("abc"), hashString("acb"));
});

test("getExcludedSignature normalizes case and whitespace before hashing", () => {
  const a = getExcludedSignature("Comment CLAUDE and I'll send it");
  const b = getExcludedSignature("comment   claude   and i'll send it");
  assert.equal(a, b);
});

test("getExcludedSignature is prefixed with sig: and differs for different text", () => {
  const sig = getExcludedSignature("some post text");
  assert.match(sig, /^sig:/);
  assert.notEqual(sig, getExcludedSignature("different post text"));
});
```

**Verify**: `node --test tests/unit/pattern-data.test.js` → exit 0, all
tests reported as passing (Node's test runner prints a summary with `pass`
and `fail` counts — confirm `fail 0`).

### Step 5: Wire the new tests into `npm run smoke` and CI

In `package.json`, add a `test:unit` script and include the new files in
the existing `smoke` syntax check:

```json
  "scripts": {
    "smoke": "jq empty manifest.json _locales/en/messages.json _locales/es/messages.json && node --check content.js && node --check background.js && node --check popup/popup.js && node --check options/options.js && node --check i18n.js && node --check shared/pattern-data.js && node --check tests/extension-smoke.js && node --check tests/unit/pattern-data.test.js",
    "test:unit": "node --test tests/unit/",
    "test:extension": "if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js; else xvfb-run -a node tests/extension-smoke.js; fi",
    "test:package": "npm run package && ZIP=$(node -p \"'dist/linkedin-spam-blocker-' + require('./manifest.json').version + '.zip'\") && if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js \"$ZIP\"; else xvfb-run -a node tests/extension-smoke.js \"$ZIP\"; fi",
    "package": "node scripts/package-extension.js",
    "submit:chrome": "node scripts/submit-stores.js chrome",
    "submit:firefox": "node scripts/submit-stores.js firefox"
  },
```

In `.github/workflows/ci.yml`, add a `Run unit tests` step to the
`extension` job, right after the existing `Run smoke checks` step and
before `Test unpacked extension` (unit tests are faster and don't need
Playwright, so running them first gives quicker failure feedback):

```yaml
      - name: Run smoke checks
        run: npm run smoke

      - name: Run unit tests
        run: npm run test:unit

      - name: Test unpacked extension
        run: npm run test:extension
```

**Verify**: `npm run smoke` → exit 0. `npm run test:unit` → exit 0 (uses
the glob form per the command-table note above). Confirm
`.github/workflows/ci.yml` is still valid YAML: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" 2>/dev/null || node -e "require('js-yaml')" 2>/dev/null; echo "if neither yaml module is available, visually confirm indentation matches the surrounding steps exactly (2-space, list items under 'steps:')"`.

## Test plan

This plan's "test plan" *is* its main deliverable (Step 4). To confirm the
new tests actually catch what they claim to:

1. Temporarily break `isLinkedInHost` (e.g. change `.endsWith(".linkedin.com")`
   to `.includes("linkedin.com")`) and confirm
   `node --test tests/unit/pattern-data.test.js` fails on the
   "rejects lookalike and unrelated hosts" test — this is the exact
   regression class (hostname-suffix bypass) the test exists to catch.
   Revert the change afterward.
2. Run the full existing suite to confirm nothing else broke:
   `npm run smoke && npm run test:unit && npm run test:extension && npm run test:package`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:unit` exits 0, with at least the 11 tests listed in Step 4 passing
- [ ] `npm run test:extension` exits 0 (regression check — unaffected by this plan's changes)
- [ ] `npm run test:package` exits 0
- [ ] `grep -n "^  function escapeRegex\|^  function parseAuthorId\|^  function isLinkedInHost\|^  function hashString\|^  function getExcludedSignature" content.js`
      returns no matches (confirms extraction, not duplication)
- [ ] `grep -n "SS_parseAuthorId\|SS_escapeRegex\|SS_getExcludedSignature" content.js`
      shows the shared versions being called
- [ ] `.github/workflows/ci.yml` contains a `Run unit tests` step
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `plans/004-shared-pattern-data.md` has not landed (check for
  `shared/pattern-data.js`'s existence and its `PATTERN_DATA` export before
  starting) — do not attempt to recreate its work inline in this plan.
- The code at the locations in "Current state" doesn't match the excerpts
  (drift since this plan was written, beyond what plan 004 accounts for).
- Any of the 11 tests in Step 4 fails against the extracted functions
  without you having changed their logic — that means the extraction
  introduced a behavior change (most likely candidate:
  `parseAuthorId`'s new `baseOrigin` parameter defaulting incorrectly).
  Do not adjust the test to match broken behavior; fix the extraction.
- `npm run test:extension` or `npm run test:package` fails after Step 2 —
  this means a call site in `content.js` was missed or given the wrong
  arguments when switching to the `SS_`-prefixed shared functions.

## Maintenance notes

- `findBySiblingHeuristic`, `findByKnownSelectors`, and `buildPatterns`'s
  custom-phrase branch remain untested — see "Out of scope" for why. If a
  future plan adds a DOM-testing dependency (jsdom or similar) for other
  reasons, revisit testing the container-detection heuristic then, since
  it's the part of the codebase most directly responsible for "did we hide
  the right post."
- Any new pure, `chrome`/`document`-independent helper added to `content.js`
  in the future is a good candidate to add directly to
  `shared/pattern-data.js` instead, so it's testable from the start rather
  than needing a later extraction like this plan performed.
- `plans/013-show-cooldown.md` depends on this plan: it adds
  `tests/unit/cooldown-store.test.js` alongside this plan's
  `tests/unit/pattern-data.test.js` and reuses the `test:unit` script and
  CI step this plan creates. If 013 runs first (it shouldn't — it hard-
  depends on this plan), its STOP conditions trigger; the queue in
  `plans/README.md` documents the order.
- A reviewer should scrutinize: that `parseAuthorId`'s behavior is
  identical whether called with an explicit `baseOrigin` (as `content.js`
  now does) or without one (as the unit tests do, relying on the
  `"https://www.linkedin.com"` default) — the STOP condition above already
  covers verifying this via the test suite, but it's worth a manual look at
  the diff too.
