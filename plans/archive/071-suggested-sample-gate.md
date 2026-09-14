# Plan 071: Collect real Suggested-label samples to gate the filter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3aef7b9..HEAD -- plans/research/068/ plans/research/070/ shared/post-container.js content.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/070-holdout-corpus-pipeline.md (provenance
  vocabulary only — see Step 1; if 070 has not landed, mirror 067's
  values and note the dependency in the verdict instead of blocking)
- **Category**: direction
- **Planned at**: commit `3aef7b9`, 2026-09-14

## Why this matters

Plan 068 proved the Suggested-label detector meets every synthetic
boundary with zero fixed-negative collateral hides — and closed
`insufficient-data`: `realSampleCount` is 0, the candidate is
English-label-only, and the probe is Chromium-only. A label filter that
has never seen a real LinkedIn "Suggested" header must not ship: the
difference between header metadata, body mentions, repost-inner labels,
and locale variants is exactly what synthetics cannot teach. This plan
collects legitimate-provenance real samples, pins the supported
locale/layout boundary, and re-runs the gates — ending in a proceed/no-go
verdict on the same terms 068 defined, not a silent build.

## Current state

The facts the executor needs, inlined:

- **Research-only precedent.** Everything lives under
  `plans/research/068/` and never ships (fixed zip file list in
  `scripts/package-extension.js`): `cases.json` (10 cases), `detector.cjs`
  (185 lines), `detector.test.cjs` (17 tests), `browser-probe.cjs`
  (Chromium mock-page harness), `browser-probe-output.json`, `design.md`,
  `verdict.json`. New work goes in `plans/research/071/`; 068's files
  are read-only reference.
- **Case schema** (`plans/research/068/cases.json:1-11`, representative):
  ```json
  {
    "id": "header-label-en",
    "purpose": "Positive control: English Suggested label in recognized post-header metadata must target the post.",
    "markup": "<section data-case=\"header-label-en\" data-id=\"urn:li:activity:1001\" class=\"feed-shared-update-v2\">…<span class=\"feed-shared-actor__sub-description\">Suggested</span>…</section>",
    "scanRoot": "parent",
    "expectedTarget": "[data-case=\"header-label-en\"]",
    "metadataLocale": "en",
    "provenance": "synthetic",
    "validationStatus": "synthetic-validated"
  }
  ```
  All 10 entries carry `provenance: "synthetic"`,
  `validationStatus: "synthetic-validated"`. Negatives use
  `"expectedTarget": null` (fail open).
