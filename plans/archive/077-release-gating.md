# Plan 077: Gate the GitHub Release on both store submissions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b7e55ac..HEAD -- .github/workflows/release.yml`
> If the file changed since this plan was written, compare the "Current
> state" excerpt against live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2 (incident-driven, system currently healthy — no live
  harm, but the failure mode is proven and will recur on any failed
  submission)
- **Effort**: S
- **Risk**: LOW (one workflow dependency edge; no runtime, secret, or
  permission change)
- **Depends on**: none
- **Category**: tech-debt (CI correctness)
- **Planned at**: commit `b7e55ac`, 2026-09-14

## Why this matters

The 1.6.0 mistag proved the failure mode: `v1.6.0` was pushed on a commit
whose manifest still said 1.5.0, the Release workflow ran, BOTH store
submissions failed (AMO: "Version 1.5.0 already exists"; Chrome: invalid
re-upload) — and the `Create GitHub Release` job still published a public
1.6.0 release page for content that shipped nowhere. Cleanup required
deleting the release, deleting the tag locally + on origin, merging, and
re-tagging. The root cause is structural: `github-release` needs only
`package`, so it runs in parallel with the submissions instead of after
them. One dependency edge fixes it permanently: the release page is
created if and only if both stores accepted the artifact.

## Current state

The facts the executor needs, inlined (read at `b7e55ac`, full 130-line
file — the whole job graph fits here):

```yaml
jobs:
  package:            # builds zip, uploads artifact  (release.yml:12-40)
    ...
  github-release:     # needs: package ONLY (line 45) → runs parallel
    ...               # to the submissions; gh release create (lines 59-67)
  chrome:             # needs: package (line 72); submit:chrome (line 100)
    ...
  firefox:            # needs: package (line 105); submit:firefox (line 130)
    ...
```

- Incident record: tag `v1.6.0` on `e4c4085` (manifest 1.5.0) → run
  `34883951884` → AMO job failed (version-create rejected, upload
  orphaned, nothing published), Chrome job failed (re-upload rejected,
  listing untouched), `Create GitHub Release` job SUCCEEDED (public
  1.6.0 page for 1.5.0 content). Recovery (operator-executed):
  release deleted, tag deleted local+origin, `advisor/076` merged as
  `b7e55ac`, tag re-created on `b7e55ac`, run `34884770488` all four
  jobs green. No store was ever modified by the bad run.
- Semantics to preserve: job "success" for the stores means ACCEPTED by
  the store APIs (AMO review lag still applies afterwards; the live
  shields badges reflect actual publication, not submission). The page
  therefore means "submitted everywhere", not "published everywhere" —
  accurate, and strictly more honest than today.
- Repo conventions: conventional-ish commits; `.github/workflows/`
  changes get no special review process beyond CI itself; never create,
  push, or move tags (the 1.6.0 incident is exactly why).

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke (tree health) | `npm run smoke` | declared | exit 0 |
| Unit (tree health) | `npm run test:unit` | declared | all pass (81) |
| YAML validity + needs assertion | see Step 2 (js-yaml / pyyaml / strict-grep fallback chain) | declared | exit 0, all three needs present |

Browser suites are deliberately NOT run: no runtime file changes, so
they cannot be affected; CI runs them on the merge push. Lint/typecheck
do not cover YAML (eslint `files` lists are `.js` only — verified in
the 075 review); running them proves nothing about this change, so they
are omitted rather than performed as theater.

## Scope

**In scope** (the only file you should modify):
- `.github/workflows/release.yml` — the `needs:` of `github-release`
  ONLY (one edge: `[package, chrome, firefox]`)

