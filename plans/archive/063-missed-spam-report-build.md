# Plan 063: Ship selection-based missed-spam reporting

> **Executor:** Build the already-designed report flow in a dedicated
> `advisor/063-missed-spam-report` branch. Run all verification gates,
> review the diff, and update/archive the plan and its index row when done.
>
> **Drift check:** `git diff --stat 3986b84..HEAD -- background.js content.js _locales/en/messages.json _locales/es/messages.json tests/extension-interactions.js tests/extension-smoke.js tests/firefox-smoke.js README.md AGENTS.md`.
> Compare changed dependencies to the contracts below. Do not merge the
> old spike branch wholesale: it predates shared-helper and comment fixes.

## Status

- **Priority:** P2
- **Effort:** M (implementation and browser validation)
- **Risk:** MED — selection scope, clipboard activation, browser parity
- **Confidence:** HIGH repository grounding; prior Chromium spike is evidence, not a current Firefox guarantee
- **Depends on:** archived 049 design is complete; no open prerequisite
- **Category:** direction — build follow-up to a completed design
- **Planned at:** `3986b84`, 2026-09-13
- **Status:** TODO

## Why this matters

A report action currently appears only after text was blocked. A user staring
at missed spam can add a broad phrase or report it manually, but cannot start
the report from the visible post. The archived 049 spike demonstrated a
selection-anchored flow; this plan turns that result into tested product
behavior. Frosted's Store listing also advertises deliberate feedback sharing,
but this feature's primary evidence is the project's own completed spike.

## Current state

- background.js:13 defines only `ss-add-phrase` and `ss-block-author`.
  The onInstalled listener rebuilds menus; the onClicked handler receives
  `(info, _tab)`. New report dispatch must use the actual clicked tab.
- content.js:342 validates `sender.id !== chrome.runtime.id` before its
  message switch. There is no reportMissedSpam case at this revision.
- content.js:1032 gates the existing report button with `if (textNode)`.
  Its payload is built from a capped excerpt:
  ```js
  const excerpt = (textNode ? textNode.textContent : "").trim().slice(0, 600);
  const language = info && info.id ? info.id.split("-")[0] : "custom";
  ```
  Lines are Trigger, Pattern language, blank, excerpt, blank, LinkedIn page.
  It copies via clipboard/copyFallback and opens the missed_spam_pattern.yml
  GitHub issue form. It never submits an issue.
- shared/post-container.js exposes SS_findPostContainer; plan 059 now selects
  comment containers instead of hiding the parent post. Preserve that boundary.
- tests/extension-smoke.js:779 exercises the existing report's clipboard path.
  tests/helpers.js supplies getExtensionId and sendTabMessage utilities.
- Archived 049:208 records the selection → background message → content
  container → clipboard → issue-tab prototype. It caps excerpts at 600,
  marks unmatched reports with literal `Pattern language: none`, and notes
  the issue tab steals focus. Its old raw-anchor-text fallback must be
  corrected to use the actual selected text when no container is found.

## Project contracts

Vanilla JavaScript MV3 extension, Chrome and Firefox, no build step or runtime
dependencies. Shipped scripts use strict-mode IIFEs; shared/pattern-data.js is
UMD with browser globals and Node exports. Do not change runtime requests,
permissions (`storage` and `contextMenus`), matching defaults, or persisted
signature hashes. UI uses `SS_t("key")` (`t` in background.js); each new
shipped key belongs in both EN and ES. FR/PT/DE UI locales remain deferred by
docs/i18n-audit.md, separately from the five detection languages.

Retain data-ss-ph placeholders and recovery. Match the existing safe DOM
pattern: `button.textContent = SS_t("show")`, listener, then
`placeholder.appendChild(button)` (content.js:1016). Preferences use
SS_CONSTANTS in shared/constants.js, runtime state stays local. Do not
consolidate the background worker's private t/uid/byte helpers. Packaging is
a fixed list; plans, research artifacts and tests must stay out of the zip.

## Scope

Only edit background.js, content.js, both EN/ES messages.json files,
tests/extension-interactions.js, tests/extension-smoke.js,
tests/firefox-smoke.js, README.md, AGENTS.md, this plan, and plans/README.md.
On archival only, update this plan's link in
plans/competitor-review-2026-09-13.md; no other comparison edits are in scope.
Existing report helper extraction inside content.js is allowed only to share
the payload/copy behavior. No changes to matching, stats, other menu actions,
manifest permissions, privacy storage, packaging, or unrelated UI.

## Decisions

1. Add a LinkedIn-scoped selection menu `ss-report-missed`, localized as
   reportMissedMenu (EN: Report missed spam; ES: Reportar spam no detectado).
   Send to `tab.id`, never the currently active tab found later. Validate
   the clicked tab/page host and missing tab id before dispatch.
2. Use action reportMissedSpam plus the clicked selection text as fallback.
   Accept only extension-origin messages through the existing sender guard.
   Resolve a nonempty current selection in the document, reject selection
   in editable controls, and pass its anchor through SS_findPostContainer.
   For a recognized post/comment use its text, capped to 600 characters.
   If there is no recognized container, use the selected text, never
   anchor.textContent (which may be an entire unrelated paragraph).
   Do not copy an entire page or expand to a parent post from a comment.
