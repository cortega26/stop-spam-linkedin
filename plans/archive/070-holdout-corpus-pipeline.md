# Plan 070: Build the representative holdout corpus pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3aef7b9..HEAD -- plans/research/067/ .github/ISSUE_TEMPLATE/missed_spam_pattern.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `3aef7b9`, 2026-09-14

## Why this matters

Plan 067 built the measurement contract (corpus + evaluator + `--check`
gate) but closed with an `insufficient-data` verdict: all 60 entries are
`split: development`, the holdout split is empty, and "no public comparison
or precision claim is supported." Every future detection decision — the 052
retry, the 068 proceed verdict, non-EN expansion below the plan-012 gate,
the EN-only LIKE family — is blocked on representative, independently
labeled holdout data that does not exist yet. This plan builds the pipeline
that produces it: a curation policy, a small curation tool, and the gate
wiring. It fills the first holdout entries only from reports that already
exist; growing the corpus afterwards is ongoing maintainer work, not part
of this plan's done criteria.

## Current state

The facts the executor needs, inlined:

- **Corpus + evaluator live in research, never ship.**
  `plans/research/067/corpus.json` (60 entries), `evaluate.cjs` (437
  lines), `baseline.json`, `browser-probe.cjs`. The packaging script uses a
  fixed file list (`scripts/package-extension.js`), so anything under
  `plans/` is excluded from the zip by design. New tooling for this plan
  goes in `plans/research/070/` (fresh directory — do not touch 067's
  files except to *read* them).
- **Corpus entry schema** (`plans/research/067/corpus.json:1-55`):
  ```json
  {
    "id": "en-builtin-01",
    "language": "EN",
    "text": "Comment \"CLAUDE\" and I'll send you the complete checklist, template, and workflow for free today.",
    "expected": "spam",
    "provenance": "regression",
    "sourceRef": "tests/helpers.js:22-25 (mockLinkedInFeed spam-1); tests/extension-smoke.js:222",
    "labelStatus": "verified",
    "split": "development"
  }
  ```
  Optional keys seen on other entries: `settings` (`customPhrases` /
  `allowPhrases` / `excludedTexts` / `disabledPatterns` / `langs`) and
  `expectedReason`. Allowed enum values are enforced by the evaluator
  (`plans/research/067/evaluate.cjs:43-46`):
  `expected ∈ {spam, legitimate, ambiguous}`,
  `provenance ∈ {synthetic, regression, user-contributed, public-excerpt}`,
  `labelStatus ∈ {verified, unverified}`,
  `split ∈ {development, holdout}`.
- **Evaluator contract** (`plans/research/067/evaluate.cjs:12-23`):
  `--json` (metrics + misclassified IDs), `--check` (schema, arithmetic,
  dedupe/split invariants, recorded baseline), `--compare <result.json>`.
  "Production regexes must NOT be changed to make the report green."
  Dedupe/leakage guard: near-identical wording collapses to one key and
  variants of one source must stay in the same split
  (`evaluate.cjs:48-52`, `normalizeText`). Classification mirrors
  `content.js` `findMatch` precedence: exclusion → allow-phrase → first
  match (`evaluate.cjs:76-77`; production at `content.js:589-598`).
- **Baseline pinning** (`plans/research/067/baseline.json`): records
  `corpusSha256`, `evaluatorSha256`, `expectedMisclassified` (currently the
  4 unverified synthetic probes `en-syn-01, en-syn-02, fr-syn-01,
  pt-syn-01`), `recordedAt`, `recordCommand`. "Do not edit to fit:
  re-record deliberately after corpus or detector changes, with reviewer
  sign-off."
