# Plan 004: Make built-in detection patterns a single source of truth instead of hand-synced duplicates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js options/options.js manifest.json options/options.html scripts/package-extension.js package.json`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on
> a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this matters

The set of built-in spam-detection patterns exists in two places that must
be kept manually in sync, with only a code comment enforcing the discipline:

- `content.js`'s `BASE_PATTERNS` — the actual `RegExp` objects used to
  detect spam, one array per language (`EN`, `ES`, `FR`, `PT`, `DE`).
- `options/options.js`'s `BUILTIN` — a parallel array of `{ lang, label }`
  objects used only to *display* what the built-in patterns roughly match,
  in the settings page's phrase list and language-toggle pattern counts.

Both are currently in sync (10 entries each, 2 per language). Nothing
prevents that from silently breaking: add a third English pattern to
`BASE_PATTERNS.EN` without remembering to add a matching row to `BUILTIN`,
and the settings page will keep showing "2 patterns" for English while 3 are
actually active — a user has no way to know the display undercounts what's
really being matched. This plan collapses both into one shared data file so
there is exactly one place to add or change a built-in pattern.

## Current state

`content.js:38-63` — `BASE_PATTERNS`, the regexes actually used for
detection, plus the language list derived from its keys:
```js
  /* Keep in sync with options.js BUILTIN, LANG_META, and lang toggle logic. */
  const BASE_PATTERNS = Object.freeze({
    EN: Object.freeze([
      /(?:comment|type|write|reply|drop)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:and|to)\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message|get|receive|send you|share the|give you)\b/i,
      /[`'""«»“”„]\w+(?:\s+\w+)?[`'""»”„]\s+and\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message)\b/i,
    ]),
    ES: Object.freeze([
      /(?:comenta|escribe|responde|pon|poner)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:y\s+(?:te\s+|le\s+|me\s+)?)(?:enví|enviaré|comparto|mando|daré|doy|regalo)\b/i,
      /(?:comenta|escribe|responde|pon|poner)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:para|y)\s+(?:recibir|obtener|acceder|descargar)\b/i,
    ]),
    FR: Object.freeze([
      /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:et\s+(?:je\s+|j'|je\s+vais\s+))?(?:enverrai|envoie|partage|donne|donnerai|envoie le|partage le)\b/i,
      /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:pour|afin\s+d')(?:recevoir|obtenir|acceder|avoir|telecharger)\b/i,
    ]),
    PT: Object.freeze([
      /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:e\s+(?:eu\s+|vou\s+)?)(?:enviarei|envio|compartilho|mando|mandei|dou|darei|envio o|compartilho o)\b/i,
      /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:para|e)\s+(?:receber|obter|acessar|baixar|pegar)\b/i,
    ]),
    DE: Object.freeze([
      /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:und\s+(?:ich\s+)?)(?:schicke|sende|teile|gebe|schick dir|send dir)\b/i,
      /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:um\s+|damit\s+)(?:zugriff|zu\s+bekommen|zu\s+erhalten|kostenlos)\b/i,
    ]),
  });


  const DEFAULT_ENABLED_LANGS = Object.freeze(["EN", "ES", "FR", "PT", "DE"]);
```

`content.js:439-468` — `buildPatterns()`, which reads `BASE_PATTERNS` by
language key:
```js
  function buildPatterns(phrases, langs) {
    const builtin = [];
    for (const lang of langs || DEFAULT_ENABLED_LANGS) {
      if (BASE_PATTERNS[lang]) {
        builtin.push(...BASE_PATTERNS[lang]);
      }
    }
    const custom = (phrases || [])
      .filter((p) => (
        p &&
        p.enabled &&
        typeof p.text === "string" &&
        p.text.trim().length > 0 &&
        p.text.trim().length <= CONFIG.MAX_PHRASE_LENGTH
      ))
      .map((p) => {
        const text = p.text.trim();
        const escaped = escapeRegex(text);
        if (p.mode === "contains") {
          return new RegExp(escaped, "i");
        }
        const start = /^\w/.test(text) ? "\\b" : "";
        const end = /\w$/.test(text) ? "\\b" : "";
        return new RegExp(start + escaped + end, "i");
      });
    return [...builtin, ...custom];
  }
