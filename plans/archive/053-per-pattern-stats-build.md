# Plan 053: Build persistent per-pattern blocked stats (from the 041 spike design)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- content.js popup/popup.js popup/popup.html options/options.js shared/constants.js plans/archive/041-per-pattern-stats-design.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Also re-read the archived 041
> design — it is the authority this plan implements.)

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (touches the counting path + two UI surfaces; storage shape is pre-decided)
- **Depends on**: `plans/archive/041-per-pattern-stats-design.md` (read-only — the design is committed, so no ordering constraint; do NOT re-derive what it decided). **Run BEFORE plan 050** — this plan adds EN/ES-only locale keys (see STOP conditions)
- **Category**: direction (build — implements a finished spike design)
- **Planned at**: commit `ffdffab`, 2026-09-07; refreshed in place at
  `4f80330` (2026-09-13) after the plan-048 merge — line citations
  re-verified, unit count 63→64, design-doc
  line numbers mapped to live symbols, scope check switched to
  `main...HEAD`, locale-ordering STOP added

## Why this matters

The popup's match attribution (plan 010) dies with the 5-slot in-memory
`lastBlocked` window: users can see *what* was blocked recently but never
*which patterns earn their keep* over time. Persistent per-pattern counts
turn the per-pattern toggles (plan 011) from guesswork into an honest
feedback loop — a frozen bucket means a pattern (or custom phrase) never
fires. The storage shape, increment site, migration story, and privacy
decision were all settled and prototyped green by the 041 spike; this plan
builds exactly that, resolving only the small open questions the spike left.

## Current state

Decisions inherited from the archived design (Step 1: read the full
`## Design deliverable` + `**Open questions**` + `**Recommendation**`
sections — the summary below does not replace them):

- **Line numbers in the archived 041 design predate the plan-048 merge**
  (e.g. it cites `content.js:803-814` for the counting block). Locate every
  design-cited site by SYMBOL, never by line. Live anchors at `4f80330`:
  - counting block `if (!isLabelBlock && !counted.has(post))` —
    `content.js:742` (`isLabelBlock` defined at `:727`)
  - the persisted counter write (`[STORAGE_KEYS.COUNT]: blockedCount,`
    `[STORAGE_KEYS.DAILY_COUNTS]: dailyCounts`) — `content.js:993-994`
  - `migrateRuntimeStorage` — `content.js:119`
  - content `case "resetCount"` — `content.js:343` (clears COUNT and
    DAILY_COUNTS at `:347-348`); content `case "getState"` — `content.js:301`
  - popup `getStoredState` — `popup/popup.js:76`; `setExtensionState` —
    `popup/popup.js:126`; popup reset send — `popup/popup.js:328`
  - options `createBuiltinRow` — `options/options.js:1402`
  - plan 035's stats e2e (the structural pattern for Step 4) —
    `tests/extension-smoke.js:119-126` and `:167`,
    `tests/extension-interactions.js:88-96` and `:403-407`
- **Key/shape**: `ss_pattern_counts` in `chrome.storage.local`, added to
  `STORAGE_KEYS` in `shared/constants.js` as `PATTERN_COUNTS` (repo rule:
  every key `ss_`-prefixed, defined once). Flat map bucket → lifetime
  count, e.g. `{ "EN-1": 3, "custom": 2, "author": 1 }`; absent reads as 0;
  lifetime semantics matching `ss_blocked_count`, reset together with it.
- **Buckets** (derived from `blockPost`'s `info` at the increment site):
  `info.id` for built-ins (`"EN-1"`), `"custom"` when
  `info.source === "custom"`, `"author"` when
  `info.reason === "author-blocklist"`, `"builtin"` defensive fallback only.
- **Increment**: inside `blockPost`'s existing guarded counting block (the
  `if (!isLabelBlock && !counted.has(post))` neighborhood — Promoted/
  Featured label-hides are excluded automatically); persist by extending the
  existing single `chrome.storage.local.set` (with its plan-031 error
  callback) — no new write path, all three counters in one write.
- **Migration**: NONE — the key never lived in sync, so it must NOT be
  added to the `migrateRuntimeStorage` key list; existing users start empty,
  no backfill. Multi-tab last-writer-wins caveat accepted (same as
  `blockedCount`). Reset: clear it in BOTH `resetCount` paths (content
  handler + popup offline `setExtensionState` fallback).
- **Privacy (decided)**: local-only; NOT included in backup/export (export
  carries user intent, not feed-composition telemetry). No network impact.
- **UI**: popup "By pattern" section + options-page per-builtin-row count
  annotations. The spike hardcoded two strings — **the build MUST add real
  keys to both `_locales/en` and `_locales/es`** instead.
