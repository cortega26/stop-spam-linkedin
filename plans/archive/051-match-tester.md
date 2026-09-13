# Plan 051: Add a "would this be blocked?" match tester to the options page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- options/options.html options/options.js shared/pattern-data.js shared/constants.js content.js _locales/en/messages.json _locales/es/messages.json tests/extension-interactions.js types/globals.d.ts eslint.config.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Exception: if the only changes are
> plan 056's allow-phrase additions, that is expected — Step 2b covers it.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (additive options-page UI; no detection-path changes)
- **Depends on**: none hard; **soft: run AFTER plan 056** (allow-phrases),
  so the tester can report pardons (Step 2b); **run BEFORE plan 050** (this
  plan adds EN/ES-only locale keys — see STOP conditions)
- **Category**: direction (build — small, decided shape)
- **Planned at**: commit `ffdffab`, 2026-09-07; refreshed in place at
  `4f80330` (2026-09-13) after the plan-048 merge — every line citation
  re-verified, Step 1's extract-vs-mirror question resolved (048 added no
  shared match helper), allow-phrase reporting added (Step 2b), scope check
  switched to `main...HEAD`, locale-ordering STOP added

## Why this matters

Custom phrases are authored blind. The options page offers add, exact-vs-
contains toggle, starter pack, and import/export — but no way to ask "would
this text be hidden by my current settings?" Users discover bad phrases by
watching real posts disappear, and the cost lands in the maintainer's lap as
false-positive reports (`.github/ISSUE_TEMPLATE/false_positive.yml`). A
paste-text → shows-the-matching-pattern box turns that into a try-before-
you-hide loop and gives FP reporters a self-serve diagnostic. It is purely
local and reuses the already-shared pattern assembly.

## Current state

The facts the executor needs, inlined (verified at `4f80330`):

- The match pipeline to mirror (`content.js:521-527`):
  ```js
  function findMatch(text) {
    if (excludedSignatures.has(SS_getExcludedSignature(text))) return null;
    for (const entry of spamPatterns) {
      if (entry.regex.test(text)) return entry;
    }
    return null;
  }
  ```
  where `spamPatterns` is assembled via the shared `SS_buildPatterns`
  (`shared/pattern-data.js:98-150`, JSDoc included — read it). It returns
  `{regex, label, source, id?}` entries: built-ins carry stable ids
  `EN-1`…`DE-2` plus `source: "builtin"`, custom phrases carry
  `source: "custom"`, and custom phrases come FIRST (line 150:
  `return [...custom, ...builtin];`). `findMatch` itself is
  content-script-local — that is the gap.
- Where content.js feeds `SS_buildPatterns`: the initial read at
  `content.js:207` and the storage-change rebuilds at `content.js:260`,
  `:267`, `:271`. Inputs are stored custom phrases (`ss_phrases`), enabled
  langs (`ss_enabled_langs`), disabled pattern ids
  (`ss_disabled_patterns`), and `LIMITS.MAX_PHRASE_LENGTH`; exclusions come
  from `ss_excluded` via `SS_normalizeExcludedEntries`. All of these live in
  `chrome.storage.sync`, which the options page can read.
- **Plan 048 is merged** (merge commit `4f80330`) and did NOT add a shared
  match helper. `shared/pattern-data.js`'s export block (`root.SS_*`
  assignments, lines 513-534) provides `SS_buildPatterns`,
  `SS_getExcludedSignature` and `SS_normalizeExcludedEntries`, but nothing
  equivalent to `findMatch`. Step 1 therefore resolves to mirroring.
- Placement anchor (`options/options.html:502-522`): the add-row
  (`#phraseInput` + `#addBtn`, lines 502-505), the action-bar (import /
  export / starter-pack buttons, 508-513), the import hint (`#importHint`,
  516), then the language-toggles section (519-522). The tester section goes
  **after the import hint and before the language toggles**, as a
  `lang-section` div reusing existing styles (section headings are
  `<div class="lang-section-title">`, not `<h2>`).
- Validation precedent: `handleAdd` (`options/options.js:249-290`) — length,
  case-insensitive duplicate, quota checks. Tester input needs none of that
  (it never stores), but result rendering should reuse the popup's match
  display precedent (`popup/popup.js:213-214`):
  ```js
          match.className = "lb-match";
          match.textContent = SS_t("matchedLabel") + " " + item.label;
  ```
- If you add a new `SS_*` global (this plan should not need one), it must be
  listed in `eslint.config.js`'s browser globals block (lines 30-55) and
  declared in `types/globals.d.ts`, or lint/typecheck fail.
