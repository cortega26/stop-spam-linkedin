# Plan 068 — Suggested-post label filter: design, evidence, and verdict

Status: measurements recorded 2026-09-14 on `advisor/068-suggested-post-filter`
(base `991e5de`). Verdict: **insufficient-data** (honest successful spike).
This is a research prototype. Nothing under `plans/research/068/` ships;
no production file was changed.

## 1. What was built

| File | Role |
|---|---|
| `design.md` | This document: category, evidence, results, verdict, future scope |
| `cases.json` | 10-case fixture inventory (schema below) |
| `detector.cjs` | Research-only prototype detector (UMD: Node exports + browser global `SS_SuggestedDetector`), reads the real shared `matchesLabel` in place |
| `detector.test.cjs` | 17 offline tests over `cases.json` via jsdom (`node --test`) |
| `browser-probe.cjs` | Bounded Chromium probe of the prototype on an isolated mock page (`xvfb-run -a node …`) |
| `browser-probe-output.json` | Raw probe observations (generated) |
| `verdict.json` | Machine-readable verdict (`insufficient-data`) + future build scope |

## 2. Category definition and experiment boundaries

Exactly one category, Suggested — a LinkedIn recommendation label, not
spam. The desired future control is off by default, clearly
category-based, independent of text spam rules, with reversible
placeholders and opt-out restoration; category hides must not count as
spam or enter pattern-hit totals (mirrors the `isLabelBlock` semantics at
`content.js:809-842`).

Detection rule (prototype): a post is targeted only when a
`matchesLabel` hit for the English candidate label occurs inside a
RECOGNIZED post-header metadata element
(`.feed-shared-actor__sub-description`,
`.update-components-actor__sub-description` — the actor class family
production already trusts in `content.js:50-59`). The prototype never
runs a broad `querySelectorAll("*")` sweep. Fail-open exclusions: body
text, nested comments, repost/nested-post containers, unknown layouts,
non-English labels, disabled toggle, snooze.

Out of scope by plan: repost/like/hiring/job-change heuristics, company
filtering, Solo mode, AI scoring, vague sensitivity, guessed
translations, manifest/release changes.

## 3. Evidence sources (where it came from)

- Competitor feature claim: LinkedIn Feed Filter advertises separate
  Suggested/Promoted filtering (store listing checked 2026-09-13). This
  is an advertised feature, NOT a verified implementation — no
  competitor code was installed or inspected.
- Production contracts re-verified verbatim at `991e5de` (shifted by
  merged plan 063 inserts): promoted-pass guard `content.js:716-717`
  (`AUTHOR_BLOCK_SELECTORS` enumeration,
  `blockPost(post, null, {reason:"promoted"})`); label-hide recognition
  `content.js:809` (reason promoted|featured, no stats/badge/undo);
  `matchesLabel` separator rule `shared/pattern-data.js:276`;
  `HIDE_PROMOTED`/`HIDE_FEATURED` with no Suggested key
  (`shared/constants.js:28-29`); allow-vs-label e2e
  (`tests/extension-interactions.js:1740ff`, allow-phrases pardon text
  blocks only).
- 067 measurement contract (`plans/research/067/design.md` §2, verdict
  insufficient-data): applied to all reporting below.
- Real LinkedIn Suggested DOM samples: NONE collected. No feed was
  scraped, no private dumps used. All 10 fixtures are synthetic
  controls, distinctly marked `provenance: synthetic`.

## 4. Fixture inventory (cases.json schema + coverage)

Entry fields: `id`, `purpose`, `markup`, `scanRoot` (parent|post),
`expectedTarget` (CSS selector or null), `metadataLocale`,
`provenance`, `validationStatus`.

| id | expectedTarget | locale | What it proves |
|---|---|---|---|
| `header-label-en` | post | en | Positive: header Suggested targets the post |
| `header-label-with-sponsor` | post | en | Positive: `Suggested · Name` separator still targets |
| `body-word` | null | en | Negative: body sentence containing Suggested |
| `body-paragraph-only` | null | en | Negative: whole body paragraph `Suggested` (text ≠ metadata) |
| `nested-comment` | null | en | Negative: Suggested inside a nested comment, even in a recognized-class span |
| `repost-inner` | inner `.repost` | en | Boundary: inner repost targeted, outer post preserved (proposed) |
| `unrecognized-layout` | null | en | Negative: unknown layout fails open |
| `duplicate-label` | post (×1) | en | Positive: visual + screen-reader duplicates dedupe to one target |
| `mutation-root-is-post` | post | en | Positive: scan rooted at the post itself still targets |
| `non-english-label` | null | es | Negative: `Sugerido` fails open; candidate is English-label-only |

Step-1 gate: `node -e '…cases.json…'` → exit 0 (10 ≥ 9, all have
id/provenance/expectedTarget).

## 5. Denominator/provenance rules (from 067, applied here)

