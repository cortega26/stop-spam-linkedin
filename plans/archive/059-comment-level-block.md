# Plan 059: Block the comment, not the post, when bait text sits in a comment (fix from spike 057)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c11efc0..HEAD -- shared/post-container.js content.js tests/unit/post-container.test.js tests/extension-interactions.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (the only open user-harm bug class: one bait comment hides an innocent post — proven by spike 057, jsdom + real browser)
- **Effort**: M
- **Risk**: MED (touches the container-resolution path every block goes through; mitigated by the 057 fixtures as tripwire and the failing-first e2e)
- **Depends on**: none hard. **Soft: after 057** (its characterization fixtures are updated here) and **before 058** (serial discipline — both touch `content.js` and `tests/extension-interactions.js`)
- **Category**: correctness build (decision made — implement fix (b) from the 057 spike deliverable, do not re-derive)
- **Planned at**: commit `c11efc0`, 2026-09-13 (the `main` merge of 056/051/055/057; branch `advisor/b1-stopspam-lock` is now merged to `main` — this plan's base is `main` itself)

## Why this matters

Spike 057 measured it: `findPostContainer` walks up from the bait text node
and, in the light-thread shape (a bait comment as the first/only comment
under a post — a common spam placement), the sibling heuristic overshoots
and lands on the **post section**. `blockPost` then hides the whole innocent
post. Verified end-to-end in a real browser: the post's section went
`display: none` with a placeholder, its comment untouched, and the clean
control post stayed visible. In the heavy-thread shape (≥2 substantial
sibling comments) the heuristic already lands on the comment element and
only the comment is hidden — the benign baseline, pinned by 057's fixtures.

This plan implements 057's recommended fix (b): **when the resolution lands
on a post but the matched text node sits inside a comment element within
that post, block the comment element instead.** Fix (a) (reject comment
subtrees in `makeTextFilter`) was rejected by the spike because it needs a
comment-subtree signal that survives LinkedIn class churn; fix (b) needs no
new markup signal beyond a single, centralized selector constant, reuses
the existing resolution, and leaves the heavy-thread behavior byte-identical.

## Decisions already made — implement these, do not re-derive

**Decision 1 — the comment preference lives in `findPostContainer`, not in
`scan()` or `blockPost`.** The module is unit-tested; scan() and blockPost
stay untouched except the two adjustments in Decision 3. After the existing
strategy chain returns a result, if that result is **post-like** (has a
`data-id` attribute or matches any `postSelectors` entry) and the text node
is inside a comment element (per the new `COMMENT_SELECTORS`) that is a
proper descendant of the result, return the comment element instead. All
other paths return exactly what they return today. This is why 057's
fixture A flips (post → comment) while B and C stay put — B/C already
resolve to the comment, which is not post-like, so the preference never
fires there. On real LinkedIn, if a comment element is an `<article>`, it
matches `postSelectors` and the preference applies to it too — the
`commentTarget !== result` guard keeps that case a no-op.

**Decision 2 — the comment selector is a single module-local constant**:
`COMMENT_SELECTORS = [".comment", ".comments-comment-item"]` in
`shared/post-container.js`. The first value matches the 057 fixture shape;
the second is LinkedIn's real comment-item class (unverified against live
DOM — the plan's confidence line says so; the constant is centralized so a
real-DOM capture can adjust it in one place). `findPostContainer` gains an
optional 5th parameter `commentSelectors` defaulting to this constant —
existing callers (4-arg) are unchanged. Do NOT export a new `SS_*` global
for it; the default is module-internal (keeps `types/globals.d.ts` and
`eslint.config.js` untouched).

**Decision 3 — `blockPost`/`restorePost` gain post-key fallback and a
compact placeholder for non-post targets.** A comment element has no
`data-id`, so the cooldown key and undo bookkeeping would silently degrade
(node re-creation would re-hide a shown comment). Both functions already
resolve `postKey` from `post.getAttribute("data-id")`; extend that lookup:
if the element has no `data-id`, walk up with
`el.closest?.('[data-id*="urn:li:activity:"]')` and take ITS `data-id`.
That keeps cooldown/undo keyed on the parent post (stable across LinkedIn
SPA node churn). The placeholder for a non-post target gets a compact
inline style (see Step 3) so a hidden comment card reads sensibly inside
the comment list. No new locale keys — the placeholder reuses `blockedBy`,
`notSpam`, `show`, `reportMissed`, and the author buttons flow naturally
(`getAuthorId` on a comment resolves the commenter when links exist, and
returns null otherwise — leave that logic untouched).