- **Report funnel (the raw material).** Two entry points, both
  user-initiated, clipboard + pre-filled issue, nothing sent automatically:
  - Placeholder "Report missed spam" → `content.js:566-574`
    (`reportMissedSpam` message case) → `handleReportMissedSpam`
    (`content.js:1391+`; comment block at 1391-1403 states the contract:
    selection-anchored excerpt capped at `REPORT_EXCERPT_MAX`, literal
    `"none"` language marker when no pattern matched, `{ok:false,
    reason:"no-destination"}` when both tab destinations fail, nothing
    saved, nothing submitted automatically).
  - Selection menu "Report missed spam" → `background.js:108-126`
    (LinkedIn-URL guard, dispatches `{ action: "reportMissedSpam",
    selectionText }` to the clicked tab only).
  - Destination form: `background.js:16` `REPORT_ISSUE_URL` (same constant
    in `content.js:26`) → `.github/ISSUE_TEMPLATE/missed_spam_pattern.yml`,
    which collects `post_text` (required), `keyword`, `language`,
    `page_type`, and `negative-examples` (optional, "10-15 examples of
    similar text that is NOT spam"). The template header says: "Please
    include only the relevant spam wording, not private account details."
- **067 verdict nextWork** (`plans/research/067/verdict.json`): "collect
  independently labeled holdout with provenance (user-contributed /
  public-excerpt), deduplicated and split-kept, before plan 068 shipping
  decisions" + "write Firefox probe equivalents" + "size the paraphrase
  gap (en-syn-01/02) against real prevalence." This plan covers the first
  item. Firefox probes and prevalence sizing are explicitly out of scope.
- **Repo conventions that apply here:**
  - Research prototypes are CommonJS (`require`, `node:assert/strict`)
    and read production helpers in place via `require()` — never copy
    whole modules (see `plans/research/068/detector.cjs:1-17` header as
    the exemplar).
  - Privacy contract (README + `PRIVACY_POLICY.md`): no network requests,
    no scraping of LinkedIn, no content history retention. Corpus sources
    are therefore: (a) user-filed GitHub issues (consent by filing, and
    the template already instructs minimization), (b) public excerpts with
    a recorded `sourceRef` attribution. Never automate collection from
    linkedin.com.
  - Conventional-ish commits, e.g. `feat(corpus): ...`, `docs(plans):
    ...` (see `git log --oneline`).

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Evaluator gate (067) | `node plans/research/067/evaluate.cjs --check` | declared | exit 0 |
| Evaluator metrics | `node plans/research/067/evaluate.cjs --json` | declared | exit 0, summary JSON |
| New curation tool tests | `node --test plans/research/070/*.test.cjs` | declared | all pass |
| Unit suite | `npm run test:unit` | declared | all pass (81 at `3aef7b9`; higher is fine, failures are not) |
| Smoke | `npm run smoke` | declared | exit 0 |
| Lint | `npm run lint` | declared | exit 0 |

Provenance `declared` means read from `package.json`/prior verdicts, not
run by the advisor. A `declared` command that fails on the unmodified
checkout is a broken baseline — see Step 0. (`test:unit` needs Node ≥ 24
for the glob form; check `node --version` first.)

## Scope

**In scope** (the only files you should modify/create):
- `plans/research/070/` (create): `policy.md`, `curate.cjs`,
  `curate.test.cjs`, `holdout-seed.json` (or equivalent names — keep the
  four-artifact shape), `verdict.json`
- `plans/README.md` (your status row only)

**Out of scope** (do NOT touch, even though they look related):
- `plans/research/067/*` — read-only reference. Do not add entries to
  067's `corpus.json`, do not touch its `baseline.json` or `evaluate.cjs`.
  (The 067 corpus is the development-set record; holdout lives in the new
  directory until a maintainer merges the sets.)
- `shared/pattern-data.js`, `content.js`, any production regex or matcher
  — the evaluator header forbids tuning production to fit the corpus.
- Any automation that fetches from linkedin.com, any new issue-template
  fields, any change to the 063 report flow (`content.js`/`background.js`
  handlers). The funnel already exists; this plan curates its output.
- Plan 068's `cases.json`/`detector.cjs` (DOM fixtures — owned by plan
  071). Text corpus only here.
- Firefox probe equivalents and paraphrase-prevalence sizing (067 nextWork
  items 2–3 — future plans, not this one).

## Git workflow

- Branch: `advisor/070-holdout-corpus`
- Commit per step or per logical unit; message style: conventional-ish,
  e.g. `feat(corpus): add holdout curation policy and tooling`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

On the unmodified checkout, run: `node
plans/research/067/evaluate.cjs --check`, `npm run smoke`, `npm run
lint`, `npm run test:unit`. Record the results.

**Verify**: `--check` exits 0; smoke/lint/unit all pass. If any `declared`
command does not exist or fails here, STOP and report (broken baseline,
not your regression).

### Step 1: Inventory the raw material

