# Plan 068: Evaluate an optional Suggested-post label filter

> **Executor:** This is a bounded design/spike, not a production build.
> Read the plan, execute its checks, and append the measured verdict.
> Work on `advisor/068-suggested-post-filter`. Only edit the research deliverables
> listed below and this plan/index. No source-code merge or store publication.
>
> **Drift check:** `git diff --stat 3986b84..HEAD -- content.js shared/pattern-data.js shared/post-container.js shared/constants.js tests/unit/post-container.test.js tests/extension-interactions.js`.
> Read any changed dependency once; an expected prerequisite change is not
> itself a blocker. If the contracts/excerpts no longer hold, refresh the
> design before prototyping; report an unresolved consequential mismatch.

## Status

- **Priority:** P3
- **Effort:** M (coarse estimate for this spike; build effort estimated in verdict)
- **Risk:** MED–HIGH — wrong label/container detection can hide legitimate posts
- **Depends on:** 067 measurement contract before proceed verdict; design/provenance collection may start independently
- **Category:** direction — design/spike
- **Planned at:** `3986b84`, 2026-09-13
- **Status:** DONE (2026-09-14, branch advisor/068-suggested-post-filter @ 85872c8, reviewed + verified; merged to main @ ee6b899; verdict: insufficient-data — 10 synthetic cases, 17 detector tests, Chromium probe + zero collateral hides, realSampleCount 0; research under plans/research/068/)

## Why this matters

LinkedIn Feed Filter advertises separate Suggested/Promoted filtering.
The project already supports optional Promoted and Featured hiding, making a
Suggested-only control a plausible extension. It should hide a LinkedIn
recommendation category only when the user requests it; suggested content
is not inherently spam. Confidence MED for product fit, LOW for current DOM
coverage until measured.

Source checked 2026-09-13:
[LinkedIn Feed Filter](https://chromewebstore.google.com/detail/linkedin-feed-filter/kilhiehmjphljfljhdjblghdiickbahh).
This is an advertised feature, not a verified implementation.

## Current state

content.js:698:
```js
if (!enabled || Date.now() < snoozeUntil) return;
if (!hidePromoted) return;
```
The current pass enumerates AUTHOR_BLOCK_SELECTORS, scans descendants and
calls blockPost(post, null, {reason:"promoted"}) on a label match.
shared/pattern-data.js:276 matches a trimmed label exactly or before “ ·”.
This text check alone does not prove a string came from post-header metadata.
content.js:793 recognizes promoted/featured as label hides; these do not
increment stats/badge/undo. They keep a data-ss-ph placeholder and Show.
shared/constants.js:28 has HIDE_PROMOTED and HIDE_FEATURED, no Suggested key.
Existing allow tests near tests/extension-interactions.js:1750 prove
never-hide text does not undo a deliberate label hide.

## Decisions and experiment boundaries

- Investigate exactly one category, Suggested. No repost/like/hiring/job-change
  heuristics, company filtering, Solo mode, AI scoring, or vague sensitivity.
- Desired future control is off by default, clearly category-based, independent
  of text spam rules. Preserve reversible placeholders and opt-out restoration;
  do not count category hides as spam or add them to pattern-hit totals.
- Detection must identify a recommendation label in known post metadata.
  A body sentence containing or consisting of “Suggested” is a negative.
  A comment, nested quote, accessibility duplicate, or translated label in
  another component must not hide its parent post.
- Use conservative recognized structures; unknown layouts fail open.
  Include author/allow interaction in design: follow current cosmetic label
  semantics, while respecting Show, snooze and disabled state. Toggling this
  category off restores only its own hides.
- Do not guess translations or DOM structures. English-only evidence can
  support an explicitly English-label-only candidate; it cannot support
  claiming all five LinkedIn UI languages. EN/ES extension UI copy remains
  separate. Record unsupported metadata locales.
- No shipped changes until representative label/layout samples and negative
  controls pass. If samples are unavailable, deliver insufficient-data with
  the exact missing evidence and a reusable harness.

## Steps and deliverables

### 1. Define the category and collect bounded fixtures

Create plans/research/068/design.md and cases.json with case id, markup,
expectedTarget (or null), metadataLocale, provenance and validation status.
Start with synthetic controls, distinctly marked; add sanitized structural
samples only from authorized/provided or legitimately public sources.
No full private feed dumps. Document where the evidence came from.

Cases must include header label, body word/whole paragraph, nested comment,
repost within a post, unrecognized layout, duplicate label, mutation-root-is-
post and a non-English/unsupported label. The inventory may record missing
real samples; do not fill the gap with fabricated provenance.

**Verify:** `node -e 'const a=require("./plans/research/068/cases.json"); if(a.length<9||a.some(x=>!x.id||!x.provenance||!("expectedTarget" in x)))process.exit(1)'`
→ exit 0.

### 2. Prototype and measure boundaries

Create detector.cjs and detector.test.cjs using jsdom, modeled after
tests/unit/post-container.test.js, with actual shared helpers when useful.
Call the prototype from a research-only mock browser probe to verify inserted
and replaced post behavior. No broad querySelectorAll("*") body-word shortcut.
Test restoration and precedence as a separate state model; explicitly label
it as proposed behavior until the future production integration exists.

**Verify:** `node --test plans/research/068/detector.test.cjs` → exit 0;
`xvfb-run -a node plans/research/068/browser-probe.cjs` → exit 0.
Report all false positives/negatives by ID using 067's denominator/provenance
rules. Zero collateral hides is required on the fixed negative controls.

### 3. Decide whether to build

Create verdict.json: verdict (proceed/insufficient-data/no-go),
supportedMetadataLocales, realSampleCount, negativeFalsePositives,
unresolvedCases, checks, proposedStorageKeys, productionFiles.
Proceed needs correctly targeted real label examples, zero fixed-negative
collateral hides, and an explicit supported-layout/locale boundary; passing
synthetic tests alone is insufficient.

List future files: content, shared label data/constants/types/lint if needed,
options control, EN/ES strings, backup import/export, tests and AGENTS.
Specify absent key => false and compatibility with older backup files.
Do not change manifest matching or release files in this spike.

**Verify:** `node -e 'const v=require("./plans/research/068/verdict.json"); if(!["proceed","insufficient-data","no-go"].includes(v.verdict))process.exit(1); if(v.verdict==="proceed"&&(!v.realSampleCount||v.negativeFalsePositives||v.unresolvedCases.length))process.exit(1)'`
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

Only create/edit `plans/research/068/`, this plan, and its row in
`plans/README.md`. Prototype source belongs under that research directory,
never in the shipped files. Read production dependencies in place; do not
copy whole modules into the prototype. Browser probes may inject prototype
behavior into an isolated mock page, clearly labeled as an experiment.
Use conventional commits, e.g. `docs(plans): record 068 design verdict`.
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

- Header metadata cannot be distinguished from body/comment content on the sampled layouts.
- A proceed verdict depends only on synthetic markup or invented translations.
- Implementation would turn cosmetic category hides into spam counts.
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

**Deferred:** Production Suggested filtering requires a proceed verdict and build plan; other category filters require separate evidence and are not implicitly approved by this experiment.
