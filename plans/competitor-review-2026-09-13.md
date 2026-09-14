# Direction and Chrome Web Store comparison — 2026-09-13

Repository baseline: `3986b84`. Scope: product direction, current relevant
code, prior plans/decisions, and eight comparable Chrome Web Store listings.
The user selected all net-positive ideas and requested a competitor comparison.
This report records the resulting choices; no production features were changed.

## Recommendation

Aim to be the most dependable **selective LinkedIn engagement-bait filter**:
clear reasons, easy correction, conservative defaults, and reliable Chrome
and Firefox behavior. Make precision and recovery measurable before expanding
automatic detection. A large feature count or a publisher's accuracy claim
does not establish that an extension works better.

Keep the four previously proposed improvements. Add a reproducible benchmark,
a bounded Suggested-label experiment and a manual hide-once experiment.
New category detection and manual hiding are approved research investments,
not asserted net-positive production behavior before their tests pass.

## Method and limits

Primary evidence was the Chrome Web Store text retrieved in this session.
Seven pages were opened; FeedHole was available through indexed Store text,
while direct opening failed. Two separate products are named LinkedIn Feed
Filter; they are identified below by publisher/item ID.

Features and privacy statements are publisher claims. No competitors were
installed, no packages/source code were copied, no runtime behavior was tested,
and review text was not systematically analyzed. Listing counts/crawl snapshots
varied, so this report does not rank adoption, ratings or freshness.
This is a focused feature comparison, not a comprehensive market survey.

## What to take from each