**Decision 4 — author attribution is NOT special-cased.** `getAuthorId`
already tolerates any element (returns null when no author links exist).
Whitelisting a commenter from a comment placeholder un-hides their
comments via the existing `restoreAuthorPosts`-style paths — coherent
behavior, no new code. Do not add gates for it.

**Decision 5 — allow-phrases pardon comments.** `restoreAllowedPosts`
iterates `blockedPosts` (which now includes comment elements) and checks
textContent against the allow matchers — a comment matching a never-hide
phrase is un-hidden automatically. No change needed; the e2e scenario
should not assert anything contradicting this.

## Current state

The facts the executor needs, inlined (verified at `c11efc0`):

- **The single call site** (`content.js:614`) — inside `scan()`:
  ```js
      const container = SS_findPostContainer(textNode, CONFIG, POST_SELECTORS);
      if (
        container &&
        !processed.has(container) &&
        !forceShow.has(container)
      ) {
        blockPost(container, textNode, match);
      }
  ```
  `scan()` is unchanged by this plan.
- **The resolution chain** (`shared/post-container.js:127-148`) — the
  function this plan extends. Current signature:
  ```js
  function findPostContainer(textNode, config, postSelectors, doc) {
    doc = doc || globalThis.document;
    const strategies = [
      (node) => findBySiblingHeuristic(node, config, doc),
      (node) => findByKnownSelectors(node, postSelectors, doc),
    ];
    for (const strategy of strategies) {
      try {
        const result = strategy(textNode);
        if (
          result instanceof
          (doc && doc.defaultView
            ? doc.defaultView.Element
            : typeof Element !== "undefined"
              ? Element
              : Object)
        )
          return result;
      } catch (_) {
        /* skip failed strategy */
      }
    }
    return null;
  }
  ```
  The module's export block is at `shared/post-container.js:151-165`:
  `root.SS_findPostContainer = findPostContainer;` plus
  `module.exports = { findBySiblingHeuristic, findByKnownSelectors, findPostContainer }`.
  The module has NO new-global requirement for this plan (Decision 2).
- **`blockPost`'s cooldown key** (`content.js:725-729`):
  ```js
  function blockPost(post, textNode, info) {
    /* Re-block cooldown — skip if user recently clicked "Show". */
    const postKey = post.getAttribute("data-id");
    if (postKey && cooldownStore.has(postKey)) return;
  ```
- **`blockPost`'s placeholder style** (`content.js:788-797`) — the cssText
  this plan makes conditional:
  ```js
    const placeholder = document.createElement("div");
    placeholder.dataset.ssPh = "1";
    placeholder.style.cssText = [
      "display:flex; align-items:center; gap:12px;",
      "padding:16px 24px; margin:8px 0;",
      "background:#f8f9fa; border:1px solid #e0e0e0; border-radius:8px;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
      "font-size:14px; color:#666;",
    ].join("");
  ```
- **`restorePost`'s postKey lookup** (`content.js:1270-1273`):
  ```js
  function restorePost(post) {
    forceShow.add(post);
    processed.delete(post);
    const postKey = post.getAttribute("data-id");
    if (postKey) cooldownStore.set(postKey);
  ```
- **`POST_SELECTORS`** (`content.js:28-34`) — the "post-like" test:
  ```js
  const POST_SELECTORS = Object.freeze([
    '[data-id*="urn:li:activity:"]',
    ".feed-shared-update-v2",
    "article",
  ]);
  ```
- **The 057 spike fixtures** (`tests/unit/post-container.test.js:52-90`):
  `postWithComments(id, body, commentTexts, noKnownSelector)` builds
  `<section data-id=...><div class="actor">…<p class="post-body">…<div class="comments"><div class="comments-list"><div class="comment"><p class="comment-body">TEXT` and
  `describeElement(el)` prints tag + data-id + classes in failure messages.
  The three spike tests (at ~line 273) currently assert: fixture A →
  the `section` (post), fixtures B and C → the `.comment` element. Fixture
  A's assertion is the one that flips under this plan (Decision 1).
