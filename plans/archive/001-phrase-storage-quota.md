# Plan 001: Stop custom-phrase storage from silently failing under the `chrome.storage.sync` quota

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js background.js options/options.js`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

`ss_phrases` (the user's custom phrase list) is stored as a single item under
one `chrome.storage.sync` key. Chrome and Firefox both enforce a documented
per-item quota, exposed at runtime as `chrome.storage.sync.QUOTA_BYTES_PER_ITEM`
(8192 bytes), measured as `key.length + JSON.stringify(value).length`. The
app's own limit, `MAX_CUSTOM_PHRASES = 200`, assumes headroom that doesn't
exist: a `JSON.stringify` byte count for realistic phrase objects (see
"Current state" below) shows the write starts failing between roughly 35
phrases (worst case: every phrase at the 120-char max) and 69 phrases (short,
starter-pack-style phrases) — nowhere near 200.

Worse, the three places that write `ss_phrases` handle this failure
differently, and two of them hide it from the user entirely:

- `options.js` `save()` — catches `chrome.runtime.lastError`, reverts the
  in-memory array, and shows a toast. The best of the three, but the toast
  text is a raw Chrome error string, not something a non-technical user can
  act on.
- `background.js` (right-click "add phrase" from selected text) — on
  failure, pops the just-pushed item off a **local array variable that is
  already out of scope** by the time the `chrome.storage.sync.set` callback
  runs. This has no effect and produces no toast, no `console.warn`, nothing.
  The user sees the context menu action complete with no feedback, and the
  phrase silently never saves.
- `content.js` `addSuggestion` message handler (popup "Add" button on a
  suggested trigger word) — calls `sendResponse({ ok: true })`
  *synchronously*, before the `chrome.storage.sync.set` callback has run.
  The popup sees `ok: true`, calls `refreshState()`, and shows the phrase as
  added — then the write can still fail afterward with no correction to the
  UI the user already saw.
- `options.js` `handleImport()` — shows an "Imported N phrases" success
  toast unconditionally right after calling `save()`, even though `save()`
  might revert due to quota. Because `ss_phrases` is one blob, a failed
  `save()` reverts **the entire array**, including phrases that were already
  saved before the import — so the user can lose previously-saved phrases
  while being told the import succeeded.

This plan fixes the root cause (nothing checks the actual byte quota before
writing) and the two silent/misleading failure paths, without attempting a
higher-risk storage redesign (see "Maintenance notes" for why sharding across
multiple sync keys was considered and deferred).

## Current state

- `content.js` — content script; owns `PHRASES_STORAGE_KEY = "ss_phrases"`,
  `CONFIG.MAX_CUSTOM_PHRASES = 200`, `CONFIG.MAX_PHRASE_LENGTH = 120`, and the
  `addSuggestion` message handler.
- `background.js` — service worker; owns the right-click "add phrase" flow
  via `chrome.contextMenus.onClicked`.
- `options/options.js` — options page; owns `handleAdd()`, `handleImport()`,
  `handleStarterPack()`, and the shared `save()` helper that all of them call.

Verified quota math (byte-for-byte, using Chrome's own measurement algorithm
— `key.length + JSON.stringify(value).length` — computed for arrays of
synthetic phrase objects shaped like the app's real records):

| Phrase text length | Max phrases before `QUOTA_BYTES_PER_ITEM` (8192) is exceeded |
|---|---|
| 8 chars (starter-pack style) | 69 |
| 20 chars (typical custom phrase) | 62 |
| 120 chars (`MAX_PHRASE_LENGTH` max) | 35 |

`content.js:8-23` — the relevant constants:
```js
const CONFIG = Object.freeze({
  ...
  MAX_CUSTOM_PHRASES: 200,
  MAX_PHRASE_LENGTH: 120,
  ...
});
```
`content.js:25` — `const PHRASES_STORAGE_KEY = "ss_phrases";`

`content.js:368-396` — the `addSuggestion` handler with the premature
`sendResponse`:
```js
      case "addSuggestion":
        if (
          !msg.word ||
          msg.word.length > CONFIG.MAX_PHRASE_LENGTH ||
          userPhrases.some(p => p.text.toLowerCase() === msg.word.toLowerCase())
        ) {
          sendResponse({ ok: false, reason: "duplicate" });
          break;
        }
        if (userPhrases.length >= CONFIG.MAX_CUSTOM_PHRASES) {
          sendResponse({ ok: false, reason: "limit" });
          break;
        }
        userPhrases.push({
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9),
          text: msg.word,
          enabled: true,
          created: Date.now(),
          mode: "exact",
        });
        chrome.storage.sync.set({ [PHRASES_STORAGE_KEY]: userPhrases }, () => {
          if (chrome.runtime.lastError) {
            userPhrases.pop();
            console.warn("Failed to save suggestion phrase:", chrome.runtime.lastError.message);
          }
        });
        pendingSuggestions = pendingSuggestions.filter(s => s.word !== msg.word);
        sendResponse({ ok: true });
        break;
