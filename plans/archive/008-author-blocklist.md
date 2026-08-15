# Plan 008 (design): Let users always-block a specific author, independent of text matching

> **Executor instructions**: This is a **design plan**, not a fully
> prescriptive step list — read "Why this is a design plan, not a build
> list" before starting. Resolve the open design decisions below (defaults
> are recommended; deviate only with a documented reason), then implement
> following the recommended shape, adapting exact code to whatever
> `content.js`/`background.js`/`options.js` look like at execution time.
> Run every verification command and confirm the expected result. If
> anything in "STOP conditions" occurs, stop and report. When done, update
> the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js background.js options/options.js manifest.json`
> Given this plan's nature, drift matters less for exact line numbers (which
> this plan mostly avoids citing) and more for whether the *functions this
> plan references* — `blockPost`, `getAuthorId`, `parseAuthorId`,
> `POST_SELECTORS`, the whitelist message-handler pattern — still exist with
> materially the same responsibilities. If any of those were removed or
> fundamentally restructured, treat it as a STOP condition and re-derive
> this plan's approach against the live code before implementing.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (new page-scanning strategy; must not over-match and hide
  unrelated content)
- **Depends on**: none functionally; benefits from `plans/005-unit-test-coverage.md`
  having landed (this plan calls `parseAuthorId`/`isLinkedInHost`, which
  that plan makes independently testable)
- **Category**: direction (feature)
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this is a design plan, not a build list

The audit that produced this plan found that implementing author-only
blocking is not a small extension of the existing whitelist feature it
mirrors conceptually — it requires a **new page-scanning strategy that
doesn't exist in this codebase today**, plus a change to `blockPost()`'s
signature and placeholder rendering that has UX implications. Both are real
design decisions with trade-offs, not mechanical transcription. Writing
this as a fully prescriptive, line-numbered plan (like `plans/001`–`007`,
`009`) would either hide those decisions inside code the plan author picked
unilaterally, or go stale the moment `content.js`'s line numbers shift from
any other plan landing first. This plan instead states the problem, the
options, a recommendation, and the concrete shape to build once the
decisions below are made.

## Why this matters

`content.js` already has a full author **whitelist** — "never block this
author" — via `whitelistedAuthors` (a `Set` of author IDs), message
handlers `addToWhitelist`/`removeFromWhitelist`/`getWhitelist`
(`content.js:404-427`), and a check inside `blockPost()`
(`content.js:669-671`: `if (authorId && whitelistedAuthors.has(authorId)) return;`).
There is no inverse: a way to say "always hide posts from this specific
author," independent of whether their post text happens to match a
detection pattern that day. This matters because engagement-bait accounts
often vary their exact wording to dodge pattern-based detection while
posting from the same identity repeatedly — text-based detection alone
misses that pattern; identity-based blocking would catch it.

## The core design tension

Every existing way `content.js` discovers "here is a post container"
starts from an **already-matched spam text node** and walks *up* the DOM
(`findPostContainer`, `content.js:544-554`, calling
`findBySiblingHeuristic` or `findByKnownSelectors`). There is no existing
pass that enumerates "every post-like element on the page" independent of
text content — because the whole point of the primary heuristic (per the
README: *"DOM text analysis instead of brittle LinkedIn CSS class
names — survives feed layout changes better"*) is to avoid relying on
LinkedIn's specific selectors as the *primary* detection mechanism.

Author-only blocking has no text signal to start from — by definition, it
must fire even when the post text doesn't match anything. That forces a
choice between:

**Option A (recommended): a dedicated enumeration pass using `POST_SELECTORS`.**
`content.js:73-77` already defines a selector fallback list:
```js
  const POST_SELECTORS = Object.freeze([
    '[data-id*="urn:li:activity:"]',
    ".feed-shared-update-v2",
    "article",
  ]);
