# Plan 065 — Truthful settings-import preview: design + spike verdict data

Research spike (not shipped). Prototype: `prototype.cjs`.
Cases: `cases.json` (16). Tests: `prototype.test.cjs` (14, green).
Read against base `74f3ae8`; drift note confirms the plan's excerpts verbatim.

## 1. How the importer works today (measured)

Entry: `options/options.js:809 handleImport()`. File gate first
(`file.size > LIMITS.MAX_IMPORT_BYTES`, 128 KiB, `:812`), then
`FileReader` + `JSON.parse` (`:819-826`). Two branches:

- **Legacy** (`:828`): bare array. Empty array → `importFileEmpty` toast,
  no writes. Else `importPhraseList(imported)` + `save()` — one
  `sync.set` of `ss_phrases` — and a phrases-only toast.
- **Versioned** (`:856`): object with an array `phrases` field. Merges
  phrases, then — each guarded by its own `Array.isArray` check —
  whitelist, excluded, langs, blockedAuthors, disabledPatterns,
  allowPhrases, and the two booleans. Anything else → `invalidJsonFile`
  toast, no writes.

Write fan-out today: up to **8 separate `sync.set` calls**
(`ss_phrases` via `save()`, whitelist, excluded, langs via `saveLangs()`,
blockedAuthors, disabledPatterns, allowPhrases, hidePromoted,
hideFeatured), each with its own lastError rollback. A failure midway
leaves earlier categories persisted — **this is not a transaction**, and
the preview must never claim otherwise.

## 2. Per-field contract

`snapshot` = live in-memory lists as loaded from `storage.sync`.
`input` = parsed file. Absent key ⇒ untouched (proven by
`tests/extension-smoke.js` legacy-shape scenario and prototype case
`missing-fields-are-untouched`).

| Category | Recognized shape | Identity | Merge policy | Quota | Missing field | Conflict | Write point |
|---|---|---|---|---|---|---|---|
| `phrases` (block) | Array of `{text, enabled?, mode?, created?}` | trimmed text, case-insensitive (`:785-787`) | additive; dupe/mode/enabled differences on same text are **skipped, not updated** | `MAX_CUSTOM_PHRASES` 200; `MAX_PHRASE_LENGTH` 120; byte check `SS_estimatePhraseBytes` (UTF-8) vs 0.95 × quota | required for object branch, else `invalid-shape` | none checked today (see §4) | `save()` → `ss_phrases` |
| legacy `[]` | bare array, same item shape | same as phrases | same as phrases | same as phrases; plus non-empty gate | n/a | same | `save()` |
| `whitelist` | Array of strings | exact string (`includes`) | additive | `MAX_WHITELIST` 100; byte tail-eviction vs 0.9 × quota | untouched | none | `sync.set ss_whitelist` |
| `excluded` | Array of `{sig, preview?, created?}` objects, bare `"sig:…"` strings, or plain text (hashed on normalize) | `excludedIdentity`: raw string or `.sig` (`:632-638`) | additive; whole list normalized post-merge (first-wins, existing first); byte-pruned with shared pruner | `MAX_EXCLUDED_ITEMS` 512 **with double-count quirk** (see §3); byte prune preview-less-first, oldest `created` | untouched | none | `sync.set ss_excluded` (serialized object shape) |
| `langs` | Array of codes | code string | **additive only**: unknown codes dropped, known-but-present skipped, **nothing ever removed** (`:978-994`) | known ⊂ `{EN,ES,FR,PT,DE}` (`LANG_META`); empty-known ⇒ no-op | untouched | none | `saveLangs()` → `ss_enabled_langs` |
| `blockedAuthors` | Array of strings | exact string | additive (mirrors whitelist) | `MAX_BLOCKED_AUTHORS` 100; byte tail-eviction | untouched | none | `sync.set ss_blocked_authors` |
| `disabledPatterns` | Array of string ids | id string | additive union over **known built-in ids** (`BUILTIN` from `SS_PATTERN_DATA`, 10 ids) | unknown ids skipped; cap = pattern count | untouched | none | `sync.set ss_disabled_patterns` |
| `hidePromoted` / `hideFeatured` | boolean | n/a (scalar) | **last-import-wins overwrite** (`:1150-1190`) | none | untouched | none | `sync.set` each, only when changed |
| `allowPhrases` | Array of `{text, created?}` | trimmed text, case-insensitive (`:1108-1112`) | additive | `MAX_ALLOW_PHRASES` 100; `MAX_PHRASE_LENGTH` 120; byte tail-eviction | untouched (pre-056 files) | none checked today (see §4) | `sync.set ss_allow_phrases` |
| `version` / `exportedAt` | number / timestamp | — | **both ignored**: no version gate exists; a `version: 2` file with a `phrases` array half-merges under v1 rules | — | versionless object accepted (old-export compat) | — | — |