```
Note: `sendResponse({ ok: true })` (last line) runs immediately, before the
`chrome.storage.sync.set` callback above it has a chance to run.

`background.js:8-11,44-65` — the context-menu handler with the dead-code pop:
```js
  const STORAGE_KEY = "ss_phrases";
  const MENU_ID = "ss-add-phrase";
  const MAX_CUSTOM_PHRASES = 200;
  const MAX_PHRASE_LENGTH = 120;
  ...
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      const phrases = result[STORAGE_KEY] || [];
      if (phrases.length >= MAX_CUSTOM_PHRASES) return;

      /* Duplicate check */
      const dup = phrases.find(
        (p) => typeof p.text === "string" && p.text.toLowerCase() === text.toLowerCase()
      );
      if (dup) return; /* silently skip — no UI to report in service worker */

      phrases.push({
        id: uid(),
        text,
        enabled: true,
        created: Date.now(),
        mode: "exact",
      });

      chrome.storage.sync.set({ [STORAGE_KEY]: phrases }, () => {
        if (chrome.runtime.lastError) phrases.pop();
      });
    });
```

`options/options.js:4-9,78-89,309-428` — the storage key/limit constants,
`save()`, and `handleImport()`:
```js
  const STORAGE_KEY = "ss_phrases";
  const LANG_STORAGE_KEY = "ss_enabled_langs";
  const WHITELIST_STORAGE_KEY = "ss_whitelist";
  const MAX_CUSTOM_PHRASES = 200;
  const MAX_PHRASE_LENGTH = 120;
  const MAX_IMPORT_BYTES = 128 * 1024;
  ...
  function save() {
    const prev = phrases.slice();
    chrome.storage.sync.set({ [STORAGE_KEY]: phrases }, () => {
      if (chrome.runtime.lastError) {
        phrases = prev;
        render();
        showToast("Storage write failed: " + chrome.runtime.lastError.message, true);
        return;
      }
      render();
    });
  }