| Listing | Advertised capability | Decision for this project |
|---|---|---|
| [LinkOff](https://chromewebstore.google.com/detail/linkoff-filter-and-custom/maanaljajdhhnllllmhmiiboodmoffon) | Separate content-type, author, keyword, interaction and age controls; broader page/inbox tools. | Take independently understandable category controls. Evaluate Suggested only first (068); inbox deletion, bulk unfollowing and page cleanup dilute this product's scope. |
| [FeedHacker](https://chromewebstore.google.com/detail/feedhacker/kccajfoghkplakndamlohpepopdpelkb) | Per-category Mute/Solo, recoverable collapsed posts, custom filters and correction-based scoring. | Preserve recoverability and clear attribution (already partly present; strengthen in 064/069). Defer Solo and adaptive scoring; their semantics and false-positive cost are unproven here. |
| [FeedHole](https://chromewebstore.google.com/detail/feedhole/ichdphlglihfomepafffohifmadfhihc) | Shows what was filtered and why; independent rules and thresholds. Indexed listing only. | Take explanations (064). Keep the existing undo/placeholder surfaces instead of inventing a second persistent history. |
| [Frosted](https://chromewebstore.google.com/detail/frosted/njicfilmnofppghmenijpnmkamkfkilb) | Revealable blur, adjustable sensitivity, explicit sharing of locally retained feedback; optional on-device AI. | Take deliberate reporting/correction (063), retaining current placeholders. A slider needs calibrated semantics; AI requires browser/hardware evaluation. Neither is justified by a listing alone. |
| [LinkedIn Feed Filter — Andrea Donatsch, kilh…](https://chromewebstore.google.com/detail/linkedin-feed-filter/kilhiehmjphljfljhdjblghdiickbahh) | Suggested and Promoted labels, custom keywords and experimental on-device natural-language rules. | Take the Suggested-label idea as a default-off, precision-gated experiment (068). Keep current deterministic detection and cross-browser parity. |
| [LinkedIn Feed Filter — mlquiggle, cnpa…](https://chromewebstore.google.com/detail/linkedin-feed-filter/cnpajnghpeedjdbkngifccloklnoiamk) | Author-scoped keywords, company mentions and expandable media; acknowledges filtering may wait for scrolling. | Scoped rules are a possible later refinement, not currently proven demand. Use first-load and dynamic-feed behavior as benchmark dimensions (067). Media collapse is a different problem. |
| [News Feed Eradicator](https://chromewebstore.google.com/detail/news-feed-eradicator/fjcldmjmjhkklehbacihaiopjklihlgg) | Removes the feed while preserving other site functions. | Take the narrow, understandable product promise. Whole-feed removal does not improve selective spam filtering. |
| [Slop Bin](https://chromewebstore.google.com/detail/slop-bin-linkedin-feed-cl/pgnagajcnmhcaailbojpmchnmmjgnnpm) | Explicit per-post dismissal with an animated cursor flow and optional paid focus mode. | Take user-directed hide-once (069), with this project's Show/Show-all recovery. Leave animations, checkout and unrelated focus controls out. |

These are independently designed adaptations of public feature ideas.
The two transfer/backup proposals below come from repository evidence, not a
claim that competitor listings establish demand for them.

## Selected work and tradeoffs

Effort is coarse: S = hours; M = roughly a day or more depending on browser
experiments. “Grounding” describes evidence for the capability/gap, not proof
of demand. There is no high-severity bug ranking in this direction-only pass.

| Plan | Value and repository evidence | Deliverable | Effort / risk / grounding |
|---|---|---|---|
| [063 Report visible missed spam](archive/063-missed-spam-report-build.md) | background.js:13 has no report menu; content.js:1032 reports only blocked text; archived 049:208 already contains a successful design/spike. | Production build plan based on 049, including current comment boundaries and browser checks. | M / MED / HIGH |
| [064 Explain tester outcomes](archive/064-tester-explanations.md) | options/options.js:1763 returns null for exclusions; 1777 already reads live settings. | Verdict model and tested prototype distinguishing pardons, active matches and inactive-rule diagnostics. | S–M / LOW–MED / HIGH |
| [065 Preview settings imports](archive/065-import-preview.md) | options/options.js:828 immediately applies legacy arrays; 856 onward merges/writes categories; 1150 overrides booleans. | Pure staged-merge contract, preview/apply controller proof, explicit concurrency/error behavior. | M / MED / HIGH |
| [066 Export chosen phrase packs](archive/066-selective-phrase-packs.md) | options/options.js:646 includes author/exclusion settings in full backup; 828 already imports bare phrase arrays. | Explicit selection design and serializer that exports only text/mode/enabled. | S–M / LOW–MED / HIGH gap, MED value |
| [067 Detection benchmark](archive/067-detection-benchmark.md) | Existing positive/negative unit fixtures plus mock-feed and comment-container tests; no comparable market accuracy measurement was established. | Reproducible metrics, provenance, real-vs-synthetic distinction, recovery/DOM checks and baseline. | M / LOW implementation risk, MED interpretation risk / HIGH need |
| [068 Suggested-label filter](archive/068-suggested-post-filter.md) | content.js:698 already has an opt-in promoted-label pass; 793 separates cosmetic hides from spam counts. | Evidence-gated prototype; header labels must be distinguished from body/comment mentions. | M / MED–HIGH / MED fit, LOW DOM certainty |
| [069 Hide one item once](069-manual-hide-once.md) | blockPost at content.js:773 and restorePost at 1344 provide hiding/recovery; existing menu actions create persistent rules. | Ephemeral manual-hide design/prototype with no spam-count or preference mutation. | S–M / MED / MED |

063 is the follow-up to existing design 049, not a duplicate new discovery.
064–069 are bounded design/evaluation plans. Executing those plans produces
evidence and a build-ready decision; it does not silently ship their prototypes.
An insufficient-data/no-go result on 067/068 is valid completion of the
research, not a reason to manufacture examples or relax precision gates.

## Execution order

Start with **063 → 064 → 067 → 065 → 066 → 068 → 069**.

- 067's metric/provenance contract is required before 068's proceed verdict.
  068 can inventory sample gaps before 067 finishes.
- 063's selection resolution is the basis for 069. Do not add hide behavior
  to the report action.
- 065 and 066 must agree on legacy phrase-array compatibility. Their designs
  can be separate; any production options changes should land serially.
- Most eventual builds touch options/content/locales and need serial rebases.
  The benchmark can be developed independently in its own research directory.
- No release/version/tag changes are included. Shipping happens through the
  normal release checklist after actual implementation and validation.

## What “better” should mean

1. **Precision:** fixed legitimate controls never regress; representative
   holdout error rates are reported with denominators and per-language slices.
2. **Coverage:** measure recall separately from precision; expose known misses.
3. **Correct target:** never hide an innocent post because a comment matched.
4. **Recovery:** Show, Show all, snooze, disable and exclusions remain reliable.
5. **Clarity:** explanation agrees with effective policy; cosmetic/manual hides
   are never counted as detected spam.
6. **Reliability:** initial render, incremental loading, replaced nodes and
   browser differences have explicit fixtures and observed outcomes.
7. **Privacy and size:** preserve no automatic runtime requests, no new
   permissions or runtime dependencies, and no unrequested content history.

These are proposed acceptance dimensions. No new accuracy measurements or
superiority claims were made during this advisory pass.

## Considered and not selected

- Generic “AI slop,” humblebrag, hiring or motivational-post detectors:
  legitimate professional content overlaps; do not add broad defaults without
  independently labeled negative examples.
- Sensitivity slider: current matcher is deterministic. A calibrated control
  needs a meaningful rule/threshold model and evaluation, not a decorative UI.
- Remote AI/community rule sync: conflicts with the standing local/no-request
  product contract. On-device AI is a separate possible capability, but
  listing claims do not establish Firefox parity, cost, or precision benefit.
- Whole-feed removal, Solo mode, inbox deletion, bulk unfollowing, automatic
  sorting, sidebar cleanup and paid focus modes: outside selective local hiding.
- Blur/removal display modes: previously considered; keep the established
  reversible placeholder and avoid reopening that decision without new evidence.
- Author-scoped phrases: potentially useful, but require new rule identity,
  precedence, author extraction and backup semantics; defer until concrete
  usage demonstrates global phrases/author lists are inadequate.
- Persistent review history or more statistics: existing local undo/attribution
  already provides a base; benchmark quality first. Do not retain post text just
  because a competitor lists a review panel.
- New languages, DM-gating, duration pickers, mobile support: earlier decisions
  remain in force. This comparison supplies no new validation for them.

## Verification and handoff

At unchanged source revision 3986b84, smoke, lint, checkJs and unit tests passed
in this session. The runner summarized three passing unit test files; this
report does not repeat stale individual test counts from historical plans.
Browser suites were read from package.json/CI, not run in this advisory pass.

Only plans/ files are changed. Plan links, required sections and diff whitespace
are checked before handoff. Commit the plan files and updated index before
dispatching isolated executors so the worktrees receive the same specification.
No GitHub issues, messages to publishers, store submissions or source edits
are authorized by this planning output.

