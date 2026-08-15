# Plan 011 (design): Let users disable a single built-in pattern, not just a whole language

> **Executor instructions**: This is a **design plan**. Resolve the open
> decisions below, then implement following the recommended shape against
> whatever `shared/pattern-data.js`/`options/options.js` look like at
> execution time. Run every verification command. If anything in "STOP
> conditions" occurs, stop and report. Update `plans/README.md`'s status
> row when done.
>
> **This plan is BLOCKED until `plans/004-shared-pattern-data.md` is
> DONE.** It builds directly on `shared/pattern-data.js`'s existence and
> needs to add a stable identity field to it — do not attempt this plan
> against `content.js`'s pre-004 inline `BASE_PATTERNS`/`options.js`'s
> inline `BUILTIN`; those would need extracting first anyway (that's
> exactly what `plans/004` does), so implementing this plan without it
> first would mean redoing 004's work as a side effect.
>
> **Drift check (run first, once 004 is DONE)**: `git diff --stat
> <sha-004-was-completed-at>..HEAD -- shared/pattern-data.js
> options/options.js content.js`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/004-shared-pattern-data.md` (hard)
- **Category**: direction (feature)
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this is a design plan

The natural implementation touches `shared/pattern-data.js`'s data shape
(adding a stable ID per pattern entry) — a file `plans/005-unit-test-coverage.md`
may have *also* extended by the time this plan runs (with pure-function
exports and a `module.exports` guard). This plan needs to add to the same
file without knowing, at write time, exactly what shape 005 left it in.
Rather than guess, this plan documents the data-shape decision and defers
the exact diff to whoever implements it against the live file.

## Why this matters

Language toggles (`options/options.js`'s `renderLangs()`,
`content.js`'s `enabledLangs`) are all-or-nothing — disabling a language
because one of its two built-in patterns is producing false positives also
disables the other, perfectly fine pattern. A user who wants "keep
detecting English engagement-bait in general, but this one specific
pattern keeps flagging my industry's normal terminology" currently has no
way to express that short of disabling English detection entirely, which
defeats the purpose.

## Design decisions

### Decision 1: stable pattern identity

`shared/pattern-data.js`'s `PATTERN_DATA` (per `plans/004`) is shaped
`{ EN: [{regex, label}, {regex, label}], ES: [...], ... }` — entries have
no stable ID, only an implicit array-index position within their language.
Using array index as identity is fragile (inserting a new pattern earlier
in a language's array would silently renumber and misattribute every
later pattern's disabled state). Recommended: add an explicit `id` field
per entry, e.g. `"EN-1"`, `"EN-2"` (1-indexed, language-prefixed, stable
as long as an existing pattern's *language* doesn't change — acceptable,
since patterns don't move between languages). This is the one required
change to `shared/pattern-data.js` itself; everything else in this plan is
additive elsewhere.

### Decision 2: storage and matching

New storage key `ss_disabled_patterns` — an array of `id` strings (per
Decision 1) the user has turned off. In `content.js`, wherever
`BASE_PATTERNS`/the built-in portion of `buildPatterns` iterates
`PATTERN_DATA` entries to build the active regex list, skip any entry
whose `id` is in the disabled set. This is the only detection-path change
this plan requires — small and localized, assuming Decision 1's `id`
field exists to filter on.

### Decision 3: UI

`options/options.js`'s `createBuiltinRow()` (mirrors `createRow()` for
custom phrases) currently renders each built-in pattern's toggle as
permanently checked and disabled (`cb.disabled = true`,
`options/options.js`'s built-in row rendering — re-check the exact
location once 004 has landed and shifted things). Recommended: make that
checkbox live (remove `disabled = true`), wired to add/remove the
pattern's `id` from `ss_disabled_patterns` on change, exactly like the
custom-phrase toggle (`handleToggle`) already works. The per-language
pattern *count* shown next to each language toggle
(`renderLangs()`, currently `BUILTIN.filter((b) => b.lang === code).length`)
should probably reflect only *enabled* pattern count, not total — decide
and document which, since both readings are defensible (total patterns
available for that language vs. patterns currently active).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0 |
| Packaged extension e2e | `npm run test:package` | exit 0 |

## Scope

**In scope**: `shared/pattern-data.js` (add `id` field), `content.js`
(filter disabled patterns), `options/options.js` +
`options/options.html` (live per-pattern toggle), `_locales/en/messages.json`,
`_locales/es/messages.json`.

**Out of scope**: any change to custom-phrase toggling (already works);
`plans/010`'s attribution feature (independent, though both plans touch
pattern-matching internals — check that plan's status too if implementing
both, to avoid conflicting edits to the same matching code path).

## Git workflow

- Branch: `advisor/011-per-pattern-toggle`
- Commit message style: `feat(options): allow disabling individual built-in patterns`
- Do NOT push or open a PR unless the operator instructed it.

## Phased approach

1. Confirm `plans/004` is DONE; read the live `shared/pattern-data.js`.
2. Add the `id` field (Decision 1) — this alone should be a tiny, easily
   verified diff (`node --check shared/pattern-data.js`, then confirm
   `SS_PATTERN_DATA.EN[0].id` etc. resolve as expected via a quick manual
   `node -e` check against the file).
3. Implement Decision 2's storage/filtering in `content.js`.
4. Implement Decision 3's live toggle in `options.js`/`options.html`.
5. Add locale keys for any new UI copy (a toggle tooltip explaining
   "disable just this pattern" is likely enough; no new section needed
   since this lives inside the existing built-in pattern rows).

## Test plan

e2e: disable one of the two EN patterns via the options page, confirm a
post that would only match the *disabled* pattern is no longer blocked
while a post matching the *other* EN pattern still is.

## Done criteria

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0 (including the per-pattern-disable scenario)
- [ ] `npm run test:package` exits 0
- [ ] `grep -n '"id"' shared/pattern-data.js` (or `id:` depending on final
      formatting) shows every pattern entry has a stable identity
- [ ] Disabling one pattern doesn't affect any other pattern's active state
      (verify explicitly — this is the core correctness property Decision 1 exists for)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `plans/004-shared-pattern-data.md` is not DONE.
- Adding the `id` field breaks anything relying on `PATTERN_DATA`'s
  current shape (check `plans/005` and `plans/010` if either has also
  landed — both read `PATTERN_DATA`, and neither should care about an
  added field, but confirm rather than assume).
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt.

## Maintenance notes

- Any future addition of a new built-in pattern must also assign it a
  stable `id` following Decision 1's scheme — document this expectation
  directly in a comment in `shared/pattern-data.js` when implementing.
- A reviewer should scrutinize: that removing a pattern from
  `PATTERN_DATA` in the future doesn't leave an orphaned `id` in some
  user's `ss_disabled_patterns` causing confusion — an orphaned ID is
  harmless (it just never matches anything to filter), but worth a mental
  note rather than a runtime concern.
