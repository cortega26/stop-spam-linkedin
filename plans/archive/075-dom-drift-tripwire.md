# Plan 075: Detect LinkedIn DOM drift at runtime (spike)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3aef7b9..HEAD -- content.js shared/post-container.js tests/helpers.js tests/extension-interactions.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: MED (the risk is false alarms annoying users — the spike's
  whole job is proving the signal is quiet before any UI exists)
- **Category**: direction
- **Planned at**: commit `3aef7b9`, 2026-09-14
- **Depends on**: none (serial discipline only: LAST among 072–075 —
  shares `content.js` and the e2e files with 073/074, so parallel
  worktrees would conflict on merge)

## Why this matters

The README's first stated limit is that "LinkedIn can change its page
structure, which may require detection updates" — and today such a change
fails totally silently: the content script scans, finds no containers,
hides nothing, and the user concludes there is no spam (or that the
extension is broken) with no signal either way. Plan 067 already observed
real DOM fragility (replaced-node and split-text limits) in the browser
probe, and plan 059's regression safety rests on test-only tripwires. This
spike designs a local-only, observe-only health signal — counts, never
content — that notices "this feed has posts but nothing matches anymore"
and says so somewhere appropriate. A no-go verdict (signal too noisy to
ship) is valid completion; a false-alarming health monitor is worse than
none.

## Current state

The facts the executor needs, inlined:

- **Scan architecture** (`content.js:662-772`): `scan(root)` (lines
  666-681) guards on `enabled`/snooze, finds spam text nodes via
  `findSpamTextNodes`, resolves each through
  `SS_findPostContainer(textNode, CONFIG, POST_SELECTORS)`, and blocks
  containers absent from the `processed`/`forceShow` WeakSets.
  Three sibling passes share the guards: `scanForBlockedAuthors`
  (688-706), `scanForLabeledPosts` (715-732), `scanForFeaturedSection`
  (740-758). `scheduleInitialScan` (760-772) runs all four via
  `requestIdleCallback` (2000 ms timeout) or `setTimeout`. A
  `MutationObserver` drives incremental rescans (`content.js:1207` —
  read the surrounding block; the observer callback is the second hook
  point after `scheduleInitialScan`).
- **Container abstraction** (`shared/post-container.js:1-60`): sibling
  heuristic (`findBySiblingHeuristic`, depth limit + heavy-sibling
  thresholds), `COMMENT_SELECTORS`, `POST_SELECTORS` as parameters. The
  file header states bodies are byte-identical moves from `content.js` —
  behavior changes here propagate to every scan path, which is why this
  spike must not alter matching, only observe it.
- **Known fragility, already recorded**: 067's verdict lists
  "replaced-node and split-text DOM limits observed in-browser" and
  "latency observed (not gated): median 510 ms append-to-placeholder,
  dominated by the 500 ms observer debounce." Any tripwire threshold
  must sit above the debounce + idle-callback timing or it will fire on
  every slow load — quote these numbers in the design, don't rediscover
  them.
- **Test-only tripwires exist** (059pattern): `tests/helpers.js`
  mock feed (`spam-1` / `whitelisted-1` / `clean-1` sections) and the
  comment-container fixtures from plan 057 (updated in 059). The spike
  reuses these shapes: a restructured-markup variant must fire the
  tripwire; the current mock must stay silent.
- **No health surface exists**: no storage key, no popup line, no
  options section, no console health log. `console.warn` is the
  established diagnostic channel (`background.js:29-31`,
  `content.js:1264-1266` style guards). Badge text is a block count
  relay (`background.js:69-93`) — do NOT repurpose it (counts are user
  data; health is meta — mixing them corrupts the stats contract in
  `content.js:1078` / `popup.js:405` joint-reset paths).
