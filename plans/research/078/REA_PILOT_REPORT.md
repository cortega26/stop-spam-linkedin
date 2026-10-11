# REA Pilot Report — LinkedIn Feed Control

**Verdict: `INCONCLUSIVE — LIVE EVIDENCE UNAVAILABLE`**
**Date:** 2026-10-11
**Scope:** shoulder-of-release read-only evaluation of `rea-agents` against `stop-spam-linkedin`. No product, release, permission or dependency change was made.

---

## 1. Repository, revision and state

| Field | Value |
|---|---|
| Repository | `https://github.com/cortega26/stop-spam-linkedin` (`origin`) |
| Branch inspected | `main` |
| **Actual live HEAD SHA** | **`2fb25e3e9f893d34a4b2a3df85b415cd8b80a669`** |
| Reference SHA given in the brief | `2fb25e3e…` — **matches the live head** |
| Working tree at start | clean (`git status --short` empty) |
| Runtime | Node `v24.19.0`, npm `11.17.0`, git `2.43.0` |
| Host | Linux Mint 22.3 (x86_64) |
| Version lockstep | **All 2.0.0** — `manifest.json`, `package.json`, `VERSION`, `RELEASE_NOTES.md`, `CHANGELOG.md` agree. (Verified at `2fb25e3`; **not** at the stale checkout, where all five were 1.6.0.) |
| Extension permissions | `["storage","contextMenus"]` — unchanged, no network, no telemetry |

**Freshness note.** The local checkout was 3 commits *behind* at start (`HEAD` = `9b908d9`). Because the tree was clean, it was fast-forwarded to the live remote head **before any inspection**, and every `file:line` claim below is against `2fb25e3`. The three intervening commits were `9cf7e8d` (Feed Control 2.0.0 revamp), `5a1ef53` (P2 fixes), `2fb25e3` (first-minute activation) — they materially change `content.js`, `manifest.json` and the e2e suite, so working from the stale checkout would have produced wrong line numbers and a wrong capability inventory.

**Methodological caution, recorded because it bit this pilot.** One early read of `manifest.json`/`package.json` was issued in *parallel* with the fast-forward and returned a mixed state (`manifest.json` post-FF at 2.0.0, `package.json` pre-FF at 1.6.0), briefly suggesting a version-lockstep violation that does not exist. It was caught by re-reading both files after the branch was checked out. Every version and selector claim in this report reflects the post-FF state, re-verified individually. Practical rule: never read tracked files concurrently with the git operation that changes the tree.

**Docs read:** `AGENTS.md`, `README.md`, `PRIVACY_POLICY.md`, `RELEASE_CHECKLIST.md`, `manifest.json`, `package.json`, `CHANGELOG.md`, `docs/LIVE_FEED_ACCEPTANCE.md`, `docs/PRODUCT_REVAMP_V2.md`, `plans/README.md`, and the research verdicts under `plans/research/064…075`.

**Governance that constrains this work** — `AGENTS.md:146`:

> "Strictly scoped modern React candidate selection is **manual control only** … Public competitor source code suggests this newer layout but there are **no first-hand authenticated LinkedIn samples**; do not enable new automatic filtering or claim universal compatibility."

and `plans/research/071/protocol.md` §1.3:

> "Manual copy-paste only. Scripts, extensions, scrapers, and bulk extraction are forbidden."

Both were honoured: no automated collection from `linkedin.com` was performed, and this pilot proposes no new automatic filtering.

---

## 2. Scope, REA version, execution mode and limits

| Field | Value |
|---|---|
| REA package | `rea-agents` **6.4.0** (upstream `github.com/morluto/rea`) |
| Resolved binary | `/home/carlos/.npm/_npx/af752b90495482d7/node_modules/.bin/rea` → `rea-agents/scripts/rea.mjs` |
| **Execution mode** | **CLI only** |
| MCP server connected? | **No** — verified, not assumed (see below) |
| `doctor` verdict | `healthy: false` |

