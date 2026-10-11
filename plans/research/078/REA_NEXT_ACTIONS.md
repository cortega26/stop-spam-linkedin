# REA Next Actions — Plan 078

**Base:** `main` @ `2fb25e3e9f893d34a4b2a3df85b415cd8b80a669` · **Date:** 2026-10-11
**Pilot verdict:** `INCONCLUSIVE — LIVE EVIDENCE UNAVAILABLE` (see `REA_PILOT_REPORT.md`)

Exactly three ranked actions, plus the explicit do-nothing option that is currently the recommended one.

---

## ✅ Option 0 — DO NOTHING / DO NOT INTEGRATE **(recommended now)**

**What it means.** Leave `main` untouched. Do not register REA as an MCP server, do not add it to CI, do not add it to the Control Plane, and do not add it to the extension. Keep this branch (or discard it) as the record of the evaluation.

**Effort:** 0.
**Upside:** zero new dependencies, zero new agent-config surface, no maintenance obligation for a tool that demonstrated no incremental value on the questions reachable today.
**Risk of doing nothing:** the *product* question (suggested-post filtering) stays blocked — but REA does not unblock it, so nothing is lost by waiting. See Action 2 for the actual unlock.
**Verification:** `git status --short` on `main` is empty; the extension's `manifest.json` still declares only `storage` + `contextMenus`.

**Why this is the recommendation.** REA ran, and its passive capture omits precisely the two signal classes this product uses — attribute values (`[data-id*="urn:li:activity:"]`) and text (bait regexes, label matching). Integrating it now would add surface without adding capability.

---

## Action 1 — If REA is revisited, gate it on a named target *and* a named gap

**What to do.** Before any future REA attempt, require two statements to be written down first: (a) which **authorized** target will be observed, and (b) which specific fact the existing Playwright + jsdom + CodeGraph stack cannot already establish. If either is missing, do not start.

**Effort:** S — the gate itself is a paragraph in a plan file. Recording the outcome is another paragraph.
**Upside:** prevents repeating this pilot's cost for no gain; makes the *next* REA run falsifiable instead of exploratory.
**Risks:** the gate could be written so loosely it always passes. Mitigate by requiring the named gap to reference an existing failing or `insufficient-data` verdict (068, 071).
**Verification:** the future plan file contains both statements and cites an existing verdict that the gap is real.

**Files:** `plans/research/078/` (this branch) as the precedent; a future `plans/research/0NN/design.md`.

**Preexisting equivalent:** none — there is currently no REA documentation in this repo, which is why this pilot had to establish the baseline from scratch.

---

## Action 2 — Unblock the *product* question first: satisfy the plan-071 capture gate

**What to do.** Obtain ≥3 sanitised, contributor-donated real Suggested-label captures (plus ≥2 negatives and ≥1 layout variant) per `plans/research/071/protocol.md` §3, and add them to `plans/research/071/cases-real.json`. **Reuse the existing protocol and the existing 068 detector — do not build new machinery.**

**Effort:** S–M on our side; the constraint is human (a contributor with a logged-in feed who is willing to hand-copy and sanitise markup). No engineering blocker.
**Upside:** this is the *only* unlock for suggested-post support, and it is tool-independent — it moves 068 off `insufficient-data` whether or not REA is ever used again. It also creates the yardstick against which any future tool's value can actually be measured.
**Risks:**
- Donated markup must be sanitised exactly per protocol §2 (replace all human text, drop `id`/tracking/`data-urn` payloads, sentinel the `urn:li:activity:` shape). A single unsanitised paste would leak member data into git.
- Do not lower the minimums to force a build — `071/protocol.md` §3 is explicit that fewer than the minimum is an honest `insufficient-data`.
**Verification:**
```bash
node plans/research/067/evaluate.cjs --check      # regression guard, must exit 0
node --test plans/research/068/detector.test.cjs  # must stay green with new entries
node --test plans/research/071/probe-extensions.test.cjs
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
```
**Acceptance criterion:** `cases-real.json` contains ≥3 `real-donated` entries and `068/verdict.json` may leave `insufficient-data`; sanitisation grep recorded in the commit message.

**Preexisting equivalent:** `plans/research/071/` (protocol) and `plans/research/068/` (detector) already exist and are `DONE`. **This action reuses both; it must not rebuild them.**

---

## Action 3 — Only after Action 2: bounded REA re-test against the donated capture

**What to do.** With real sanctioned captures in hand, run one bounded comparison: REA passive capture versus a Playwright read of the **same** sanitised sample, asking whether REA recovers any structural fact the Playwright read misses. Score it with the same table shape used in `REA_PILOT_REPORT.md` §5, and count as *novel* only findings the baseline did not already establish.

**Effort:** S — the harness pattern already exists (`/tmp/opencode/rea-pilot/baseline-probe.cjs`); it only needs the donated sample as input.
**Upside:** a real sample would exercise the modern-React and label shapes against genuine markup for the first time, which is the one condition under which REA's complementary strength (content-addressed, privacy-filtered structural snapshots) could show a genuine advantage over ad-hoc probes.
**Risks:**
- **The donated sample still cannot be served to a loopback CDP browser without re-introducing real markup into a page.** Serve it locally and treat it as sensitive; never commit it into `plans/research/078/`.
- Expectation management: E-09/E-10 make a *negative* result the more likely outcome, because attribute values and text are omitted by design. A negative result is a valid and useful outcome.
- REA's Evidence bundle is large (the extension run produced a 24.7 MB `semantic_graph`); budget for that.
**Verification:**
```bash
npx -y rea-agents@latest inspect-web-page http://127.0.0.1:9222 <TARGET_ID> --format json
node <baseline-probe>.cjs <TARGET_ID>
# compare on the SAME page; novel findings must be counted only against the baseline
```
**Acceptance criterion:** the comparison table is produced on one sample for both tools, and the REA-integration question is answered GO or NO-GO on evidence — not deferred again.

**Preexisting equivalent:** `plans/research/078/REA_PILOT_REPORT.md` §5 (the comparison table shape) and `plans/research/075/` (the drift-tripwire design REA would most plausibly complement).

---

## Summary

| # | Action | Effort | Blocked by | Recommended now? |
|---|---|---|---|---|
| 0 | **Do nothing / do not integrate** | — | — | ✅ **yes** |
| 1 | Gate any future REA attempt on named target + named gap | S | — | optional, cheap |
| 2 | Satisfy the plan-071 donated-capture gate | S–M | a willing contributor with a logged-in feed | ✅ yes, when a contributor is available |
| 3 | Bounded REA re-test against the donated capture | S | Action 2 | ❌ not before Action 2 |

**One-line rule going forward:** the blocker is a *capture*, not a *tool*. Solve the capture; then, and only then, re-ask whether REA earns a place.
