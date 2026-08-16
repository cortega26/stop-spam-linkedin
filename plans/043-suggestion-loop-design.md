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

---

## Design deliverable (spike output)

> Written by the plan 043 spike executor on branch
> `advisor/043-suggestion-loop-spike` (base commit `9523ba6`, after the
> drift check passed). Line numbers below are from the base tree and were
> verified by name during the spike. The verdict section was finalized
> after the prototype ran; see the `spike(043):` commits for the prototype
> itself.

### 1. Problem statement (as-built, verified on base)

- The suggestion queue is in-memory: `pendingSuggestions` /
  `dismissedSuggestions` are module-level state at `content.js:110-111`.
- Pushes happen only in `blockPost` for built-in matches:
  `content.js:784-793` (dedupe against dismissals, user phrases, and the
  queue; capped at 3 with FIFO `shift()`).
- The only surface is the popup, gated on a live LinkedIn tab:
  `popup/popup.js:252-288` (`hasLiveState && response.suggestions.length`).
  The popup's fallback path hardcodes `suggestions: []`
  (`popup/popup.js:128`), so with no live tab the section cannot render.
- "Add" always creates an **exact-mode bare-word phrase**:
  `content.js:415-452` (`mode: "exact"` at line 434). This is the same
  false-positive amplifier as the starter pack, which the maintainer
  accepted only as deliberate opt-in (`plans/README.md:331-335`).
- Dismissal is in-memory only (`content.js:454-458`); a dismissed word is
  re-suggested after any reload.
- The suggestion loop has not changed since 1.0.0 (`CHANGELOG.md:146`).

### 2. Storage design (decision)

**Two keys in `chrome.storage.local`, written together**:

- `ss_pending_suggestions`: array of `{ word: string, timestamp: number }`,
  capped at 3 (matches the existing in-memory cap).
- `ss_dismissed_suggestions`: array of `string` (word list).

Rationale:

- **local, not sync**: suggestions are excerpts of the user's feed and
  are ephemeral runtime state — they do not belong in the synced
  preference surface, and `storage.sync` has per-item byte quotas that
  would force needless pruning. This matches the existing split: runtime
  counters/state live in `storage.local` (AGENTS.md).
- **two keys, not one**: dismissal semantics (an ever-growing set that
  must never be re-suggested) differ fundamentally from the queue (small,
  FIFO, evictable). A single blob would force reading/writing the whole
  state for every mutation and make cap semantics muddier. Both are
  written in one `storage.local.set` call for atomicity.
- **size caps**: the pending queue keeps the in-memory cap of 3. The
  dismissed set is bounded by word-length validation on read
  (≤ `LIMITS.MAX_PHRASE_LENGTH`, 120) but has **no item cap** — dismissals
  must be permanent to be meaningful, and a word is ~1-10 bytes in a
  `storage.local` quota of 10 MB (unlimited), so unbounded growth is
  harmless at human scale (thousands of dismissals = kilobytes).
- **stale-suggestion eviction by timestamp**: **deferred**. The queue cap
  of 3 already bounds cardinality; timestamp eviction would add a second
  pruning dimension with no user-visible benefit at this volume. The
  timestamp field is kept so a future "expire after N days" policy can be
  added without a storage migration.

### 3. Migration

No migration of existing data is needed — the queues never persisted, so
there is nothing to move. The boot path follows the existing
`migrateRuntimeStorage` shape (`content.js:134-159`): a `storage.local.get`
of the two keys during init, with a sanitizer (`normalizePendingSuggestions`)
that validates shape (array, `word` is a non-empty string ≤ 120 chars,
`timestamp` is a number) and re-caps to 3. No sync→local migration helper
is needed because the keys never existed in `sync`.

Concurrency note: in-memory state remains authoritative while the content
script runs; the persisted copy is a mirror. The content script's existing
`chrome.storage.onChanged` listener (`content.js:237-311`) gains cases for
both keys so popup/options writes made *without* a live tab are picked up
on the next block (and on boot).

### 4. Options-page surface (design)

A "Suggestions" section in `options/options.html`, structurally mirroring
the excluded-list section (`options/options.js:1303-1378`,
`options/options.html:553-558`):

- section title `__MSG_suggestionsLabel__` (key exists in both locales);
- hidden entirely when the queue is empty;
- one row per pending suggestion: the word, plus three actions —
  **Add as exact** (writes `{ mode: "exact" }`, same semantics as the
  popup's Add today), **Add as contains** (writes `{ mode: "contains" }`,
  the mode already supported by `buildPatterns` in
  `shared/pattern-data.js:135-137`), and **Dismiss** (moves the word to
  `ss_dismissed_suggestions`).