**Why MCP is not available (verified three ways).** `doctor` reports
`registration:opencode` = `config_drift` for `~/.config/opencode/opencode.jsonc`,
and all nine client registrations `missing`; `skill:identity` is also
`config_drift`. Crucially, `doctor` alone would only show a registration
*absence*, not a *live session*, so two independent checks were run: the active
session's tool catalog contains **no `rea_*` tools**, and the opencode
configuration contains no REA entry. Conclusion: **`AVAILABLE_CLI`**, not
`AVAILABLE_MCP`.

**`doctor` failures, and which matter.**

| Check | Result | Relevance to this pilot |
|---|---|---|
| `node` | ✅ 24.19.0 | supported (24.11+) |
| `host` | ❌ `unsupported_host` — `linuxmint 22.3` | **soft.** All four REA operations used here completed and returned Evidence, so the gate is advisory for these surfaces |
| `hopper`, `ghidra`, `ida-registration` | ❌ `missing_analysis_engine` | **irrelevant** — no native binary analysis was required |
| `skill:identity`, `registration:*` (9 clients) | ❌ `config_drift` | explains the absent MCP session; no `rea setup` was run (out of scope, would touch unrelated agent config) |

**Prerequisites not installed and not needed:** no native engines, no `rea setup`,
no optional providers. REA was never added to the extension, its permissions, or
its runtime. **REA stays entirely outside the shipped extension** — the extension
still makes no network requests and still declares only `storage` + `contextMenus`
(`manifest.json`).

---

## 3. Current implementation inventory (the control comparison)

All references are `SOURCE-VERIFIED` against `2fb25e3`.

### 3.1 Feed-post container location and validation

| What | Where |
|---|---|
| Heuristic thresholds | `content.js:10-21` (`DEPTH_LIMIT` 20, `SIBLING_CONTENT_THRESHOLD` 100, `SIBLING_COUNT_THRESHOLD` 2, `FEED_SIBLING_FALLBACK` 6, `CONTENT_LENGTH_THRESHOLD` 300, `MIN_TEXT_LENGTH` 30) |
| Automatic-detection selectors | `content.js:34-38` — `[data-id*="urn:li:activity:"]`, `.feed-shared-update-v2`, `article` |
| Strategy 1 — selector-free sibling-content heuristic | `shared/post-container.js:44-99` |
| Strategy 2 — known attribute/tag selectors | `shared/post-container.js:111-121` |
| Strategy chain + comment preference | `shared/post-container.js:138-185`; comment selectors at `:23` (`.comment`, `.comments-comment-item`) |
| Wiring of live CONFIG + selectors into the pure module | `content.js:739-754` |

Two strategies, tried in order: the **selector-free sibling heuristic first**,
then **known selectors**. When the resolved container is post-like
(`data-id` present, or it matches a post selector) *and* the matched text sits
inside a comment element, the comment element is returned instead — so bait in a
comment hides the comment, not the whole post (`shared/post-container.js:155-177`,
rationale in the inline note referencing "plan 059 Decision 1").

### 3.2 Ordinary vs promoted vs engagement-bait

| Category | Mechanism | Where |
|---|---|---|
| Engagement bait | 5-language regex pattern set + user phrases; matched per text node, then resolved to a container | `shared/pattern-data.js` (`SS_PATTERN_DATA`, `SS_buildPatterns`), consumed at `content.js:715-725`, `content.js:739-754` |
| Promoted | **Opt-in, default off.** `scanForLabeledPosts` enumerates containers and blocks any carrying a label that `SS_matchesLabel` accepts | `content.js:134-137` (toggles), `content.js:788-805` (pass), `shared/pattern-data.js:263` (labels), `shared/pattern-data.js:276-286` (matcher) |
| Featured (profile section) | Opt-in, default off, `/in/` only; finds the heading, walks up ≤3 ancestors to a `SECTION` | `content.js:813-831` |
| Language coverage | EN, ES, FR, PT, DE — toggleable | `shared/constants.js:68` (`DEFAULT_ENABLED_LANGS`) |
| UI locales | EN + ES only (FR/PT/DE are detection-only, by decision) | `AGENTS.md:74-81` |

