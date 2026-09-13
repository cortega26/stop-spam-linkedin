# Plan 057: Measure what a bait comment blocks (spike — evidence, then a verdict)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **This is a spike, not a build plan.** Its deliverable is a measurement
> and a written verdict appended to this file. It ships NO behavior change
> to `content.js` or `shared/post-container.js`. If you find yourself
> editing detection logic, you have left the plan.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- shared/post-container.js content.js tests/unit/post-container.test.js tests/helpers.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW (adds test fixtures and a written verdict; no shipped behavior change)
- **Depends on**: none
- **Category**: direction (spike — measure a suspected false-positive class before designing anything)
- **Planned at**: commit `4f80330`, 2026-09-13 (branch `advisor/b1-stopspam-lock`, 3 commits ahead of `main`)

## Why this matters

`scan()` walks **every** text node in the document, comments included —
there is no guard restricting it to a post's own body. When someone leaves
"comment CLAUDE and I'll send you the framework" as a *comment* under an
ordinary post, `findMatch` fires and `SS_findPostContainer` walks up from
that comment's text node. What it lands on decides the user-visible outcome,
and nobody has measured it:

- If it resolves to the **post container**, one spam comment hides an
  innocent post — a false-positive class nobody has reported yet but which
  would be invisible to the current test suite (every fixture is a post with
  no comment section).
- If it resolves to the **comment element**, the post is safe and the bait
  comment is hidden — arguably already correct, and worth documenting as
  intended behavior.
- If it resolves to something else (a whole comments section, `null`), that
  is a third answer with its own follow-up.

