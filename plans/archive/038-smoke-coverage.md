# Plan 038: `npm run smoke` must `node --check` every shipped runtime file

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- package.json`
> If package.json changed since this plan was written, compare the
> "Current state" excerpt against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`npm run smoke` is the repo's first verification gate (AGENTS.md
mandates it after any change), but its `node --check` chain is
hand-maintained and out of date. It checks `shared/constants.js` and
`shared/pattern-data.js` but **not `shared/post-container.js`** — a
shipped content-script file loaded on all 11 match patterns and present
in the packaged zip (`scripts/package-extension.js:20`). A syntax error
there passes the mandated gate and ships. The newer test/script files
(`tests/firefox-smoke.js`, `tests/helpers.js`, unit tests,
`scripts/*.js`) are likewise unverified by smoke. Every file added since
the chain was written has silently fallen outside it.

## Current state

- `package.json:6` — the smoke chain: checks `manifest.json`, both
  locales, `content.js`, `background.js`, `popup/popup.js`,
  `options/options.js`, `i18n.js`, `shared/constants.js`,
  `shared/pattern-data.js`, `tests/extension-smoke.js`,
  `tests/unit/pattern-data.test.js`.
- Missing (verified): `shared/post-container.js`, `tests/helpers.js`,
  `tests/extension-interactions.js`, `tests/firefox-smoke.js`,
  `tests/unit/post-container.test.js`, `tests/unit/cooldown-store.test.js`,
  `scripts/package-extension.js`, `scripts/submit-stores.js`.
- `manifest.json:46` — content_scripts loads `shared/post-container.js`.

Repo conventions: no build step; smoke is a shell chain. `jq` is the
JSON checker; `node --check` is the syntax checker. The chain must stay
complete by construction — prefer a generated list over hand-maintained
entries.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |

## Scope

**In scope**:
- `package.json` (smoke script only)
- `AGENTS.md` only if it names the file list (check; plan 037 may have
  refreshed it — coordinate the cross-reference)

**Out of scope** (do NOT touch):
- `tests/` file contents — syntax-check only, no fixes.
- `eslint.config.js` — lint already covers these files; smoke is
  additive.

## Git workflow

- Branch: `advisor/038-smoke-coverage`
- Commit message style: conventional, e.g. `fix(scripts): node --check all shipped and test files in smoke`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extend the smoke chain with the missing files

Append to the `node --check` chain in `package.json:6`:

```
shared/post-container.js && node --check tests/helpers.js && node --check tests/extension-interactions.js && node --check tests/firefox-smoke.js && node --check tests/unit/post-container.test.js && node --check tests/unit/cooldown-store.test.js && node --check scripts/package-extension.js && node --check scripts/submit-stores.js
```

Keep the existing entries. Verify the resulting chain matches the full
file list: every `.js` file in the shipped zip
(`scripts/package-extension.js:15-39` files array) plus every file in
`tests/` and `scripts/`.

**Verify**: `npm run smoke` → exit 0.

### Step 2: Prove the gate catches a syntax error (and revert)

Temporarily append a broken line to `shared/post-container.js` (e.g.
`this is not valid js !!!`), run `npm run smoke` → must fail with a
syntax error naming `shared/post-container.js`; then remove the broken
line and re-run → exit 0. (Do this in the branch worktree; never leave
the breakage in place.)

**Verify**: first run fails, second run exits 0.

## Test plan

None — the smoke script is the gate; Step 2 proves it works.

## Done criteria

- [ ] `npm run smoke` exits 0
- [ ] `npm run lint` exits 0
- [ ] `node -e "const p=require('./package.json'); console.log(p.scripts.smoke)"` includes `shared/post-container.js`, `tests/firefox-smoke.js`, `tests/helpers.js`, `scripts/package-extension.js`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The smoke chain doesn't match the excerpt (drift).
- A verification fails twice after a reasonable fix attempt.
- `npm run smoke` is slow enough to matter after the additions (it
  won't be — `node --check` is ~10ms/file; if it somehow is, report
  rather than trimming coverage).

## Maintenance notes

- The durable fix is deriving the file list from
  `scripts/package-extension.js`'s files array + a glob of tests/scripts
  — if you can do that with a tiny node one-liner in the script, prefer
  it over appending by hand; note what you chose.
- AGENTS.md's verification table should describe smoke as covering
  "every shipped and test JS file" (coordinate with plan 037).
- Reviewer should re-check the chain after any future file is added to
  the zip — this plan's Done criteria are the checklist.
