# Plan 076: Release 1.6.0 — version bump, notes, whatsNew refresh, and store submission

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e4c4085..HEAD -- manifest.json package.json VERSION RELEASE_NOTES.md CHANGELOG.md _locales/en/messages.json _locales/es/messages.json PRIVACY_POLICY.md README.md docs/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (main is three user-facing improvements ahead of the
  published stores; the release is the only step that ships them — and
  the 072 whatsNew mechanism only activates on a version bump)
- **Effort**: S–M
- **Risk**: LOW for the bump itself; MED at submission (credential-gated,
  real-world store state — operator-gated, never executed here)
- **Depends on**: none (all 070–075 DONE+merged; unbuilt 064/065/066/069
  designs are explicitly NOT awaited — see Decision 4)
- **Category**: process (release — lockstep bump + notes + checklist gates)
- **Planned at**: commit `e4c4085`, 2026-09-14

## Why this matters

Main has shipped nothing since 1.5.0. Three merged, fully-gated
improvements sit unreleased: selection-based missed-spam reporting (063),
the what's-new card (072), and screen-reader announcements (074). The
072 mechanism is dormant until a version bump ships — its card shows when
the stored version differs from the running one, so no release means no
user ever sees it. This plan moves the lockstep version files, writes
honest notes from merged plans only, refreshes the whatsNew copy the 072
maintenance note mandates, makes the one-line privacy accuracy fix that
1.5.0/1.6.0 owe, and stops at the tag gate for the operator.

## Decisions already made — implement these, do not re-derive

**Decision 1 — the five-file lockstep, per the release process
(AGENTS.md):** `manifest.json`, `package.json`, `VERSION`,
`RELEASE_NOTES.md`, `CHANGELOG.md` move `1.5.0` → `1.6.0` together.
Minor (not patch): two user-facing features + one a11y improvement land,
matching the 1.3.0/1.4.0/1.5.0 minor-bump convention.

**Decision 2 — NO badge changes of any kind.** Plan 061 replaced all
store badges (README + 4 translations) with live shields.io endpoints
that always reflect the published stores. There is nothing to bump and
no Firefox-hold dance (that died with the static badges — the 060 mold's
badge steps do NOT apply). If you find ANY hardcoded version badge
(`Chrome_Web_Store-v` / `Firefox_Add--ons-v` with a version number) in
README or docs, STOP — something regressed plan 061.

**Decision 3 — the tag push is operator-gated.** Pushing `v1.6.0`
triggers `.github/workflows/release.yml`, which packages and submits to
BOTH stores with CI secrets: a real-world publication. The plan ends at
"report and await the operator" — the executor never creates or pushes
the tag, never runs the submit scripts (credential-gated; `.env` is
gitignored — never fabricate values).

**Decision 4 — notes enumerate merged user-facing work only.** The
1.6.0 set is exactly 063, 072, 074 (all DONE+merged, all e2e-gated at
review). Research spikes 070/071/073/075 ship no behavior — do NOT
mention them (060 treated 057 the same way). 061 (live badges) is
user-invisible infrastructure — omit. Unbuilt 064/065/066/069 are NOT
awaited and NOT mentioned.

**Decision 5 — whatsNew copy MUST be refreshed in this release.**
072's maintenance note mandates per-release refresh, and the shipped
copy describes 1.5.0's features — releasing 1.6.0 with it would make
"What's new in this version" advertise the previous release. Exact
replacement strings are inlined in Step 2 (EN+ES, no `$N`
placeholders). ES is maintainer-drafted (same standing rule as
012/050 — flag for speaker review, do not reword).

**Decision 6 — privacy gets its owed one-line accuracy fix.**
1.5.0 added `ss_allow_phrases` (sync) and `ss_pattern_counts` (local);
1.6.0 adds `ss_seen_release` (local) — none are named in
`PRIVACY_POLICY.md`'s storage paragraphs. The fix is two sentence
fragments + a date bump (exact text inlined in Step 3). Per the 060
rule the date moves BECAUSE the wording is edited.

