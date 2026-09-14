# Plan 067: Establish reproducible detection and recovery measurements

> **Executor:** This is a bounded design/spike, not a production build.
> Read the plan, execute its checks, and append the measured verdict.
> Work on `advisor/067-detection-benchmark`. Only edit the research deliverables
> listed below and this plan/index. No source-code merge or store publication.
>
> **Drift check:** `git diff --stat 3986b84..HEAD -- shared/pattern-data.js shared/post-container.js content.js tests/unit/pattern-data.test.js tests/unit/post-container.test.js tests/helpers.js tests/extension-interactions.js`.
> Read any changed dependency once; an expected prerequisite change is not
> itself a blocker. If the contracts/excerpts no longer hold, refresh the
> design before prototyping; report an unresolved consequential mismatch.

## Status

- **Priority:** P2
- **Effort:** M (coarse estimate for this spike; build effort estimated in verdict)
- **Risk:** LOW code risk; MED risk of misleading conclusions from a weak corpus
- **Depends on:** none; measurement contract precedes any 068 shipping decision
- **Category:** direction — design/spike
- **Planned at:** `3986b84`, 2026-09-13
- **Status:** TODO

## Why this matters

“Best in class” must mean fewer legitimate posts hidden, useful spam coverage,
reliable rendering and easy recovery. Competitor listings advertise different
numbers of rules, categories or sensitivity controls, but no comparable
measured precision. This plan creates a repeatable local benchmark contract;
it does not assert market leadership or alter production rules.
Confidence HIGH in the need to measure, unknown current real-world accuracy.

## Current state

- shared/pattern-data.js:107 exports buildPatterns; exact/contains custom rules
  precede enabled built-ins. content.js:572 first checks exclusion signatures
  and allow-phrases. Testing regexes alone would omit those user protections.
- tests/unit/pattern-data.test.js imports real helpers and uses node:test:
  ```js
  const test = require("node:test");
  const assert = require("node:assert/strict");
  ```
  Its FR/PT/DE positive and negative examples (approximately 132–209) are
  explicit assertions, not an independently labeled evaluation dataset.
- shared/post-container.js and tests/unit/post-container.test.js characterize
  container choices. Plan 059's comment fix has browser tripwires in
  tests/extension-interactions.js near 1921–2008.
- tests/helpers.js:12 defines mockLinkedInFeed with spam, trusted-author,
  and benign posts. These fixtures are integration controls, not evidence of
  population accuracy.
- Archived 052 reports DO-NOT-SHIP for DM-gating: legitimate recruiter language
  overlaps the candidate. Its corpus is on a prototype branch and must not be
  treated as already available locally or imported without inspecting provenance.

## Decisions

- Separate three evaluations: plain-text detection, user-policy precedence,
  and DOM target/recovery. Text detector metrics cannot certify whole-post behavior.
- JSON corpus fields: id, language, text, expected (spam/legitimate/ambiguous),
  provenance (synthetic/regression/user-contributed/public-excerpt),
  sourceRef, labelStatus (verified/unverified), split (development/holdout),
  and optional settings/expectedReason. No raw private URLs, authors or account
  identifiers; do not copy whole social posts or scrape logged-in accounts.
- Seed from existing tests, retaining their provenance as regression/synthetic.
  Do not relabel generated examples as real, fluent-reviewed, or independent.
  Mark holdout only for independently labeled examples not used to tune rules.
- Report TP, FP, TN, FN, ambiguous and unverified counts, precision/recall/FPR
  with explicit denominators; null for undefined metrics. Stratify by language,
  source type and split. Deduplicate near-identical wording before splitting;
  keep variants of one source together. Preserve known failures visibly.
- A release quality guard should prevent regressions on locked legitimate
  examples and existing spam fixtures. A green regression guard is not a claim
  of real-world precision. Promotion of new rules needs representative,
  independently labeled examples and the existing fluent-review/corpus gate.