- Read `plans/research/067/design.md`, `plans/research/067/verdict.json`
  (qualityGate + missingEvidence), the archived plan
  `plans/archive/063-missed-spam-report-build.md` (report payload shape),
  and `content.js:1391-1470` (full `handleReportMissedSpam` + payload
  builder — read past line 1404 to the end of the function).
- List every GitHub issue in the repo labeled `missed spam` (read-only;
  `gh issue list --label "missed spam"` if `gh` exists, else note that the
  seed step is skipped for lack of material — do not fabricate entries).
- Write down the exact mapping: issue field → corpus entry field
  (`post_text` → `text`, `language` → `language`, `page_type` →
  `sourceRef`, `negative-examples` → `legitimate` entries,
  `keyword` → annotation only).

**Verify**: a mapping table exists in your working notes covering all five
template fields; `node plans/research/067/evaluate.cjs --json` still
exits 0 (you changed nothing yet).

### Step 2: Write the curation policy (`plans/research/070/policy.md`)

Short, normative document covering, at minimum:

1. **Admission bar for `split: holdout`**: `labelStatus` must be
   `verified` (what counts as verification: reporter confirmation,
   maintainer reproduction against the live matcher, or two-reviewer
   agreement — pick explicit rules); `provenance` must be
   `user-contributed` or `public-excerpt` (never `synthetic`, never
   `regression` — those stay in development); `sourceRef` must name the
   issue URL or publication attribution.
