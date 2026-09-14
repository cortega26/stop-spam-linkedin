# Plan 066 — Portable export of selected blocking phrases: design + spike verdict data

Research spike (not shipped). Prototype: `prototype.cjs`
(`serializeSelected`, `importPack`, `toPackEntry`). Cases: `cases.json` (8).
Tests: `prototype.test.cjs` (9, green). Read against branch-start `a284f5d`;
the reviewer's drift check found ZERO drift on all four plan dependencies, and
the excerpts below were re-verified verbatim in this worktree before
prototyping.

## 1. Format: a phrase pack is a legacy bare array

A phrase pack is a bare JSON array whose entries carry exactly three keys:

```json
[
  { "text": "comment CLAUDE for the framework", "mode": "exact", "enabled": true },
  { "text": "DM me the word", "mode": "contains", "enabled": false }
]
```

- `text`: trimmed, non-empty, at most `MAX_PHRASE_LENGTH` (120). Over-long or
  blank entries are never emitted (prototype case
  `invalid-skipped-poison-dropped`).
- `mode`: `"contains"` or `"exact"` only. Any other stored value normalizes
  to `"exact"` — the same rule the importer applies
  (`item.mode === "contains" ? "contains" : "exact"`, options.js:797).
- `enabled`: boolean, defaulting to `true` (`item.enabled !== false`,
  options.js:795), so `enabled: false` survives the round-trip.
- No `id`, no `created`, no version wrapper, no settings of any kind. The
  serializer builds each entry fresh (`{ text, mode, enabled }`); it never
  spreads the source object, so future stored fields cannot leak into packs
  (proven by the poison test, §5).

This is deliberately the already-supported legacy import shape, so no format
version bump and no importer change are needed.

## 2. Why no importer change is needed (STOP-condition review)

STOP condition 1 asks whether the existing import preserves mode/enabled
semantics without a schema migration. Measured answer: yes.
`importPhraseList` (options.js:767-807, read at `a284f5d`) accepts bare-array
items with optional `enabled`/`mode`, defaults `enabled` to true and unknown
modes to `"exact"`, trims text, enforces `MAX_PHRASE_LENGTH`, and skips
case-insensitive duplicates. The legacy branch (`:828`) routes any non-empty
bare array through exactly that loop. The prototype's `importPack` mirrors
the loop (cap → validity → dupe → byte quota) and the round-trip tests pin
it: every pack entry imports `1:1` into a fresh profile with text, mode, and
disabled state intact, and re-import is a duplicate no-op — same as the real
importer. No migration, no new permissions, no network, no irreversible
removal: the other STOP conditions are satisfied by construction.

Compatibility with plan 065: 065's `planImport` legacy branch implements the
identical item contract (`text` trim, `enabled !== false`,
`mode === "contains" ? "contains" : "exact"`, case-insensitive dupe skip —
065/design.md §2, 065 legacy-add-mixed case). Packs produced here validate
under 065's planner byte-for-byte, and if 065's preview ships first, a pack
file must enter the same preview/apply path as any legacy array (importing a
pack IS importing a legacy array; no special-casing on either side).

## 3. Selection behavior

- **Explicit and ephemeral.** Selection lives in a module-level `Set` of
  stored phrase ids in the options page. It is never persisted to storage,
  never inferred from the search query, and never defaults to "all enabled".
  Default state is the empty set; the Export action is disabled while empty.
- **Keyed by id across sorting/search.** Rendering adds one selection
  checkbox per phrase row (beside the existing enable-toggle in `createRow`,
  options.js:1932); toggling a checkbox adds/removes the row's stable `id`.
  Re-sorting or filtering re-renders rows from stored order but the `Set`
  survives, so off-screen selections persist.
- **Count disclosure.** The export button label shows the live count
  (`Export selected (2)`); a caption states the total selected including
  non-visible rows, e.g. `2 selected · 1 not visible with the current filter`.
  The preview dialog lists every exported text, so nothing leaves unseen.
- **Deleted rows leave the selection.** Row deletion removes the id from the
  `Set`; stale ids with no matching row are dropped by the serializer
  (case `deleted-row-dropped`).
- **No bulk "select visible" in v1.** The plan allowed it only if worthwhile;
  this design rejects it: per-row checkboxes plus a full-content preview keep
  every exported phrase an explicit user choice, which is the entire point of
  the minimization boundary (§5). Revisit only with usability evidence that
  manual selection hurts at real list sizes.
- **Output order is stored-list order**, independent of click order
  (case `multiple-selection-keeps-list-order`).

## 4. Integration point (future build, not implemented here)

- **Action bar:** a fourth button beside Import/Export/Starter-pack in the
  `.action-bar` bulk-actions row (options.html:541-545),
  `Export selected (N)`, disabled at `N = 0`.
