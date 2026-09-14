# Plan 065: Design a truthful settings-import preview

> **Executor:** This is a bounded design/spike, not a production build.
> Read the plan, execute its checks, and append the measured verdict.
> Work on `advisor/065-import-preview`. Only edit the research deliverables
> listed below and this plan/index. No source-code merge or store publication.
>
> **Drift check:** `git diff --stat 3986b84..HEAD -- options/options.js shared/pattern-data.js shared/constants.js tests/extension-smoke.js`.
> Read any changed dependency once; an expected prerequisite change is not
> itself a blocker. If the contracts/excerpts no longer hold, refresh the
> design before prototyping; report an unresolved consequential mismatch.

## Status

- **Priority:** P2
- **Effort:** M (coarse estimate for this spike; build effort estimated in verdict)
- **Risk:** MED — current import mutates several categories incrementally
- **Depends on:** none; coordinate phrase-only file compatibility with 066
- **Category:** direction — design/spike
- **Planned at:** `3986b84`, 2026-09-13
- **Status:** DONE (executed 2026-09-14 on `advisor/065-import-preview`, base `74f3ae8`; index update left to reviewer)

## Why this matters

Users should see what a backup will add, skip, or override before applying it.
The existing importer validates files but begins changing state as it parses.
This is a repository-grounded usability improvement, not a claim derived from
competitor demand. Confidence HIGH for the behavior, MED for product value.

## Current state

options/options.js:809 reads a file with FileReader and parses JSON.
The legacy array branch (828) immediately calls:
```js
const { valid, skipped } = importPhraseList(imported);
save();
```
The object branch (856) similarly merges phrases first, then categories with
separate sync.set calls. The allow-phrase loop (1083) merges and quota-prunes
entries. Booleans (1150) explicitly use last-import-wins behavior:
```js
if (typeof imported.hidePromoted === "boolean") {
  const hidePromotedBefore = hidePromoted;
  if (imported.hidePromoted !== hidePromoted) {
    hidePromoted = imported.hidePromoted;
```
shared/constants.js caps import bytes at 128 KiB; phrases at 200 entries,
120 characters each; author/allow lists at 100. Storage byte caps differ by
category. tests/extension-smoke.js:320 covers legacy arrays, complete backups,
additive merges, invalid files, quota pruning and old missing fields.

## Design decisions and boundaries

- Stage file parsing, validation and merge calculation without mutating live
  arrays/storage. Preview counts by category: added, unchanged, invalid,
  duplicate, quota-skipped, and any existing entries evicted by current policy.
  Show boolean/language transitions explicitly rather than hiding them in counts.
- Start with Apply and Cancel, no per-category selectors. Cancel writes nothing.
  Preserve current merge identity/order and missing-field behavior.
  Characterize actual language/disabled-pattern behavior from current code;
  do not assume the “additive” comment applies to every field.
- Use one normalized proposed patch and one sync.set call at Apply. This is
  not a cross-context transaction; do not promise browser-level compare-and-swap.
  Re-read source keys immediately before applying. If they differ from the
  preview snapshot, invalidate and recompute the preview instead of silently
  overwriting changes made in another tab.
- Maintain a recoverable preview on storage errors; only show completion after
  successful callback. No generic undo snapshot/history or extra storage keys.
- Resolve exact block/allow text conflicts visibly. This is a design question:
  record current behavior and propose skip-conflicting-import with a reason;
  do not quietly broaden matching semantics or remove an existing rule.
- Byte estimates must use UTF-8 serialized size plus storage-key bytes and
  preserve explicitly recorded category budgets. If current code's estimate
  is inconsistent, record the narrow prerequisite; do not copy the defect
  into a preview that claims an accurate fit.

## Steps and deliverables

### 1. Characterize the import contract

Create plans/research/065/design.md with a per-field table: recognized shape,
identity, merge policy, quota, defaults, missing-field treatment, conflicts,
and current write points. Include legacy [] and version:1 object formats.
Specify handling of unsupported future versions explicitly in the design.
Create cases.json with before, imported, expectedPatch and expectedSummary;
include at least 12 cases spanning every exportable category.

