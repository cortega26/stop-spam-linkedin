# Plan 056: Add allow-phrases — "never hide a post containing this text"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- content.js options/options.js options/options.html shared/constants.js shared/pattern-data.js types/globals.d.ts _locales tests/unit/pattern-data.test.js tests/extension-interactions.js eslint.config.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (adds a short-circuit at the top of the detection path and a new synced user-data key; both have established repo contracts this plan must satisfy)
- **Depends on**: none
- **Category**: direction (build — shape decided below, do not re-derive)
- **Planned at**: commit `4f80330`, 2026-09-13 (branch `advisor/b1-stopspam-lock`, 3 commits ahead of `main`); corrected same day — export uses `root.SS_*` and the global is registered in `eslint.config.js`

## Why this matters

There are two ways to say "stop hiding this" today and neither covers the
false-positive class the README itself names. `ss_excluded` pardons **one
exact post text** (a hash of it), so a person who writes about engagement
bait — quoting "comment CLAUDE and I'll send you the framework" to criticize
it — must pardon every new post, one at a time, forever. The whitelist
pardons **an author**, which is far too blunt: it also stops blocking that
author's real bait. `README.md:78` states the gap plainly: "False positives
are possible, especially around posts that quote spam examples or discuss
spam behavior."

An allow-phrase is the missing third lever: text the user names once
("engagement bait", "growth hacking is broken"), after which no post
containing it is ever hidden. It is small, purely local, reuses the existing
pattern machinery, and turns a recurring annoyance into a one-time setting.

## Decisions already made — implement these, do not re-derive

**Decision 1 — allow-phrases beat everything, including custom phrases.**
The check goes at the top of `findMatch`, immediately after the existing
exclusion check and before the pattern loop. Rationale: `ss_excluded`
already beats custom phrases (same position in the same function), so this
is the established precedent, and an allow-list that lost to custom phrases
would fail at exactly its purpose — the user's own broad phrase is usually
what causes the false positive.

The cost of Decision 1 is a confusing state: "I added a custom phrase and it
does not block." This plan neutralizes it with a **hard conflict guard**
(Step 5): adding an allow-phrase whose trimmed text case-insensitively
equals an existing custom phrase is refused with a warning toast, and the
same refusal applies in the other direction. Overlapping-but-not-equal text
(allow "engagement bait" vs. custom "bait") is allowed and the allow-phrase
wins — that is the intended semantics, and it is the required test case in
the test plan. This mirrors plan 010's Decision 2, where getting the
`[custom, builtin]` ordering wrong silently flipped behavior: order in this
detection path is semantic, not cosmetic.

**Decision 2 — allow-phrases are always case-insensitive substring
matches.** No exact/contains toggle, unlike custom phrases. An exact-mode
allow entry would silently fail to protect the post the user was looking at
(post text is a paragraph, the phrase is a fragment), and the forgiving
direction is the safe one for a pardon.

**Decision 3 — storage shape.** New `chrome.storage.sync` key
`ss_allow_phrases`, holding `Array<{ id: string, text: string, created:
number }>`. No `enabled` flag and no `mode` field: removing the row is the
off switch. Cap at a new `LIMITS.MAX_ALLOW_PHRASES = 100`, reusing the
existing `LIMITS.MAX_PHRASE_LENGTH` (120) per entry.

**Decision 4 — the matcher is a shared pure function** so unit tests and
(later) plan 051's match tester can reuse it:
`SS_buildAllowMatcher(allowPhrases, maxPhraseLength)` in
`shared/pattern-data.js`, returning `Array<{ regex: RegExp, text: string }>`
— an array rather than a boolean predicate, so a caller can report *which*
allow-phrase pardoned a post.

## Current state

The facts the executor needs, inlined.

