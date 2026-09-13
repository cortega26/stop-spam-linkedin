# Plan 060: Release 1.5.0 — version bump, notes, badges, and store submission

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e11a135..HEAD -- manifest.json package.json VERSION RELEASE_NOTES.md CHANGELOG.md README.md docs/ PRIVACY_POLICY.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (main is 4+ user-visible features ahead of the published store version; the release is the only step that ships them)
- **Effort**: S–M
- **Risk**: LOW for the version bump itself; MED at the submission step (credential-dependent, real-world store state — see the gating below)
- **Depends on**: **059 MUST be merged before this runs** (its comment-level fix is a flagship release-note item). Soft: run AFTER 059 and before 058 (see STOP conditions for the 058 clause). Follows the plan-045 mold (the 1.4.0 bump) and `RELEASE_CHECKLIST.md`.
- **Category**: process (release — the five-file lockstep + checklist gates)
- **Planned at**: commit `e11a135`, 2026-09-13, on `main` (post-056/051/055/057 merge; 059 planned but not yet executed)

## Why this matters

`main` has shipped nothing since 1.4.0. Users who review the stores today
see a version that predates allow-phrases, the match tester, school/showcase
coverage, and the comment-level-block fix. Every week un-released, the
newest detection behavior — including the one proven user-harm fix (059) —
is invisible to the installed base. This plan moves the five lockstep
version files, writes honest release notes from the merged plans, updates
the one badge the rule permits (Chrome), leaves the Firefox badge alone
(AMO has not published 1.5.0 — the badge-tracks-published-version rule
forbids bumping it), and hands the submission off with a clear gate.

## Decisions already made — implement these, do not re-derive

**Decision 1 — the five-file lockstep, per the release process
(AGENTS.md)**: `manifest.json`, `package.json`, `VERSION`,
`RELEASE_NOTES.md`, `CHANGELOG.md` move to `1.5.0` together, with the
changelog/notes written from what is actually merged (see Step 2).

**Decision 2 — Chrome badge bumps to `v1.5.0`; Firefox badge stays
`v1.4.0`.** README.md:9 is the Chrome badge, README.md:10 the Firefox one.
The rule (AGENTS.md): "Chrome badge is bumped at release time... Firefox
badge is bumped when AMO review completes and the version becomes public."
AMO's published version is 1.4.0 (public since 2026-08-15, verified by
`tests/verify-amo-listing.js`); a Firefox badge at v1.5.0 would be a false
claim. The executor does NOT touch the Firefox badge.

**Decision 3 — the tag push is operator-gated.** Pushing `v1.5.0` triggers
`.github/workflows/release.yml`, which packages and submits to BOTH stores
with CI secrets. That is a real-world publication: the plan's final step is
"report the state and await the operator's instruction to push the tag" —
the executor never pushes it unprompted. Local submission
(`npm run submit:chrome` / `npm run submit:firefox`) is likewise
operator-gated and credential-dependent (env vars named in
`RELEASE_CHECKLIST.md`; `.env` is gitignored — never fabricate values).

**Decision 4 — release notes enumerate merged plans only.** At execution
time, the merged feature set is 056 (allow-phrases), 051 (match tester),
055 (school/showcase), 059 (comment-level block), plus the 057 fixtures
(test-only). If 058 (onboarding) has ALSO landed by execution time, include
it; if not, do not mention it. The notes must name each included feature
with a one-line user-facing description — the executor derives the list
from the `plans/README.md` status rows (DONE + merged) and `git log`, never
from memory.

## Current state

The facts the executor needs, inlined (verified at `e11a135`):

- **The five lockstep files today**:
  - `manifest.json:3` → `"version": "1.4.0"`
  - `package.json:2` → `"version": "1.4.0"`
  - `VERSION` (1 line, no newline) → `1.4.0`
  - `RELEASE_NOTES.md` → starts with `## 1.4.0` + the 1.4.0 body
  - `CHANGELOG.md` → starts with `## 1.4.0 - Features, Detection Fixes, Reliability`
- **The badge lines** (`README.md:9-10`):
  ```markdown
  [![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.4.0-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)
  [![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-v1.4.0-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/addon/linkedin-spam-blocker/)
  ```
- **`PRIVACY_POLICY.md:3`**: `**Last updated:** 15 August 2026`. The
  checklist says to confirm the date and storage descriptions are current.
  Plan 056 added a synced key (`ss_allow_phrases`) — the policy's storage
  wording is generic ("blocked counts, settings, and your lists") and
  needs no key-by-key enumeration, but the executor must READ the storage
  paragraph and confirm it still describes the full data surface; if the
  wording is accurate, the date does NOT change (the previous release
  refreshed it). Only bump the date if the wording needed an edit.
- **The merged feature evidence** (plans/README.md rows): 056 DONE merged
  @ c11efc0, 051 DONE merged @ c11efc0, 055 DONE merged @ c11efc0, 057
  DONE merged (fixtures), 059 status must be DONE+merged when this plan
  runs (STOP condition below).