This plan does not assume which. `plans/README.md` already records a
rejected finding of exactly this hypothesize-without-evidence shape ("Wrong-
author whitelisting via an oversized post-container heuristic … verifying it
requires live-DOM evidence that this audit didn't have access to"). The
maintainer's bar is evidence first. This plan produces it cheaply, in the
jsdom harness that already exists, and then stops.

## Current state

The facts the executor needs, inlined:

- **No comment guard exists.** `content.js:557-569` (`makeTextFilter`) rejects
  only `SCRIPT`/`STYLE`/`NOSCRIPT`, already-processed parents, and text
  shorter than `MIN_TEXT_LENGTH` (30):
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
- **The container chain under test** (`shared/post-container.js:127-149`):
  `findPostContainer` tries `findBySiblingHeuristic` first, then
  `findByKnownSelectors`, returning the first `Element`.
  `findByKnownSelectors` walks ancestors matching
  `['[data-id*="urn:li:activity:"]', ".feed-shared-update-v2", "article"]`.
- **Thresholds that decide the sibling heuristic**, mirrored in the test
  file (`tests/unit/post-container.test.js:19-26`):
  ```js
  const CONFIG = {
    MIN_TEXT_LENGTH: 30,
    SIBLING_CONTENT_THRESHOLD: 100,
    SIBLING_COUNT_THRESHOLD: 2,
    FEED_SIBLING_FALLBACK: 6,
    DEPTH_LIMIT: 20,
    CONTENT_LENGTH_THRESHOLD: 300,
  };
  ```
- **The fixture style to copy** (`tests/unit/post-container.test.js:39-50`):
  ```js
  function buildDom(html) {
    const dom = new JSDOM(html);
    return { dom, doc: dom.window.document };
  }

  function postSection(id, body) {
    return `<section data-id="urn:li:activity:${id}">
        <div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>
        <p class="post-body">${body}</p>
        <span>Promoted</span>
      </section>`;
  }
  ```
- **No existing fixture has a comment section** — confirmed by the advisor:
  `grep -rn "comment" tests/*.js tests/unit/*.js` returns only pattern text
  ("comment WORD…") and prose, never comment markup. Whatever the behavior
  is, the suite does not currently pin it.
- `jsdom` is already a devDependency (`package.json`), used by
  `tests/unit/post-container.test.js`.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Syntax + JSON smoke | `npm run smoke` | executed | exit 0 |
| Lint | `npm run lint` | executed | exit 0 |
| Typecheck | `npm run typecheck` | executed | exit 0 |
| Unit tests | `npm run test:unit` | executed | exit 0, 64 tests pass |
| Browser e2e | `npm run test:extension` | declared | exit 0 |

## Scope

**In scope**:
- `tests/unit/post-container.test.js` — comment-section fixtures and
  measurement assertions
- This plan file — the `## Spike deliverable` section you append
- `plans/README.md` — your status row

**Out of scope** (do NOT touch — a change here turns a spike into an
unreviewed product decision):
- `content.js` — no comment guard, no `makeTextFilter` change, no scan
  change. Not even "an obvious one-liner."
- `shared/post-container.js` — no heuristic change.
- `manifest.json`, the options page, locales.
- Any new dependency.

## Git workflow

- Branch: `advisor/057-comment-bait-spike`
- Commits: `test(spike): measure container resolution for bait comments`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 64 tests. A `declared` command missing or failing on the unmodified checkout is a broken baseline: STOP and report.

### Step 1: Build three comment-section fixtures

In `tests/unit/post-container.test.js`, add a `postWithComments(id, body,
commentText)` helper beside the existing `postSection` helper, and build
three variants. They differ in how much sibling weight the comment carries,
because that is what `findBySiblingHeuristic` keys on:

- **Fixture A — light thread**: one post body (>300 chars) plus a single
  comment containing `commentText`, with no other heavy siblings inside the
  comment list.
- **Fixture B — heavy thread**: same post plus three or more sibling
  comments, each over `SIBLING_CONTENT_THRESHOLD` (100 chars), with the bait
  comment among them. This is the case where the heuristic is most likely to
  accept the comment level.
- **Fixture C — no `data-id`**: the same as B but with the post element
  carrying neither `data-id` nor `feed-shared-update-v2` (a surface where
  only the sibling heuristic can fire).

Use realistic nesting depth (post → comments section → comment list →
comment → text), since `DEPTH_LIMIT` is 20 and depth changes the answer.

**Verify**: `npm run test:unit` → exit 0 (the fixtures compile and any
placeholder assertion passes).

### Step 2: Measure, and record what each fixture resolves to

For each fixture, take the text node holding `commentText` and call
`findPostContainer(node, CONFIG, POST_SELECTORS, doc)`. Assert on the
**actual observed result** — do not assert what you expect and then adjust
the fixture until it agrees. Write the assertion so the failure message
prints the resolved element's tag, `data-id`, and class list.

Record for each fixture, in a table you will paste into Step 4:

| Fixture | Resolved element | Is it the post? | Is it the comment? | Post text hidden? |

"Post text hidden?" means: does the resolved element contain the post's own
body text — i.e. would blocking it hide the innocent post?

**Verify**: `npm run test:unit` → exit 0, with the new assertions passing
against the observed behavior. Paste the resolved values into your report.

### Step 3: Confirm the measurement end-to-end in a real browser

The jsdom result is necessary but not sufficient: the live content script
also runs `makeTextFilter`, the `processed` WeakSet, and `blockPost`'s
guards. Add ONE temporary e2e probe (do not commit it if it proves
nothing): extend the mock document in `tests/helpers.js` **in your working
tree only** with a clean post that has a bait comment beneath it, run
`npm run test:extension`, and observe whether a `[data-ss-ph]` placeholder
appears and what it replaced.

If Playwright's Chromium is unavailable, say so explicitly in the deliverable
and mark the verdict "jsdom-only" — a jsdom-only verdict is honest and still
useful; a jsdom-only verdict presented as end-to-end is not.

**Verify**: `npm run test:extension` → runs to completion; record whether
the innocent post was hidden, the comment was hidden, or nothing was.
Then drop the probe unless Step 4's verdict is CONFIRMED (in which case
keep it as the reproduction case). Drop it with
`git checkout tests/helpers.js` ONLY if that file holds nothing but your
probe — if you made any other edit to it, revert the probe by hand. A blind
checkout discards uncommitted work.

### Step 4: Write the verdict

Append a `## Spike deliverable` section to THIS file containing:

1. The measurement table from Step 2, plus the Step 3 browser observation
   (or an explicit "jsdom-only" note).
