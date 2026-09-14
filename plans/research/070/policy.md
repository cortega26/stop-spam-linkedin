# Plan 070 — Holdout corpus curation policy

Research prototype policy. Nothing under `plans/research/070/` ships; the
packaging script (`scripts/package-extension.js`) uses a fixed file list
that excludes `plans/` by design. This policy constrains what may enter
`plans/research/070/holdout-seed.json` and how candidates are checked by
`plans/research/070/curate.cjs`. It does not modify the plan-067 corpus
(`plans/research/067/corpus.json` — read-only reference), the plan-067
evaluator (`plans/research/067/evaluate.cjs` — read-only reference), any
production file, the report flow (`content.js` / `background.js`
handlers), or the issue template
(`.github/ISSUE_TEMPLATE/missed_spam_pattern.yml`).

## 0. Issue-field → corpus-field mapping (normative)

Reports arrive as GitHub issues filed through
`.github/ISSUE_TEMPLATE/missed_spam_pattern.yml` (destination constant
`REPORT_ISSUE_URL` in `background.js:16` and `content.js:26`; dispatch in
`background.js:108-126`; payload builder `handleReportMissedSpam` in
`content.js:1404-1460`). The curator maps the five template fields to
corpus entry fields as follows:

| Template field (`missed_spam_pattern.yml`) | Corpus entry field | Rule |
|---|---|---|
| `post_text` (required textarea) | `text` | Trim; keep only the relevant spam wording per the template header ("Please include only the relevant spam wording, not private account details."); cap at the report excerpt length (`content.js:27` `REPORT_EXCERPT_MAX`, 600 chars). |
| `language` (input) | `language` | Normalize to the corpus enum (`EN`, `ES`, `FR`, `PT`, `DE` — see `evaluate.cjs:43-46` via the schema in `curate.cjs`). Unrecognized or blank language → curator asks the reporter or records the entry's language only after fluent confirmation (see §4). |
| `page_type` (input) | `sourceRef` (part) | `sourceRef` must name the issue URL; append the reported page type as context, e.g. `https://github.com/.../issues/123 (Feed)`. |
| `negative-examples` (optional textarea) | `legitimate` entries | Each usable negative example becomes its own `expected: legitimate` entry paired with the spam family (see §3). |
| `keyword` (input) | annotation only | Recorded in `expectedReason` as context (e.g. "reporter keyword: GUIDE"). It is never copied into `text` and never treated as a verdict. |

## 1. Admission bar for `split: holdout`

Constrains: `holdout-seed.json` entries; checked by `curate.cjs`
(`--check` enforces the schema subset below, mirroring the enum values in
`evaluate.cjs:43-46`).

- `labelStatus` must be `verified`. Verification means at least one of:
  (a) reporter confirmation — the reporter confirms on the issue that the
  quoted wording is the bait they saw and that the trimmed `text` still
  captures it; (b) maintainer reproduction — a maintainer reproduces the
  current-matcher outcome on the exact quoted wording with default
  settings and records the outcome in `verdict.json` as an observation;
  (c) two-reviewer agreement — two reviewers independently label the
  entry `spam` / `legitimate` / `ambiguous` on the issue and agree.
  Anything short of one of these stays `unverified` and stays out of
  holdout.
- `provenance` must be `user-contributed` (filed through the missed-spam
  template) or `public-excerpt` (published source with attribution in
  `sourceRef`). Never `synthetic`, never `regression` — those stay in
  the development split in `plans/research/067/corpus.json`.
- `sourceRef` is required and must name the issue URL
  (`https://github.com/cortega26/stop-spam-linkedin/issues/<n>`) or, for
  public excerpts, the publication attribution (title + URL or
  bibliographic reference). A bare page type ("Feed") is not a source.