- **Row UI:** one `input[type=checkbox]` per phrase row in `createRow`,
  with `aria-label` following the existing toggle pattern
  (`SS_t("phraseToggleLabel", p.text)` style) and a new label key.
- **Preview + delivery:** clicking Export serializes via `serializeSelected`
  and opens a dialog showing the exact pretty-printed JSON (read-only
  textarea) with Copy and Download actions. Delivery reuses the existing
  clipboard-first/download-fallback path (options.js:743 pattern); no
  clipboard write happens before the user acts, and there is intentionally
  no automatic download on selection. The full-backup export
  (options.js:640 payload) is untouched.
- **Import side:** unchanged. A pack file is a legacy array; current import
  and (if built) the 065 preview accept it as-is.

## 5. Minimization and anonymity (measured, not claimed)

- **Allowlist proof:** `prototype.test.cjs` asserts the key set of every
  emitted entry is exactly `text/mode/enabled`, deep-freezes inputs to prove
  no mutation, and poisons source objects with author ids, edit history,
  pattern stats, blocked authors, whitelist, exclusions, allow-phrases, and
  suggestions — none of it appears in the output (the poison case also pins
  that an over-long entry and a blank entry are dropped, and an unknown mode
  normalizes to `exact`).
- **What the pack does NOT contain:** full-backup categories (whitelist,
  excluded, langs, blockedAuthors, disabledPatterns, hidePromoted,
  hideFeatured, allowPhrases), stored ids, timestamps, or stats.
- **Anonymity disclosure (required UI copy):** phrase text itself is
  user-chosen content and may identify the author (niche wording, names,
  project titles). The design never claims packs are anonymous; the preview
  dialog must say exactly what leaves the profile (draft copy below) and
  show it verbatim before any copy/download.

## 6. Proposed EN/ES labels (drafts for the build plan; NOT added to locale files by this spike)

- EN: `Export selected`, `Export selected ({n})`, `{n} selected`,
  `{n} selected · {m} not visible with the current filter`,
  `Nothing selected — tick phrases to export.`,
  `Review before sharing — phrase text may identify you.`,
  `Copy`, `Download`, following existing `Export JSON` / `Import JSON` tone.
- ES: `Exportar selección`, `Exportar selección ({n})`, `{n} seleccionadas`,
  `{n} seleccionadas · {m} no visibles con el filtro actual`,
  `Nada seleccionado — marca frases para exportar.`,
  `Revisa antes de compartir — el texto puede identificarte.`,
  `Copiar`, `Descargar`.

New shipped keys belong in both `_locales/en/messages.json` and
`_locales/es/messages.json` (`npm run smoke` enforces parity); FR/PT/DE stay
deferred per docs/i18n-audit.md.

## 7. Tab/keyboard flow

Row selection checkboxes are native inputs in DOM (stored-list) order, so
Tab walks them in export order. The Export button is a native button with a
real `disabled` state. The preview dialog moves focus to its heading on open,
is dismissible with `Esc` (writes nothing), and exposes Copy/Download/Close
as native buttons — the same trap-free pattern as the 065 preview sketch.
Screen-reader announcements for the count line need a manual
assistive-technology pass in the build (remaining unknown).

## 8. Future test strategy (build plan must include)

- Clipboard capture AND download-fallback capture of a multi-row pack;
  deep-compare of emitted keys (`text/mode/enabled` only) against the
  source rows, including a poisoned row carrying author/history metadata.
- Import of the captured pack into a fresh profile via the legacy path:
  assert exact vs contains matching behavior on a probe post and assert
  disabled rules remain disabled; full-backup tests stay intact.
- Selection persistence across a search filter (select → filter → export
  still contains the hidden row; count line discloses it) and deletion
  (deleted id drops out of the selection).
- If the 065 preview ships first: pack import must enter the same
  preview/apply path with an Apply step, asserting the identical
  added/duplicate counts.
- Model new regressions on `tests/extension-interactions.js` match-tester
  probe pairs near line 1800, plus the packaged Chromium/Firefox gates.

## 9. Build scope estimate: S

One button + one checkbox column + one preview dialog in options,
`serializeSelected` moved into options.js (or a shared pure helper with the
same allowlist shape), two locale keys × EN/ES, and the §8 regressions. No
importer, storage, permission, or manifest changes.

## 10. Evidence

- `node -e 'const a=require("./plans/research/066/cases.json"); if(a.length<7)process.exit(1)'` → exit 0 (8 cases).
- `node --test plans/research/066/prototype.test.cjs` → 9/9 pass.
- `npm run smoke` / `lint` / `typecheck` / `test:unit` → exit 0 (unit: 81/81 pass; browser suites exempt per plan — research-only).
- `git diff --name-only a284f5d -- . ':!plans'` → empty (only `plans/research/066/` added).
