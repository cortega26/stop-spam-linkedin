# Plan 067 — Reproducible detection and recovery measurements (design + verdict)

Status: measurements recorded 2026-09-14 on `advisor/067-detection-benchmark` (base `45e6457`).
Verdict: **insufficient-data** (honest successful spike — see `verdict.json`).
This is a research prototype. Nothing under `plans/research/067/` ships;
no production file was changed.

## 1. What was built

| File | Role |
|---|---|
| `corpus.json` | 60-entry evaluation corpus (schema below) |
| `evaluate.cjs` | Offline evaluator on the real shared exports; `--json` / `--check` / `--compare <result.json>` |
| `evaluate.test.cjs` | 14 self-tests for the evaluator (`node --test`) |
| `baseline.json` | Recorded expected-failure set + corpus hash (`--check` locks it) |
| `browser-probe.cjs` | Bounded Chromium probe on production code (`xvfb-run -a node …`) |
| `browser-probe-output.json` | Raw probe observations (generated) |
| `results.json` | Reproducible metrics snapshot + fixture hashes + environment |
| `verdict.json` | Machine-readable verdict (`insufficient-data`) + future CI gate |

## 2. Data-quality contract

Entry fields: `id`, `language`, `text`, `expected` (spam/legitimate/ambiguous),
`provenance` (synthetic/regression/user-contributed/public-excerpt),
`sourceRef`, `labelStatus` (verified/unverified), `split`
(development/holdout), optional `settings` (langs/customPhrases/
allowPhrases/excludedTexts/disabledPatterns) and `expectedReason`.

Label semantics (STOP-condition safe):

- `verified` = a human-authored, CI-asserted expectation copied from this
  repo's tests with its `sourceRef` intact. It is **developer-asserted
  in-repo intent, not independently labeled real-world ground truth**.
- `unverified` = spike-authored probes (paraphrases, diacritic/verb edges,
  ambiguous overlaps). They never enter accuracy tallies; disagreements
  stay visible in `misclassified` and in `baseline.json`.
- `ambiguous` = genuinely debatable even for a human (recruiter overlap);
  never judged, always counted separately.
- `split: holdout` is reserved for independently labeled examples never
  used to tune rules. The corpus has **zero** holdout entries (60/60
  development) — hence the `insufficient-data` verdict. No entry was
  relabeled as real, fluent-reviewed, or independent.

Metric rules: TP/FP/TN/FN count only verified non-ambiguous entries.
Precision/recall/FPR carry explicit `{value, numerator, denominator}`;
`value` is `null` when the denominator is 0. Stratification: language,
provenance, split. Near-identical wording must not straddle splits
(`--check` enforces); same wording under different `settings` is the
precedence matrix (e.g. `en-builtin-01`/`en-custom-01`/`en-excluded-01`)
and is reported, not rejected. No raw private URLs, authors, or account
identifiers; texts are short synthetic/regression excerpts, never whole
scraped posts. Archived plan 052's corpus was not imported (DO-NOT-SHIP;
provenance uninspected) — only its *lesson* (recruiter overlap) is cited
in `amb-01`/`en-syn-02` reasons.

## 3. Fixture inventory (with file references)

**Text positives/negatives seeded as regression** (`tests/unit/pattern-data.test.js`):

- ES: 12 spam (ES-1 accented `:108-113`, clitic `:126-130`, ES-2 `:134`)
  + 7 legitimate (`:117-122`, `:135`).
- FR: 7 spam (FR-1 `:139-142`, FR-2 `:151-153`) + 4 legitimate (`:146-147`, `:157-158`).
- PT: 5 spam (`:162-164`, `:173-174`) + 3 legitimate (`:168-169`, `:178`).
- DE: 4 spam (`:182-183`, `:191-192`) + 2 legitimate (`:187`, `:196`).
- EN has **no** unit-level pattern assertions; its regression seeds come
  from e2e fixtures: spam-1 (`tests/helpers.js:22-25`,
  `tests/extension-smoke.js:222`), the comment-post bait
  (`tests/extension-interactions.js:1944`), clean-1 (`tests/helpers.js:36-41`).

**User-policy precedence** (the layers regex-only testing would omit):

- exclusion beats everything: `en-excluded-01` (contract: `content.js:590`
  `findMatch`, unit: `pattern-data.test.js:436`).
- allow-phrase beats custom + built-in: `en-allow-01` (contract:
  `content.js:591-593`, e2e: `tests/extension-interactions.js:1844-1858`,
  plan 056 precedence).
- custom-first attribution: `en-custom-01` (contract:
  `shared/pattern-data.js:145-150`, e2e setup `:1810`).

**DOM fixtures inventoried** (integration controls, not accuracy evidence):

- `tests/helpers.js:12` `mockLinkedInFeed`: spam-1 / whitelisted-1 (trusted
  author) / clean-1.