```
(See `handleImport()` at `options/options.js:351-428` for the full import
flow — it calls `save()` once at the end after validating/pushing all
imported entries, then unconditionally shows a success toast.)

`MAX_IMPORT_BYTES = 128 * 1024` (128KB) is the **file** size limit for the
JSON being imported — much larger than the ~8KB storage quota an import of
that size could hit, which is exactly how a user is most likely to trigger
this bug in practice (importing a sizeable phrase list in one go, rather than
adding phrases one at a time by hand).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0, "Extension smoke test passed." (requires Playwright Chromium; see note below) |
| Packaged extension e2e | `npm run test:package` | exit 0, same message, against the zipped build |

If Playwright's Chromium isn't installed in your environment, run
`npx playwright install --with-deps chromium` first (this is a sandboxed dev
dependency install, not a change to the repo).

## Scope

**In scope** (the only files you should modify):
- `content.js`
- `background.js`
- `options/options.js`
- `_locales/en/messages.json`
- `_locales/es/messages.json`

**Out of scope** (do NOT touch, even though related):
- `ss_whitelist` (author whitelist) storage — verified to stay well under
  quota at its current `MAX_WHITELIST` cap (100 entries, short author-ID
  strings). Do not add a quota check there; it's unnecessary.
- `ss_excluded` (exclusion signatures) storage — **at the time this plan
  was written**, this was also comfortably under quota (bare hash strings,
  ~1.3KB for 100 entries). If `plans/007-exclusion-management-ui.md` has
  landed by the time you execute this plan, that is no longer true — plan
  007 changes `ss_excluded` from bare hash strings to `{sig, preview,
  created}` objects and takes over ownership of that key's quota safety
  (it lowers `MAX_EXCLUSIONS` and bounds the preview length specifically to
  stay under quota with the added preview text — see that plan's "Current
  state" for the byte math). Check whether `plans/007-exclusion-management-ui.md`'s
  status in `plans/README.md` is DONE before starting this step; if it is,
  do not duplicate or second-guess its quota handling for `ss_excluded` —
  leave that key alone, it's already covered.
- Any redesign that shards `ss_phrases` across multiple storage keys — see
  "Maintenance notes" for why this was considered and deferred. If you find
  yourself wanting to do this, STOP and report instead.
- `manifest.json`, popup files — not involved in any of the three write
  paths being fixed.

## Git workflow

- Branch: `advisor/001-phrase-storage-quota`
- Commit per step; message style matches repo history, e.g.
  `fix(storage): reject phrase writes that would exceed the sync quota`
  (see `git log --oneline -10` for more examples of this repo's
  `type(scope): summary` convention).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a shared byte-estimate helper to each of the three files

In each of `content.js`, `background.js`, and `options/options.js`, add a
small helper near the existing storage-key constants in that file:

```js
function estimatePhraseBytes(phrases, storageKey) {
  return storageKey.length + JSON.stringify(phrases).length;
}
```

(Yes, this duplicates the same six-line function three times. That matches
this repo's existing convention — `uid()` and `MAX_PHRASE_LENGTH` are
already duplicated across these same three files rather than shared through
a build step, since there is no bundler and content/background/options run
in separate script contexts. Do not attempt to deduplicate this as part of
this plan — that's a separate, larger refactor tracked in
`plans/004-shared-pattern-data.md` and `plans/005-unit-test-coverage.md`.)

**Verify**: `node --check content.js && node --check background.js && node --check options/options.js` → exit 0 for all three.

### Step 2: Gate the `background.js` context-menu add on the real quota, and log real failures

Replace the block at `background.js:44-65` (shown in "Current state") with a
version that checks the estimated size **before** attempting the write, using
`chrome.storage.sync.QUOTA_BYTES_PER_ITEM` (the real runtime constant, not a
hardcoded number) with a small safety margin:

```js
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      const phrases = result[STORAGE_KEY] || [];
      if (phrases.length >= MAX_CUSTOM_PHRASES) return;

      /* Duplicate check */
      const dup = phrases.find(
        (p) => typeof p.text === "string" && p.text.toLowerCase() === text.toLowerCase()
      );
      if (dup) return; /* silently skip — no UI to report in service worker */

      const candidate = phrases.concat([{
        id: uid(),
        text,
        enabled: true,
        created: Date.now(),
        mode: "exact",
      }]);

      const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
      if (estimatePhraseBytes(candidate, STORAGE_KEY) > limit) {
        console.warn("Skipped adding phrase via context menu: would exceed storage.sync quota.");
        return;
      }

      chrome.storage.sync.set({ [STORAGE_KEY]: candidate }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to save phrase via context menu:", chrome.runtime.lastError.message);
        }
      });
    });
```

This removes the dead `phrases.pop()` (it never worked — `phrases` here is
`result[STORAGE_KEY] || []`, a fresh local, not the array actually sent to
`chrome.storage.sync.set`, which was the real bug: the pop target and the
sent array were never actually the same reference in the original code
either once you trace it — the pre-check below makes this moot by not
attempting a doomed write in the first place) and replaces the silent no-op
with a real `console.warn` a developer/reporter can find in the service
worker's console, plus a pre-check that stops the write from being attempted
when it would fail anyway.

**Verify**: `node --check background.js` → exit 0.

### Step 3: Fix `content.js`'s `addSuggestion` handler — don't respond `ok: true` before the write completes

Replace the block at `content.js:368-396` (shown in "Current state") with:

```js
      case "addSuggestion":
        if (
          !msg.word ||
          msg.word.length > CONFIG.MAX_PHRASE_LENGTH ||
          userPhrases.some(p => p.text.toLowerCase() === msg.word.toLowerCase())
        ) {
          sendResponse({ ok: false, reason: "duplicate" });
          break;
        }
        if (userPhrases.length >= CONFIG.MAX_CUSTOM_PHRASES) {
          sendResponse({ ok: false, reason: "limit" });
          break;
        }
        {
          const candidate = userPhrases.concat([{
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9),
            text: msg.word,
            enabled: true,
            created: Date.now(),
            mode: "exact",
          }]);

          const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
          if (estimatePhraseBytes(candidate, PHRASES_STORAGE_KEY) > limit) {
            sendResponse({ ok: false, reason: "quota" });
            break;
          }

          userPhrases = candidate;
          chrome.storage.sync.set({ [PHRASES_STORAGE_KEY]: userPhrases }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save suggestion phrase:", chrome.runtime.lastError.message);
            }
          });
          pendingSuggestions = pendingSuggestions.filter(s => s.word !== msg.word);
          sendResponse({ ok: true });
        }
        break;
