# UI Localization Audit — FR / PT / DE (plan 050)

- **Date**: 2026-09-13
- **Plan**: `plans/050-ui-localization.md` (written at `ffdffab`, refreshed at `4f80330`)
- **Branch**: `advisor/050-ui-localization`
- **Status**: AUDIT COMPLETE — locale files DEFERRED (sourcing decision (c))

## Sourcing decision

Sourcing: (c) defer — decided 2026-09-13

Option (c) of plan 050 Step 3 was chosen: create **no** `fr` / `pt` / `de`
locale files. The deliverable is this audit document (key inventory +
translator packet) plus the en↔es parity guard in `npm run smoke`.
No machine-translated string is committed anywhere; the plan's honesty rule
(archived plan 012) stands — UI strings must come from a human translator or
a validated translation process before they ship. This decision is recorded
so the next run does not re-ask.

## Summary of findings (live tree, `40693b5` + this audit)

- `_locales/en/messages.json` and `_locales/es/messages.json`: **171 keys
  each**, en↔es key-set parity confirmed (symmetric difference empty; the
  committed parity check is in `package.json` `npm run smoke`).
- **47 keys** carry `$N` placeholders; the per-key placeholder set
  (`$1`, `$2`, …) is identical between en and es (`$1` is never `$ 1`).
- All 171 keys are referenced from code or HTML. Reference accounting:
  - 141 literal call sites: `SS_t("key")` / `t("key")` / `__MSG_key__`
  - 28 keys referenced only through the dynamic `countMessage()` /
    `settingsPart()` one/many pairs in `options/options.js`
  - 2 keys referenced through the ternary at `options/options.js:737-740`
    (`exportedSummaryClipboard` / `exportedSummaryDownloaded`) — a plain
    regex pass undercounts these groups (the plan's known pitfall;
    resolved by reading the call sites, see below).
- Badge text is a bare block count (number only, `content.js:244`), clamped
  to 4 characters by the relay in `background.js:64`. Not localized.
- `contextMenuTitle` uses `%s` — a contextMenus-API substitution filled by
  the browser with the selected text, **not** an i18n `$N` placeholder
  (`background.js:34` creates the menu without i18n substitutions). Must be
  preserved verbatim in every locale (es already preserves it).
- No `description` fields exist in either locale file (nothing extra to
  translate).

## Verification: no manifest change is needed to ship a locale

Claim: adding `_locales/fr/`, `_locales/pt/` or `_locales/de/` requires no
`manifest.json` change; Chrome auto-loads
`_locales/<localeCode>/messages.json` for the browser's UI locale and falls
back to `default_locale: en` (`manifest.json:6`).