- **Open questions left for this build** (resolve each, document the
  choice): per-row reset on options (recommended: defer — see Done
  criteria); "week by pattern" (defer — needs day-nested shape, rejected
  for this iteration); options live-update vs stale-until-reload
  (recommended: stale-until-reload with a code comment, matching the
  section's load-time render); custom/author aggregates on options
  (recommended: one small totals line; drop it if it complicates the rows).
- Reference only: prototype branch `advisor/041-per-pattern-stats-spike`
  (on origin, throwaway — build from the design doc, not the branch).
- Repo conventions (AGENTS.md): `"use strict"` IIFEs; `SS_*` shared
  exports with `types/globals.d.ts` + `eslint.config.js` updates if new
  globals appear; no build step.

## Commands you will need

| Purpose   | Command                  | Provenance | Expected on success |
|-----------|--------------------------|------------|---------------------|
| Smoke     | `npm run smoke`          | executed   | exit 0              |
| Lint      | `npm run lint`           | executed   | exit 0              |
| Typecheck | `npm run typecheck`      | executed   | exit 0              |
| Unit      | `npm run test:unit`      | executed   | 64/64 pass          |
| Ext e2e   | `npm run test:extension` | declared   | exit 0              |
| Pkg e2e   | `npm run test:package`   | declared   | exit 0              |

## Scope

**In scope**:
- `shared/constants.js` (`PATTERN_COUNTS` key)
- `content.js` (increment, persistence, both `resetCount` paths)
- `popup/popup.js` + `popup/popup.html` ("By pattern" section + state plumbing incl. the offline `getStoredState` path)
- `options/options.js` (builtin-row annotations + optional totals line)
- `_locales/en|es/messages.json` (the two hardcoded spike strings as real keys, both files)
- `tests/extension-interactions.js` or `tests/extension-smoke.js` (e2e scenario)

**Out of scope** (do NOT touch):
- Backup/export shape — counts stay out (decided; changing it means arguing against the privacy statement first).
- `migrateRuntimeStorage` key list, `ss_daily_counts` shape, `background.js`, `STORE_ASSETS.md`, badges.
- Per-row reset buttons, week-by-pattern views — deferred, record as `**Deferred:**` lines.

## Git workflow

- Branch: `advisor/053-per-pattern-stats`
- Commit per step or logical unit; conventional-ish, e.g. `feat(stats): persist per-pattern blocked counts` (see `git log --oneline`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run the four executed commands unmodified; confirm tabled results. A
`declared` failure is a broken baseline — STOP and report.

**Verify**: smoke/lint/typecheck exit 0; unit 64/64 pass.

### Step 1: Read the design doc end to end

Read `plans/archive/041-per-pattern-stats-design.md` fully (deliverable +
all 7 open questions + recommendation). Confirm the spike branch exists
remotely for reference (`git branch -a | grep 041`) — if it is gone, that
is fine (the doc is the authority), just note it in the commit message.

**Verify**: `npm run smoke` → exit 0 (no changes yet).

### Step 2: Storage + counting

Add `PATTERN_COUNTS: "ss_pattern_counts"` to `STORAGE_KEYS`; derive the
bucket at the increment site per the design's table; extend the single
`local.set` (keep the plan-031 error callback); clear the key in both reset
paths. Add the `local.get` read for the popup/state plumbing (NOT to the
sync-migration list).

**Verify**: `node --check content.js && npm run lint && npm run typecheck` → exit 0.

### Step 3: Popup + options surfaces + locales

Popup "By pattern" section (read the design's UI notes; plumb through both
`getState` live and `getStoredState` offline paths so the section renders
without a live tab); options builtin-row annotations (+ totals line unless
it complicates — decide and document); real en+es keys for both spike
strings (verify each key exists in both files).

**Verify**: `npm run lint && npm run typecheck` → exit 0; `grep` the two new keys in both locale files.

### Step 4: e2e + full verification

Extend the stats-pipeline e2e (plan 035's scenario is the pattern —
`tests/extension-interactions.js:88-96` and `:403-407`): block a
built-in hit + a custom-phrase hit, assert popup shows both buckets;
reset, assert all three counters (total + buckets) clear. Then:

```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package
```

**Verify**: all green including the new assertions.

## Test plan

- e2e (Step 4): bucket increments per source, label-hides excluded,
  reset clears. Structural pattern: plan-035 stats scenario.
- No unit tests required (derivation is inline at the increment site per
  the design); if you extract a pure bucket helper for clarity, pin it
  with 3–4 unit cases in `tests/unit/pattern-data.test.js` style.
- Prove the privacy decision: `grep` export/import code paths for
  `PATTERN_COUNTS` → no matches.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 / pass
- [ ] `npm run test:extension` + `npm run test:package` exit 0 with the new stats assertions
- [ ] New locale keys present in BOTH `_locales/en` and `_locales/es`
- [ ] `grep -rn PATTERN_COUNTS options/options.js` (export/import) → no matches (not in backup)
- [ ] `grep -n PATTERN_COUNTS content.js` shows no addition to the migration key list
- [ ] `git diff --name-only main...HEAD` (three dots — merge base) lists only in-scope files
- [ ] Locale key sets in `_locales/en` and `_locales/es` are equal (symmetric difference empty)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `_locales/fr/`, `_locales/pt/`, or `_locales/de/` exists (check with
  `ls _locales`). Plan 050 landed first and its parity check requires every
  new key in all shipped locales. Do NOT add FR/PT/DE strings yourself —
  unvalidated translations are what plan 050 forbids. Report it so the
  maintainer can source translations or resequence.
- A design-cited SYMBOL (increment block, reset paths, popup state functions) is missing or behaves differently from what the design describes. Shifted line numbers alone are expected (see "Current state") and are NOT a STOP.
- The spike branch is gone AND the design doc is ambiguous on a load-bearing point (one missing source is fine; both is not).
- The popup offline path cannot serve the new key without restructuring `getStoredState` (decide stale/hidden instead — don't restructure).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If pagination/time-windowed stats ever arrive, revisit the flat shape via the day-nested migration path named in the design — do not bolt timestamps onto this map.
- A reviewer should confirm the three counters can never disagree (single write, joint reset) and that disabled patterns freeze rather than vanish.
- **Deferred:** per-row options reset — unblocked by nothing, just not worth it now.
- **Deferred:** week-by-pattern — unblocked by a shape migration to day-nested counts.