- **Detector boundary** (`plans/research/068/detector.cjs:29-56`):
  `SUGGESTED_LABELS = ["Suggested"]` (English-only, "No translations are
  guessed"); `POST_SELECTORS = ['[data-id*="urn:li:activity:"]',
  ".feed-shared-update-v2"]`; `HEADER_META_SELECTORS =
  [".feed-shared-actor__sub-description",
  ".update-components-actor__sub-description"]` ("the same actor class
  family production already trusts for author links"); exclusion
  ancestors `.comment, .comments, .repost, .post-body`. Unlike production
  `scanForLabeledPosts` (`content.js:715-732`, which sweeps
  `post.querySelectorAll("*")`), the prototype queries only the
  conservative header selectors.
- **Unresolved cases** (`plans/research/068/verdict.json`): real
  Suggested label/layout samples with legitimate provenance;
  supported-metadata-locale list beyond English; repost-inner vs outer
  production semantics (prototype targets inner only — proposed, not
  integrated); feed vs profile + layout-variant coverage on real DOM;
  Firefox probe equivalents.
- **Production anchor that admits uncertainty.**
  `shared/post-container.js:18-23`: `COMMENT_SELECTORS = [".comment",
  ".comments-comment-item"]`, with the comment that
  `.comments-comment-item` is "LinkedIn's real comment-item class
  (unverified against live DOM — centralized here so a real-DOM capture
  can adjust it in one place)." The same unverified-class risk applies to
  the header-metadata selectors above — real captures are the fix, and
  this file is where selector corrections land (a *future* build plan,
  not this one).
- **Probe pattern to reuse** (`plans/research/068/browser-probe.cjs:1-21`
  header): isolated mock page (`about:blank`), never the production
  content script, never a live account, never LinkedIn; run via
  `xvfb-run -a node plans/research/068/browser-probe.cjs`; writes
  `browser-probe-output.json`; exit 0 on structural invariants.
- **Provenance vocabulary.** 067's evaluator
  (`plans/research/067/evaluate.cjs:43-46`) allows `provenance ∈
  {synthetic, regression, user-contributed, public-excerpt}`. Plan 070
  extends this thinking to curation policy. DOM fixtures need the same
  discipline: real captures are `user-contributed` (donated by a
  contributor from their own feed) with a `sourceRef` describing who/when
  (no names in the file — "contributor capture, 2026-09, en UI locale"),
  and the sanitization applied.
- **Repo conventions:** research prototypes are CommonJS reading
  production helpers in place via `require()` (detector.cjs:19-26);
  privacy contract forbids scraping, automation against linkedin.com, and
  retaining real post text; conventional-ish commits (`docs(plans):`,
  `feat(...)`); `xvfb-run -a` fallback when `$DISPLAY` is unset.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Detector tests (068, untouched) | `node --test plans/research/068/detector.test.cjs` | declared | 17 pass |
| New 071 tests | `node --test plans/research/071/*.test.cjs` | declared | all pass |
| 068 probe (untouched) | `xvfb-run -a node plans/research/068/browser-probe.cjs` | declared | exit 0 |
| Unit suite | `npm run test:unit` | declared | all pass (81 at `3aef7b9`) |
| Smoke / lint | `npm run smoke`, `npm run lint` | declared | exit 0 |

(`test:unit` needs Node ≥ 24; browser probes need Playwright's Chromium —
`npx playwright install --with-deps chromium` — and fall back to
`xvfb-run -a` without `$DISPLAY`, per AGENTS.md.)

## Scope

**In scope** (the only files you should modify/create):
- `plans/research/071/` (create): `protocol.md`, `cases-real.json`
  (name it exactly this — it merges *by reference*, never by editing
  068), `probe-extensions.cjs` + its test file, `verdict.json`
- `plans/README.md` (your status row only)

**Out of scope** (do NOT touch, even though they look related):
- `plans/research/068/*` and `plans/research/070/*` — read-only. If 070
  has not landed, mirror 067's provenance enum values and record the
  vocabulary debt in your verdict (do not invent new enum values).
- `shared/post-container.js`, `content.js`, `shared/pattern-data.js` —
  selector corrections and any production integration belong to a future
  build plan gated on this plan's proceed verdict. Observing that a real
  capture contradicts a selector is a *finding to record*, not a fix to
  make here.
- Any live LinkedIn access: no automated fetching, no test accounts, no
  credentials, no scraping scripts. Captures are manual, donated, and
  sanitized (see Step 2).
- Non-English detection-pattern work (plan-012 gate still stands) and
  the 067 text-holdout itself (plan 070).

## Git workflow

- Branch: `advisor/071-suggested-samples`
- Commit per step; message style: conventional-ish (see `git log --oneline`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run the 068 detector tests, the 068 probe, smoke, lint, unit on the
unmodified checkout. Record results.

**Verify**: 17/17 detector tests pass; probe exits 0; smoke/lint/unit
green. Anything red here is a broken baseline — STOP and report.

### Step 1: Reconcile provenance vocabulary with plan 070

Read `plans/research/070/policy.md` if it exists (070 landed). Adopt its
`provenance` / verification definitions for DOM fixtures verbatim; DOM
entries use `provenance: "user-contributed"`, `validationStatus` values
extended with `"real-donated"` (new value — document it in your
`protocol.md`, do not retrofit it into 068's files).

If 070 has NOT landed: mirror 067's enum
(`evaluate.cjs:43-46`) exactly, use `validationStatus:
"real-donated"`, and record "vocabulary reconciliation with 070 pending"
under `missingEvidence` in your verdict. Either way, do not invent
competing enum names.

**Verify**: your protocol's vocabulary section quotes its source
(070 policy lines or 067 evaluator lines); `node --test
plans/research/068/detector.test.cjs` still 17/17 (untouched).

### Step 2: Write the donation + sanitization protocol (`protocol.md`)

The load-bearing design artifact. Specify:

1. **How a real capture is made**: contributor, in their own logged-in
   browser, opens their feed, finds a "Suggested" (or locale-equivalent)
   header, copies the *outerHTML of the header-metadata element plus its
   post container only* via devtools. Manual copy-paste only — forbid
   scripts, extensions, or bulk extraction.
2. **Sanitization (mandatory, before commit)**: replace all human text
   (names, headlines, post bodies, counts, timestamps, images/srcsets)
   with inert placeholders ("Someone", "A calm professional note…");
   keep element names, class attributes, and nesting exactly (structure
   is the signal); drop `id`s, tracking params, and `urn:li` values
   except the `activity:` shape the selectors key on (replace with
   `urn:li:activity:71XX` sentinels); each entry records the
   sanitization performed in one line.
3. **Minimum set for a proceed verdict**: ≥ 3 real positive headers (feed
   context), ≥ 2 real negatives (body-mention of Suggested/suggested in
   real markup, and one non-English label if obtainable by switching the
   contributor's LinkedIn UI locale — documented attempt counts even on
   failure), ≥ 1 layout variant that differs from the 068 synthetic
   shapes (profile-adjacent, repost, or sponsored-with-separator).
   Fewer than this → verdict is `insufficient-data`, honestly.
4. **Locale-label method**: labels are established ONLY by contributor
   capture under that UI locale (e.g. es UI → "Sugerida/o"? — capture,
   don't guess). Guessed translations are forbidden (detector.cjs:29-31
   states the rule; restate it).
5. **What a capture that contradicts production selectors produces**: a
   finding in `verdict.json` (`selectorObservations[]`), never a source
   edit here.

**Verify**: checklist — all five sections present; the forbidden list
(scraping, bulk extraction, guessed translations, real post text, live
accounts) appears verbatim; no placeholders.

### Step 3: Collect and commit `cases-real.json`

Perform the captures per protocol (use your best-effort environment;
where a capture class is unobtainable, record the attempt, not a
fabrication). Entry schema mirrors 068 plus the new status:

```json
{
  "id": "real-suggested-feed-01",
  "purpose": "…",
  "markup": "<section …>…sanitized…</section>",
  "scanRoot": "parent",
  "expectedTarget": "[data-case=\"real-suggested-feed-01\"]",
  "metadataLocale": "en",
  "provenance": "user-contributed",
  "validationStatus": "real-donated",
  "sourceRef": "contributor capture, 2026-09, en UI locale; sanitized per protocol.md §2",
  "sanitization": "names/bodies/counts replaced; classes + nesting kept; urn sentineled"
}
```

Run every entry through the same target assertions as 068 (reuse the
assertion shape from `detector.test.cjs`, pointed at the new file —
your `probe-extensions.cjs` test harness).

**Verify**: each committed entry has all nine keys; `expectedTarget:
null` entries assert zero hides through the 068 detector unchanged
(import it, do not fork it); no entry contains real names, real post
text, or real URNs (grep for leftovers: contributor-specific strings
must return zero matches — state the exact grep you ran).

### Step 4: Extend the probe and render the verdict

- Extend coverage: run the 068 `detector.cjs` + a Chromium mock-page
  probe over `cases-real.json` (new `probe-extensions.cjs`, same
  about:blank discipline as the 068 probe header), recording
  per-entry targeted/null outcomes to a new output JSON. Attempt Firefox
  equivalents via the repo's `tests/firefox-smoke.js` harness pattern
  ONLY if cheap (geckodriver path); if not, record "Firefox equivalents
  pending" as missing evidence rather than burning the plan on
  toolchain work.
- Write `verdict.json` (mirror 068's shape): `realSampleCount`,
  `supportedMetadataLocales` (only locales with ≥ 1 real positive —
  expect `["en"]` unless Step 3 delivered more),
  `negativeFalsePositives` (must be 0 on the fixed negatives or the
  verdict is no-go), `unresolvedCases` (whatever remains),
  `selectorObservations[]`, and `verdict`: `proceed` (real positives
  targeted, zero collateral, boundary pinned) or `insufficient-data`
  (valid completion — do not lower the Step-2 minimums to force a
  build).

**Verify**: probe exits 0; `node --test plans/research/071/*.test.cjs`
all pass; 068's tests + probe still green (untouched proof); smoke +
lint + unit green.

## Test plan

- New table-driven tests in `plans/research/071/` modeled on
  `plans/research/068/detector.test.cjs` (17-test shape): every
  `cases-real.json` entry asserted through the unmodified 068 detector
  (target or null), plus dedupe (no two entries share an id with each
  other or with 068's ten), sanitization (no real-text patterns), and
  schema-conformance tests.
- Zero production tests change. Full existing gates stay green as the
  no-collateral proof.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test plans/research/068/detector.test.cjs` → 17 pass
  (untouched)
- [ ] `node --test plans/research/071/*.test.cjs` → all pass
- [ ] `xvfb-run -a node plans/research/068/browser-probe.cjs` → exit 0
  (untouched) and the new 071 probe → exit 0
- [ ] `npm run smoke`, `npm run lint`, `npm run test:unit` → all green
- [ ] `cases-real.json` entries all carry the nine-key schema with
  `provenance: user-contributed`, or the shortfall is recorded and the
  verdict is honestly `insufficient-data`
- [ ] `git diff --name-only 3aef7b9...HEAD` lists only `plans/` paths
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match live code (drift —
  especially if 070 landed different vocabulary or 068's files changed).
- Real captures are unobtainable in your environment AND you are tempted
  to present restyled synthetics as real — record `insufficient-data`
  instead. Fabricated provenance poisons the very gate this plan serves.
- Any step seems to require a live LinkedIn session, credentials,
  automation against linkedin.com, or retaining real post text — all
  forbidden; report rather than routing around.
- The detector needs modification to target a real positive (that's a
  finding for `selectorObservations[]` + a future build plan, not a fix
  to make here — `detector.cjs` stays read-only).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- A `proceed` verdict here + a representative 070 holdout are the two
  joint gates for any future Suggested-filter build plan (per the
  competitor-review sequencing: 067 before 068's proceed). Neither alone
  suffices.
- **Deferred:** production selector corrections from
  `selectorObservations[]` (a build plan that also re-runs 057/059
  comment-container fixtures, since header and comment selectors share
  `shared/post-container.js`); Firefox probe equivalents if skipped;
  non-English label captures per contributor UI-locale switching.
- Reviewers should scrutinize the sanitization of every `markup` blob
  (structure kept, human text gone) and any `supportedMetadataLocales`
  claim beyond `["en"]` — each locale needs its own real positive.
