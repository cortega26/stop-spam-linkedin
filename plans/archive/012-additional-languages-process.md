# Plan 012 (process): A repeatable process for adding a new detection language

> **Executor instructions**: This is a **process plan**, not a code-change
> plan. Its deliverable is a validated pattern set for one candidate
> language, added through this process — not a batch of new languages
> guessed from training-data familiarity. Follow the phases in order. The
> STOP condition in Phase 2 is not optional: do not merge new-language
> regex patterns that haven't passed a fluent-speaker or native-corpus
> review, regardless of how confident the pattern looks.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- shared/pattern-data.js options/options.js`
> (or `content.js`'s `BASE_PATTERNS`/`options.js`'s `BUILTIN` if
> `plans/004-shared-pattern-data.md` hasn't landed).

## Status

- **Priority**: P3
- **Effort**: S per language for the mechanical integration; **unbounded**
  for sourcing/validating correct phrasing — see "Why this is a process
  plan, not an effort estimate"
- **Risk**: MED — a poorly-validated pattern either misses real spam
  (false negative, silent failure) or flags legitimate posts (false
  positive, the most damaging kind of bug for a tool whose entire value
  proposition is "hides spam without hiding anything else")
- **Depends on**: none functionally; cleaner if `plans/004-shared-pattern-data.md`
  has landed first (one place to add the new language's entries) but not
  required
- **Category**: direction (feature)
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this is a process plan, not an effort estimate

The five existing built-in languages (`content.js`'s `BASE_PATTERNS` /
`shared/pattern-data.js`'s `PATTERN_DATA`) use regex patterns with
specific, idiomatic phrasing per language — e.g. the Spanish patterns
match `comenta/escribe/responde/pon/poner` (imperative verb forms) followed
by particular connector words (`y`, `para`) and target verbs
(`enviaré/comparto/mando/daré/doy/regalo`). Writing an equally
well-targeted pattern set for a new language requires either fluent
knowledge of how engagement-bait phrasing actually reads in that language,
or a labeled corpus of real examples to derive patterns from — neither of
which a model without verified fluency in the target language should
fabricate from plausible-sounding training-data associations. A regex that
*looks* right but was never validated against real spam examples in that
language, or reviewed by a fluent speaker, risks shipping silently broken
detection (nobody notices a pattern that never matches anything) or, worse,
silently over-broad detection (a pattern that also matches normal
professional posts in that language, directly undermining the tool's core
promise). This plan is deliberately about the *process* to get this right,
not a batch of new language entries to merge.

## Phase 1: Pick one candidate language and source real examples

Do not attempt multiple languages at once. Pick one (Italian and Dutch are
reasonable next candidates given this extension's existing European-language
focus, but this is a product decision, not a technical one — check with
whoever maintains this extension's roadmap before assuming which language
is wanted).

Source real, observed examples of engagement-bait phrasing in the target
language — not translations of the existing English/Spanish/French/
Portuguese/German patterns (a literal translation of "comment X and I'll
send Y" often doesn't match how the same bait pattern is *actually phrased*
idiomatically in another language — that's exactly the trap this process
exists to avoid). Sources to check, roughly in order of value:
- This repo's own `.github/ISSUE_TEMPLATE/missed_spam_pattern.yml` issue
  reports, if any exist in the target language already.
- Direct observation on LinkedIn itself, searching/browsing in the target
  language (respecting normal platform terms of use — this is manual
  research, not scraping).
- A fluent speaker of the target language who's active on LinkedIn and can
  describe (or has seen) the actual local phrasing pattern.

Collect at least 10–15 real or realistic positive examples (should match)
and at least 10–15 realistic negative examples (should NOT match —
ordinary professional posts in the target language that happen to share
some vocabulary with the bait pattern, e.g. posts that legitimately discuss
"comments" or "sharing" without being engagement bait). The negative
examples matter as much as the positive ones — they're what catches an
over-broad pattern before it ships.

## Phase 2: Draft patterns, then get them reviewed

Draft regex patterns following this repo's existing style (see any
existing language's entry in `shared/pattern-data.js`/`content.js`'s
`BASE_PATTERNS` for the structural pattern: an imperative-verb alternation,
optional quote-mark handling, a connector, a target-verb alternation,
case-insensitive). Test the draft against every Phase 1 example
(positive and negative) using a throwaway Node script (`new
RegExp(pattern, "i").test(exampleText)`) before touching any repo file.

**STOP condition — do not skip**: before merging, the drafted patterns
must be reviewed by someone with genuine fluency in the target language
(not just the executor's best guess at correctness), OR validated against
a labeled corpus (Phase 1's positive/negative example set) with zero false
negatives on the positive set and zero false positives on the negative
set. If neither is available, **stop here and report** — do not merge a
pattern set that only "looks plausible." This applies even if the executor
is itself a highly capable model with broad multilingual training data:
plausibility is not the same as verified correctness for a feature whose
failure mode is silently wrong for every user of that language until
someone notices and files an issue.

## Phase 3: Mechanical integration

Once Phase 2's review/validation passes, integrate the new language
following the existing repo pattern (adapt exact locations to whatever
`plans/004-shared-pattern-data.md`'s status left things in):

- Add the new language's `{regex, label}` entries to `PATTERN_DATA`
  (or `BASE_PATTERNS`/`BUILTIN` directly if `plans/004` hasn't landed —
  in which case, update both files, matching the existing "keep in sync"
  comment discipline those files currently document).
- Add the language to `DEFAULT_ENABLED_LANGS`
  (`content.js`/`shared/pattern-data.js`) — decide whether a brand-new
  language should default to *enabled* or *disabled* for existing users
  (enabling it changes existing users' detection behavior on update
  without their explicit action; disabling it by default and letting users
  opt in via the language toggle is the more conservative choice — the
  recommended default, absent a specific reason to do otherwise).
- Add the language to `options/options.js`'s `LANG_META` (native name,
  English name).
- Add the language's ISO code to any locale-independent validation lists
  (e.g. `plans/011-per-pattern-toggle.md`'s language-code validation, if
  that plan has landed).
- **Do not** add new `_locales/<lang>/messages.json` files as part of this
  — this repo's UI locales (`en`, `es`) are independent of detection
  languages (see `README.md`: 5 detection languages, 2 UI locales). Adding
  a new detection language doesn't require translating the extension's own
  UI into that language; that would be a separate, much larger effort with
  its own process.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0 |
| Packaged extension e2e | `npm run test:package` | exit 0 |
| Pattern validation (throwaway) | `node -e "..."` per Phase 2 | zero false negatives/positives against the Phase 1 corpus |

## Scope

**In scope**: `shared/pattern-data.js` (or `content.js`/`options/options.js`
directly if `plans/004` hasn't landed), the language-code validation list
mentioned in Phase 3.

**Out of scope**: `_locales/*/messages.json` (see Phase 3's note); any
change to the detection *architecture* (this plan only adds data, following
the existing pattern shape exactly).

## Git workflow

- Branch: `advisor/012-<language-code>-detection` (e.g. `advisor/012-it-detection`)
- Commit message style: `feat(detection): add <Language> engagement-bait patterns`
  — the commit message should note how Phase 2's review/validation was
  satisfied (who reviewed it, or what corpus was used and the pass rate),
  since that's the load-bearing evidence a future maintainer needs to trust
  the pattern set without re-deriving it.
- Do NOT push or open a PR unless the operator instructed it.

## Test plan

- The Phase 1/2 corpus becomes the regression test: add it as a permanent
  fixture (e.g. `tests/unit/pattern-data.test.js` if `plans/005-unit-test-coverage.md`
  has landed — extend that file's coverage with the new language's positive/negative
  examples; otherwise note the corpus in the commit message so a future
  `plans/005` execution can pick it up).
- `npm run test:extension` regression check (unaffected by an additive
  language, but confirms nothing else broke).

## Done criteria

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0
- [ ] `npm run test:package` exits 0
- [ ] Phase 2's review/validation is documented (reviewer name/role, or
      corpus size and pass rate) in the commit message — this is a
      required artifact, not optional documentation
- [ ] The new language's patterns pass 100% of the Phase 1 positive
      examples and produce zero matches on the Phase 1 negative examples
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Phase 2's review/validation cannot be obtained — stop and report; do not
  merge an unvalidated pattern set regardless of time pressure.
- The drafted patterns produce any false positive against the Phase 1
  negative-example corpus — narrow the pattern, don't ship it as-is with a
  known false positive "for now."
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt.

## Maintenance notes

- Future language additions should follow this same three-phase process —
  update this plan file itself (or copy it as a new numbered plan) rather
  than skipping straight to Phase 3 for the next language, even once the
  mechanical integration part feels routine. The review/validation
  discipline in Phase 2 is the part most likely to be skipped under time
  pressure and is also the part that actually protects users from a
  silently broken or over-broad detection language.
- A reviewer should scrutinize: the negative-example pass rate specifically
  (zero false positives is the bar, not "mostly zero") — a false positive
  in production means a real user's legitimate post gets silently hidden,
  which is a worse failure mode than a missed spam post (false negative
  just means business-as-usual, the post was going to be visible anyway
  before this extension existed).