- `tests/extension-interactions.js:1940` comment-post-1 (plan 059
  comment-vs-post tripwire, assertions `:1955-2010`); `:1746` promoted-allow-1
  (label-block pardon limit); `:1810-1900` match-tester probe pairs.
- `shared/post-container.js` + `tests/unit/post-container.test.js`:
  sibling-heuristic / known-selector / comment-preference container units.

**Documented gaps** (not filled — inventing entries to hit a target would
violate the STOP conditions): no independently labeled holdout in any of
the five languages; EN weakest at unit level (e2e-only); paraphrase
robustness unmeasured against real prevalence; FR diacritic edges and PT
verb-form coverage are single-probe observations, not distributions.

## 4. Offline results (reproduce: `node plans/research/067/evaluate.cjs --json`)

60 entries: judged 50, ambiguous 2, unverified 8.
Overall: TP 31, FP 0, TN 19, FN 0 → precision 1.0 (31/31), recall 1.0
(31/31), FPR 0.0 (0/19). By language: EN 3/0/3/0, ES 12/0/7/0, FR
7/0/4/0, PT 5/0/3/0, DE 4/0/2/0.

Reading: a green **regression guard**, not a precision claim. Every judged
entry is a fixture the rules were written alongside.

Recorded (visible, metric-excluded) gaps — `baseline.json` locks exactly
these four IDs; `--check` fails on any introduced *or* silently fixed
discrepancy until the baseline is deliberately re-recorded:

- `en-syn-01` paraphrase without magic-word-plus-send → no-match.
- `en-syn-02` comment-to-receive DM-gating shape → no-match (052 class, still rejected).
- `fr-syn-01` accented capital + elision (`Écris … t'envoie`) → no-match.
- `pt-syn-01` colloquial `comenta` (PT-1 lists `comente`) → no-match.

Notably `amb-01` (recruiter bait-shape) *does* match EN-1 — the ambiguity
is real: a legitimate recruiter post with that wording would be hidden,
which is why promotion needs sender-agnostic caution, not a new rule.

## 5. Browser evidence (reproduce: `xvfb-run -a node plans/research/067/browser-probe.cjs`)

Production unpacked extension in Chromium 148 (Playwright 1.60.0,
headless=false under xvfb, `--no-sandbox --disable-gpu`), isolated mock
feed. Structural invariants all pass, zero collateral hides:

- initial: spam-1 hidden + 1 placeholder; whitelisted-1, clean-1 visible.
- dynamic: 5/5 appended bait posts hidden (placeholders → 6).
- nested comment: `.comment` hidden with inline placeholder sibling, post
  stays visible (placeholders → 7).
- restore/re-scan: Show restores the comment; still visible 1.5 s later
  past the observer debounce (exclusion persists; placeholders → 6).

Recorded-only limits (not asserted): replaced-node text stays visible
(the `processed` WeakSet keys on the unchanged parent element, so the
replacement text node is filtered on re-scan); split-across-spans bait
stays visible (matcher runs per text node). Both are genuine
DOM-capability limits, kept visible for the future build plan.

Latency (observed, never gated): append-call → placeholder-visible wall
time, Playwright IPC included, n=5: min 505 ms, median 510 ms, max 516 ms
(samples 516/508/514/505/510) — dominated by the 500 ms observer
debounce (`content.js:17`). Single host, single run; no universal target
invented. Firefox: probe is **Chromium-only**; `npm run test:firefox`
exits 0 on Firefox 155.0.1/geckodriver 0.37.1 (install + block +
popup/options bootstrap), which is the Firefox baseline — Firefox probe
equivalents are still required before any cross-browser claim.

## 6. Quality gate for future work (also in `verdict.json`)

- `evaluate.cjs --check` must exit 0: schema, metric-arithmetic
  re-derivation, dedupe/split invariants, and the recorded baseline.
- Locked legitimate fixtures (`en-legit-01`, all `*-neg-*`): any future
  rule hiding one fails the gate as an introduced FP.
- New built-in patterns require verified holdout entries plus the
  existing fluent-review/corpus gate; no public comparison before that.
- Future build needs `tests/extension-interactions.js` regressions modeled
  on the match-tester probe pairs plus packaged Chromium/Firefox gates.
- Never: telemetry, auto-uploads, new rule families/languages, competitor
  CRX installs, "minutes saved", rankings, account changes, new
  permissions, irreversible removal.

## 7. Reproduction

```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
node plans/research/067/evaluate.cjs --json
node --test plans/research/067/evaluate.test.cjs
node plans/research/067/evaluate.cjs --check
xvfb-run -a node plans/research/067/browser-probe.cjs
npm run test:firefox
```

Environment at recording: Node v24.19.0, Playwright 1.60.0, Chromium
Chrome/148.0.0.0, Firefox 155.0.1, linux x86_64. Fixture hashes and full
numbers: `results.json`. Toolchain note: this worktree has no
`node_modules`; runs used a gitignored symlink to the main checkout's
installed modules, removed before committing (no `npm install`).