- Repo conventions (AGENTS.md): `"use strict"` IIFEs; `SS_*` shared
  exports; new user-facing strings need en+es locale keys; options page
  renders via `render()`-style functions; no build step.

## Commands you will need

| Purpose   | Command                  | Provenance | Expected on success |
|-----------|--------------------------|------------|---------------------|
| Smoke     | `npm run smoke`          | executed   | exit 0              |
| Lint      | `npm run lint`           | executed   | exit 0              |
| Typecheck | `npm run typecheck`      | executed   | exit 0              |
| Unit      | `npm run test:unit`      | executed   | 64/64 pass (higher after new tests, and higher if 056 landed) |
| Ext e2e   | `npm run test:extension` | declared   | exit 0              |

`executed` rows ran clean at `4f80330` (2026-09-13).

## Scope

**In scope**:
- `options/options.html` (tester section: textarea + button + result div)
- `options/options.js` (tester logic + render wiring)
- `_locales/en|es/messages.json` (tester strings, both files)
- `tests/unit/pattern-data.test.js` (corpus cases through `SS_buildPatterns`) + one e2e scenario in `tests/extension-interactions.js`

**Read-only** (read, do not modify): `shared/pattern-data.js`,
`shared/constants.js`, `content.js`, `types/globals.d.ts`,
`eslint.config.js`.

**Out of scope** (do NOT touch):
- `content.js` detection behavior — the tester mirrors it; any divergence found is a bug report in the plan's test output, not a silent fix.
- Extracting `findMatch` into `shared/` — resolved against in Step 1; a half-extraction is worse than the mirror.
- `background.js`, `popup/`, `STORE_ASSETS.md`, badges, release files.

## Git workflow

