# Plan 009: Make Export/Import cover all user settings, not just phrases

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- options/options.js _locales/en/messages.json _locales/es/messages.json`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition. Check **both** of these before
> starting:
> - **`plans/007-exclusion-management-ui.md`'s status** — if DONE,
>   `ss_excluded` entries are objects (`{sig, preview, created}`); if not
>   yet landed, they're bare hash strings. This plan's import/export logic
>   must work with either shape (see Step 2's "identity" helper) — don't
>   assume one or the other.
> - **`plans/001-phrase-storage-quota.md`'s status** — if DONE, the
>   phrase-validation loop this plan's Step 2 factors out into a shared
>   function (used by both the legacy and new-format import branches)
>   already contains a byte-quota pre-check (`estimatePhraseBytes`, added
>   by that plan's Step 1/4). That check must survive being called from
>   both branches unchanged — don't strip it out while refactoring the
>   loop into a shared function, and don't duplicate it either.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (additive to an existing, working export/import flow; a
  backward-compatibility path for old exports is required, not optional)
- **Depends on**: none (soft interaction with `plans/007-exclusion-management-ui.md`
  and `plans/001-phrase-storage-quota.md` — see drift check above)
- **Category**: direction (feature)
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

The options page's "Export"/"Import" buttons only round-trip the custom
phrase list. Author whitelist entries, "Not spam" exclusions, and enabled
detection languages don't travel with an export, even though the button
sits right next to "Starter Pack" and reads as a general backup mechanism
to a user who hasn't inspected the JSON. Someone moving from Chrome to
Firefox, reinstalling, or setting up a second machine loses all of that
tuning silently — `chrome.storage.sync` only syncs within the same browser
account/install, so it doesn't cover any of these cross-browser or
fresh-install cases either. This plan extends the existing export file to
include all four pieces of user-tunable state, while keeping old
phrases-only exports importable (no format break for existing users' saved
backup files).

## Current state

`options/options.js:309-349` — `handleExport()`, exports only `phrases`:
```js
  function handleExport() {
    if (phrases.length === 0) {
      showToast(t("nothingToExport"), true);
      return;
    }
    const json = JSON.stringify(phrases, null, 2);

    function downloadFallback() {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "linkedin-spam-blocker-phrases.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast(
        countMessage(
          "exportedDownloadedOne",
          "exportedDownloadedMany",
          phrases.length,
          phrases.length
        )
      );
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(
        () => showToast(
          countMessage(
            "exportedClipboardOne",
            "exportedClipboardMany",
            phrases.length,
            phrases.length
          )
        ),
        downloadFallback
      );
    } else {
      downloadFallback();
    }
  }
```

`options/options.js:351-428` — `handleImport()`, reads a `.json` file,
expects a bare array, validates and merges each item into `phrases`:
```js
  function handleImport() {
    const file = importFile.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast(t("importFileTooLarge"), true);
      importFile.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      let imported;
      try {
        imported = JSON.parse(e.target.result);
      } catch (_) {
        showToast(t("invalidJsonFile"), true);
        return;
      }

      if (!Array.isArray(imported) || imported.length === 0) {
        showToast(t("importFileEmpty"), true);
        return;
      }

      /* Validate structure */
      let valid = 0,
        skipped = 0;
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
        phrases.push({
          id: uid(),
          text: item.text.trim(),
          enabled: item.enabled !== false,
          created: item.created || Date.now(),
          mode: item.mode === "contains" ? "contains" : "exact",
        });
        valid++;
      }

      save();
      importFile.value = "";
      showToast(
        skipped > 0
          ? countMessage(
              "importedPhrasesSkippedOne",
              "importedPhrasesSkippedMany",
              valid,
              [valid, skipped]
            )
          : countMessage(
              "importedPhrasesOne",
              "importedPhrasesMany",
              valid,
              valid
            )
      );
    };
    reader.readAsText(file);
  }