**The promoted matcher's actual accepted grammar** (`shared/pattern-data.js:276-286`) is exactly:

```
accept if  lower(text) === label_lower
accept if  lower(text) startsWith  label_lower + " ·"     ← U+00B7 middle dot
reject otherwise
```

Accepted labels: `Promoted`, `Patrocinado`, `Promu`, `Promovido`, `Beworben`.
`"Promoted by Acme"` is therefore **deliberately not matched** — the design
reason is stated and pinned by a test (`tests/unit/pattern-data.test.js:221-226`
asserts `"Featured by the CEO"` → `false`). This is a *known, tested trade-off*,
not an oversight.

**Container-enumeration boundary (important).** The promoted pass does **not**
reuse the general detection chain. It enumerates candidates only through
`AUTHOR_BLOCK_SELECTORS` (`content.js:45-48`) — `[data-id*="urn:li:activity:"]`
and `.feed-shared-update-v2`, deliberately **excluding** `article`. So a promoted
label on a modern-React-shaped card is not reachable by the promoted toggle. That
is the documented decision at `AGENTS.md:146` / `content.js:49-52`.

### 3.3 Manual Hide / Mute, restore, processed state, mutation handling

| Behaviour | Where |
|---|---|
| Route gate for controls: `/feed/` and `/posts/` only | `content.js:836` |
| Control candidate selectors | `content.js:53-56` (`MANUAL_CONTROL_SELECTORS` = the two legacy post selectors **plus** `[data-testid="mainFeed"] [role="listitem"]`) |
| Modern-shape gate (`expandable-text-box` required, **no nested listitem**) | `content.js:844-849` |
| Author-link selectors (Mute provenance) | `content.js:58-67` |
| `processed` / `forceShow` / `counted` node state | `content.js:76-78` (WeakSets) |
| Blocked-element registry + cosmetic reason bookkeeping | `content.js:83-88` (`blockedPosts`, `labelBlockedPosts`, `cosmeticReasons`) |
| Restore / undo | `content.js:1669` (`restorePost`), `content.js:958` (`blockPost`), `content.js:951` (`getPostKey`) |
| Cooldown after explicit Show | `content.js:93` (`SS_createCooldownStore`, 15 min) |
| Mutation handling | `content.js:1387-1400` (`MutationObserver` on `document.body`, `childList` + `subtree`), `content.js:927-937` (`scheduleInitialScan`, `requestIdleCallback` w/ 2000 ms timeout), 500 ms debounce at `content.js:17` |

**Route scope, stated precisely.** `manifest.json` matches **13** LinkedIn URL
patterns (`/feed/*`, `/in/*`, `/posts/*`, `/company/*`, `/school/*`, `/showcase/*`,
`/groups/*`, `/search/*`, `/mynetwork/*`, `/notifications/*`, `/jobs/*`,
`/newsletters/*`, `/pulse/*`). But **broad URL matching is not broad control
support**: manual controls attach only on `/feed/` and `/posts/` (`content.js:836`);
the Featured filter is `/in/`-only (`content.js:815`); the promoted filter has no
route gate but is bounded by its container selectors.

### 3.4 Existing tests and fixtures

