# Plan 029: Measure storage bytes as UTF-8 in the three `estimatePhraseBytes` copies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js background.js options/options.js`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

Chrome's `QUOTA_BYTES_PER_ITEM` counts **UTF-8 bytes** of the serialized
value. The repo's three copies of `estimatePhraseBytes` measure
`JSON.stringify(...).length`, which counts **UTF-16 code units**. For
ASCII-only phrases the two agree; for accented text (Spanish/French/
Portuguese — the extension's core audience), CJK, or emoji, the unit
count understates bytes by up to 3×. A phrase list that "passes" the
pre-check can still exceed the real quota at write time: the options page
reverts with a toast, but the content-script suggestion path
(`content.js:450-454`) and the background context-menu path
(`background.js:108-112`) only `console.warn`, leaving in-memory state
claiming a phrase that never persisted.

## Current state

- `options/options.js:6-8`:
  ```js
  function estimatePhraseBytes(phrases, storageKey) {
    return storageKey.length + JSON.stringify(phrases).length;
  }
  ```
- `content.js:23-25` and `background.js:16-18` — identical copies.
- Quota comparisons: `options/options.js:257-258`, `content.js:443-444`, `background.js:102-103`.
- The extension's own storage keys are ASCII (`ss_...`), so the
  `storageKey.length` term is already byte-exact; only the value term is wrong.

Repo conventions: `TextEncoder` is available in all three contexts
(content script, options page, MV3 service worker) — a standard web API,
no dependency needed. The repo prefers small duplication over shared
modules for three-call-site helpers where each site is context-specific
(`t()`, `debounce` are duplicated per file); match that convention.

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
- `content.js`
- `background.js`
- `options/options.js`

**Out of scope** (do NOT touch):
- `shared/pattern-data.js` — per the convention above, keep the helper
  per-file; do NOT introduce a shared byte helper unless you find all
  three copies in one file (you won't).
- The write-error handling behavior at the call sites (plan 031 covers
  hardening the console.warn sites) — only the measurement changes here.

## Git workflow

- Branch: `advisor/029-utf8-byte-quota`
- Commit message style: conventional, e.g. `fix(quota): measure phrase bytes as UTF-8, matching Chrome's storage quota`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Replace the measurement in all three copies

In each of the three files, change the return to count UTF-8 bytes:

```js
function estimatePhraseBytes(phrases, storageKey) {
  const bytes = new TextEncoder().encode(JSON.stringify(phrases)).length;
  return storageKey.length + bytes;
}
```

Keep the helper names and call sites identical — only the measurement
changes. Do not touch the quota-comparison lines.

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all pass.
- Sanity check: `node -e "console.log(new TextEncoder().encode(JSON.stringify([{text:'é'}])).length)"` → 9 vs the old unit count 8 (`JSON.stringify([{text:'é'}]).length` → 8) — demonstrates the delta.

### Step 2: e2e — accented phrase near the cap persists

In `tests/extension-smoke.js`, extend the phrase-add scenario (or add one
next to it): fill custom phrases with accented text (`é`, `ñ`, `ü`) until
`estimatePhraseBytes`-equivalent is within ~200 bytes of
`QUOTA_BYTES_PER_ITEM`, add one more accented phrase via the options
input, and assert the storage write succeeds (no error toast; the phrase
appears in `getSyncStorage`). Before the fix this scenario would be
flaky at the exact boundary — pick a margin that reliably trips the old
UTF-16 measurement but passes the UTF-8 one (e.g. a phrase of ~2,600
`é`-heavy chars where UTF-16 says ~7,800 and UTF-8 says ~10,400 > 8,192).

**Verify**: `npm run test:extension` → both files pass.

## Test plan

One e2e boundary scenario (Step 2). No unit tests — the helper lives in
IIFEs; the e2e exercises the real `chrome.storage.sync` quota.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes with the accented near-cap scenario
- [ ] `grep -c "new TextEncoder().encode" content.js background.js options/options.js` → 3 (one per file)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- `TextEncoder` is unavailable in one of the three contexts (it isn't —
  standard in all; if a runtime error proves otherwise, report it).
- A call site compares the estimate against something OTHER than
  `QUOTA_BYTES_PER_ITEM` (check each of the three).

## Maintenance notes

- The three copies are intentionally duplicated per repo convention; if
  the quota math ever grows more complex, re-visit extraction to a shared
  helper (the convention note in `AGENTS.md` should be updated then).
- Plan 031 touches the same call sites for error handling — sequence
  this plan first so its measurements are the ones being hardened.
- Reviewer should verify no *decrease* in the allowed phrase volume for
  ASCII users (there shouldn't be: UTF-8 bytes == UTF-16 units for
  ASCII).