**Verified against the Chrome docs** (fetched 2026-09-13):
https://developer.chrome.com/docs/extensions/reference/api/i18n
(`browser.i18n` API reference — "Concepts and usage" → "Support multiple
languages" and "Search for messages"):

- "Each time you add a new locale, you add a messages file under a directory
  named `/_locales/_localeCode_`" — the manifest only must define
  `default_locale` when a `/_locales` directory exists (already present).
- "To support Spanish, just put a translated copy of `messages.json` under
  `/_locales/es`."
- Message lookup order: user's preferred locale → locale without region →
  default locale; sparse translations fall back per key.
- **Locale-code caveat**: the supported-locales list includes `fr`, `de`,
  `pt_BR` and `pt_PT` but **not bare `pt`**; "If you use an unsupported
  locale, Google Chrome ignores it." A future Portuguese locale must be
  `pt_BR` and/or `pt_PT`, never `pt`.

Claim **HOLDS**. The no-manifest-change claim does not fail; no STOP.

## Parity guard in `npm run smoke` (en↔es only)

`package.json` smoke script now appends a dependency-free, node-free,
jq-only en↔es parity check after `jq empty`:

```sh
jq -se '((.[0] | keys) == (.[1] | keys)) and \
  ([(.[0] | keys)[] as $k | \
    (([.[0][$k].message | scan("\\$[0-9]+")] | join(",")) == \
     ([.[1][$k].message | scan("\\$[0-9]+")] | join(",")))] | all)' \
  _locales/en/messages.json _locales/es/messages.json
```

- `jq -s` slurps both files; `keys` arrays are sorted, so key-set equality
  is a plain `==`.
- The per-key `$N` sequence sets are compared as comma-joined strings; any
  dropped or added placeholder in either locale fails the check.
- `jq -e` semantics: the chain prints `true` (exit 0) on parity, `false`
  (exit 1) on a mismatch, so `npm run smoke` fails.
- **Why not `diff <(jq …) <(jq …)`**: `npm run` executes scripts with
  `/bin/sh`, which is **dash** on this system; process substitution is a
  bashism and dies with "Syntax error: ( unexpected". The single `jq -s`
  expression is POSIX-portable and checks both conditions in one pass.
- The `%s` placeholder in `contextMenuTitle` is intentionally **outside**
  the `$N` scan (it is a contextMenus API placeholder, not an i18n
  substitution); the translator packet below covers it. When FR/PT/DE land,
  extend the same check to those files.
- jq was already a smoke dependency (`jq empty`); the guard adds no new
  tooling.

### Deliberate-break proof (recorded 2026-09-13)

| Run | Action | `npm run smoke` result |
|-----|--------|------------------------|
| 1 | Break 1: removed the `undo` key from a working copy of `_locales/es/messages.json`, swapped it in | **exit 1**, prints `false` |
| 2 | Break 2: changed es `addedPhraseToast` message `$1` → `$9` (dropped placeholder), swapped it in | **exit 1**, prints `false` |
| 3 | Restore: reverted `_locales/es/messages.json` to the backup | **exit 0**, prints `true`; `git status` clean apart from the intended changes |

Both break modes were also proven at the expression level against copies in
`/tmp` (missing key → `false`/exit 1; `$1`→`$9` → `false`/exit 1) before
wiring the check into the script.

## Key inventory (171 keys, en ↔ es)

Column `$N` lists the `$N` substitution sequences present in the message
(identical sets in both locales; verified by the parity guard).

| Key | EN | ES | $N |
|-----|----|----|----|
| add | Add | Añadir |  |
| addButton | Add Phrase | Añadir Frase |  |
| addedPhraseToast | Added: "$1" | Se añadió: "$1" | $1 |
| addPhraseButtonLabel | Add phrase to block list | Añadir frase a la lista de bloqueo |  |
| addPhraseInputLabel | Phrase to add | Frase para añadir |  |
| addPlaceholder | e.g. "CLAUDE", "send the PDF", "DM me the file" | ej. "CLAUDE", "envía el PDF", "DM el archivo" |  |
| allowAddedToast | Never hiding posts with: "$1" | No se ocultarán las publicaciones con: "$1" | $1 |
| allowAddLabel | Add never-hide phrase | Añadir frase que nunca se oculta |  |
| allowConflictToast | "$1" is already a custom phrase — remove it there first. | "$1" ya es una frase personalizada — elimínala allí primero. | $1 |
| allowEmpty | No never-hide phrases yet. | Aún no hay frases que nunca se ocultan. |  |
| allowHint | Posts containing this text are never hidden — even if a pattern or custom phrase matches. | Las publicaciones que contengan este texto nunca se ocultan, incluso si coincide una frase personalizada o un patrón. |  |
| allowInputLabel | Add a never-hide phrase | Añadir una frase que nunca se oculta |  |
| allowLimitToast | Never-hide phrase limit reached ($1). | Se alcanzó el límite de frases que nunca se ocultan ($1). | $1 |
| allowPlaceholder | e.g. engagement bait | p. ej. engagement bait |  |
| allowTitle | Never-hide Phrases | Frases que nunca se ocultan |  |
| appName | Spam Blocker | Bloqueador de Spam |  |
| blockAuthor | Block this author | Bloquear a este autor |  |
| blockAuthorMenu | Block this author | Bloquear a este autor |  |
| blockedAuthorTitle | Blocked Authors | Autores bloqueados |  |
| blockedBy | Blocked by LinkedIn Spam Blocker | Bloqueado por LinkedIn Spam Blocker |  |
| blockedByAuthor | Blocked — you've blocked this author | Bloqueado: has bloqueado a este autor |  |
| blockedFeatured | Blocked — Featured section | Bloqueado — sección Destacados |  |
| blockedPromoted | Blocked — promoted post | Bloqueado — publicación promocionada |  |
| blockedToast | LinkedIn Spam Blocker blocked $1 post(s) on this page. | LinkedIn Spam Blocker bloqueó $1 post(s) en esta página. | $1 |
| builtinLabel | built-in | incorporado |  |
| builtinPatternToggleHint | Turn this built-in pattern on or off without disabling its language | Activa o desactiva este patrón incorporado sin desactivar su idioma |  |
| builtinPatternToggleLabel | Built-in pattern: $1 | Patrón incorporado: $1 | $1 |
| byPatternAuthor | Blocked authors | Autores bloqueados |  |
| byPatternCustom | Custom phrases | Frases personalizadas |  |
| byPatternLabel | By pattern | Por patrón |  |
| cancel | Cancel | Cancelar |  |
| cancelSnooze | Cancel Snooze | Cancelar |  |
| clickToConfirm | Click again to confirm | Clic para confirmar |  |
| contains | Contains | Contiene |  |
| containsTooltip | Contains mode: matches any post containing this text (click to switch) | Modo contiene: coincide con cualquier post que contenga este texto (clic para cambiar) |  |
| contextMenuTitle | Add "%s" to LinkedIn Spam Blocker | Añadir "%s" al bloqueador de LinkedIn |  |
| customPhraseStatusMany | $1 of $2 custom phrases active | $1 de $2 frases personalizadas activas | $1,$2 |
| customPhraseStatusOne | $1 of $2 custom phrase active | $1 de $2 frase personalizada activa | $1,$2 |
| delete | Delete | Eliminar |  |
| deletedPhraseToast | Deleted: "$1" | Se eliminó: "$1" | $1 |
| deletePhraseLabel | Delete phrase $1 | Eliminar frase $1 | $1 |
| detectionLangs | Detection Languages | Idiomas de detección |  |
| disabled | Disabled | Desactivado |  |
| duplicatePhraseToast | Already exists: "$1" | Ya existe: "$1" | $1 |
| edit | Edit | Editar |  |
| editPhraseLabel | Edit phrase $1 | Editar frase $1 | $1 |
| enabled | Enabled | Activado |  |
| exact | Exact | Exacto |  |
| exactTooltip | Exact mode: matches whole words only (click to switch) | Modo exacto: coincide solo con palabras completas (clic para cambiar) |  |
| excludedClearAll | Clear all | Borrar todo |  |
| excludedCountMany | $1 excluded posts | $1 publicaciones excluidas | $1 |
| excludedCountOne | 1 excluded post | 1 publicación excluida |  |
| excludedNearCap | Near the storage limit — oldest entries may be removed automatically. | Cerca del límite de almacenamiento: las entradas más antiguas pueden eliminarse automáticamente. |  |
| excludedNoPreview | (no preview available) | (vista previa no disponible) |  |
| excludedTitle | Excluded Posts | Publicaciones excluidas |  |
| exportedClipboardMany | Exported $1 phrases to clipboard. | Se exportaron $1 frases al portapapeles. | $1 |
| exportedClipboardOne | Exported 1 phrase to clipboard. | Se exportó 1 frase al portapapeles. |  |
| exportedDownloadedMany | Exported $1 phrases (file downloaded). | Se exportaron $1 frases (archivo descargado). | $1 |
| exportedDownloadedOne | Exported 1 phrase (file downloaded). | Se exportó 1 frase (archivo descargado). |  |
| exportedSummaryClipboard | Exported $1 to clipboard. | Se exportaron al portapapeles: $1. | $1 |
| exportedSummaryDownloaded | Exported $1 (file downloaded). | Datos exportados (archivo descargado): $1. | $1 |
| exportJson | Export JSON | Exportar JSON |  |
| exportJsonLabel | Export custom phrases as JSON | Exportar frases personalizadas como JSON |  |
| footerSites | Runs on supported LinkedIn feed, profile, company, group, search, jobs, notification, network, newsletter, and article pages | Funciona en páginas compatibles de feed, perfiles, empresas, grupos, búsqueda, empleos, notificaciones, red, newsletters y artículos de LinkedIn |  |
| hideFeaturedLabel | Hide the Featured section on profiles | Ocultar la sección Destacados en perfiles |  |
| hideLabelsTitle | Feed Content | Contenido del feed |  |
| hidePromotedLabel | Hide promoted posts | Ocultar publicaciones promocionadas |  |
| importedNothing | No new entries imported. | No se importaron entradas nuevas. |  |
| importedNothingSkipped | No new entries imported ($1 skipped). | No se importaron entradas nuevas (se omitieron $1). | $1 |
| importedPhrasesMany | Imported $1 phrases. | Se importaron $1 frases. | $1 |
| importedPhrasesOne | Imported 1 phrase. | Se importó 1 frase. |  |
| importedPhrasesSkippedMany | Imported $1 phrases ($2 skipped). | Se importaron $1 frases y se omitieron $2. | $1,$2 |
| importedPhrasesSkippedOne | Imported 1 phrase ($2 skipped). | Se importó 1 frase y se omitieron $2. | $2 |
| importedSummary | Imported $1. | Se importaron: $1. | $1 |
| importedSummarySkipped | Imported $1 ($2 skipped). | Se importaron: $1 (se omitieron $2). | $1,$2 |
| importFileEmpty | File contains no phrases. | El archivo no contiene frases. |  |
| importFileTooLarge | Import file is too large. | El archivo de importación es demasiado grande. |  |
| importHint | JSON format: [{ "text": "phrase", "enabled": true }] | Formato JSON: [{ "text": "frase", "enabled": true }] |  |
| importJson | Import JSON | Importar JSON |  |
| importJsonLabel | Import phrases from a JSON file | Importar frases desde un archivo JSON |  |
| invalidJsonFile | Invalid JSON file. | Archivo JSON no válido. |  |
| justNow | just now | ahora |  |
| languageToggleLabel | $1 detection language, currently $2 | Idioma de detección $1, actualmente $2 | $1,$2 |
| lastBlockedLabel | Last blocked | Últimos bloqueados |  |
| mAgo | m ago | m atrás |  |
| managePhrases | Manage matching phrases | Administrar frases |  |
| matchedLabel | Matched: | Coincide con: |  |
| modeToggleLabel | Change matching mode for $1, currently $2 | Cambiar modo de coincidencia para $1, actualmente $2 | $1,$2 |
| neverBlock | Never block this author | No bloquear a este autor |  |
| noConnection | Open a LinkedIn feed to start blocking. | Abre el feed de LinkedIn para empezar a bloquear. |  |
| noCustomPhrases | No custom phrases yet. | Aún no hay frases personalizadas. |  |
| noCustomPhrasesShort | No custom phrases | Sin frases personalizadas |  |
| noLiveTabNotice | No active LinkedIn tab is connected. Showing saved settings and counts. | No hay una pestaña activa de LinkedIn conectada. Se muestran ajustes y conteos guardados. |  |
| noPhrasesMatch | No phrases match "$1" | Ninguna frase coincide con "$1" | $1 |
| nothingToExport | Nothing to export - no custom phrases or settings to back up. | No hay nada para exportar: no hay frases ni ajustes para respaldar. |  |
| notSpam | Not spam | No es spam |  |
| notSpamTooltip | Report as false positive | Reportar como falso positivo |  |
| openLinkedIn | Open LinkedIn Feed | Abrir Feed de LinkedIn |  |
| pageSubtitle | Manage the phrases that trigger post blocking on LinkedIn. | Administra las frases que activan el bloqueo de posts en LinkedIn. |  |
| patternCountMany | $1 patterns | $1 patrones | $1 |
| patternCountOne | 1 pattern | 1 patrón |  |
| patternHitCountTitle | Lifetime blocks matched by this pattern: $1 | Bloqueos de por vida coincidentes con este patrón: $1 | $1 |
| patternTotalsLine | Custom phrases: $1 · Blocked authors: $2 | Frases personalizadas: $1 · Autores bloqueados: $2 | $1,$2 |
| phraseLimitToast | Custom phrase limit reached ($1). | Se alcanzó el límite de frases personalizadas ($1). | $1 |
| phraseStorageFullToast | No more room for phrases — remove or shorten some to add more. | No hay más espacio para frases — elimina o acorta algunas para agregar más. |  |
| phraseToggleLabel | Enable or disable phrase $1 | Activar o desactivar la frase $1 | $1 |
| phraseTooLongToast | Phrase is too long. Keep it under $1 characters. | La frase es demasiado larga. Usa menos de $1 caracteres. | $1 |
| postsBlocked | Posts blocked | Posts bloqueados |  |
| remove | Remove | Eliminar |  |
| removeAllowPhraseLabel | Remove never-hide phrase $1 | Eliminar frase que nunca se oculta $1 | $1 |
| removeBlockedAuthorLabel | Remove blocked author $1 | Eliminar autor bloqueado $1 | $1 |
| removeExcludedLabel | Remove excluded post $1 | Eliminar publicación excluida $1 | $1 |
| removeWhitelistedAuthorLabel | Remove whitelisted author $1 | Eliminar autor en lista blanca $1 | $1 |
| reportCopied | Post text copied — paste it into the issue form | Texto de la publicación copiado — pégalo en el formulario de incidencia |  |
| reportFailed | Couldn't copy — please copy the post text manually | No se pudo copiar — copia el texto de la publicación manualmente |  |
| reportMissed | Report missed spam | Reportar spam no detectado |  |
| resetCount | Reset count | Reiniciar contador |  |
| save | Save | Guardar |  |
| searchPhrases | Search phrases... | Buscar frases... |  |
| searchPhrasesLabel | Search custom and built-in phrases | Buscar frases personalizadas e incorporadas |  |
| settingsPartAllowMany | $1 never-hide phrases | $1 frases que nunca se ocultan | $1 |
| settingsPartAllowOne | 1 never-hide phrase | 1 frase que nunca se oculta |  |
| settingsPartAnd | and | y |  |
| settingsPartBlockedAuthorsMany | $1 blocked authors | $1 autores bloqueados | $1 |
| settingsPartBlockedAuthorsOne | 1 blocked author | 1 autor bloqueado |  |
| settingsPartExcludedMany | $1 exclusions | $1 exclusiones | $1 |
| settingsPartExcludedOne | 1 exclusion | 1 exclusión |  |
| settingsPartLangsMany | $1 languages | $1 idiomas | $1 |
| settingsPartLangsOne | 1 language | 1 idioma |  |
| settingsPartPhrasesMany | $1 phrases | $1 frases | $1 |
| settingsPartPhrasesOne | 1 phrase | 1 frase |  |
| settingsPartWhitelistMany | $1 whitelisted authors | $1 autores en lista blanca | $1 |
| settingsPartWhitelistOne | 1 whitelisted author | 1 autor en lista blanca |  |
| settingsTitle | LinkedIn Spam Blocker — Settings | LinkedIn Spam Blocker — Configuración |  |
| show | Show | Mostrar |  |
| showAll | Show all | Mostrar todas |  |
| snooze30 | Snooze 30 min | Posponer 30 min |  |
| snoozedUntil | Snoozed until | Pospuesto hasta |  |
| starterPack | Add Starter Pack | Agregar Paquete Inicial |  |
| starterPackAddedMany | Added $1 starter phrases. | Se añadieron $1 frases iniciales. | $1 |
| starterPackAddedOne | Added 1 starter phrase. | Se añadió 1 frase inicial. |  |
| starterPackExists | All starter phrases already exist. | Todas las frases iniciales ya existen. |  |
| starterPackLabel | Add starter phrases | Añadir frases iniciales |  |
| suggestionAddContains | Add as contains | Añadir como contiene |  |
| suggestionAddContainsLabel | Add "$1" as a contains phrase | Añadir "$1" como frase que contiene el texto | $1 |
| suggestionAddExact | Add as exact | Añadir como exacta |  |
| suggestionAddExactLabel | Add "$1" as an exact phrase | Añadir "$1" como frase exacta | $1 |
| suggestionDismiss | Dismiss | Descartar |  |
| suggestionDismissLabel | Dismiss suggestion "$1" | Descartar sugerencia "$1" | $1 |
| suggestionsFallbackHint | Open a LinkedIn feed to add or dismiss these suggestions. | Abre una pestaña de LinkedIn para añadir o descartar estas sugerencias. |  |
| suggestionsLabel | Suggestions | Sugerencias |  |
| testerAllowed | Would NOT be hidden — allowed by: "$1" | NO se ocultaría — permitida por: "$1" | $1 |
| testerButton | Test | Probar |  |
| testerNoMatch | Would NOT be hidden — nothing matched. | NO se ocultaría — nada coincide. |  |
| testerPlaceholder | Paste a post's text to test it against your current rules | Pega el texto de una publicación para probarlo con tus reglas actuales |  |
| testerTitle | Would this be blocked? | ¿Se bloquearía? |  |
| todayLabel | Today | Hoy |  |
| toggleEnabledLabel | Enable or disable LinkedIn spam blocking | Activar o desactivar el bloqueo de spam en LinkedIn |  |
| totalLabel | Total | Total |  |
| tryStarterPack | Tip: Try the "Add Starter Pack" button above to get started. | Consejo: Prueba el botón "Agregar Paquete Inicial" para empezar. |  |
| unblockAuthor | Unblock this author | Desbloquear a este autor |  |
| undo | Undo | Deshacer |  |
| weekLabel | Week | Semana |  |
| welcomeDismiss | Got it | Entendido |  |
| welcomeIntro | LinkedIn Spam Blocker is already running. Here's what it does and how to tune it. | LinkedIn Spam Blocker ya está en marcha. Esto es lo que hace y cómo ajustarlo. |  |
| welcomeStepDetect | It hides posts that ask you to comment a keyword to get a file — in five languages, each toggleable below. | Oculta las publicaciones que te piden comentar una palabra clave para recibir un archivo — en cinco idiomas, cada uno activable abajo. |  |
| welcomeStepPrivacy | Nothing leaves your browser — no analytics, no network requests, ever. | Nada sale de tu navegador — sin analíticas, sin peticiones de red, nunca. |  |
| welcomeStepRestore | Every hidden post leaves a placeholder: Show it, mark it Not spam, or block its author. | Cada publicación oculta deja un marcador: muéstrala, márcala como «No es spam» o bloquea a su autor. |  |
| welcomeStepTune | Add your own phrases, or turn off any built-in pattern that gets it wrong. | Añade tus propias frases o desactiva cualquier patrón incorporado que falle. |  |
| welcomeTitle | Welcome — you're set up | Bienvenido — todo listo |  |
| whitelistTitle | Whitelisted Authors | Autores en lista blanca |  |

## Call sites by file

Literal `SS_t("key")` / `t("key")` calls and `__MSG_key__` tokens:

| File | Keys |
|------|------|
| `content.js` (15) | blockAuthor, blockedBy, blockedByAuthor, blockedFeatured, blockedPromoted, blockedToast, neverBlock, notSpam, notSpamTooltip, reportCopied, reportFailed, reportMissed, show, unblockAuthor |
| `popup/popup.js` (17) | add, byPatternAuthor, byPatternCustom, cancelSnooze, clickToConfirm, justNow, mAgo, matchedLabel, noLiveTabNotice, resetCount, snooze30, snoozedUntil, suggestionDismiss, suggestionsFallbackHint, undo |
| `options/options.js` — literal (79) | addedPhraseToast, allowAddedToast, allowConflictToast, allowEmpty, allowLimitToast, builtinLabel, builtinPatternToggleHint, builtinPatternToggleLabel, cancel, clickToConfirm, contains, containsTooltip, delete, deletedPhraseToast, deletePhraseLabel, disabled, duplicatePhraseToast, edit, editPhraseLabel, enabled, exact, exactTooltip, excludedClearAll, excludedNearCap, excludedNoPreview, importedNothing, importedNothingSkipped, importedSummary, importedSummarySkipped, importFileEmpty, importFileTooLarge, invalidJsonFile, languageToggleLabel, matchedLabel, modeToggleLabel, noCustomPhrases, noCustomPhrasesShort, noPhrasesMatch, nothingToExport, patternHitCountTitle, patternTotalsLine, phraseLimitToast, phraseStorageFullToast, phraseToggleLabel, phraseTooLongToast, remove, removeAllowPhraseLabel, removeBlockedAuthorLabel, removeExcludedLabel, removeWhitelistedAuthorLabel, save, settingsPartAnd, starterPackExists, suggestionAddContains, suggestionAddContainsLabel, suggestionAddExact, suggestionAddExactLabel, suggestionDismiss, suggestionDismissLabel, testerAllowed, testerNoMatch, tryStarterPack |
| `options/options.js` — ternary (2) | exportedSummaryClipboard, exportedSummaryDownloaded (`options/options.js:737-740`) |
| `background.js` (2) | blockAuthorMenu, contextMenuTitle |
| `popup/popup.html` (20) | appName, byPatternLabel, enabled, footerSites, lastBlockedLabel, managePhrases, noConnection, noLiveTabNotice, openLinkedIn, postsBlocked, resetCount, showAll, snooze30, suggestionsLabel, todayLabel, toggleEnabledLabel, totalLabel, weekLabel |
| `options/options.html` (45) | addButton, addPhraseButtonLabel, addPhraseInputLabel, addPlaceholder, allowAddLabel, allowHint, allowInputLabel, allowPlaceholder, allowTitle, blockedAuthorTitle, detectionLangs, excludedClearAll, excludedTitle, exportJson, exportJsonLabel, hideFeaturedLabel, hideLabelsTitle, hidePromotedLabel, importHint, importJson, importJsonLabel, noCustomPhrases, noCustomPhrasesShort, pageSubtitle, searchPhrases, searchPhrasesLabel, settingsTitle, starterPack, starterPackLabel, suggestionsLabel, testerButton, testerPlaceholder, testerTitle, tryStarterPack, welcomeDismiss, welcomeIntro, welcomeStepDetect, welcomeStepPrivacy, welcomeStepRestore, welcomeStepTune, welcomeTitle, whitelistTitle |

Overlap (used in more than one surface): noLiveTabNotice, resetCount,
snooze30, suggestionsLabel, excludedClearAll, noCustomPhrases,
noCustomPhrasesShort, tryStarterPack.

### Dynamic keys — `countMessage()` / `settingsPart()` (the plan's known pitfall)

`countMessage(oneKey, manyKey, count, substitutions)`
(`options/options.js:288-293`) selects `oneKey` when `count === 1`,
`manyKey` otherwise. Its call sites were resolved by reading, not regex:

| Call site (`options/options.js`) | oneKey / manyKey pairs | Substitutions |
|---|---|---|
| `577-583` (starter-pack toast) | starterPackAddedOne / starterPackAddedMany | `added` |
| `settingsPart()` helper `614-616`, called at `662-666`, `671-675`, `680-684`, `689-693`, `698-702`, `707-711`, `716-720` (export summary) and `1199-1258` (import summary) | settingsPartPhrasesOne/Many, settingsPartWhitelistOne/Many, settingsPartExcludedOne/Many, settingsPartLangsOne/Many, settingsPartBlockedAuthorsOne/Many, patternCountOne/Many, settingsPartAllowOne/Many | `count` |
| `730-735` (export toasts) | exportedClipboardOne/Many, exportedDownloadedOne/Many | `phrases.length` |
| `840-852` (legacy import toast) | importedPhrasesSkippedOne/Many (`[valid, skipped]`), importedPhrasesOne/Many (`valid`) | see previous column |
| `1350-1355` (language toggle count) | patternCountOne / patternCountMany | `count` |
| `1516-1521` (excluded count) | excludedCountOne / excludedCountMany | `excluded.length` |
| `1858-1863` (custom-phrase status) | customPhraseStatusOne / customPhraseStatusMany | `[enabled, filtered.length]` |

28 dynamic keys total. Note `importedPhrasesSkippedOne` =
`Imported 1 phrase ($2 skipped).` — it contains `$2` but **no `$1`** (the
"1" is baked into the message); the parity guard enforces the same shape in
es.

## Translator notes (packet for the deferred FR/PT/DE run)

Use this section as the briefing for a human translator. Per-key notes
beyond the table:

1. **`contextMenuTitle`** — contains `%s`, a contextMenus-API placeholder
   (the selected text), not an i18n `$N`. Preserve `%s` verbatim. es:
   `Añadir "%s" al bloqueador de LinkedIn`.
2. **`mAgo`** — a *suffix* fragment appended to a number:
   `ago + SS_t("mAgo")` (`popup/popup.js:275`). es: `m atrás` ("5 m atrás").
   FR/PT/DE need a form that reads correctly after a bare integer.
3. **`snoozedUntil`** — a *prefix*: `SS_t("snoozedUntil") + " " +
   until.toLocaleTimeString(...)` (`popup/popup.js:346-348`). The time part
   is rendered in the **browser's** UI locale, not the extension locale —
   translators cannot control it; phrase so that appending a localized time
   works.
4. **`add`** — concatenated: `SS_t("add") + ' "' + s.word + '"?`
   (`popup/popup.js:314`). Keep it a short verb usable before a quoted word.
5. **`justNow`** — standalone (`popup/popup.js:275`).
6. **`enabled` / `disabled`** — used standalone and as the `$2` substitution
   of `languageToggleLabel` (`options/options.js:1337-1338`).
7. **`exact` / `contains`** — mode labels; `exact` is also the `$2`
   substitution of `modeToggleLabel` (`options/options.js:1959`, where `$1`
   is the phrase text and `$2` is the current mode badge text).
8. **`languageToggleLabel`** — `$1` = English name of the detection language
   (`names.english`, e.g. "English", "Spanish"…), `$2` = enabled/disabled.
9. **`builtinPatternToggleLabel`** — `$1` = the built-in pattern's label, an
   example spam phrase in the pattern's own language (e.g. an English bait
   phrase for an EN pattern). Translate the surrounding template, not the
   substitution value.