```
Note: `if (!Array.isArray(imported) || imported.length === 0)` is the exact
check this plan must extend without breaking — it's what currently rejects
anything that isn't a bare array.

`options/options.js:4-17` — state and storage-key constants this plan adds
to:
```js
  const STORAGE_KEY = "ss_phrases";
  const LANG_STORAGE_KEY = "ss_enabled_langs";
  const WHITELIST_STORAGE_KEY = "ss_whitelist";
  const MAX_CUSTOM_PHRASES = 200;
  const MAX_PHRASE_LENGTH = 120;
  const MAX_IMPORT_BYTES = 128 * 1024;

  /* ── State ──────────────────────────────────────────────────── */
  let phrases = [];
  let editId = null;
  let enabledLangs = ["EN", "ES", "FR", "PT", "DE"];
  let whitelist = [];
  let pendingDeleteId = null;
  let pendingWhitelistRemove = null;
```
(If `plans/007-exclusion-management-ui.md` has landed, this block will also
have `const EXCLUDED_STORAGE_KEY = "ss_excluded";` and `let excluded = [];`
— use those live values as the source of truth for the excluded list
instead of a fresh `chrome.storage.sync.get`, to stay consistent with
whatever render-cycle plan 007 established.)

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0 |
| Packaged extension e2e | `npm run test:package` | exit 0 |
| Locale parity check | `python3 -c "import json; a=set(json.load(open('_locales/en/messages.json'))); b=set(json.load(open('_locales/es/messages.json'))); assert a==b, (a-b,b-a); print('OK')"` | prints `OK` |

## Scope

**In scope**:
- `options/options.js` (`handleExport`, `handleImport`)
- `_locales/en/messages.json`, `_locales/es/messages.json` (new/adjusted keys)

**Out of scope**:
- `content.js`, `background.js` — this feature is entirely within the
  options page; nothing about how the content script reads storage changes.
- `MAX_IMPORT_BYTES` — 128KB stays generous enough for the richer export;
  don't raise it without a concrete case for needing to.
- Any change to the *storage* format of `ss_whitelist`/`ss_excluded`/
  `ss_enabled_langs` — this plan only changes what the *export file*
  contains, not how each key is stored day-to-day.

## Git workflow

- Branch: `advisor/009-full-settings-backup`
- Commit message style: `feat(options): export/import whitelist, exclusions, and language settings alongside phrases`
- Do NOT push or open a PR unless the operator instructed it.

## Design decisions this plan makes

1. **Export format becomes a versioned object**:
   ```json
   {
     "version": 1,
     "exportedAt": 1770500000000,
     "phrases": [ /* same shape as today's bare-array export */ ],
     "whitelist": [ "jane-doe", "company:acme-corp" ],
     "excluded": [ /* whatever shape ss_excluded currently holds */ ],
     "langs": ["EN", "ES", "FR", "PT", "DE"]
   }
   ```
   `version` exists so a future format change has something to branch on;
   this plan only ever writes `version: 1` and only ever needs to handle
   reading it back.
2. **Backward compatibility is mandatory, not optional**: `handleImport`
   must still accept a bare array (today's format) and treat it exactly as
   it does now (phrases-only import, unchanged validation/merge logic). Any
   export file a user already saved before this plan must keep working.
3. **Import is additive/merging, never replacing**: exactly like today's
   phrase import, whitelist/excluded/langs entries from the file are
   *merged* into whatever's already stored (deduplicated), never wiping
   out existing entries not present in the imported file. A user importing
   a partial backup (e.g. just to move a few whitelist entries to a second
   machine) shouldn't lose unrelated local state.
4. **`excluded` entries are handled generically**, without assuming
   `plans/007-exclusion-management-ui.md`'s object shape: derive an
   "identity" for each entry that works whether it's a bare string or an
   object — `typeof entry === "string" ? entry : entry.sig` — and dedupe by
   that identity. Validate minimally (must produce a non-empty string
   identity); don't attempt to validate `preview`/`created` shape details,
   since this plan shouldn't need to know exclusion-format internals to do
   its job.
5. **Each merged list respects its own existing size cap** (`MAX_WHITELIST`
   from `content.js`'s `CONFIG`, mirrored as a local constant in
   `options.js` — check whether one already exists there by the time you
   implement this, or add `const MAX_WHITELIST = 100;` matching
   `content.js`; and whatever `MAX_EXCLUSIONS` value is live in `content.js`
   at execution time — 100 if `plans/007` hasn't landed, 60 if it has, per
   that plan's quota fix). Entries beyond the cap are skipped and counted,
   same pattern as phrases already use.

## Implementation outline

### Step 1: Rewrite `handleExport()`

Change the exported payload from a bare `phrases` array to the versioned
object shape from "Design decisions" above. Read `whitelist` and
`enabledLangs` from the existing in-memory state (already loaded by
`load()`). Read `excluded` the same way if `plans/007` has landed
(`let excluded` will already exist in this file); otherwise, read
`ss_excluded` directly via a one-off `chrome.storage.sync.get(["ss_excluded"], ...)`
inside `handleExport` — check first whether the file already has an
`excluded` variable in scope before adding a redundant read.

Keep the empty-state check (`if (phrases.length === 0)`) but broaden its
message if it fires when phrases are empty but other data (whitelist,
excluded, non-default langs) exists — decide whether "nothing to export"
should still block the whole export in that case, or whether the check
should become "if every category is empty/default." Lean toward exporting
whenever there's *anything* non-default to export (an empty phrase list
with 3 whitelisted authors is still worth exporting) rather than keeping
the phrases-only gate — this is a real behavior change from today, so
call it out explicitly in your commit message.

Update the two toast messages (clipboard/download success) to reflect
what was actually exported — see Step 3 for the locale keys.

**Verify**: `node --check options/options.js` → exit 0.

### Step 2: Rewrite `handleImport()` to branch on format, keeping the legacy path intact

After parsing JSON (unchanged: `try { imported = JSON.parse(...) } catch { ... }`),
branch:

- **If `Array.isArray(imported)`**: this is the legacy phrases-only format.
  Run the existing validation/merge loop **completely unchanged** — do not
  touch this branch's logic, only reorganize the function so it's reachable
  as one of two paths.
- **Else if `imported && typeof imported === "object" && Array.isArray(imported.phrases)`**:
  this is the new versioned format.
  - Run the same phrase validation/merge loop as the legacy path, but
    sourcing from `imported.phrases` instead of `imported` directly (the
    per-item validation rules are identical — don't duplicate the loop body,
    factor it into a small local function taking the array as a parameter,
    called from both branches). **If `plans/001-phrase-storage-quota.md`
    has landed**, that loop already includes a byte-quota pre-check
    (`estimatePhraseBytes`) before each push — when factoring the loop out
    into a shared function, carry that check along exactly as it exists;
    do not drop it (an import that skips it could silently exceed the
    `ss_phrases` storage quota) and do not duplicate it outside the shared
    function (the whole point of factoring it out is one copy, reused by
    both branches).
  - If `Array.isArray(imported.whitelist)`: for each entry, skip if not a
    non-empty string, skip if already in `whitelist` (case-sensitive exact
    match — whitelist author IDs are already normalized to lowercase where
    relevant by `getAuthorId`/`parseAuthorId` in `content.js`, so don't
    re-lowercase here), skip if `whitelist.length >= MAX_WHITELIST`, else
    push and count. Write the merged `whitelist` back via
    `chrome.storage.sync.set({ [WHITELIST_STORAGE_KEY]: whitelist })`.
  - If `Array.isArray(imported.excluded)`: for each entry, compute its
    identity per "Design decisions" #4, skip if identity is falsy/empty,
    skip if identity already present in the current `excluded`/`ss_excluded`
    list, skip if at the size cap, else merge it in **preserving its
    original shape** (don't reshape a legacy bare-string entry into an
    object, or vice versa — that's `plans/007`'s migration logic's job, not
    this plan's; just append/merge whatever shape each entry already has).
    Write back to `chrome.storage.sync` under `ss_excluded` (or the
    `EXCLUDED_STORAGE_KEY` constant if `plans/007` defined one).
  - If `Array.isArray(imported.langs)`: filter to only values that are
    known language codes (`Object.keys(LANG_META)` — see
    `options/options.js:703-709` for `LANG_META`), skip if the filtered
    result would be empty (never end up with zero enabled languages — same
    invariant `handleLangToggle` already enforces at
    `options/options.js:436-447`), else merge as a **union** with the
    current `enabledLangs` (don't replace — a user importing a backup that
    only had 3 languages enabled shouldn't disable a 4th language they'd
    since turned on locally), write back via
    `chrome.storage.sync.set({ [LANG_STORAGE_KEY]: enabledLangs })`, and
    call `render()` (language toggle counts need to reflect the change).
  - Show one consolidated toast summarizing what was imported across all
    four categories (see Step 3).
- **Else**: neither shape matched — show `t("invalidJsonFile")` (reuse the
  existing key; this covers "valid JSON, but not a shape we understand").

**Verify**: `node --check options/options.js` → exit 0.

### Step 3: Add/adjust locale keys

The existing `importedPhrasesOne`/`importedPhrasesMany`/
`importedPhrasesSkippedOne`/`importedPhrasesSkippedMany` keys are
phrases-specific — decide whether to reuse them for the phrase-count part
of a consolidated multi-category toast (likely yes, to avoid unnecessary
key sprawl) plus new keys for the other three categories, or replace them
with one flexible consolidated-summary key that takes multiple
substitution parameters. Prefer the smaller-diff option (reuse what
exists, add narrowly for what's new) unless it produces an awkward
string — check both approaches against the actual toast width/space
options.js's toast UI has room for (`options/options.html`'s `#toast`
styling) before committing to a design.