| Suite | Content | Result at `2fb25e3` |
|---|---|---|
| `tests/unit/post-container.test.js` | 13 tests: both strategies, depth bounding, fallback gating, throwing strategies, comment-preference (light + heavy threads), plan-059 cases | pass |
| `tests/unit/pattern-data.test.js` | 62 tests incl. the full label envelope `:199-226` | pass |
| `tests/unit/cooldown-store.test.js` | 7 tests | pass |
| `tests/extension-smoke.js` | Playwright e2e, unpacked extension + mock feed | pass |
| `tests/extension-interactions.js` | 3 365 lines; promoted toggle on the **legacy** shape `:1404-1470`; promoted × allow-phrase `:1785-1810`; popup quick-hide `:3196-3215`; **modern-shape manual controls + fail-open** `:3111-3150` | pass |
| `tests/helpers.js` | Shared `mockLinkedInFeed` fixture `:12-44` | — |
| `plans/research/068` | 10 **synthetic** Suggested-label fixtures, 17 detector tests, **`realSampleCount: 0`** | `insufficient-data` |
| `plans/research/071` | Donation+sanitisation protocol; `cases-real.json` is `[]` | `insufficient-data` |
| `plans/research/075` | Drift-tripwire spike (counts only, console-only), 11 tests | `proceed` (build not planned) |

### 3.5 Genuinely missing — and it is not a selector gap

`shared/pattern-data.js` has **no `SUGGESTED_*` constant** and `content.js` has
**no suggested or connection-activity code path** — the only mention is the
comment at `content.js:49-52` explaining why the modern selector is manual-only.

The gap is **evidence, not code**, and the repo already knows it. Two independent
internal research spikes reached `insufficient-data` specifically because
`realSampleCount` was 0:

* **068** — the Suggested-label candidate detector exists as a prototype with 10 synthetic fixtures and 17 passing tests, but "representative real Suggested label/layout samples with legitimate provenance (no feed scraping performed; all 10 fixtures synthetic)" is unresolved.
* **071** — the capture gate itself: 0 donated captures obtainable, `cases-real.json` literally `[]`, because the protocol forbids automated collection and no contributor session was available.

**This is the single most important fact for judging REA.** The decisive blocker
for suggested-post and connection-activity support is *an authorized, live,
logged-in capture*. Any tool that cannot supply that does not advance the
mission, however good its other surfaces are.

---

## 4. Cases tested, and cases not accessible

| Case | Status | Evidence |
|---|---|---|
| Standard feed post | **Not accessible live**; tested synthetically | fixture `P1`/`P7`; selector counts via baseline probe |
| Promoted post | **Not accessible live**; tested synthetically | fixture `P1`–`P3`; `SS_matchesLabel` run over the captured labels |
| **Suggested post** | **`UNKNOWN / BLOCKED`** | no authorized session; repo protocol forbids automated collection (`071/protocol.md` §1.3) |
| **Connection-activity post** | **`UNKNOWN / BLOCKED`** | same blocker. Whether the reason-for-visibility is exposed to the page is **not established**, and is explicitly *not* inferred from author text |
| Offline: same-case tool comparison | ✅ **Executed** | §5 |
| Offline: static JS analysis of the shipped extension | ✅ **Executed** | §6 |

`LIVE_OBSERVATION_BLOCKED` is stated on three independent checks:

1. **No loopback CDP listener existed before this spike** — `ss -ltn` showed no `9222`/`9223`/`9229`, and `curl` to each `/json/version` failed.
2. **The `chrome-devtools` MCP browser is unreachable by REA** — it runs with `--remote-debugging-pipe` (a pipe, not a TCP port), which `list-browser-targets` cannot consume; it also holds only `about:blank`.
3. **The user's main Chrome has no `--remote-debugging-port`.**

REA's CDP surfaces are attach-only and *never launch a browser* (upstream
`docs/browser-observation.md`: *"REA does not launch, own, or terminate this
browser"*). REA therefore **cannot create the missing target**, and adds nothing
to the one blocker that matters. No authenticated browser profile was copied,
exported, or re-used at any point.

---

## 5. REA vs standard tooling — same case, same page

To make the comparison fair, the baseline did not use a *different* page: a
Playwright probe attached to the **same** CDP browser and the **same** page that
REA had just captured, and read the same structural facts. Read-only; synthetic
content only.