```

`options/options.js:701-727` — `LANG_META` (display names, NOT duplicated
elsewhere — leave this where it is) and `BUILTIN` (the duplicated part):
```js
  /* ── Language metadata ──────────────────────────────────────── */

  const LANG_META = {
    EN: { native: "English",   english: "English" },
    ES: { native: "Español",   english: "Spanish" },
    FR: { native: "Français",  english: "French" },
    PT: { native: "Português", english: "Portuguese" },
    DE: { native: "Deutsch",   english: "German" },
  };

  /* ── Built-in patterns (display only) ─────────────────────────
     Keep in sync with BASE_PATTERNS and LANG_META above.
     When adding a language or pattern to content.js, update
     LANG_META, BUILTIN, and the language toggle logic here.     */

  const BUILTIN = [
    { lang: "EN", label: 'comment "WORD" and I\'ll send / share ...' },
    { lang: "EN", label: '"WORD" and I will send ...' },
    { lang: "ES", label: 'comenta "WORD" y te enviaré / comparto ...' },
    { lang: "ES", label: 'comenta "WORD" para recibir / descargar ...' },
    { lang: "FR", label: 'commentez "WORD" et j\'enverrai / je partage ...' },
    { lang: "FR", label: 'commentez "WORD" pour recevoir / télécharger ...' },
    { lang: "PT", label: 'comente "WORD" e enviarei / compartilho ...' },
    { lang: "PT", label: 'comente "WORD" para receber / baixar ...' },
    { lang: "DE", label: 'kommentiere "WORD" und ich schicke / teile ...' },
    { lang: "DE", label: 'kommentiere "WORD" um zu bekommen / erhalten ...' },
  ];