```

`userPhrases` and `pendingSuggestions` must be updated **synchronously,
before** `sendResponse` fires — exactly like the original code did, not
deferred into the `chrome.storage.sync.set` callback. This is deliberate:
`sendResponse({ ok: true })` triggers the popup to call `refreshState()`,
which immediately re-reads `userPhrases`/`pendingSuggestions` via a fresh
`getState` message (see `popup/popup.js:252-256`, `send({ action:
"addSuggestion", word: s.word }, (resp) => { if (resp && resp.ok)
refreshState(); })`). If those two variables were only updated inside the
async callback instead, the popup would round-trip and read the
*pre-update* values before the callback had a chance to run, showing the
suggestion chip still present and the phrase still missing from the list —
worse than the original bug. The pre-check earlier in this step is exactly
what makes updating synchronously and responding `ok: true` honest: by the
time this code runs, the write is already verified to fit under quota, so
it will succeed barring an unrelated failure (network/sync-account issue),
which is now logged via `console.warn` if it happens instead of being
silently dropped as before.

Do not restructure this handler to `return true` and move the state updates
into the `chrome.storage.sync.set` callback instead. That's a valid pattern
in general — an `onMessage` listener can keep the message channel open
per-invocation by returning `true` — but it's a larger behavioral change to
this handler than this fix requires, since every other `case` branch in
this same listener responds synchronously; reworking just this one branch
to be async adds complexity for no benefit here. The pre-check approach
above already fixes the bug with a smaller diff.

**Verify**: `node --check content.js` → exit 0.

### Step 4: Add a dedicated "storage full" message, then pre-check quota in `handleAdd()`, `handleStarterPack()`, and `handleImport()`

**Do not reuse `phraseLimitToast` for this.** That message is
`"Custom phrase limit reached ($1)."`, substituting `MAX_CUSTOM_PHRASES`
(200) — showing it when the real cause is the byte quota firing around
35–69 phrases would tell the user they've reached a 200-phrase limit they
are nowhere near, which is more misleading than the raw Chrome quota error
this plan is trying to replace. Add a new message key instead.

4a-pre. Add a new key to both `_locales/en/messages.json` and
`_locales/es/messages.json`, matching the existing style/casing of
neighboring toast messages in each file (e.g. `phraseLimitToast`,
`phraseTooLongToast` — open those in each file to match tone and
punctuation exactly):

`_locales/en/messages.json`:
```json
  "phraseStorageFullToast": {
    "message": "No more room for phrases — remove or shorten some to add more."
  },
```

`_locales/es/messages.json`:
```json
  "phraseStorageFullToast": {
    "message": "No hay más espacio para frases — elimina o acorta algunas para agregar más."
  },
```

Insert each new entry alphabetically or adjacent to `phraseLimitToast`
(match whatever ordering convention the surrounding keys already follow in
that file — check before inserting, don't assume). Both locale files must
end up with the same new key (the repo has 94/94 key parity today; keep it
that way — this plan adds exactly one key to each file, so it should end at
95/95).

**Verify**: `jq empty _locales/en/messages.json _locales/es/messages.json` → exit 0 (valid JSON), and
`python3 -c "import json; a=set(json.load(open('_locales/en/messages.json'))); b=set(json.load(open('_locales/es/messages.json'))); print('OK' if a==b else ('missing in es: '+str(a-b))+(' missing in en: '+str(b-a)))"` → prints `OK`.

4a. In `handleAdd()` (`options/options.js:146-180`), after the existing
duplicate/length checks and before `phrases.push(...)`, add:

```js
    const candidate = phrases.concat([{
      id: uid(),
      text,
      enabled: true,
      created: Date.now(),
      mode: "exact",
    }]);
    const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
    if (estimatePhraseBytes(candidate, STORAGE_KEY) > limit) {
      showToast(t("phraseStorageFullToast"), true);
      return;
    }

    phrases = candidate;
    input.value = "";
    save();
    showToast(t("addedPhraseToast", text));
