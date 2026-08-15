# Plan 027: Include blocked-authors, disabled-patterns, and hide toggles in backup/restore

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- options/options.js tests/extension-smoke.js _locales/en/messages.json _locales/es/messages.json`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (backup file format change — must stay backward-compatible)
- **Depends on**: none (soft: 026 first so the merge loop discipline is
  in place before adding more merge fields)
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

The options page markets "Full settings backup" (1.3.0), but the
versioned export payload contains only `{version, exportedAt, phrases,
whitelist, excluded, langs}`. It omits three categories the same page
manages: `ss_blocked_authors`, `ss_disabled_patterns`, and the
`hide_promoted`/`hide_featured` toggles. Two concrete user-visible
failures: (a) a user whose *only* customization is disabling patterns or
hiding Promoted gets "nothing to export" (`hasExportableData` doesn't
count those keys); (b) restoring a backup silently re-enables every
previously-disabled pattern and resets the feed hides — behavior change
with no warning. The blocklist (up to 100 authors, each requiring a
context-menu click to build) is lost entirely on reinstall.

## Current state

- `options/options.js:455-471` — `handleExport`:
  ```js
  if (!hasExportableData()) { showToast(t("nothingToExport"), true); return; }
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    phrases: phrases,
    whitelist: whitelist,
    excluded: excluded,
    langs: enabledLangs,
  };
  ```
- `options/options.js:421-428` — `hasExportableData` checks phrases/whitelist/excluded/langs only.
- `options/options.js:642-719` — import merge handles phrases/whitelist/excluded/langs only; state vars `blockedAuthors` (line 13), `disabledPatterns` (line 11), `hidePromoted`/`hideFeatured` (lines 20-21) are loaded from storage at `load()` (lines 100-108).
- Storage keys: `STORAGE_KEYS.BLOCKED_AUTHORS`, `STORAGE_KEYS.DISABLED_PATTERNS`, `STORAGE_KEYS.HIDE_PROMOTED`, `STORAGE_KEYS.HIDE_FEATURED` (all in `shared/constants.js`).

Repo conventions: import is *additive merge*, never replace
(`options/options.js:643-646` comment). Version is a number in the
payload; older builds ignore unknown fields; newer builds must accept
`version: 1` files that lack the new fields.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass            |
| E2E       | `npm run test:extension` | both files pass     |

## Scope

**In scope**:
- `options/options.js`
- `tests/extension-smoke.js`
- `_locales/en/messages.json` + `_locales/es/messages.json` (only if new
  summary/part keys are needed — prefer reusing existing `settingsPart`
  keys)

**Out of scope** (do NOT touch):
- The `ss_excluded`/whitelist merge logic itself (plan 026).
- `content.js` — it reads the storage keys directly via `onChanged`;
  no changes needed.
- Export file *format* beyond the added fields (no structural redesign).

## Git workflow

- Branch: `advisor/027-backup-completeness`
- Commit message style: conventional, e.g. `feat(backup): export and restore blocked authors, disabled patterns, and hide toggles`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extend the export payload and `hasExportableData`

In `options/options.js`:

1. Add to the payload:
   ```js
   blockedAuthors: blockedAuthors,
   disabledPatterns: disabledPatterns,
   hidePromoted: hidePromoted,
   hideFeatured: hideFeatured,
   ```
   Keep `version: 1` — the format stays additive; do not bump the
   version (older builds tolerate extra fields; the import code below
   tolerates their absence).
2. Extend `hasExportableData()` to count `blockedAuthors.length > 0`,
   `disabledPatterns.length > 0`, `hidePromoted`, `hideFeatured`.

**Verify**: `npm run smoke`, `npm run lint`, `npm run typecheck` → exit 0.

### Step 2: Extend the import merge

In the import block (after the existing `langs` merge, ~line 707):

- **blockedAuthors**: mirror the whitelist merge (dedupe, skip
  non-strings/empty, cap at `LIMITS.MAX_BLOCKED_AUTHORS`, count
  `blockedAuthorsAdded`/`Skipped`), then write
  `chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: blockedAuthors })`
  with the plan-026 error discipline.
- **disabledPatterns**: additive union of string ids, capped at the
  number of known pattern ids if a cap exists (check `shared/pattern-data.js`
  for a count — if none, just dedupe), then `set` with the same
  discipline.
- **hidePromoted/hideFeatured**: `typeof imported.hidePromoted ===
  "boolean"` → apply, and `set` (these are single booleans; treat as
  "last import wins").
- Wire the new counters into the existing summary toast parts array
  (follow the `settingsPart(count, oneKey, manyKey)` pattern at
  `options/options.js:431-436`). Reuse existing i18n keys where
  possible (`blockedAuthorTitle`, etc.); add new keys to BOTH locale
  files only if the summary needs them — and name them
  `importBlockedAuthorsAdded`-style.

**Verify**: `npm run test:unit` → all pass; `npm run lint`/`typecheck` → 0.

### Step 3: e2e round-trip for the new fields

In `tests/extension-smoke.js` (model on the existing export/import
scenario): seed `ss_blocked_authors` (2 ids), `ss_disabled_patterns`
(1 id), `ss_hide_promoted: true` via `setSyncStorage`; export; clear
those keys; import the file; assert storage contains them again and
`hasExportableData`-equivalent UI shows the sections. Also assert a
legacy `version: 1` file WITHOUT the new fields imports without error
(the existing migration fixture covers this shape — reuse it).

**Verify**: `npm run test:extension` → both files pass.

## Test plan

One e2e round-trip scenario + one legacy-file compatibility assertion
(Step 3). No unit tests — this is chrome.storage-driven UI behavior.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes, including the new round-trip scenario
- [ ] `grep -n "blockedAuthors: blockedAuthors" options/options.js` matches (export payload)
- [ ] `grep -n "hidePromoted" options/options.js` appears in export AND import
- [ ] Old `version: 1` files still import (e2e assertion passes)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- Adding the fields requires changing the import *replace* semantics
  (the additive-merge convention must hold for all categories).
- The summary toast needs more than ~2 new locale keys (flag the
  mismatch before expanding the surface).

## Maintenance notes

- Future settings categories added to the options page must be added to
  `hasExportableData` + payload + import merge in one change — this plan
  is the checklist.
- The `version` field stays 1 (additive); if a future change ever needs
  breaking semantics, bump to 2 and branch the import on it.
- Reviewer should verify the toast summary counts match what actually
  persisted (the plan-026 error-discipline makes this checkable).