* Fixture: `/tmp/opencode/rea-pilot/fixture/feed.html`, sha256 `f5c3417e…9b0a`
* Baseline probe: `/tmp/opencode/rea-pilot/baseline-probe.cjs`, sha256 `dffc4b9f…7366`
* REA capture: `/tmp/opencode/rea-pilot/inspect-default.json`, sha256 `2e7617d8…fd93`

| Question | REA finding (evidence) | Baseline finding | Incremental info | Confidence | Actionable? |
|---|---|---|---|---|---|
| `[data-id*="urn:li:activity:"]` count | **unrecoverable** — DOM nodes expose `attribute_names` only, never values (`ev_983c81bb…210ba`) | `2` | **none — REA strictly less** | observed | no |
| `.feed-shared-update-v2` count | **unrecoverable** — class value omitted | `2` | none | observed | no |
| `article` count | recoverable (tag names retained) | `0` | none — both recover | observed | no |
| `[data-testid="mainFeed"] [role="listitem"]` count | **partial** — `role=listitem` × 7 in the accessibility tree, but the `data-testid` value is omitted | `7` | none | observed | no |
| `[data-testid="expandable-text-box"]` count | **unrecoverable** | `5` | none | observed | no |
| Label text (`Promoted`, `Promoted · …`, `Promoted by …`, `Suggested for you`, `… likes this`) | **unrecoverable** — text nodes give `node_value_length` only | all 6 strings exactly | none | observed | no |
| Actor `href` values | **partial** — `metadata.dom_urls`, origin-scoped | `2` | none | observed | no |
| Extension's `SS_matchesLabel` envelope over those labels | n/a — REA does not execute the extension | `Promoted`→true, `Promoted · X`→true, `Promoted by X`→**false**, `Suggested for you`→false, `X likes this`→false, discussion→false | none — baseline is executable in one `node -e` | observed | no |
| "What calls `blockPost`?" / "which tests cover `findPostContainer`?" | not exposed by the returned graph (36 edges: `loads` 8, `contains` 23, `exposes` 3, `maps_to` 2) | CodeGraph answers in **one call** incl. callers, blast radius, covering tests | none — baseline faster and cheaper | observed | no |

**Novel findings: 0.**

The reason REA is strictly less here is a deliberate, documented design choice,
not a defect. Upstream `docs/browser-observation.md`, on data minimisation:

> "DOM snapshots retain node types, node names, value lengths, and attribute names, but not text or attribute values."

and there is **no opt-in that changes it**: `inspect-web-page`'s flags are
accessibility text, console text, JSON body shapes, WebSocket shapes, script
sources, storage keys and storage fingerprints — none enables attribute values or
DOM text. Since this product keys on *attribute-value substrings*
(`[data-id*="urn:li:activity:"]`) and on *text* (bait regexes, label matching),
REA's passive capture is structurally blind to exactly the signal the product
depends on.

### Cost/benefit

| Dimension | REA | Existing tooling |
|---|---|---|
| Setup | `npx -y rea-agents@latest` works; needs a separately started CDP browser for any CDP surface; MCP absent, so CLI-only | already wired: `npm ci`, Playwright Chromium cached, xvfb-run present, CodeGraph index present |
| Time to first evidence | ~2 min (npx download + browser start + discovery) | ~0 — `npm run test:extension` already green |
| Evidence granularity | high quality: content-addressed `evidence_id`, per-relation confidence, explicit `limitations`, explicit `unknowns` | ad-hoc assertions, but sufficient and executable |
| Signal for *this* product's decisive questions | **insufficient** (no attribute values, no text) | sufficient |
| Privacy posture | strong by default; conservative opt-ins left off | equivalent for our own fixtures |

The evidence *discipline* is the best thing REA brings: every claim carries an
`evidence_id`, an authority, a confidence and a limitations list, and absent facts
stay explicitly absent rather than silently empty. That is a genuine strength —
but for this pilot it is a strength applied to questions we could already answer.

---

## 6. Static analysis of the shipped extension

