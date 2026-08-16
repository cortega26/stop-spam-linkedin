# Plan 045: Version bump 1.3.0 → 1.4.0 (five files in lockstep + release notes)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat HEAD..HEAD -- manifest.json package.json VERSION RELEASE_NOTES.md CHANGELOG.md README.md`
> (HEAD is the current main; if any of these files were modified since this
> plan was written, compare the excerpts below against live content — the
> version numbers must be `1.3.0` everywhere for this plan to be correct; on
> a mismatch, treat it as a STOP condition.)

## Status

- **Priority**: P1 (a 23-plan release with user-visible detection changes
  has been sitting unversioned on main)
- **Effort**: S
- **Risk**: LOW (version strings + docs only; no source behavior)
- **Depends on**: none (all of 022-044 are already merged to main)
- **Category**: release
- **Planned at**: commit `2c935cc`, 2026-08-15

## Why this matters

Since 1.3.0 shipped, 23 plans merged to main: new user-facing features
(in-feed "Block this author" button, missed-spam reports carrying the
matched language, backup covering blocked authors/disabled patterns/hide
toggles, an oversized-import safety fix), detection-behavior changes
(French and Portuguese patterns now match "pour recevoir", "je vous
enverrai", "vou enviar" — previously broken), and a large reliability
pass (UTF-8 byte-accurate storage quotas, storage-write error guards,
undo-row dedup, eviction-scoring fix). The extension's manifest still
says 1.3.0, so stores would publish stale versioning if a release were
cut today. This plan bumps to **1.4.0** (minor: new features + behavior
changes) across the five lockstep files per AGENTS.md, writes release
notes and changelog entries from the merged plan history, and updates
the README badges. It does NOT tag or submit — that is the maintainer's
call (RELEASE_CHECKLIST.md).

## Current state (all verified live at HEAD `2c935cc`)

- `manifest.json:3` — `"version": "1.3.0",`
- `package.json:3` — `"version": "1.3.0",`
- `VERSION` — `1.3.0` (no trailing newline)
- `RELEASE_NOTES.md` — header `# Release Notes` then `## 1.3.0` block at top; each version has a bullet list of **Key changes**.
- `CHANGELOG.md` — header `# Changelog` then `## 1.3.0 - Features, Detection Fixes, Quality` at top; each version has `### Features`, `### Detection` (or similar), `### Fixes` subsections.
- `README.md` — Chrome/Firefox store badges with version numbers (grep `1.3.0` — the badges live in the README header; there are also translated READMEs in `docs/` — see STOP conditions).
- `PRIVACY_POLICY.md` — no version string (check; if it has one, update it too — the checklist asks to confirm it's current).

Repo conventions (AGENTS.md): "A version bump must move five files in
lockstep: `manifest.json`, `package.json`, `VERSION`, `RELEASE_NOTES.md`,
and `CHANGELOG.md`." Pushing a `v*` tag triggers the release workflow —
NOT part of this plan.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0 (validates manifest JSON + locales) |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | 63 pass             |
| Version consistency | `node -e "const m=require('./manifest.json'),p=require('./package.json'),f=require('fs');const v=f.readFileSync('VERSION','utf8').trim();console.log(m.version,p.version,v, m.version===p.version&&p.version===v&&v==='1.4.0'?'OK':'MISMATCH')"` | `1.4.0 1.4.0 1.4.0 OK` |
| Badge consistency | `grep -c "1.4.0" README.md` | ≥ 2 (badges) |
| Package | `npm run package`        | creates `dist/linkedin-spam-blocker-1.4.0.zip` |

## Scope

**In scope** (the five lockstep files, plus the two the release flow
touches):
- `manifest.json` (version field only)
- `package.json` (version field only)
- `VERSION`
- `RELEASE_NOTES.md`
- `CHANGELOG.md`
- `README.md` (store badges)
- `PRIVACY_POLICY.md` (only if it contains a version string or a date
  that needs refreshing per the checklist)

**Out of scope** (do NOT touch):
- Any `content.js`/`options.js`/`popup.js`/`shared/*`/test source —
  this is a versioning-only change.
- `docs/README.*.md` translated READMEs — only if their badges show
  1.3.0 too; if they do, note it in NOTES and update them ONLY if the
  change is a simple version-string swap (grep to confirm; if a
  translation is behind on content, do NOT backport content — flag it).
- Git tags, pushes, or store submissions — maintainer's call.
- `dist/` — `npm run package` regenerates the zip; the old 1.3.0 zips
  stay (they're historical).

## Git workflow

- Branch: `advisor/045-version-1.4.0`
- Commit message style: conventional, e.g. `release: bump to 1.4.0`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Bump the three version strings

1. `manifest.json:3`: `"version": "1.3.0"` → `"version": "1.4.0"`.
2. `package.json:3`: `"version": "1.3.0"` → `"version": "1.4.0"`.
3. `VERSION`: `1.3.0` → `1.4.0` (keep the file WITHOUT a trailing
   newline — check the original: it has none; preserve that).

**Verify**:
- `node -e "const m=require('./manifest.json'),p=require('./package.json'),f=require('fs');const v=f.readFileSync('VERSION','utf8').trim();console.log(m.version,p.version,v)"` → `1.4.0 1.4.0 1.4.0`
- `npm run smoke` → exit 0 (jq validates the manifest still parses).

### Step 2: Write the RELEASE_NOTES 1.4.0 entry

Add a `## 1.4.0` block above the existing `## 1.3.0` block in
`RELEASE_NOTES.md`, matching the house style (intro line + `Key
changes:` bullet list). Content — write these bullets (from the merged
plan history; verify each claim against the code where unsure):

- **In-feed "Block this author"**: text-block placeholders now offer a
  "Block this author" button alongside "Never block this author" — the
  author's posts stay hidden feed-wide and the placeholder switches to
  the author-block variant.
- **Missed-spam reports carry the language**: the clipboard report now
  includes which pattern language matched ("Pattern language: EN"), and
  the issue form collects negative examples to prevent over-matching.
- **Complete settings backup**: Export/Import now also covers blocked
  authors, disabled patterns, and the Promoted/Featured hide toggles.
- **Detection fixes (FR/PT)**: French "commentez X pour recevoir" and
  "je vous enverrai" and Portuguese "vou enviar" now match correctly —
  these previously never blocked; English/ES/DE verified solid.
- **Reliability**: storage quotas now measured in UTF-8 bytes (non-ASCII
  phrase lists near the cap no longer fail silently); every storage
  write checks errors; undo list deduplicated after snooze/disable;
  oversized imports are byte-pruned instead of failing silently;
  exclusion eviction and the 15-minute Show cooldown keep only the
  entries they should.
- **E2E coverage**: FR/PT/DE detection now unit-tested (54→63 tests);
  stats pipeline and backup round-trip covered end-to-end; Firefox
  smoke gained a negative control.
- **Under the hood**: pattern assembly moved to a shared, unit-tested
  module; options page preserves in-progress edits and no longer
  double-renders; context menus are recreated cleanly on update.

**Verify**: the file's first version header is `## 1.4.0` and the
`## 1.3.0` block is unchanged below it (`git diff` shows only the
inserted block).

### Step 3: Write the CHANGELOG 1.4.0 entry

Add a `## 1.4.0 - <title>` block above the existing `## 1.3.0` block in
`CHANGELOG.md` with the house subsection style (`### Features`,
`### Detection`, `### Fixes`, `### Tests` as appropriate). Mirror the
release-notes content with more detail (this file is the technical
record; list the plan numbers in parentheses where useful, e.g.
"(plan 040)"). Cover:

- **Features**: in-feed Block-this-author button (040); missed-spam
  language in payload + negative-examples form field (042); backup
  completeness — blocked authors, disabled patterns, hide toggles (027);
  exclusion-count/near-cap warning in options (batch 021).
- **Detection**: FR-2 missing-space fix, FR-1 object pronouns, PT-1
  near-future "vou enviar" (025); FR/PT/DE now covered by 12 new unit
  tests + per-language e2e.
- **Fixes**: UTF-8 byte-accurate quota measurement (029); lastError
  guards on all 40 storage writes (031); undo rows deduped on
  snooze/disable/Show-all (028); import byte-quota enforcement (026);
  exclusion eviction scoring (022); parseAuthorId URIError guard (024);
  whitelist same-tab restore via oldValue diff (023); cooldown eviction
  order (033); context-menu removeAll on update (039); options edit
  preservation + single render (030); restorePost set pruning (032).
- **Tests/DX**: buildPatterns extracted and unit-tested (034); stats
  pipeline e2e (035); Firefox negative control (036); smoke covers all
  17 shipped/test JS files (038); AGENTS.md facts refreshed (037); e2e
  runs headless under xvfb — no visible browser windows (044).

**Verify**: the file's first version header is `## 1.4.0` and the
`## 1.3.0` block is unchanged below it.

### Step 4: Update README badges (and check translations)

In `README.md`, replace the store-badge version strings `1.3.0` with
`1.4.0` (the badges are shields.io URLs — grep `1.3.0` and update only
the version-number occurrences in badge URLs; do NOT rewrite any other
content). Then check `docs/README.*.md`: if they contain the same badge
URLs with 1.3.0, swap the version there too (simple string swap only).
Also check `PRIVACY_POLICY.md` for a version string or "last updated"
date — if the checklist requires it current, refresh the date to
2026-08-15 but do not invent other edits.

**Verify**:
- `grep -c "1.4.0" README.md` ≥ 2
- `grep -rn "1.3.0" README.md docs/ | head` → no matches (or only
  historical CHANGELOG-style mentions — check what's left and report)

### Step 5: Full verification

- `npm run smoke` → exit 0
- `npm run lint` → exit 0
- `npm run typecheck` → exit 0
- `npm run test:unit` → 63 pass
- `npm run package` → `Created dist/linkedin-spam-blocker-1.4.0.zip`
- `unzip -l dist/linkedin-spam-blocker-1.4.0.zip | grep -E "VERSION|manifest.json"` → both present

**Verify**: all commands exit 0 with the stated output.

## Test plan

No new tests — this is a versioning/docs change. The verification is
the consistency commands (Step 1 verify), the package output (Step 5),
and `git diff` review confirming no source files changed.

## Done criteria

- [ ] `node -e "...version check..."` prints `1.4.0 1.4.0 1.4.0 OK`
- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0; `npm run test:unit` → 63 pass
- [ ] `npm run package` creates `dist/linkedin-spam-blocker-1.4.0.zip`
- [ ] `grep -c "1.4.0" README.md` ≥ 2 and no stray `1.3.0` in README/docs badges
- [ ] RELEASE_NOTES.md and CHANGELOG.md each have the 1.4.0 block at top, 1.3.0 block intact below
- [ ] No source/test files modified (`git status` — only the six in-scope files)
- [ ] `plans/README.md` status row updated (SKIP — reviewer maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the five files shows a version OTHER than 1.3.0 at start
  (drift — someone bumped already; reconcile before proceeding).
- A translated README in `docs/` needs more than a version-string swap
  (content drift) — flag it, don't backport.
- `PRIVACY_POLICY.md` contains a version string that doesn't match the
  pattern described in Step 4 — report before editing.
- `npm run package` produces anything other than the 1.4.0 zip name.

## Maintenance notes

- The maintainer's next step after merging: push tag `v1.4.0` to
  trigger `.github/workflows/release.yml` (packages + submits to both
  stores), then verify store review per RELEASE_CHECKLIST.md.
- Any future plan that ships user-visible behavior should carry a
  release-note line as part of its diff — this plan's Step 2 content is
  the template.
- The `docs/README.*.md` translations: if any badge was left at 1.3.0
  because the translation was content-stale, record which file and why.