- **The release checklist** (`RELEASE_CHECKLIST.md`): pre-packaging gates
  (smoke, extension, package, unpacked verification), packaging, then
  submission (tag-triggered CI or local scripts). The submission
  credentials are GitHub Actions secrets (names only — listed in the
  checklist) or local `.env` (gitignored).
- **The package script** (`npm run package` → `scripts/package-extension.js`)
  produces `dist/linkedin-spam-blocker-{version}.zip` from the manifest
  version.
- **Plan 045 was the last bump** (1.4.0, 2026-08-15): the record in
  `plans/README.md` shows the same five-file lockstep + Chrome badge + no
  Firefox bump. Follow its example.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke | `npm run smoke` | executed | exit 0 |
| Lint | `npm run lint` | executed | exit 0 |
| Typecheck | `npm run typecheck` | executed | exit 0 |
| Unit | `npm run test:unit` | executed | exit 0, 75 tests (77 if 059 landed) |
| Ext e2e | `npm run test:extension` | executed | exit 0 |
| Packaged e2e | `npm run test:package` | executed | exit 0 |
| Package | `npm run package` | executed | creates `dist/linkedin-spam-blocker-1.5.0.zip` |

All `executed` rows were run by the reviewer at `e11a135` (2026-09-13):
green, 75/75 unit. Playwright's Chromium is available in this environment.

## Scope

**In scope**:
- `manifest.json`, `package.json`, `VERSION` — the version bump
- `RELEASE_NOTES.md`, `CHANGELOG.md` — 1.5.0 sections
- `README.md:9` — the Chrome badge only
- `PRIVACY_POLICY.md` — ONLY if the storage-wording check fails (Decision 4)
- `plans/README.md` — your status row (reviewer-owned if dispatched)

**Out of scope** (do NOT touch):
- `README.md:10` — the Firefox badge (Decision 2)
- The 4 translated READMEs (`docs/README.*.md`) — their badges? Check
  first: if any translation carries a version badge, it must match the
  Firefox rule (they were synced at 1.4.0). If a translation badge exists
  and reads v1.4.0, leave it (same rule). If a translation has NO badge,
  add nothing.
- `scripts/submit-stores.js`, `.github/workflows/release.yml` — no script
  changes; the tag push runs the existing workflow.
- Any code change, any new file.
- The tag push itself (operator-gated — Step 5).

## Git workflow

- Branch: `advisor/060-release-1.5.0`
- One commit is fine (the lockstep moves together), message e.g.
  `release: bump to 1.5.0` — the plan-045 commit's message is the
  precedent (`git log --oneline` for it).
- Do NOT push and do NOT tag unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package` → all exit 0 (unit: 75, or 77 if 059 landed). Also run `npm run package` and confirm it creates `dist/linkedin-spam-blocker-1.4.0.zip` (the pre-bump artifact — its existence proves the pipeline works before the version moves).

### Step 1: Confirm the release prerequisites

1. `grep -n '"version"' manifest.json package.json` and `cat VERSION` — all three say `1.4.0`.
2. `ls _locales` → only `en` and `es` (plan 050 must not have landed; the release notes language is EN/ES).
3. Read the `plans/README.md` status rows for 056, 051, 055, 059 — they must all be DONE. **059 must be DONE and merged**; if 059's row is not DONE, STOP (release notes would omit the fix — resequence instead).
4. `git log --oneline main -10` — record the merged feature commits as the notes' evidence.
5. Read the storage paragraph in `PRIVACY_POLICY.md` and apply Decision 4's check.

**Verify**: all three version files say `1.4.0`; 059 row is DONE; you can name the 4 merged features from the status rows + git log.

### Step 2: Write the release notes and changelog

- `RELEASE_NOTES.md`: add a `## 1.5.0` section ABOVE the `## 1.4.0` section, in the file's existing voice (short paragraphs, user-facing). Content: the four merged features with one-line each —
  1. **Never-hide phrases** (plan 056): name text once and no post containing it is ever hidden.
  2. **Match tester** (plan 051): the options page now tells you whether a pasted post would be blocked, and by which pattern.
  3. **School and showcase pages** (plan 055): detection and blocking now run on school and showcase feeds.
  4. **Comment-level blocking** (plan 059): a bait comment now hides the comment, not the whole innocent post.
  If 058 landed before execution, add its onboarding bullet. Do NOT mention 057 (internal tests).
- `CHANGELOG.md`: same four items in the file's existing bullet style under `## 1.5.0 - <short title>`, e.g. `## 1.5.0 - Never-hide Phrases, Match Tester, Comment Fix`.
- Keep the 1.4.0 sections intact below.

**Verify**: `grep -c "1.5.0" RELEASE_NOTES.md CHANGELOG.md` → ≥ 2 per file (heading + body mentions); `head -1 RELEASE_NOTES.md` and `head -1 CHANGELOG.md` show the 1.5.0 headings.

### Step 3: Bump the five files

