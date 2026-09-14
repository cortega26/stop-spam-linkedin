# Plan 071 — Real Suggested-label donation + sanitization protocol

Research-only protocol. Nothing under `plans/research/071/` ships: the
packaging script (`scripts/package-extension.js`) uses a fixed file list
that excludes `plans/` by design. This file governs what may enter
`plans/research/071/cases-real.json` and how the plan-071 verdict is
reached. It modifies no production file, no 068 file, and no 070 file.

## 0. Vocabulary (adopted verbatim from plan 070)

DOM fixtures use plan 070's provenance / verification definitions, quoted
from their sources (Step 1 reconciliation):

- Provenance enum — `plans/research/067/evaluate.cjs:43-46` (via
  `plans/research/070/curate.cjs:40`):
  `provenance ∈ {synthetic, regression, user-contributed, public-excerpt}`.
- Holdout-grade provenance — `plans/research/070/policy.md:47-50`:
  "`provenance` must be `user-contributed` (filed through the missed-spam
  template) or `public-excerpt` (published source with attribution in
  `sourceRef`). Never `synthetic`, never `regression` — those stay in
  the development split in `plans/research/067/corpus.json`."
- Verification — `plans/research/070/policy.md:37-46`: "Verification means
  at least one of: (a) reporter confirmation — the reporter confirms on
  the issue that the quoted wording is the bait they saw and that the
  trimmed `text` still captures it; (b) maintainer reproduction — a
  maintainer reproduces the current-matcher outcome on the exact quoted
  wording with default settings and records the outcome in `verdict.json`
  as an observation; (c) two-reviewer agreement — two reviewers
  independently label the entry `spam` / `legitimate` / `ambiguous` on the
  issue and agree."
- Source reference — `plans/research/070/policy.md:51-54`: "`sourceRef`
  is required and must name the issue URL ... or, for public excerpts, the
  publication attribution (title + URL or bibliographic reference). A bare
  page type ("Feed") is not a source."

DOM mapping for this plan:

- `provenance: "user-contributed"` means donated by a contributor from
  their own logged-in feed, captured manually per §1 below. No other
  provenance value is admitted to `cases-real.json`.
- `sourceRef` names the capture context without personal data, e.g.
  `"contributor capture, 2026-09, en UI locale; sanitized per
  protocol.md §2"`. No names, no profile URLs, no account identifiers.
- `validationStatus` extends 068's values with one new value documented
  here and nowhere else: `"real-donated"` — the contributor confirms (§(a)
  analogue) that the committed markup preserves the structure of the
  header they saw, and the maintainer confirms the sanitization of §2 was
  applied before commit. Do not retrofit this value into 068's files;
  068's ten entries stay `"synthetic-validated"`.

## 1. How a real capture is made

1. The contributor, in their own logged-in browser, opens their own feed
   and finds a post carrying a "Suggested" (or locale-equivalent, per §4)
   header.
2. In devtools they select the header-metadata element (the actor
   sub-description carrying the label) and copy the *outerHTML of that
   element plus its post container only* — the smallest subtree that still
   contains the post root the selectors key on. Nothing above the post
   container is copied.
3. Manual copy-paste only. Scripts, extensions, scrapers, and bulk
   extraction are forbidden (see the forbidden list below).
4. One capture per entry. Each entry records its capture context in
   `sourceRef` and its sanitization in `sanitization` (one line each).

## 2. Sanitization (mandatory, before commit)

Applied to the copied subtree before it is committed, with the entry's
`sanitization` field recording what was done in one line:

1. Replace all human text — display names, headlines, post bodies,
   comment text, reaction/comment/repost counts, timestamps, image
   alt/src/srcset values — with inert placeholders (`Someone`,
   `A calm professional note…`, `1`, `2d`). Structure is the signal;
   wording is not retained.
2. Keep element names, class attributes, and nesting exactly as captured.
   Do not normalize, prettify, or "fix" the markup: a capture that
   contradicts a production selector (§5) is evidence, not a typo.
3. Drop `id` attributes (except the research `data-case` marker added at
   commit time), tracking parameters, `data-urn` payloads, and profile /
   company slugs. `urn:li` values are replaced with sentinels of the
   shape `urn:li:activity:71XX` (distinct `XX` per entry) — the only URN
   shape the selectors key on. No real URN survives.
4. Verify before commit: re-read the entry and confirm no real name, no
   real post sentence, and no real URN remains. The committer states the
   exact grep used for this check in the commit message or verdict.

## 3. Minimum set for a proceed verdict

A `proceed` verdict requires ALL of the following as `real-donated`
entries in `cases-real.json`:

- ≥ 3 real positive headers in feed context (Suggested label in
  recognized post-header metadata, `expectedTarget` set);
- ≥ 2 real negatives: one body-mention of Suggested/suggested in real
  markup (`expectedTarget: null`), and one non-English label obtained by
  the contributor switching their LinkedIn UI locale (a documented
  attempt counts as diligence even on failure — an unobtainable negative
  is recorded, never fabricated);
- ≥ 1 layout variant that differs from the 068 synthetic shapes
  (profile-adjacent container, repost with real nesting, or
  sponsored-with-separator header).

Fewer than this → the verdict is `insufficient-data`, honestly. Minimums
are never lowered to force a build.

## 4. Locale-label method

Labels are established ONLY by contributor capture under that UI locale
(e.g. an es-UI capture showing whatever string LinkedIn actually renders
— captured, never guessed). Guessed translations are forbidden: the
candidate detector states the rule at
`plans/research/068/detector.cjs:29-31` ("English-only candidate labels.
No translations are guessed: any other metadata locale fails open"), and
this plan restates it. A non-English entry is admitted only with
`metadataLocale` set to the contributor's UI locale and a `sourceRef`
naming that locale.

## 5. What a capture that contradicts production selectors produces

A real capture whose structure disagrees with a production selector
(e.g. a header-metadata class outside
`HEADER_META_SELECTORS`, a comment-item class outside
`shared/post-container.js` `COMMENT_SELECTORS`) produces a finding in
`verdict.json` under `selectorObservations[]` — never a source edit here.
`shared/post-container.js`, `content.js`, and `detector.cjs` stay
read-only; selector corrections and any production integration belong to
a future build plan gated on this plan's proceed verdict.

## Forbidden

The following are forbidden in this plan, without exception: scraping, bulk extraction, guessed translations, real post text, live accounts.
Concretely: no automated fetching of linkedin.com, no test accounts, no
credentials, no automation scripts run against LinkedIn, no retaining of
real post wording in any committed file, and no restyled synthetic
markup presented as a real capture — fabricated provenance poisons the
very gate this plan serves. An unobtainable capture class is recorded as
an attempt in `verdict.json`, and the verdict follows §3.
