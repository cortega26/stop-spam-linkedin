# Plan 049: Report missed spam from unblocked posts (design + spike)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ffdffab..HEAD -- content.js background.js shared/post-container.js shared/constants.js options/options.js popup/popup.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches background + content message flow; prototype is throwaway)
- **Depends on**: none
- **Category**: direction (design/spike — delivers a design document + throwaway prototype, not shipped code)
- **Planned at**: commit `ffdffab`, 2026-09-07

## Why this matters

False negatives — spam that slips through — are this product's core failure
mode, and today they have no in-feed reporting path. The "Report missed spam"
button only exists on placeholders for posts that were *already blocked*
(`content.js` inside `blockPost()`), so the user holding a missed-spam post
must hand-copy its text, hand-open the GitHub issue template, and hand-fill
keyword/language/page-type fields the extension already knows. That friction
starves the exact funnel (`missed_spam_pattern.yml`, with its
negative-examples field from plan 042) that detection improvements depend on.
This plan designs the missing trigger; a follow-up build plan ships it.

## Current state

The facts the executor needs, inlined:

- The existing report flow (`content.js:967-1000`, inside `blockPost()`):
  ```js
  reportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const excerpt = (textNode ? textNode.textContent : "").trim().slice(0, 600);
    const trigger = textNode ? extractTrigger(textNode.textContent) : "";
    const language = info && info.id ? info.id.split("-")[0] : "custom";
    const payload = [
      "Trigger: " + trigger,
      "Pattern language: " + language,
      "",
      excerpt,
      "",
      "LinkedIn page: " + window.location.href,
    ].join("\n");
    // ... navigator.clipboard.writeText(payload) with copyFallback,
    // then window.open("https://github.com/cortega26/stop-spam-linkedin/issues/new?template=missed_spam_pattern.yml", "_blank", "noopener")
  });
  ```
  Note the shape: 600-char excerpt cap, trigger word, language prefix, page
  URL, clipboard-first, issue opened in a new tab. **Nothing is sent
  automatically** — that guarantee must survive this design (README,
  PRIVACY_POLICY.md).
- The only context menus (`background.js:13-49`): `ss-add-phrase`
  (`contexts: ["selection"]`, writes an exact-mode phrase) and
  `ss-block-author` (`contexts: ["link"]` with LinkedIn
  profile/company/school/showcase `targetUrlPatterns`). There is no report
  menu. `background.js` currently never sends messages *to* tabs — it only
  receives the badge relay (`background.js:52-62`).
- The content script's message listener verifies
  `sender.id === chrome.runtime.id` (`content.js:313-314`). Any new
  background→content message must pass the same check.
- Post-container resolution lives in `shared/post-container.js` (UMD,
  exports `findPostContainer` + strategies; loaded in the content-script
  array before `content.js` per `manifest.json:46`). Trigger extraction is
  `extractTrigger` (`content.js:1218`); clipboard fallback is `copyFallback`
  (`content.js:1225`); toast is `showReportToast` (`content.js:1241`).
- Repo conventions (AGENTS.md): every JS file is a `"use strict"` IIFE;
  storage keys are `ss_`-prefixed in `SS_CONSTANTS`; user-facing strings
  need both `_locales/en` and `_locales/es` keys; no build step; no network
  requests (permissions stay `storage` + `contextMenus`).

## Commands you will need

| Purpose   | Command                  | Provenance | Expected on success |
|-----------|--------------------------|------------|---------------------|
| Smoke     | `npm run smoke`          | executed   | exit 0              |
| Lint      | `npm run lint`           | executed   | exit 0              |
| Typecheck | `npm run typecheck`      | executed   | exit 0              |
| Unit      | `npm run test:unit`      | executed   | 63/63 pass          |
| Ext e2e   | `npm run test:extension` | declared   | exit 0              |

## Scope