10. **`blockedToast`** — `$1` = blocked-post count; used in the first-run
    banner (`content.js:1273`). Keep the `$1 post(s)` shape or adapt
    pluralization idiomatically — the value is a bare number.
11. **`testerAllowed`** — `$1` = allow-rule text (`options/options.js:1800`).
12. **`patternHitCountTitle`** — `$1` = lifetime block count
    (`options/options.js:1924`).
13. **`phraseTooLongToast`** — `$1` = `LIMITS.MAX_PHRASE_LENGTH` (a number).
14. **`allowLimitToast` / `phraseLimitToast`** — `$1` = a limit number.
15. **`patternTotalsLine`** — `$1` = custom-phrase count, `$2` =
    blocked-author count; uses the `·` separator (`options/options.js:1838`).
16. **`exportedSummaryClipboard` / `exportedSummaryDownloaded`** — `$1` is a
    pre-composed summary string built from `settingsPart*` pieces joined
    with `", "` and `settingsPartAnd` (`options/options.js:618-624`,
    `726-740`). Translate as "Exported <summary> to clipboard." templates.
17. **`settingsPartAnd`** — the conjunctive ("and") used inside those
    summaries; a bare conjunction word.
18. **Quoted-value keys (14)** — embed typographic quotes around `$1`:
    addedPhraseToast, addPlaceholder, allowAddedToast, allowConflictToast,
    contextMenuTitle, deletedPhraseToast, duplicatePhraseToast, importHint,
    noPhrasesMatch, suggestionAddContainsLabel, suggestionAddExactLabel,
    suggestionDismissLabel, testerAllowed, tryStarterPack. Preserve or adapt
    quote style to language typographic conventions; keep the quotes around
    the user value.