- **The detection short-circuit point** (`content.js:517-527`) — the
  exclusion check this plan sits next to:
  ```js
  /* Returns the matched pattern entry ({ regex, label, source }) or null.
     Because SS_buildPatterns orders custom phrases first, a text covered by
     both a custom phrase and a built-in pattern attributes to the custom
     phrase. */
  function findMatch(text) {
    if (excludedSignatures.has(SS_getExcludedSignature(text))) return null;
    for (const entry of spamPatterns) {
      if (entry.regex.test(text)) return entry;
    }
    return null;
  }
  ```
- **The regex-compilation convention to copy** (`shared/pattern-data.js:131-137`,
  inside `buildPatterns`) — note `escapeRegex` and the `"i"` flag:
  ```js
      .map((p) => {
        const text = p.text.trim();
        const escaped = escapeRegex(text);
        if (p.mode === "contains") {
          return { regex: new RegExp(escaped, "i"), label: text, source: "custom" };
        }
  ```
- **Storage keys are defined once** (`shared/constants.js:12-25`), frozen,
  `ss_`-prefixed, and destructured by all four runtime files
  (`content.js:4`, `popup/popup.js:4`, `options/options.js:4`,
  `background.js:7`).
- **Limits live beside them** (`shared/constants.js:39-50`):
  `MAX_CUSTOM_PHRASES: 200`, `MAX_PHRASE_LENGTH: 120`, `MAX_WHITELIST: 100`,
  `MAX_BLOCKED_AUTHORS: 100`, …
- **Content-script live-update wiring** — `content.js:258-271` rebuilds
  `spamPatterns` on every relevant `storage.onChanged` key:
  ```js
      if (changes[PHRASES_STORAGE_KEY]) {
        userPhrases = changes[PHRASES_STORAGE_KEY].newValue || [];
        spamPatterns = SS_buildPatterns(changes[PHRASES_STORAGE_KEY].newValue, enabledLangs, disabledPatterns, LIMITS.MAX_PHRASE_LENGTH);
      }
  ```
  and the initial read is `content.js:207`.
- **The un-hide-on-change exemplar** (`content.js:1038-1043`) — copy this
  shape, including the `labelBlockedPosts` guard:
  ```js
  function restoreAuthorPosts(authorId) {
    for (const post of blockedPosts) {
      if (labelBlockedPosts.has(post)) continue;
      if (getAuthorId(post) === authorId) restorePost(post);
    }
  }
  ```
  `labelBlockedPosts` holds posts hidden by the Promoted/Featured toggles;
  a text-based pardon must never un-hide those.
- **The options-page list UI exemplar** (`options/options.js:1134-1181`,
  `renderWhitelist`): a `.lang-section` wrapper hidden when empty, rows of
  `.whitelist-row` with a `.wl-id` label and a confirm-click Remove button
  that flips to `SS_t("clickToConfirm")` for 3000 ms. Its markup anchor is
  `options/options.html:539-542`:
  ```html
    <div class="lang-section" id="whitelistSection" style="display:none">
      <div class="lang-section-title">__MSG_whitelistTitle__</div>
      <div class="whitelist-list" id="whitelistList"></div>
    </div>
  ```
- **The add-input exemplar with all its guards** (`options/options.js:249-289`,
  `handleAdd`): trim → length check → duplicate check → count cap → byte
  quota pre-check against `Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95)`
  using `SS_estimatePhraseBytes` → write → toast.
- **The export payload** (`options/options.js:503-514`) — every user key
  round-trips through it:
  ```js
      const payload = {
        version: 1,
        exportedAt: Date.now(),
        phrases: phrases,
        whitelist: whitelist,
        excluded: excluded,
        langs: enabledLangs,
        blockedAuthors: blockedAuthors,
        disabledPatterns: disabledPatterns,
        hidePromoted: hidePromoted,
        hideFeatured: hideFeatured,
      };
  ```
  The matching import merge lives at `options/options.js:704-800` — additive,
  never replacing, with a per-category byte-budget eviction loop and a
  `chrome.runtime.lastError` revert. `imported.allowPhrases` must be merged
  the same way.
