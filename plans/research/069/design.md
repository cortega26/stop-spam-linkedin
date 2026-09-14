# Plan 069 — Hide-once: design

Research spike. No production code changes. Prototype:
`plans/research/069/prototype.cjs` (UMD `SS_ManualHide`, Node exports for
the test), fixtures in `cases.json`, assertions in `prototype.test.cjs`,
Chromium selection/keyboard/reveal evidence in `browser-probe.cjs` (+
`browser-probe-output.json`), build decision in `verdict.json`.

Line references below are to the branch-start checkout `a7f852a`
(drift re-verified by the reviewer: `background.js:13-16` three menus,
`content.js:817-819` blockPost core, `content.js:1102` restoreBlocked,
`content.js:1487` restorePost, `content.js:1016`-adjacent safe-DOM
placeholder pattern at `content.js:1033-1043`, 063 selection contract at
`content.js:1382-1460`).

## 1. The narrow action

Selected text → context-menu item “Hide this item once” → the resolved
post or comment hides behind the project's reversible `data-ss-ph`
placeholder with an adjacent Show button. One click, one element, one
session: no author block, no permanent phrase, no learned rule, no
persistence, no network request, no new permission.

Scope exclusions (kept out deliberately): cursor/arm mode, per-post
overlays or toolbar buttons, global keybindings, hiding by ID across
reloads, session history, animated dismissal, paid-style focus modes.

## 2. Target resolution (shared with 063, never a body-wide scan)

The content script resolves the **live selection's anchor node in the
clicked tab's document** — exactly the 063 contract (`content.js:1404`):

1. `window.getSelection()` → `liveText` + `anchorNode`. Empty selection →
   `{ok:false, reason:"no-selection"}`, visible toast, **no mutation**.
2. Anchor inside an editable control (`input/textarea/select/` active
   `contenteditable`, `content.js:1382`) → `{ok:false, reason:"editable"}`,
   no mutation.
3. Otherwise `SS_findPostContainer(anchor, CONFIG, POST_SELECTORS)` with
   the plan-059 comment preference: a selection inside
   `.comment` / `.comments-comment-item` resolves to the **comment
   element**, never the parent post (bait comment must not hide an
   innocent post — STOP condition if this fails).
4. No recognized container → fail visibly (`no-target` toast), **no
   mutation**. There is deliberately **no text fallback**: the
   background's `selectionText` string must never be used to search body
   text for a node to hide — hiding an arbitrary ancestor is worse than
   doing nothing.

A detached anchor (selection in a removed node, stale DOM) resolves to
null the same way: `doc.contains` guard, no mutation.

## 3. State table

Manual state is element-identity keyed (`Set`/`WeakSet` of live nodes),
ephemeral, and disjoint from detected-spam state. `N/A` means the
column is untouched by that row's transition.

| state | display | placeholder | spam counters / badge / suggestions / undo | storage writes | automatic rescan |
|---|---|---|---|---|---|
| visible | `""` | none | N/A | N/A | eligible (rules apply normally) |
| automatically hidden | `none` | `data-ss-ph` spam variant, counted, in undo list | incremented | counter keys only | skipped (already blocked; existing-placeholder guard) |
| manually hidden | `none` | `data-ss-ph` + manual marker, comment-aware label, Show only | **unchanged** (not counted, no badge, no suggestion, not in undo) | **none** | skipped (placeholder guard); has no rule to re-hide it anyway |
| restored (Show) | `""` | removed | N/A | N/A | skipped: `forceShow` + cooldown, same as spam restore |
| detached / recreated | original gone; replacement visible, no placeholder | removed with the node | N/A | none | treated as a new visible node (may reappear — deliberate, §6) |

## 4. Precedence (one-click exception, no rule change)

- An explicit manual hide wins for **that element only** even when its
  text/author is allowed, excluded (“Not spam”), whitelisted, or the
  element sits on `forceShow`/cooldown after a Show. The implementation
  clears the element's own `forceShow`/cooldown entry as part of the
  explicit action.
- Nothing else changes: allow/exclusion/block lists, rule order,
  preferences, and every other element's protections are untouched. No
  rule is learned from the click.
- An **automatic** rescan can never override a Show protection: any
  target on `forceShow`/cooldown stays visible under re-scan. Only a new
  explicit manual click re-hides it. (Proven by the prototype:
  `rescan-respects-show` + `shown-override-needs-explicit-action`.)