Bounded question: *does REA's static JS analyser recover anything the
already-installed CodeGraph/tsc/eslint stack does not?* Target was an **isolated
copy** of the shipped files (`/tmp/opencode/rea-pilot/ext-tree`, 18 files, 364 K),
never the repo working tree.

**It ran, and it is deep** (`ev_a499b8e1…6970`, subject sha256 `215f586a…ff57`):

* 13 relevant files, 8 JS files parsed, **21 968 AST nodes**, 0 parse failures, 295 588 bytes read.
* High-level `graph`: **27 nodes / 36 edges** — relations only `loads` (8), `contains` (23), `exposes` (3), `maps_to` (2); node kinds `artifact` 6, `javascript-asset` 8, `javascript-module` 11, `electron-renderer` 2; coverage `partial`.
* `semantic_graph`: **14 895 nodes / 13 597 relations**, including `calls` **360**, `returns-to-call` 273, `argument-to-parameter` 377, `captures` 1 561, `reads` 3 435, `aliases` 4 353, `registers-listener` 7, `schedules-timer` 14. Node kinds: `expression` 10 318, `call-site` 1 754, `property-slot` 1 025, `binding` 722, `function` 383.

So REA *does* build a real, typed, scope-aware call graph — deeper than what
CodeGraph indexes. But three facts blunt it for this repo:

1. **The high-level `graph` doesn't expose it.** The convenience view returns only artifact/module containment; the call graph is buried in a **24.7 MB** `semantic_graph` payload that a caller must post-process by node id.
2. **It is Electron-shaped.** For a browser extension the summary is near-empty: `browser_windows` 0, `preload_entrypoints` 0, `context_bridge_apis` 0, `ipc.operations` 0, `utility_processes` 0, `native_addon_bindings` 0, `modules` 0. The analyser's model (windows, preload bridges, IPC channels) does not describe an MV3 content script.
3. **The repo already has a better-fitting tool.** CodeGraph is indexed at `plans/../.codegraph`, answers symbol/caller/impact questions in one call, and correctly surfaced `plans/research/075/drift-fixtures.test.cjs` as a covering test for `findPostContainer` — useful context REA did not surface.

**Not claimed:** this is analysis of *our own* extension, not of LinkedIn's
browser application. No conclusion about LinkedIn's DOM is drawn from it.

**Phase-D disposition:** the one genuinely differentiated REA surface for this
mission would be `analyze-web-bundle` — recovering chunk edges, route candidates,
endpoint candidates and source maps from a *real* page. It was run and returned
`scripts_observed: 0` against a script-free fixture (`ev_9a06a87e…6409`), so it is
recorded as **capability-verified but `NOT_APPLICABLE`** on this target. No
synthetic bundle was manufactured to force a benchmark.

---

## 7. Top three actionable improvements

Ranked. Note upfront: **the correct action for this pilot is no production code
change.** Two of the three items below are therefore about the *next* pilot, and
the third is a small guard. Every item names its pre-existing equivalent, and
none duplicates shipped work.

### 1. Do not integrate REA now; make the next attempt evidence-gated, not tool-gated
*Pre-existing equivalent:* none — this is a scoping decision. There is currently
no REA documentation in the repo.
**Files:** `plans/research/078/` (this branch), optionally a one-line row in `plans/README.md`.
**Regression test:** not applicable (documentation).
**Acceptance criterion:** a future REA attempt states, before running, which *authorized* target it will observe and what fact the existing toolchain cannot already establish. If it cannot name both, it does not start.

### 2. Re-run plan 071 before any REA re-test — the capture, not the tool, is the gate
*Pre-existing equivalent:* `plans/research/071/` already defines the donation and sanitisation protocol and is `DONE` with `insufficient-data`. This item **reuses** it; it does not rebuild it.
**Files:** `plans/research/071/{protocol.md,cases-real.json}`, and 068's detector.
**Regression test:** `node --test plans/research/068/detector.test.cjs`, `node --test plans/research/071/probe-extensions.test.cjs` — both must stay green with the donated entries added.
**Acceptance criterion:** ≥3 `real-donated` Suggested positives, ≥2 negatives (one body-mention, one non-English label), ≥1 layout variant — per `071/protocol.md` §3 — then 068 may move off `insufficient-data`. REA's marginal value can only be judged *after* this exists, because until then there is no yardstick.

