# Plan 069: Evaluate reversible hide-once for an individual post

> **Executor:** This is a bounded design/spike, not a production build.
> Read the plan, execute its checks, and append the measured verdict.
> Work on `advisor/069-manual-hide-once`. Only edit the research deliverables
> listed below and this plan/index. No source-code merge or store publication.
>
> **Drift check:** `git diff --stat 3986b84..HEAD -- background.js content.js shared/post-container.js tests/unit/post-container.test.js tests/extension-interactions.js`.
> Read any changed dependency once; an expected prerequisite change is not
> itself a blocker. If the contracts/excerpts no longer hold, refresh the
> design before prototyping; report an unresolved consequential mismatch.

## Status

- **Priority:** P3
- **Effort:** S–M (coarse estimate for this spike; build effort estimated in verdict)
- **Risk:** MED — incorrect selection target or accidental permanent state
- **Depends on:** 063 report selection contract; design can start earlier
- **Category:** direction — design/spike
- **Planned at:** `3986b84`, 2026-09-13
- **Status:** TODO

## Why this matters

A user can encounter an unwanted post that is not spam and want it gone once,
without blocking an author or making a permanent phrase. Slop Bin advertises
manual per-post dismissal; the useful part for this project is that narrow
user choice. Reuse the project's reversible placeholder rather than its
competitor's animations or paid focus mode. Confidence MED: concrete
capability gap, no in-repo demand measurement.

Source checked 2026-09-13:
[Slop Bin](https://chromewebstore.google.com/detail/slop-bin-linkedin-feed-cl/pgnagajcnmhcaailbojpmchnmmjgnnpm).
Its advertised interaction is inspiration, not copied code or verified quality.

## Current state

background.js:13 has add-phrase and block-author actions, both persistent.
content.js:773 blockPost checks cooldown, processed/forceShow and duplicate
placeholder before hiding:
```js
processed.add(post);
post.style.display = "none";
blockedPosts.add(post);
```
Text hides update counts and can enter lastBlocked, capped at five (around 832).
Cosmetic label hides avoid those counters. A naive blockPost(post,null,...)
with a new reason would fall into counting logic; do not assume it is safe.
restorePost (1344) restores display, removes the sibling placeholder, prunes
blocked/label sets, and sets forceShow/cooldown. restoreBlocked (1105) restores
all tracked elements. Shared container detection now distinguishes comments.

## Decisions and experiment boundaries

- Proposed action: selected text → context menu “Hide this item once.”
  If scope is a comment, UI/placeholder must identify a comment; never hide
  the innocent parent post. Share 063's validated selection resolution.
- No cursor mode, overlays on every post, global keybinding, or extra toolbar.
  No matching fallback when target identification is uncertain: fail visibly
  with no mutation rather than hiding an arbitrary ancestor.
- Explicit user action may hide that selected item even if its author or text
  is allowed, or it was previously shown. This one-click exception must not
  alter automatic rule precedence, preferences, allowlists, exclusions or
  permanent blocklists. Do not auto-learn a rule from the click.
- Keep data-ss-ph + Show. Show, Show all, disable, snooze, and page reload
  must give predictable recovery. No persistence across reload and no content
  history in storage. A re-rendered/recreated node may reappear: deliberately
  prefer this narrow scope over a persistent ID-based manual blacklist.
- Manual hides are not detected spam: no lifetime/daily/pattern count changes,
  no suggestions and no badge increment. Keep them out of the existing
  spam undo list; the adjacent Show and Show all are recovery for v1.
- If an already automatically hidden target is selected through stale DOM,
  do not add another placeholder or change its attribution.

## Steps and deliverables

### 1. Model the narrow action and precedence

Create plans/research/069/design.md with a state table for visible,
automatically hidden, manually hidden, restored and detached targets.
Include EN/ES proposed menu and placeholder copy, how the correct clicked tab
is used, and recovery on snooze/disable/reload. Document manual state as
ephemeral, separate from detected spam.

Create cases.json with at least eight cases: visible post, comment, unknown
container, no selection, allowed text/author, already-shown item, duplicate
action, and detached/recreated node. Separate target resolution from state logic.

**Verify:** `node -e 'const a=require("./plans/research/069/cases.json"); if(a.length<8||a.some(x=>!x.id||!x.expected))process.exit(1)'` → exit 0.

### 2. Prototype selection and restoration

Create prototype.cjs and prototype.test.cjs using jsdom and the actual shared
container helper. Use the resolved target from the 063 design, never a
body-wide scan. Implement a research state adapter for manual reasons and
counters; it is not a drop-in copy of blockPost.

Test exact target hidden, one adjacent recoverable placeholder, correct
comment boundary, no writes to fake storage, no counter/suggestion changes,
repeat action idempotence, Show and Show all, snooze/disable, unknown target
no-op and re-created-node policy. Prove only an explicit manual action can
override a Show protection; an automatic rescan must not.

**Verify:** `node --test plans/research/069/prototype.test.cjs` → exit 0.
Add an isolated browser-probe.cjs for selection/keyboard activation/reveal.
`xvfb-run -a node plans/research/069/browser-probe.cjs` → exit 0.
Do not call this proof that production integration or Firefox is complete.

### 3. Record the architecture choice

Create verdict.json with verdict (proceed/revise/defer), caseCount,
persistentWrites, counterChanges, checks and productionFiles.
Choose a minimal explicit reason classification in blockPost versus a
separate manual-hide wrapper. Prefer sharing restoration/placeholder behavior,
but enumerate every conditional affected (stats, suggestions, Not spam,
author actions, restore and undo). The build must not classify manual hides
as promoted content merely to bypass counters.

Include exact future production tests in Chromium/Firefox and the no-new-
permissions invariant. This is a separate build from 063: reporting must never
silently hide an item, and hiding must never open a report.

**Verify:** `node -e 'const v=require("./plans/research/069/verdict.json"); if(!["proceed","revise","defer"].includes(v.verdict)||v.caseCount<8||v.persistentWrites||v.counterChanges)process.exit(1)'`
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

Only create/edit `plans/research/069/`, this plan, and its row in
`plans/README.md`. Prototype source belongs under that research directory,
never in the shipped files. Read production dependencies in place; do not
copy whole modules into the prototype. Browser probes may inject prototype
behavior into an isolated mock page, clearly labeled as an experiment.
Use conventional commits, e.g. `docs(plans): record 069 design verdict`.
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

- Correct target resolution needs broader scanning, or a bait comment hides its parent post.
- Manual state leaks into spam counts, persisted settings or automatic learning.
- The only possible design bypasses automatic restore/allow protections globally.
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

**Deferred:** Shipping hide-once requires the prototype verdict and a bounded build plan after 063; session history, persistent manual mutes and animated dismissal are not part of this feature.
