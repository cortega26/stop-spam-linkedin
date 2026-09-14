# Plan 064 — Match-tester explanations: design

Research spike. No production code changes. Prototype:
`plans/research/064/prototype.cjs` (`explainText`), fixtures in `cases.json`,
assertions in `prototype.test.cjs`, build decision in `verdict.json`.

## 1. Verdict table

The tester reports the *effective* decision first, then — only when nothing
currently wins and no pardon applies — a bounded "would match if enabled"
note. `wouldMatch` is an annotation on `unmatched`, never a separate cause:
a disabled match must never read as the reason a post would hide.

| kind | reason | effective outcome | when |
|---|---|---|---|
| `excluded` | `excluded-signature` | would NOT hide | pasted text's `SS_getExcludedSignature` is in the exclusion set — even when allow/custom/built-in rules also match. Never rendered as "no match". |
| `allowed` | `allow-phrase` | would NOT hide | an allow-phrase matcher covers the text (checked before patterns, mirroring `testerFindMatch`). Names the winning allow text. |
| `matched` | `custom-phrase` | WOULD hide | first hit in the `SS_buildPatterns` custom-first list is a custom rule. Names the phrase. |
| `matched` | `builtin-pattern` | WOULD hide | first hit is a built-in. Names the label + stable id (`EN-1`, …). |
| `unmatched` | `no-match` | would NOT hide | nothing active matches and nothing inactive would either. |
| `unmatched` | `would-match-disabled-language` | would NOT hide | nothing active matches; a built-in from a currently disabled detection language would match. Lists the pattern id(s). |
| `unmatched` | `would-match-disabled-pattern` | would NOT hide | nothing active matches; an individually disabled built-in id would match. Lists the id(s). |
| `unmatched` | `would-match-disabled-custom` | would NOT hide | nothing active matches; a disabled custom rule would match. Lists the phrase(s). |
| `unmatched` | `truncated-no-match` | would NOT hide (of the tested prefix) | input exceeded the cap (see §4); the tested 5000-char prefix matches nothing. |
| `error` | `empty-input` | no test performed | input is missing, non-string, or whitespace-only. Production `runTester` returns early here today; the design gives that silent no-op an announced message instead. |

Precedence (unchanged from `options/options.js:1763` and `content.js:589`):
exclusion → allow → first active match (custom-first) → inactive second pass.
`wouldMatch` is computed only when no active rule wins and no pardon applies,
so an active win suppresses disabled notes (`active-win-suppresses-disabled-note`
case). When a text matches both an individually-disabled id and a disabled
language, it is listed once as `disabled-pattern` (more specific first).

`explainText` also returns `effectiveHide` (true only for `matched`) so the
prototype test can prove parity with the current matcher: the explanation
adds specificity but never flips the effective decision.

## 2. Proposed EN/ES copy (draft — not shipped, no locale files touched)

New shipped keys belong in both `_locales/en/messages.json` and
`_locales/es/messages.json` at build time (`npm run smoke` enforces
key + `$N`-placeholder parity). FR/PT/DE UI locales stay deferred per
`docs/i18n-audit.md`; detection-language coverage is unaffected.

