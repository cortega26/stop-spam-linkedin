# Plan 007: Let users review and undo their "Not spam" exclusions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js options/options.js options/options.html _locales/en/messages.json _locales/es/messages.json`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition. **Also check
> `plans/001-phrase-storage-quota.md`'s status in `plans/README.md`** — if
> it's DONE, its Scope section already defers `ss_excluded` quota ownership
> to this plan; nothing further needed there, just don't duplicate its
> pre-check pattern unnecessarily.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (storage format migration — must not drop any existing
  user's exclusions during the upgrade)
- **Depends on**: none (soft interaction with `plans/001-phrase-storage-quota.md`
  — see drift check above; either order works)
- **Category**: direction (feature)
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

Clicking "Not spam" on a blocked post adds a signature to `ss_excluded` so
the same text is never blocked again — this is a core piece of the
false-positive recovery story the README advertises ("mark it as 'Not
spam' so the same text is never blocked again"). But there is currently
**no way to see or undo that list**. `options/options.js` has a full
management UI for the author whitelist (`renderWhitelist()`) — list, remove
with a confirm click, live-updates via `chrome.storage.onChanged` — and
nothing equivalent for exclusions. A user who accumulates false-positive
exclusions over months (up to `CONFIG.MAX_EXCLUSIONS` = 100 currently) has
no way to review what's on the list or reverse a mistaken click, unlike
every other piece of user-generated state in this extension (phrases,
whitelist both have full CRUD UI).

This plan is more than a UI addition, because of how exclusions are
currently stored: `getExcludedSignature()` (`content.js:1050-1053`) hashes
the post text and **only the hash is ever persisted** — the original text
is never written to storage. A list UI showing bare hash strings like
`sig:1a2b3c4` would be useless for deciding what to undo. This plan changes
the stored format to also keep a short preview snippet going forward
(existing entries, which only have the hash, degrade gracefully to "no
preview available" rather than being dropped), and adds the management UI
on top of that.

## Current state

`content.js:8-23` — the relevant `CONFIG` constants (to be changed in Step 1):
```js
  const CONFIG = Object.freeze({
    MIN_TEXT_LENGTH: 30,
    SIBLING_CONTENT_THRESHOLD: 100,
    SIBLING_COUNT_THRESHOLD: 2,
    FEED_SIBLING_FALLBACK: 6,
    DEPTH_LIMIT: 20,
    CONTENT_LENGTH_THRESHOLD: 300,
    OBSERVER_DEBOUNCE_MS: 500,
    INITIAL_SCAN_DELAY_MS: 1000,
    COOLDOWN_DURATION_MS: 15 * 60 * 1000,  /* 15 min after "Show" */
    SNOOZE_DURATION_MS: 30 * 60 * 1000,     /* 30 min */
    MAX_CUSTOM_PHRASES: 200,
    MAX_PHRASE_LENGTH: 120,
    MAX_EXCLUSIONS: 100,
    MAX_WHITELIST: 100,
  });
```

`content.js:117` — the module state (a `Set` today):
```js
  let excludedSignatures = new Set();
```

`content.js:1042-1053` — the current normalize/hash functions:
```js
  function normalizeExcludedEntries(entries) {
    return new Set(
      (entries || [])
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.startsWith("sig:") ? entry : getExcludedSignature(entry))
    );
  }

  function getExcludedSignature(text) {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    return "sig:" + hashString(normalized);
  }
```
Note the existing function already anticipates two legacy shapes: a bare
`"sig:..."` hash string, and (older still) plain excluded text that gets
hashed on the fly if it doesn't start with `"sig:"`. This plan adds a third
shape — an object — and must keep handling all three, since real installs
may have any of them in storage today.

`content.js:474-477` — where the exclusion set is consulted (unchanged by
this plan — `Map.has()` and `Set.has()` behave identically here):
```js
  function isSpam(text) {
    if (excludedSignatures.has(getExcludedSignature(text))) return false;
    return spamPatterns.some((re) => re.test(text));
  }
```

`content.js:750-759` — the "Not spam" button handler, where entries are
written (the actual matched text, `matchedText`, is available here and
currently discarded after hashing):
```js
    notSpamBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (matchedText) {
        excludedSignatures.add(getExcludedSignature(matchedText));
        pruneSet(excludedSignatures, CONFIG.MAX_EXCLUSIONS);
        chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: [...excludedSignatures] });
      }
      restorePost(post);
    });
```

`content.js:1064-1069` — the shared pruning helper, used for both
`excludedSignatures` and `whitelistedAuthors`:
```js
  function pruneSet(set, maxSize) {
    while (set.size > maxSize) {
      const first = set.values().next().value;
      set.delete(first);
    }
  }
```
**This function breaks if `excludedSignatures` becomes a `Map`.** For a
`Map`, `.values()` yields the *value* (the `{preview, created}` object),
and `set.delete(thatObject)` doesn't match any key — `size` never
decreases, so this becomes an infinite loop the first time a user exceeds
the exclusion cap, hanging the content script on that page. The fix is to
use `.keys()` instead of `.values()`: for a `Set`, `keys()` and `values()`
are the same iterator (Sets don't distinguish them), so this change is
safe for the existing `whitelistedAuthors` `Set` call site
(`content.js:407,774`) and correct for the new `Map` — do not write a
second, `Map`-specific prune function; fix the shared one.

`content.js:184,221,239,277-279` — where `ss_excluded` is read/watched
(initial load and `chrome.storage.onChanged`), both call
`normalizeExcludedEntries`, so fixing that one function covers both:
```js
  // initial load (content.js:221):
  excludedSignatures = normalizeExcludedEntries(syncResult[STORAGE_KEYS.EXCLUDED] || []);
  // ...
  // storage.onChanged listener (content.js:277-279):
  if (changes[STORAGE_KEYS.EXCLUDED]) {
    excludedSignatures = normalizeExcludedEntries(changes[STORAGE_KEYS.EXCLUDED].newValue || []);
  }
```

**Quota math for the new format** (same measurement method as
`plans/001-phrase-storage-quota.md`: `key.length + JSON.stringify(value).length`
against `chrome.storage.sync.QUOTA_BYTES_PER_ITEM` = 8192): an entry shaped
`{ "sig": "sig:XXXXXXX", "preview": "<60 chars>", "created": 1770500000000 }`
is roughly 138 bytes. At the *current* `MAX_EXCLUSIONS = 100`, 100 such
entries serialize to ~11.9KB — well over the 8192-byte per-item quota, and
worse than the bare-hash format this replaces (~1.3KB for 100 entries
today).

**Do not fix this by simply lowering `MAX_EXCLUSIONS` to a smaller
item-count cap (e.g. 60).** That looks like the obvious fix but is a real
regression: a user who already has, say, 100 stored exclusions (all
comfortably under quota today, since bare hashes are tiny) would have up to
40 of them silently deleted the very next time they click "Not spam" and the new
count-based prune runs — with no message, no undo, and their previously
dismissed posts quietly becoming "spam" again. A cap change is not allowed
to retroactively delete data that was already safely stored; only
*actual* byte pressure should ever trigger eviction.

**Fix: prune by byte size, not item count, and evict the least useful
entries first.** Replace the item-count `MAX_EXCLUSIONS` cap for this key
with a byte-budget check, run after every new addition:

```js
function pruneExcludedByBytes(map, storageKey, safeByteLimit) {
  while (map.size > 0 && estimateEntriesBytes(map, storageKey) > safeByteLimit) {
    /* Evict the least useful entry: prefer removing entries with no
       preview (already-unrecoverable legacy hashes, or migrated
       plain-text that's already been through one round of truncation)
       over ones with a live preview; break ties by oldest `created`
       (nulls sort first — treat as "oldest"). */
    let victimSig = null;
    let victimScore = Infinity;
    for (const [sig, meta] of map) {
      const score = (meta.preview ? 1_000_000_000_000 : 0) + (meta.created || 0);
      if (score < victimScore) {
        victimScore = score;
        victimSig = sig;
      }
    }
    if (victimSig === null) break;
    map.delete(victimSig);
  }
}
```

(`estimateEntriesBytes` is the same `key.length + JSON.stringify(serializeExcluded(map)).length`
measurement used elsewhere — factor it out as a small helper rather than
inlining `JSON.stringify` in two places.) Use a `safeByteLimit` of
`Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9)` (a slightly
larger 10% margin than plan 001's 5%, since eviction here runs reactively
per-write rather than as a hard pre-check).

This means: a user's **existing** exclusions, at whatever count they
already have, are never touched by this plan's update unless they are
*already* over the byte budget (which the current bare-hash format makes
essentially impossible — even 512 bare-hash entries, the absolute item-count
ceiling `chrome.storage.sync` enforces separately via `MAX_ITEMS`, would
serialize to only a few KB). Eviction only ever removes entries once real
growth (from *new*, preview-carrying additions) pushes the actual
serialized size over budget, and it removes the least informative entries
first (preview-less ones) rather than an arbitrary/oldest-by-insertion-order
one. There is no fixed "how many exclusions can I have" number to document
in the UI — capacity depends on preview length in practice, which is
expected and fine for a use-it-organically feature like this.

Remove `CONFIG.MAX_EXCLUSIONS` from `content.js` entirely as part of this
plan (see Step 1) — it's superseded by the byte-budget check, and leaving
a now-unused constant around would be confusing. `CONFIG.MAX_WHITELIST` is
untouched; the whitelist keeps its existing item-count cap via `pruneSet`,
unaffected by this change (different key, different entry shape, no byte
pressure concern per plan 001's already-verified analysis of that key).

`options/options.js:4-9` — current storage key constants (no `EXCLUDED`
key yet):
```js
  const STORAGE_KEY = "ss_phrases";
  const LANG_STORAGE_KEY = "ss_enabled_langs";
  const WHITELIST_STORAGE_KEY = "ss_whitelist";
  const MAX_CUSTOM_PHRASES = 200;
  const MAX_PHRASE_LENGTH = 120;
  const MAX_IMPORT_BYTES = 128 * 1024;
```

`options/options.js:486-531` — `renderWhitelist()`, the pattern to mirror
for the new exclusions section (confirm-click remove, live re-render):
```js
  function renderWhitelist() {
    if (whitelist.length === 0) {
      whitelistSection.style.display = "none";
      return;
    }
    whitelistSection.style.display = "block";
    whitelistList.innerHTML = "";
    for (const id of whitelist) {
      const row = document.createElement("div");
      row.className = "whitelist-row";

      const label = document.createElement("span");
      label.className = "wl-id";
      label.textContent = id;
      row.appendChild(label);

      const isConfirming = pendingWhitelistRemove === id;
      const rmBtn = document.createElement("button");
      rmBtn.className = isConfirming ? "confirming" : "";
      rmBtn.textContent = isConfirming ? t("clickToConfirm") : t("remove");
      rmBtn.setAttribute("aria-label", t("removeWhitelistedAuthorLabel", id));
      rmBtn.title = t("removeWhitelistedAuthorLabel", id);
      rmBtn.addEventListener("click", () => {
        if (pendingWhitelistRemove === id) {
          pendingWhitelistRemove = null;
          whitelist = whitelist.filter(w => w !== id);
          chrome.storage.sync.set({ [WHITELIST_STORAGE_KEY]: whitelist });
          renderWhitelist();
        } else {
          pendingWhitelistRemove = id;
          renderWhitelist();
          setTimeout(() => {
            if (pendingWhitelistRemove === id) {
              pendingWhitelistRemove = null;
              renderWhitelist();
            }
          }, 3000);
        }
      });
      row.appendChild(rmBtn);

      whitelistList.appendChild(row);
    }
  }
```

`options/options.js:52-76` — `load()` and the `chrome.storage.onChanged`
listener, where a fourth tracked key (`ss_excluded`) needs to join
`STORAGE_KEY`/`LANG_STORAGE_KEY`/`WHITELIST_STORAGE_KEY`.

`options/options.html:493-497` — the whitelist section markup, the
structural pattern to copy for a new "Excluded posts" section:
```html
  <!-- Whitelisted authors -->
  <div class="lang-section" id="whitelistSection" style="display:none">
    <div class="lang-section-title">__MSG_whitelistTitle__</div>
    <div class="whitelist-list" id="whitelistList"></div>
  </div>
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0 |
| Packaged extension e2e | `npm run test:package` | exit 0 |
| Locale parity check | `python3 -c "import json; a=set(json.load(open('_locales/en/messages.json'))); b=set(json.load(open('_locales/es/messages.json'))); assert a==b, (a-b,b-a); print('OK')"` | prints `OK` |

## Scope

**In scope**:
- `content.js` (storage format migration, new byte-budget pruning, "Not spam" handler)
- `options/options.js` (new exclusions section: state, render, remove, clear-all)
- `options/options.html` (new section markup)
- `_locales/en/messages.json`, `_locales/es/messages.json` (new keys)

**Note**: `pruneSet` (`content.js:1064-1069`, shared with the whitelist's
item-count cap) is **not modified by this plan**. This plan's exclusion
pruning uses a new, separate function (`pruneExcludedByBytes` — see
"Current state"'s quota-math section) rather than routing a `Map` through
the shared `pruneSet`, so `pruneSet` stays exactly as-is, still only ever
called with `whitelistedAuthors` (a `Set`, where it has always behaved
correctly). Do not touch `pruneSet` as part of this plan.

**Out of scope**:
- `popup/` — exclusions aren't surfaced there today and don't need to be for
  this plan.
- Any change to `getExcludedSignature`'s hashing algorithm — the hash
  format is unchanged; only what's stored *alongside* it changes.
- Exporting/importing exclusions as part of the phrase import/export flow —
  that's `plans/009-full-settings-backup.md`'s concern; if that plan hasn't
  landed, exclusions still aren't exportable after this plan, which is
  fine and consistent with today's behavior.
- Migrating exclusions eagerly for every user on extension update (e.g. via
  `chrome.runtime.onInstalled`) — this plan migrates lazily (on next
  write, or on first options-page visit per Step 4), which is sufficient
  and avoids adding update-time migration code to `background.js`.

## Git workflow

- Branch: `advisor/007-exclusion-management-ui`
- Commit message style: `feat(exclusions): add preview text and a management UI for "Not spam" exclusions`
- Do NOT push or open a PR unless the operator instructed it.

## Design decisions this plan makes (read before writing code)

1. **Storage shape**: `ss_excluded` becomes an array of
   `{ sig: string, preview: string | null, created: number | null }`.
   `preview`/`created` are `null` for entries migrated from a legacy
   bare-hash format (`"sig:..."` string) where no text was ever available.
   Entries migrated from the older plain-text format (pre-hash) get a real
   `preview` (truncated to `CONFIG.EXCLUSION_PREVIEW_LENGTH`), since the
   original text is right there before it gets discarded.
2. **In-memory representation in `content.js`**: `excludedSignatures`
   becomes a `Map<sig, { preview, created }>` instead of a `Set<sig>` —
   `isSpam()`'s `.has()` check is unaffected, since `Map.has(key)` checks
   keys exactly like `Set.has(value)` does.
3. **Migration timing**: `content.js` migrates in-memory on every load
   (via `normalizeExcludedEntries`, which now accepts all three legacy/new
   shapes) but only *writes* the migrated shape back to storage when a new
   exclusion is added (natural side effect of `chrome.storage.sync.set`
   sending the whole current array). `options/options.js` additionally
   writes back the migrated shape once, on options-page load, if it
   detects any legacy-format entries — see Step 4 — so a single visit to
   the settings page fully upgrades the stored format even for a user who
   never adds another exclusion.
4. **`CONFIG.MAX_EXCLUSIONS` (the item-count cap) is removed entirely** and
   replaced with `pruneExcludedByBytes` — a reactive, byte-budget-based
   eviction that only ever removes entries once real serialized size
   exceeds the safe quota margin, preferring to evict preview-less entries
   before ones with a preview, and older before newer within each group. A
   new `CONFIG.EXCLUSION_PREVIEW_LENGTH = 60` constant controls preview
   length for *new* entries — see "Current state"'s quota-math section for
   the full reasoning and why a fixed item-count cap was rejected as
   destructive to existing users' data.

## Implementation outline

This plan is grounded enough to implement directly (unlike
`plans/008-author-blocklist.md`/`plans/010-blocked-by-attribution.md`,
which are design-level plans deferring code shape to their eventual
executor) — but is still organized as an outline with the exact functions
to add/change, rather than pre-written full-file diffs, since several
pieces (exact locale copy, exact CSS class names for the new options.html
section) are better decided by directly matching the live file at
execution time than by a plan excerpt that could drift.

### Step 1: Update `CONFIG` and the exclusion data functions in `content.js`

- Remove `MAX_EXCLUSIONS: 100` from the `CONFIG` object (`content.js:8-23`)
  and add `EXCLUSION_PREVIEW_LENGTH: 60` in its place.
- Change `let excludedSignatures = new Set();` to
  `let excludedSignatures = new Map();` (`content.js:117`).
- Rewrite `normalizeExcludedEntries` to return a `Map`, handling all three
  entry shapes (bare `"sig:..."` string → `{preview: null, created: null}`;
  older plain-text string → hash it, `{preview: <truncated text>, created:
  null}`; new object shape → use as-is, validating `entry.sig` is a
  string starting with `"sig:"` before trusting it). Deduplicate by `sig`
  (first occurrence wins) since the input could theoretically contain
  the same signature in two shapes after a partial migration.
- Add `truncateForPreview(text, maxLen)`: trims the text, and if longer
  than `maxLen`, slices to `maxLen` characters and appends an ellipsis.
- Add `serializeExcluded(map)`: converts the `Map` back to the
  `{sig, preview, created}[]` array shape for writing to
  `chrome.storage.sync`.
- Add `estimateEntriesBytes(map, storageKey)` and `pruneExcludedByBytes(map,
  storageKey, safeByteLimit)` exactly as specified in "Current state"'s
  quota-math section — copy that logic precisely rather than re-deriving
  it, since the eviction-order behavior (preview-less and oldest first) is
  what prevents the data-loss regression this plan's "Current state"
  section documents in detail.
- Update the "Not spam" button handler (`content.js:750-759`) to compute
  and store a preview, then prune by bytes rather than by count:
  ```js
  excludedSignatures.set(sig, {
    preview: truncateForPreview(matchedText, CONFIG.EXCLUSION_PREVIEW_LENGTH),
    created: Date.now(),
  });
  pruneExcludedByBytes(
    excludedSignatures,
    STORAGE_KEYS.EXCLUDED,
    Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9)
  );
  chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: serializeExcluded(excludedSignatures) });
  ```
- Do **not** touch `pruneSet` (`content.js:1064-1069`) — it's unrelated to
  this plan's changes; see the "Note" under "Scope" above.

**Verify**: `node --check content.js` → exit 0.

### Step 2: Confirm every `ss_excluded` read/write site in `content.js` uses the new shape

Grep `content.js` for `excludedSignatures` and `STORAGE_KEYS.EXCLUDED` and
confirm every site either goes through `normalizeExcludedEntries` (reads)
or `serializeExcluded` (writes) — there should be exactly one write site
(the "Not spam" handler from Step 1) and two read sites (initial load,
`chrome.storage.onChanged`), both already identified in "Current state."

**Verify**: `node --check content.js` → exit 0. Manually re-read
`isSpam()` and confirm it's unchanged (it should need zero edits — this is
a check that the `Map` swap didn't require touching the one function that
matters most for detection correctness).

### Step 3: Add the exclusions section to `options/options.html`

Add a new section mirroring the whitelist section
(`options/options.html:493-497`), placed adjacent to it (either directly
above or below — match whatever reads better next to the existing
whitelist section once you see it rendered):

```html
  <!-- Excluded posts ("Not spam") -->
  <div class="lang-section" id="excludedSection" style="display:none">
    <div class="lang-section-title">__MSG_excludedTitle__</div>
    <div class="whitelist-list" id="excludedList"></div>
    <button class="action-bar-button" id="clearExcludedBtn" style="display:none">__MSG_excludedClearAll__</button>
  </div>
```

Reuse the existing `.whitelist-list`/`.whitelist-row` CSS classes already
defined in `options/options.html`'s `<style>` block for the row layout —
don't add new CSS for this unless the existing whitelist-row styling
genuinely doesn't fit (e.g. if preview text needs different truncation
styling than an author ID does — check visually before adding new rules).
If you add a `clearExcludedBtn`, match its styling to `.action-bar button`
(see `options/options.html`'s existing `.action-bar` rules) rather than
inventing new button styling.

**Verify**: file is well-formed HTML (`options/options.html` loads without
console errors when the options page is opened unpacked — check manually,
this repo has no HTML linter).

### Step 4: Add the exclusions state, load, and render logic to `options/options.js`

- Add `const EXCLUDED_STORAGE_KEY = "ss_excluded";` next to the other
  storage key constants (`options/options.js:4-9`).
- Add `let excluded = [];` and `let pendingExclusionRemove = null;` next to
  the existing `let whitelist = []; let pendingWhitelistRemove = null;`
  state (`options/options.js:15-17`).
- In `load()` (`options/options.js:52-59`), add `EXCLUDED_STORAGE_KEY` to
  the `chrome.storage.sync.get([...])` key list, and read it into
  `excluded`. **Immediately after loading**, check whether any entry is in
  a legacy shape (a bare string, not an object with a `sig` field) — if so,
  normalize the whole array to the `{sig, preview, created}` object shape
  (matching `content.js`'s `normalizeExcludedEntries`/`serializeExcluded`
  logic, reimplemented here since `options.js` and `content.js` don't
  share code — that's the acceptable, existing duplication pattern this
  repo already uses for other small helpers, see `uid()`) and write the
  migrated array back with `chrome.storage.sync.set({ [EXCLUDED_STORAGE_KEY]: excluded })`.
  This is what makes a single options-page visit upgrade the stored format
  even for a user who never triggers the "Not spam" write path again.
- In the `chrome.storage.onChanged` listener (`options/options.js:62-76`),
  add a branch for `changes[EXCLUDED_STORAGE_KEY]` that updates `excluded`
  and calls a new `renderExcluded()`.
- Write `renderExcluded()`, modeled directly on `renderWhitelist()`
  (excerpted in "Current state"): show/hide `excludedSection` based on
  `excluded.length`, render one row per entry showing `entry.preview` if
  present or `t("excludedNoPreview")` if `null`, with a confirm-click
  remove button using the same `pendingExclusionRemove`/3-second-timeout
  pattern as `pendingWhitelistRemove`. Show/hide `clearExcludedBtn` based
  on `excluded.length > 0`; wire it to clear the array (with its own
  confirm-click, or a simple immediate clear if that fits this repo's UX
  patterns better — check how `resetBtn` in `popup/popup.js` handles its
  "confirm by clicking twice" pattern and pick consistently).
- Call `renderExcluded()` from `load()`'s callback and from `render()`
  (`options/options.js:535-578`) alongside the existing `renderWhitelist()`
  call, so it stays in sync with the rest of the page's render cycle.

**Verify**: `node --check options/options.js` → exit 0.

### Step 5: Add locale keys

Add to both `_locales/en/messages.json` and `_locales/es/messages.json`,
matching the tone/style of neighboring whitelist-section keys
(`whitelistTitle`, `removeWhitelistedAuthorLabel`, `remove`,
`clickToConfirm` — the last two can be reused as-is, they're already
generic):
- `excludedTitle` — section heading, e.g. "Excluded posts" / "Publicaciones excluidas"
- `excludedNoPreview` — shown for entries with no recoverable text, e.g.
  "(no preview available)" / "(vista previa no disponible)"
- `excludedClearAll` — clear-all button label
- `removeExcludedLabel` — parameterized aria-label/title for the per-row
  remove button, mirroring `removeWhitelistedAuthorLabel`'s `$1`
  substitution pattern (substitute the preview text, or the literal
  "excluded post" phrase when preview is null)

**Verify**: the locale parity command from "Commands you will need" → prints `OK`.

## Test plan

Add a scenario to `tests/extension-smoke.js` (or a sibling file following
its structure) that:
1. Blocks a spam post (reuse `mockLinkedInFeed`).
2. Clicks its "Not spam" button (via `page.locator('[data-ss-ph] button',
   { hasText: /Not spam|No es spam/ })` or similar — check the actual
   button text/locale key `t("notSpam")` resolves to in the test's
   language before writing the locator).
3. Reads `ss_excluded` from sync storage (via the `worker.evaluate(...)`
   pattern already in this file) and asserts the stored entry is an object
   with a non-null `preview` field matching (a prefix of) the post's
   original text — this is the regression check for the storage-format
   change.
4. Opens the options page (`context.newPage()` navigating to the
   extension's `options/options.html` — check `chrome://extensions` or the
   extension ID resolution pattern already used elsewhere in this repo's
   scripts if one exists; otherwise construct the URL from
   `chrome-extension://<id>/options/options.html` using the ID Playwright
   reports for the loaded extension) and asserts the new exclusions
   section shows one row containing the preview text.
5. Clicks remove (twice, to go through the confirm-click pattern) and
   asserts the row disappears and `ss_excluded` is empty afterward.

Also manually verify the migration path: use the browser's extension
storage inspector (or a temporary `console.log` during development) to
seed `ss_excluded` with an old-format bare-hash array like
`["sig:abc1234"]` before loading the options page, then confirm the page
shows "(no preview available)" for that entry and that after the page
loads, storage now holds the migrated object-shaped array.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0 (including the new exclusion-management scenario)
- [ ] `npm run test:package` exits 0
- [ ] Locale parity check prints `OK`
- [ ] `grep -n "MAX_EXCLUSIONS" content.js` returns no matches (the item-count cap was fully removed, not just renamed)
- [ ] `grep -n "pruneExcludedByBytes\|estimateEntriesBytes" content.js` confirms the byte-budget eviction helpers exist
- [ ] `grep -n "EXCLUSION_PREVIEW_LENGTH" content.js` confirms the new constant
- [ ] `grep -n "let excludedSignatures = new Map" content.js` confirms the type change
- [ ] `grep -n "function pruneSet" content.js` shows `pruneSet` is byte-for-byte unchanged from before this plan (`git diff` against it should be empty)
- [ ] Regression check: seed `ss_excluded` with 100 legacy bare-hash entries, load the extension, confirm all 100 are still present after normalization (no data loss from the format change alone)
- [ ] `grep -n "renderExcluded\|excludedSection\|EXCLUDED_STORAGE_KEY" options/options.js` shows the new UI wired in
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (drift since this plan was written) — in particular, re-check whether
  `plans/001-phrase-storage-quota.md` has landed and touched
  `options/options.js`'s locale/toast helpers in a way that changes how
  you should wire new toasts for this feature.
- You find any code path that writes to `ss_excluded` other than the one
  identified in Step 1 (the "Not spam" handler) — a second write site
  would need its own migration to the new shape, and this plan's
  "Current state" section claims there's exactly one; if that's wrong,
  the byte-quota math and migration design both need re-deriving.
- The manual migration test (seeding a legacy-format array and confirming
  the options page upgrades it) doesn't result in the storage actually
  being rewritten in the new shape — that means Step 4's write-back logic
  has a bug; do not ship this feature without that working, since it's
  what prevents users from being stuck with permanently preview-less
  entries.
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt.

## Maintenance notes

- If `plans/009-full-settings-backup.md` lands, it should include
  `ss_excluded` in its export/import — by the time it runs, this plan's
  object shape is what it'll be exporting/importing; that plan should
  reference this one's `{sig, preview, created}` shape directly rather than
  re-deriving it.
- The `EXCLUSION_PREVIEW_LENGTH`/`pruneExcludedByBytes` byte-safety math in
  this plan assumes the entry shape stays exactly as designed here. If a
  future change adds more fields to each exclusion entry, redo the quota
  math before shipping — see this plan's "Current state" section for the
  method.
- A reviewer should scrutinize, specifically and explicitly: that no
  user's *existing* exclusions are ever removed as a side effect of this
  plan landing — only actual byte-quota pressure from *new* growth should
  ever trigger eviction, and even then it should remove the least useful
  entries first (per `pruneExcludedByBytes`'s eviction order), never a
  blanket "you had too many, some are now gone" the moment the update
  ships. This is the single most important property of this plan to
  verify before merging — silently dropping someone's
  false-positive fixes would re-surface posts they already dismissed,
  which is a worse regression than the missing UI this plan fixes.