## 3. Measured quirks (patch replicated exactly; counts reported truly)

1. **Excluded item-cap double-count** (`:925`): the gate is
   `excluded.length + excludedAdded >= 512` while `excluded.length`
   already grows with each push, so one import adds at most **256**
   entries to an empty list. Prototype replicates; test
   `measured quirk: excluded item-cap double-counts` pins
   added 256 / quotaSkipped 44 for a 300-entry import.
2. **UTF-16 vs UTF-8 byte math**: phrases (`SS_estimatePhraseBytes`)
   and excluded (`SS_estimateEntriesBytes`) count UTF-8 bytes, but the
   whitelist / blocked-authors / allow loops compare
   `key.length + JSON.stringify(list).length` — UTF-16 units. A 200-char
   `é`-heavy whitelist fits the current check while exceeding the real
   8 KiB sync item quota. The preview uses UTF-8 everywhere
   (deliberate change, §5); prototype test `multibyte quota` pins it.
3. **Whitelist stores the raw value**: validation trims for the emptiness
   check but pushes the untrimmed entry (`:879`). Replicated; pinned by
   `measured quirk: whitelist push keeps the raw untrimmed value`.
4. **Empty-string excluded counts as added**: `""` passes the raw
   identity gate, is pushed and counted, then dropped by normalize.
   Planner classifies it invalid with an identical patch.
5. **`created` passes through**: `item.created || Date.now()` keeps any
   truthy non-number. Replicated; harmless internal metadata.
6. **Normalize is first-wins**: a plain-text import hashing to an
   existing sig, or two import shapes with one effective sig, collapse
   with the existing entry surviving. Planner dedupes on the effective
   post-normalize sig — same patch, truer duplicate counts.

## 4. Block ↔ allow collisions (current behavior + proposal)

Today nothing checks cross-list collisions. At match time
`content.js:589-598 findMatch` short-circuits: exclusions first, then
**allow-phrases win over every block rule** (plan 056 Decision 1), so an
imported block phrase equal to an allow entry is stored but permanently
shadowed — a silent no-op the summary never mentions.

Design proposal (implemented in the prototype, §5.4): the preview
**skips incoming entries that would create a NEW block↔allow text
collision, with an explicit reason**, and never removes an existing rule
on either side. Pre-existing collisions are reported as issues but left
untouched. Processing order is phrases-then-allow, so the earlier
category keeps the text; both directions are pinned by
`block-allow-conflict-skipped` (2 issues, 2 skips).

## 5. Baseline-vs-proposed differences (all explained, all tested)

| # | Current | Proposed (prototype) | Test |
|---|---|---|---|
| 1 | `version` ignored; v2 would half-merge | refuse to plan `version !== 1` (versionless still accepted) | `versionless…; v2 is refused`, cases `unsupported-version-rejected` |
| 2 | UTF-16 length gate on 3 categories | UTF-8 bytes on all categories | `multibyte quota`, case `multibyte-byte-quota` |
| 3 | duplicate/invalid lumped as "skipped" | distinct `duplicate` / `invalid` counts; identical patch | cases `legacy-add-mixed`, `additive-merge-keeps-existing` |
| 4 | block↔allow collisions silent | new collisions skipped with reason; existing only reported | case `block-allow-conflict-skipped` + issues test |
| 5 | up to 8 `sync.set` calls, partial writes possible | **one** `sync.set` carrying every touched key at Apply | `controller: preview and cancel write nothing; apply writes once` |
| 6 | no concurrent-edit detection | re-read before Apply; mismatch ⇒ `stale`, recompute, no write | `controller: changed snapshot invalidates…` |
| 7 | toast claims merge before callbacks run | success shown only after the write resolves; errors keep the pending preview recoverable | `controller: no success…on read or write errors` |

No other semantic changes. Merge identity/order, missing-field
treatment, caps, and the legacy array contract are byte-identical.

## 6. Planner API (`prototype.cjs`)

`planImport(snapshot, input, opts?) → { status, patch, summary, issues }`

- `snapshot`: `{ phrases, whitelist, excluded, langs, blockedAuthors,
  disabledPatterns, hidePromoted, hideFeatured, allowPhrases }`
  (missing arrays ⇒ `[]`; missing langs ⇒ defaults; booleans ⇒ false).
- `input`: parsed file (array or object). File-size gate and `JSON.parse`
  stay in the UI layer.