- All 10 cases are `provenance: synthetic` = spike-authored probes, the
  analogue of 067's `unverified` entries. They NEVER enter accuracy
  tallies; no precision/recall/FPR rate is claimed (every denominator
  would be 0 or synthetic-only).
- The asserted gate is the plan's fixed requirement: zero collateral
  hides on the fixed negative controls (5 null cases + repost outer
  preserved), reported by ID.
- `validationStatus: synthetic-validated` means asserted against the
  prototype only — developer-asserted in-spike intent, not real-world
  ground truth. There are zero holdout entries of any kind.

## 6. Offline results (reproduce: `node --test plans/research/068/detector.test.cjs`)

17/17 pass: 10 case-targeting tests + dedupe + outer-preservation +
disabled/snooze-closed + 3 PROPOSED state-model tests + 067-rules
summary. Per-ID: 5/5 positives correctly targeted
(`header-label-en`, `header-label-with-sponsor`, `repost-inner`→inner,
`duplicate-label` ×1, `mutation-root-is-post`); 0 false positives on the
5 fixed negatives; 0 false negatives on synthetic positives.

PROPOSED state-model behavior (labeled as such until a production
integration exists): toggle-off restores only Suggested hides;
allow-phrase pardons never restore Suggested hides (matches the
promoted-allow e2e); Show restores one post; Suggested hides never
increment the spam count.

Reading: a green SYNTHETIC-ONLY regression guard for the prototype, not
evidence the filter is safe on real LinkedIn DOM. `realSampleCount = 0`.

## 7. Browser evidence (reproduce: `xvfb-run -a node plans/research/068/browser-probe.cjs`)

Prototype injected into an isolated `about:blank` mock page
(Chromium/Playwright, headless=false under xvfb). Structural invariants
all pass, zero collateral hides:

- inserted: Suggested post hidden + 1 placeholder; body-word and clean
  posts visible.
- dynamic: appended Suggested post hidden (placeholders → 2).
- replaced: clean post whose header node is replaced with a Suggested
  label hidden on re-scan (placeholders → 3).
- restore/re-scan: Show restores the post; still visible after re-scan
  (placeholders → 2, rescanStable).

Full observations: `browser-probe-output.json`. Firefox equivalents are
still required before any cross-browser claim.

## 8. Verdict rationale

`insufficient-data` — the prototype meets every synthetic boundary
(zero fixed-negative collateral hides, correct targeting, restore and
precedence modeled), but proceed requires correctly targeted REAL label
examples plus an explicit supported-layout/locale boundary, and passing
synthetic tests alone is insufficient (plan §3 gate). Missing evidence:
representative real Suggested label/layout samples with legitimate
provenance; supported-metadata-locale list beyond English; production
semantics for repost-inner vs outer; feed vs profile layout coverage.
Per the plan, insufficient-data caused by unavailable representative
data is a successful research verdict, not permission to lower the
gate. No STOP condition fired (no precision failure, no spam-count
mixing proposed, no network/permissions/irreversible changes).

## 9. Bounded future implementation scope (only on a proceed verdict)

- Production files: `content.js` (Suggested label pass modeled on
  `scanForLabeledPosts`, `isLabelBlock` extended with reason
  `"suggested"`); `shared/pattern-data.js` (`SUGGESTED_LABELS` + export);
  `shared/constants.js` (`HIDE_SUGGESTED: "ss_hide_suggested"`);
  `options/options.js` + `options/options.html` (off-by-default
  control); `_locales/en|es/messages.json` (one UI key each, EN+ES
  parity); backup import/export (options.js, absent key ⇒ false,
  compatible with older backups); `types/globals.d.ts` if new globals;
  lint config only if new contexts appear.
- Tests: `tests/extension-interactions.js` regressions modeled on the
  match-tester probe pairs (plan-063 promoted-allow shape near
  `:1740ff`), plus packaged Chromium/Firefox gates.
- Docs: `AGENTS.md` storage-key/shared-file update in that build.
- Never: telemetry, new permissions, matching-default changes,
  signature-hash changes, manifest matching changes, counting category
  hides as spam, guessed translations, plans/research in the zip.

## 10. Reproduction

```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
node -e 'const a=require("./plans/research/068/cases.json"); if(a.length<9||a.some(x=>!x.id||!x.provenance||!("expectedTarget" in x)))process.exit(1)'
node --test plans/research/068/detector.test.cjs
xvfb-run -a node plans/research/068/browser-probe.cjs
node -e 'const v=require("./plans/research/068/verdict.json"); if(!["proceed","insufficient-data","no-go"].includes(v.verdict))process.exit(1); if(v.verdict==="proceed"&&(!v.realSampleCount||v.negativeFalsePositives||v.unresolvedCases.length))process.exit(1)'
```

Environment at recording: Node v24.19.0, Playwright (repo-installed),
Chromium (ms-playwright cache), linux x86_64. Toolchain note: this
worktree has no `node_modules`; runs used a gitignored symlink to the
main checkout's installed modules, removed before committing (no
`npm install`).
