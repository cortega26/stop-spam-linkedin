# Plan 043: Design spike — productize the suggestion loop (direction D4)

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a
> build-everything plan. You will NOT ship the feature. You will produce a
> written design document and a throwaway prototype branch that proves the
> storage + options-surface approach. Follow the steps, run the
> verifications, and STOP at the end — do not merge anything.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js popup/popup.js options/options.js`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (spike)
- **Risk**: LOW (prototype only)
- **Depends on**: none
- **Category**: direction (design/spike)
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters (the asymmetry being explored)

The suggestion loop is the one v1.0 feature that never evolved: every
built-in match auto-suggests the quoted trigger word as a custom phrase
(`content.js:816-826`), but the queue (`pendingSuggestions`) and
dismissals (`dismissedSuggestions`) are in-memory, capped at 3, and the
only surface is the popup gated on a live LinkedIn tab (`popup/popup.js:242-278`).
Suggestions vanish on reload; there is no options-page surface; and the
only action beyond dismiss is "Add as exact bare-word phrase" — the same
false-positive amplifier the maintainer accepted only as deliberate
opt-in for the starter pack. The spike designs persistence to
`storage.local`, an options-page surface, and evaluates fragment-based
suggestion derivation.

## Current state

- `content.js:816-826` — suggestion push (`pendingSuggestions`, capped 3, in-memory).
- `content.js:130-131, 824` — the queues are module-level, non-persistent.
- `content.js:435-441` — Add creates an exact-mode bare-word phrase (the false-positive amplifier).
- `content.js:460-464` — dismissal adds to an in-memory `dismissedSuggestions` set.
- `popup/popup.js:242-278` — the suggestion section, gated on `hasLiveState`.
- `options/options.js` — no suggestion surface.
- `CHANGELOG.md:146` — "suggestions" listed in 1.0.0, unchanged across 11 releases.

Repo conventions: persistence via `chrome.storage.local` with `ss_`
keys + migration helper; the repo has an established precedent for
adding management UIs to previously-invisible state (plan 007 did it
for exclusions). Zero network — the design must stay local.

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
- `content.js` (persist suggestion queue + dismissal set on the spike branch)
- `popup/popup.js` + `popup/popup.html` (read from storage in fallback state)
- `options/options.js` + `options/options.html` (a suggestions section prototype)
- `shared/pattern-data.js` (only if a fragment-derivation helper is prototyped)
- The design document (see Step 1)

**Out of scope** (do NOT touch):
- The starter-pack phrase set and its exact-mode semantics (deliberate
  opt-in; the design may *propose* changing suggestion-add mode, but the
  prototype must not change starter-pack behavior).
- The block pipeline itself.
- `background.js`.

## Git workflow

- Branch: `advisor/043-suggestion-loop-spike`
- Commit messages: prefix everything `spike(043):`.
- At the end: `git checkout <base>` and leave the spike branch — do NOT
  merge, do NOT delete without asking.

## Steps

### Step 1: Design the persistence + surface

Write the design into `plans/043-suggestion-loop-design.md` (create
it). Cover:

- Storage: `ss_pending_suggestions` + `ss_dismissed_suggestions` in
  `chrome.storage.local` (proposal — evaluate: single key vs two, size
  caps, eviction of stale suggestions by timestamp).
- Migration: existing `migrateRuntimeStorage` pattern (`content.js:154-179`).
- Options surface: a "Suggestions" section listing pending suggestions
  with "Add as exact" / "Add as contains" / "Dismiss" actions — how it
  mirrors the existing excluded-list section (`options/options.js:1006-1060`).
- Popup: keep the live-tab quick surface, add the stored fallback read.
- Suggestion derivation: evaluate deriving from the matched sentence
  fragment (`extractTrigger`) instead of the bare quoted word; discuss
  the false-positive trade-off explicitly against the starter-pack
  precedent (`plans/README.md:269-272`).
- Privacy: suggestions are excerpts of the user's feed — local-only, and
  the design must decide whether they belong in export/backup (plan 027
  territory) or are ephemeral.

### Step 2: Prototype persistence + popup fallback

On the spike branch: persist the queues, restore on boot, render
suggestions from storage in the popup's fallback state (no live tab).
Verify: `npm run test:unit` + `npm run test:extension` pass.

**Verify**: e2e passes with persistence in place.

### Step 3: Prototype the options-page surface

Add a minimal suggestions section to options (mirroring the excluded
list's structure) with the three actions. Verify the flow works by
seeding storage and reloading the options page.

**Verify**: `npm run test:extension` passes (or the spike's own manual
checks — document deviations).

### Step 4: Write the design document verdict

End with: storage shape decision, surface placement, derivation
recommendation (with the false-positive trade-off), open questions
(backup inclusion, cap semantics, "contains vs exact" default), and a
proceed/no-proceed recommendation. Reset the branch working tree to the
base commit, keeping the design doc in `plans/`.

**Verify**: `git status` clean on the base branch; the design doc exists.

## Test plan

Prototype guards only. The design document is the deliverable.

## Done criteria

- [ ] `plans/043-suggestion-loop-design.md` exists with the sections from Step 1 + verdict from Step 4
- [ ] Prototype branch exists with `spike(043):` commits
- [ ] Base branch working tree clean (`git status`)
- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0 on base
- [ ] `plans/README.md` status row updated (DONE — design delivered, feature not built)

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- The prototype reveals the suggestions can't be meaningfully
  persisted without storing page text at scale (memory/quota) —
  document the finding; that's exactly what the spike is for.
- You find yourself touching the starter-pack semantics.

## Maintenance notes

- This is the second productized loop after exclusions (plan 007); the
  options-section structure is the reusable pattern.
- The false-positive trade-off (exact bare-word adds) is a product
  decision the design must surface honestly — the maintainer already
  accepted it once for the starter pack; the design should not relitigate
  it silently.
- Reviewer should verify the design doc's privacy section restates the
  local-only positioning (suggestions are feed excerpts).
