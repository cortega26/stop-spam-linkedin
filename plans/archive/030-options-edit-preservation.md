# Plan 030: Preserve in-progress phrase edits across re-renders and stop the double render

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- options/options.js tests/extension-interactions.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (render-path change in a page that relies on `onChanged`
  to reflect cross-context writes)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

Two related options-page defects:

1. **In-progress edits are silently discarded.** `render()` rebuilds the
   edit row's `<input>` from the *stored* phrase (`options/options.js:1198-1221`),
   and `render()` fires from the debounced search handler, from `save()`'s
   success callback, from the `storage.onChanged` listener, and from the
   3-second confirm timers. Typing an edit to phrase A, then toggling
   phrase B (or typing in search), wipes A's unsaved text and yanks focus.
2. **Every local write renders twice.** `save()` calls `render()` in its
   success callback, and the page's own `storage.sync.set` round-trips
   back through `storage.onChanged`, which calls `render()` again
   (`options/options.js:136-147`). On a 200-phrase list, one toggle costs
   two full rebuilds (~3,000 nodes each).

## Current state

- `options/options.js:158-169` — `save()`: `render()` in success callback.
- `options/options.js:136-147` — `storage.onChanged` calls `render()` for
  phrases/langs/disabled-patterns changes (including the page's own writes).
- `options/options.js:1198-1221` — edit row creation: `<input value={p.text}>` from stored `p`, keyed by `editId`.
- `options/options.js:269-275, 362-368` — `handleToggle`/`toggleMode` mutate `p.enabled` then `save()` (→ render + onChanged render).
- `options/options.js:59` — search input → `debounce(() => render(), 200)`.
- `options/options.js:304-309` — confirm-timer re-renders.
- `render()` (options/options.js:1082-1128) — rebuilds all sections; `createRow` (~1162-1249) builds ~15 nodes per phrase row.

Repo conventions: `editId` state already exists; the page uses
`debounce` (line 59) and event delegation. Cross-context sync correctness
(the "another tab changed storage" case) must keep working — the fix must
distinguish local writes from remote ones.

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
- `options/options.js`
- `tests/extension-interactions.js`

**Out of scope** (do NOT touch):
- `content.js`, `popup/popup.js` — their renders are not affected.
- The edit-input visual style / row layout — behavior only.
- Import/export flows (plans 026/027).

## Git workflow

- Branch: `advisor/030-options-edit-preservation`
- Commits, conventional style: `fix(options): preserve in-progress edits across re-renders` and `perf(options): skip double render for local storage writes`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Preserve the in-progress edit across renders

In `options/options.js`, maintain a draft: when the edit input fires
`input`, save `{ id: editId, text }` to a module-level `editDraft`
variable (alongside `editId`). In the edit-row creation, when
`editId === p.id && editDraft`, create the input with
`value = editDraft.text`. Clear `editDraft` when the edit is saved or
cancelled (the existing save/cancel handlers are the hooks). This makes
`render()` idempotent with respect to typing: rebuilds re-populate the
live draft instead of reverting to storage.

Also preserve focus: after `render()`, if `editId` is set, re-focus the
edit input (the existing re-focus path at `options/options.js:313-322`
is the model — ensure it uses the draft value).

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all pass.

### Step 2: Skip the double render for local writes

Track local writes: in `save()`, `saveLangs()`, `handleBuiltinToggle`,
and any other `chrome.storage.sync.set` that is immediately followed by
`render()`, set a flag (e.g. `localWritePending = true`) before the
`set` and clear it in the callback. In the `storage.onChanged` listener,
when the flag is set for a change that this page just wrote, skip the
`render()` call (the direct one already happened); otherwise render as
today (remote changes still render).

Simplest correct shape: capture the keys this page wrote in a
`Set<string>`, and in `onChanged` skip `render()` for keys in that set
(clearing them after). Keep the state-variable updates in `onChanged`
unconditional — only the *render* is skipped, so state stays in sync.

**Verify**: `npm run test:unit` → all pass. Manual reasoning check via
e2e (next step): a toggle should produce exactly one `render()` — the
e2e cannot count renders directly; instead assert the *outcome* (state
correct, edit preserved) which the next step covers.

### Step 3: e2e regression — edit survives a sibling toggle; single render outcome

In `tests/extension-interactions.js` options-section, add:
1. Add two phrases. Start editing phrase A (fill the input). Toggle
   phrase B's enable switch. Assert the edit input for A still contains
   the typed text (not the stored value) and still has focus.
2. After the toggle, assert storage (`ss_custom_phrases`) matches the
   toggle (the onChanged-skip didn't break persistence) and the UI row
   for B shows the new state.

**Verify**: `npm run test:extension` → both files pass. Run twice for
stability.

## Test plan

One e2e scenario (Step 3). No unit tests — this is DOM-driven page
behavior in an IIFE.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes with the edit-preservation scenario
- [ ] `grep -n "editDraft" options/options.js` matches (draft state exists)
- [ ] The onChanged listener skips render for locally-written keys (readable in diff)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- The onChanged skip breaks the "edit in another tab reflects here"
  behavior (the whole point of the listener) — that's a real regression,
  not a nuance.
- You find the confirm-timer re-renders (3 s timeout) also need draft
  preservation and it doesn't fit the Step-1 shape — report rather than
  expand scope.

## Maintenance notes

- The `localWritePending`/key-set mechanism must cover every
  `storage.sync.set` in options.js that renders afterwards; the reviewer
  should grep for `render()` calls and check each is either local-skipped
  or remote-rendered.
- If a future "edit in place" feature replaces the edit-row pattern,
  this draft mechanism is the thing to keep.
- The e2e focus assertion can be flaky under `xvfb`; if so, assert the
  input *value* only and note the focus check as best-effort.
