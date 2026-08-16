# Plan 031: Check `chrome.runtime.lastError` on all fire-and-forget storage writes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js background.js popup/popup.js options/options.js`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (soft: 029 first — same files, sequencing avoids
  churn overlap)
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

About 15 `chrome.storage.set` call sites mutate in-memory state first and
write to storage with no callback and no `chrome.runtime.lastError`
check. On a quota or transient failure the write silently dies while the
UI (and the content script's Sets/Maps) already show the new state; the
next `onChanged` from any other context then clobbers the divergent
in-memory state — silent loss of user preferences with no trace. The
codebase already has the correct pattern in two places
(`migrateRuntimeStorage` at `content.js:172-178` and `addSuggestion` at
`content.js:450-454`) — these sites are the exception, not the
convention.

## Current state

Unchecked `chrome.storage.*.set` sites (verify each by reading — the
list is a starting point, not gospel):

- `content.js`: whitelist add/remove (`:470, :480`), blocked-authors
  add/remove (`:495, :505`), exclusions save (`:876`), never-block /
  unblock buttons (`:896, :920`), snooze (`:1034, :1039`), toggle
  (`:366-368`), resetCount (`:375-378`), dismissOnboard (`:417`).
- `options/options.js`: import merges (plan 026 hardens these — skip
  them here), whitelist/blocked-author/exclusion removals (`:880,
  :938-940, :1046-1048`), `saveLangs` (`:794-796`), disabled-patterns
  (`:1120`).
- `popup/popup.js`: toggle fallback writes (`:330, :341, :367`).
- `background.js`: `setBadge` paths use `chrome.action.setBadgeText`
  (different API — verify whether its errors matter; badge is cosmetic).

The established pattern (from `content.js:172-178`):
```js
chrome.storage.local.set(localPatch, () => {
  if (chrome.runtime.lastError) {
    console.warn("Storage migration (local.set) failed:", chrome.runtime.lastError.message);
    return;
  }
  ...
});
```

Repo conventions: `console.warn` with a labeled message is the house
style; no error surface is required for these (they're best-effort
persistence), only a trace. `content.js` is a `"use strict"` IIFE.

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
- `content.js`, `options/options.js`, `popup/popup.js`, `background.js`

**Out of scope** (do NOT touch):
- The import-merge writes in `options/options.js` — plan 026 gives them
  their own revert+toast handling; don't double-change them.
- The phrase-`save()` in `options/options.js` — already handled
  (`:158-169`).
- Behavioral changes to rollback semantics — this plan adds *reporting*
  only. Sites that already have custom revert logic keep it.

## Git workflow

- Branch: `advisor/031-storage-error-checks`
- Commit message style: conventional, e.g. `fix(storage): warn on failed fire-and-forget writes`.
- One commit per file or one combined — your call; keep messages
  scoped. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Enumerate and harden the sites in `content.js`

Re-read `content.js` and add a callback with the `lastError` warn to
every `chrome.storage.sync.set`/`chrome.storage.local.set` that lacks
one. Sites with an existing callback keep their logic; sites without one
get the standard pattern above. If the page/extension has a helper
pattern you prefer (e.g. a local `persist()` wrapper), that's acceptable
if it matches house style — but prefer the inline pattern already used
twice in this file.

**Verify**: `npm run smoke`, `npm run lint`, `npm run typecheck` → exit 0;
`npm run test:unit` → all pass.

### Step 2: Same pass in `options/options.js`, `popup/popup.js`, `background.js`

Apply the same hardening. For `options/options.js`, skip the import
writes (plan 026) and the phrase `save()` (already handled); harden the
removal handlers and `saveLangs`. For `popup/popup.js`, the fallback
writes (`:330, :341, :367`) get the same callback. For `background.js`,
check the badge path and any storage writes; if none are storage writes,
note that in the commit message.

**Verify**: `npm run lint` → exit 0; `npm run typecheck` → exit 0;
`npm run test:unit` → all pass.

### Step 3: Regression — e2e suite

Run the full e2e to confirm no behavior change:
`npm run test:extension` → both files pass. Also `npm run test:package`
if the packaged-zip flow is part of your normal verification.

**Verify**: both e2e files pass.

## Test plan

No new tests — this is a defensive-reporting change; the existing suite
is the regression net. The reviewer verifies by reading the diff that
every flagged site now has a callback.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes
- [ ] `grep -rn "chrome.storage.sync.set\|chrome.storage.local.set" content.js options/options.js popup/popup.js background.js` — every match on a line without a `lastError` guard is a deliberate exception named in a commit message (import writes, phrase save)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- You find a write whose *failure should surface to the user* (not just
  warn) — flag it as a candidate for the plan-026-style revert handling
  instead of silently warning.
- The sites listed diverge substantially from what's actually in the
  files (report the correct list).

## Maintenance notes

- After this plan, the grep in Done criteria is the reviewer's checklist
  for any future storage write: new writes should include the callback
  from day one.
- Plan 026 changes import writes to revert+toast; if this plan runs
  first, 026 supersedes those sites — note it in both indexes.
- The multi-tab counter race (accepted) writes `blockedCount`; the warn
  here will surface it in console if it happens — useful, not a fix.