2. Which of the three outcomes holds:
   - **CONFIRMED — post-level**: a bait comment hides the innocent post.
     Then also sketch (do not implement) the two candidate fixes and their
     costs: (a) reject text nodes inside comment subtrees in
     `makeTextFilter`, which needs a comment-subtree signal that survives
     LinkedIn class churn; (b) block the comment element rather than the
     post, which needs `blockPost` to accept a non-post element and a
     placeholder that reads sensibly inline. State which you recommend and
     why, and name the regression test any build plan must include.
   - **BENIGN — comment-level**: the comment alone is hidden. Then say so,
     keep the fixtures as a permanent pin of that behavior, and recommend
     documenting it in `README.md`'s feature list as a follow-up — no build
     plan needed.
   - **NOT REPRODUCED**: the fixtures resolve to `null` or to something that
     hides nothing. Then close the thread: recommend REJECTED and give the
     one-line rationale for `plans/README.md`'s "considered and rejected"
     section.
3. A confidence line: synthetic fixture vs. real captured DOM. If you had no
   access to real LinkedIn comment markup, say that plainly — it bounds how
   far the verdict travels.

**Verify**: the appended section exists and names exactly one of the three
outcomes:
```
grep -c "^## Spike deliverable" plans/057-comment-bait-spike.md
```
→ `1`.

### Step 5: Full gate

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → all exit 0, and `git diff --name-only main...HEAD` lists only `tests/unit/post-container.test.js`, `plans/057-comment-bait-spike.md`, `plans/README.md` (plus `tests/helpers.js` only if the verdict is CONFIRMED and you kept the reproduction).

## Test plan

- New tests in `tests/unit/post-container.test.js`, modeled on the existing
  `findPostContainer` tests: three fixtures (A/B/C), each asserting the
  observed resolution with a failure message that prints tag + `data-id` +
  classes.
- These tests are **characterization tests**: they pin current behavior,
  whatever it is. If a later plan changes the behavior deliberately, it
  updates them and says so.
- No e2e test is committed unless the verdict is CONFIRMED.
- Verification: `npm run test:unit` → exit 0, 64 + 3 (or more) tests.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` exits 0 with at least 3 new fixture tests
      (report old total 64 and the new total)
- [ ] The Step 2 measurement table is in your report AND in the appended
      `## Spike deliverable` section
- [ ] `grep -c "^## Spike deliverable" plans/057-comment-bait-spike.md` → `1`
- [ ] The deliverable names exactly one verdict: CONFIRMED / BENIGN /
      NOT REPRODUCED, with a confidence line
- [ ] `git diff --name-only main...HEAD -- content.js shared/post-container.js`
      returns NOTHING (the spike shipped no behavior change)
- [ ] `plans/README.md` status row updated with the verdict in the reason

## STOP conditions

Stop and report back (do not improvise) if:

- You conclude the fix is obvious and want to implement it. That is the one
  thing this plan forbids; the verdict is the deliverable, and the build
  decision belongs to the maintainer.
- The three fixtures disagree with each other in a way that makes a single
  verdict dishonest (e.g. A benign, B post-level). Report all three results
  and recommend which shape is more representative — do not average them
  into one claim.
- jsdom cannot express the nesting realistically (e.g. the heuristic depends
  on layout the fixture cannot fake). Report the limitation.
- The e2e probe hides something you did not predict from the jsdom result —
  that discrepancy is more valuable than either result alone; report both.

## Maintenance notes

- The fixtures added here are the first comment-section coverage in the
  suite. Any future change to `makeTextFilter` or the container heuristics
  should run them and expect them to be meaningful — if a refactor makes
  them pass trivially, they have stopped testing anything.
- **Deferred:** capturing real LinkedIn comment DOM. Unblocked by: a
  maintainer with a live session willing to save one post's comment markup
  into a fixture file. That upgrade turns a synthetic verdict into a
  definitive one.
- **Deferred:** hiding bait comments as a *feature* (rather than as a
  side effect). Unblocked by: a BENIGN or CONFIRMED verdict here — under
  BENIGN it is already happening and only needs documenting; under CONFIRMED
  it becomes candidate fix (b).