- Measure DOM correctness on initial load, appended posts, replaced nodes,
  split text, nested comments, and restore/re-scan. Record exact selected
  target and collateral hides. Record latency samples separately with browser,
  platform and repeated-run details, never an invented universal speed target.
- No telemetry, automatic uploads, new language/rule family, competitor CRX
  installation, “minutes saved” estimates, or competitive ranking.

## Steps and deliverables

### 1. Inventory and define data quality

Create plans/research/067/design.md and corpus.json. Inventory existing
positive/negative and DOM fixtures with file references, preserving expectation
and provenance. Document gaps rather than inventing enough entries to meet
an arbitrary accuracy target. Include all five detection languages in the
inventory, even if a language lacks independently verified holdout examples.

**Verify:** `node -e 'const a=require("./plans/research/067/corpus.json"); if(!a.length||a.some(x=>!x.id||!x.provenance||!x.labelStatus||!x.split))process.exit(1)'`
→ exit 0.

### 2. Build the offline evaluator

Create evaluate.cjs using actual shared Node exports. CLI:
`node plans/research/067/evaluate.cjs --json` prints metrics and every
misclassified ID, excluding timing from deterministic results.
`--check` verifies schema, expectation/metric arithmetic and a recorded
baseline of expected failures; it must fail on newly introduced discrepancies
rather than hiding old ones. Keep a --compare <result.json> path for later
candidates. Do not change production regexes to make the report green.

Create evaluate.test.cjs. Test known confusion matrices, empty denominators,
ambiguous/unverified exclusions from accuracy metrics, dedupe/split invariants,
exclusion and allow precedence, stable repeated results, and an intentionally
bad prediction that must be surfaced by comparison.

**Verify:** `node --test plans/research/067/evaluate.test.cjs` → exit 0;
`node plans/research/067/evaluate.cjs --check` → exit 0 against the recorded
baseline (not necessarily zero misclassifications).

### 3. Record browser evidence and limitations

Create a bounded browser-probe.cjs using the existing test harness in an
isolated mock environment. It must exercise current production code, not a
replacement detector. Cover initial/dynamic/comment/restore cases above;
do not turn a DOM-capability limit into an assertion of success. Record
observed latency with configuration and sample count; no flaky hard timing
threshold in CI until a stable baseline has been measured.

**Verify:** `xvfb-run -a node plans/research/067/browser-probe.cjs` → exit 0
when structural invariants pass; existing `npm run test:firefox` supplies
baseline Firefox evidence. If the custom probe only covers Chromium, say so
and require Firefox equivalents before using it as a cross-browser claim.

### 4. Publish a measured research verdict

Create results.json and verdict.json. Verdict fields: verdict
(proceed/insufficient-data/revise), measuredChecks, missingEvidence,
productionFiles, representativeHoldoutAvailable. Store reproducible metrics,
fixture hashes, exact commands and environment in design.md.
Define a future CI gate and the work required before any public comparison.
Insufficient independent holdout data is an honest successful spike result.

**Verify:** `node -e 'const v=require("./plans/research/067/verdict.json"); if(!["proceed","insufficient-data","revise"].includes(v.verdict)||!Array.isArray(v.missingEvidence)||typeof v.representativeHoldoutAvailable!=="boolean")process.exit(1)'`
→ exit 0.

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

Only create/edit `plans/research/067/`, this plan, and its row in
`plans/README.md`. Prototype source belongs under that research directory,
never in the shipped files. Read production dependencies in place; do not
copy whole modules into the prototype. Browser probes may inject prototype
behavior into an isolated mock page, clearly labeled as an experiment.
Use conventional commits, e.g. `docs(plans): record 067 design verdict`.
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

- Evaluation uses model-generated examples as verified real-world ground truth.
- A performance/accuracy comparison is claimed without comparable configurations and datasets.
- Data gathering needs private account scraping or unverifiable personal content.
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

**Deferred:** Production CI integration and public accuracy claims require the completed measurement contract and sufficient independent data; this plan does not reopen the rejected DM-gating/new-language proposals.