- **i18n contract** (`AGENTS.md`): user-facing strings use `SS_t("key")` in
  JS and `__MSG_key__` in HTML; every new key goes in BOTH
  `_locales/en/messages.json` and `_locales/es/messages.json` (136 keys each
  today). Shape:
  ```json
  "phraseLimitToast": { "message": "Custom phrase limit reached ($1)." }
  ```
- **Every `chrome.storage.*.set()` call site carries a `lastError` guard**
  (plan 031 audited all 40). Example, `options/options.js:309-313`:
  ```js
    chrome.storage.sync.set({ [STORAGE_KEYS.DISABLED_PATTERNS]: disabledPatterns }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save disabled patterns (sync.set):", chrome.runtime.lastError.message);
      }
    });
  ```
- **Every new `SS_*` global needs a declaration** in `types/globals.d.ts`
  (script-context `declare function`, not `declare global`), or
  `npm run typecheck` fails — AND an entry in `eslint.config.js`'s browser
  globals block (lines 30-55, e.g. `SS_buildPatterns: "readonly",` at line
  31), or `npm run lint` fails with `no-undef`.
- **`shared/pattern-data.js` assigns its globals on `root`**, not `global`:
  the export block is lines 513-534 (`root.SS_buildPatterns = buildPatterns;`
  at 518), followed by `module.exports = {` at 536.
- **`shared/pattern-data.js` is a UMD module**: it assigns globals AND
  `module.exports` for the Node unit tests. Unit tests live in
  `tests/unit/pattern-data.test.js` (Node's built-in runner, `node:test` +
  `node:assert/strict`).

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
`4f80330`, all exit 0 (unit: 64/64). Browser suites need Playwright's
Chromium (`npx playwright install --with-deps chromium`), which the advisor
may not install — hence `declared`.

## Scope

**In scope**:
- `shared/constants.js` — `STORAGE_KEYS.ALLOW_PHRASES`, `LIMITS.MAX_ALLOW_PHRASES`
- `shared/pattern-data.js` — `buildAllowMatcher` (+ global + `module.exports`)
- `types/globals.d.ts` — declarations for the new global and the new
  `SS_CONSTANTS.LIMITS` field
- `eslint.config.js` — register `SS_buildAllowMatcher` in the browser
  globals block
- `content.js` — state, initial read, `onChanged` branch, `findMatch`
  short-circuit, `restoreAllowedPosts`
- `options/options.html`, `options/options.js` — the allow-phrase section
  (add input + list + remove), export/import wiring
- `_locales/en/messages.json`, `_locales/es/messages.json` — new keys
- `tests/unit/pattern-data.test.js` — matcher unit tests
- `tests/extension-interactions.js` — e2e scenarios
- `plans/README.md` — your status row

