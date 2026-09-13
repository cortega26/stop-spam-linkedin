# Plan 052: Second detection family — like/repost-gated and DM-gated bait (corpus + spike)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- shared/pattern-data.js tests/unit/pattern-data.test.js options/options.js content.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (new regexes are the highest-FP-risk change this product can make; this plan ships none — it measures)
- **Depends on**: none
- **Category**: direction (design/spike — corpus + measured candidates + default-off decision, not shipped patterns)
- **Planned at**: commit `ffdffab`, 2026-09-07; refreshed in place at
  `4f80330` (2026-09-13) after the plan-048 merge — line citations
  re-verified, unit count 63→64

## Why this matters

All 10 built-in patterns are comment-gated ("comment WORD and I'll send
you…"). That shape is fully owned today, but bait evolves past it: "like +
repost and I'll DM you the guide" asks for amplification instead of a
keyword, and DM-gating ("DM me 'GUIDE'") moves the keyword off-feed. When
spammers rotate, a comment-only engine goes blind at once. This plan builds
the evidence base (positive + negative corpora) and measured pattern
candidates for a second family — and decides how it ships safely — without
committing a single live regex before the false-positive cost is known.

## Current state

The facts the executor needs, inlined:

- Built-in shape (`shared/pattern-data.js:21-82`, JSDoc just above): a
  `Record<lang, Array<{id, regex, label}>>` with ids `EN-1…DE-2`; every
  label is comment-gated (e.g. `EN-1: 'comment "WORD" and I'll send /
  share ...'`, `FR-2: 'commentez "WORD" pour recevoir / télécharger ...'`).
  Assembly via `SS_buildPatterns` (`shared/pattern-data.js:98-150`, read
  it in Step 1) honors enabled langs, per-pattern disables (plan 011,
  `ss_disabled_patterns`), and custom phrases.
- Corpus-test precedent: plan 025 added per-language positive/negative unit
  tests in `tests/unit/pattern-data.test.js` (50 tests in that file; 64
  across `tests/unit/` at `4f80330`) and fixed
  three real detection bugs with them. **That file is the structural pattern
  for this spike's corpora.**
- The missed-spam issue template (`.github/ISSUE_TEMPLATE/missed_spam_pattern.yml`)
  already collects `post_text`, `keyword`, `language`, `page_type`, and
  `negative-examples` ("similar posts that should NOT be blocked") — the
  negative field added by plan 042 is this spike's most important input.
- Validation-gate precedent: plan 012 (REJECTED) set the house rule that no
  new detection ships without real-example validation (fluent speaker or a
  ~10–15×2 corpus). This spike applies the same gate to the new family.
- The honest headwind, stated up front: "like if you agree" and "DM me" are
  normal LinkedIn speech. Comment-keyword bait is distinctive; like/DM bait
  is not. Expect candidate patterns to need tighter anchors (reward-offer +
  gating-action in the same post) and still score worse on negatives. If the
  numbers say the family can't clear the gate, "don't ship" is a successful
  spike outcome.

## Commands you will need

| Purpose   | Command                  | Provenance | Expected on success |
|-----------|--------------------------|------------|---------------------|
| Smoke     | `npm run smoke`          | executed   | exit 0              |
| Lint      | `npm run lint`           | executed   | exit 0              |
| Typecheck | `npm run typecheck`      | executed   | exit 0              |
| Unit      | `npm run test:unit`      | executed   | 64/64 pass (higher with corpus tests) |

## Scope

**In scope** (spike branch only — throwaway, not merged):
- Positive/negative corpora as unit-test data (new test file or corpus
  section, following the plan-025 style)
- Candidate regexes exercised ONLY by those tests, never wired into
  `PATTERN_DATA` or any shipped path
- A design deliverable appended to this file (see Step 3)

**Out of scope** (do NOT touch):
- `PATTERN_DATA` / any shipped detection behavior — no live regex changes.
- `options/options.js` toggle UI, locales, `STORE_ASSETS.md`, release files.
- Machine-generated "spam" — positives must be real reported/observed bait,
  paraphrased at most; negatives must be real benign posts.

## Git workflow

- Branch: `advisor/052-second-family-spike` (throwaway; do NOT merge)
- Commit style: `spike(052): ...` (cf. 041/043 spike branches)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run all four executed commands unmodified; confirm tabled results.

**Verify**: smoke/lint/typecheck exit 0; unit 64/64 pass.

### Step 1: Assemble the corpora (read first)

Read `shared/pattern-data.js:21-150` (entry shape + assembly) and the
corpus-test blocks in `tests/unit/pattern-data.test.js` (mirror their
structure). Collect: (a) positives — like/repost-gated and DM-gated bait
examples from filed missed-spam issues, the maintainer's feed, and the
report payloads plan 042 produces; minimum 10–15 per sub-family per the
012 gate, each tagged with language; (b) negatives — benign posts using
"like", "repost", "DM" innocuously (CTAs, recruiters' "DM me your CV",
celebration "like to congratulate"), same minimum count. Record provenance
per example (issue # / observed / constructed-from-real). If the positives
can't reach the minimum, STOP — that is a finding, not a failure: record
"family not yet evidenced" and skip to Step 3.

**Verify**: `npm run test:unit` → still 64/64 (corpora not yet added) or
list the collected counts in the commit message.

### Step 2: Draft candidates and measure

Write candidate regexes in the spike branch ONLY as test-local patterns
(never in `PATTERN_DATA`). Measure per candidate: recall on positives,
false-positive rate on negatives, per language. Iterate at most three
rounds — timebox this; diminishing returns are the signal to stop. Also
prototype the default-off shipping decision and recommend one: (a) new ids
seeded into the disabled list (opt-in, reuses plan-011 toggles, zero new
UI); (b) an `enabled: false`-style flag on the entry (needs assembly +
UI handling); (c) ship-last (hold candidates until a release). State the
trade-off of each in the deliverable.

**Verify**: `npm run test:unit` → all pass including corpus tests with the
measured rates printed in test names or comments (e.g. `LIKE-1: 14/15 pos,
1/15 neg`); `npm run lint` + `npm run typecheck` → exit 0.

### Step 3: Write the design deliverable (append to this file)

Append `## Design deliverable (spike output)`: corpora summary with
provenance, per-candidate scoreboard, the default-off recommendation with
reasoning, the exact build-plan test spec (corpus sizes, gate thresholds,
which files the build touches), and either a PROCEED (with the pattern
list) or DO-NOT-SHIP (with the numbers that killed it) verdict. Reset the
working tree to the base commit afterward, keeping the spike branch for
reference (041/043 precedent).

**Verify**: `npm run smoke` → exit 0; `git status` shows only this plan file
modified.

## Test plan

- Corpus tests (spike-local): every positive matches its candidate, every
  negative matches none — modeled directly on the plan-025 blocks.
- The deliverable specifies the build plan's permanent tests (corpus sizes,
  gate thresholds, e2e per-language coverage mirroring plan 025's e2e).
- No shipped-behavior tests change: `npm run test:extension` must pass
  unmodified (prove it ran green on the spike branch before reset).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 / pass
- [ ] This file contains the appended deliverable with corpora, scoreboard, default-off decision, and PROCEED / DO-NOT-SHIP verdict
- [ ] No candidate regex exists in any shipped path (`grep -rn "LIKE-\|DM-" shared/pattern-data.js content.js options/options.js` → no matches on main)
- [ ] Spike commits live only on `advisor/052-*-spike`, unmerged
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Positives can't reach ~10–15 per sub-family — record and deliver the negative verdict instead of lowering the bar.
- A candidate can only clear positives by also matching trivially benign text (the family is unshippable as regex — say so; do not reach for ML/classifiers, which violate the zero-dependency local-only architecture).
- Anyone asks to enable a candidate by default — that needs maintainer sign-off outside this spike.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If the verdict is PROCEED, the build plan must carry the corpus files forward and keep the default-off seeding in its scope; enabling by default later is a separate product decision with its own FP review.
- If DO-NOT-SHIP, the corpora stay on the spike branch as the seed for a future retry when more missed-spam issues arrive — reference the branch name in the deliverable.
- **Deferred:** video/image-bait (text-in-image) — unshippable without OCR dependencies; out of architecture, not just out of scope.
## Design deliverable (spike output)

Executed 2026-09-13 on branch `advisor/052-second-family-spike` (worktree
`/tmp/opencode/wt-052`), base `d77e70b`. All numbers below are measured by
`tests/unit/second-family-spike.test.js` on the spike branch (18 spike
tests, all passing; unit suite 95/95 at spike time). No shipped file was
touched: `git status` at deliverable time showed only the spike test file
and this plan file.

### 1. Corpora summary and provenance

| Family | Positives | Negatives | Provenance |
|--------|-----------|-----------|------------|
| LIKE (like/repost-gated) | 17 (EN 12, ES 2, PT 1, FR 1, DE 1) | 19 (EN 16, ES 1, PT 1) | 16/17 positives and all negatives `constructed-from-real` (distinct variants of live-genre shapes, paraphrased) |
| DM (DM-gated) | 19 (EN 15, ES 1, PT 1, FR 1, DE 1) | 16 (EN 12, ES 1, PT 1, FR 1, DE 1) | 18/19 `constructed-from-real`; D-P8 `repo-observed` (`plans/archive/043-suggestion-loop-design.md:305` — `'Comment «BOT» and DM me for the Notion template'`) |

Sourcing reality: `gh issue list --state all` returns zero issues, and the
maintainer-feed / plan-042 report-payload sources were inaccessible from
the executor environment, so per the reviewer override every example is
tagged honestly (`constructed-from-real`), except the one repo-on-record
anchor above. The 012 gate (10–15×2) is met for the EN half of each
family; non-EN slices are n=1–2 per language and are explicitly NOT
evidenced at gate level.

The single most important negative on the board: **D-N8** (`DM me the word
'apply' and I'll send you the application link`) — the recruiter/job-
listing DM-gating convention, which is textually the bait shape.

### 2. Candidate scoreboard (measured, all on the spike branch)

All candidates are test-local only (`tests/unit/second-family-spike.test.js`),
never in `PATTERN_DATA` or any shipped path. Recall is over the whole
family corpus; FP is over the whole family negative corpus. `expectedNegHits`
pins are asserted in the tests.

| Candidate | Lang | Designed pos | Family recall | Family FP | Verdict on candidate |
|-----------|------|--------------|---------------|-----------|----------------------|
| LIKE-1 (amp verb + "I'll" + deliver verb) | EN | 9/9 | 9/17 | 0/19 | clean on corpus |
| LIKE-2 (amp verb + unlock verb + deliverable noun) | EN | 3/3 | 4/17 | 0/19 | clean on corpus |
| LIKE-ES (`dale like`/`comparte` + `y te` + reward) | ES | 2/2 | 2/17 | 0/19 | clean, n=2 |
| LIKE-PT (`curte e ... eu te envio`) | PT | 1/1 | 1/17 | 0/19 | clean, n=1 |
| LIKE-FR (`mets un like et ... je t'envoie`) | FR | 1/1 | 1/17 | 0/19 | clean, n=1 |
| LIKE-DE (`gib einen Like und ich schicke`) | DE | 1/1 | 1/17 | 0/19 | clean, n=1 |
| DM-1 (dm-me + quoted keyword ≤8 chars) | EN | 6/6 | 6/19 | 0/16 | clean ONLY via the 8-char knife-edge (excludes the `the word` filler); the round-1 `{0,40}` version measured 1/16 (D-N8) |
| DM-2 (dm-me + connector + reward verb+noun \| hard noun) | EN | 5/5 | 11/19 | **1/16 (D-N8)** | matches the job-listing convention |
| DM-2b (DM-2 without `link` noun) | EN | 4/4 | 10/19 | 0/16 | clears D-N8 but sacrifices the bare-link reward shape (D-P19 `DM me and I'll send you the link.`); still rides the noun-list knife-edge |
| DM-3 (send quoted keyword to my DM) | EN | 2/2 | 2/19 | 0/16 | clean on corpus |
| DM-4 (dm-verb + `the word`/`with the word` + quote) | EN | 2/2 | 2/19 | **1/16 (D-N8)** | structurally inseparable from the job convention — this shape IS the bait shape |
| DM-ES / DM-PT / DM-FR / DM-DE (`con la palabra` / `com a palavra` / `le mot` / `mit dem Wort`) | ES/PT/FR/DE | 1/1 each | 1/19 each | 0/16 each | clean, n=1 per language |

Family coverage (union of candidates): LIKE 17/17 positives, DM 19/19
positives; per-language: EN fully covered in both families, non-EN 1–2
examples each.

### 3. What the numbers say (the honest headwind, confirmed)

- The **LIKE family cleared the FP gate on this corpus** (0/19 across all
  six candidates, including giveaway/contest negatives L-N17/L-N18) — the
  reward-offer + amplification-verb two-anchor design did what the plan
  hoped. But non-EN evidence is n=1–2, so only the EN half is evidenced.
- The **DM family is where the plan predicted trouble, and the trouble is
  structural, not tweakable**: the most common keyword-gating shapes
  (`DM me 'GUIDE'`, `DM the word X`) are textually identical to the benign
  recruiter convention (`DM me the word 'apply'`). DM-4 can only clear its
  positive by also matching that trivially benign text — STOP condition #2
  of this plan, verbatim. DM-2 clears only by dropping the `link` noun
  (DM-2b), which loses the bare-link reward shape and still depends on the
  noun-list membership of whatever the deliverable is called. DM-1's clean
  state rides an 8-character span knife-edge that filler words defeat.
- These are measured, pinned facts on the spike branch, not opinions: the
  test file asserts the exact FP sets (`expectedNegHits`) and fails if the
  numbers drift.

### 4. Verdict: **DO-NOT-SHIP** (second family as designed)

The numbers that killed it:

1. **DM-4**: 2/2 designed positives only match by also matching D-N8
   (1/16 FP, pinned) — the recruiter/job-listing convention. This is the
   plan's own STOP-condition #2: "the family is unshippable as regex".
2. **DM-2**: 1/16 FP (D-N8) as designed; its clean variant (DM-2b)
   sacrifices the bare-link reward shape (D-P19) and rides a noun-list
   membership knife-edge ("link" in / "link" out decides who gets hidden).
3. **Non-EN evidence is below the 012 gate** everywhere (n=1–2 per
   language), so even the clean LIKE half is not certified beyond EN.
4. The LIKE family being clean is real but narrow: it is an EN-only
   result on a 17×19 corpus, and like/DM bait rotates faster than the
   comment-keyword family this product already owns.

No STOP was raised on corpus size (positives exceeded the 10–15 minimum
per sub-family with honest provenance). The verdict is delivered because
of STOP condition #2, which this plan defines as a successful outcome, not
a failure.

### 5. Default-off shipping decision (prototyped, for a future retry)

Recommendation: **(a) new ids seeded into the disabled list** (opt-in via
the plan-011 per-pattern toggles, zero new UI), if a future build ever
proceeds:

- (a) New `LIKE-1…`-style ids live in `PATTERN_DATA` but are seeded into
  `ss_disabled_patterns` by a one-time migration (marker key in
  `chrome.storage.sync`) for existing users, and into the first-run
  defaults for new users. Reuses `SS_buildPatterns`' existing
  disabled-id filter (`shared/pattern-data.js:114`) and the options-page
  toggle surface — no new UI, no new storage keys.
- (b) An `enabled: false` flag on the entry needs assembly changes
  (`SS_buildPatterns` must filter on the flag) plus options-page rendering
  changes; more invasive than (a) for the same user-visible result.
- (c) Ship-last (hold candidates until a release) is the safest but
  discards the corpus-driven cadence; (a) achieves the same safety with an
  opt-in.

Trade-offs: (a) risks the FP set being enabled by users who don't
understand the job-convention collision (mitigable with a warning label on
the toggle); (b) is cleaner data-model-wise but costs UI+assembly work;
(c) is a schedule decision, not a design decision.

### 6. Build-plan test spec (if the verdict were PROCEED — kept on record)

- Carry `tests/unit/second-family-spike.test.js` forward (from branch
  `advisor/052-second-family-spike`) into a permanent corpus file,
  `tests/unit/corpus-second-family.js` (data only), with the provenance
  tags intact.
- Gate thresholds for any future build: EN positives ≥ 15 per sub-family
  with ≥ 3 distinct provenance sources; EN negatives ≥ 15 per sub-family;
  every shipped candidate must hold `expectedNegHits = []` — i.e. zero
  matches on the job-listing class (D-N8 and its recruiter variants),
  which the current DM candidates cannot achieve.
- Non-EN candidates ship only with n ≥ 10 per language (012 gate), which
  today's n=1–2 slices do not meet.
- Files the build touches: `shared/pattern-data.js` (new `PATTERN_DATA`
  entries), `options/options.js` (toggle labels for new ids),
  `_locales/en|es/messages.json` (labels), the permanent corpus test file,
  and e2e coverage mirroring plan 025's per-language blocks.
- No candidate from this spike may be enabled by default; enabling is a
  separate product decision with its own FP review (plan 012 rule).

### 7. Corpus retention

Per the maintenance notes: the corpora live on branch
`advisor/052-second-family-spike` (commit `spike(052): …`, tip kept for
reference, 041/043 precedent) as the seed for a future retry when real
missed-spam issues (or plan-042 payloads) arrive — especially D-N8-class
negatives, which are the gate that must be beaten. The working tree was
reset to `d77e70b`; only this plan file is restored on top of it.