**Verify:** `node -e 'const a=require("./plans/research/065/cases.json"); if(a.length<12||a.some(x=>!x.before||!x.expectedPatch||!x.expectedSummary))process.exit(1)'`
→ exit 0.

### 2. Prototype a pure planner and commit controller

Create prototype.cjs with planImport(snapshot, input) → {patch, summary,
issues}; use actual shared helpers where applicable. Create prototype.test.cjs.
Keep validation independent of DOM/storage. Test input immutability, stable
deduplication, multibyte quota limits, invalid file shapes, missing fields,
empty arrays, field overrides and conflicts.

Add a fake async storage adapter solely to exercise the controller: no writes
on preview/cancel, one attempted write on valid Apply, re-preview after changed
snapshot, no success on read/write error. This proves controller design, not
atomicity of browser sync or its quotas.

**Verify:** `node --test plans/research/065/prototype.test.cjs` → exit 0.
Persist baseline-vs-proposed differences in design.md; none may be unexplained.

### 3. Define integration and hand off

Document the preview layout, EN/ES summaries, keyboard focus, disabled Apply
during work, and proposed future production scope. Reuse existing HTML styles.
Update the future test strategy: tests/extension-smoke.js importFileOn
currently only selects a file (905); future successful-import tests must
explicitly apply, while cancellation tests must assert before/after storage.
Do not weaken the existing round-trip assertions to accommodate the preview.

Create verdict.json with verdict, caseCount, semanticChanges, checks and
productionFiles. A successful design must name any deliberate behavior change
and its regression test, including version or conflict handling.

**Verify:** `node -e 'const v=require("./plans/research/065/verdict.json"); if(!["proceed","revise","defer"].includes(v.verdict)||v.caseCount<12||!Array.isArray(v.semanticChanges))process.exit(1)'`
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

Only create/edit `plans/research/065/`, this plan, and its row in
`plans/README.md`. Prototype source belongs under that research directory,
never in the shipped files. Read production dependencies in place; do not
copy whole modules into the prototype. Browser probes may inject prototype
behavior into an isolated mock page, clearly labeled as an experiment.
Use conventional commits, e.g. `docs(plans): record 065 design verdict`.
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

- Correct preview requires changing unrelated settings save paths.
- Quota/merge behavior cannot be explained per field, or a partial write is described as an atomic transaction.
- An existing entry would be removed without an explicit preview reason.
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

**Deferred:** Production import refactor and UI require this contract/prototype verdict. Coordinate its legacy phrase-array path with 066; neither plan authorizes a general storage refactor.

## Measured verdict (executor, 2026-09-14)

- **Verdict: proceed.** Deliverables in `plans/research/065/`: `design.md`
  (per-field contract, 6 measured quirks, 7 baseline-vs-proposed
  differences, planner/controller API, integration sketch with EN/ES
  drafts, future test strategy), `cases.json` (16 cases, every
  exportable category), `prototype.cjs` (pure `planImport` + fake-storage
  commit controller), `prototype.test.cjs` (14 tests), `verdict.json`.
- Checks: cases schema exit 0; `node --test` 14/14 pass; `npm run smoke`,
  `lint`, `typecheck`, `test:unit` (81/81) all exit 0. Browser suites not
  run (research-only exemption). No STOP condition tripped.
- Key findings: `version` is currently ignored (v2 would half-merge →
  propose refusal); whitelist/blocked/allow byte gates use UTF-16 length
  (→ propose UTF-8); excluded cap double-counts (256 effective per
  import, replicated not fixed); block↔allow collisions are silent today
  with allow shadowing block at match time (→ propose skip-with-reason).
- 066 compatibility: legacy bare-array `{text, mode, enabled}` contract
  unchanged; phrase packs round-trip through the legacy branch. No drift:
  `git diff --name-only 74f3ae8 -- . ':!plans'` empty.