| proposed key | EN draft | ES draft |
|---|---|---|
| `testerExcluded` | `Would NOT be hidden — you marked this text as "Not spam".` | `No se ocultaría — marcaste este texto como "No es spam".` |
| `testerAllowed` (exists) | unchanged: `Would NOT be hidden — allowed by: "$1"` | unchanged |
| `testerMatchedCustom` | `Would be hidden — custom phrase: "$1"` | `Se ocultaría — frase personalizada: "$1"` |
| `testerMatchedBuiltin` | `Would be hidden — $1 ($2)` | `Se ocultaría — $1 ($2)` |
| `testerNoMatch` (exists) | unchanged: `Would NOT be hidden — nothing matched.` | unchanged |
| `testerWouldMatchDisabled` | `Would NOT be hidden — disabled rule would match: $1. Nothing currently hides this text.` | `No se ocultaría — una regla desactivada coincidiría: $1. Nada la oculta actualmente.` |
| `testerTruncated` | `Note: only the first 5000 characters were tested.` | `Nota: solo se analizaron los primeros 5000 caracteres.` |
| `testerEmpty` | `Paste some text to test it against your current rules.` | `Pega un texto para probarlo con tus reglas actuales.` |
| `testerError` | `Could not read your settings — no test was run. Try again.` | `No se pudo leer tu configuración — no se ejecutó la prueba. Inténtalo de nuevo.` |
| `testerScopeNote` (static hint under the tester) | `Tests pasted text against text rules only. Blocked authors, Promoted/Featured hiding, snooze, and page position are not part of this test.` | `Solo analiza el texto pegado con las reglas de texto. Autores bloqueados, ocultación de promocionados/destacados, pausa y posición en la página no forman parte de esta prueba.` |

No confidence score, no AI-authorship claim, no auto-rule creation, no
settings mutation from the tester. The scope note is stated once in the UI,
never per result.

## 3. Accessibility and focus behavior

- `#testResult` stays an `aria-live="polite"` region (as today); result text
  is set via `textContent` (existing safe-DOM pattern, no HTML injection).
- Focus stays in the textarea: running a test never moves focus, so screen
  readers announce the result through the live region without losing place.
- The empty-input case keeps focus in the textarea AND announces via the
  live region (today it silently returns — the only behavior change, and it
  is additive, not a focus theft).
- Truncation is announced as part of the result sentence (draft above), not
  as a separate assertive alert.
- The would-match note is appended to the unmatched sentence in the same
  live-region update, so it is announced exactly once, in order.

## 4. The 5000-character contract

- `TESTER_MAX_INPUT = 5000` (`options/options.js:1756`) is unchanged: the
  prototype trims, then slices to 5000 code units — the same
  `raw.slice(0, TESTER_MAX_INPUT)` the shipped tester applies — and sets
  `truncated: true` when the pasted input was longer.
- Matching always runs on the sliced prefix, so the verdict describes the
  tested prefix only; the `testerTruncated` note says so explicitly. When the
  prefix also trips a disabled rule, the would-match reason wins the `reason`
  code and `truncated: true` still drives the truncation note (orthogonal).
- Paste content stays ephemeral: the text lives in the textarea and the
  click-handler local, is never written to storage, and `explainText`
  freezes/clones nothing out (proven non-mutating by the prototype tests).
- Read failures (`chrome.storage.sync.get` error / missing keys) must render
  `testerError`, never a misleading `testerNoMatch`. Error-state rendering
  is an integration case for the build (see `verdict.json` scenarios), not a
  pure-matcher guarantee — the prototype's `error` kind covers only
  empty/non-string input.

## 5. Future file scope (bounded build)

- `options/options.js` only: generalize `testerFindMatch` into a private
  `explainTesterText` helper (same file, same precedence, same live-read
  storage path in `runTester`) and add render branches for the new kinds.
  Decision: helper stays **private in options** — `content.js` never needs
  explanations, so promoting it to `shared/pattern-data.js` would add
  globals, `tsconfig.json` types, ESLint load-surface entries, and
  manifest/popup `<script>` ordering concerns for zero live-matching
  benefit (full enumeration in `verdict.json`).
- `options/options.html`: one static scope-hint line under the tester
  (`testerScopeNote`); no structural changes to the live region.
- `_locales/en/messages.json` + `_locales/es/messages.json`: the new keys
  from §2 only, keeping placeholder parity.
- `tests/extension-interactions.js`: regressions modeled on the match-tester
  probe pairs near line 1800 — one probe per verdict kind plus a
  truncation probe and a would-match probe.
- Explicitly out of scope: `content.js` matching, `background.js` helpers,
  `shared/*`, storage keys/shapes, permissions, packaging list.
