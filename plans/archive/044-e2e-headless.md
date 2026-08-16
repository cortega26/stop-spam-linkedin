# Plan 044: Run e2e under xvfb by default — no visible test browser on dev machines

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 044e8a0..HEAD -- tests/extension-smoke.js tests/extension-interactions.js package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (user-blocking: every local e2e run pops a visible
  browser window on the developer's desktop)
- **Effort**: S
- **Risk**: LOW (xvfb is the exact mechanism CI already uses; no
  extension-loading gamble)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `044e8a0`, 2026-08-15

## Why this matters

Every `npm run test:extension` / `npm run test:package` invocation
launches Playwright Chromium with `headless: false` (MV3 extensions do
not load in headless mode — verified empirically in the first attempt of
this plan: Chromium 148 headless silently ignores `--load-extension`).
On a developer machine with a live `$DISPLAY`, that opens a visible
browser window for the duration of the run, reappearing on every
verification cycle. The user reported this as disruptive ("me tiene
realmente harto... aparece una y otra y otra vez"). The fix is NOT
headless (proven impossible for this extension) — it is xvfb: run the
browser against a virtual display so no window ever reaches the desktop.
CI already does exactly this (its `$DISPLAY` is unset, so the npm scripts
fall back to `xvfb-run -a`); this plan makes the LOCAL path do the same.

## Current state

- `package.json` scripts `test:extension` and `test:package`:
  ```json
  "test:extension": "if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js && node tests/extension-interactions.js; else xvfb-run -a node tests/extension-smoke.js && xvfb-run -a node tests/extension-interactions.js; fi",
  "test:package": "npm run package && ZIP=... && if [ -n \"$DISPLAY\" ]; then node tests/extension-smoke.js \"$ZIP\" && node tests/extension-interactions.js \"$ZIP\"; else xvfb-run -a node tests/extension-smoke.js \"$ZIP\" && xvfb-run -a node tests/extension-interactions.js \"$ZIP\"; fi"
  ```
  The `$DISPLAY` branch is exactly backwards for the user's needs: a live
  display selects the VISIBLE path; CI (no display) gets the invisible one.
- `tests/extension-smoke.js:28` and `tests/extension-interactions.js:27` —
  `headless: false,` (keep it — required for extension loading).
- `tests/firefox-smoke.js` — already headless (`-headless` arg), unrelated.
- `.github/workflows/ci.yml` — runs the npm scripts with no display; the
  xvfb fallback already covers CI. Unchanged by this plan.
- `xvfb-run` is installed on the developer machine (verified).

Repo conventions: the scripts are plain shell in package.json; the repo
already depends on `xvfb-run` being present in CI. Environment variables
are read directly (no dotenv).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass (63)       |
| E2E       | `npm run test:extension` | both files pass, NO visible window |
| Package   | `npm run test:package`   | both files pass against the zip |

## Scope

**In scope**:
- `package.json` (the two test scripts only)
- `tests/extension-smoke.js`, `tests/extension-interactions.js` (only if
  the earlier headless attempt left edits — see Step 0)

**Out of scope** (do NOT touch):
- `tests/helpers.js`, `tests/firefox-smoke.js`.
- `.github/workflows/ci.yml` — CI behavior is unchanged.
- The test assertions; the `headless: false` flags (required).

## Git workflow

- Branch: `advisor/044-e2e-headless`
- Commit message style: conventional, e.g. `test(e2e): run under xvfb so local runs never pop a visible browser`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Reset any leftover headless edits

An earlier attempt on this branch may have left `headless:
process.env.E2E_HEADED !== "1"` and an `E2E_HEADED` comment in the two
test files (uncommitted or committed). If present, REVERT those edits
back to the plain `headless: false,` — the headless approach was proven
impossible (Chromium 148 ignores `--load-extension` headless). Use
`git diff HEAD -- tests/` to see what's there; restore the files to the
committed state (`git checkout -- tests/extension-smoke.js
tests/extension-interactions.js` if they contain E2E_HEADED).

**Verify**: `grep -n "E2E_HEADED" tests/*.js` → no matches; `grep -n
"headless: false" tests/extension-smoke.js tests/extension-interactions.js`
→ both present.

### Step 1: Make the npm scripts always run under xvfb

In `package.json`, replace the `test:extension` and `test:package`
scripts so they do NOT branch on `$DISPLAY` — always run each node
invocation through `xvfb-run -a`:

```json
"test:extension": "xvfb-run -a node tests/extension-smoke.js && xvfb-run -a node tests/extension-interactions.js",
"test:package": "npm run package && ZIP=$(node -p \"'dist/linkedin-spam-blocker-' + require('./manifest.json').version + '.zip'\") && xvfb-run -a node tests/extension-smoke.js \"$ZIP\" && xvfb-run -a node tests/extension-interactions.js \"$ZIP\""
```

Keep everything else in those scripts identical (the ZIP computation
must stay exactly as it is now — copy it verbatim from the current
script).

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → 63 pass.
- `npm run test:extension` → "Extension smoke test passed." /
  "Extension interactions test passed.", AND no visible window appears
  on the display. Verify the window count on :0 does not increase during
  the run (e.g. `xdotool search --name '.*' | wc -l` before vs after, or
  simply observe). xvfb uses a private display (`xvfb-run -a` picks a
  free one), so the browser is invisible by construction.

### Step 2: Prove the no-display path (CI-equivalent)

Run the exact command CI uses (no display, xvfb wrapper):
`DISPLAY= npm run test:extension` → both files pass. This confirms CI
behavior is unchanged.

**Verify**: both files pass with `DISPLAY=` empty.

### Step 3: Package e2e

`npm run test:package` → "Extension smoke test passed." /
"Extension interactions test passed." against the zip, no visible
window.

## Test plan

No new tests — this plan changes the test-runner configuration; the
entire existing suite is the verification.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 (63 tests)
- [ ] `npm run test:extension` passes with NO visible window on :0
- [ ] `DISPLAY= npm run test:extension` passes (CI path)
- [ ] `npm run test:package` passes with no visible window
- [ ] `grep -n "xvfb-run" package.json` → both scripts use it unconditionally
- [ ] `grep -n "E2E_HEADED" tests/*.js package.json` → no matches
- [ ] `grep -n "headless: false" tests/extension-smoke.js tests/extension-interactions.js` → both present (unchanged)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated (SKIP — reviewer maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The cited lines don't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- `xvfb-run` is NOT installed on this machine (it is — verified — but if
  it isn't in the worktree environment, report; do not install anything).
- A test fails under xvfb but passed headed (xvfb-specific flake) —
  report the failing test rather than changing the approach.

## Maintenance notes

- This is the same mechanism CI has used all along — the local path now
  matches CI, which also removes a whole class of
  display-dependent flakiness from local runs.
- If a future Playwright/Chromium version DOES support MV3 extensions in
  headless mode, revisiting `headless: true` would make xvfb unnecessary
  — but that is unproven today and out of scope.
- Reviewer should confirm the ZIP computation string in test:package is
  byte-identical to before (only the display handling changed).