## Current state

The facts the executor needs, inlined (verified at `e4c4085`):

- **The five lockstep files today**: `manifest.json:4` →
  `"version": "1.5.0"`; `package.json:3` → `"version": "1.5.0"`;
  `VERSION` → `1.5.0` (5 bytes, NO trailing newline — preserve the
  shape); `RELEASE_NOTES.md` → starts `# Release Notes`, then
  `## 1.5.0` ("Never-hide phrases, a match tester, and broader
  detection coverage..." with `- **Bold lead**: ...` bullets);
  `CHANGELOG.md` → starts `# Changelog`, then
  `## 1.5.0 - Never-hide Phrases, Match Tester, and More` with
  `### Features` `- Added **...** ... (plan 0NN).` bullets. Keep both
  1.5.0 sections intact below the new ones.
- **Locales**: 176 keys each (`_locales/en + es/messages.json`); the
  four `whatsNew*` keys hold 072's 1.5.0-era copy (title
  `What's new in this version` / dismiss `Got it` stay; intro+point get
  replaced — Step 2).
- **Privacy**: `PRIVACY_POLICY.md:3` →
  `**Last updated:** 15 August 2026`. Sync paragraph (`:12`) lists
  prefs/phrases/langs/pattern-toggles/exclusions/whitelist/blocklist —
  `ss_allow_phrases` unnamed. Local paragraph (`:19`): "Your blocked
  count, daily stats, snooze state, and onboarding flag are stored..." —
  pattern counts + seen-release unnamed.
- **Badges**: live endpoints since 061 (no version numbers in any badge
  URL — verify with grep in Step 1).
- **CI on HEAD**: the `e4c4085` (075-merge) CI run was `in_progress`
  at plan time — Step 0 requires it green before anything else.
- **Unit baseline**: 81 tests. No `v1.6.0` tag exists (verify local +
  origin in Step 1). `_locales/` holds only `en`, `es`.
- **Release mechanics**: tag push runs `release.yml` (AGENTS.md release
  process); `npm run package` zips from the manifest version;
  `dist/` is gitignored (no stale-zip risk in tree).

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke (incl. locale parity) | `npm run smoke` | declared | exit 0, prints `true` |
| Lint | `npm run lint` | declared | exit 0 |
| Typecheck | `npm run typecheck` | declared | exit 0, no errors |
| Unit | `npm run test:unit` | declared | all pass (81) |
| Extension e2e | `npm run test:extension` | declared | both scripts exit 0 |
| Packaged e2e | `npm run test:package` | declared | exit 0, names `linkedin-spam-blocker-1.6.0.zip` |
| Firefox smoke (attempt rule — Step 4) | `node tests/firefox-smoke.js` | declared | exit 0 if toolchain present; else record absence |
| Zip contents | `unzip -l dist/linkedin-spam-blocker-1.6.0.zip \| grep -c VERSION` | declared | ≥ 1 |
| CI on HEAD | `gh run list --branch main --limit 1` | declared | `completed success` on `e4c4085` |
| Tag absence | `git tag --list "v1.6.0"` + `git ls-remote --tags origin \| grep v1.6.0` | declared | both empty |

## Scope

**In scope** (the only files you should modify):
- `manifest.json`, `package.json`, `VERSION` — `1.5.0` → `1.6.0`
- `RELEASE_NOTES.md`, `CHANGELOG.md` — new `1.6.0` sections (exact copy
  in Step 2)
- `_locales/en/messages.json`, `_locales/es/messages.json` —
  `whatsNewIntro` + `whatsNewPoint` values ONLY (title/dismiss
  byte-identical)
- `PRIVACY_POLICY.md` — the two sentence fragments + date ONLY
  (exact text in Step 3)

