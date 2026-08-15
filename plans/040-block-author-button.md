# Plan 040: Add "Block this author" to text-block placeholders (direction D1)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js tests/extension-interactions.js _locales/en/messages.json _locales/es/messages.json`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

The blocklist's only add path is the profile-link context menu
(`background.js:28-38`), but the dominant workflow — spotting a spammer
in the feed — shows the placeholder with a "Never block this author"
button and no blocklist counterpart, even though the authorId is already
computed (`content.js:776-781`). Users who want to stop seeing an author
must hunt for and right-click their profile link. This adds a "Block
this author" button to text-block placeholders, mirroring the whitelist
button's mechanism (the `addToBlockedAuthor` message path already
exists at `content.js:491-500`).

## Current state

- `content.js:907-925` — the whitelist button block in the placeholder builder:
  ```js
  if (authorId && !isAuthorBlock && !isLabelBlock) {
    const whitelistBtn = document.createElement("button");
    whitelistBtn.textContent = t("neverBlock");
    ...
    whitelistBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = getAuthorId(post);
      if (id) {
        whitelistedAuthors.add(id);
        pruneSet(whitelistedAuthors, LIMITS.MAX_WHITELIST);
        chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] });
      }
      restorePost(post);
    });
    placeholder.appendChild(whitelistBtn);
  }
  ```
- `content.js:491-500` — the `addToBlockedAuthor` message case (used by the context menu in background.js) — the mechanism to reuse.
- `content.js:885-901` — the *inverse* button (Unblock author) on author-block placeholders.
- `_locales/en/messages.json` + `_locales/es/messages.json` — i18n keys must be added to BOTH.

Behavioral decision (read the maintenance note before implementing): when
the user blocks an author from a *text-blocked* post, the current post is
already hidden by the text match. Options: (a) keep it hidden and swap
the placeholder to the author-block variant (it becomes an
author-driven block); (b) restore it (it would immediately re-block via
the blocklist anyway on re-scan). Pick (a) — swap to author-block
placeholder — as it matches user intent (post stays hidden, UI shows the
author-block actions). If (a) proves complex, fall back to (b) with the
restore, and note the choice in your report.

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
- `tests/extension-interactions.js`
- `_locales/en/messages.json`, `_locales/es/messages.json`

**Out of scope** (do NOT touch):
- `background.js` — the context-menu path stays.
- `options/options.js` — blocklist management UI already exists.
- `popup/popup.js`.
- The whitelist button's behavior.

## Git workflow

- Branch: `advisor/040-block-author-button`
- Commit message style: conventional, e.g. `feat(placeholder): add 'Block this author' button to text-block placeholders`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the i18n keys

Add `blockAuthor` (and, if used, `blockAuthorTooltip`) to
`_locales/en/messages.json` and `_locales/es/messages.json`. English:
"Block this author". Spanish: "Bloquear este autor". Match the tone of
the existing `neverBlock` key (check its current translation first).

**Verify**: `npm run smoke` → exit 0 (jq validates both locale files).

### Step 2: Add the button in `content.js`

In the placeholder builder, in the same `if (authorId && !isAuthorBlock
&& !isLabelBlock)` block (or a sibling block right after it), add a
"Block this author" button:

- Style: mirror the whitelist button's inline `style.cssText` pattern.
- Click handler: `e.stopPropagation()`, resolve `getAuthorId(post)`,
  then either reuse the `addToBlockedAuthor` message (send it to
  background.js? — no: check where the message case lives; it's in
  `content.js:491-500`, so call it directly as a local function if one
  exists, or inline the same mutation) — mutate `blockedAuthors`,
  `pruneSet(blockedAuthors, LIMITS.MAX_BLOCKED_AUTHORS)`,
  `chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] })`
  with the plan-031 error-check callback.
- Then apply the chosen behavior for the current post (swap to
  author-block placeholder per the decision above, or restore).

**Verify**:
- `npm run smoke`, `npm run lint`, `npm run typecheck` → exit 0; `npm run test:unit` → all pass.

### Step 3: e2e — block-author flow from a text placeholder

In `tests/extension-interactions.js`, add a scenario (model on the
whitelist-button e2e): block an authored spam post → click "Block this
author" on its placeholder → assert:
1. `ss_blocked_authors` contains the author id.
2. The post stays hidden.
3. A second post by the same author, injected after, gets blocked with
   the author-block placeholder variant (check the placeholder shows the
   author-block action, e.g. the "Unblock" button).

**Verify**: `npm run test:extension` → both files pass. Run twice for
stability.

## Test plan

One e2e scenario (Step 3) + locale key parity (Step 1). The existing
author-blocklist e2e (`tests/extension-interactions.js` plan-008
scenario) covers the context-menu path; this covers the new one.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes with the block-author scenario
- [ ] `grep -n "blockAuthor" _locales/en/messages.json _locales/es/messages.json` — present in BOTH
- [ ] The new button is absent from author-block and label-block placeholders (verify via e2e or code read)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- The placeholder-swap approach (a) turns out to require restructuring
  the placeholder builder beyond the button block — fall back to (b)
  restore, and report which you chose.
- Locale parity can't be maintained (both files must gain the key).

## Maintenance notes

- This completes the whitelist/blocklist asymmetry: both directions now
  exist on text placeholders. The context-menu path remains for
  non-feed contexts (profile pages).
- Plan 023's whitelist diff fix interacts here: blocking an author does
  NOT restore posts (opposite of whitelist), so the `onChanged` diff for
  `BLOCKED_AUTHORS` has no restore logic — keep it that way.
- Reviewer should confirm the button's position in the placeholder
  matches the whitelist button's visual hierarchy (sibling, not
  replacement) and that `pruneSet` caps at 100 as documented.
