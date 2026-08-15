# Plan 025: Cover FR/PT/DE detection — and fix the FR-1/FR-2/PT-1 pattern bugs the coverage exposes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- shared/pattern-data.js tests/unit/pattern-data.test.js tests/extension-interactions.js`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (pattern edits change real detection behavior)
- **Depends on**: none
- **Category**: bug + tests
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

The product's core promise is multi-language detection, yet 6 of the 10
built-in patterns (FR-1/2, PT-1/2, DE-1/2 — three of five languages) have
**zero test coverage** anywhere: `tests/unit/pattern-data.test.js` asserts
only ES-1/ES-2 behavior, and the e2e mock feed + every injected post are
EN (plus an ES regression post). During the audit, real bait sentences for
these languages were run against the patterns and **three detection bugs
surfaced immediately**:

- **FR-2 never matches natural French**: the pattern
  `...(?:pour|afin\s+d')(?:recevoir|obtenir|acceder|avoir|telecharger)\b`
  is missing a `\s+` between the preposition group and the verb group —
  "commentez MOT pour recevoir le guide" fails; only the artificial
  "pourrecevoir" would match.
- **FR-1 misses object pronouns**: "commentez COURAGE et je vous
  enverrai le PDF" fails (only `je\s+`/`j'`/`je\s+vais\s+` then verb is
  allowed — "je vous enverrai" has `vous` between). "je te partage",
  "je vous donnerai l'accès" all fail.
- **PT-1 misses the near-future**: "comente PDF e eu vou enviar o link"
  fails — the pattern only lists `enviarei|envio|compartilho|mando|mandei|dou|darei|envio o|compartilho o`, no `vou enviar`/`vou te mandar`.

EN was spot-checked and is solid ("comment X and I will send you", "type
YES and I will send it", quoted forms all match). This plan adds the
missing unit + e2e coverage AND fixes the three confirmed pattern bugs.
Each pattern fix is a detection-behavior change: keep edits minimal and
regex-linear (no new nested quantifiers).

## Current state

- `shared/pattern-data.js:22-82` — `PATTERN_DATA` with EN/ES/FR/PT/DE, two
  patterns each; ids are stable (`FR-1`, `PT-2`, ...) and must never be
  renamed or renumbered.
- FR-2 (lines ~53-56):
  ```js
  regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:pour|afin\s+d')(?:recevoir|obtenir|acceder|avoir|telecharger)\b/i,
  ```
- `tests/unit/pattern-data.test.js:89-118` — ES-1/ES-2 test block; the
  structural pattern to mirror for FR/PT/DE.
- `tests/helpers.js:12-44` — `mockLinkedInFeed`, all-EN posts; e2e
  injections live in `tests/extension-interactions.js` (the spam-2
  injection at ~line 119 uses `linkedInPage.evaluate`).

Repo conventions: patterns are byte-for-byte-identical to what shipped
before the shared module existed; any *regex text* change is a real
detection change and must be justified + tested. `escapeRegex` is applied
to user phrases only — built-ins are hand-written.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass (36→50+)   |
| E2E       | `npm run test:extension` | both files pass     |

## Scope

**In scope**:
- `shared/pattern-data.js` (FR-2, FR-1, PT-1 regex fixes only)
- `tests/unit/pattern-data.test.js` (new FR/PT/DE blocks)
- `tests/extension-interactions.js` (per-language e2e injections)

**Out of scope** (do NOT touch):
- EN/ES/DE patterns — verified solid (EN) or already covered (ES); no
  changes unless a test you write here fails them, in which case STOP and
  report (that would be a new finding).
- `content.js`, `options/options.js` — no pipeline changes; coverage only.
- The pattern *labels* (display text) — keep them as-is.
- Anything in `plans/012` territory (new languages).

## Git workflow

- Branch: `advisor/025-fr-pt-de-detection`
- Commits, conventional style, e.g.:
  - `test(detection): unit-test FR/PT/DE built-in patterns`
  - `fix(detection): match object pronouns in FR-1 (je vous enverrai)`
  - `fix(detection): add missing \s+ before FR-2 verb group`
  - `fix(detection): accept near-future vou/vai in PT-1`
  - `test(e2e): inject FR, PT, DE bait posts per language`
- Order: write the tests FIRST (they fail), then fix the patterns, then
  the e2e additions. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Unit tests for FR-1/FR-2/PT-1/PT-2/DE-1/DE-2 (write first — they fail)

Add to `tests/unit/pattern-data.test.js`, mirroring the ES-1 block
(`test("ES-1 matches the previously-dead accented verb forms", ...)` +
`test("ES-1 still rejects non-bait sentences", ...)`). For each of the six
patterns, two tests: (a) true-bait sentences match, (b) near-miss
non-bait sentences don't. Use these verified corpora (run each through
the pattern before committing — adjust only if a corpus sentence is
wrong for the intended case, and note adjustments):

- **FR-1** should match: `commentez COURAGE et j'enverrai le PDF complet`,
  `commentez COURAGE et je partage le guide gratuit`. Should NOT match:
  `je commente un article hier` (commentez≠commente prefix ambiguity —
  verify), `nous commentons votre post`.