**In scope** (prototype may touch; design must decide):
- `background.js` (third context-menu item + click handler)
- `content.js` (new message case + selection-anchor → container → payload flow)
- A design deliverable appended to this file (see Step 3)

**Out of scope** (do NOT touch):
- `manifest.json` permissions — if the design needs anything beyond
  `storage` + `contextMenus`, that is a STOP condition, not a change to make.
- Any automatic submission of reports (clipboard + user-opened tab only).
- An "and also block it now" action in the same flow — explicitly deferred
  (see Maintenance notes).
- `STORE_ASSETS.md`, badges, release files.

## Git workflow

- Branch: `advisor/049-missed-spam-report-spike` (prototype is throwaway: do
  NOT merge; the design doc is the deliverable)
- Commit style: conventional-ish, e.g. `spike(049): prototype selection-anchored missed-spam report` (cf. `git log --oneline` spike prefixes)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run Smoke, Lint, Typecheck, Unit on the unmodified checkout; confirm the
expected results above. If a `declared` command fails here, STOP and report
(broken baseline, not your regression).

**Verify**: all four executed commands pass as tabled.

### Step 1: Read the surfaces the prototype will wire together

Read in full before designing: `shared/post-container.js` (export names and
the `findPostContainer` signature/config), `content.js:313-330` (message
listener shape), `content.js:1218-1260` (`extractTrigger`, `copyFallback`,
`showReportToast`), `background.js:65-124` (click-handler storage patterns),
and the issue template `.github/ISSUE_TEMPLATE/missed_spam_pattern.yml`
(field ids the payload should map to: post_text, keyword, language,
page_type).

**Verify**: `npm run smoke` → exit 0 (no changes yet).

### Step 2: Prototype the flow on the spike branch

