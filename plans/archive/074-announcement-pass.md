# Plan 074: Announce async UI outcomes to assistive technology

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3aef7b9..HEAD -- options/options.html options/options.js popup/popup.html popup/popup.js content.js tests/extension-interactions.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: the 064 tester-explanations BUILD (proceed verdict
  recorded at `3aef7b9`, build plan not yet written — see STOP conditions;
  static surfaces below are independent of it) · serial discipline: after
  072/073 (shared options/locales/test files)
- **Category**: direction
- **Planned at**: commit `3aef7b9`, 2026-09-14

## Why this matters

Three independent research verdicts (064, 065, 066) each list
"screen-reader announcement order needs a manual assistive-technology
pass" under remaining unknowns — and the gap is real today, not just for
their future surfaces: the options toast (the feedback channel for every
add/delete/import/allow action) has no live region at all, the first-run
banner and in-feed placeholder actions announce nothing, and the popup's
loading/connection states were never audited. Screen-reader users
currently perform state-changing actions and hear silence. This plan adds
the missing roles/live-regions and pins them with accessible-tree
assertions. A full manual screen-reader session is recorded as deferred
follow-up (it cannot be machine-checked); everything else here is
verifiable in CI.

## Current state

The facts the executor needs, inlined:

- **Options toast is announcement-silent** (`options/options.html:629`):
  `<div id="toast"></div>` — no `role`, no `aria-live`. Controller
  (`options/options.js:279-288`) sets `textContent` + a `show` class on a
  2500 ms timer (`options.js:52` handle, `beforeunload` cleanup at
  `options.js:142`). Every `showToast(SS_t(...))` call site (add,
  delete, edit, allow, import, storage-failure paths) inherits the gap.
- **One live region exists** (`options/options.html:554`): tester
  result `<div class="tester-result" id="testResult"
  aria-live="polite"></div>`, written by `runTester`
  (`options/options.js:1777-1811`). The 064 build WILL restructure this
  area (explanation branches, possibly new kinds) — see dependency/STOP.
- **In-feed surfaces**: placeholder action buttons are real `<button>`
  elements (`content.js:911 notSpamBtn`, `945 unblockBtn`, `971
  whitelistBtn`, `1001 blockBtn`, `1033 restoreBtn`, `1049 reportBtn`)
  with text content (keyboard-operable — proven by the 069 probe's
  keyboard-Enter case), but block/restore swaps announce nothing; the
  first-run banner (`content.js:1260-1291`, `textContent` + inline
  styles, 5000 ms self-remove) has no role. Placeholder CSS lives near
  `content.js:164-170`.
- **Popup states to inventory** (executor reads; not pre-verified):
  `popup/popup.js:20-23` handles `noConnection`, `mainContent`,
  `loadingState`, `connectionNotice` (`showConnectionState` at
  `popup.js:179`). Check `popup/popup.html` for which are visible-walled
  vs announced; fix only what the audit finds.
- **Good patterns already in-tree** (match, don't invent):
  `aria-label`/`title` on icon-ish buttons (`options.html:534-535`,
  `540-543`, `552-553`), `aria-hidden="true"` on decorative SVG
  (`options.html:514`), `autocomplete="off"` + labels on inputs.
- **Repo conventions:** `"use strict"` IIFEs; locale keys in EN+ES with
  smoke parity (this plan should need ZERO new locale keys — attribute
  values reuse existing strings or are non-localized ARIA roles; if you
  think you need one, treat it as a STOP and re-read the scope);
  conventional-ish commits; e2e in `tests/extension-interactions.js`
  via the `tests/helpers.js` harness.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke | `npm run smoke` | declared | exit 0 |
| Lint | `npm run lint` | declared | exit 0 |
| Typecheck | `npm run typecheck` | declared | exit 0 |
| Unit | `npm run test:unit` | declared | all pass (81 at `3aef7b9`) |
| Extension e2e | `npm run test:extension` | declared | both scripts exit 0 |
| Packaged e2e | `npm run test:package` | declared | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `options/options.html` (toast role; tester-result verification only —
  see STOP)
- `popup/popup.html` (only what the Step 1 audit finds missing)
- `content.js` (placeholder/banner announcement attributes ONLY —
  no behavior, no copy, no styling changes)
- `tests/extension-interactions.js` (accessible-tree assertions)

**Out of scope** (do NOT touch, even though they look related):
- `options/options.js` tester logic (`testerFindMatch`/`runTester`,
  `options.js:1763-1811`) — owned by the 064 build. If the 064 build
  has landed and the tester DOM differs from `options.html:549-555`,
  STOP (see below) — do not rework explanations here.
- Unbuilt 065/066 surfaces (import preview, selective export) — no DOM
  exists yet; record them as covered-by-construction follow-up in
  Maintenance notes, not work here.
- Visual redesign, focus-trap dialogs, keyboard-shortcut additions,
  focus-management overhauls — announcement wiring only.
- `background.js`, `shared/*`, locale files, `manifest.json`
  (no new strings, no new permissions).

## Git workflow

- Branch: `advisor/074-announcements`
- Commit per step; message style: conventional-ish, e.g.
  `fix(a11y): announce toast and placeholder outcomes to screen readers`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline + check the 064 build status

Run smoke, lint, typecheck, unit. Then check whether the 064
tester-explanations build has landed: `git log --oneline --all | grep
-i "064\|tester-explanation"` and diff `options.html:549-555` against
this plan's excerpt.

- If the tester area matches lines 549-555 exactly: proceed fully.
- If it differs (064 build landed): the tester-result assertions in
  Step 3 are VOID — complete Steps 1–2 + 4 for the static surfaces
  only, and record "tester assertions await re-baselining against 064"
  in the commit message and Maintenance notes. Do NOT adapt to the new
  tester DOM by guessing at 064's semantics.

**Verify**: gates green; 064-landed-or-not recorded in writing before
any edit.

### Step 1: Audit (read-only) and list the gaps

Open `options/options.html` (toast, tester, import hint, suggestion
and exclusion sections), `popup/popup.html` + `popup.js:179-200`
(connection/loading render), and `content.js:900-1070` (all six
placeholder buttons + restore/report). Produce the gap list (expect ~
4–6 items: options `#toast` role; banner role; placeholder action
announcements; popup loading/connection; anything with
`display:none` + content swaps that a screen reader would miss).
Post the list in the commit message of the fix commit (one line per
item with file:line) so review is traceable.

**Verify**: gap list written; zero files modified yet (`git status`
clean apart from untracked plan work).

### Step 2: Minimal announcement wiring

Apply the smallest change per gap, following in-tree patterns:

- Options `#toast`: add `role="status"` (implicit `aria-live=polite`;
  matches the existing polite tester region; no JS change — the
  `textContent` swap in `showToast` becomes the announcement).
- First-run banner (`content.js:1269-1290`): add `role="status"` to the
  created div (one property line; same polite level).
- Placeholder actions: prefer *no new live regions* — ensure each
  button's accessible name is its visible text (assert, don't assume)
  and that post-swap states (blocked → shown, author-block variant)
  move or keep focus sanely WITHOUT inventing focus management: if a
  clicked button is removed from the DOM, move focus to its surviving
  sibling action or the placeholder container (`tabindex="-1"` on the
  container only in that case). If even that proves fiddly in the
  harness, record it as deferred rather than shipping cleverness.