- Selecting an already automatically hidden target through stale DOM
  adds no second placeholder and changes no attribution (existing
  `nextElementSibling[data-ss-ph]` / `display:none` guards).

## 5. Proposed EN/ES copy (draft — not shipped, no locale files touched)

New shipped keys would belong in both `_locales/en/messages.json` and
`_locales/es/messages.json` (`npm run smoke` enforces key +
`$N`-placeholder parity). FR/PT/DE stay deferred per
`docs/i18n-audit.md`. Existing `show` key is reused as-is.

| proposed key | EN draft | ES draft |
|---|---|---|
| `hideOnceMenu` | `Hide this item once` | `Ocultar este elemento una vez` |
| `hiddenOncePost` | `You hid this post. It will reappear if the page reloads.` | `Ocultaste esta publicación. Reaparecerá si se recarga la página.` |
| `hiddenOnceComment` | `You hid this comment. It will reappear if the page reloads.` | `Ocultaste este comentario. Reaparecerá si se recarga la página.` |
| `hideOnceFailedNoTarget` | `Couldn't tell which post this belongs to — nothing was hidden.` | `No se pudo determinar a qué publicación pertenece — no se ocultó nada.` |
| `hideOnceFailedNoSelection` | `Select some text in the post first — nothing was hidden.` | `Selecciona primero un texto de la publicación — no se ocultó nada.` |

Placeholder construction must match the existing safe-DOM pattern
(`button.textContent = …`, listener, then `appendChild`), with the label
as a `span.textContent` — never `innerHTML`.

## 6. Routing, recovery, and ephemerality

- **Clicked tab:** like 063, the background handler uses the `tab`
  argument of `onClicked` (`tab.id` dispatch, LinkedIn host check) and
  never re-resolves the active tab. Reporting (`ss-report-missed`) and
  hiding are separate menu items in separate builds: reporting must
  never silently hide an item, and hiding must never open a report tab.
- **Show** (adjacent button): restores display, removes the manual
  placeholder, sets `forceShow`/cooldown — identical protection to a
  spam restore, so re-scan and re-render keep it shown.
- **Show all / disable / snooze:** restore manual hides along with
  everything else (production `restoreBlocked`, `content.js:1102`).
  Manual hides need no separate “show all manual” control for v1: they
  share the existing recovery surfaces.
- **Reload:** everything manual is gone — no storage keys, no content
  history, no IDs. A re-rendered/recreated node (SPA replacement) may
  reappear mid-session because state is identity-keyed, not ID-keyed.
  This narrow scope is preferred over a persistent manual blacklist
  (no new storage semantics, no sync-quota or backup-compat questions).
- **Undo list:** manual hides stay out of the popup's lastBlocked/undo
  list (they were never detected spam); the adjacent Show and Show all
  are the v1 recovery path.

## 7. What the prototype proves (and does not)

`prototype.cjs` is a research state adapter, not a copy of `blockPost`:
it shares the resolution helper, the guard shapes (cooldown /
`forceShow` / existing-placeholder / allow), and the placeholder idiom,
but carries its own manual reason marker and counter/storage
non-mutation assertions. `prototype.test.cjs` covers every `cases.json`
row. `browser-probe.cjs` shows selection-anchored hide, keyboard
activation of Show, and Show-all reveal on an isolated mock page in
Chromium — not production integration, not Firefox.

## 8. Future file scope (bounded build, after 063)

- `background.js`: one `ss-hide-once` selection menu (LinkedIn-scoped),
  `tab.id` dispatch with the 063 host/tab guards; no helper
  consolidation (plan-048 constraint stands).
- `content.js`: explicit `manual-hide` reason path sharing
  restoration/placeholder behavior (see `verdict.json` for the
  classification choice and every conditional it touches); message
  handler with the 063 sender guard.
- `_locales/en|es/messages.json`: §5 keys only, parity kept.
- `tests/extension-interactions.js`: regressions modeled on the
  match-tester probe pairs near line 1800 (hide post, hide comment,
  unknown-target no-op, no-selection no-op, editable rejection,
  Show/Show-all, snooze/disable, rescan-respects-show) + packaged
  Chromium/Firefox gates. No new permissions.
- Explicitly out of scope: matching, stats shapes, storage keys,
  packaging list, `shared/*` API changes.