### 3. (Optional, small) Pin the promoted pass's container-enumeration boundary
*Pre-existing equivalent:* **partial.** `tests/extension-interactions.js:1404-1470` covers the promoted toggle on the legacy `data-id` shape; `:3111-3150` covers modern-shape *manual controls* with fail-open. **Nothing asserts** that a `Promoted` label inside a modern `[data-testid="mainFeed"] [role="listitem"]` container is *not* hidden by the promoted toggle.
**Files:** `tests/extension-interactions.js` only. **No production file changes.**
**Regression test:** one synthetic DOM case — append a modern-shaped listitem carrying a `Promoted` label under `ss_hide_promoted: true`; assert it stays visible while a legacy-shaped `Promoted` sibling is hidden.
**Acceptance criterion:** new case passes, and `npm run smoke && npm run lint && npm run typecheck && npm run test:unit && npm run test:extension` all exit 0.
**Honest caveat:** this freezes a *documented limitation* (`AGENTS.md:146`), it does **not** fix an observed LinkedIn defect. It is a guard against accidental behaviour change while the 068/071 gates remain open. **Not implemented in this pilot** — the pilot produced no directly observed LinkedIn false negative that would justify new fixtures, and adding one risks pinning a limitation the roadmap intends to remove. Recommend it only as an explicit operator choice.

---

## 8. Privacy and access boundary

* **No live LinkedIn account access.** The only browser this pilot attached to was a Chrome started *by the pilot* with a fresh throwaway profile (`--user-data-dir=/tmp/opencode/rea-pilot/chrome-profile`), loopback-bound, with `--disable-extensions`. It was never pointed at `linkedin.com`, logged in, or given any credential.
* **No profile was reused, exported or transferred.** The user's private Chrome profile and the `chrome-devtools` MCP profile were left untouched.
* **No sensitive capture exists to discard.** Every observed page content was synthetic placeholder text authored for this pilot. Nothing observed contained a member name, post body, real URN, profile slug, cookie, token or storage value.
* **REA defaults were left conservative.** `include_accessibility_text`, `include_console_text`, `include_script_sources`, `include_storage_keys`, `include_storage_fingerprints`, `include_json_body_shapes` and `include_websocket_shapes` were all **off**. The capture reports `storage.values_redacted: true`, `accessibility.text_capture.status: not_approved`, and DOM text/attribute values absent by construction.
* **Nothing sensitive was committed.** The documents in `plans/research/078/` contain only synthetic placeholder strings, selector names already public in this repo, and REA `evidence_id` hashes. No raw REA dump (`inspect-default.json`, `js-app-final.json`, `semantic_graph`) is added to version control; those stay in `/tmp/opencode/rea-pilot/`.
* **No circumvention.** No CAPTCHA, auth wall, rate limit or access restriction was bypassed, and no scraping at scale was attempted. One loopback fixture server and one local browser were used.

---

## 9. Final recommendation

# `INCONCLUSIVE — LIVE EVIDENCE UNAVAILABLE`

**Why this and not `NO-GO`.** The offline comparison *was* completed, and REA
demonstrated **zero** incremental value in it (novel findings: 0; strictly less
informative than Playwright on the same case; redundant with CodeGraph on static
analysis). On that scope alone a `NO-GO` would be tempting. But it would be an
overreach: the offline target was **this repo's own fixture and source**, where by
construction no external tool can outperform having the source. The mission's
decisive behaviours — the Suggested-post marker and connection-activity
provenance on a real feed — were **never exercised**, because no authorized live
target exists and this repo's own governance forbids automated collection. The
prompt's own definition fits exactly: *"the decisive LinkedIn behaviors were
inaccessible and no credible comparison can establish REA's advantage."*

