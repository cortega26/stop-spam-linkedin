# Plan 051: Add a "would this be blocked?" match tester to the options page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ffdffab..HEAD -- options/options.html options/options.js shared/pattern-data.js shared/constants.js content.js _locales/en/messages.json _locales/es/messages.json tests/extension-interactions.js types/globals.d.ts eslint.config.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (additive options-page UI; no detection-path changes)
- **Depends on**: none (soft: plan 048 — see Step 1 rule)
- **Category**: direction (build — small, decided shape)
- **Planned at**: commit `ffdffab`, 2026-09-07

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

The facts the executor needs, inlined:

- The match pipeline to mirror (`content.js:536-542`):
  ```js
  function findMatch(text) {
    if (excludedSignatures.has(SS_getExcludedSignature(text))) return null;
    for (const entry of spamPatterns) {
      if (entry.regex.test(text)) return entry;
    }
    return null;
  }
  ```
  where `spamPatterns` is assembled at content-script boot via the shared
  `SS_buildPatterns` (`shared/pattern-data.js`, returns
  `{regex, label, source, id?}` entries — built-ins carry stable ids
  `EN-1`…`DE-2` plus `source: "builtin"`, custom phrases carry
  `source: "custom"`; see `shared/pattern-data.js:105-150`, which you must
  read). `findMatch` itself is content-script-local — that is the gap.
- Placement anchor (`options/options.html:502-516`): the add-row
  (`#phraseInput` + `#addBtn`) followed by the action-bar (import / export /
  starter-pack buttons) and the language-toggles section. The tester section
  goes between the action-bar and the language toggles, as a `lang-section`
  div reusing existing styles (see `.lang-section` / `.lang-section-title`
  in the same file).
- Validation precedent: `handleAdd` (`options/options.js:258-299`) — length,
  case-insensitive duplicate, quota checks. Tester input needs none of that
  (it never stores), but result rendering should reuse the popup's match
  display precedent (`popup/popup.js`: `"lb-match"` span showing
  `matchedLabel + label`).
- `content.js` boot assembles `spamPatterns` from stored phrases + enabled
  langs + disabled pattern ids — **read that assembly call site in Step 1**
  and mirror its inputs (live `chrome.storage` reads, not cached copies) so
  the tester answers for *current* settings.
- Repo conventions (AGENTS.md): `"use strict"` IIFEs; `SS_*` shared
  exports; new user-facing strings need en+es locale keys; options page
  renders via `render()`-style functions; no build step.

## Commands you will need

| Purpose   | Command                  | Provenance | Expected on success |
|-----------|--------------------------|------------|---------------------|
| Smoke     | `npm run smoke`          | executed   | exit 0              |
| Lint      | `npm run lint`           | executed   | exit 0              |
| Typecheck | `npm run typecheck`      | executed   | exit 0              |
| Unit      | `npm run test:unit`      | executed   | 63/63 pass (higher after new tests) |
| Ext e2e   | `npm run test:extension` | declared   | exit 0              |

## Scope

**In scope**:
- `options/options.html` (tester section: textarea + button + result div)
- `options/options.js` (tester logic + render wiring)
- `shared/pattern-data.js` ONLY if Step 1 decides extraction (one exported helper + JSDoc + `module.exports` entry)
- `types/globals.d.ts` + `eslint.config.js` (only if a new `SS_*` global is added)
- `_locales/en|es/messages.json` (tester strings, both files)
- `tests/unit/*.test.js` (new tests) + one e2e scenario in `tests/extension-interactions.js`

**Out of scope** (do NOT touch):
- `content.js` detection behavior — the tester mirrors it; any divergence found is a bug report in the plan's test output, not a silent fix.
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

**Verify**: smoke/lint/typecheck exit 0; unit 63/63 pass.

### Step 1: Decide extract-vs-mirror (read first, then choose)

Read: `shared/pattern-data.js:100-160` (`SS_buildPatterns` signature),
content.js's `spamPatterns` boot assembly (find it by symbol), and
`plans/README.md` row 048 (is the shared-helper consolidation DONE and
does `shared/pattern-data.js` already export match helpers?). Rule:
**if 048 (or any landed work) already provides a shared match helper, reuse
it. Otherwise write the tester as a ~10-line local loop over
`SS_buildPatterns(...)` output plus the `SS_getExcludedSignature` check,
and add one line to this plan file's Maintenance section naming the new
duplication so plan 048's executor (or `reconcile`) can absorb it.** Do not
half-extract.

**Verify**: decision recorded in the commit message; `npm run smoke` → exit 0.

### Step 2: Build the tester UI + logic

Section (after the action-bar, before language toggles): a textarea
(`#testInput`), a button (`#testBtn`), a result div (`#testResult`) reusing
`.lang-section` styling. Logic: on click, assemble live patterns exactly as
content boot does (stored custom phrases + enabled langs + disabled ids),
run the Step-1 match function over the textarea text, render either the
matched entry's label + source (built-in id like `EN-1`, or custom-phrase
text) or the no-match string. New locale keys in BOTH locale files
(e.g. `testerTitle`, `testerPlaceholder`, `testerButton`,
`testerNoMatch`, reusing existing `matchedLabel` for the hit line).
Wire into the existing options render flow without breaking `render()`'s
single-render guarantee (plan 030).

**Verify**: `node --check options/options.js && node --check options/options.html 2>/dev/null; npm run lint` → exit 0. (HTML has no syntax gate in smoke; eyeball the section in a real options page if a browser is available, else rely on the Step 4 e2e.)

### Step 3: Unit tests for the match path

If Step 1 extracted a helper, test it in `tests/unit/pattern-data.test.js`
style (existing file is the pattern): built-in hit returns its id, custom
hit returns its text/source, excluded-signature text returns null,
empty text returns null. If Step 1 mirrored locally, test via whatever seam
exists — at minimum add corpus cases through `SS_buildPatterns` output.

**Verify**: `npm run test:unit` → all pass including the new tests.

### Step 4: e2e + full verification

Add one options-flow scenario to `tests/extension-interactions.js`
(following an existing options scenario as structure): set a custom phrase,
paste matching text into the tester, assert the hit line names the phrase;
paste benign text, assert no-match. Then run everything:

```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension
```

**Verify**: all green, including the new scenario.

## Test plan

- New unit tests (Step 3) for hit-by-id / hit-by-custom / excluded / empty.
- New e2e scenario (Step 4) driving the real options page.
- Regression net: full `test:extension` proves no existing flow broke.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` passes including the new match tests
- [ ] `npm run test:extension` passes including the new tester scenario
- [ ] Tester verdict agrees with content-script verdict on a probe pair (one spam, one benign — assert in the e2e, not by eye)
- [ ] Every new user-facing string exists in BOTH `_locales/en` and `_locales/es`
- [ ] `git diff --name-only ffdffab..HEAD` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `SS_buildPatterns`'s signature/shape differs from "Current state" (the mirror premise is wrong).
- Content boot assembles patterns with inputs the options page cannot read (private context) — the tester cannot be faithful; stop rather than shipping an unfaithful tester.
- The tester disagrees with the content script on the probe pair and the cause is a content.js bug — report it, don't fix it here.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If matching semantics change (new pattern sources, new exclusion shapes),
  the tester's assembly must be updated in lockstep with content boot — the
  probe-pair e2e is the tripwire.
- A reviewer should check the tester reads live storage (not a stale cached copy) and that long pasted texts can't freeze the page (regexes are linear per the 2026-08-14 audit, but cap input length anyway).
- **Deferred:** tester history/recent-tests — unblocked by nothing, just not worth it now.