2. **Leakage rule**: near-duplicate variants of one source share one
   split (mirror the evaluator's `normalizeText` semantics — quote them,
   don't reinvent).
3. **Legitimate-side requirement**: every spam-family admission should be
   paired with negative examples from the issue's `negative-examples`
   field where the reporter provided them (this is the 042 field doing
   its job); record `ambiguous` (not `legitimate`) when unsure — the
   evaluator supports the value, guessing does not improve it.
4. **Minimization**: trim to the relevant wording per the template
   instruction; strip names, employers, contact details. Non-EN entries
   stay attribution-only until they pass the plan-012 validation gate
   (fluent speaker or 10–15×2 real-example corpus) — record them as
   `unverified` regardless of source.
5. **Promotion rule** (quote 067's, don't modify it): new built-in
   patterns require representative, independently labeled holdout entries
   plus the fluent-review/corpus gate before any public accuracy
   comparison.

**Verify**: `node --check plans/research/070/policy.md` is meaningless
for markdown — instead verify by checklist: all five numbered sections
exist and each names the file/line it constrains (e.g. "leakage:
`evaluate.cjs:48-52`"). Peer-reviewable, no placeholders like "TBD".

### Step 3: Build the curation tool (`plans/research/070/curate.cjs` + `curate.test.cjs`)

A small CommonJS tool (model the header + UMD-require style on
`plans/research/068/detector.cjs:1-26`) that:

- Reads a candidate entry JSON (issue-derived draft) and validates it
  against the corpus schema: required keys, enum values (same four
  enums as `evaluate.cjs:43-46`), `id` uniqueness against BOTH
  `plans/research/067/corpus.json` and `plans/research/070/holdout-seed.json`,
  `sourceRef` present for holdout candidates, non-empty trimmed `text`.
- Runs the dedupe check: `normalizeText` collision (same folding as the
  evaluator) against both files → reject with the colliding id.
- Runs the leakage check: rejects `split: holdout` when a
  near-duplicate sits in development (same rule as evaluator — share the
  definition by comment reference, not by copy-paste drift; small
  duplication with a pointer comment is acceptable per repo convention,
  exactly as `background.js` keeps its own `t`/`uid` copies).
- CLI: `node plans/research/070/curate.cjs --check <candidate.json>`
  exits 0/1 with a one-line reason; `--help` documents the schema.
- Tests (`curate.test.cjs`, run with `node --test`): valid holdout
  candidate passes; each enum violation fails; duplicate id fails;
  near-duplicate across files fails; missing `sourceRef` on holdout
  fails but passes on development; empty/whitespace text fails. ≥ 8
  assertions.

**Verify**: `node --test plans/research/070/*.test.cjs` → all pass;
`node plans/research/070/curate.cjs --help` → exit 0 with schema docs.

### Step 4: Seed the holdout (only from real material)

- For each eligible `missed spam` issue found in Step 1 (or: record
  "zero eligible issues — seed deferred" and skip to the verdict with an
  empty `holdout-seed.json` array; an empty seed with working tooling is
  a valid completion, exactly as 067's insufficient-data was valid):
  draft the entry per `policy.md`, run it through `curate.cjs --check`,
  append passing entries to `plans/research/070/holdout-seed.json`.
- Run the 067 evaluator to prove non-interference: `node
  plans/research/067/evaluate.cjs --check` must still exit 0 (you did not
  touch 067's files, so this is a tripwire, not an expectation update).
- Additionally run a *read-only* classification of the seed through the
  evaluator's `classify` logic without modifying 067 (a throwaway
  `node -e` that requires both files, or a documented manual run) and
  record per-entry current-matcher outcomes in `verdict.json` as
  observations — NOT as failures, NOT as a baseline change.

**Verify**: `curate.cjs --check` exits 0 for every committed seed entry;
067 `--check` exits 0; `holdout-seed.json` entries all carry `sourceRef`
  issue URLs and `labelStatus` per policy (or the file is `[]` with the
  deferral recorded).

### Step 5: Record the verdict (`plans/research/070/verdict.json`)

Mirror the 067/068 verdict shape: `plan`, `verdict` (`proceed` if the
pipeline is usable end-to-end, `insufficient-data` if no seed material
existed — both are valid completions), `decidedAt`, `baseSha`,
`productionFiles: []`, `checks[]` (command/expected/actual),
`measuredResults` (entries curated, checks green), `missingEvidence`
(what still needs real reports over time), `nextWork` (explicitly: the
maintainer grows `holdout-seed.json` per `policy.md`; a future plan
merges the sets and re-records the baseline with reviewer sign-off),
`notes` (the "do not edit baseline to fit" rule restated).

**Verify**: JSON parses (`node -e "JSON.parse(require('fs').readFileSync('plans/research/070/verdict.json','utf8'))"`),
all listed checks match commands you actually ran.

## Test plan

- New tests in `plans/research/070/curate.test.cjs` (Step 3 — the ≥ 8
  assertions listed there), modeled on
  `plans/research/068/detector.test.cjs` structure (case table +
  invariants; note 068's suite is 17 tests — similar table-driven shape,
  smaller).
- No production tests change (production untouched — prove with the drift
  check + `git status` showing only `plans/` paths).
- Regression proof: 067 `--check` green before and after (Step 0 vs Step
  4).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node plans/research/067/evaluate.cjs --check` exits 0
- [ ] `node --test plans/research/070/*.test.cjs` exits 0 (≥ 8 assertions)
- [ ] `npm run smoke` exits 0, `npm run lint` exits 0, `npm run test:unit`
  exits 0 (all pass)
- [ ] `plans/research/070/` contains `policy.md`, `curate.cjs`,
  `curate.test.cjs`, `holdout-seed.json`, `verdict.json` — no other new
  files
- [ ] Every `holdout-seed.json` entry passes `curate.cjs --check`
  (or the file is `[]` with deferral recorded in `verdict.json`)
- [ ] `git diff --name-only 3aef7b9...HEAD` lists only `plans/` paths
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match live code (drift).
- A step's verification fails twice after a reasonable fix attempt.
- The work appears to require touching `plans/research/067/*`,
  production files, the report flow, or the issue template.
- Zero eligible issues exist AND you are tempted to fabricate seed
  entries from synthetic text — record the deferral instead. Synthetic
  holdout is worse than empty holdout (it would launder development data
  into the promotion gate).
- You discover the assumption "reports arrive as GitHub issues via the
  missed-spam template" is false (e.g. the template was renamed) — the
  Step 1 mapping is void; report rather than guessing a new funnel.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- Growing `holdout-seed.json` is maintainer work driven by incoming
  `missed spam` issues — point reporters at the `negative-examples`
  field; each new entry must pass `curate.cjs --check` before commit.
- **Deferred:** merging `holdout-seed.json` into the 067 corpus +
  re-recording `baseline.json` — unblocked when the seed is large enough
  to be representative (maintainer judgment, minimum dozens across EN/ES
  + at least one non-EN language); requires reviewer sign-off per the
  baseline note. Nothing here changes until then.
- **Deferred:** Firefox probe equivalents + paraphrase-prevalence sizing
  (067 nextWork items 2–3) — separate future plans, not this one.
- A reviewer should scrutinize: the `verified` definition in policy.md
  (too lax admits noise, too strict starves the corpus) and any drift
  between the tool's enum/dedupe rules and `evaluate.cjs:43-52`.