Proposed shape (validate, don't assume): a third menu
(`ss-report-missed`, `contexts: ["selection"]`, mirroring `ss-add-phrase`)
whose click handler calls `chrome.tabs.sendMessage(tab.id, { action:
"reportMissedSpam" })`; the content script resolves
`window.getSelection().anchorNode` → `findPostContainer` → excerpt (same
600-char cap) + `extractTrigger` + page URL, builds the plan-042 payload
with a `"none"`-style language marker for "no pattern matched", copies it,
toasts, and opens the same issue template. Clipboard and `window.open` must
stay in the content script (service workers have no reliable clipboard).

**Verify**: manual e2e against the mock feed in `tests/helpers.js` pattern —
select text in an unblocked post, click the menu, confirm clipboard payload
+ opened URL. `npm run lint` + `npm run typecheck` → exit 0.

### Step 3: Write the design deliverable (append to this file)

Append `## Design deliverable (spike output)` covering: the verified message
flow (or the corrected one if the proposal was wrong), payload field mapping
to the template, menu title + the two locale keys it will need (en+es),
excerpt-cap and language-marker decisions, what happens with no selection /
no container found, the e2e scenario the build plan must add (extend
`tests/extension-interactions.js`, which holds 14 scenarios), and open
product questions. Include the privacy sentence: clipboard + user-opened tab
only, no new permissions, no network requests.

**Verify**: `npm run smoke` → exit 0; `git status` shows only this plan file
modified plus the unmerged spike branch (reset the working tree to the base
commit after appending, per the 041/043 precedent).

## Test plan

The spike needs no committed tests; the design must specify the build plan's
tests: one e2e scenario (selection-anchored report on an unblocked mock post
asserts clipboard payload contains Trigger + page URL and the issue URL
opens), modeled on the plan-019 report scenario in
`tests/extension-interactions.js`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 / pass
- [ ] This file contains the appended design deliverable with flow, payload mapping, locale-key names, and build-plan test spec
- [ ] Prototype commits (if any) live only on `advisor/049-*-spike`, not merged; working tree otherwise clean apart from this file
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The design requires a manifest permission beyond `storage` + `contextMenus`.
- `chrome.tabs.sendMessage` to the LinkedIn tab is unavailable in this
  architecture (then the trigger must move — e.g. a content-script-only
  affordance — which changes the design).
- `window.getSelection().anchorNode` cannot be mapped to a container with
  the existing `findPostContainer` (then the design needs a new resolution
  strategy, not a tweak).
- The code at the cited locations doesn't match the excerpts (drift).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a future "block it now from the report flow" action is proposed, it is
  a separate product decision (auto-adding exact-mode phrases reintroduces
  the starter-pack FP amplifier the maintainer accepted only as opt-in).
- A reviewer of the follow-up build should scrutinize the no-selection and
  cross-origin edge cases and confirm no new permission was snuck in.
- **Deferred:** offering add-as-phrase inside the report flow — unblocked by
  nothing, just out of scope here.

## Design deliverable (spike output)

> Merged here by the reviewer on 2026-09-07 from the spike branch
> `advisor/049-missed-spam-report-spike` (commit `df33bda`, worktree
> `/tmp/opencode/wt-049`; prototype throwaway, do NOT merge). Reviewer corrections to the plan text above:
> the plan-019 report scenario lives in `tests/extension-smoke.js`
> (~lines 779-831), not `tests/extension-interactions.js`; and the
> interactions file holds ~17 scenario blocks, not 14. Both are corrected
> in §6 below; nothing else in the plan needed revision.

Spike branch: `advisor/049-missed-spam-report-spike` (throwaway prototype —
`background.js` + `content.js` only; do NOT merge). All claims below were
verified on that branch; see "Spike evidence" at the end.

### 1. Verified message flow

```
User selects text in unblocked post, right-clicks
  → context menu "ss-report-missed" (contexts: ["selection"])
  → background.js onClicked(info, tab)
  → chrome.tabs.sendMessage(tab.id, { action: "reportMissedSpam" })
  → content.js onMessage case "reportMissedSpam"
      (passes the existing sender.id === chrome.runtime.id check —
       the sender is our own service worker)
      → window.getSelection().anchorNode
      → SS_findPostContainer(anchor, CONFIG, POST_SELECTORS)
      → excerpt (600-char cap) + extractTrigger + page URL
      → navigator.clipboard.writeText(payload), copyFallback on failure
      → showReportToast(reportCopied | reportFailed)
      → window.open(<issue template URL>, "_blank", "noopener")
      → sendResponse({ ok: true } | { ok: false, reason })
```

This is the flow the plan proposed, and the spike confirms it works
unmodified. Two facts worth knowing:

- This is the FIRST background→content message in the extension
  (`background.js` previously only received the badge relay). No new
  permission is needed: `chrome.tabs.sendMessage` to our own content
  script requires no `"tabs"` permission, and `tab.id` comes free with
  the `onClicked` event. `manifest.json` stays at
  `permissions: ["storage", "contextMenus"]` (untouched in the spike).
- Clipboard and `window.open` MUST stay in the content script (service
  workers have no reliable clipboard), as the plan predicted. Both were
  observed working from the message handler in headed Chromium:
  `navigator.clipboard.writeText` succeeded with the page focused, and
  `window.open` opened the issue-template tab (no popup-block observed).
  The non-gesture failure path (writeText reject → `copyFallback` →
  `reportFailed` toast) is inherited unchanged from the placeholder
  flow; failure semantics are identical to the existing report button.

### 2. Payload field mapping to `missed_spam_pattern.yml`

The payload keeps the exact 6-line shape of the placeholder report
(`content.js` `blockPost()`), so maintainers triage both report kinds
identically. Line → template-field mapping:

| Payload line              | Template field (`id`) | Notes                                    |
|---------------------------|-----------------------|------------------------------------------|
| `Trigger: <word>`         | `keyword`             | From `extractTrigger` (unchanged helper) |
| `Pattern language: none`  | `language`            | Literal `none` — see §4                  |
| (blank)                   | —                     | separator                                |
| `<excerpt, ≤600 chars>`   | `post_text`           | Container text, not just the selection   |
| (blank)                   | —                     | separator                                |
| `LinkedIn page: <url>`    | `page_type`           | Maintainer infers Feed/profile/etc.      |

`negative-examples` (plan 042) stays user-filled — nothing on the page
can supply known-good counter-examples.

### 3. Menu title + locale keys

One new key, in BOTH locale files (repo convention — a key must exist in
`_locales/en/messages.json` AND `_locales/es/messages.json`):

- Key: `reportMissedMenu`
- en: `"Report missed spam"`
- es: `"Reportar spam no detectado"`

Strings deliberately mirror the existing `reportMissed` button strings,
but it is a DEDICATED key so the menu title and the placeholder button
can diverge later (e.g. adding an ellipsis or "…(selection)"). Reusing
`reportMissed` directly was considered and rejected for that coupling
reason; cost is one key × two files. The spike prototype calls
`t("reportMissedMenu")` with no locale entries yet (falls back to the
key text) — the build plan MUST add both locale entries; `npm run smoke`
validates the JSON.

Background registration mirrors `ss-add-phrase`:

```js
createMenu({
  id: "ss-report-missed",
  title: t("reportMissedMenu"),
  contexts: ["selection"],
});
```

### 4. Excerpt-cap and language-marker decisions

- **Excerpt cap: 600 chars, unchanged.** Consistency with the placeholder
  flow beats per-flow tuning; the GitHub textarea has no hard limit and
  600 chars hold the call-to-comment wording plus offer text in all five
  detection languages.
- **Language marker: literal `none`** (`Pattern language: none`). The
  placeholder flow emits the matched pattern's language prefix (`EN`, …)
  or `custom` for user phrases. A missed-spam report means NO pattern
  matched, so neither applies: `custom` would wrongly imply a user
  phrase, while `none` is greppable and unambiguous in triage. Verified
  in the spike clipboard output (see §7).

### 5. Edge cases: no selection / no container

| Situation | Behavior (spike-verified where marked) |
|---|---|
| No selection (`getSelection()` null or `anchorNode` null, or resolved text empty) | `showReportToast(t("reportFailed"), true)`; `sendResponse({ ok: false, reason: "no-selection" })`; NO tab opened; clipboard untouched ✅ verified (clipboard sentinel preserved, zero new tabs) |
| Anchor found but `SS_findPostContainer` returns null | Fall back to the raw selection text (`anchor.textContent`) as the excerpt. Rationale: a partial report beats no report on layouts the heuristics don't cover (e.g. new profile DOM). If the fallback text is also empty → the no-selection path above |
| `anchorNode` is an Element, not a Text node | Works: `findPostContainer` only uses `.parentElement` and walks ancestors, so Elements resolve the same way. (Spike probe used a Text anchor; Element anchors ride the identical walk.) |
| Selection spans multiple posts | Anchor (selection start) wins; the report covers the anchor's post. Documented limitation, matches "selection-anchored" semantics |

STOP-condition checks from the plan, all cleared: (a) no permission
beyond `storage` + `contextMenus` is needed; (b) `chrome.tabs.sendMessage`
to the LinkedIn tab works (the spike's trigger IS that call);
(c) `anchorNode` maps through the existing `findPostContainer` — an
8-char partial selection yielded the FULL post excerpt, proving the
container path engages rather than the selection-text fallback.

### 6. E2E scenario the build plan must add

Add ONE scenario to `tests/extension-interactions.js` (the file holding
the interaction scenarios), modeled on the plan-019 report scenario —
note: the plan-019 scenario actually lives in `tests/extension-smoke.js`
lines ~779-831 ("Report missed spam": click placeholder button, grant
`clipboard-read`/`clipboard-write` on the LinkedIn origin, read back
`navigator.clipboard.readText()`, assert excerpt + `Trigger:` +
`Pattern language:` + `LinkedIn page:`). The new scenario mirrors it
with three differences:

1. Setup: unblocked `clean-1` mock post (whitelist `trusted` as in the
   smoke file); select a substring via `page.evaluate` range selection
   (the spike used an 8-char range — assert the FULL post text lands on
   the clipboard to pin the container-resolution behavior of §5).
2. Trigger: real right-click → menu click is not reliably drivable
   headless; drive the production path one layer down via
   `sendTabMessage(context, { action: "reportMissedSpam" })` (the exact
   call the background handler makes) AND assert the menu registration
   path by code inspection (menu id `ss-report-missed`,
   `contexts: ["selection"]` in `background.js`). Assert response
   `{ ok: true }`.
3. Assertions: clipboard contains the post excerpt, `Trigger: `,
   `Pattern language: none`, `LinkedIn page: https://www.linkedin.com`;
   a new tab opens to `.../issues/new?template=missed_spam_pattern.yml`
   (listen on `context "page"` BEFORE triggering). Then: close the issue
   tab, refocus the feed (`page.bringToFront()` — the issue tab steals
   `active` status and a naive `tabs.query({active:true})` would target
   the GitHub tab, which has no content script), clear the selection,
   re-trigger, assert `{ ok: false }` and no further tab opens.

The focus-steal trap in (3) bit the spike script itself and MUST be in
the build plan's test or it will flake.

### 7. Spike evidence (throwaway scripts, NOT committed)

- `/tmp/opencode/spike-049-verify.js`: full flow — selection in
  `clean-1` → `sendTabMessage(reportMissedSpam)` → `{ok:true}`,
  258-byte clipboard payload (`Trigger: This ordinary professional
  update should...` / `Pattern language: none` / full excerpt /
  `LinkedIn page: https://www.linkedin.com/feed/`), issue-template tab
  opened; no-selection edge → `{ok:false, reason:"no-selection"}`,
  clipboard preserved, no tab. Result: PASSED.
- `/tmp/opencode/spike-049-probe2.js`: 8-char partial selection
  → clipboard held the FULL paragraph → container path engaged.
  Result: PASSED.
- `npm run lint`, `npm run typecheck`, `npm run smoke` → exit 0 on the
  spike branch; `npm run test:unit` 63/63 at baseline. Reviewer re-ran
  smoke/lint/typecheck/unit in the worktree — all green.

### 8. Open product questions (for the maintainer, not the build plan)

1. Should the report flow ALSO offer "block this post now" (add an
   exact-mode phrase)? Explicitly deferred per plan scope — but expect
   users to ask, since they just identified spam. Any such action must
   stay opt-in per click (the starter-pack FP concern).
2. `window.open` needs no gesture in tested Chromium, but if a future
   popup-blocker change blocks it, the fallback is `chrome.tabs.create`
   from the background handler (no gesture needed, no new permission) —
   at the cost of splitting tab-opening across two files. No action now.
3. The `Trigger:` line on missed spam is a guess by `extractTrigger`
   (first quoted phrase or 40-char prefix), not a matched pattern.
   Triage should treat it as a hint; consider renaming to
   `Suspected trigger:` in a later pass — NOT in the build plan (keeps
   both report shapes identical).

### Privacy

Clipboard + user-opened tab only. No new permissions (`storage` +
`contextMenus` unchanged), no network requests by the extension (the
only navigation is the user-visible GitHub issue tab the user chose to
open), nothing submitted automatically — the user reviews and pastes
into the form themselves.

### Interaction with plan 048 (shared-helper consolidation)

Plan 048 (unmerged branch `advisor/048-shared-helpers` at review time;
check the index row for merge status) renames local `t(...)` calls to
`SS_t(...)` in `content.js`. The spike is based on the pre-048 tree and
uses the LOCAL `t(...)`. The BUILD plan must be rebased onto whichever
tree lands first: if 048 merges first, the new `reportMissedSpam` case
and any touched lines must call `SS_t(...)`.