- **The `CONFIG` the fixtures use** (`tests/unit/post-container.test.js:19-26`):
  `SIBLING_CONTENT_THRESHOLD: 100`, `SIBLING_COUNT_THRESHOLD: 2`,
  `FEED_SIBLING_FALLBACK: 6`, `DEPTH_LIMIT: 20`,
  `CONTENT_LENGTH_THRESHOLD: 300`, `MIN_TEXT_LENGTH: 30`. Fixture A's post
  body is `"y".repeat(320)` (>300) and its comment text is
  `"comment CLAUDE and I'll send you the framework"` (>30).
- **The e2e injection pattern to copy** (`tests/extension-interactions.js`,
  the 056/051 scenarios): seed sync storage with `setSyncStorage`, reload,
  then inject a post via `linkedInPage.evaluate(() => { ... document.querySelector("main").appendChild(section); })`, wait with `waitForFunction` on the observed state, assert with `assertCount(page.locator("[data-ss-ph]"), N)` and `getComputedStyle(el).display` checks. The mock feed (injected by `tests/helpers.js`'s `mockLinkedInFeed`) already contains spam-1 (hidden) and clean-1 (visible).
- Repo conventions (AGENTS.md): `"use strict"` IIFEs; shared pure logic in
  `shared/post-container.js` (UMD — globals + `module.exports`); every
  `chrome.storage.*.set()` carries a `lastError` guard; no new files
  (STOP condition if you conclude one is needed); commits
  conventional-ish (`type(scope): summary`).

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Syntax + JSON smoke | `npm run smoke` | executed | exit 0 |
| Lint | `npm run lint` | executed | exit 0 |
| Typecheck | `npm run typecheck` | executed | exit 0 |
| Unit tests | `npm run test:unit` | executed | exit 0, 75 tests (higher after new tests) |
| Browser e2e | `npm run test:extension` | executed | exit 0 |
| Packaged e2e | `npm run test:package` | executed | exit 0 |

`executed` rows were run by the reviewer on an unmodified checkout at
`c11efc0` (2026-09-13): all green, 75/75 unit, extension + package e2e
green. Playwright's Chromium is available in this environment
(`~/.cache/ms-playwright/chromium-1223`).

## Scope

**In scope** (the only files you should modify):
- `shared/post-container.js` — `COMMENT_SELECTORS` const + the
  comment-preference in `findPostContainer` (optional 5th param)
- `content.js` — `postKey` fallback in `blockPost` and `restorePost`;
  compact placeholder style for non-post targets
- `tests/unit/post-container.test.js` — flip fixture A to the comment,
  add the post-body-preserved case
- `tests/extension-interactions.js` — one comment-bait scenario
- `plans/README.md` — your status row (reviewer-owned unless you are told otherwise)

**Out of scope** (do NOT touch):
- `makeTextFilter` / `findSpamTextNodes` — fix (a) was rejected; no filter change.
- `background.js`, `popup/`, the options page, locales, `manifest.json`.
- Any new file, any new locale key, any new `SS_*` global, any new
  dependency.
- The author-blocklist / Promoted / Featured passes (`scanForBlockedAuthors`,
  `scanForLabeledPosts`, `scanForFeaturedSection`) — untouched.
- The 057 fixtures B and C — their assertions must NOT change.

## Git workflow

- Branch: `advisor/059-comment-level-block`
- Commit per logical unit: module + tests, then content.js, then e2e.
  Conventional-ish messages, e.g.
  `fix(block): hide the comment, not the post, when bait text sits in a comment`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run every command in the table on the unmodified checkout. All pass →
record and proceed. A failure of an `executed` row on the unmodified
checkout is drift — STOP. A `declared` row missing/failing here is a broken
baseline — STOP and report.

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 75/75.

### Step 1: Write the failing tests FIRST (prove the bug is real)

**Unit side** — in `tests/unit/post-container.test.js`:
1. Flip fixture A's assertion from the `section` to the `.comment` element
   (the desired behavior, Decision 1). Keep its `describeElement` failure
   message and the post-body-not-hidden assertion.
2. Add a **post-body-preserved** case: the same post-with-comments markup
   (fixture A shape) but with the bait text in the POST BODY (`<p
   class="post-body">`), not in a comment — `findPostContainer` must still
   return the `section` (a true positive still hides the whole post).
3. Add a **no-comment-ancestor** case: `findPostContainer` on a text node
   that is NOT inside any comment element (e.g. the actor line or footer)
   still returns the post — the preference must not fire.

**e2e side** — in `tests/extension-interactions.js`, add ONE scenario,
modeled on the 056/051 injection scenarios:
- Seed sync storage with the stock settings (`ss_whitelist: ["trusted"]`,
  `ss_blocked_authors: []`, no phrases, no allow-phrases, no exclusions —
  copy the seeding shape of the 056 scenarios) and reload the page.
- Inject via `evaluate`: a `<section data-id="urn:li:activity:comment-post-1">`
  with an actor div, a benign post body > 300 chars (no pattern text), and
  a comments section (`<div class="comments"><div class="comments-list">
  <div class="comment"><p class="comment-body">comment CLAUDE and I'll send
  you the framework</p></div></div></div>` — the comment text is the EN
  built-in bait, > MIN_TEXT_LENGTH).
- Assert, after the debounced observer scan runs (wait on the OBSERVED
  state with `waitForFunction`, not a bare timeout):
  1. the injected post section stays **visible** (`display` not `none`) —
     this is the fix's core claim;
  2. the `.comment` element is **hidden** (`display: none`) with a
     `[data-ss-ph]` placeholder as its next sibling;
  3. `assertCount("[data-ss-ph]", N+1)` where N is the count before
     injection (spam-1's placeholder);
  4. clean-1 is still visible and spam-1 is still hidden.
- Then click the placeholder's "Show" button (`SS_t("show")` — the
  scenarios drive buttons by `SS_t` label in this file; check how the
  existing scenarios click placeholder buttons and copy it) and assert the
  comment is visible again (restorePost works on non-post elements).

Run the e2e scenario against the UNMODIFIED code.

**Verify**: `npm run test:unit` → the flipped fixture A test **FAILS**
(asserts `.comment`, code returns the `section`); the two new unit tests
PASS (they pin already-true behavior). `npm run test:extension` → the new
scenario **FAILS** (the post is hidden — today's bug). Record both failure
outputs in your report. If fixture A PASSES before the fix, the bug is not
what this plan describes — STOP and report.

### Step 2: Implement the comment preference in the shared module

In `shared/post-container.js`:

1. Add the module-local constant near `POST_SELECTORS`-related code (there
   is none in this file — place it above `findBySiblingHeuristic`):
   ```js
   /* Comment element selectors (plan 059): the comment-preference check
      uses these to decide that matched text sits in a comment, not the
      post body. ".comment" is the fixture shape; ".comments-comment-item"
      is LinkedIn's real comment-item class (unverified against live DOM —
      centralized here so a real-DOM capture can adjust it in one place). */
   const COMMENT_SELECTORS = [".comment", ".comments-comment-item"];
   ```
2. Extend `findPostContainer` with the optional 5th parameter and the
   preference step. Exact shape:
   ```js
   function findPostContainer(textNode, config, postSelectors, doc, commentSelectors) {
     doc = doc || globalThis.document;
     const strategies = [
       (node) => findBySiblingHeuristic(node, config, doc),
       (node) => findByKnownSelectors(node, postSelectors, doc),
     ];
     for (const strategy of strategies) {
       try {
         const result = strategy(textNode);
         if (
           result instanceof
           (doc && doc.defaultView
             ? doc.defaultView.Element
             : typeof Element !== "undefined"
               ? Element
               : Object)
         ) {
           /* Comment preference (plan 059 Decision 1): when the resolution
              lands on a post-like container but the matched text sits in a
              comment element inside it, block the comment, not the post.
              B/C-shaped resolutions (already a comment, not post-like)
              are untouched; the commentTarget !== result guard keeps a
              comment that itself matches postSelectors (e.g. <article>)
              a no-op. */
           const commentTarget =
             textNode?.parentElement &&
             (commentSelectors ?? COMMENT_SELECTORS).length > 0
               ? textNode.parentElement.closest((commentSelectors ?? COMMENT_SELECTORS).join(","))
               : null;
           const isPostLike =
             result.hasAttribute("data-id") ||
             postSelectors.some((sel) => result.matches?.(sel));
           if (
             isPostLike &&
             commentTarget &&
             commentTarget !== result &&
             result.contains(commentTarget)
           ) {
             return commentTarget;
           }
           return result;
         }
       } catch (_) {
         /* skip failed strategy */
       }
     }
     return null;
   }
   ```
   Note the original `return result;` was inside the `if` block — the new
   code keeps that shape with the preference step before it. `closest` and
   `contains` are standard Element APIs (jsdom supports both).
3. The export block needs NO change (`findPostContainer` already exported;
   the constant stays module-local per Decision 2).

**Verify**:
```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
```
→ exit 0; unit now passes with the flipped fixture A (report the new
total: 75 + 2 = 77).

### Step 3: content.js — post-key fallback and compact placeholder

1. **`blockPost` postKey** (`content.js:725-729`) — extend the lookup:
   ```js
   function blockPost(post, textNode, info) {
     /* Re-block cooldown — skip if user recently clicked "Show". The key
        is the element's own data-id, or — for non-post targets like a
        comment element (plan 059) — the parent post's data-id, so a
        shown comment stays shown across SPA node re-creation. */
     const postKey =
       post.getAttribute("data-id") ||
       (post.closest ? (post.closest('[data-id*="urn:li:activity:"]') || {}).getAttribute?.("data-id") : null) ||
       null;
     if (postKey && cooldownStore.has(postKey)) return;
   ```
   Careful with the optional-chaining shape: `post.closest(...)` returns an
   Element or null; the expression must not throw. Match the file's
   existing style (it uses `?.` elsewhere). If tsc complains about the
   `({}).getAttribute?.()` shape, use a small local helper instead:
   ```js
   function getPostKey(el) {
     const own = el.getAttribute("data-id");
     if (own) return own;
     const post = el.closest ? el.closest('[data-id*="urn:li:activity:"]') : null;
     return post ? post.getAttribute("data-id") : null;
   }
   ```
   and use it in BOTH `blockPost` and `restorePost` (a shared helper is
   the cleaner shape — choose it unless the inline version typechecks
   cleanly; do not duplicate the expression twice).
2. **`restorePost` postKey** (`content.js:1270-1273`) — same fallback so
   undo/Show on a comment sets the parent post's cooldown:
   ```js
   const postKey = getPostKey(post);
   if (postKey) cooldownStore.set(postKey);
   ```
3. **Compact placeholder** — after `placeholder.dataset.ssPh = "1";`
   (content.js:789), make the cssText conditional on the target being
   non-post-like. Compute once near the top of `blockPost`, after postKey:
   ```js
   const isPostTarget = !!postKey && post.hasAttribute("data-id");
   ```
   and set the style:
   ```js
   placeholder.style.cssText = isPostTarget
     ? [ /* existing 5-line cssText unchanged */ ].join("")
     : [ /* compact: */
       "display:flex; align-items:center; gap:8px;",
       "padding:6px 10px; margin:4px 0;",
       "background:#f8f9fa; border:1px solid #e0e0e0; border-radius:6px;",
       "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
       "font-size:12px; color:#666;",
     ].join("");
   ```
   Everything else in `blockPost` (buttons, counting, lastBlocked, author
   logic) is untouched — verify by reading the surrounding code that the
   only edits are the postKey expression and the cssText conditional.

**Verify**: `npm run smoke && npm run lint && npm run typecheck` → exit 0.

### Step 4: e2e green

**Verify**: `npm run test:extension` → exit 0; the new scenario passes with
all four assertions. Then confirm the scenario is non-vacuous in the OTHER
direction: temporarily comment out the comment-preference block in
`findPostContainer` (the `isPostLike && commentTarget …` branch), re-run
`npm run test:extension`, confirm the new scenario FAILS (post hidden),
restore the code, re-run to green. Record both outputs in your report.
Do not commit the temporary edit.

### Step 5: Full gate

**Verify**:
```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package
```
→ all exit 0. `test:package` proves the shipped zip carries the change.

## Test plan

- **Unit** (`tests/unit/post-container.test.js`): fixture A flipped to the
  comment (the 057 deliverable's required flip), B and C unchanged
  (heavy-thread behavior pinned), plus two new cases — post-body bait still
  hides the post, and non-comment text still resolves to the post.
- **e2e** (`tests/extension-interactions.js`): the injected comment-bait
  scenario — post visible, comment hidden with inline placeholder, counts
  intact, Show restores the comment. Proven non-vacuous both ways: fails
  on unmodified code (Step 1) and fails with the preference disabled
  (Step 4).
- No new locale keys, no new files, no new dependencies.
- Verification: `npm run test:unit && npm run test:extension && npm run test:package` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` exits 0 — report old (75) and new (77) totals
- [ ] `npm run test:extension` exits 0 with the new comment-bait scenario
- [ ] `npm run test:package` exits 0
- [ ] Step 1 recorded fixture A FAILING pre-fix and the e2e scenario
      FAILING pre-fix (both quoted in your report)
- [ ] Step 4 recorded the e2e scenario FAILING with the preference
      disabled (non-vacuity, quoted)
- [ ] `node -e 'const m=require("./shared/post-container.js");console.log(typeof m.findPostContainer, m.findPostContainer.length)'` → `function 5` (5th optional param present)
- [ ] `grep -n "commentTarget" shared/post-container.js` shows the
      preference branch inside `findPostContainer`
- [ ] `grep -n "getPostKey\|closest.*activity" content.js` shows the
      post-key fallback in BOTH `blockPost` and `restorePost`
- [ ] Fixture tests B and C assert the `.comment` element, unchanged from
      their 057 form (`grep -n "spike:" tests/unit/post-container.test.js`
      → 3 tests, and the B/C assertions still expect the comment)
- [ ] No new locale keys: `git diff --name-only <base>..HEAD -- _locales` returns nothing
- [ ] `git diff --name-only <base>..HEAD` lists only the four in-scope
      files (shared/post-container.js, content.js,
      tests/unit/post-container.test.js, tests/extension-interactions.js)
- [ ] `plans/README.md` status row updated (reviewer-owned if dispatched)

## STOP conditions

Stop and report back (do not improvise) if:

- Fixture A passes BEFORE the fix, or the e2e scenario passes BEFORE the
  fix — the bug is not what this plan describes; report what you observed.
- `findPostContainer`'s signature/shape differs from "Current state" (a
  later plan changed the module meanwhile).
- The e2e shows a comment block hiding MORE than the comment (e.g. the
  whole comments section, or the post) even with the fix in — the
  `closest()` pick is wrong; report the resolved element rather than
  adjusting selectors speculatively.
- You conclude a new locale key, a new file, or a new `SS_*` global is
  needed — the plan was designed to avoid all three; report before adding.
- `npm run typecheck` rejects the optional-chaining shape in the postKey
  fallback AND the helper variant is not typecheckable either — report
  the exact error rather than casting.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The 057 fixtures are the tripwire.** Any future change to
  `findPostContainer` or the comment preference must keep: fixture A →
  comment, B/C → comment, post-body bait → post. If a refactor makes them
  pass trivially, they have stopped testing anything.
- **`COMMENT_SELECTORS` is a live-markup guess.** `.comments-comment-item`
  is LinkedIn's real class per general knowledge, unverified against
  captured DOM. The 057 deliverable's deferred task (capture real comment
  markup) is the upgrade path — one-line adjustment in
  `shared/post-container.js`.
- **Cooldown semantics changed subtly**: a comment block now sets the
  parent post's cooldown key on Show/undo, so a shown comment stays shown
  across node re-creation — but it also means a post-level block of that
  same post is skipped for the cooldown window after undoing a comment.
  Accepted; the existing 15-minute window bounds it.
- **Interacts with 058 (first-run onboarding, TODO)**: serial discipline —
  both touch `content.js` and `tests/extension-interactions.js`; run 059
  first, rebase 058 onto it.
- **Allow-phrases already pardon comments** (Decision 5) — if plan 051's
  match tester is ever extended to comments, its verdicts must match this
  plan's precedence (allow → comment-level hide → post-level hide).
- **Deferred:** a "block this commenter" affordance — the author machinery
  already resolves commenter ids from comment links; nothing wires a
  commenter-blocklist. Unblocked by: demand evidence.
- **Deferred:** README feature-list mention of comment-level blocking.
  Skipped deliberately (5-file translation churn for one line); unblocked
  by: the next docs pass (plan 047's successor).