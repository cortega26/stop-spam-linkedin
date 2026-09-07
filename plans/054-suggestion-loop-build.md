# Plan 054: Build the persistent suggestion loop (from the 043 spike design)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ffdffab..HEAD -- content.js popup/popup.js options/options.js options/options.html shared/constants.js plans/archive/043-suggestion-loop-design.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Also re-read the archived 043
> design — it is the authority this plan implements.)

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (state moves from memory to storage across three surfaces; design is pre-proven)
- **Depends on**: `plans/archive/043-suggestion-loop-design.md` (read-only — committed, so no ordering constraint)
- **Category**: direction (build — implements a finished spike design)
- **Planned at**: commit `ffdffab`, 2026-09-07

## Why this matters

Trigger-word suggestions today are amnesiac: the queue and dismissals live
in module state (`content.js`), so a dismissed word is re-suggested after
every reload, and the popup is the only surface — gated on a live LinkedIn
tab, with "Add" hardwired to exact-mode (the known false-positive
amplifier). The 043 spike proved a persistent design (two local keys, an
options surface with exact/contains/dismiss choice, popup fallback read)
with the full suite green and an explicit PROCEED verdict. This plan builds
it, which finally makes dismissals permanent and puts the safer
contains-mode one click away at suggestion time.

## Current state

Decisions inherited from the archived design (Step 1: read §§1–6, the open
questions, and the verdict — the summary below does not replace them):

- **Problem** (verified on the base tree by the spike): in-memory
  `pendingSuggestions`/`dismissedSuggestions`; popup-only surface gated on
  live state with `suggestions: []` hardcoded in the fallback
  (`popup/popup.js:128`); Add always exact-mode (`content.js` addSuggestion
  handler); dismissals evaporate on reload.
- **Storage (decided)**: two keys in `chrome.storage.local`, written
  together — `ss_pending_suggestions` (array of `{word, timestamp}`,
  capped at 3, FIFO) and `ss_dismissed_suggestions` (array of strings,
  word-length-validated on read, intentionally uncapped: thousands of
  dismissals are kilobytes against the 10 MB local quota). Local, not sync
  (feed excerpts + ephemeral runtime state; avoids sync byte quotas).
  Stale-suggestion TTL deferred (timestamp kept for a future policy).
- **Boot/migration**: no data migration (nothing ever persisted); boot does
  a `local.get` with a sanitizer (`normalizePendingSuggestions`: array,
  non-empty word ≤ `LIMITS.MAX_PHRASE_LENGTH`, numeric timestamp, re-cap 3);
  the content `onChanged` listener gains both keys. In-memory stays
  authoritative at runtime; storage is the mirror.
- **Options surface (decided)**: "Suggestions" section mirroring the
  excluded-list section (`options/options.js` renderExcluded area,
  `options/options.html` excluded section): hidden when empty; per-word row
  with **Add as exact / Add as contains / Dismiss**; validation mirrors
  `handleAdd` (length, case-insensitive duplicate, `MAX_CUSTOM_PHRASES`,
  `QUOTA_BYTES_PER_ITEM × 0.95` byte check, existing toasts).
- **Popup**: fallback path reads the persisted queue (the design's §5 —
  read it; the build either accepts the duplicated validation in popup.js
  or makes fallback read-only per the recorded decision).
- **Derivation**: proceed with derivation A + C per the verdict (executor:
  read §6 — do not substitute your own derivation).
- **Open product questions** (resolve + document): contains-vs-exact
  default; fallback Add duplication vs read-only; TTL (deferred, keep the
  timestamp field).
- Reference only: `advisor/043-suggestion-loop-spike` (origin, throwaway).
- Known test impact (from the index): the build must update the e2e
  expectation at `tests/extension-interactions.js:741` (the spike found the
  prototype changes it — read the surrounding scenario before touching).
- Repo conventions (AGENTS.md): `"use strict"` IIFEs; new `STORAGE_KEYS`
  in `SS_CONSTANTS`; en+es locale keys; no build step.

## Commands you will need

| Purpose   | Command                  | Provenance | Expected on success |
|-----------|--------------------------|------------|---------------------|
| Smoke     | `npm run smoke`          | executed   | exit 0              |
| Lint      | `npm run lint`           | executed   | exit 0              |
| Typecheck | `npm run typecheck`      | executed   | exit 0              |
| Unit      | `npm run test:unit`      | executed   | 63/63 pass          |
| Ext e2e   | `npm run test:extension` | declared   | exit 0              |
| Pkg e2e   | `npm run test:package`   | declared   | exit 0              |