```
(replacing the existing `phrases.push(...)` + `input.value = ""` + `save()` +
`showToast(...)` block at the end of `handleAdd()`).

4b. In `handleStarterPack()` (`options/options.js:271-305`), the loop
currently checks only `phrases.length >= MAX_CUSTOM_PHRASES` before pushing
each starter phrase. Change the loop condition to also stop once the
estimated size would exceed the byte limit:

```js
  function handleStarterPack() {
    const defaults = [
      "CLAUDE", "SKILL", "PROMPTS", "AI PROMPTS", "PDF",
      "LINK IN BIO", "DM ME", "TEMPLATE", "COMMENT", "10x",
      "SECRET", "FREE ACCESS", "GROWTH HACK", "CHATGPT", "BOT",
    ];
    const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
    let added = 0;
    let candidate = phrases.slice();
    for (const text of defaults) {
      if (candidate.length >= MAX_CUSTOM_PHRASES) break;
      const dup = candidate.some(p => p.text.toLowerCase() === text.toLowerCase());
      if (dup) continue;
      const next = candidate.concat([{
        id: uid(),
        text,
        enabled: true,
        created: Date.now(),
        mode: "exact",
      }]);
      if (estimatePhraseBytes(next, STORAGE_KEY) > limit) break;
      candidate = next;
      added++;
    }
    if (added > 0) {
      phrases = candidate;
      save();
      showToast(
        countMessage(
          "starterPackAddedOne",
          "starterPackAddedMany",
          added,
          added
        )
      );
    } else {
      showToast(t("starterPackExists"), true);
    }
  }
```

4c. In `handleImport()` (`options/options.js:351-428`), the per-item loop
already checks `phrases.length >= MAX_CUSTOM_PHRASES` before pushing each
imported item (skipping it into the `skipped` counter otherwise) — add the
same byte-quota check to that same condition, so imports that would exceed
the quota are trimmed (partially imported, correctly reported as skipped)
rather than accepted into `phrases` and then reverted wholesale by `save()`:

```js
      let valid = 0,
        skipped = 0;
      const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
      for (const item of imported) {
        if (phrases.length >= MAX_CUSTOM_PHRASES) {
          skipped++;
          continue;
        }
        if (
          !item.text ||
          typeof item.text !== "string" ||
          !item.text.trim() ||
          item.text.trim().length > MAX_PHRASE_LENGTH
        ) {
          skipped++;
          continue;
        }
        const dup = phrases.some(
          (p) => p.text.toLowerCase() === item.text.trim().toLowerCase()
        );
        if (dup) {
          skipped++;
          continue;
        }
        const candidateItem = {
          id: uid(),
          text: item.text.trim(),
          enabled: item.enabled !== false,
          created: item.created || Date.now(),
          mode: item.mode === "contains" ? "contains" : "exact",
        };
        if (estimatePhraseBytes(phrases.concat([candidateItem]), STORAGE_KEY) > limit) {
          skipped++;
          continue;
        }
        phrases.push(candidateItem);
        valid++;
      }
