# Plan 079 — Suggested-capture sanitiser + leak verifier (research spike)

> Status: research prototype. **Nothing here ships.** `plans/` is excluded from
> the packaged zip by `scripts/package-extension.js` (fixed file list).
> Base: `main` @ `2fb25e3e9f893d34a4b2a3df85b415cd8b80a669`.
> This plan modifies **no** production file and **no** file under
> `plans/research/068/` or `plans/research/071/`; it reads them in place.

## 0. Why this plan exists

Plan 067, 068, 070 and 071 all closed `insufficient-data`. The blocker is not
code and never was: it is that **zero real Suggested-post captures have ever been
donated** (`plans/research/071/cases-real.json` is `[]`). Plan 071 built the
donation protocol and the browser probe, and 068 built the detector prototype —
so the analysis half is done. What is missing is the half that turns a human's
pasted markup into an admissible, provably-sanitised entry.

Protocol §2 asks a contributor to hand-sanitise real markup and §2.4 asks them to
"state the exact grep used" to prove no real name, sentence or URN remains. That
is a manual, unverifiable, privacy-critical step, and it is where the gate has
been stuck. Worse, the plan-071 gate that guards `cases-real.json` does **not**
verify that sanitisation happened.

### Step 0 — the gap, demonstrated

`step0-gap-demo.cjs` runs the exact content assertions from
`plans/research/071/probe-extensions.test.cjs` ("sanitization: only sentinel URNs,
recorded provenance context") against an entry that still contains a person's
name, a full post body, a global `id` attribute, a profile slug with a tracking
parameter, a `srcset`, and identifying `alt` text. The gate's only content check
is a URN sentinel prefix; once the URN's prefix satisfies it, all seven
PII-shaped items pass through. Verified output:

```
071 sanitization gate passed on the dirty entry: true
surviving PII-shaped content after that pass: 7 of 7 classes
```

Conclusion: the gate verifies a *provenance string*, not *sanitisation*. This is
the finding that justifies the plan; it is pinned as a regression guard in
`sanitize.test.cjs` so the gate cannot silently stay this weak.

## 1. What this plan adds

| File | Role |
|---|---|
| `sanitize.cjs` | **Producer.** Turns a pasted capture into protocol-§2-clean markup. Zero dependencies, fail-closed. |
| `sanitize.test.cjs` | 26 tests: the Step-0 gap, §2.1–§2.4 behaviour, §2.2 structural preservation, and an end-to-end run against the unmodified 071 gate. |
| `step0-gap-demo.cjs` | The reproducible demonstration above. |
| `dirty-sample.html` | Unsanitised fixture (all values invented) used by `--self-test` and the tests. |
| `cases-real.template.json` | Ten-key entry skeleton for a contributor to fill in. |
| `contributor-guide.md` | The operational path: capture → sanitise → verify → check → send. |

`sanitize.cjs` does **not** replace the plan-071 gate. It feeds it. Schema,
provenance, dedupe and the ten required keys remain 071's job.

## 2. Sanitiser rules (protocol §2.1–§2.3)

**Text.** Every alphanumeric run becomes `Placeholder`. Preserved: the caller's
declared `--label` (the structural signal), punctuation-only tokens such as `·`
(the separator `SS_matchesLabel` keys on), and leading/trailing whitespace.
Consecutive placeholders collapse to one. A combined label such as
`Suggested · Acme Corp` therefore becomes `Suggested · Placeholder` — the signal
survives, the sponsor name does not.

**Attributes dropped** (name and value): `id`, `nonce`, `integrity`,
`crossorigin`, `referrerpolicy`, `srcset`, `imagesrcset`, `data-urn`, `ping`,
`style`, any `on*` handler, `data-tracking*` / `data-trk*` / `data-impression*`,
and `data-*-ref` / `data-*-id`.

**Attributes default-deny.** Only names on an explicit `STRUCTURAL_ATTRS`
allowlist keep their values verbatim (`class`, `data-id`, `data-testid`,
`data-case`, `role`, `dir`, `lang`, `rel`, `target`, `type`, `name`, `scope`,
`tabindex`, `colspan`/`rowspan`, the SVG geometry and presentation set, and the
`aria-*` enum set). Every other valued attribute is treated as **untrusted text**
and placeholdered.

This rule was added after the first test pass exposed a real hole in an earlier
version of this very module: attributes outside a known-text list kept their
values verbatim, so PII could have hidden in an unrecognised attribute and passed
both sanitise *and* verify — the same class of gap as Step 0. The allowlist is the
difference between "we assume these attributes are safe" and "no attribute keeps
a value we did not sanction". An unknown attribute that turns out to be
load-bearing for detection fails **visibly** in the detector outcome rather than
silently leaking, and a maintainer extends the list in one place.

**URL attributes** (`href`, `src`, `poster`, `action`, `formaction`, `data-src`):
query and fragment stripped; `in` / `company` / `school` / `showcase` / `groups`
slugs rewritten to `Placeholder`.

**urn:li payloads, in any attribute**: rewritten to `urn:li:<kind>:71XX`, where
the sentinel is a deterministic function of the case id (distinct per entry, as
§2.3 requires). `data-id` is covered even though it is not a URL attribute —
`POST_SELECTORS` (`'[data-id*="urn:li:activity:"]'`) keys on it.

**Dropped subtrees**: `<script>`, `<style>`, and all HTML comments. None is post
structure, and each is a plausible exfiltration carrier.

### Deviation from protocol §2.3, requiring maintainer sign-off

§2.3 says `urn:li` values "are replaced with sentinels of the shape
`urn:li:activity:71XX`". This implementation **preserves the entity kind**
(`urn:li:company:71XX` stays a company urn) instead of collapsing every kind to
`activity`. Reason: `POST_SELECTORS` matches the literal substring
`urn:li:activity:`. Collapsing a `urn:li:company:*` payload to
`urn:li:activity:*` would make a capture match a selector it never matched, i.e.
**fabricate a positive** — precisely the "fabricated provenance poisons the very
gate this plan serves" failure that `071/protocol.md` forbids. Sentinel *shape*
is preserved (`71XX`); only the entity kind is retained. `findLeaks` enforces the
sentinel prefix on any `urn:li` value regardless of kind.

## 3. Structural preservation is enforced, not promised (§2.2)

§2.2 requires element names, class attributes and nesting to survive exactly.
The sanitiser computes a structural fingerprint (element name, class value,
surviving attribute names, depth) over its input and over its output, and
**refuses to emit anything** if they differ. Dropped attributes and dropped
subtrees are excluded from both sides so the comparison is meaningful.

The fingerprint is cross-checked in tests against an independent `jsdom` walk, so
the guarantee does not rest on the module's own tokeniser being correct.

## 4. Fail-closed behaviour (no override)

`sanitizeMarkup` returns an error and **no markup** when it cannot round-trip the
input: an unterminated quoted attribute value, an unterminated comment or tag, a
tag whose attribute syntax it does not fully understand, or any structural
mismatch. There is deliberately no `--force` flag: a partial rewrite that leaves
human text behind is worse than a refusal. The contributor guide tells the
contributor to report the shape rather than hand-patch it.

## 5. Verifier rules (§2.4, mechanised)

`findLeaks(markup)` returns one finding per violation; empty is the pass. Rules:
`surviving-text`, `surviving-attr-text`, `dropped-attr-survives`,
`script-or-style`, `html-comment`, `non-sentinel-urn`, `url-query-or-fragment`,
`real-profile-slug`, `email`, `long-digit-run`, `unparsable`.

The core invariant is a **vocabulary check**: every alphanumeric run in every
text node and every text-bearing attribute must be either the placeholder token
or a declared label. This is stronger than a denylist of names, and it is the
machine form of the "exact grep" §2.4 asks a contributor to state.

Two properties are asserted directly:
* **Round trip** — `sanitizeMarkup` output always yields `findLeaks === []`.
* **Idempotence** — re-sanitising emits no further changes.

### Documented limitations of the verifier

* **URL paths are preserved.** Query strings and fragments are stripped and known
  identity slugs (`in`/`company`/`school`/`showcase`/`groups`) are rewritten, but
  the rest of a URL path survives. That is deliberate: host and route are
  structural evidence, and LinkedIn media paths are opaque CDN hashes. A URL whose
  path itself spelled out a human name (as some article URLs do) would not be
  caught. No heuristic was added for this because a name-shaped-slug guess would
  false-positive on ordinary paths and block legitimate donations; the bound is
  recorded instead of papered over.
* **The allowlist is not exhaustive.** An attribute whose value must survive but
  which is not on `STRUCTURAL_ATTRS` will be placeholdered. This fails visibly in
  the detector outcome, never silently.
* **Sanitisation is a text-and-identity transformation, not a proof of
  non-identification.** A capture can still reveal that *some* post existed with
  *some* structure at *some* time. Contributors are told to capture only the post
  container, never anything above it.

## 6. End-to-end proof

`sanitize.test.cjs` mirrors the repo layout into a temp directory (with the
repo's `node_modules` symlinked so `jsdom` resolves), writes a two-entry
`cases-real.json` built **entirely from sanitised output**, and runs the
**unmodified** `plans/research/071/probe-extensions.test.cjs` there. The gate's
five tests pass: ten-key schema, `scanRoot` enum, provenance `user-contributed`,
status `real-donated`, id dedupe against 068's ten, the sanitization check, and
per-entry detector outcomes (one positive targeted, one body-mention negative
failing open).

That is the whole claim of this plan, verified end to end: **a capture that goes
through `sanitize.cjs` is admissible to the existing gate, and sanitisation does
not destroy the signal the 068 detector keys on.**

## 7. Verification

```bash
node --test plans/research/079/sanitize.test.cjs        # 26/26
node plans/research/079/step0-gap-demo.cjs              # demonstrates the gap
node plans/research/079/sanitize.cjs --self-test         # round-trip the fixture
node plans/research/079/sanitize.cjs --leaks plans/research/071/cases-real.json
node --test plans/research/071/probe-extensions.test.cjs # unchanged: 5/5
node --test plans/research/068/detector.test.cjs         # unchanged: 17/17
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
```

## 8. What this plan does NOT do

* It does not obtain a capture. Only someone with a logged-in LinkedIn feed can
  do that: either a contributor capturing manually per `071/protocol.md` §1, or
  the repository owner running the narrowly bounded authorized collector defined
  in `071/protocol.md` §1a (see `plans/research/080/amendment.md`). This plan removes
  every obstacle **after** the capture step; it does not move that step.
* It does not modify 068's detector, 071's protocol or gate, or any production
  file.
* It does not lower plan 071's §3 minimums (≥3 positives, ≥2 negatives, ≥1 layout
  variant). `cases-real.json` stays `[]` and 068 stays `insufficient-data` until
  a real donation arrives.
* It does not claim any precision, recall or false-positive rate. No real sample
  exists to compute one from.

## 9. Handoff

The next actor is **a contributor**, not a coding agent. Give them
`contributor-guide.md`. When a donation satisfies §3, the proceeds are:

1. `node plans/research/079/sanitize.cjs --leaks plans/research/071/cases-real.json` → 0 leaks
2. `node --test plans/research/071/probe-extensions.test.cjs` → ten-key schema + dedupe green
3. Re-run `plans/research/068/` against the donated corpus → 068 may leave
   `insufficient-data`.

Only then does the production work this gate exists to protect — an opt-in
"Reduce suggested posts" filter — become plannable.
