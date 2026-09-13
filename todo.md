# Todo — AMO listing description update

## Task 2: Firefox badge bump + repo rule (DONE)

- [x] Grep the exact badge URL shape in README + docs (confirm `v1.2.4`)
      → 5 files, line 10, identical shape
- [x] Swap `Firefox_Add--ons-v1.2.4` → `Firefox_Add--ons-v1.4.0` in
      README.md + docs/README.{es,fr,pt,de}.md (5 files)
- [x] Add the badge-tracks-published-version rule to AGENTS.md
      conventions (no pre-existing store-badge rule found — new bullet)
- [x] Verify: 1.4.0 in all 5 files, 0 matches for 1.2.4 badge
- [x] Run `npm run smoke` / `npm run lint` / `npm run typecheck` → all
      exit 0
- [ ] Commit (conventional message) and report

## Task 1: AMO listing description (DONE)

- [x] **Baseline probe**: GET the addon and print the FULL stored en-US /
      es-ES description — determine whether `### ` headings survived the
      earlier PATCH or were stripped → **STRIPPED (along with **bold**)**
- [x] **Decide payload shape**: AMO strips ALL markdown → plain-text
      payload (headings as lines, no bold, closer as final paragraph)
- [x] **Write the test**: `tests/verify-amo-listing.js` (asserts keys,
      EN markers incl. closer, ES markers incl. closer; exit 0/1)
- [x] **Run test → expect FAIL** → FAILED with the missing-heading
      markers listed (reclaimed, Install it once, recuperado, Instálalo)
- [x] **PATCH plain-text payload** (respect ~40s throttle, retry 429)
      → 200 OK; stored first/last lines = heading/closer in both langs
- [x] **Run test → expect PASS** → PASSED (exit 0)
- [x] **Eyeball check**: fetch public AMO page → "Tu feed, recuperado."
      + closer rendered; version 1.4.0 status public, file 4961294
- [x] **Deliver Chrome paste-ready text** in final report
- [x] **Cleanup**: remove temp extraction files in /tmp/opencode
- [x] **Report** to user (what changed on AMO, what remains manual)

## Note on new standing files (spec.md / todo.md / tests/)

Per the new standing instruction, this task created `spec.md`, `todo.md`,
and `tests/verify-amo-listing.js` (untracked — user has not asked to
commit them; they document the AMO-listing work and provide a repeatable
e2e verification for it).

## Done (previous work, this session)

- [x] Root cause of AMO 1.2.4: submit script uploaded but never created
      the version (plan 046)
- [x] 1.4.0 public on AMO (plan 046 manual submit)
- [x] First PATCH attempt: 400 (`es` invalid) → probed `es-ES` = 200 OK
- [x] Definitive PATCH (en-US + es-ES) returned 200 — response head
      suggested `### ` headings missing → anomaly to verify (this todo)