- Branch: `advisor/051-match-tester`
- Commit per step or logical unit; conventional-ish style, e.g.
  `feat(options): add would-this-be-blocked match tester` (see `git log --oneline`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run all four executed commands on the unmodified checkout; confirm tabled
results. A `declared` failure here is a broken baseline — STOP and report.

**Verify**: smoke/lint/typecheck exit 0; unit 64/64 pass (or the higher
count recorded in plan 056's status row, if 056 landed).

### Step 1: Confirm the mirror premise (read, then proceed — decision is made)

Read `shared/pattern-data.js:98-150` (`SS_buildPatterns`), its export block
(lines 513-534), `content.js:207` / `:260-271` (assembly inputs), and
`content.js:521-527` (`findMatch`). Confirm what "Current state" says: no
shared match helper exists. The decision is then **mirror**: write the
tester's match as a ~10-line local function in `options/options.js` over
`SS_buildPatterns(...)` output plus the `SS_getExcludedSignature` check,
reproducing `findMatch`'s order exactly. Add a `**Deferred:**` line to this
file's Maintenance notes naming the duplication (content.js `findMatch` vs.
the options tester) so `reconcile` can pick it up.

If a shared match helper DOES exist by the time you run this (some later
plan added one), reuse it instead and note that in the commit message.

**Verify**: `npm run smoke` → exit 0; decision recorded in the commit message.

### Step 2: Build the tester UI + logic

Section (after `#importHint`, before the language toggles): a textarea
(`#testInput`), a button (`#testBtn`), a result div (`#testResult`) reusing
`.lang-section` styling. Logic: on click, read **live** storage
(`chrome.storage.sync.get` — not the page's cached state variables, which
can lag a change made in another tab) for phrases, enabled langs, disabled
pattern ids, and exclusions; assemble with `SS_buildPatterns`; run the
Step 1 match function over the textarea text; render either the matched
entry's label + source (built-in id like `EN-1`, or custom-phrase text) or
the no-match string. Cap the tested text length (e.g. 5000 chars) before
matching. New locale keys in BOTH locale files (e.g. `testerTitle`,
`testerPlaceholder`, `testerButton`, `testerNoMatch`, reusing existing
`matchedLabel` for the hit line).

Wire into the existing options render flow without breaking `render()`'s
single-render guarantee (plan 030) — the tester result must not be
re-rendered or cleared by `render()`.

**Verify**: `node --check options/options.js && npm run lint && npm run typecheck` → exit 0.

### Step 2b: Report allow-phrase pardons (only if plan 056 landed)

Check: `grep -n "ALLOW_PHRASES" shared/constants.js`.

- **No match** (056 not landed): skip this step, and add a line to this
  file's Maintenance notes:
  `**Deferred:** report allow-phrase pardons — unblocked by plan 056.`
- **Match** (056 landed): the tester must mirror 056's precedence exactly.
  Read `content.js`'s live `findMatch` first — after 056 it checks
  allow-phrases immediately after the exclusion check and before the
  pattern loop. In the tester:
  1. also read `STORAGE_KEYS.ALLOW_PHRASES` in the same live `sync.get`;
  2. compile with `SS_buildAllowMatcher(allowPhrases, LIMITS.MAX_PHRASE_LENGTH)`;
  3. check them in the same position as `findMatch`;
  4. when one matches, render a distinct verdict naming the phrase — new key
     `testerAllowed` in BOTH locale files, EN:
     `Would NOT be hidden — allowed by: "$1"` — rather than the no-match
     line. This distinction is the point: an allowed post and an unmatched
     post are different answers to a user debugging a false positive.

**Verify**: `npm run lint && npm run typecheck` → exit 0.

### Step 3: Unit tests for the match path

The tester's match function is local to the options IIFE (Step 1), so it
has no unit seam. Test the shared inputs it depends on instead, in
`tests/unit/pattern-data.test.js` style (the existing file is the pattern):
through `SS_buildPatterns` output, a built-in hit resolves to its id, a
custom hit resolves to `source: "custom"` and wins over an overlapping
built-in (custom-first ordering), and an excluded-signature text is caught
by `SS_getExcludedSignature`. If Step 2b ran, add one case proving an
allow-phrase matcher from `SS_buildAllowMatcher` covers text that a custom
phrase also matches. The faithfulness of the local function itself is
proven end to end in Step 4.

**Verify**: `npm run test:unit` → all pass including the new tests.

### Step 4: e2e + full verification

Add one options-flow scenario to `tests/extension-interactions.js`
(following an existing options scenario as structure): set a custom phrase,
paste matching text into the tester, assert the hit line names the phrase;
paste benign text, assert no-match. If Step 2b ran, also seed an
allow-phrase covering a spam text and assert the `testerAllowed` verdict
names it. Then run everything:

```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension
```

**Verify**: all green, including the new scenario.

## Test plan

- New unit tests (Step 3) for built-in hit / custom hit + custom-first
  overlap / excluded signature (+ allow-phrase overlap if 056 landed).
- New e2e scenario (Step 4) driving the real options page, including the
  allowed verdict when 056 landed.
- Regression net: full `test:extension` proves no existing flow broke.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` passes including the new match tests
- [ ] `npm run test:extension` passes including the new tester scenario
- [ ] Tester verdict agrees with content-script verdict on a probe pair (one spam, one benign — assert in the e2e, not by eye)
- [ ] Every new user-facing string exists in BOTH `_locales/en` and `_locales/es` (key sets equal, symmetric difference empty)
- [ ] Either `grep -n "SS_buildAllowMatcher" options/options.js` returns a match (056 landed) OR this file carries the `**Deferred:**` line from Step 2b (056 not landed)
- [ ] `git diff --name-only main...HEAD -- content.js shared/` returns nothing (mirror, not extraction)
- [ ] `git diff --name-only main...HEAD` (three dots — merge base) lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `_locales/fr/`, `_locales/pt/`, or `_locales/de/` exists (check with
  `ls _locales`). Plan 050 landed first and its parity check requires every
  new key in all shipped locales. Do NOT add FR/PT/DE strings yourself —
  report it so the maintainer can source translations or resequence.
- `SS_buildPatterns`'s signature/shape differs from "Current state" (the mirror premise is wrong).
- Content boot assembles patterns with inputs the options page cannot read (private context) — the tester cannot be faithful; stop rather than shipping an unfaithful tester.
- Plan 056 landed but `content.js`'s `findMatch` does not check allow-phrases before the pattern loop — 056's precedence decision was not implemented as written; report it rather than guessing which order to mirror.
- The tester disagrees with the content script on the probe pair and the cause is a content.js bug — report it, don't fix it here.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If matching semantics change (new pattern sources, new exclusion shapes,
  allow-phrases), the tester's assembly must be updated in lockstep with
  content.js `findMatch` — the probe-pair e2e is the tripwire.
- A reviewer should check the tester reads live storage (not a stale cached copy) and that long pasted texts can't freeze the page (regexes are linear per the 2026-08-14 audit, but the input is capped anyway).
- **Deferred:** the duplicated match logic (content.js `findMatch` vs. the options-page `testerFindMatch` at options/options.js:1578) — recorded per Step 1; a future plan may extract a shared match helper. Unblocked by: a decision to consolidate.
- **Deferred:** tester history/recent-tests — unblocked by nothing, just not worth it now.
