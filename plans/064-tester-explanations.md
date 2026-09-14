# Plan 064: Design complete, truthful match-tester explanations

> **Executor:** This is a bounded design/spike, not a production build.
> Read the plan, execute its checks, and append the measured verdict.
> Work on `advisor/064-tester-explanations`. Only edit the research deliverables
> listed below and this plan/index. No source-code merge or store publication.
>
> **Drift check:** `git diff --stat 3986b84..HEAD -- options/options.js content.js shared/pattern-data.js tests/extension-interactions.js`.
> Read any changed dependency once; an expected prerequisite change is not
> itself a blocker. If the contracts/excerpts no longer hold, refresh the
> design before prototyping; report an unresolved consequential mismatch.

## Status

- **Priority:** P2
- **Effort:** S–M (coarse estimate for this spike; build effort estimated in verdict)
- **Risk:** LOW–MED — false explanations can undermine trust
- **Depends on:** none; 063 can ship independently
- **Category:** direction — design/spike
- **Planned at:** `3986b84`, 2026-09-13
- **Status:** TODO

## Why this matters

The tester already mirrors matching precedence, but an exclusion is reported
as no match. Users cannot distinguish “not recognized” from “deliberately
allowed.” Explain the effective decision and, separately, disabled rules that
would have matched. FeedHole advertises reasons for filtering and FeedHacker
advertises per-category controls; both reinforce an existing product need.
Confidence is HIGH for the current gap, MED for prioritization.

## Current state

options/options.js:1763:
```js
if (excludedSignatures.has(SS_getExcludedSignature(text))) return null;
for (const allow of allowMatchers) {
  if (allow.regex.test(text)) return { allow };
}
for (const entry of spamPatterns) {
  if (entry.regex.test(text)) return { entry };
}
return null;
```
runTester (1777) reads live sync settings on every click; caps text at 5000.
It displays allow phrase, first matching entry, or testerNoMatch.
content.js:572 has the same exclusion → allow → first-match precedence.
SS_buildPatterns (shared/pattern-data.js:107) puts custom rules first,
then enabled-language built-ins excluding disabled pattern IDs.
The HTML result (#testResult) is an aria-live polite region.
tests/extension-interactions.js:1800 compares the same texts in tester and feed.

## Design decisions and boundaries

- Verdict union: excluded, allowed, matched, unmatched, error. Include the
  winning reason; never use “no match” for excluded.
- Keep effective outcome separate from “would match if enabled.” Inspect
  inactive custom rules, disabled built-in IDs and disabled detection
  languages in a bounded second pass. Do not enable anything or write storage.
- Preserve custom-first order and the existing regexes/hash normalization.
  Show inactive matches only when no active rule wins and no pardon applies.
  Do not imply a disabled match is the cause of a current hide.
- State the scope once: text rules only. Author lists, promoted/featured
  filters, snooze, enabled state, and DOM boundaries are not inputs to a
  pasted-text test. It is not a prediction that a whole live post will hide.
- Keep paste content ephemeral. Show truncation explicitly; read failures
  must not render a misleading unmatched result.
- No confidence score, AI authorship claim, auto-rule creation, or settings
  mutation. EN/ES copy is drafted in the design; no new locales.

## Steps and deliverables

### 1. Specify verdicts

Create plans/research/064/design.md and cases.json. In the document include
a verdict table, EN/ES proposed copy, accessibility/focus behavior, the
5000-character contract, and the future file scope. cases.json entries must
carry id, text, settings, expectedKind, and expectedReason; use synthetic
examples with both matching and legitimate contexts.

**Verify:** `node -e 'const c=require("./plans/research/064/cases.json"); if(c.length<10||c.some(x=>!x.id||!x.expectedKind))process.exit(1)'`
→ exit 0. Include cases for every verdict and disabled-rule kind.

### 2. Prove semantics without touching production

Create prototype.cjs exporting a pure explainText(text, settings) using the
actual Node exports from shared/pattern-data.js, not copied regexes.
Create prototype.test.cjs with node:test. Model assertion style after
tests/unit/pattern-data.test.js. Freeze/clone inputs to prove no mutation.

Test exclusion beats allow/custom/built-in; allow beats custom/built-in;
custom beats built-in; disabled language; disabled individual pattern;
disabled custom rule; benign text; empty input; cap; repeated calls; overlapping
disabled and active rules. Error-state rendering is a design integration
case, not fabricated as a pure-matcher guarantee.

**Verify:** `node --test plans/research/064/prototype.test.cjs` → exit 0.
Compare effective decisions to the current matcher on the same cases; any
difference beyond the more specific explanation requires investigation.

### 3. Produce a build-ready decision

Append verdict.json with verdict (proceed/revise/defer), caseCount,
checks, and productionFiles. Include integration scenarios for read failure,
a storage update between clicks, truncation message, and the existing
feed/tester probe pairs. Choose whether the explanation helper stays private
in options or becomes shared; prefer private if sharing would change live
matching unnecessarily. If sharing, enumerate globals/types/lint/load surfaces.

**Verify:** `node -e 'const v=require("./plans/research/064/verdict.json"); if(!["proceed","revise","defer"].includes(v.verdict)||v.caseCount<10||!v.productionFiles.length)process.exit(1)'`
→ exit 0. No production code has changed.

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

## Commands and baseline

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

Use the existing installed toolchain. Establish the four non-browser baseline
checks before experiments. A pre-existing failure is a STOP; don't fix an
unrelated baseline as part of this plan.

## Scope and git workflow

Only create/edit `plans/research/064/`, this plan, and its row in
`plans/README.md`. Prototype source belongs under that research directory,
never in the shipped files. Read production dependencies in place; do not
copy whole modules into the prototype. Browser probes may inject prototype
behavior into an isolated mock page, clearly labeled as an experiment.
Use conventional commits, e.g. `docs(plans): record 064 design verdict`.
Do not merge, push, publish, install competitors, or submit issue reports.

At completion archive this plan to `plans/archive/` and update its index
link; keep its research directory address stable. The corresponding plan link
in `plans/competitor-review-2026-09-13.md` must also be updated on archival;
that link-only edit is an explicit addition to the scope above.

## Done criteria

- [ ] All named deliverables exist and their prescribed checks pass.
- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, and
      `npm run test:unit` exit 0.
- [ ] Verdict distinguishes measured behavior, design decisions, and remaining
      unknowns, with commands/results and a bounded future implementation scope.
- [ ] `git diff --name-only 3986b84 -- . ':!plans'` is empty in the isolated
      checkout based on that SHA; if prerequisites landed, use the recorded
      branch-start SHA instead. Record that SHA before editing.
- [ ] `git diff --check` exits 0; the plan status and index agree.

## STOP conditions

- Explaining an outcome requires changing matching precedence or persisted signatures.
- The design represents text-only tests as full-page detection guarantees.
- The proposed product requires automatic network requests, LinkedIn account
  changes, new permissions, or irreversible removal.
- An experiment fails twice after a reasonable correction, or requires
  out-of-scope edits. Record the failure without inventing evidence.
- A no-go caused by insufficient precision or unavailable representative data
  is a successful research verdict, not permission to lower the gate.

## Maintenance notes

The prototype is not shipped. Its assertions are evidence for a subsequent
build plan, not proof of production integration. Any future build needs
meaningful regressions in tests/extension-interactions.js (model after its
match-tester probe pairs near line 1800) and the packaged Chromium/Firefox gates.
Update AGENTS.md in that build if shared files, scripts, or storage keys change.

**Deferred:** Shipped tester changes require the completed verdict and a small build plan; no additional feature decision is needed if the specified contracts are proven.
