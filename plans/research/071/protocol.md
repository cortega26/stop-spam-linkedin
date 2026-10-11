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

- `provenance: "user-contributed"` means the capture came from a
  contributor's own logged-in feed, with that contributor's consent, and was
  transferred per §1 (manual copy-paste) or §1a (authorized collector). The
  class describes the **source and the consent**, never the transfer tooling.
  No other provenance value is admitted to `cases-real.json`.
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
3. Capture transfer is either manual copy-paste (the default) or a
   single-shot run of an authorized collector under §1a. No other method is
   admitted: no unattended collection, no bulk extraction, no test accounts,
   no credentials.
4. One capture per entry. Each entry records its capture context in
   `sourceRef` and its sanitization in `sanitization` (one line each).

### 1a. Authorized collector — the only exception, and its bounds

This exception exists so the repository owner can obtain §3's minimum set from
their **own** feed without hand-copying thousands of characters per post. It is
bounded on every axis; anything outside these bounds is still forbidden (see
the forbidden list below).

| Axis | Bound |
|---|---|
| Who | The repository owner, acting as the contributor. Not a third party, not a second or test account. |
| Whose feed | The collector's own logged-in feed only. Never another member's profile, feed or activity. |
| Session | An already-running, owner-started browser session. No credential entry or storage by tooling, no session export, no copying a private browser profile into an agent-owned browser. |
| Invocation | Single-shot and human-invoked: one run per explicit owner command. |
| Scale | Bounded to what §3 needs (≥3 positives, ≥2 negatives, ≥1 layout variant). No crawling, no schedulers, no polling, no iteration over routes, profiles or member lists. |
| Retention | The raw capture exists only in a local scratch file: never committed, never attached to an issue, never uploaded, and deleted once sanitised. Only §2-clean output may be committed. |
| Sanitisation | §2 applies unchanged, and an independent verifier must report zero leaks before commit. |
| **Scope pin** | This exception does **not** authorise shipping any collector inside the extension. The extension makes zero network requests and declares `data_collection_permissions: ["none"]`; both must remain true. |
| Non-circumvention | This exception does **not** authorise bypassing authentication, anti-bot systems, CAPTCHAs, access restrictions or rate limits. |

**Collection method never changes provenance.** An entry produced under §1a is
still `user-contributed` (§0) because the class describes *whose feed the capture
came from and whose consent it carries*, not the tooling used to transfer it.
`real-donated` still requires the contributor to confirm the committed structure
matches what they saw, and the maintainer to confirm §2 sanitisation — unchanged
(§3).

Plan 070's `user-contributed` definition is untouched by this section and
continues to govern the **text** corpus (`holdout-seed.json`) only.

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

The following are forbidden in this plan, without exception: **unattended or
bulk collection**, collection from any feed other than the contributor's own
logged-in feed, test accounts, credentials, guessed translations, real post
text in any committed file, and any restyled synthetic markup presented as a
real capture.

Concretely: no scraping at scale, no schedulers or polling, no collection
outside the §1a bounds, no raw capture in git or attached to an issue, no
collector shipped inside the extension (the extension makes zero network
requests and declares `data_collection_permissions: ["none"]` — both must remain
true), no retaining of real post wording in any committed file, and no restyled
synthetic markup presented as a real capture — fabricated provenance poisons
the very gate this plan serves. An unobtainable capture class is recorded as
an attempt in `verdict.json`, and the verdict follows §3.

## Amendment — 2026-10-11 (forward-only; supersedes §1.3 as originally written)

§1.3 previously banned **all** automation. It now admits the narrowly bounded
authorized-collector class in §1a and continues to ban everything unattended,
bulk, off-session, or scale-driven. The `Forbidden` section above was
reconciled in the same change so the two no longer diverge.

This amendment is **forward-only**.

- `plans/research/071/verdict.json` is a frozen, SHA-pinned artefact
  (`baseSha 3aef7b9`) and is **not** edited. Its verdict remains
  `insufficient-data` on facts that have not changed: `realSampleCount: 0`,
  `cases-real.json: []`, and no contributor session available in the
  environment where it was decided. Its citation of the former §1.3 is
  **superseded** by this note, not retro-amended.
- Neither §1a nor this note lowers §3's minimums, changes any provenance value,
  or admits any capture that has not passed §2 sanitisation and an independent
  leak check.
- Record: `plans/research/080/amendment.md`.
- The archived plan text `plans/archive/071-suggested-sample-gate.md` contains
  the pre-amendment wording ("no automated fetching", "Manual copy-paste only —
  forbid …"). Archives are frozen historical records and are **not** edited; that
  wording is superseded by this amendment.

**Reversal conditions.** Revert this amendment if any of the following holds:

1. Any raw or real capture containing third-party personal data is committed,
   attached to an issue, or uploaded.
2. The relaxation is cited to justify anything beyond a single owner-run,
   own-session, human-invoked capture.
3. The extension ships or references any network access, contradicting the
   zero-network and `data_collection_permissions: ["none"]` claims.
4. An entry enters `cases-real.json` without a clean independent leak check.
5. The manual path (§1) turns out to be sufficient — then the exception was
   unnecessary and must be removed.
