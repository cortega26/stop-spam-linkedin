# Plan 041: Design spike — per-pattern block stats (direction D2)

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a
> build-everything plan. You will NOT ship the feature. You will produce a
> written design (in `plans/041-per-pattern-stats-design.md` or as a
> section appended to this file) plus a throwaway prototype branch that
> proves the storage + rendering approach works. Follow the steps, run the
> verifications, and STOP at the end — do not merge anything.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js popup/popup.js options/options.js`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (spike)
- **Risk**: LOW (prototype only; nothing ships)
- **Depends on**: none (soft: 022 lands first — the stats shape change
  touches the same storage area)
- **Category**: direction (design/spike)
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters (the asymmetry being explored)

Per-block match attribution already exists: `blockPost` receives `info`
with `{label, source, id}` and stores `label`/`source` on `lastBlocked`
entries (`content.js:803-814`, exposed via `getState` and rendered in the
popup). But attribution lives only in the 5-slot in-memory undo window
and is discarded on tab close. Meanwhile the options page lets users
disable individual built-in patterns (`options/options.js:279-287`) with
**zero data** about which patterns actually fire in their feed. The
dataset that would inform that control is collected and thrown away.
This spike designs a `storage.local` shape for per-pattern counts,
verifies the migration story, and prototypes the popup/options rendering.

## Current state

- `content.js:803-814` — `lastBlocked` entries carry `label`/`source` (attribution exists per-block, in-memory only).
- `content.js:793-794` — `dailyCounts[key]` increments (day-keyed, no pattern dimension).
- `content.js:154-179` — `migrateRuntimeStorage` — the existing sync→local migration pattern to copy for any new key.
- `popup/popup.js:180-193` — today/week/lifetime totals; per-pattern would extend this.
- `options/options.js:279-287` — per-pattern disable toggles; per-pattern counts would sort/annotate these rows.
- `shared/pattern-data.js` — pattern ids are stable (`EN-1` … `DE-2`) — the natural bucket keys.

Repo conventions: all runtime counters in `chrome.storage.local`,
`ss_`-prefixed keys, migration helpers duplicated per context; zero
network — the design must keep counts local-only (they are PII-adjacent:
they reveal what a user's feed contains; that's fine locally, and the
design must state it stays local).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass            |
| E2E       | `npm run test:extension` | both files pass     |

## Scope

**In scope** (prototype only):
- `content.js` (a `ss_pattern_counts` write + migration hook — on the
  spike branch, reverted or kept behind a flag at the end)
- `popup/popup.js` + `popup/popup.html` (a per-pattern row prototype)
- `options/options.js` + `options/options.html` (hit-count annotation on
  pattern rows)
- `shared/pattern-data.js` (if a helper for bucket normalization is
  needed)
- `tests/unit/` + e2e only where the spike needs a guard

**Out of scope** (do NOT touch):
- Anything in `content.js`'s blocking pipeline beyond the one
  increment line.
- The badge, snooze, exclusion, or import/export flows (unless the
  design decides counts belong in backup — then note it, don't build it).

## Git workflow

- Branch: `advisor/041-per-pattern-stats-spike`
- Commit messages: prefix everything `spike(041):` so the branch is
  unambiguously throwaway.
- At the end: `git checkout <base>` and leave the spike branch — do NOT
  merge, do NOT delete it without asking.

## Steps

### Step 1: Design the storage shape and migration

Write the design into `plans/041-per-pattern-stats-design.md` (create
it). Cover:

- Key: `ss_pattern_counts` in `chrome.storage.local`, shape
  `{ "EN-1": 3, "custom": 2, ... }` (proposal — evaluate alternatives).
- Bucket keys: pattern id when `info?.id` exists; `"custom"` for custom
  phrases; `"author"` for author-blocklist blocks; excluded from
  label-hides (Promoted/Featured don't count as blocks — match
  `blockPost`'s existing `isLabelBlock` exclusion at `content.js:793`).
- Increment site: the exact line in `blockPost` that already does
  `blockedCount++` + `dailyCounts[key]++` — add the pattern bucket there.
- Migration: `migrateRuntimeStorage` pattern (existing migration for
  sync→local at `content.js:154-179`) — what happens for existing users
  (nothing to migrate; new key starts empty) and for the multi-tab race
  (same accepted caveat as `blockedCount`).
- Privacy statement: counts stay in `storage.local`; not exported in
  backup (or is it? decide and justify).

### Step 2: Prototype the content-script write

On the spike branch, implement the increment + `storage.local.set` (with
the plan-031 error-check callback). Wire it so the popup prototype can
read it. Verify: `npm run test:unit` + `npm run test:extension` pass.

**Verify**: e2e passes with the extra write in place.

### Step 3: Prototype popup + options rendering

Popup: after the today/week/lifetime row, a "by pattern" breakdown row
reading `ss_pattern_counts` (via the existing `getLocalStorage`-style
read in popup). Options: annotate the per-pattern toggle rows with the
count. Keep both minimal — this is a spike to answer "does this feel
right", not a polished UI.

**Verify**: `npm run test:extension` passes (or the spike's own checks —
document deviations).

### Step 4: Write the design document verdict

End the design doc with: storage shape decision, migration story, UI
placement, what the prototype showed, open questions (backup inclusion,
multi-tab semantics, reset UX), and a recommendation whether to proceed
to a build plan. Then reset the branch's working tree to the base commit
(keep the design doc in `plans/` — it IS the deliverable).

**Verify**: `git status` clean on the base branch; `plans/041-per-pattern-stats-design.md` exists.

## Test plan

Prototype guards only — the spike's tests are the e2e runs in Steps
2-3. The design document is the real deliverable.

## Done criteria

- [ ] `plans/041-per-pattern-stats-design.md` exists with the sections from Step 1 + verdict from Step 4
- [ ] Prototype branch (`advisor/041-per-pattern-stats-spike`) exists with the steps committed, prefix `spike(041):`
- [ ] Base branch working tree is clean (`git status`)
- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0 on the base branch
- [ ] `plans/README.md` status row updated (DONE — design delivered, feature not built)

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- The prototype reveals the storage shape can't support the UI (e.g.
  counts need timestamps for "this week" views) — document the finding
  in the design doc and stop; the shape is the point of the spike.
- You find yourself adding non-`ss_`-prefixed keys or touching the
  badge logic — both out of scope.

## Maintenance notes

- This spike is explicitly throwaway; if it produces a build plan, the
  build plan starts from the design doc, not the spike branch.
- The counts are local-only by design (privacy positioning); the design
  doc must restate this and flag any temptation to sync them as a
  violation.
- Reviewer should check the design doc's migration section against the
  real `migrateRuntimeStorage` code — the pattern must be copied, not
  reinvented.