- `manifest.json:3`: `"version": "1.4.0"` → `"1.5.0"`
- `package.json:2`: same
- `VERSION`: `1.4.0` → `1.5.0` (keep the file's no-newline shape)
- `README.md:9` (Chrome badge): `Chrome_Web_Store-v1.4.0` → `Chrome_Web_Store-v1.5.0` — the URL stays the same
- `PRIVACY_POLICY.md`: only per the Step 1.5 check

Do NOT touch `README.md:10` (Firefox badge).

**Verify**:
```
grep -n '"version"' manifest.json package.json
cat VERSION
grep -c "v1.5.0" README.md
grep -c "v1.4.0" README.md
```
→ three `"1.5.0"` lines; `VERSION` prints `1.5.0`; `v1.5.0` count ≥ 1 (Chrome badge); `v1.4.0` count ≥ 1 (Firefox badge — must remain).

### Step 4: Full gate on the bumped tree

**Verify**:
```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package
```
→ all exit 0. `npm run test:package` now produces and tests `dist/linkedin-spam-blocker-1.5.0.zip` — confirm the output line names 1.5.0. Also confirm the zip contains the version file:
```
unzip -l dist/linkedin-spam-blocker-1.5.0.zip | grep -c VERSION
```
→ ≥ 1.

### Step 5: Report and await the operator for submission

Do NOT push the branch and do NOT push a `v1.5.0` tag. Your report must state: the exact merged feature list the notes claim (with the plan numbers), the three verification outputs from Step 3, the package artifact name, and the explicit note that the tag push (`git tag v1.5.0 && git push origin v1.5.0`) is the submission trigger the operator must run (per `RELEASE_CHECKLIST.md` — it packages and submits to both stores via CI secrets).

**Verify**: no tag exists on your branch (`git tag --list "v1.5.0"` → empty) and nothing was pushed (`git status` shows only your local commit).

## Test plan

- No new tests: this plan changes metadata and docs. The verification IS
  the test plan — every gate in Step 4, plus the artifact-name assertion.
- The next release's own plan will re-run `tests/verify-amo-listing.js`
  against the live AMO listing after submission (credential-gated, not
  part of this plan).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n '"version"' manifest.json package.json` shows `"1.5.0"` twice; `cat VERSION` → `1.5.0`
- [ ] `head -1 RELEASE_NOTES.md` and `head -1 CHANGELOG.md` show 1.5.0 headings; `grep -c "1.5.0" RELEASE_NOTES.md CHANGELOG.md` → ≥ 2 each
- [ ] The notes name the four merged features (never-hide phrases, match tester, school/showcase, comment-level block) with plan numbers
- [ ] `grep -c "Chrome_Web_Store-v1.5.0" README.md` → 1; `grep -c "Firefox_Add--ons-v1.4.0" README.md` → 1 (Firefox untouched)
- [ ] `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0 (75 or 77 unit tests)
- [ ] `npm run test:extension && npm run test:package` → exit 0, package output names `linkedin-spam-blocker-1.5.0.zip`
- [ ] `unzip -l dist/linkedin-spam-blocker-1.5.0.zip | grep -c VERSION` → ≥ 1
- [ ] `git tag --list "v1.5.0"` → empty (no premature submission trigger)
- [ ] `git diff --name-only <base>..HEAD` lists only in-scope files (manifest.json, package.json, VERSION, RELEASE_NOTES.md, CHANGELOG.md, README.md, and PRIVACY_POLICY.md ONLY if the Step 1.5 check required it)
- [ ] `plans/README.md` status row updated (reviewer-owned if dispatched)

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 059's status row is not DONE+merged (Step 1.3) — the release must not ship without the comment-level fix; resequence.
- `_locales/{fr,pt,de}` exists — plan 050 landed; the release would ship unvalidated translations; resequence.
- The Firefox badge does NOT read v1.4.0 at execution time — the badge state drifted from the published AMO version; report both values and do not guess which is true.
- A `v1.5.0` tag already exists anywhere (local or origin) — a previous attempt partially ran; report before doing anything.
- The notes' feature list cannot be derived from the status rows + git log (e.g. a row says DONE but the commits are absent from main) — report the discrepancy.
- Any translated README carries a version badge that would now be false (e.g. a `v1.4.0` Chrome badge in a translation while README goes to 1.5.0) — report it; do not fix translations beyond the English badge without instruction.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The badge rule bites here exactly as designed**: Chrome bumps at
  release time, Firefox bumps only when AMO review completes. After this
  release is submitted and AMO publishes 1.5.0, a tiny follow-up (Firefox
  badge → v1.5.0 in README + translations) is unblocked — record it in
  `plans/README.md` as a note rather than a plan.
- **Release notes drift**: if 058 (onboarding) or 053/054 land before the
  tag is pushed, their features belong in the notes — update the notes in
  the same commit that merges them, or re-run this plan's Step 2. The
  checklist's "paste the current version's notes" step is manual on both
  stores.
- **The next release** (1.6.0+) re-runs this mold: five files + Chrome
  badge + Firefox badge only when AMO is public. The `tests/verify-amo-listing.js`
  tool (committed 2026-09-13) verifies the listing after submission.
- **Deferred:** automating the Firefox badge bump on AMO-public (a small
  script polling the AMO API — the verify tool already has the auth
  machinery). Unblocked by: demand for another release.