- **Repo conventions:** `"use strict"` IIFEs; no network requests of any
  kind (permissions `storage` + `contextMenus` only); no post-text
  retention (competitor review: "Do not retain post text just because a
  competitor lists a review panel"); conventional-ish commits;
  `xvfb-run -a` for browser runs.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke | `npm run smoke` | declared | exit 0 |
| Lint | `npm run lint` | declared | exit 0 |
| Typecheck | `npm run typecheck` | declared | exit 0 |
| Unit | `npm run test:unit` | declared | all pass (81 at `3aef7b9`) |
| Spike tests | `node --test plans/research/075/*.test.cjs` | declared | all pass |
| Full e2e (no-false-positive proof) | `npm run test:extension` | declared | both scripts exit 0 |

## Scope

**In scope** (the only files you should modify/create):
- `plans/research/075/` (create): `design.md`, `health-probe.cjs` (or
  equivalent throwaway counter prototype + mock-page run), `*.test.cjs`,
  `browser-observations.json` (if a probe run is made), `verdict.json`
- `plans/README.md` (your status row only)

**Out of scope** (do NOT touch, even though they look related):
- `content.js`, `shared/post-container.js`, popup/options files,
  locales, manifest — read-only. The verdict may *specify* the hook
  points and counter shapes for a future build plan; it must not wire
  them. (A throwaway in-page counter for the mock-page probe is fine —
  it lives in the research dir, mirroring the 068 probe's about:blank
  discipline, never the production content script.)
- Any design that retains post text, sends network requests, asks for
  new permissions, or lets the signal influence blocking (hide/show,
  forceShow, cooldowns, counts). Observe-only is the entire safety
  case; violating it voids the spike.
- Fixing actual LinkedIn markup drift (none is known at plan time) and
  Firefox probe equivalents (record as follow-up if skipped).

## Git workflow

- Branch: `advisor/075-drift-tripwire`
- Commit per step; message style: conventional-ish (see `git log --oneline`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run smoke, lint, typecheck, unit, and the full `test:extension` suite
on the unmodified checkout. Read `content.js:1195-1240` (observer
setup + callback) and `shared/post-container.js:60-198` (remaining
strategies + thresholds) end to end — the design must name real hook
points, not remembered ones.

**Verify**: all gates green (record exact results); you can cite the
observer callback's lines and the `CONFIG` threshold names from memory
of this read (test yourself: write them in the design without
re-opening — then re-open to confirm).

### Step 1: Write the signal design (`design.md`)

Define, with numbers:

1. **What is counted** (counts only, never text): e.g. per-scan
   `textNodesSeen` (from `findSpamTextNodes`), `containersResolved`
   (non-null `SS_findPostContainer`), `postsEnumerated` (author/label
   pass candidates), over tumbling windows keyed to scan invocations
   (not wall-clock — wall-clock couples to the 500 ms debounce +
   idle-callback jitter quoted above).
2. **Fire condition**: e.g. "≥ N consecutive post-bearing scans with
   `postsEnumerated > 0` but `containersResolved == 0`" — with N
   justified against slow-load behavior (initial scan + 2–3 mutation
   rounds must not fire on a cold LinkedIn load; state the warm-up
   exclusion explicitly). Also define the *reset* condition (one
   resolved container clears the streak — no latching on transient
   emptiness such as an empty search page).
3. **Where the signal goes** (recommend exactly one): console-only
   (cheapest, maintainer-visible via user console pastes), popup health
   line (user-visible, needs popup storage read + locale keys — cost
   it), or options diagnostics section (same costs, less visible).
   Justify against the false-alarm risk rating (Risk: MED above).
4. **What the signal must never do**: influence `processed`/`forceShow`,
   counts, badge, cooldowns, placeholders, storage writes beyond one
   local health flag at most (name it or defer it — no new
   `STORAGE_KEYS` entry in the spike).
5. **Quietness budget**: the full existing e2e suite + the current mock
   feed must produce ZERO fires (this is Step 3's gate, stated here so
   the design is written to be falsifiable).

**Verify**: design names exact hook lines (scan + observer callback),
states N with warm-up + reset rules, picks one destination with
costing, and contains the five section headings above — reviewable by
a maintainer who never saw this plan's context.

### Step 2: Prototype the counter (research dir only)

Build `health-probe.cjs`: a small counter module (same precedence-free
shape — pure functions over synthetic scan-event sequences) plus
`*.test.cjs` pinning: cold-start sequence stays silent; sustained
zero-resolution streak fires exactly once; single resolved container
resets; empty-page sequence (zeros throughout) stays silent (distinguish
"no posts" from "posts but no containers" — the latter needs a
`postsEnumerated`-style input; assert both). ≥ 12 assertions.

Optionally run a mock-page browser probe (about:blank discipline per
the 068 probe header: never production script, never live account):
restructured-markup variant fires, current mock stays silent. If the
toolchain fights back, the sequence tests + a documented manual run
suffice — record which you did.

**Verify**: `node --test plans/research/075/*.test.cjs` all pass;
`npm run lint` exits 0 (research files are linted — check
`eslint.config.js` covers `plans/` first; if it ignores research dirs,
state that instead of "fixing" config).

### Step 3: Prove quietness on the real suite

The spike changes no production file, so `npm run test:extension` green
is necessary but not sufficient — additionally argue (in `verdict.json`,
one paragraph with file:line evidence) why each existing e2e scenario
class (initial scan, dynamic append, comment containers, restore/rescan,
toggle/snooze flows) would NOT trip the Step-1 fire condition. Where the
argument is thin (e.g. debounce-timing races), say so and name the
browser proof a build plan must include.

**Verify**: `npm run test:extension` exits 0; verdict contains the
quietness paragraph with at least one file:line citation per scenario
class.

### Step 4: Record the verdict (`verdict.json`)

Mirror prior verdict shapes: `plan`, `verdict` (`proceed` with the
specified hook points + destination, or `no-go`/`insufficient-data`
with the noise evidence — a no-go on quietness grounds is valid
completion), `decidedAt`, `baseSha`, `productionFiles` (future build's
list or `[]`), `checks[]`, `measuredResults` (test counts, probe
outcomes), `missingEvidence`, `selectorNotes[]` (anything the
restructured-markup work revealed about container-selector fragility —
findings, not fixes), `nextWork`.

**Verify**: JSON parses; every check matches a command actually run;
the fire condition's N appears identically in `design.md` and
`verdict.json` (grep both).

## Test plan

- Sequence-level tests in `plans/research/075/*.test.cjs` (Step 2,
  ≥ 12 assertions): silence on cold-start/empty-page, single fire on
  sustained drift, reset on resolution. Model on
  `plans/research/068/detector.test.cjs` table shape.
- Optional mock-page probe (Step 2) for DOM realism.
- No production tests change; existing e2e green + the Step-3
  quietness argument are the false-positive proof.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test plans/research/075/*.test.cjs` → all pass (≥ 12 assertions)
- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`,
  `npm run test:unit` → green
- [ ] `npm run test:extension` → exit 0 (quietness necessary condition)
- [ ] `plans/research/075/` contains `design.md`, probe/tests,
  `verdict.json` (+ observations file only if a probe ran)
- [ ] Fire-condition N identical in `design.md` + `verdict.json`
  (`rg -n "consecutive" plans/research/075/design.md
  plans/research/075/verdict.json` shows the same number)
- [ ] `git diff --name-only 3aef7b9...HEAD` lists only `plans/` paths
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match live code (drift —
  especially 073/074 or pending builds touching `content.js` scan
  paths or `shared/post-container.js` thresholds).
- Any workable signal requires retaining post text, network access, new
  permissions, or coupling to blocking state — the safety case is void;
  record no-go rather than redesigning around the prohibition.
- The quietness proof fails (existing scenarios would plausibly fire
  the tripwire and no threshold fixes it without blinding real drift)
  — that IS the no-go verdict; write it up, don't tune N until it
  passes (tuning the gate to fit is the same sin as editing a baseline
  to fit — cf. `baseline.json`'s "Do not edit to fit").
- A step's verification fails twice after a reasonable fix attempt.
- The work appears to need production edits "just to measure" —
  measurement happens in the research dir or not at all.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- A `proceed` verdict becomes a build plan that MUST include a
  real-LinkedIn soak criterion (e.g. N days of daily use across feed +
  search with zero unexplained fires, logged via the console channel
  first) before any user-visible surface ships. Console-first, UI
  second — in that order, no skipping.
- **Deferred:** Firefox behavior parity; options-diagnostics vs popup
  destination if the verdict picked console-first (second-stage plan).
- **Deferred:** using drift signal to auto-suggest "Report missed
  spam" — explicitly out of bounds (reporting stays user-initiated per
  the 063 contract; a monitor that cries spam-adjacentWolf erodes the
  trust the placeholder system is built on).
- Reviewers should scrutinize: the warm-up exclusion (too short =
  false fires on slow loads; too long = blind to real drift), and any
  prototype state shared with matching logic (must be none — separate
  counters, separate module).
