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

## Design deliverable (spike output)

> Appended by the plan-041 spike executor on the branch
> `advisor/041-per-pattern-stats-spike` (base commit `804fcb2`, executed
> 2026-08-15). This is the spike's written deliverable. All live-code
> citations below were located by symbol name, not by the stale line
> numbers in the plan text.

### Step 1: Storage shape and migration

#### Key and shape (decision)

- **Key**: `ss_pattern_counts` in `chrome.storage.local` (added to
  `STORAGE_KEYS` in `shared/constants.js` as `PATTERN_COUNTS`, per the
  repo convention that every key is `ss_`-prefixed and defined once).
- **Shape**: flat map of bucket id → lifetime count:
  `{ "EN-1": 3, "custom": 2, "author": 1 }`. Absent key or absent bucket
  reads as `0`. The count is **lifetime**, matching the semantics of
  `ss_blocked_count` — per-pattern numbers are a breakdown of the same
  lifetime total, reset together with it via the existing `resetCount`
  action.

**Alternatives evaluated**:

1. **Flat map (chosen)** — one local key, one `.get` to read, trivially
   merged, natural reset companion to `ss_blocked_count`. Limitation:
   it cannot answer "this week by pattern" (no timestamps).
2. **Nested day key** — `ss_daily_counts` extended to
   `{ "2026-08-15": { "EN-1": 1 } }`. Would support time-windowed
   per-pattern views, but changes the shape of an existing key, forcing
   a migration + popup rollup changes for a P3 ask. Rejected for this
   iteration; noted as the migration path if "this week by pattern"
   becomes a requirement.
3. **Event log** — `[{ pattern, ts }]`. Maximum query flexibility,
   unbounded growth requiring a retention/prune policy, and it is the
   most PII-adjacent option (a full history of every blocked post's
   category). Rejected.

The flat map supports the planned UI (per-pattern rows with lifetime
counts, plus the existing today/week totals unchanged); it does NOT
block it, so no STOP condition fires on the shape.

#### Bucket keys

Derived at the increment site from `blockPost`'s `info` argument:

| Bucket | Condition | Example |
|--------|-----------|---------|
| `info.id` | built-in match (`SS_buildPatterns` entries carry the stable id, `shared/pattern-data.js` buildPatterns pushes `id: entry.id` for built-ins) | `"EN-1"`, `"DE-2"` |
| `"custom"` | custom-phrase match (`info.source === "custom"`, custom entries carry no id) | `"custom"` |
| `"author"` | author-blocklist block (`info.reason === "author-blocklist"`) | `"author"` |
| `"builtin"` | defensive fallback only — unreachable in practice because every text match carries either an id or `source` | `"builtin"` |

**Excluded**: Promoted/Featured label-hides never increment any bucket.
The increment lives inside `blockPost`'s existing
`if (!isLabelBlock && !counted.has(post))` block (`content.js:757-762`
by current line numbers), so the existing `isLabelBlock` exclusion is
inherited automatically.

**Nice property**: a pattern the user disables stops accruing counts
automatically — disabled ids are filtered out of `spamPatterns` by
`SS_buildPatterns`, so no future match can attribute to them. Counts
therefore double as an honest "is this pattern still useful" signal:
a disabled pattern's bucket freezes.

#### Increment site and persistence

- Increment: immediately after `dailyCounts[key] = (dailyCounts[key] ||
  0) + 1;` inside the guarded counting block in `blockPost` — one line
  plus a small bucket-key derivation.
- Persistence: extend the **existing single**
  `chrome.storage.local.set({ [STORAGE_KEYS.COUNT], [STORAGE_KEYS.DAILY_COUNTS] })`
  call at the end of `blockPost` (`content.js:1002-1009`) with
  `[STORAGE_KEYS.PATTERN_COUNTS]`. The plan-031 error-check callback is
  already in place; no new write path is introduced, so all three
  counters stay consistent in one write.

#### Migration story

- `ss_pattern_counts` has never existed in `chrome.storage.sync`, so
  the `migrateRuntimeStorage` sync→local pattern (content.js:134-159)
  has **nothing to migrate** — the key is added to the
  `chrome.storage.local.get` list only and defaults to `{}`. It must
  NOT be added to the migration key list: that list exists to rescue
  keys that once lived in sync, and this key never did.
- Existing users: the key starts empty and accrues from the first block
  after upgrade. No backfill is needed or attempted (there is no
  historical per-pattern data — attribution was only ever held in the
  5-slot in-memory `lastBlocked` window).
- Multi-tab race: identical accepted caveat as `blockedCount` —
  independent content-script state per tab, last `local.set` writer
  wins (documented at content.js:998-1001). Impact is cosmetic count
  drift on a P3 telemetry surface; no correctness impact.