3. Preserve the 049 payload shape, language marker none, and issue-template
   destination. Do not place the excerpt in the URL. Only the user submits
   the GitHub form. Do not save excerpts or introduce a reporting queue.
4. No valid selection: return `{ok:false, reason:"no-selection"}`, leave
   clipboard intact, open no tab. Missing content receiver: no repeated
   navigation or retries. Clipboard failure must have a visible failure or
   selectable-text fallback; never claim copied on failure.
   Document whether ok means prepared or copied; prefer
   `{ok:true,copied:boolean}` for an opened, usable report.
5. Use the existing explicit user gesture. Prove browser activation behavior.
   If window.open is blocked, a single background chrome.tabs.create fallback
   is in scope, but open exactly one destination and preserve sender checks.
   Keep async sendResponse lifetime correct when using callback APIs.

## Commands

| Purpose | Command | Provenance | Expected |
|---|---|---|---|
| Syntax and locale parity | `npm run smoke` | executed at 3986b84 | exit 0 |
| Lint | `npm run lint` | executed at 3986b84 | exit 0 |
| checkJs | `npm run typecheck` | executed at 3986b84 | exit 0 |
| Unit suite | `npm run test:unit` | executed at 3986b84 | exit 0, no failures |
| Unpacked Chromium | `npm run test:extension` | declared in package.json | exit 0 |
| Packaged Chromium | `npm run test:package` | declared in package.json | exit 0 |
| Firefox | `npm run test:firefox` | declared in package.json | exit 0 |

No installation was performed by the advisor. Node 24 is the CI baseline.
Browser suites require their installed browsers/harness prerequisites.
Run smoke first. For research-only work, smoke/lint/typecheck/unit are baseline
checks; browser commands are required only for a browser experiment or the
eventual shipped implementation, not for editing the design document.

## Steps and verification

### 0. Establish baseline

Record branch-start SHA and run the four non-browser checks followed by
test:extension, test:package and test:firefox on the unmodified checkout.
A missing browser prerequisite is a reported baseline issue, not a reason to
silently omit parity testing or to fix unrelated tooling.

### 1. Add registration, dispatch, and bounded extraction

Implement the menu/message contract and extraction rules above. Keep existing
menu entries and the placeholder report working. Add both locale keys.

**Verify:** `npm run smoke`, `npm run lint`, `npm run typecheck` → exit 0.

### 2. Exercise the production flow

Extend tests/extension-interactions.js using the smoke report scenario as the
pattern. Use an ordinary visible mock post and a short partial selection;
assert the recognized post excerpt appears, none is the language marker,
and exactly one correctly targeted issue-form tab opens. Register the page
listener before triggering and refocus the LinkedIn tab before subsequent
actions. Stub external destination navigation so tests don't contact GitHub.

Drive the background onClicked listener in the harness (capture registration
in a focused worker test if native menus cannot be clicked). Merely calling
the content message does not prove dispatch to the clicked tab. Also exercise
the actual content message with the sender guard intact.

Cover: no selection + clipboard sentinel; no container + exact selected-text
fallback; editable control rejection; a comment inside an innocent post;
600-character cap; rejected clipboard; missing receiver; existing placeholder
report still works. Assert report actions never mutate phrases, exclusions,
author lists, counters, or suggestions. For failure tests, verify the error
path is reached rather than accepting a no-op as a pass.

**Verify:** `npm run test:extension` → exit 0 including new scenarios.

### 3. Validate Firefox, package, and document

Add the same bounded selection/report outcome to the existing geckodriver
Firefox harness. Clipboard reads can be platform constrained: report the
limitation, but verify the menu/message path, bounded prepared payload,
destination and no-selection failure without claiming clipboard success
that was not observed. Keep the test destination intercepted/local.
Document the new menu in README and AGENTS (menu-count facts).

**Verify:** `npm run smoke`, `npm run lint`, `npm run typecheck`,
`npm run test:unit`, `npm run test:package`, `npm run test:firefox` → exit 0.

## Done criteria

- [ ] New successful and negative scenarios pass on the specified harnesses.
- [ ] Old report behavior and exact placeholder counts remain covered.
- [ ] No permission/runtime dependency/storage-key changes.
- [ ] `git diff --name-only <branch-start-SHA>..HEAD` and uncommitted diff
      contain only the scope above.
- [ ] `git diff --check` exits 0; plan archived and index row marked DONE.
- [ ] Commit convention: `feat(report): report missed spam from selected text`.
      Do not push, publish, or submit issues.

## STOP conditions

- A reliable selection cannot be obtained without broad page scraping.
- Browser activation requires new permissions or automatic background requests.
- Comment boundary/old report regressions cannot be resolved within scope.
- A declared baseline fails, or a new check fails twice after a reasonable fix.

## Maintenance notes

Any future container change must re-run the selection/comment tests. Keep
payload fields consistent with .github/ISSUE_TEMPLATE/missed_spam_pattern.yml.
A report is a user-authored draft, not a confirmed spam classification.

**Deferred:** Manual hide-once is evaluated separately in 069; do not silently
turn reporting into a blocking action.