- **FR-2** should match (after the fix): `commentez MOT pour recevoir le
  guide gratuit`, `ecrivez MOT pour obtenir le pack complet`, `reponds
  MOT afin de recevoir le PDF`. Should NOT match: `je commente ton post
  pour dire que...`, `commentez MOT pour notre communauté`.
- **PT-1** should match (after the fix): `comente PDF e eu enviarei o
  link completo`, `comente PDF e eu vou enviar o link completo`, `comente
  PDF e eu vou te mandar o link`. Should NOT match: `eu comentei no post
  ontem`, `comentamos seu artigo ontem`.
- **PT-2** should match: `comente MOT para receber o e-book`, `comente
  MOT e receber o link`. Should NOT match: `comentamos para receber
  respostas`.
- **DE-1** should match: `kommentiere PACK und ich schicke dir die
  Vorlage`, `schreib MOT und ich teile die Datei`. Should NOT match:
  `ich kommentierte den Beitrag gestern`.
- **DE-2** should match: `kommentiere MOT um Zugriff zu bekommen`,
  `antworte MOT damit ich dir kostenlos schicke`. Should NOT match:
  `der Kommentar war zu lang`.

**Verify**: `npm run test:unit` → the new tests FAIL on the corpus lines
that expose the three bugs (FR-2 space, FR-1 pronouns, PT-1 vou) and PASS
on everything else. If a corpus line fails unexpectedly, re-check the
pattern intent (read the label) before editing the corpus.

### Step 2: Fix the three pattern bugs

Minimal, linear-structure edits in `shared/pattern-data.js`:

- **FR-2**: insert `\s+` between `(?:pour|afin\s+d')` and the verb group:
  `(?:pour|afin\s+d')\s+(?:recevoir|obtenir|acceder|avoir|telecharger)\b`
- **FR-1**: extend the `je` group to allow optional object pronouns before
  the verb, e.g. replace `(?:je\s+|j'|je\s+vais\s+)` with
  `(?:je\s+(?:te\s+|vous\s+|le\s+|la\s+|les\s+|nous\s+)?|j'\s?)` —
  design it so "je vous enverrai", "je te partage", "j'enverrai", and
  "je vais envoie" all keep matching; verify the existing ES-style
  negative cases still fail (no over-matching of non-imperative French).
- **PT-1**: add near-future forms to the verb alternation, e.g. append
  `|vou\s+enviar|vou\s+te\s+mandar|vou\s+mandar` (keep `\b`-safe, no
  nested quantifiers).

Do NOT touch EN/ES/DE.

**Verify**: `npm run test:unit` → all tests pass (36 + ~12 new). Then
re-run the audit one-liners:
- `node -e "const pd=require('./shared/pattern-data.js'); console.log(pd.PATTERN_DATA.FR[1].regex.test('commentez MOT pour recevoir le guide'))"` → true
- `node -e "...FR[0]...test('commentez COURAGE et je vous enverrai le PDF')"` → true
- `node -e "...PT[0]...test('comente PDF e eu vou enviar o link')"` → true

### Step 3: e2e injections per language

Add to `tests/extension-interactions.js` (model on the existing spam-2
injection, ~line 119). In one new scenario section after a reload for a
deterministic state: inject one FR, one PT, and one DE bait post (distinct
data-ids, `lang`-suffixed), wait for the placeholder count to reach the
expected total, and assert each post's `display` is `none` — proving the
full pipeline (scan → match → block → placeholder) works per language.
Use the corpus sentences from Step 1 for the injected texts.

**Verify**: `npm run test:extension` → both files pass.

## Test plan

- Step 1: ~12 new unit tests (6 patterns × match + no-match) in
  `tests/unit/pattern-data.test.js`.
- Step 3: one new e2e scenario in `tests/extension-interactions.js`.
- Run `npm run test:unit` and `npm run test:extension` after each step.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` exits 0 with the new FR/PT/DE tests (≥ 48 total)
- [ ] The three audit one-liners in Step 2 print `true`
- [ ] `npm run test:extension` passes with the new per-language scenario
- [ ] No EN/ES/DE regex text changed (`git diff shared/pattern-data.js`
      shows only FR-1/FR-2/PT-1)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- A corpus sentence's expected match status can't be reached without
  making the regex unacceptably broad (over-match on clearly non-bait
  text) — report the tension and the candidate pattern instead of
  shipping a loose regex.
- Fixing FR-1/PT-1 turns out to require touching ES or EN patterns.

## Maintenance notes

- These are detection-behavior changes: they affect what real French,
  Portuguese, and German users see blocked. The label strings stay the
  same; the README "5 languages" claim becomes genuinely tested.
- Plan 012 (new languages) will follow the same test-first pattern —
  this plan's unit blocks are the template for any future language.
- Reviewer should scrutinize the FR-1 pronoun extension for false
  positives on imperative-less sentences (e.g. "je vous enverrai" must
  still require the leading comenta-type imperative).
- Any future pattern edit: run the unit corpus first; the corpus is now
  the regression net.