**Why not `BLOCKED — REA UNAVAILABLE`.** REA itself was usable. Version 6.4.0 was
resolved, and four operations ran to completion and returned Evidence
(`list_browser_targets`, `inspect_web_page`, `analyze_web_bundle`,
`analyze_javascript_application`) despite `doctor` calling the host unsupported.
The blocker is target access, not the tool.

**What would change the verdict, and what would not.** A contributor-donated,
sanitised capture (per `plans/research/071/protocol.md`) is the unlock — and note
that it unblocks the **product** question first; REA's marginal value can only be
measured afterwards. Merely granting an authenticated browser would *not* by
itself justify REA, because REA's capture omits the attribute values and text the
product keys on; a donated capture plus a Playwright-equivalent baseline would
still be the more direct route.

---

## 10. Integrate REA into the Control Plane?

**No — not now, and not as a mandatory provider.** From an inconclusive pilot,
mandatory global integration is unsupported by the evidence. The concrete
positions:

* **Mandatory / default provider:** rejected. No demonstrated incremental value.
* **Optional, on-demand investigative provider:** **defensible only under an
  explicit gate** — a named, authorized target plus a fact the existing stack
  cannot establish. Under that gate REA is attractive for one narrow reason: its
  Evidence discipline (content-addressed ids, authority, confidence, explicit
  `unknowns` and `limitations`) is a genuinely better audit trail than ad-hoc
  Playwright probes.
* **As a runtime component of the extension:** **never.** REA must stay outside
  the shipped extension. The extension still has no runtime network calls, no
  telemetry, no remote AI, and only `storage` + `contextMenus`.

**Unblock condition for revisiting:** a sanitised, donated real-feed capture
exists (071 gate satisfied) **and** a bounded question is named that the
Playwright + jsdom + CodeGraph stack cannot answer. Until both hold, do nothing —
see `REA_NEXT_ACTIONS.md`.

---

### Appendix — reproduction commands

```bash
# baseline (all exit 0 at 2fb25e3e9f893d34a4b2a3df85b415cd8b80a669)
cd /home/carlos/VS_Code_Projects/tools/stop-spam-linkedin
git remote -v && git branch --show-current && git rev-parse HEAD && git status --short
node --version && npm --version
npm ci && npm run smoke && npm run lint && npm run typecheck && npm run test:unit
npm run test:extension

# REA readiness (CLI only; MCP not registered)
npx -y rea-agents@latest --version                      # 6.4.0
npx -y rea-agents@latest doctor --json

# controlled offline experiment (own fixture + own loopback CDP browser)
node /tmp/opencode/rea-pilot/serve.cjs /tmp/opencode/rea-pilot 8788
xvfb-run -a /opt/google/chrome/chrome --remote-debugging-port=9222 \
  --user-data-dir=/tmp/opencode/rea-pilot/chrome-profile --password-store=basic \
  --no-first-run --no-default-browser-check --disable-extensions \
  --disable-component-update --disable-background-networking \
  http://127.0.0.1:8788/
npx -y rea-agents@latest list-browser-targets http://127.0.0.1:9222 --format json
# <TARGET_ID> from the previous command's output — discovered at runtime, never fabricated
npx -y rea-agents@latest inspect-web-page http://127.0.0.1:9222 <TARGET_ID> --format json
npx -y rea-agents@latest analyze-web-bundle http://127.0.0.1:9222 <TARGET_ID> --format json
node /tmp/opencode/rea-pilot/baseline-probe.cjs <TARGET_ID>   # same page, standard tooling
npx -y rea-agents@latest analyze-javascript-application \
  /tmp/opencode/rea-pilot/ext-tree --artifact-format directory --format json
```

`<TARGET_ID>` is browser-instance-specific; re-discover it on every run.
