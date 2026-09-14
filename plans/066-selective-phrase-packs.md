# Plan 066: Design portable exports of selected blocking phrases

> **Executor:** This is a bounded design/spike, not a production build.
> Read the plan, execute its checks, and append the measured verdict.
> Work on `advisor/066-selective-phrase-packs`. Only edit the research deliverables
> listed below and this plan/index. No source-code merge or store publication.
>
> **Drift check:** `git diff --stat 3986b84..HEAD -- options/options.js options/options.html shared/constants.js tests/extension-smoke.js`.
> Read any changed dependency once; an expected prerequisite change is not
> itself a blocker. If the contracts/excerpts no longer hold, refresh the
> design before prototyping; report an unresolved consequential mismatch.

## Status

- **Priority:** P3
- **Effort:** S–M (coarse estimate for this spike; build effort estimated in verdict)
- **Risk:** LOW–MED — accidental export of unrelated personal settings
- **Depends on:** none for design; keep legacy import compatibility aligned with 065
- **Category:** direction — design/spike
- **Planned at:** `3986b84`, 2026-09-13
- **Status:** TODO

## Why this matters

The full backup is useful for restoring a profile, but sharing a few rules
currently also exports author IDs, exclusions and other preferences. Add an
explicit phrase-only export so a user can transfer a small chosen list.
This is an adjacent capability supported by existing import formats;
competitor listings did not establish demand. Confidence HIGH grounding,
MED product value; do not build subscriptions or a community rule service.

## Current state

options/options.js:640 exports one payload:
```js
const payload = {
  version: 1,
  exportedAt: Date.now(),
  phrases: phrases,
  whitelist: whitelist,
  excluded: excluded,
  langs: enabledLangs,
  blockedAuthors: blockedAuthors,
  disabledPatterns: disabledPatterns,
  hidePromoted: hidePromoted,
  hideFeatured: hideFeatured,
  allowPhrases: allowPhrases,
};
```
It prefers clipboard with a download fallback (743). The legacy import branch
at 828 accepts a bare array; it is tested in tests/extension-smoke.js:322.
Phrase rows have stable IDs, text, enabled state and exact/contains mode;
options/options.js:1932 renders them. options.html:540 has import/export buttons.

## Design decisions and boundaries

- Keep full backup unchanged. Add a separate action labeled Export selected
  phrases with a selection step and count. Selection is explicit, ephemeral,
  and never inferred from a search query or all enabled phrases.
- Export only a bare array of newly constructed objects with exactly
  text, mode, enabled. Preserve exact/contains and enabled:false.
  Do not spread source objects; omit IDs, timestamps, authors, exclusions,
  allow-phrases, pattern stats, suggestions, and all unrelated settings.
- Reuse legacy array import; no format version bump, host permissions, remote
  sharing, automatic downloads or clipboard write before user action.
  Default is no selected rows; disable export for an empty selection.
- Selection must remain keyed by ID across sorting/search; disclose total
  selected including non-visible rows. Deleted rows are removed from selection.
  Provide an explicit “select visible” action only if the design demonstrates
  the added interaction is worthwhile; no hidden bulk selection.
- Treat text itself as user-chosen content, not guaranteed anonymous data.
  Offer preview of exactly what leaves via clipboard/file. Caps and validation
  match MAX_PHRASE_LENGTH and existing allowed modes; no raw regex format.

## Steps and deliverables

### 1. Specify format and selection behavior

Create plans/research/066/design.md, cases.json, and prototype.cjs exporting
serializeSelected(phrases, selectedIds). Cases include exact, contains,
disabled, multiple selections, filtered-but-selected rows, deletion and empty
selection. List proposed EN/ES labels, tab/keyboard flow, and the integration
point beside full backup.

**Verify:** `node -e 'const a=require("./plans/research/066/cases.json"); if(a.length<7)process.exit(1)'` → exit 0.

### 2. Prove minimization and compatibility

Create prototype.test.cjs using node:test. Assert the output key set on every
entry is exactly text/mode/enabled; deep-freeze inputs; no side effects.
Poison source objects with unrelated author/history metadata to prove an
allowlist serializer drops it. Check the selected text, disabled state, mode,
order and empty-selection behavior. Round-trip sample arrays through a
prototype of the characterized legacy input contract; this is not a substitute
for the eventual real importer e2e.

**Verify:** `node --test plans/research/066/prototype.test.cjs` → exit 0.

### 3. Hand off a small build scope

Create verdict.json with verdict, caseCount, checks, payloadKeys, productionFiles.
Specify future browser tests: capture clipboard/download; deep-compare keys;
import into a fresh profile; assert matched exact/contains behavior and disabled
rules remain disabled; full-backup tests stay intact. If 065 preview is built
first, importing a phrase pack must enter the same preview/apply path.

**Verify:** `node -e 'const v=require("./plans/research/066/verdict.json"); if(!["proceed","revise","defer"].includes(v.verdict)||v.caseCount<7||JSON.stringify([...v.payloadKeys].sort())!==JSON.stringify(["enabled","mode","text"]))process.exit(1)'`
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

Only create/edit `plans/research/066/`, this plan, and its row in
`plans/README.md`. Prototype source belongs under that research directory,
never in the shipped files. Read production dependencies in place; do not
copy whole modules into the prototype. Browser probes may inject prototype
behavior into an isolated mock page, clearly labeled as an experiment.
Use conventional commits, e.g. `docs(plans): record 066 design verdict`.
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

- Existing import cannot preserve mode/enabled semantics without a schema migration; characterize and report before expanding scope.
- A design exports unselected content or claims the selected phrases are anonymous.
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

**Deferred:** Shipped selection UI and serializer require this tested format decision; remote/shared blocklists remain out of scope by standing product decision.