- `text` must be non-empty after trimming. `id` must be unique against
  BOTH `plans/research/067/corpus.json` and `holdout-seed.json` (checked
  by `curate.cjs`, same as the evaluator's id expectations).

## 2. Leakage rule

Constrains: split assignment in `holdout-seed.json`; checked by
`curate.cjs` against both corpus files.

The plan-067 evaluator folds near-identical wording to one key and keeps
variants of one source in the same split (`evaluate.cjs:48-52`):

```js
function normalizeText(text) {
  return String(text).toLowerCase().replace(/\s+/g, " ").trim();
}
```

This policy mirrors those semantics exactly: a holdout candidate whose
`normalizeText` folding collides with ANY entry in
`plans/research/067/corpus.json` (all `split: development`) or in
`holdout-seed.json` is rejected — either it belongs in the same split as
its near-duplicate (leakage guard: variants of one source share one
split) or it is a true duplicate. The `curate.cjs` copy of the folding
is intentionally small and carries a pointer comment to
`evaluate.cjs:48-52`, exactly as `background.js` keeps its own
`t`/`uid`/`estimatePhraseBytes` copies with the service worker
untouched. Same wording under different `settings` is the 067 precedence
matrix (e.g. `en-builtin-01`/`en-custom-01`/`en-excluded-01`), not
leakage — such `settings` variants are development-set material and do
not belong in holdout.

## 3. Legitimate-side requirement

Constrains: `holdout-seed.json` spam-family admissions; source field is
the issue template's `negative-examples` textarea
(`missed_spam_pattern.yml:33-37`).

Every spam-family admission should be paired with negative examples from
the issue's `negative-examples` field where the reporter provided them —
that optional field exists precisely to prevent over-matching, and an
unpaired spam entry teaches the gate only one side. Each usable negative
example becomes its own `expected: legitimate` entry (same `provenance`,
same issue-URL `sourceRef`, own id). When the reporter provided no
negatives, or a candidate negative is debatable even for a human
(recruiter overlap of the `amb-01` kind documented in
`plans/research/067/design.md` §4), record `expected: ambiguous` — the
evaluator supports the value (`evaluate.cjs:43`) and guessing
`legitimate` does not improve it. Ambiguous entries never enter accuracy
tallies (067 metric rules, `design.md` §2).

## 4. Minimization and non-EN handling

Constrains: `text` content of every `holdout-seed.json` entry; privacy
contract in `README.md` + `PRIVACY_POLICY.md` (no network requests, no
scraping of LinkedIn, no content history retention).

- Trim to the relevant wording per the template instruction
  (`missed_spam_pattern.yml:9`); strip names, employers, contact
  details, and any private account details before drafting the entry.
  Corpus sources are only (a) user-filed GitHub issues (consent by
  filing, and the template already instructs minimization) and (b)
  public excerpts with a recorded `sourceRef` attribution. Never
  automate collection from linkedin.com.
- Non-EN entries stay attribution-only until they pass the plan-012
  validation gate (fluent speaker review or the 10–15×2 real-example
  corpus): record any non-EN entry lacking that review as
  `labelStatus: unverified` regardless of source, and do not admit it
  to `split: holdout` until the gate is met. An `unverified` entry is
  never holdout material (see §1).

## 5. Promotion rule

Constrains: any future proposal to add built-in patterns or make public
accuracy comparisons; quotes (not modifies) the plan-067 quality gate
(`plans/research/067/verdict.json` `qualityGate.promotionRule`):

> "new built-in patterns require representative, independently labeled
> holdout entries (labelStatus=verified, split=holdout) plus the existing
> fluent-review/corpus gate before any public accuracy comparison"

Restated for this pipeline: `holdout-seed.json` is the staging area, not
the gate itself. Merging the seed into the 067 corpus and re-recording
`plans/research/067/baseline.json` is deferred maintainer work requiring
reviewer sign-off — nothing in this plan changes the baseline ("Do not
edit to fit: re-record deliberately after corpus or detector changes,
with reviewer sign-off," `baseline.json` contract). The 067 `--check`
gate (`evaluate.cjs --check` schema, arithmetic, dedupe/split invariants,
recorded baseline) must stay green before and after any curation step.