- `opts`: `{ quotaBytesPerItem = 8192, knownLangs, knownPatternIds,
  now, uid }` — production passes `BUILTIN` ids, `LANG_META` keys,
  `SS_uid`; tests inject determinism.
- `status`: `"ok"`, or `"rejected"` with `reason ∈ { empty-legacy,
  invalid-shape, unsupported-version }` and empty `patch`.
- `patch`: full proposed post-merge value **per touched category only**;
  ids for new phrase/allow entries via `uid` (production: `SS_uid`).
- `summary`: per list `{ added, duplicate, invalid, quotaSkipped,
  evicted }` (+ `evictedExisting`, `conflictSkipped` where applicable);
  `langs: { from, to, added, ignored }`;
  booleans `{ from, to, changed }`.
- `issues`: `{ code, detail }` for `block-allow-conflict` and
  `byte-eviction-existing`.

Controller (`createMemoryAdapter` + `previewImport` / `applyPlanned` /
`cancelPlanned`): preview reads the snapshot and plans with **zero
writes**; cancel writes nothing; Apply re-reads, compares only the
patched keys, returns `stale` + a fresh plan on mismatch, otherwise
attempts **one** `set(patchToStorage(patch))` and reports `applied` only
on success. This proves the controller shape, not browser sync
atomicity or its quotas.

## 7. Integration sketch (future build, not implemented here)

- **Layout**: reuse existing options-page styles. After file select,
  replace the immediate merge with a preview panel listing per-category
  rows (`+N added · M duplicates · K invalid · J skipped (quota) ·
  E evicted`) plus explicit transition lines for languages and the two
  hide toggles, and a collision section quoting the skipped texts with
  reasons. No per-category selectors in v1.
- **Actions**: Apply (disabled while planning and while the single write
  is in flight) and Cancel (writes nothing). Keyboard: focus moves to
  the preview heading on open, trap-free; `Esc` cancels; Apply/Cancel
  are native buttons. Only a success callback shows completion; errors
  keep the preview on screen with the failure reason.
- **Proposed EN/ES strings** (drafts for the build plan; NOT added to
  locale files by this spike):
  - EN: `Import preview`, `Nothing new to import`,
    `Apply import` / `Cancel`,
    `{added} added · {dup} duplicates · {skipped} skipped`,
    `Turns {name} {on/off} (was {on/off})`,
    `Adds {langs} to detection languages (never removes)`,
    `“{text}” skipped: it is already a never-hide phrase`,
    `Settings changed since this preview — review the updated preview`.
  - ES: `Vista previa de importación`, `No hay nada nuevo que importar`,
    `Aplicar importación` / `Cancelar`,
    `{added} añadidas · {dup} duplicadas · {skipped} omitidas`,
    `Activa/desactiva {name} (antes: {on/off})`,
    `Añade {langs} a los idiomas de detección (nunca elimina)`,
    `«{text}» omitida: ya es una frase de no ocultar`,
    `Los ajustes cambiaron desde esta vista previa; revisa la vista actualizada`.
- **Stale handling**: re-read source keys immediately before Apply; on
  mismatch, invalidate and recompute instead of overwriting another
  tab's changes. No generic undo snapshot/history, no extra storage
  keys.

## 8. Future test strategy (build plan must include)

- `tests/extension-smoke.js importFileOn` (today `:905`) only selects a
  file. Future successful-import tests must **explicitly click Apply**
  after selecting; cancellation tests must assert before/after storage
  equality. **Do not weaken the existing round-trip assertions** to
  accommodate the preview — scenarios 1–7 keep passing with an Apply
  step added.
- New regressions (model on `tests/extension-interactions.js`
  match-tester probe pairs near line 1800, plus packaged
  Chromium/Firefox gates): version-2 refusal with zero state change,
  block↔allow collision skip with reason, multibyte byte-budget
  eviction, stale-preview invalidation across two pages, and the
  single-`sync.set` Apply.
- Coordinate the legacy phrase-array path with plan 066
  (`plans/066-selective-phrase-packs.md`): 066 reuses the bare-array
  format as `{text, mode, enabled}` objects with no version bump, and
  requires the legacy import to accept them. This design keeps that
  contract unchanged — phrase packs round-trip through `planImport`'s
  legacy branch identically — so neither plan blocks the other.

## 9. Evidence

- `node -e '…cases.json…'`: 16 cases, exit 0.
- `node --test plans/research/065/prototype.test.cjs`: 14/14 pass.
- `npm run smoke` / `lint` / `typecheck` / `test:unit`: exit 0
  (unit: 81 pass; browser suites exempt per plan — research-only).