**Out of scope** (do NOT touch):
- README + `docs/README.*.md` badges (live endpoints — Decision 2;
  verify-only via grep)
- `STORE_ASSETS.md` + store listings (manual paste at submit time;
  a 062-style copy refresh for 1.6.0 is a separate docs pass if the
  maintainer wants it — listings stay accurate for everything they
  describe today)
- `RELEASE_CHECKLIST.md` (no edit — its missing lockstep list is a
  known doc-drift note from the 072 review, not this release's scope)
- `scripts/submit-stores.js`, `.github/workflows/*` — no script
  changes; tag runs the existing workflow
- Any code change, any new file, the tag push itself (operator-gated)

## Git workflow

- Branch: `advisor/076-release-1.6.0`
- One commit is fine (the lockstep moves together), message:
  `release: bump to 1.6.0` (precedent: the 1.5.0/1.4.0 bump commits —
  confirm via `git log --oneline --grep="bump to"`)
- Do NOT push and do NOT tag unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline + release readiness

Run the full local gate on the unmodified checkout: smoke, lint,
typecheck, unit, test:extension. Then: `gh run list --branch main
--limit 1` must show `completed success` on `e4c4085` (if the HEAD run
failed, STOP — never release on red main). Then tag absence: `git tag
--list "v1.6.0"` empty AND `git ls-remote --tags origin | grep v1.6.0`
empty (a previous attempt partially ran → STOP and report). Then
`ls _locales` → only `en`, `es`.

**Verify**: all gates exit 0 (unit 81/81); HEAD CI success recorded
with run id; no v1.6.0 tag anywhere; locales en+es only.

### Step 1: Confirm prerequisites (badges, feature set, privacy read)

1. `rg -n "Chrome_Web_Store-v|Firefox_Add--ons-v" README.md docs/`
   → ZERO matches (live endpoints have no versions; any hit is a 061
   regression → STOP).
2. `rg -n '"version"' manifest.json package.json` + `cat VERSION` +
   `xxd VERSION | tail -1` → all `1.5.0`, no trailing newline.
3. `plans/README.md` rows 063, 072, 074 → DONE (072/074 merged —
   verify via `git log --oneline main` showing both merge commits;
   if any row is not DONE, STOP — resequence).
4. Read `PRIVACY_POLICY.md:11-19` and confirm the paragraphs match the
   Current-state quotes above (if the file drifted, STOP — the Step 3
   edit is void).

**Verify**: zero static badges; versions all 1.5.0; 063/072/074 DONE;
privacy paragraphs as quoted.

### Step 2: whatsNew refresh + release notes + changelog

whatsNew (values replaced verbatim, title/dismiss untouched, no `$N`):

- EN `whatsNewIntro`: `This update improves reporting, feedback, and release notes. Highlights:`
- EN `whatsNewPoint`: `Report missed spam from any selected text, catch up with in-extension release notes after each update, and clearer announcements for screen readers. Nothing leaves your browser, as always.`
- ES `whatsNewIntro`: `Esta actualización mejora el reporte, los avisos y las notas de versión. Destacados:`
- ES `whatsNewPoint`: `Reporta spam no detectado desde cualquier texto seleccionado, ponte al día con las notas de versión dentro de la extensión y mejores anuncios para lectores de pantalla. Nada sale de tu navegador, como siempre.`

`RELEASE_NOTES.md` — new `## 1.6.0` section ABOVE `## 1.5.0`, same
voice (one intro line + bold-lead bullets):

```markdown
## 1.6.0

Easier missed-spam reporting, in-extension release notes, and accessibility improvements. Key changes:

- **Report missed spam from anywhere**: select any text on LinkedIn and report it — the text is copied and a pre-filled issue opens (plan 063).
- **What's new after every update**: the options page now shows a dismissible card with each version's highlights (plan 072).
- **Clearer screen-reader announcements**: toasts, banners, and popup notices now expose proper live regions (plan 074).
```

`CHANGELOG.md` — new section ABOVE 1.5.0, same shape
(`## X - Title` + `### Features` + `- Added ... (plan 0NN).`):

```markdown
## 1.6.0 - Missed-Spam Reporting, What's New, Accessibility

### Features

- Added **selection-based missed-spam reporting**: right-click any selected LinkedIn text to copy it and open a pre-filled issue — nothing is sent automatically (plan 063).
- Added a **what's-new card**: the options page shows a dismissible, version-pinned summary of each release's highlights (plan 072).
- Added **assistive-technology announcements**: the options toast, first-run banner, and popup notices now carry `role="status"` live regions, pinned by accessible-tree e2e assertions (plan 074).
```

**Verify**: `npm run smoke` exit 0 (parity, 176/176 keys —
key SET unchanged, only values); `jq` whatsNewIntro/Point values
equal the strings above in both locales; `head` shows 1.6.0 sections;
`grep -c "1.6.0" RELEASE_NOTES.md CHANGELOG.md` → ≥ 2 each.

### Step 3: Bump the five files + privacy fix

- `manifest.json:4` + `package.json:3`: `"1.5.0"` → `"1.6.0"`
- `VERSION`: `1.5.0` → `1.6.0`, preserve no-trailing-newline
  (`printf '1.6.0' > VERSION` — no other tool writes raw bytes safely;
  verify with `xxd`)
- `PRIVACY_POLICY.md` (exact replacements):
  - `whitelisted author IDs, and blocked author IDs are stored` →
    `whitelisted author IDs, blocked author IDs, and never-hide phrases are stored`
  - `Your blocked count, daily stats, snooze state, and onboarding flag are stored` →
    `Your blocked count, daily stats, per-pattern statistics, snooze state, onboarding flag, and dismissed release-notes state are stored`
  - `**Last updated:** 15 August 2026` → `**Last updated:**`
    + execution date in the same format (e.g. `14 September 2026`)

**Verify**: `grep -n '"version"' manifest.json package.json` → two
`"1.6.0"` lines; `cat VERSION` → `1.6.0`; `xxd VERSION` → 5 bytes, no
`0a`; `rg -n "allow|never-hide|pattern stat|seen release|seen-release" PRIVACY_POLICY.md` → ≥ 2 hits.

### Step 4: Full gate on the bumped tree + artifact proof

Run: smoke, lint, typecheck, unit, test:extension, test:package.
`test:package` must produce and test
`dist/linkedin-spam-blocker-1.6.0.zip` (confirm the output line names
1.6.0); then `unzip -l dist/linkedin-spam-blocker-1.6.0.zip | grep -c VERSION` → ≥ 1.
Firefox attempt rule: run `node tests/firefox-smoke.js` IF the
toolchain is present (check `npx geckodriver --version` first — no
installs). Exit 0 → record. Toolchain absent → record "firefox-smoke
not run: toolchain absent; backstop is CI release job + AMO review"
and proceed. Exit non-zero on a PRESENT toolchain → STOP (release
must not ship with a failing Firefox gate).

**Verify**: all gates exit 0 (unit 81/81); artifact named 1.6.0 with
VERSION inside; firefox outcome recorded one way or the other.

### Step 5: Report and await the operator for submission

Do NOT push the branch and do NOT create or push a `v1.6.0` tag. The
report must state: the three shipped items with plan numbers, the Step
3 greps, the Step 4 gate results + firefox outcome, the artifact name,
and the exact operator commands that trigger submission:

```
git tag v1.6.0 && git push origin v1.6.0
```

plus the post-submit follow-ups the operator (or a later plan) owns:
watch the release.yml run; when AMO publishes 1.6.0, re-run
`tests/verify-amo-listing.js` against the live listing
(credential-gated); `curl -sI` both shields badge URLs per AGENTS.md;
manual store-listing paste from RELEASE_NOTES.md + STORE_ASSETS.md.

**Verify**: `git tag --list "v1.6.0"` → empty; `git status` shows only
the local commit(s) on the advisor branch (unpushed).

## Test plan

- No new tests: metadata, docs, and locale-value changes. The
  verification IS the test plan — every gate in Step 4 (the 072/074
  e2e scenarios re-run against the bumped tree, proving the whatsNew
  refresh broke nothing), plus the artifact-name + zip-contents
  assertions.
- Post-publish listing verification (`verify-amo-listing.js`) is a
  follow-up, not this plan (credential-gated, needs the live 1.6.0).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n '"version"' manifest.json package.json` → `"1.6.0"`
  twice; `cat VERSION` → `1.6.0` (5 bytes, no newline)
- [ ] `head` shows 1.6.0 sections in both notes files; `grep -c "1.6.0"`
  → ≥ 2 each; notes name 063/072/074 with plan numbers, nothing else
- [ ] whatsNewIntro/Point equal the Step 2 strings in both locales;
  title/dismiss byte-identical to before; 176/176 keys
- [ ] Privacy fragments + date present as inlined; no other privacy edit
- [ ] Zero static version badges (`rg` from Step 1 → empty)
- [ ] `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0 (81/81)
- [ ] `npm run test:extension && npm run test:package` → exit 0,
  artifact `linkedin-spam-blocker-1.6.0.zip` with VERSION inside
- [ ] Firefox outcome recorded (pass, or toolchain-absent with backstop
  named)
- [ ] `git tag --list "v1.6.0"` empty; `git ls-remote --tags origin |
  grep v1.6.0` empty; branch unpushed
- [ ] `git diff --name-only <base>..HEAD` lists only: manifest.json,
  package.json, VERSION, RELEASE_NOTES.md, CHANGELOG.md,
  _locales/en+es/messages.json, PRIVACY_POLICY.md
- [ ] `plans/README.md` status row updated (reviewer-owned if dispatched)

## STOP conditions

Stop and report back (do not improvise) if:

- HEAD CI (`gh run list --branch main --limit 1`) is not success on the
  merge base — never release on red main.
- A `v1.6.0` tag exists locally or on origin — a previous attempt
  partially ran; report before doing anything.
- `_locales/{fr,pt,de}` exists — unvalidated translations would ship;
  resequence (050 rule).
- Any static version badge exists (061 regression) or any translated
  README carries version text that the bump would falsify.
- The notes' feature list cannot be derived from DONE rows + git log.
- The privacy file drifted from the quoted paragraphs (Step 3 edit void).
- The ES whatsNew strings need rewording — keep verbatim, flag for
  speaker review (standing rule, not an executor edit).
- Firefox smoke RUNS and fails on a present toolchain.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Standing rule (new):** every release refreshes the four `whatsNew*`
  strings to that version's highlights — the 072 note said to add this
  to `RELEASE_CHECKLIST.md`, but the checklist holds no lockstep list
  (072-review finding); either add the line + the five-file list there
  in a docs pass, or keep the rule here. Do not let a release ship
  stale whatsNew copy again.
- **Post-submit:** AMO review lag means Firefox trails Chrome (1.5.0
  precedent) — watch the release job, re-run `verify-amo-listing.js`
  when 1.6.0 is public, `curl -sI` the badge URLs.
- **Deferred:** 062-style store-copy refresh for 1.6.0 (listings stay
  accurate; separate docs pass if wanted); automating anything in the
  submit path; FR/PT/DE locales (sourcing decision (c) stands).
- **Deferred:** the AGENTS.md-vs-checklist lockstep drift (AGENTS
  claims five-file ownership by the checklist; the checklist has no
  such list) — docs pass, not this release.
- Reviewers should scrutinize: title/dismiss strings truly untouched
  (`git diff` on those two keys must be empty), VERSION byte shape,
  and that no behavior file changed (`content.js`, `background.js`,
  `options/*`, `popup/*` absent from the diff).