**Out of scope** (do NOT touch):
- `background.js` — the service worker deliberately keeps its own
  `t`/`uid`/`estimatePhraseBytes` copies (AGENTS.md: "do not consolidate
  them without a dedicated plan"). The context menu adds *block* phrases
  only; no allow-phrase context menu in this plan.
- `popup/popup.js` — no popup surface for allow-phrases.
- The author-blocklist, Promoted, and Featured hide paths
  (`scanForBlockedAuthors`, `scanForLabeledPosts`, `scanForFeaturedSection`).
  Those are explicit non-text user choices; an allow-phrase must NOT pardon
  them.
- `ss_excluded` and the whitelist — untouched; allow-phrases are a third,
  independent lever.
- `scripts/package-extension.js` — only needed if you add a NEW FILE. This
  plan adds none. If you find yourself wanting one, that is a STOP condition.

## Git workflow

- Branch: `advisor/056-allow-phrases`
- Commit per logical unit (shared plumbing / content script / options UI /
  tests). Conventional-ish messages, e.g.
  `feat(allow-phrases): never hide posts containing user-named text`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run every command in the table on the unmodified checkout.

- All pass → record and proceed.
- A `declared` command missing or failing on an unmodified checkout → broken
  baseline, **STOP and report** with exact output. Do not "fix" it.
- An `executed` command failing → drift. STOP.

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 64 tests.

### Step 1: Add the constants

In `shared/constants.js`, add to the frozen `STORAGE_KEYS` object:
`ALLOW_PHRASES: "ss_allow_phrases",` (place it after `EXCLUDED` — grouping
the pardon mechanisms), and to `LIMITS`: `MAX_ALLOW_PHRASES: 100,` with a
short comment in the file's existing comment style explaining it mirrors
`MAX_WHITELIST`. Extend the `SSLimits` typedef above `LIMITS` with
`@property {number} MAX_ALLOW_PHRASES`.

**Verify**:
```
npm run smoke && node -e 'const c=require("./shared/constants.js");console.log(c.STORAGE_KEYS.ALLOW_PHRASES, c.LIMITS.MAX_ALLOW_PHRASES)'
```
→ exit 0, prints `ss_allow_phrases 100`.

### Step 2: Add `buildAllowMatcher` to the shared module

In `shared/pattern-data.js`, add:

```js
  /**
   * Compiles allow-phrases ("never hide a post containing this text") into
   * case-insensitive substring matchers. Allow-phrases have no exact mode
   * by design: a pardon should be forgiving (plan 056 Decision 2).
   * @param {Array<{text: string}>} allowPhrases
   * @param {number} maxPhraseLength Phrase length cap (LIMITS.MAX_PHRASE_LENGTH).
   * @returns {Array<{regex: RegExp, text: string}>}
   */
  function buildAllowMatcher(allowPhrases, maxPhraseLength) {
    return (allowPhrases || [])
      .filter((p) => (
        p &&
        typeof p.text === "string" &&
        p.text.trim().length > 0 &&
        p.text.trim().length <= maxPhraseLength
      ))
      .map((p) => {
        const text = p.text.trim();
        return { regex: new RegExp(escapeRegex(text), "i"), text };
      });
  }
```

Wire it exactly like the module's existing exports. The file assigns
globals on `root`, NOT `global` — the export block is
`shared/pattern-data.js:513-534` (e.g. `root.SS_buildPatterns = buildPatterns;`
at line 518). Add `root.SS_buildAllowMatcher = buildAllowMatcher;` directly
after that line, and add `buildAllowMatcher` to the `module.exports` object
that follows (line 536). Read the existing export block first and match it —
do not invent a second export style.

Register the global with ESLint, or `npm run lint` fails with `no-undef` in
`content.js` and `options/options.js`: in `eslint.config.js`, add
`SS_buildAllowMatcher: "readonly",` to the browser globals block (lines
30-55), directly after `SS_buildPatterns: "readonly",` (line 31).

Then declare it in `types/globals.d.ts` next to `SS_buildPatterns`:
```ts
declare function SS_buildAllowMatcher(
  allowPhrases: Array<{ text: string }>,
  maxPhraseLength: number,
): Array<{ regex: RegExp; text: string }>;
```
and add `MAX_ALLOW_PHRASES: number;` to the `SS_CONSTANTS.LIMITS` shape in
the same file.

**Verify**:
```
npm run smoke && npm run typecheck && node -e 'const m=require("./shared/pattern-data.js");const r=m.buildAllowMatcher([{text:"engagement bait"}],120);console.log(r.length, r[0].regex.test("A post about ENGAGEMENT BAIT here"), r[0].regex.test("unrelated"))'
```
→ exit 0, prints `1 true false`.

### Step 3: Unit-test the matcher

Add tests to `tests/unit/pattern-data.test.js`, following that file's
existing `test("...", () => { ... })` + `node:assert/strict` style. Cover:
1. case-insensitive substring match
2. regex metacharacters in the phrase are escaped (a phrase `c++ (free)`
   matches the literal text and does not throw)
3. entries over `maxPhraseLength`, empty/whitespace-only, and non-string
   `text` are dropped
4. an empty/`undefined` input returns `[]`

**Verify**: `npm run test:unit` → exit 0; total count is now 64 + (number of
tests you added). Report both numbers.

### Step 4: Wire the content script

In `content.js`:

1. State, beside the other user-data state (near `let userPhrases = [];`):
   ```js
   /* Compiled allow-phrases — text the user never wants hidden. */
   let allowMatchers = [];
   ```
2. Add `STORAGE_KEYS.ALLOW_PHRASES` to the initial `chrome.storage.sync.get`
   key array (the same array read at `content.js:161`/`:207` — read the live
   code and add the key in both the request list and the result handling),
   and set `allowMatchers = SS_buildAllowMatcher(syncResult[STORAGE_KEYS.ALLOW_PHRASES] || [], LIMITS.MAX_PHRASE_LENGTH);`
3. In the `area === "sync"` branch of `storage.onChanged`, add:
   ```js
      if (changes[STORAGE_KEYS.ALLOW_PHRASES]) {
        allowMatchers = SS_buildAllowMatcher(changes[STORAGE_KEYS.ALLOW_PHRASES].newValue || [], LIMITS.MAX_PHRASE_LENGTH);
        restoreAllowedPosts();
      }
   ```
4. The short-circuit in `findMatch`, immediately after the exclusion line:
   ```js
     function findMatch(text) {
       if (excludedSignatures.has(SS_getExcludedSignature(text))) return null;
       for (const allow of allowMatchers) {
         if (allow.regex.test(text)) return null;
       }
       for (const entry of spamPatterns) {
   ```
   Update the comment block above `findMatch` to state that allow-phrases
   short-circuit before any pattern (Decision 1).
5. `restoreAllowedPosts`, placed next to `restoreAuthorPosts` and modeled on
   it verbatim:
   ```js
   /* Un-hide posts an allow-phrase now pardons. Mirrors
      restoreAuthorPosts, including the labelBlockedPosts guard: posts
      hidden by the Promoted/Featured toggles are not text-blocked and
      must never be un-hidden by a text pardon. */
   function restoreAllowedPosts() {
     if (allowMatchers.length === 0) return;
     for (const post of blockedPosts) {
       if (labelBlockedPosts.has(post)) continue;
       const text = post.textContent || "";
       for (const allow of allowMatchers) {
         if (allow.regex.test(text)) {
           restorePost(post);
           break;
         }
       }
     }
   }
   ```

**Verify**: `npm run smoke && npm run lint && npm run typecheck` → all exit 0.

### Step 5: Options UI — section, add input, conflict guard, remove

**HTML** (`options/options.html`): add a section modeled on
`whitelistSection` (lines 539-542) — note section headings are
`<div class="lang-section-title">`, NOT `<h2>`, placed immediately after
`excludedSection` (lines 552-557) so the three pardon mechanisms sit
together:
```html
  <div class="lang-section" id="allowSection">
    <div class="lang-section-title">__MSG_allowTitle__</div>
    <div class="import-hint">__MSG_allowHint__</div>
    <div class="add-row">
      <input type="text" id="allowInput" placeholder="__MSG_allowPlaceholder__" autocomplete="off" aria-label="__MSG_allowInputLabel__" />
      <button class="add-btn" id="allowAddBtn" aria-label="__MSG_allowAddLabel__" title="__MSG_allowAddLabel__">__MSG_addButton__</button>
    </div>
    <div class="whitelist-list" id="allowList"></div>
  </div>
```
Reuse existing class names only — do NOT add new CSS rules unless a class
you reference does not exist; if one does not, reuse the nearest existing
class rather than inventing a style. (`addButton` is an existing key; reuse
it.)

**JS** (`options/options.js`):
- state `let allowPhrases = [];` and `let pendingAllowRemove = null;`
- DOM refs beside the others
- read `STORAGE_KEYS.ALLOW_PHRASES` in `load()` and add an `onChanged`
  branch that re-renders (follow the `locallyWrittenKeys` discipline used
  for `DISABLED_PATTERNS` at `options/options.js:167-172`)
- `handleAllowAdd()` modeled on `handleAdd` (lines 249-289) with these
  guards, in this order:
  1. trim; empty → return
  2. `text.length > LIMITS.MAX_PHRASE_LENGTH` → `showToast(SS_t("phraseTooLongToast", LIMITS.MAX_PHRASE_LENGTH), true)`
  3. duplicate allow-phrase (case-insensitive) → `showToast(SS_t("duplicatePhraseToast", text), true)`
  4. **conflict guard (Decision 1)**: if any existing custom phrase's text
     case-insensitively equals this text →
     `showToast(SS_t("allowConflictToast", text), true)` and return without
     writing
  5. `allowPhrases.length >= LIMITS.MAX_ALLOW_PHRASES` →
     `showToast(SS_t("allowLimitToast", LIMITS.MAX_ALLOW_PHRASES), true)`
  6. byte-quota pre-check on the candidate array, as `handleAdd` does it —
     but note the shape difference: `SS_estimatePhraseBytes`'s JSDoc types
     its first parameter as `Array<{text: string, enabled?: boolean, mode?:
     string}>`, and allow-phrase entries are `{id, text, created}`. The
     computation is correct either way (it just stringifies), but
     `npm run typecheck` runs `checkJs` against that annotation. If tsc
     complains, widen the JSDoc param in `shared/pattern-data.js` to
     `Array<{text: string}>` (a widening, not a behavior change) rather
     than casting at the call site — and re-run `npm run typecheck`. If it
     does not complain, change nothing:
     ```js
     const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
     if (SS_estimatePhraseBytes(candidate, STORAGE_KEYS.ALLOW_PHRASES) > limit) {
       showToast(SS_t("phraseStorageFullToast"), true);
       return;
     }
     ```
  7. write with a `chrome.runtime.lastError` guard, then
     `showToast(SS_t("allowAddedToast", text))`
- the **reverse conflict guard**: in the existing `handleAdd` (custom
  phrases), after its duplicate check, refuse a custom phrase whose text
  case-insensitively equals an existing allow-phrase, with
  `showToast(SS_t("allowConflictToast", text), true)`
- `renderAllowPhrases()` modeled on `renderWhitelist` (confirm-click remove,
  3000 ms revert, `lastError`-guarded write), plus an empty-state line — but
  unlike `renderWhitelist`, the section stays VISIBLE when empty, because it
  holds the add input
- call `renderAllowPhrases()` from `render()` beside `renderExcluded()`

**Verify**: `npm run smoke && npm run lint && npm run typecheck` → exit 0.

### Step 6: Locale keys (BOTH files)

Add to `_locales/en/messages.json` and `_locales/es/messages.json` — same
keys, same `$1` placeholders, matching each file's existing tone:

| key | EN message |
|-----|------------|
| `allowTitle` | `Never-hide Phrases` |
| `allowHint` | `Posts containing this text are never hidden — even if a pattern or custom phrase matches.` |
| `allowPlaceholder` | `e.g. engagement bait` |
| `allowInputLabel` | `Add a never-hide phrase` |
| `allowAddLabel` | `Add never-hide phrase` |
| `allowAddedToast` | `Never hiding posts with: "$1"` |
| `allowLimitToast` | `Never-hide phrase limit reached ($1).` |
| `allowConflictToast` | `"$1" is already a custom phrase — remove it there first.` |
| `allowEmpty` | `No never-hide phrases yet.` |
| `removeAllowPhraseLabel` | `Remove never-hide phrase $1` |

Write natural Spanish for `es` (this repo's ES strings are human-quality,
e.g. `"Se alcanzó el límite de frases personalizadas ($1)."` — match that
register; do not machine-translate word-for-word).

**Verify**:
```
npm run smoke
python3 -c "
import json
en=json.load(open('_locales/en/messages.json')); es=json.load(open('_locales/es/messages.json'))
print(len(en), len(es), sorted(set(en)^set(es)))"
```
→ smoke exit 0; the two counts are EQUAL and the symmetric difference is
`[]`. The absolute number is `146` if this plan lands alone, `153` if plan
058 (first-run onboarding, +7 keys) landed first — assert equality and the
empty difference, not the absolute number.

### Step 7: Export / import round-trip

- `handleExport`: add `allowPhrases: allowPhrases,` to the payload object
  (`options/options.js:503-514`) and include allow-phrases in
  `hasExportableData()`.
- `handleImport`, versioned branch (`options/options.js:704+`): merge
  `imported.allowPhrases` additively with the same discipline as the
  whitelist merge — dedupe case-insensitively, respect
  `LIMITS.MAX_ALLOW_PHRASES`, apply the byte-budget eviction loop against
  `Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9)`, count
  evictions into the skipped total so the toast stays truthful, and revert
  on `chrome.runtime.lastError`. A file without `allowPhrases` (every
  backup taken before this plan) must import exactly as it does today.
- Reuse an existing summary key for the toast if one fits; only add a new
  `settingsPart*` pair if the summary would otherwise be wrong — and then
  add it to both locale files and re-run the key-parity check from Step 6.

**Verify**: `npm run smoke && npm run lint && npm run typecheck` → exit 0.

### Step 8: e2e scenarios

Add to `tests/extension-interactions.js`, following the scenarios already
there (they set sync storage with `setSyncStorage`, reload the page, and
assert on `[data-ss-ph]`). Required scenarios — the third is the
do-not-skip one:

1. **Pardon hides nothing**: seed `ss_allow_phrases` with a phrase present
   in the mock spam post, load the page, assert **zero** `[data-ss-ph]`
   placeholders (the bait post stays visible).
2. **Live un-hide**: load the page with no allow-phrases (spam blocked,
   placeholder present), then write `ss_allow_phrases` via
   `setSyncStorage`, and assert the placeholder disappears without a
   reload — this proves `restoreAllowedPosts` and the `onChanged` wiring.
3. **Overlap case (REQUIRED — do not skip)**: seed a custom phrase that
   matches the post AND an allow-phrase with *different* text that also
   matches it. The two texts MUST differ — Step 5's conflict guard refuses
   an allow-phrase whose text equals an existing custom phrase, so reusing
   the same string would make the scenario unsettable (that refusal is
   correct behavior, not a bug). Example: custom phrase `checklist`,
   allow-phrase `engagement bait`, with a post containing both. Assert the post is **visible** (allow wins over custom,
   Decision 1). Without this scenario a future refactor can silently flip
   the precedence and every other test still passes.
4. **Label-block guard**: with `ss_hide_promoted` on and an allow-phrase
   matching a promoted post's text, assert the promoted post stays hidden
   (allow-phrases pardon text blocks only).

**Verify**: `npm run test:extension` → exit 0 with all four scenarios
passing. Then confirm scenario 3 is non-vacuous: temporarily move the
allow-check to *after* the pattern loop in `findMatch`, re-run, confirm
scenario 3 FAILS, then restore the correct order and re-run to green.
Record both outputs in your report.

### Step 9: Full gate

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package` → all exit 0.

## Test plan

- **Unit** (`tests/unit/pattern-data.test.js`, model after the existing
  `buildPatterns` tests in that file): the four `buildAllowMatcher` cases
  from Step 3.
- **e2e** (`tests/extension-interactions.js`): the four scenarios in Step 8,
  with scenario 3 (overlap) proven non-vacuous by the reordering experiment.
- **Import compatibility**: an export file produced *before* this change
  (no `allowPhrases` key) must import with no error — assert this inside
  the existing import scenario rather than adding a new one if that file
  already has an import test.
- Verification: `npm run test:unit && npm run test:extension` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0, with the new `buildAllowMatcher` tests
      (report old and new totals; old was 64)
- [ ] `npm run test:extension` exits 0 with all four new scenarios
- [ ] `npm run test:package` exits 0
- [ ] Step 8 recorded the overlap scenario FAILING under reversed precedence
      (non-vacuous evidence, quoted in your report)
- [ ] `node -e 'const c=require("./shared/constants.js");console.log(c.STORAGE_KEYS.ALLOW_PHRASES,c.LIMITS.MAX_ALLOW_PHRASES)'` → `ss_allow_phrases 100`
- [ ] `grep -n "allowMatchers" content.js` shows the check INSIDE `findMatch`
      and BEFORE the `spamPatterns` loop
- [ ] Locale parity: EN and ES key counts are equal with symmetric
      difference `[]` (Step 6 command); the count is 146, or 153 if plan 058
      landed first
- [ ] `grep -c "chrome.runtime.lastError" options/options.js` is greater than
      its pre-change value — every new `set()` call is guarded
- [ ] `grep -n "allowPhrases" options/options.js` shows it in BOTH the export
      payload and the import merge
- [ ] `grep -n "SS_buildAllowMatcher" types/globals.d.ts eslint.config.js` returns a match in EACH file
- [ ] `grep -n "root.SS_buildAllowMatcher" shared/pattern-data.js` returns a match
- [ ] `git diff --name-only main...HEAD` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `_locales/fr/`, `_locales/pt/`, or `_locales/de/` exists (check with
  `ls _locales`). That means plan 050 landed first and its parity check
  requires every new key in all shipped locales. Do NOT add FR/PT/DE
  strings yourself — unvalidated translations are what plan 050 forbids.
  Report it so the maintainer can source translations or resequence.
- The code at any "Current state" location does not match the excerpt.
- The overlap scenario (Step 8.3) passes under reversed precedence — the
  test is not actually pinning the ordering; report before continuing.
- You conclude a new FILE is needed. This plan adds none; a new file also
  requires editing the hardcoded list in `npm run smoke` and
  `scripts/package-extension.js`, both out of scope.
- The byte-quota pre-check makes a 100-entry allow list unstorable in
  practice (i.e. a realistic list trips `phraseStorageFullToast` well below
  the cap) — report the measured numbers; the cap is a decision, not
  something to silently raise.
- Adding the section to `options.html` requires new CSS to be readable —
  report what looks wrong rather than inventing a design.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Precedence is semantic.** Anyone refactoring `findMatch` must keep
  allow-phrases ahead of the pattern loop; the overlap e2e scenario is the
  guard. Same failure mode as plan 010's `[custom, builtin]` ordering.
- **Reviewer focus**: (1) the `labelBlockedPosts` guard in
  `restoreAllowedPosts` — without it, a text pardon un-hides Promoted posts;
  (2) every new `set()` has a `lastError` guard (plan 031's audit); (3) the
  import path tolerates files with no `allowPhrases`.
- **Interacts with plan 051 (match tester, TODO)**: the tester must report
  "allowed by <phrase>" rather than "no match", or it will mislead exactly
  the users this feature serves. `buildAllowMatcher` returns the phrase text
  precisely so it can. Cross-reference when 051 runs.
- **Interacts with plan 050 (UI localization, TODO)**: this plan adds 10 EN/ES
  keys, which enlarges 050's translation packet from 136 to 146 keys per
  language. Whichever lands second should re-run 050's key inventory.
- **Deferred:** an allow-phrase context-menu item ("never hide posts with
  this text") in `background.js`. Deliberately excluded — the service worker
  keeps its own helper copies and AGENTS.md forbids consolidating them
  without a dedicated plan. Unblocked by: that plan, or a decision to
  duplicate one more helper.
- **Deferred:** per-allow-phrase hit counts (how often each pardon fired).
  Unblocked by: plan 053, which builds the per-pattern stats storage this
  would extend.