## Scope

**In scope**:
- `shared/constants.js` (two new `STORAGE_KEYS`)
- `content.js` (persisted queue/dismissals, boot load + sanitizer, onChanged cases, suggestion push/dismiss/add paths)
- `options/options.js` + `options/options.html` (Suggestions section, three actions)
- `popup/popup.js` (fallback read per §5 decision)
- `_locales/en|es/messages.json` (section + action strings; the section title key `suggestionsLabel` already exists in both locales — verify, don't duplicate)
- `tests/extension-interactions.js` (expectation update at :741 + new scenarios)

**Out of scope** (do NOT touch):
- Starter-pack semantics (`handleStarterPack` untouched — starter pack stays exact-mode opt-in).
- `background.js`, `STORE_ASSETS.md`, badges, backup/export shape (suggestions are runtime state, not backup data).
- The fragment-derivation helper beyond what §6 specifies.

## Git workflow

- Branch: `advisor/054-suggestion-loop`
- Commit per step or logical unit; conventional-ish, e.g. `feat(suggestions): persist suggestion queue and dismissals` (see `git log --oneline`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run the four executed commands unmodified; confirm tabled results. A
`declared` failure is a broken baseline — STOP and report.

**Verify**: smoke/lint/typecheck exit 0; unit 63/63 pass.

### Step 1: Read the design doc end to end

Read `plans/archive/043-suggestion-loop-design.md` §§1–6 + open questions +
verdict + spike bookkeeping (which files the prototype touched:
constants, content, popup, options.js/html — and that
`shared/pattern-data.js` was NOT changed). Confirm the spike branch exists
remotely for reference (`git branch -a | grep 043`) — if gone, the doc is
still the authority; note it in the commit message.

**Verify**: `npm run smoke` → exit 0 (no changes yet).

### Step 2: Storage + content-script paths

Add both keys; implement boot load + sanitizer + onChanged cases; move
push/dismiss/add onto the persisted mirror (in-memory authoritative at
runtime). Keep the queue cap of 3 and the existing dedupe rules (against
dismissals, user phrases, queue). Resolve the §5 fallback question for
popup now (duplicated validation vs read-only) and document the choice in
the commit message.

**Verify**: `node --check content.js && npm run lint && npm run typecheck` → exit 0.

### Step 3: Options section + popup fallback + locales

Build the Suggestions section per §4 (hidden-when-empty, three actions,
handleAdd-mirroring validation); implement the popup fallback read;
add/verify locale keys in both files (`suggestionsLabel` should already
exist — confirm before adding).

**Verify**: `npm run lint && npm run typecheck` → exit 0; new keys present in both locale files.

### Step 4: e2e (incl. the known :741 update) + full verification

Update the `tests/extension-interactions.js:741` expectation per the
design's note (read the scenario first — understand WHY it changes before
editing). Add scenarios: dismiss persists across reload (re-suggested
before, gone after); options Add-as-contains writes a contains-mode
phrase; popup fallback renders the queue with no live LinkedIn tab. Then:

```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension && npm run test:package
```

**Verify**: all green including new scenarios.

## Test plan

- e2e (Step 4): persistence-across-reload, three options actions, popup
  fallback. Structural pattern: existing suggestion scenarios around
  `tests/extension-interactions.js:741`.
- Unit: sanitizer cases (`normalizePendingSuggestions` — malformed entries
  dropped, re-cap to 3) in the `tests/unit/` style.
- Regression net: full extension + package suites.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 / pass
- [ ] `npm run test:extension` + `npm run test:package` exit 0 with the new scenarios
- [ ] Dismiss-then-reload e2e proves the dismissal persisted (fails on pre-build code by re-suggesting)
- [ ] No exact-mode-only path remains for suggestions (options offers contains; popup behavior per the §5 decision, documented)
- [ ] `git diff --name-only ffdffab..HEAD` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The design doc's cited code (suggestion state lines, popup fallback, handleAdd) doesn't match live code.
- The :741 expectation change is not explained by the design — understand before editing; a surprising diff means drift.
- Persisted state and in-memory state disagree after reload in a way the mirror model doesn't explain.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a TTL expiry policy is ever added, the timestamp field is already stored — no migration needed.
- A reviewer should check the uncapped dismissal list's read-validation and confirm suggestions never enter backup/export.
- **Deferred:** stale-suggestion TTL eviction — unblocked by nothing, just unnecessary at this volume.