```

`options/options.js:449-484` — `renderLangs()`, which reads `BUILTIN` to
compute the per-language pattern count shown next to each language toggle:
```js
  function renderLangs() {
    langToggles.innerHTML = "";
    for (const [code, names] of Object.entries(LANG_META)) {
      const count = BUILTIN.filter((b) => b.lang === code).length;
      ...
```

`options/options.js:544-548` and `580-610` — `render()`'s built-in-pattern
loop and `createBuiltinRow()`, which iterate `BUILTIN` directly to render
each display row.

`manifest.json`'s `content_scripts[0].js` (currently `["content.js"]`) and
`options/options.html`'s trailing `<script>` tags (currently
`<script src="../i18n.js"></script>` then `<script src="options.js"></script>`)
control script load order — this matters because the new shared file must
load *before* both `content.js` and `options.js`.

`scripts/package-extension.js:15-36` — the `files` array that determines
what actually ships in the packaged zip. **Any new file referenced by
`manifest.json` or the HTML pages that isn't added here will be missing from
the packaged extension**, even though local unpacked testing would still
work (unpacked loads directly from the repo, not the zip).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0, "Extension smoke test passed." |
| Packaged extension e2e | `npm run test:package` | exit 0, same message — **this is the step that catches a missing packaging entry**, since it unzips and loads the actual packaged build |

## Scope

**In scope**:
- New file: `shared/pattern-data.js`
- `content.js` (replace `BASE_PATTERNS` definition with a derivation from
  the shared data)
- `options/options.js` (replace `BUILTIN` definition with a derivation from
  the shared data; `LANG_META` stays where it is)
- `manifest.json` (add the new file to `content_scripts[0].js`, before
  `content.js`)
- `options/options.html` (add a `<script>` tag for the new file, before
  `options.js`)
- `scripts/package-extension.js` (add the new file to the `files` array)
- `package.json` (add the new file to the `smoke` script's `node --check` chain)

**Out of scope**:
- `LANG_META` in `options/options.js` — it's not duplicated anywhere else;
  leave it in place.
- `popup/`, `background.js` — neither uses pattern data.
- Changing any pattern's actual regex behavior, adding new patterns, or
  adding new languages. This is a pure refactor: detection behavior before
  and after must be identical. If you find yourself wanting to "fix" a
  pattern while moving it, don't — file that as a separate concern and
  leave the regex text byte-for-byte identical here.
- `plans/005-unit-test-coverage.md` depends on this plan landing first (it
  extends the same `shared/pattern-data.js` file with additional exports).
  Do not add test infrastructure as part of this plan.

## Git workflow

- Branch: `advisor/004-shared-pattern-data`
- Commit message style: `refactor(patterns): extract built-in pattern data into a single shared file`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `shared/pattern-data.js`

Create a new directory `shared/` at the repo root with one file,
`shared/pattern-data.js`. This file must work in three contexts: as a
`<script>`-tag global in the content script and options page (no module
system available there — this repo has no bundler), and as a CommonJS
module when `require()`d from a future Node-based unit test (added in
`plans/005-unit-test-coverage.md`). Follow the pattern already used by
`i18n.js` in this repo for detecting its environment (see `i18n.js:4-10`
for the existing style of checking `globalThis` before using browser
globals), adapted for this dual-context need:

```js
(function (root) {
  "use strict";

  /* Single source of truth for built-in spam-detection patterns.
     content.js derives BASE_PATTERNS (regexes, used for matching) and
     options.js derives BUILTIN (labels, used for display) from this file —
     see their respective usages. Regex text below must stay byte-for-byte
     identical to what content.js used before this file existed; this is a
     data move, not a detection-behavior change. */
  const PATTERN_DATA = Object.freeze({
    EN: Object.freeze([
      Object.freeze({
        regex: /(?:comment|type|write|reply|drop)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:and|to)\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message|get|receive|send you|share the|give you)\b/i,
        label: 'comment "WORD" and I\'ll send / share ...',
      }),
      Object.freeze({
        regex: /[`'""«»“”„]\w+(?:\s+\w+)?[`'""»”„]\s+and\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message)\b/i,
        label: '"WORD" and I will send ...',
      }),
    ]),
    ES: Object.freeze([
      Object.freeze({
        regex: /(?:comenta|escribe|responde|pon|poner)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:y\s+(?:te\s+|le\s+|me\s+)?)(?:enví|enviaré|comparto|mando|daré|doy|regalo)\b/i,
        label: 'comenta "WORD" y te enviaré / comparto ...',
      }),
      Object.freeze({
        regex: /(?:comenta|escribe|responde|pon|poner)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:para|y)\s+(?:recibir|obtener|acceder|descargar)\b/i,
        label: 'comenta "WORD" para recibir / descargar ...',
      }),
    ]),
    FR: Object.freeze([
      Object.freeze({
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:et\s+(?:je\s+|j'|je\s+vais\s+))?(?:enverrai|envoie|partage|donne|donnerai|envoie le|partage le)\b/i,
        label: 'commentez "WORD" et j\'enverrai / je partage ...',
      }),
      Object.freeze({
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:pour|afin\s+d')(?:recevoir|obtenir|acceder|avoir|telecharger)\b/i,
        label: 'commentez "WORD" pour recevoir / télécharger ...',
      }),
    ]),
    PT: Object.freeze([
      Object.freeze({
        regex: /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:e\s+(?:eu\s+|vou\s+)?)(?:enviarei|envio|compartilho|mando|mandei|dou|darei|envio o|compartilho o)\b/i,
        label: 'comente "WORD" e enviarei / compartilho ...',
      }),
      Object.freeze({
        regex: /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:para|e)\s+(?:receber|obter|acessar|baixar|pegar)\b/i,
        label: 'comente "WORD" para receber / baixar ...',
      }),
    ]),
    DE: Object.freeze([
      Object.freeze({
        regex: /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:und\s+(?:ich\s+)?)(?:schicke|sende|teile|gebe|schick dir|send dir)\b/i,
        label: 'kommentiere "WORD" und ich schicke / teile ...',
      }),
      Object.freeze({
        regex: /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»“”„]?\w+(?:\s+\w+)?[`'""»”„]?\s+(?:um\s+|damit\s+)(?:zugriff|zu\s+bekommen|zu\s+erhalten|kostenlos)\b/i,
        label: 'kommentiere "WORD" um zu bekommen / erhalten ...',
      }),
    ]),
  });

  root.SS_PATTERN_DATA = PATTERN_DATA;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PATTERN_DATA };
  }
})(typeof self !== "undefined" ? self : globalThis);
```

**The code block above is structural illustration, not the copy source.**
This plan file is Markdown, and Markdown rendering/editing can normalize
characters inside the regex literals shown (e.g. the curly quotes
`“”„` inside `content.js`'s actual character classes may not
survive round-tripping through this document byte-for-byte identically).
Do not copy the regex literals from this plan file. Instead:

1. Open the live `content.js` in the repository and copy each `RegExp`
   literal directly from `BASE_PATTERNS` (the block shown in "Current
   state" above tells you where to find each one and what order they're
   in — use it as a map, not a source).
2. Open the live `options/options.js` and copy each label string directly
   from `BUILTIN`, the same way.
3. Paste each regex/label pair into the new file, preserving the pairing
   (first EN pattern with first EN label, etc. — verify the pairing is
   correct by comparing against the "Current state" excerpts' order, not
   by re-deriving meaning from the regex itself).

Copy from the actual source files, not from this plan document, and the
later "byte-for-byte identical" done-criterion (see "Done criteria" below)
becomes a meaningful check rather than one that could fail against this
plan's own possibly-normalized Markdown.

**Verify**: `node --check shared/pattern-data.js` → exit 0.

### Step 2: Derive `BASE_PATTERNS` in `content.js` from the shared data

Replace the `BASE_PATTERNS` block at `content.js:38-63` (shown in "Current
state") with:

```js
  /* Derived from shared/pattern-data.js — see that file for the actual
     pattern definitions and their display labels. */
  const BASE_PATTERNS = Object.freeze(
    Object.fromEntries(
      Object.entries(SS_PATTERN_DATA).map(([lang, entries]) => [
        lang,
        Object.freeze(entries.map((entry) => entry.regex)),
      ])
    )
  );

  const DEFAULT_ENABLED_LANGS = Object.freeze(["EN", "ES", "FR", "PT", "DE"]);
```

`buildPatterns()` (`content.js:439-468`) reads `BASE_PATTERNS[lang]` exactly
as before — no change needed there, since the derived shape
(`{ EN: [RegExp, RegExp], ... }`) is identical to the original.

**Verify**: `node --check content.js` → exit 0.

### Step 3: Derive `BUILTIN` in `options.js` from the shared data

Replace the `BUILTIN` block at `options/options.js:711-727` (shown in
"Current state") with:

```js
  /* Derived from shared/pattern-data.js — see that file for the actual
     pattern definitions this describes. */
  const BUILTIN = Object.entries(SS_PATTERN_DATA).flatMap(([lang, entries]) =>
    entries.map((entry) => ({ lang, label: entry.label }))
  );
```

Update the comment above `LANG_META` (`options/options.js:701-703`, "──
Language metadata ──") to drop the now-stale "Keep in sync with
BASE_PATTERNS" instruction, since sync is now automatic. Everything else in
`options.js` that reads `BUILTIN` (`renderLangs()` at line 449-484,
`render()`'s built-in loop at 544-548, `createBuiltinRow()` at 580-610)
needs no changes — the derived array has the same `{ lang, label }` shape.

**Verify**: `node --check options/options.js` → exit 0.

### Step 4: Wire the new file into the load order

`manifest.json` — in `content_scripts[0].js`, add the new file **before**
`content.js`:
```json
      "js": ["shared/pattern-data.js", "content.js"],
```

`options/options.html` — add a `<script>` tag **before** the existing
`options.js` tag, at the bottom of the file (currently `<script
src="../i18n.js"></script>` then `<script src="options.js"></script>`):
```html
  <script src="../i18n.js"></script>
  <script src="../shared/pattern-data.js"></script>
  <script src="options.js"></script>
```

**Verify**: `python3 -c "import json; json.load(open('manifest.json'))"` →
exits 0 (confirms `manifest.json` is still valid JSON after the edit).

### Step 5: Add the new file to the packaged zip

In `scripts/package-extension.js`, add `"shared/pattern-data.js"` to the
`files` array (`scripts/package-extension.js:15-36`), placed near
`"content.js"` for readability:

```js
const files = [
  "manifest.json",
  "background.js",
  "shared/pattern-data.js",
  "content.js",
  "i18n.js",
  ...
```

This step is not optional — skipping it means the packaged zip's
`manifest.json` (or `options.html`) references a file that doesn't exist in
the zip, and `npm run test:package` (Test plan step 3 below) is expected to
catch this if missed.

**Verify**: `node scripts/package-extension.js && unzip -l dist/linkedin-spam-blocker-$(node -p "require('./manifest.json').version").zip | grep pattern-data.js` → shows the file listed in the zip.

### Step 6: Add the new file to the `smoke` syntax check

`package.json`'s `smoke` script runs `node --check` on every source file in
the extension. Add the new file to that list so a syntax error in it is
caught the same way as any other file. In `package.json`:

```json
    "smoke": "jq empty manifest.json _locales/en/messages.json _locales/es/messages.json && node --check content.js && node --check background.js && node --check popup/popup.js && node --check options/options.js && node --check i18n.js && node --check shared/pattern-data.js && node --check tests/extension-smoke.js",
```

(inserting `node --check shared/pattern-data.js` — placement within the
chain doesn't matter, but grouping it near `node --check content.js` for
readability is reasonable, matching the load-order relationship between the
two files).

**Verify**: `npm run smoke` → exit 0, and re-run it after intentionally
introducing a syntax error into `shared/pattern-data.js` to confirm it's
actually being checked (then revert the intentional error).

## Test plan

This is a pure refactor with no new user-facing behavior, so the existing
test suite is the right regression check — it must pass unmodified:

1. `npm run smoke` — confirms every touched file still parses/is valid JSON.
2. `npm run test:extension` — the existing `tests/extension-smoke.js`
   scenario blocks a post matching one of the moved English patterns
   (`Comment "CLAUDE" and I'll send you...`) — if the regex was transcribed
   incorrectly in Step 1, this test fails.
3. `npm run test:package` — catches a missing `scripts/package-extension.js`
   entry (Step 5) or a missing/misordered `<script>` tag (Step 4), since it
   loads the actual packaged zip in a real browser.
4. Manual check: open the options page unpacked, confirm the language
   toggle section still shows "2 patterns" for each of EN/ES/FR/PT/DE
   (unchanged from before this refactor), and confirm the phrase list still
   shows all 10 built-in pattern rows with their original label text.

`plans/005-unit-test-coverage.md` will add automated unit tests against
`shared/pattern-data.js`'s exported `PATTERN_DATA` once this plan lands —
no new automated test is required from this plan beyond the existing e2e
suite continuing to pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0 (regression check — same assertions as before this plan)
- [ ] `npm run test:package` exits 0
- [ ] `grep -n "BASE_PATTERNS = Object.freeze" content.js` shows it now
      derives from `SS_PATTERN_DATA`, not inline regex literals
- [ ] `grep -n "const BUILTIN" options/options.js` shows it now derives from
      `SS_PATTERN_DATA`, not an inline array literal
- [ ] `grep -n "pattern-data.js" manifest.json options/options.html scripts/package-extension.js package.json`
      shows the new file referenced in all four places
- [ ] `git diff 1f7f4e3..HEAD -- content.js` shows the regex literals
      removed from `content.js` but not altered anywhere else in the diff
      (confirms this was a pure move, not an edit)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (drift since this plan was written).
- `npm run test:extension` fails after this refactor — this means a regex
  was transcribed incorrectly in Step 1; do not "fix" the regex to make the
  test pass without first confirming byte-for-byte equality with the
  original `content.js` regex at that position (use `git diff` against the
  pre-refactor version to compare).
- `npm run test:package` fails but `npm run test:extension` (unpacked)
  passes — this specifically indicates a packaging omission (Step 5) or a
  script-tag ordering issue (Step 4); don't work around it by duplicating
  the file, fix the actual reference.
- You find yourself wanting to also change `LANG_META` or add a new
  language/pattern — that's out of scope for this plan; file it separately.

## Maintenance notes

- Any future built-in pattern addition or edit now happens in exactly one
  place: `shared/pattern-data.js`. Update `plans/README.md`'s "considered
  and rejected" section is not needed for this — this note itself is the
  durable record.
- `plans/005-unit-test-coverage.md` depends on this plan and will add
  `escapeRegex`, `isLinkedInHost`, `parseAuthorId`, `getExcludedSignature`,
  and `hashString` exports to this same `shared/pattern-data.js` file,
  keeping the filename as-is (deliberately not renamed — see that plan for
  the reasoning) even though the name reads as pattern-specific once it
  also holds unrelated utility functions. That's an accepted, intentional
  naming imperfection, not an oversight.
- A reviewer should scrutinize: that every regex in `shared/pattern-data.js`
  is byte-for-byte identical to its pre-refactor counterpart in
  `content.js` (a silent regex edit during a "refactor" PR is the kind of
  change that's easy to wave through in review but changes detection
  behavior in production).
- `plans/013-show-cooldown.md` will add a `createCooldownStore` export to
  this same file, and `plans/015-shared-constants.md` creates a sibling
  `shared/constants.js` — the `shared/` directory is the agreed home for
  `chrome`/`document`-independent modules. If either lands before this
  plan, keep this plan's refactor additive (don't restructure their code).
