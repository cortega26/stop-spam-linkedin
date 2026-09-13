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