```

The rest of `handleImport()` (the `save()` call and the toast at the end)
stays the same — it already branches on `skipped > 0` to show
`importedPhrasesSkippedOne`/`importedPhrasesSkippedMany`, which now
correctly covers "skipped because of quota" alongside the existing "skipped
because invalid/duplicate" cases, with no new message keys required.

**Verify**: `node --check options/options.js` → exit 0.

## Test plan

This repo has no unit test runner yet (that's added in
`plans/005-unit-test-coverage.md`, which depends on
`plans/004-shared-pattern-data.md`). For this plan, verification is the
existing Playwright e2e suite plus a manual scenario, since the `save()`
callback logic changed:

1. Run `npm run smoke` — confirms all four touched files still parse.
2. Run `npm run test:extension` — confirms the existing spam-blocking
   scenario in `tests/extension-smoke.js` still passes unmodified (this
   plan doesn't touch detection logic, so this is a regression check, not a
   new-behavior check).
3. Manual check (load the extension unpacked in Chrome per
   `RELEASE_CHECKLIST.md`'s "Before Packaging" section):
   - Open the options page, click "Starter Pack" repeatedly (or import a
     JSON file with ~80 short phrases) until you see the "Reached the phrase
     limit" toast fire *before* the phrase count reaches 200 — confirms the
     byte pre-check is the one that fires, not the stale 200-item cap.
   - Confirm no phrase silently vanishes: after the toast fires, reload the
     options page and confirm the phrase count shown matches what was
     visible right before the toast (nothing reverted un-announced).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0
- [ ] `npm run test:package` exits 0
- [ ] `grep -n "phrases.pop()" background.js` returns no matches (dead code removed)
- [ ] `grep -n "estimatePhraseBytes" content.js background.js options/options.js` shows the helper defined and used in all three files
- [ ] `grep -n "QUOTA_BYTES_PER_ITEM" content.js background.js options/options.js` shows all three files reference the real runtime constant, not a hardcoded `8192`
- [ ] `grep -n "phraseStorageFullToast" _locales/en/messages.json _locales/es/messages.json options/options.js` shows the new key defined in both locale files and used in `handleAdd()`
- [ ] `grep -n "phraseLimitToast" options/options.js` no longer appears inside the new byte-quota checks added by this plan (it's fine if the key still exists in the locale files and is used elsewhere for the real item-count limit — just not for the quota case)
- [ ] Locale parity check passes: `python3 -c "import json; a=set(json.load(open('_locales/en/messages.json'))); b=set(json.load(open('_locales/es/messages.json'))); assert a==b, (a-b, b-a); print('OK')"`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase has drifted since this plan was written — re-derive the fix
  against the current code rather than force-applying stale line numbers).
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt, especially if the failure is unrelated to storage
  writes (e.g. a Playwright/Chromium environment issue) — report the exact
  failure rather than working around it.
- You find yourself wanting to change `ss_phrases` from a single storage key
  into multiple sharded keys — that's explicitly out of scope (see
  "Maintenance notes").
- Any of the three write paths still shows a success toast/response after a
  write that `chrome.runtime.lastError` reports as failed — that means a
  fix in Step 2/3/4 is incomplete; do not mark the step done until this is
  false.

## Maintenance notes

- **Why not shard `ss_phrases` across multiple keys instead of pre-checking
  the quota?** Sharding would let the app actually honor
  `MAX_CUSTOM_PHRASES = 200` even for long phrases, but it requires: (a) a
  one-time migration of existing single-key data for users upgrading, (b)
  rebalancing logic when phrases are added/removed/edited so shards stay
  under 8KB each, and (c) every one of the three write paths in this plan
  (plus `chrome.storage.onChanged` listeners in `content.js` and
  `options.js` that currently assume a single `ss_phrases` change event)
  needs to read/merge/write across shards atomically. That's a much larger,
  higher-risk change than this plan's fix, and the byte pre-check already
  makes the failure mode honest (reject before writing, tell the user why)
  even without it. If product direction later wants the full 200-phrase
  promise honored for long phrases too, sharding is the follow-up — but
  scope it as its own plan with its own migration test coverage.
- If `plans/004-shared-pattern-data.md` and/or
  `plans/005-unit-test-coverage.md` have landed by the time this plan runs,
  `estimatePhraseBytes` could be moved into their shared script file instead
  of being duplicated three times — that's a reasonable follow-up cleanup,
  not required for this plan to be considered done.
- `plans/015-shared-constants.md` extracts the very `MAX_*` constants and
  storage keys this plan edits into `shared/constants.js`. Recommended
  order: this plan first, then 015 extracts the final values. If 015 lands
  first, this plan's write paths must read the constants from
  `globalThis.SS_CONSTANTS` instead of redefining them locally — check
  `plans/README.md`'s status table for 015 before starting.
- A reviewer should scrutinize: that `phrases`/`userPhrases` in-memory state
  is only mutated *after* a write is confirmed to fit under quota (Step 4a
  confirms `phrases = candidate` before calling `save()`, which is correct
  because `save()` itself still has its own revert-on-failure path for
  non-quota failures — the pre-check and `save()`'s existing revert logic
  are complementary, not redundant).