- Reset: `resetCount` (both the content-script message handler and the
  popup's offline fallback `setExtensionState` path) must also clear
  `ss_pattern_counts` so the three counters never disagree.

#### Privacy statement

Counts are local-only by design (`chrome.storage.local`). They are
PII-adjacent — they reveal what a user's feed contains — which is fine
locally and would NOT be fine anywhere else. **Decision: counts are NOT
included in backup/export** (backup flows are out of scope for this
plan; the design records the decision: export carries user intent
(phrases, exclusions) but not feed-composition telemetry). The extension
makes no network requests; nothing here changes that. Any future
temptation to sync or upload these counts is a privacy violation and
must be rejected (plan Maintenance notes).

### Step 2 + Step 3: What the prototype showed

The prototype branch (`advisor/041-per-pattern-stats-spike`, commits
`spike(041):`) implements, on top of the design above:

- **Content script** (`content.js` + one key in `shared/constants.js`):
  `patternCounts` state, loaded from local on init, incremented inside
  `blockPost`'s counting guard with the bucket derivation
  (id → `"custom"` → `"author"` → `"builtin"` fallback), persisted in
  the existing single `local.set`, exposed via `getState`, cleared by
  `resetCount`, and kept live across tabs via the existing `onChanged`
  local handler. No new write path; plan-031 error-check callback
  reused.
- **Popup** (`popup/popup.js` + `popup/popup.html`): a "By pattern:"
  row under the today/week/lifetime stats row, reading
  `response.patternCounts` (live via `getState`, offline via
  `getStoredState`'s new local read), top-5 buckets sorted desc,
  pattern ids mapped to labels from `SS_PATTERN_DATA`. Offline reset
  fallback also clears the key.
- **Options** (`options/options.js`): `load()` now reads
  `ss_pattern_counts` from local before the first `render()`; builtin
  rows with a non-zero count get a `· N` annotation.

**Verification results (all on the spike branch)**:

| Gate | Result |
|------|--------|
| `npm run smoke` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 63/63 pass |
| `npm run test:extension` | both files pass (run twice — once after Step 2, once after Step 3) |

The e2e suite has no assertions on `ss_pattern_counts` (it asserts
`dailyCounts` and `blockedCount` only), so the extra write is
behaviourally neutral to existing tests — the runs prove the write
path doesn't break the blocking pipeline. No new tests were added (the
plan's test plan is prototype guards only).

**What the prototype confirmed**:

- The flat map fully supports the planned UI — per-pattern rows with
  lifetime counts render correctly in both surfaces from the same
  storage key, with no shape change needed. The STOP condition about
  the shape not supporting the UI does NOT fire.
- The bucket derivation handles every real `info` variant: built-ins
  (id present), custom phrases (`source: "custom"`), author-blocklist
  (`reason: "author-blocklist"`), and label-hides (never reach the
  increment, excluded by `isLabelBlock`).
- The options annotation is trivially readable from local at load;
  no options-page storage-layer changes were needed.
- One UX observation: the options page's `onChanged` handler returns
  early for `area !== "sync"`, so an open options tab does NOT
  live-update counts when the content script writes them — the counts
  are read once at load. Acceptable for a spike; the build plan should
  either accept stale-until-reload or add a local-area listener.

### Step 4: Verdict

**Storage shape decision**: flat lifetime map `{ bucket: count }` under
`ss_pattern_counts` in `chrome.storage.local`, bucket ids as defined in
Step 1. Confirmed by the prototype; no shape change required.

**Migration story**: nothing to migrate — the key never lived in sync;
add it to the `local.get` list only, default `{}`. The
`migrateRuntimeStorage` pattern is copied in spirit (single key, local
read with fallback, `local.set` with lastError guard) but the migration
list itself must NOT gain the key. Multi-tab race accepted (same as
`blockedCount`, documented at content.js:998-1001).

**UI placement**: popup — one breakdown row directly under the
today/week/lifetime row (top 5, desc, pattern labels resolved from
`SS_PATTERN_DATA`; `custom`/`author` buckets render by bucket name).
Options — lifetime count annotation on each builtin toggle row.
Both read the same key; the popup also gets an offline fallback read.

**What the prototype showed**: listed above — shape works, all gates
green, e2e green twice, no new write paths, counts stay local-only.

**Open questions for the build plan**:

1. **Backup inclusion** — decided: NO. Counts are feed-composition
   telemetry; export carries user intent data (phrases, exclusions)
   but not this. If the build plan disagrees, it must argue against
   the privacy statement first.
2. **Multi-tab semantics** — accepted as-is (last writer wins, same
   caveat as `blockedCount`). A service-worker serialised counter is
   the eventual fix for all three counters, not just this one.
3. **Reset UX** — counts reset with `resetCount` in both the
   content-script and popup-offline paths. Open: should the options
   page also get a per-pattern reset (e.g. a per-row "×" to clear one
   bucket)? Not built; flagging as a product question.
4. **"This week by pattern"** — the flat shape cannot answer it. If
   wanted, the day-nested shape (`ss_daily_counts` extended per day) is
   the migration path; not needed for the P3 ask.
5. **i18n** — the prototype hardcodes the two spike strings ("By
   pattern:" in popup.html, the count annotation title in options.js)
   to avoid touching `_locales/` outside the spike's file list. The
   build plan MUST add proper keys to both `_locales/en` and
   `_locales/es` instead.
6. **Options live updates** — an open options tab shows counts as of
   load (see prototype observation); decide stale-until-reload vs a
   local-area listener in the build plan.
7. **Custom/author buckets on the options page** — the prototype only
   annotates builtin rows; decide whether the options page should show
   `custom`/`author` aggregates (e.g. a small totals line).

**Recommendation**: proceed to a build plan. The spike proved the
storage shape, the increment site, the migration story, and both UI
surfaces with the full verification suite green. The build plan should
start from this design document (not the spike branch), implement the
three counter changes (increment, reset, getState/getStoredState),
the two UI surfaces, and the i18n keys from open question 5. The
prototype branch stays throwaway; the working tree has been reset to
the base commit `804fcb2`.