- Popup: `role="status"` on the connection notice if it is a
  dynamically-shown text swap; leave statically-present labelled
  controls alone.

Rules: no new locale keys (roles and `tabindex` are not localized);
no visual change (assert computed styles unchanged in e2e where
feasible); no behavior change (every existing test must pass
unmodified).

**Verify**: `npm run lint` + `npm run typecheck` exit 0; `git diff`
shows attribute-only hunks (plus at most the single focus line).

### Step 3: Accessible-tree e2e assertions

In `tests/extension-interactions.js`, add scenarios using Playwright's
accessible-tree locators (`getByRole("status")`, `getByRole("button",
{ name })`): options toast announces on phrase add; tester result
region present with polite liveness (STATIC assertion only — skip if
Step 0 found the 064 build landed); placeholder buttons expose their
visible-text names; popup connection notice role where added. Model on
the existing options-page scenarios in the same file.

**Verify**: `npm run test:extension` exits 0 with the new assertions
included; `npm run test:package` exits 0.

## Test plan

- New e2e assertions (Step 3) — the coverage; accessible-role queries
  are the machine-checkable proxy for announcements (CI cannot hear a
  screen reader, and this plan is honest about that).
- Full existing suites unmodified and green (no-behavior-change proof).
- Manual screen-reader session (NVDA + VoiceOver, options add-flow,
  placeholder Show/Not-spam, popup states) → explicitly DEFERRED
  (maintainer PASS needed; executor environments cannot do it
  meaningfully). See Maintenance notes for the exact deferred line.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` all pass
- [ ] `npm run test:extension`, `npm run test:package` exit 0 including
  the new accessible-tree assertions
- [ ] `git diff --name-only 3aef7b9...HEAD` lists only: `options/*.html`,
  `popup/popup.html`, `content.js` (attribute/focus lines only),
  `tests/extension-interactions.js`, `plans/README.md`
- [ ] This plan adds zero locale keys itself: `git diff
  3aef7b9...HEAD -- _locales/` shows no hunks authored by this plan
  (totals may read 176 if 072 landed first, or move via the 064 build —
  what matters is this plan's own diff on locale files is empty)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match live code (drift —
  especially 072/073 or pending builds touching options/popup/content).
- Step 0 shows the 064 build landed with a restructured tester area:
  void ONLY the tester assertions (proceed with static surfaces +
  record the re-baselining debt). Do not improvise 064 semantics.
- Any gap appears to need a new locale string, a behavior change, or
  focus architecture — record it as deferred, don't expand scope.
- A step's verification fails twice after a reasonable fix attempt.
- The change appears to require touching background.js, shared files,
  locales, or the manifest.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Deferred:** manual screen-reader pass (NVDA + VoiceOver over the
  options add-flow, placeholder Show/Not-spam/Block-author, popup
  connection states, and — once built — the 064 explanations + 065
  preview + 066 selection surfaces); unblocked by nothing but human
  time with AT. Revisit the politeness level (`polite` vs `assertive`)
  for storage-failure warnings during that pass.
- **Deferred:** tester-result assertion re-baselining if skipped per
  Step 0 — owned by whoever lands the 064 build second.
- If a future surface adds async feedback (any new toast/banner), its
  plan must include the `role="status"` line + a `getByRole` assertion
  by default — make this the standing expectation, not a re-discovery.
- Reviewers should scrutinize: any `tabindex` addition (must be `-1`
  and script-focused only, never `0` on a div), and any assertion that
  passes against `display:none` content (vacuous — assert visibility
  first).