- Validation mirrors `handleAdd` (`options/options.js:258-299`): length,
  case-insensitive duplicate, `LIMITS.MAX_CUSTOM_PHRASES`, and the
  `QUOTA_BYTES_PER_ITEM × 0.95` byte check — reusing the existing toast
  keys (`phraseTooLongToast`, `duplicatePhraseToast`, `phraseLimitToast`,
  `phraseStorageFullToast`).
- Live re-render via the existing `onChanged` listener (extended with a
  `local`-area branch; it currently returns early for non-sync changes,
  `options/options.js:147`).

**"Add as contains" is a deliberate, honest product addition**: the popup
surface forces exact bare-word adds (the false-positive amplifier); the
options surface offers the alternative mode at the point of decision. It
changes no existing behavior — starter-pack semantics and the popup's
exact-only Add are untouched.

### 5. Popup (design)

- Keep the live-tab quick surface exactly as-is (fast path via
  `getState`).
- Fallback path: `getStoredState` (`popup/popup.js:86-134`) reads
  `ss_pending_suggestions` and returns them instead of the hardcoded
  `[]`; `renderState` drops the `hasLiveState` gate on the suggestion
  section (renders whenever the list is non-empty).
- In fallback, Dismiss and Add act directly on storage (no content
  script): Add mirrors the content-script validation
  (`content.js:415-452`) against `ss_phrases` in `sync`, then writes the
  phrase and removes the word from `ss_pending_suggestions`; Dismiss
  writes both keys. The content script's `onChanged` handler picks these
  up when a live tab later exists.
- The fallback loop is a spike convenience — a product decision could
  instead make the fallback read-only ("suggestions await a LinkedIn tab"
  + pointer to options). Prototype proves both are cheap.

### 6. Suggestion derivation (evaluation, with evidence)

Current: `extractSuggestionWord` (`content.js:1261-1264`) extracts the
quoted word (≤ 2 tokens) from the matched text; `extractTrigger`
(`content.js:1218-1223`) extracts the quoted fragment *with* quotes, else
the first 40 chars. Verified outputs (spike run of the actual regexes):

```
'Comment "DM" and I will send you the framework'
  trigger="DM"  word=DM
'Comenta "PLANTILLA" y te la envío'
  trigger="PLANTILLA"  word=PLANTILLA
'Reply "10x" for my growth guide'
  trigger="10x"  word=10x
'Comment «BOT» and DM me for the Notion template'
  trigger=«BOT»  word=BOT
'Click the link to get the template (no engagement bait here)'
  trigger='Click the link to get the template (no e...'  word=null
```

Options evaluated:

- **A. Keep the quoted word** (status quo). Pros: human-readable, tiny
  storage, low noise. Cons: the word is the engagement-bait keyword —
  exactly the token most likely to appear in legitimate posts ("DM",
  "PDF", "10x" — the starter-pack false-positive class, per
  `plans/README.md:331-335`). The suggested phrase is the same amplifier
  as the starter pack, minus the deliberate opt-in.
- **B. Derive from the matched fragment** (`extractTrigger` minus
  quotes): e.g. "DM and I will send you" as a contains-mode candidate.
  Pros: more specific → fewer false positives. Cons: (1) fragments are
  feed text — storing them at scale is the STOP-condition scenario
  (page-text-in-storage), pushing the privacy story past "a word you
  could have typed"; (2) fragments are long and mostly useless as exact
  phrases (post text rarely repeats verbatim), so the mode default
  changes to contains; (3) when no quote exists, `extractTrigger` falls
  back to a 40-char sentence slice, which as a phrase is noise.
- **C. Hybrid**: keep the quoted word as the suggested phrase, but let
  the options surface offer contains-mode on add (Section 4). The
  specificity problem stays with the word itself, but the *mode* choice
  moves to the point of decision.

**Recommendation: A + C.** The word is the right *unit* of suggestion
(it is what the user saw being asked for); the false-positive risk is a
*mode* problem, solved by surfacing "contains" at add time in options —
without relitigating the starter-pack acceptance
(`plans/README.md:331-335`: "deliberate, opt-in product behavior"). A
future "context-aware contains" derivation (B) can layer onto the same
storage shape without migration; the timestamp field is already there.

### 7. Privacy

- Suggestions are excerpts of the user's feed. All state stays in
  `chrome.storage.local`; the extension makes no network requests and
  requests no new permissions (unchanged from the privacy guarantees in
  `PRIVACY_POLICY.md`).
- **Decision: suggestions are ephemeral — excluded from export/backup**
  (plan 027 territory). Backup exists to transfer *intent* (phrases,
  whitelists, exclusions) between machines; an auto-suggested queue is
  feed residue, not intent. Dismissals are also excluded: they are
  anti-suggestion state keyed to words the backup would never reproduce
  (dismissals are only meaningful against the live suggestion stream).
- If derivation B is ever adopted (fragments as suggestions), the privacy
  section of this design must be revisited before shipping — fragments
  are larger feed excerpts and the "no page text in storage" line would
  be crossed.