At minimum, this plan needs new keys for: whitelist-entries-imported count,
exclusions-imported count, and languages-imported (or "no new languages"
when the import didn't add any). Match the existing `countMessage()`
one/many pattern (see `options/options.js:108-113`) for any new count-based
key.

**Verify**: locale parity command from "Commands you will need" → prints `OK`.

## Test plan

Add scenarios to `tests/extension-smoke.js` (or a sibling file) covering:

1. **Legacy import still works**: import a bare-array JSON file (today's
   format) and confirm phrases are added exactly as before this plan —
   this is the regression check for backward compatibility.
2. **New format export round-trips**: add a phrase, whitelist an author
   (via the options page or by seeding `ss_whitelist` in storage), export,
   clear all local state (fresh storage), import the exported file, and
   confirm phrases + whitelist are both restored.
3. **Merge, not replace**: with an existing phrase/whitelist entry already
   present locally, import a file containing a *different* phrase/whitelist
   entry, and confirm both the pre-existing and newly-imported entries
   exist afterward (neither was dropped).
4. **Cap respected**: seed `whitelist` at `MAX_WHITELIST`, attempt an
   import containing one more whitelist entry, confirm it's skipped
   (reported in the toast, not silently dropped or silently added past
   the cap).
5. **Unrecognized shape rejected cleanly**: import a JSON file that's
   neither a bare array nor `{ phrases: [...], ... }` (e.g. `{"foo": 1}`)
   and confirm `invalidJsonFile` shows, with no partial state change.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0 (including all 5 new scenarios)
- [ ] `npm run test:package` exits 0
- [ ] Locale parity check prints `OK`
- [ ] `grep -n "Array.isArray(imported)" options/options.js` shows the
      legacy-format branch is still present and unmodified in logic
- [ ] `grep -n "imported.whitelist\|imported.excluded\|imported.langs" options/options.js`
      shows all three new import categories wired in
- [ ] `grep -n '"version": 1\|version: 1' options/options.js` confirms the export format is versioned
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (drift since this plan was written) — check `plans/007`'s status first,
  per the drift-check note at the top of this plan.
- You find yourself wanting to change the *storage* format of
  `ss_whitelist`/`ss_excluded`/`ss_enabled_langs` to make export/import
  easier — that's out of scope; work with whatever shape each key already
  has.
- A legacy bare-array export file stops importing correctly after your
  changes — that's a hard regression; do not proceed past Step 2 until the
  Test plan's scenario 1 passes.
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt.

## Maintenance notes

- If a fifth piece of user-tunable state is added to this extension in the
  future (beyond phrases/whitelist/excluded/langs), extend the same
  versioned-object export shape rather than introducing a second export
  mechanism — bump to `version: 2` only if the shape of an *existing*
  field needs to change incompatibly; a new optional field can be added
  under `version: 1` without a bump, since `handleImport`'s `Array.isArray`
  checks per category already treat each one as optional.
- A reviewer should scrutinize: that every new import category is
  genuinely additive (merge, not replace) — an import silently replacing
  a user's local whitelist or language settings would be a data-loss bug
  users have no way to detect until they notice something behaving
  differently.
