# Plan 048: Consolidate duplicated pure helpers into `shared/pattern-data.js`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat HEAD..HEAD -- content.js background.js popup/popup.js options/options.js shared/pattern-data.js shared/constants.js types/globals.d.ts eslint.config.js AGENTS.md`
> (HEAD is current main; if these files changed since this plan was
> written, compare the line references below against live content before
> proceeding; on a mismatch, treat it as a STOP condition.)

## Status

- **Priority**: P3 (pure refactor — no user-visible behavior change)
- **Effort**: M
- **Risk**: MEDIUM (touches every runtime file; byte-estimate semantics
  change in one shared function)
- **Depends on**: none (soft: 029 — this plan aligns the shared byte
  math with the UTF-8 counting plan 029 introduced in the three
  `estimatePhraseBytes` copies)
- **Category**: code-quality / deduplication
- **Planned at**: commit `8069b81`, 2026-08-16

## Why this matters

A dead-code + duplication audit (2026-08-16) found nine small pure
helpers copy-pasted across the IIFE runtime files, byte-identical or
near-identical in each copy:

| Helper | Copies | Locations |
|---|---|---|
| `estimatePhraseBytes` | ×3 | content.js:23, background.js:16, options.js:6 |
| `t()` | ×4 | content.js:28, background.js:9, popup.js:6, options.js:216 |
| `uid()` | ×2 | background.js:127, options.js:1585 |
| `truncateForPreview` | ×2 | content.js:1298, options.js:1297 |
| `debounce` | ×2 | content.js:1169, options.js:1597 |
| `serializeExcluded` | ×2 | content.js:1335, options.js:1289 |
| `normalizeExcludedEntries` | ×2 | content.js:1304, options.js:1252 |
| `readRuntimeValue` | ×2 | content.js:128, popup.js:53 |
| `migrateRuntimeStorage` / `migrateRuntimeState` | ×2 | content.js:134, popup.js:59 |

Copy-paste duplication is a correctness hazard: fixes land in one copy
and not the others. It has already happened — the three
`estimatePhraseBytes` copies measure bytes with `TextEncoder` (UTF-8,
plan 029) while the shared `SS_estimateEntriesBytes` (used by the
exclusion pruner `SS_pruneExcludedByBytes`) still measures UTF-16
string length, so the phrase budget and the exclusion budget count
non-ASCII differently. `shared/pattern-data.js` is already loaded on
every surface that needs these helpers (content_scripts[] + `<script>`
tags), so it is the natural home.

## Current state (verified live at HEAD `8069b81`)

- `shared/pattern-data.js` is a UMD module: it sets `SS_*` globals on
  the page and `module.exports` for Node unit tests. It already exposes
  `SS_estimateEntriesBytes` and `SS_pruneExcludedByBytes`. `estimateEntriesBytes`
  (line ~212 in the module) uses `JSON.stringify(...).length` — UTF-16
  code units, NOT the UTF-8 byte count the runtime's phrase quota uses.
- `background.js` is a standalone MV3 service worker and loads no shared
  files (AGENTS.md: "background.js loads nothing extra"). It needs `t`,
  `uid`, `estimatePhraseBytes` for the context-menu flow. Because the
  shared files are classic scripts (not ES modules) and background.js
  cannot load them without converting the whole extension to ESM, **the
  three background.js copies stay**. Document this as the standing
  exception in AGENTS.md.
- `content.js`, `popup/popup.js`, `options/options.js` all load
  `shared/constants.js` + `shared/pattern-data.js` first (manifest
  `content_scripts[].js` and `<script>` tags) — the copies there can
  move to the shared module with zero new load surfaces.

## Design

Add these exports to `shared/pattern-data.js`, all as pure helpers that
need only the globals already available on every surface
(`chrome.i18n`, `chrome.storage`, `crypto`, `TextEncoder`):

- `SS_t(key, substitutions)` — `chrome.i18n.getMessage(key, substitutions) || key`
- `SS_uid()` — `crypto.randomUUID()` with try/catch fallback (existing `uid` bodies)
- `SS_estimatePhraseBytes(phrases, storageKey)` — TextEncoder byte math (content.js:23 body)
- `SS_truncateForPreview(text, maxLen)` — with `…` suffix (content.js:1298 body)
- `SS_debounce(fn, ms)` — content.js:1169 body
- `SS_serializeExcluded(map)` — Map-input variant (content.js:1335 body);
  switch options.js's array-input copy to call it via `new Map(entries)`
- `SS_normalizeExcludedEntries(entries)` — Map-returning variant
  (content.js:1304 body); switch options.js's array-returning copy to
  `Array.from(SS_normalizeExcludedEntries(entries))`
- `SS_readRuntimeValue(localResult, syncResult, key, fallback)` — content.js:128 body

**Byte-math alignment (step 5):** change `estimateEntriesBytes` to use
`new TextEncoder().encode(JSON.stringify(...)).length` so the exclusion
pruner counts UTF-8 bytes like everything else. Its unit test data is
ASCII (`tests/unit/pattern-data.test.js:282-284`, expected 62), so the
value is unchanged for ASCII; add a non-ASCII assertion to pin the new
behavior.

**Migration helpers (step 6, decision point):** `migrateRuntimeStorage`
(content.js) and `migrateRuntimeState` (popup.js) are identical apart
from key-array order. Recommended: consolidate into a shared
`SS_migrateRuntimeStorage` and keep the two thin per-file wrappers (or
delete the popup one and call the shared directly — executor's choice,
documented in the commit). This step is optional: the duplication is
already documented in AGENTS.md, so skipping it leaves a known,
documented state.

