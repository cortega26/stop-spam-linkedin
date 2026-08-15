# Plan 023: Fix whitelist same-tab restore — diff against `oldValue`, not the live set

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js tests/extension-interactions.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

When an author is added to the whitelist, the content script's
`storage.onChanged` handler restores that author's already-blocked posts.
The diff ("which ids are newly added") compares against the **live
`whitelistedAuthors` Set** — but the two in-flow writers (`addToWhitelist`
message and the "Never block this author" button) mutate that same Set
*in place* before `chrome.storage.sync.set`. `onChanged` fires in the
writing tab too, by which point `previous.has(id)` is already true, so the
restore is skipped in that tab. Result: clicking "Never block this author"
un-hides only the clicked post; the author's *other* blocked posts stay
hidden in the current tab, while the identical write un-hides them in
every other tab. The existing e2e only drives whitelist changes from the
test harness (a different context), so the same-tab path ships green.

## Current state

- `content.js:310-318` — the onChanged diff:
  ```js
  if (changes[STORAGE_KEYS.WHITELIST]) {
    const previous = whitelistedAuthors;
    whitelistedAuthors = new Set(changes[STORAGE_KEYS.WHITELIST].newValue || []);
    for (const id of whitelistedAuthors) {
      if (!previous.has(id)) restoreAuthorPosts(id);
    }
  }
  ```
- `content.js:468-470` — `addToWhitelist` message case mutates the live set first:
  ```js
  whitelistedAuthors.add(msg.authorId);
  pruneSet(whitelistedAuthors, LIMITS.MAX_WHITELIST);
  chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] });
  ```
- `content.js:918-920` — the "Never block this author" button does the same in-place add, then `restorePost(post)` for the clicked post only.
- `tests/extension-interactions.js:194-208` — the whitelist-restore e2e drives `setSyncStorage` (cross-context) → different-tab semantics, never the same-tab path.

Repo conventions: `chrome.storage.onChanged` callbacks receive
`changes[key].oldValue` / `newValue` — the API already delivers the
pre-write value; prefer it over live state.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass (36)       |
| E2E       | `npm run test:extension` | both files pass     |

## Scope

**In scope**:
- `content.js`
- `tests/extension-interactions.js`

**Out of scope** (do NOT touch):
- `popup/popup.js`, `options/options.js` — whitelist management UIs are unaffected; the bug is purely in the content script's diff.
- `shared/*` — no shared code involved.

## Git workflow

- Branch: `advisor/023-whitelist-same-tab-restore`
- Commit message style: conventional, e.g. `fix(whitelist): restore same-tab author posts via oldValue diff`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Diff against `oldValue`

In `content.js` onChanged WHITELIST branch, derive the previously-stored
set from the event payload instead of the live variable:

```js
if (changes[STORAGE_KEYS.WHITELIST]) {
  const previous = new Set(changes[STORAGE_KEYS.WHITELIST].oldValue || []);
  whitelistedAuthors = new Set(changes[STORAGE_KEYS.WHITELIST].newValue || []);
  for (const id of whitelistedAuthors) {
    if (!previous.has(id)) restoreAuthorPosts(id);
  }
}
```

Keep the explanatory comment, updated to say the diff uses `oldValue` so
same-tab writes (which mutate the live set before `storage.sync.set`) and
cross-tab writes take the same path.

**Verify**: `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → 36 pass.

### Step 2: e2e regression — same-tab "Never block this author" restores ALL of that author's posts

Extend `tests/extension-interactions.js` after the existing whitelist
scenario (around line 208). Reuse the injection pattern from the existing
whitelist test (`linkedInPage.evaluate` creating a `<section
data-id="urn:li:activity:...">` with a `.update-components-actor` author
link). The scenario:

1. Reload the feed for a deterministic state (1 placeholder: spam-1).
2. Inject **two** posts by the same author (`/in/same-author/`), each with
   distinct data-ids and EN bait text → wait for 3 placeholders.
3. Click the "Never block this author" button on the **first** of the two
   injected posts' placeholder (locator: `[data-ss-ph] button` with
   `hasText: /Never block|No bloquear/`).
4. Assert **both** injected posts become visible (`display !== "none"`)
   and spam-1 stays hidden, and placeholder count drops to 1.

With the bug, step 4 fails for the *second* injected post (stays hidden in
the writing tab). This is the regression the fix enables.

**Verify**: `npm run test:extension` → both files pass. Run it twice to
confirm stability (the e2e involves timing).

## Test plan

The new e2e scenario is the regression test (Step 2). No unit tests — the
diff logic is inside the content-script IIFE and is exercised
end-to-end. The existing cross-tab whitelist scenario
(`extension-interactions.js:194-208`) remains as the other-side check.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` all exit 0
- [ ] `npm run test:extension` passes (both files), including the new two-posts-same-author scenario
- [ ] `grep -n "oldValue" content.js` shows the WHITELIST branch using it
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A step's verification fails twice after a reasonable fix attempt.
- The in-page button label key is not found in both locale files (i18n
  mismatch would break the locator — check `_locales/en|es/messages.json`
  for the key the button uses and report the key name).

## Maintenance notes

- `restoreAuthorPosts` (content.js) iterates `blockedPosts` and skips
  `labelBlockedPosts`; the label-guard behavior is covered by plan 032's
  test additions — do not duplicate.
- The button handler still calls `restorePost(post)` for the clicked post
  directly; after this fix the onChanged diff also restores it — harmless
  double-restore (idempotent, `forceShow`/cooldown re-armed once more). A
  reviewer may choose to drop the direct call for cleanliness, but that's
  optional; keep it minimal here.
- Future whitelist writers must keep using `storage.sync.set` with the
  full array so `oldValue`/`newValue` stay meaningful.