```
Run `document.querySelectorAll(...)` against a **subset** of these
selectors (see "Decision 1" below — not all three are safe to use
unconditionally) to enumerate candidate post containers directly, for each
one call `getAuthorId(container)`, and block it if the result is in a new
`blockedAuthors` set. This is a supplementary, narrowly-scoped pass (only
matters for the small number of authors a user has explicitly blocklisted)
— not a replacement for the primary text-heuristic detection path, so it
doesn't undermine the "not selector-dependent" story for the extension's
core behavior. It does mean this one feature's reliability is tied to
LinkedIn's current markup in a way the rest of the extension deliberately
avoids — that's a real, acceptable trade-off for an opt-in, per-author
feature, but should be called out in the feature's own UI copy (e.g. a
line in the options page near the blocklist section: "This uses LinkedIn's
page structure and may occasionally miss a post if LinkedIn changes their
layout").

**Option B (rejected): extend the sibling heuristic to run on every text
node, not just spam-matched ones, then check author on every discovered
container.** This would make the *primary* scan pass dramatically more
expensive (running full container-detection on every substantial text
block on the page, not just spam-matched ones) for a feature most users
won't use. Rejected for performance — don't implement this without first
profiling scan cost on a real feed, which this plan didn't do.

### Decision 1: which selectors are safe to use for enumeration

Of the three `POST_SELECTORS`, recommend using only:
- `'[data-id*="urn:li:activity:"]'` — LinkedIn's own internal activity ID
  attribute; more durable than a CSS class name, and specific to actual
  feed/post content.
- `".feed-shared-update-v2"` — a LinkedIn-specific class, less durable than
  the `data-id` selector but still reasonably specific to posts.

**Do not use `"article"` for this feature.** It's broad enough to match
non-post `<article>` elements on pages this extension runs on (job
listings, search result cards, newsletter/article reader views — several
of which are in this extension's supported page list per `manifest.json`'s
`content_scripts[0].matches`). Using it for the primary text-heuristic path
is lower-risk because a false match there still requires the *text* to
also match a spam pattern; for author-only blocking, an over-broad selector
match would hide unrelated content with no secondary check to catch the
mistake.

### Decision 2: `blockPost()`'s signature and the placeholder UX

`blockPost(post, textNode)` (`content.js:661-804`) currently derives
`authorId` conditionally: `const authorId = textNode ? getAuthorId(post) : null;`
— meaning a `null` `textNode` (which the author-blocklist pass would use,
since there's no matched text node) suppresses author lookup entirely, even
though the caller in this case *already knows* the author (that's what
triggered the block). It also means `matchedText` becomes `""`, making the
existing "Not spam" button on the placeholder meaningless for an
author-blocked post (there's no text to exclude), and the placeholder's
label text (`t("blockedBy")`, generically "Blocked by LinkedIn Spam
Blocker") doesn't distinguish "blocked because of text" from "blocked
because of author."

Recommended shape: extend `blockPost`'s signature to
`blockPost(post, textNode, context)`, where `context` is optional and, for
an author-blocklist-triggered call, looks like
`{ reason: "author-blocklist", authorId }`. Inside `blockPost`:
- Skip the "Not spam" button entirely when `reason === "author-blocklist"`
  (there's no text to exclude — showing a button that does nothing is
  worse than not showing it).
- Show a new "Unblock this author" button instead, removing the author
  from `blockedAuthors` and calling `restorePost` — mirroring the existing
  whitelist button's shape (`content.js:762-780`) but for the new list.
  This is important: without this button, a user has no in-feed way to
  undo an author-block short of visiting the options page.
- Use a distinct placeholder label (a new locale key, e.g.
  `"blockedByAuthor"`, something like "Blocked — you've blocked this
  author") instead of the generic `blockedBy` text, so the user understands
  *why* without opening the extension's options.

### Decision 3: how a user adds an author to the blocklist

The existing whitelist is populated two ways: a button on the in-feed
placeholder (only reachable *after* a post was already blocked by text
matching — `content.js:762-780`) and directly in the options page (if
`plans/007` or a future plan adds direct entry — currently it doesn't;
whitelist entries can only be *removed* in the options page today, not
added there). For author-blocking, the equivalent "only reachable after a
text-based block" entry point doesn't help, since the whole point is to
catch authors whose *current* post didn't match any pattern.

Recommended: add a second browser context-menu item, alongside the
existing "add phrase from selection" one in `background.js`
(`chrome.contextMenus.create` at `background.js:14-21`), scoped to
`contexts: ["link"]` with a
`targetUrlPatterns` filter for LinkedIn profile/company/school/showcase
URLs (`*://*.linkedin.com/in/*`, `*://*.linkedin.com/company/*`, etc. —
match the same four path shapes `parseAuthorId` already recognizes,
`content.js:1013-1018`). When clicked (`info.linkUrl` holds the right-clicked
link's URL), parse it with the same `parseAuthorId`/`isLinkedInHost` logic
already used elsewhere (call the shared version from
`shared/pattern-data.js` if `plans/005-unit-test-coverage.md` has landed;
otherwise `background.js` needs its own copy, following this repo's
existing small-duplication convention) and add the result to
`blockedAuthors`. This gives a user a one-click way to block an author by
right-clicking their profile link anywhere on LinkedIn — feed post author
names, comment authors, search results — without needing that specific
post to have already been flagged.

## Recommended shape (once decisions above are made)

- **New storage key**: `ss_blocked_authors`, mirroring `ss_whitelist`'s
  shape (array of author-ID strings). New `CONFIG.MAX_BLOCKED_AUTHORS`
  constant, mirroring `MAX_WHITELIST` (100 is a reasonable starting cap —
  author IDs are short strings, well under any quota concern at that
  size; confirm with the same byte-math method `plans/001`/`007` used if
  you want a precise bound rather than reusing the existing 100).
- **`content.js`**: new `blockedAuthors` `Set`, loaded/watched alongside
  `whitelistedAuthors` (same storage read/`onChanged` pattern,
  `content.js:183-236`, `277-286`). New message handlers
  `addToBlockedAuthor`/`removeFromBlockedAuthor`/`getBlockedAuthors`,
  structurally identical to the existing whitelist ones
  (`content.js:404-427`). A new function, e.g. `scanForBlockedAuthors(root)`,
  implementing Decision 1's enumeration, called from the same places
  `scan()` is called (`scheduleInitialScan`, the `MutationObserver`
  callback) so newly-loaded posts get checked too, not just the initial
  page load.
- **`background.js`**: second `contextMenus.create` call for the
  link-context menu item (Decision 3), a second `onClicked` branch keyed
  on the new menu's ID.
- **`options/options.js`**: a management section for the blocklist,
  mirroring `renderWhitelist()` — list, confirm-click remove. (Whether to
  also allow *adding* an author by typing an ID directly into the options
  page, not just via the context menu, is a smaller open question left to
  the executor's judgment — the whitelist doesn't support direct-add
  either, so following that precedent for consistency is reasonable.)
- **Locale keys**: `blockedByAuthor` (placeholder text), `unblockAuthor`
  (button label), a blocklist section title and remove-label for the
  options page, and a context-menu title for the new "Block this author"
  menu item — mirror `contextMenuTitle`'s existing style.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0 |
| Packaged extension e2e | `npm run test:package` | exit 0 |

## Scope

**In scope**: `content.js`, `background.js`, `options/options.js`,
`options/options.html`, `manifest.json` (context-menu `targetUrlPatterns`
don't need a manifest permission beyond the existing `contextMenus`
permission already granted — verify this against the current
`chrome.contextMenus` API docs before assuming, since permission
requirements for `targetUrlPatterns` specifically should be confirmed
rather than assumed), `_locales/en/messages.json`,
`_locales/es/messages.json`.

**Out of scope**: changing the primary text-detection scan path in any
way; using the `article` selector for this feature (Decision 1); any kind
of shared/remote author reputation list — this feature is entirely local,
per-user, matching the extension's existing privacy model.

## Git workflow

- Branch: `advisor/008-author-blocklist`
- Commit message style: `feat(blocklist): let users always-block a specific author`
- Do NOT push or open a PR unless the operator instructed it.

## Phased approach

### Phase 1: Resolve and record the design decisions
Confirm Decisions 1–3 above against the live codebase (selectors still
present and behaving as described; `blockPost`'s current signature
matches what's cited). Record any deviation from the recommendations
above, with a one-line reason, in your eventual commit message.

### Phase 2: Implement the enumeration pass and storage plumbing
Build `scanForBlockedAuthors`, the new storage key, and the message
handlers. Test in isolation first (seed `ss_blocked_authors` manually via
the browser's extension storage inspector, load a mock feed with a post
from that author, confirm it gets hidden) before wiring up the UI to add
entries.

### Phase 3: Implement the `blockPost` context extension and placeholder changes
Implement Decision 2's `context` parameter and the distinct placeholder UX.
Verify manually: an author-blocked post shows the new "Unblock this
author" button, not the standard "Not spam" button.

### Phase 4: Implement the context-menu entry point
Implement Decision 3. Verify manually: right-clicking a LinkedIn profile
link shows the new menu item, and clicking it actually blocks that author
(test against a real LinkedIn profile URL structure, not just a
hand-constructed test fixture — profile URL shapes are simple enough that
a fixture is probably fine for automated tests, but do at least one manual
check against a real linkedin.com page before considering this done).

### Phase 5: Implement the options-page management UI
Mirror `renderWhitelist()`.

## Test plan

- Unit-level (if `plans/005-unit-test-coverage.md`'s test harness exists):
  no new pure functions are introduced by the recommended shape beyond
  what's already covered (`parseAuthorId`/`isLinkedInHost` — reused, not
  changed) — this plan's own novel logic (`scanForBlockedAuthors`) needs a
  live DOM, so it isn't a unit-test candidate; cover it via the e2e suite
  instead.
- e2e (`tests/extension-smoke.js` or a sibling): seed `ss_blocked_authors`
  with a known author ID via the sync-storage-seeding pattern already in
  this file, load a mock feed containing a post from that author with
  **non-spam text** (this is the key scenario — proves the block is
  author-driven, not incidentally also a text match), and confirm the post
  is hidden with the author-specific placeholder text.
- Manual: the context-menu-on-link flow (Phase 4) and a check against at
  least one real LinkedIn page type beyond the feed (e.g. a company page or
  search results, since `POST_SELECTORS`' reliability may vary by page
  type — this wasn't verified during the audit that produced this plan).

## Done criteria

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0 (including the author-only-block scenario)
- [ ] `npm run test:package` exits 0
- [ ] A post with non-spam text from a blocklisted author is hidden (this
      is the core scenario the feature exists for — verify it explicitly,
      don't just check that whitelisting-style plumbing compiles)
- [ ] The `article` selector is confirmed NOT used in
      `scanForBlockedAuthors`'s enumeration (`grep` the new function's body)
- [ ] The in-feed placeholder for an author-blocked post shows an
      "Unblock this author" action, not the standard "Not spam" button
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated, including a one-line note on
      any Decision 1–3 deviation

## STOP conditions

- Any of the referenced functions (`blockPost`, `getAuthorId`,
  `parseAuthorId`, `POST_SELECTORS`, the whitelist message-handler
  pattern) has been fundamentally restructured since this plan was written
  — re-derive the approach against live code rather than force-fitting
  this plan's recommendations.
- The enumeration pass (Decision 1) measurably over-matches on a real
  LinkedIn page during manual testing (hides content that isn't actually a
  post from the target author) — do not ship; narrow the selector set
  further or add a secondary heuristic check before considering this done.
- `chrome.contextMenus`'s `targetUrlPatterns` turns out to require a
  manifest permission this extension doesn't have — report back with what
  permission is needed rather than silently adding a broad new permission
  to `manifest.json`, since that's a user-facing change (new permission
  prompt on update) worth flagging explicitly.

## Maintenance notes

- If `plans/010-blocked-by-attribution.md` also lands, its `blockPost`
  signature change (adding match-attribution info) and this plan's
  `context` parameter addition both touch `blockPost`'s signature —
  whichever lands second should merge the two additions (e.g. `context`
  carrying both `{ reason, authorId }` and attribution fields) rather than
  landing two independent parameter additions that conflict.
- A reviewer should scrutinize: whether the enumeration pass respects the
  same `snoozeUntil`/`enabled` guards the primary `scan()` does (an
  author-block firing while the extension is disabled or snoozed would be
  inconsistent with the rest of the extension's behavior).