## Steps

### Step 1 — Add the shared helpers

In `shared/pattern-data.js`, add the eight helpers listed under Design
(plus the `estimateEntriesBytes` change from Step 5) and export them:
`root.SS_t = t;` … and `module.exports` entries mirroring the existing
export block (the module already exports `escapeRegex`, `isLinkedInHost`,
etc.). Match the file's existing JSDoc style on each new function.

Verify:
```
node --check shared/pattern-data.js
npm run typecheck        # globals.d.ts must keep in sync — see Step 4
```

### Step 2 — Switch content.js to the shared helpers

Delete the local `estimatePhraseBytes` (content.js:23), `t` (content.js:28),
`truncateForPreview` (content.js:1298), `serializeExcluded` (content.js:1335),
`normalizeExcludedEntries` (content.js:1304), `debounce` (content.js:1169),
`readRuntimeValue` (content.js:128) definitions. Replace each call site
with `SS_estimatePhraseBytes(…)`, `SS_t(…)`, `SS_truncateForPreview(…)`,
`SS_serializeExcluded(…)`, `SS_normalizeExcludedEntries(…)`,
`SS_debounce(…)`, `SS_readRuntimeValue(…)`. content.js's
`normalizeExcludedEntries` returns a Map — the shared version also
returns a Map, so call sites are unchanged.

Verify:
```
node --check content.js
npm run lint
```

### Step 3 — Switch popup.js and options.js to the shared helpers

- popup.js: delete local `t` (popup.js:6), `readRuntimeValue` (popup.js:53);
  call `SS_t(…)`, `SS_readRuntimeValue(…)`.
- options.js: delete local `estimatePhraseBytes` (options.js:6),
  `t` (options.js:216), `normalizeExcludedEntries` (options.js:1252),
  `serializeExcluded` (options.js:1289), `truncateForPreview`
  (options.js:1297), `uid` (options.js:1585), `debounce` (options.js:1597);
  call the `SS_*` versions. options.js's `normalizeExcludedEntries`
  call sites expect an ARRAY (not a Map) — wrap with
  `Array.from(SS_normalizeExcludedEntries(entries))` and keep the helper
  that does so (or inline at the two call sites). options.js's
  `serializeExcluded` takes an array; call `SS_serializeExcluded(new Map(entries))`
  or keep a 3-line local wrapper.

Verify:
```
node --check popup/popup.js
node --check options/options.js
npm run lint
npm run typecheck
```

### Step 4 — Sync the declarations

- `types/globals.d.ts`: add `declare function` entries for each new
  `SS_*` helper; update `SS_estimateEntriesBytes` if its shape changed.
- `eslint.config.js`: add the new `SS_*` names to the globals map
  (near the existing `SS_escapeRegex`/`SS_isLinkedInHost` entries).
- `AGENTS.md`: update the "Load surfaces" + shared-exports prose
  (line ~47 lists `SS_PATTERN_DATA` exports) to include the new helpers,
  and add a line documenting that **background.js intentionally keeps its
  own `t`/`uid`/`estimatePhraseBytes`** because it loads no shared files.

Verify:
```
npm run lint
npm run typecheck
```

### Step 5 — Align byte math in `estimateEntriesBytes`

Change the body to count UTF-8 bytes:
```js
const bytes = new TextEncoder().encode(JSON.stringify(...)).length;
```
where `...` is the serialized entries array (keep the same shape).
Add a unit test with a non-ASCII preview (e.g. `"café"`) asserting the
UTF-8 byte count (5 bytes for `café`, vs 4 UTF-16 units), so the
semantics are pinned.

Verify:
```
npm run test:unit          # existing 62-assertion must still pass (ASCII unchanged)
```

### Step 6 — (Optional) Consolidate the migration helpers

Consolidate `migrateRuntimeStorage`/`migrateRuntimeState` into a shared
`SS_migrateRuntimeStorage` (stateful: needs `chrome.storage` +
`STORAGE_KEYS`). If executed, update `globals.d.ts`, `eslint.config.js`,
and the AGENTS.md storage-migration note. If skipped, leave AGENTS.md's
existing "duplicated as migrateRuntimeStorage / migrateRuntimeState"
sentence as the standing record.

### Step 7 — Full verification

```
npm run smoke
npm run lint
npm run typecheck
npm run test:unit
npm run test:extension     # Playwright e2e — exercises content + popup + options
```

## STOP conditions

1. Any `SS_*` name collision with an existing export or global — stop
   and report (rename, don't shadow).
2. `npm run test:unit`'s existing `estimateEntriesBytes` assertion (62)
   fails after Step 5 — stop; the ASCII equivalence assumption is wrong.
3. `npm run test:extension` fails after the content.js step (Step 2) —
   stop; a call-site was missed or a Map/array shape mismatch slipped in.
4. `background.js` behavior changes — the three copies there are NOT to
   be touched; if a lint/type error forces touching them, stop and report.
5. Drift-check mismatch at the top of this file — stop and re-derive
   the affected steps against live code.

## Out of scope

- Converting the shared UMD files to ES modules so background.js could
  import them — architectural change, explicitly out of scope.
- Splitting the large functions flagged by Codacy complexity metrics
  (`reader.onload`, `createRow`, `findBySiblingHeuristic`, e2e `main()`s).