19. **`clickToConfirm`** — swaps with `resetCount` on the same button
    (`popup/popup.js:411-418`); keep both very short.
20. **Button-length constraints** — placeholder buttons are styled at
    `font-size: 12-13px`, `padding: 4px 12px` (`content.js:897-1020`);
    long FR/PT/DE renderings of `neverBlock`, `unblockAuthor`, `blockAuthor`,
    `notSpam`, `show`, `reportMissed` may overflow the placeholder row —
    prefer concise wording. Context-menu titles (`contextMenuTitle`,
    `blockAuthorMenu`) are not clamped in code; Chrome truncates long menu
    items.
21. **Badge** — not localized (bare number, 4-char clamp at
    `background.js:64`); nothing to translate.
22. **Pluralization pairs** — the "one" variants of several pairs bake in
    the literal "1" (settingsPartPhrasesOne `1 phrase`, excludedCountOne
    `1 excluded post`, patternCountOne `1 pattern`, starterPackAddedOne
    `Added 1 starter phrase.`); FR/PT/DE must bake in the singular form the
    same way. `importedPhrasesSkippedOne` takes `$2` only.
23. **Manifest strings** — `manifest.json` `name`, `description` and
    `action.default_title` are hardcoded, not `__MSG_`-tokenized; the
    description embeds quotes (`"Comment X and I will send..."`). If a
    future run localizes them, they must move to `__MSG_` tokens in the
    manifest. Out of scope for this audit.
24. **Locale codes** — use `fr`, `de`, `pt_BR`/`pt_PT` (never bare `pt`);
    Chrome ignores unsupported locale directories.

## Maintenance

- Every future user-facing string must be added to BOTH
  `_locales/en/messages.json` and `_locales/es/messages.json` at once —
  the `npm run smoke` parity guard is the enforcement.
- When FR/PT/DE land, extend the same jq parity check to those files
  (and bump the AGENTS.md i18n bullet to list all shipped locales).
- The `%s` placeholder in `contextMenuTitle` sits outside the `$N` scan —
  a reviewer adding locales should eyeball it (or extend the scan).
- This document is the translator packet: point a human translator at the
  key table + translator notes instead of re-deriving the inventory.