**Out of scope** (do NOT touch):
- `ci.yml`, `submit-stores.js`, secrets, permissions, job steps,
  runner versions, the Node-20 deprecation annotations (known,
  unrelated — actions/* on Node 20 forced to 24; a renovation pass may
  take them together later, not here)
- Any tag operation (create/push/move/delete) — testing this change
  with a live tag would trigger a real submission run; the next real
  release is the live proof (deferred, named below)
- Any runtime file, docs file, or version file

## Git workflow

- Branch: `advisor/077-release-gating`
- One commit, message: `ci(release): create GitHub Release only after both store submissions succeed`
- Do NOT push and do NOT tag unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run smoke + unit on the unmodified checkout. Re-run the drift check
above (must be empty) and confirm the job graph matches Current state
(`needs: package` on all three downstream jobs).

**Verify**: smoke exit 0; unit 81/81; drift empty; all three jobs need
exactly `package`.

### Step 1: Add the dependency edge

Change ONLY the `needs:` of `github-release` (line 45):

```yaml
    needs: [package, chrome, firefox]
```

Nothing else in the file moves: same steps, same secrets, same
`gh release create` invocation. Rationale to keep in the commit
message (one line): a failed store submission must block the public
release page, as proven by the 1.6.0 mistag (run 34883951884).

**Verify**: `git diff` shows exactly one changed hunk (the `needs:`
line); `rg -n "needs:" .github/workflows/release.yml` shows
`package` job with no needs, `github-release` with all three,
`chrome`/`firefox` with `package` (no cycle possible — edges point
strictly downstream toward the release job).

### Step 2: Validate the workflow file

In order, first available wins (record which you used):

1. `node -e "require.resolve('js-yaml')"` succeeds → validate +
   assert with it: parse the file, assert
   `jobs['github-release'].needs` contains `package`, `chrome`,
   `firefox`, and `jobs.chrome.needs`/`jobs.firefox.needs` equal
   `package`. Exit non-zero on any failure.
2. Else `python3 -c "import yaml"` succeeds → same assertions.
3. Else strict structural grep (weakest, honest): the exact three
   lines `needs: [package, chrome, firefox]` under `github-release:`
   with correct two-space job-level indentation matching the
   neighboring jobs, plus `git diff --stat` showing 1 insertion +
   1 deletion in the one file.

**Verify**: the chosen validator exits 0; state which of the three it
was in the commit message (e.g. "validated with js-yaml" / "...with
pyyaml" / "...structural grep only — no YAML parser available").

## Test plan

- No repo tests cover workflow files (verified: smoke checks JSON +
  JS syntax only; eslint covers `.js` only). The verification IS the
  test plan: the Step 2 parser assertion (structural correctness +
  acyclicity by construction) plus smoke/unit proving the tree is
  otherwise untouched.
- Live proof is deferred by design: the next real tag push exercises
  the gated graph. A failure there would surface as "release page
  missing despite green submissions" — visible, diagnosable, and
  strictly less harmful than today's failure mode.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git diff <base>..HEAD --stat` → 1 file
  (`.github/workflows/release.yml`), 1 insertion + 1 deletion
- [ ] Step 2 validator exits 0 (method recorded in commit message)
- [ ] `npm run smoke` exit 0; `npm run test:unit` 81/81
- [ ] No tag created, moved, or pushed (`git tag --list "v*"` unchanged
  vs base; nothing pushed)
- [ ] `plans/README.md` status row updated (reviewer-owned if dispatched)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty (someone else touched the workflow).
- The `needs:` change requires touching anything else in the file to
  stay valid (it shouldn't — single edge).
- You are tempted to "test" with a real tag push or a `workflow_dispatch`
  against store secrets — both trigger real-world side effects; the
  deferred live proof exists precisely so you don't.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Live proof deferred:** the next `v*` tag push is the first exercise
  of the gated graph — confirm the release page appears ONLY after
  green submissions, and record the run id in the release's index row.
- **Known partial-failure semantic:** if one store fails, NO release
  page is created (all-or-nothing). Re-run the failed job(s) after
  fixing; do not hand-create the page (that reopens today's hole).
- **Deferred:** partial-release semantics (page noting per-store state)
  — rejected as complexity for a case best served by fixing forward;
  revisit only if store outages make all-or-nothing painful.
- **Deferred:** Node-20 deprecation warnings on actions/* (unrelated
  renovation).
- Reviewers should scrutinize: that the diff is EXACTLY the needs line
  (any second hunk is scope creep), and that no `workflow_dispatch` or
  secret change rode along.
