# Plan 017: Cache Playwright's Chromium download in CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- .github/workflows/ci.yml package-lock.json package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `1f7f4e3`, 2026-08-14
- **REVISED 2026-08-14**: the original plan also targeted
  `.github/workflows/release.yml`'s `package` job. Execution proved that
  premise false — the release `package` job has NEVER had an
  `Install Playwright browsers` step (verified absent at both `1f7f4e3`
  and HEAD; the only Playwright reference in `.github/workflows/` is
  `ci.yml:31`). The release job runs `smoke` + `package` only, neither of
  which uses Playwright, so caching `~/.cache/ms-playwright` there would
  cache a directory nothing populates. This plan is scoped to `ci.yml`
  only.

## Why this matters

Every CI run downloads Playwright's Chromium from scratch:
`npx playwright install --with-deps chromium` in `.github/workflows/ci.yml`'s
`extension` job. That's roughly 150-200 MB downloaded and unpacked per run
(~1-2 minutes of wall time). The npm dependencies are already cached via
`actions/setup-node`'s `cache: npm`; the browser binaries are not. This
plan adds an `actions/cache` step keyed on `package-lock.json` (which pins
Playwright's version), so the browser download happens only when the
Playwright version changes.

## Current state

`.github/workflows/ci.yml` — the relevant steps in the `extension` job
(verified live; note plan 005 added a `Run unit tests` step after `Run
smoke checks`, which is irrelevant to this change):

```yaml
      - name: Set up Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run smoke checks
        run: npm run smoke
```

Playwright's browser binaries land in `~/.cache/ms-playwright` on Ubuntu
runners.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| YAML sanity | `node -e "const fs=require('fs'); const y=fs.readFileSync('.github/workflows/ci.yml','utf8'); if (!y.includes('ms-playwright')) process.exit(1); console.log('ok')"` | `ok` |
| Local smoke | `npm run smoke` | exit 0 (workflow files aren't covered by smoke; this confirms nothing else broke) |

## Scope

**In scope**:
- `.github/workflows/ci.yml` (add cache step to the `extension` job)

**Out of scope**:
- `.github/workflows/release.yml` — its `package` job does not run
  Playwright at all (smoke + package only); nothing to cache there. If a
  future change adds e2e runs to the release flow, add the cache step then.
- Changing how Playwright is installed (keep `--with-deps chromium` — the
  apt system deps are separate from the cached browser binaries).
- Caching anything else (npm cache is already handled by `setup-node`).

## Git workflow

- Branch: `advisor/017-ci-playwright-cache`
- Commit message style: `ci: cache Playwright browser binaries across runs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the cache step to `ci.yml`

In the `extension` job, between "Install dependencies" and "Install
Playwright browsers", insert:

```yaml
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ hashFiles('package-lock.json') }}
          restore-keys: playwright-
```

**Verify**: the node YAML-sanity command above prints `ok`; `git diff`
shows only the inserted step in `ci.yml`; `grep -c "actions/cache@v4" .github/workflows/ci.yml` → `1`; `grep -c "actions/cache@v4" .github/workflows/release.yml` → `0` (release.yml untouched).

### Step 2: Validate placement

Read `ci.yml` end to end. Confirm: the cache step runs before
`npx playwright install --with-deps chromium`; the key input is exactly
`playwright-${{ hashFiles('package-lock.json') }}`; nothing else
references `ms-playwright`.

**Verify**: `grep -n "ms-playwright\|hashFiles\|cache@v4" .github/workflows/ci.yml` — each line appears in the `extension` job.

## Test plan

- No code changes, so no new tests. The change is only verifiable by
  running the workflow on GitHub: after this lands on the branch, push
  once (or open a PR) and confirm the CI job shows a cache hit on the
  second run ("Cache restored from key: playwright-...").
- If you cannot push (per the Git workflow section), state in your
  completion report that live-run verification is pending the operator's
  push — the local checks in Step 1 are the gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `actions/cache@v4` step present in `ci.yml` (extension job) only
- [ ] The cache step uses `path: ~/.cache/ms-playwright` and
      `key: playwright-${{ hashFiles('package-lock.json') }}` with
      `restore-keys: playwright-`
- [ ] The cache step is positioned before the "Install Playwright browsers" step
- [ ] `git status` shows only `ci.yml` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `ci.yml` has drifted structurally (e.g. the extension job no longer has
  an "Install Playwright browsers" step) — report rather than relocating
  steps.
- You find the workflow was already caching the browsers — nothing to do;
  mark the plan DONE and note it.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- When Playwright is bumped (package-lock changes), the cache key changes
  automatically — the old key stays on GitHub for 7 days then expires.
  No manual cache management needed.
- `--with-deps` still runs on every build (it's the apt install step); only
  the browser download is cached. If the apt step ever becomes the slow
  part, revisit then — not now.
- If e2e tests are ever added to `release.yml` (currently smoke-only),
  mirror this cache step there at the same time.
- A reviewer should scrutinize: the cache step must NOT be placed after
  `npm ci`-adjacent steps in a way that changes the job's failure
  semantics — cache misses are non-fatal by design (the install step just
  redownloads).
