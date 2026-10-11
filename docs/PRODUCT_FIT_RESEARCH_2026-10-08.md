# LinkedIn Feed Control — evidence-led product direction

**Research date:** 2026-10-08. **Technical baseline:** `cortega26/stop-spam-linkedin`, `main`, commit `5a1ef53d4efdb4f1cff4b94abe7763c1030c1d5b`. The 2.0.0 revamp from PR #3 is merged. The default branch includes subsequent Codex P2 fixes. **No implementation is authorized merely by this research document.**

## Executive decision

**Proposed primary job-to-be-done:** *Use LinkedIn for the people and opportunities you care about, without an algorithmic feed you did not ask for.*

**Customer-facing promise to validate:** **"See your network. Skip the noise."**

The strongest under-served complaint is not the original `comment X for a file` bait; it is **suggested posts from strangers**, followed by **activity-amplified posts from connections' likes/comments**, sponsored material, repetition, and loss of control. These are **user-reported pains**, not yet evidence that any specific filter can be implemented safely on today's LinkedIn DOM.

A strong product should sell an immediate result and deliver it in one session. **Do not add AI classifiers, opaque relevance scores, or elaborate presets to substitute for the missing site-specific evidence.**

## Evidence and limits (fetched October 8, 2026)

### A. Comparable store adoption — public figures, not retention

| Product | Listed audience and score | Main benefit | What to learn / what NOT to infer |
|---|---|---|---|
| [Unhook](https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid) | 1,000,000 Chrome users, 4.9/5, ~4.6k ratings | Remove recommendations and distractions while preserving purposeful viewing | A clear, recurring use case can coexist with many granular controls. Does **not** prove which controls produced adoption. |
| [News Feed Eradicator](https://chromewebstore.google.com/detail/news-feed-eradicator/fjcldmjmjhkklehbacihaiopjklihlgg) | 200,000 users, 4.7/5, ~2.3k ratings | Use social networks without the attention trap | Simple promise, visible effect, preservation of other useful features. |
| [SocialFocus](https://chromewebstore.google.com/detail/socialfocus-%E2%80%94-hide-feeds/abocjojdmemdpiffeadpdnicnlhcndcg) | 70,000 users, 4.5/5, ~204 ratings | Granular per-site distraction control | Consistent per-category toggles and easy pause, but a larger product scope. |
| [LinkOff](https://chromewebstore.google.com/detail/linkoff-filter-and-custom/maanaljajdhhnllllmhmiiboodmoffon) | 3,000 users, 3.9/5, 59 ratings | LinkedIn filtering/customization | Demand exists, but publisher's broad controls and maintenance story offer no proof of product-market fit. |
| [LinkedIn Feed Filter](https://chromewebstore.google.com/detail/linkedin-feed-filter/kilhiehmjphljfljhdjblghdiickbahh) | 8 users, no demonstrated ratings | Suggested/promoted/keyword filters; experimental on-device AI | A feature checklist, including "AI", does **not** establish adoption. Publisher claims are not tested features. |
| [FeedHole](https://chromewebstore.google.com/detail/feedhole/ichdphlglihfomepafffohifmadfhihc) | 7 users, no ratings | Rules and attribution | Merely implementing complex filtering is insufficient distribution evidence. |
| [Our current public listing](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc) | 5 users, no ratings; 1.6.0 listed | "Comment X and I'll send Y" detection | Current listing targets the *old* pain despite 2.0.0 code having a much broader purpose. |

**Interpretation, with caveats:** The three larger products share a focused benefit that can be demonstrated immediately. Audiences, release dates, distribution, platform scope, budgets, discoverability and maintenance histories differ greatly; these cross-sectional counts **cannot establish retention, conversion, causality or TAM**. Never claim they do.

### B. Unsolicited user problems — strong direction, nonrepresentative samples

- [How to stop suggested posts — r/LinkedInLunatics, Aug 2026](https://www.reddit.com/r/LinkedInLunatics/comments/1vf6ncl/how_to_stop_suggested_posts/): >1,000 post votes; explicit desire to turn off irrelevant Suggested posts rather than repeatedly dismiss them.
- [Is anyone else's LinkedIn feed full of irrelevant posts? — r/linkedin, Oct 2, 2026](https://www.reddit.com/r/linkedin/comments/1wvquj2/is_anyone_elses_linkedin_feed_full_of_irrelevant/): new posts from strangers; frustration with native Not Interested; interest in keeping network/jobs useful.
- [How do I stop seeing suggested posts in my feed? — r/linkedin, 2023–2026](https://www.reddit.com/r/linkedin/comments/16f71lx/how_do_i_stop_seeing_suggested_posts_in_my_feed/): years of unresolved recurring posts; some "Most recent" settings helped some users temporarily, others report inconsistency. Check native controls before claiming a missing option.
- [Avoiding connections' liked posts while keeping job posts](https://www.reddit.com/r/linkedin/comments/18fq9jc): a very specific and potentially valuable behavior—filter the distribution mechanism, not the topic or author.
- [Unhook Firefox reviews](https://addons.mozilla.org/en-US/firefox/addon/youtube-recommended-videos/reviews/): specific praise for ~30-second customization, keeping useful page areas, and avoiding recommendation rabbit holes; complaints about broken updates, overlay conflicts, performance and related-content removal.
- [LinkOff Firefox reviews](https://addons.mozilla.org/en-US/firefox/addon/linkoff-clean-your-feed/reviews/): users appreciate effective cleanup; multiple "doesn't work" reports explicitly attributed by the maintainer to LinkedIn's changing selectors.
- [News Feed Eradicator issue #540](https://github.com/jordwest/news-feed-eradicator/issues/540): a feed hider interfered with composing a LinkedIn post. **Never hide a parent container that also holds essential site actions.**
- [News Feed Eradicator contributor guidelines](https://github.com/jordwest/news-feed-eradicator): its maintainer favors a minimal completed feature set over unlimited product scope.

**Limitations:** Reddit is self-selecting and often negative; votes are not user counts or purchase intent. Reviews are selected anecdotes, not random samples. Need genuine usability sessions, not inference from popularity.

### C. Platform standards — factual

- [Chrome Store discovery](https://developer.chrome.com/docs/webstore/discovery): quality, visual design, purpose clarity, intuitive setup, ratings, and downloads **versus uninstalls** influence discovery. Conversion without post-install retention does not solve ranking.
- [Creating a great listing](https://developer.chrome.com/docs/webstore/best-listing): screenshots must show the **real** feature in action, full-bleed, 1280×800/640×400, ideally five; short accurate summary first; small promo image 440×280 and marquee 1400×560.
- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies): narrow, clear single purpose, nonmisleading metadata, accurate privacy disclosures and safe permission handling.
- [Mozilla Recommended Extensions criteria](https://support.mozilla.org/en-US/kb/recommended-extensions-program): exceptional function, secure code, delightful UX and ongoing maintenance.

## Current repo facts vs research suggestions

**Verified implementation on main (Oct 8):** Manifest V3, Chrome+Firefox, `storage` + `contextMenus`, no new runtime requests; custom phrase/rule system; author blocklist/allowlist; optional promoted filter; reversible manual hide and author mute; localized EN/ES UI and five detection languages; initial popup/settings redesign; local counters; import/export; safe legacy-rule review. A full browser CI suite exists. The 2.0.0 release remains **unpublished in the public Chrome listing checked** (still 1.6.0, 5 users).

**Existing solution to reuse:** Plan [068 verdict](../plans/research/068/verdict.json) has 10 synthetic Suggested-label fixtures, 17 detector tests, and **zero real examples**. It concluded `insufficient-data`. Plan [067 verdict](../plans/research/067/verdict.json) has evaluator tooling but **no representative independent holdout**. Do **not** relabel synthetic tests as real accuracy. Do not rebuild duplicate modules when those prototypes can be reused.

**Not verified:** Stable current LinkedIn Suggested label DOM, connection-activity metadata, all locales, actual user engagement with in-post actions, first-install activation rate, cross-browser current page behaviors, or store listing conversion/retention. Every item is a discovery or acceptance gate, not a shipping claim.

## Recommended product architecture

### 1. The three user journeys (the first is most important)

**A. "I want to see my network, not random suggestions."** (primary)
- A deliberately opt-in **"Reduce suggested posts"** control.
- Hide only recognized feed-level "Suggested" metadata, not any text containing the word.
- Must have real, consent-provided structural fixtures, several feed states, comment/quote/repost negatives, localization boundaries, live DOM pilot and Chromium+Firefox verification.
- Fail open on unknown layouts. Never hide jobs/search/compose or private messages.
- **Release decision is BLOCKED on real DOM evidence.** The 068 prototype provides scaffolding, not a passing deployment gate.

**B. "Don't show me the random posts my contacts liked."** (second bet)
- Hypothesis: a meaningful number of users want original posts from their network but not tertiary activity propagation.
- Validate that LinkedIn exposes stable, unambiguous **post provenance metadata** (e.g. "X liked this") independently from content/body text and nested components. Evaluate localized variants.
- If not reliably observable, don't ship. Do not infer author relationship from incomplete UI.
- Do not claim "Connections only" or "followed only" unless we can actually determine relationship accurately.

**C. "Let me say 'not this' once, and trust the result."** (already partly implemented)
- Progressive action: one unobtrusive **Hide** button that exposes options *Hide this post*, *Mute this author*, *Hide this content category* (only where the latter is objectively supported).
- Default view: icon/action shown on hover **and** keyboard focus, not permanently plastered with multiple buttons. Touch alternatives as supported. Keep native actions and nonpost navigation untouched.
- Clear, local explanation ("Hidden because: promoted", "Hidden by your rule", "Hidden at your request"). Inline undo.
- Reviewable effective rule list; no silent changes, no AI guesswork, no tracking.
- P0 polish: clean up existing two-button permanent insertion on every recognized feed post, provided it can be done without sacrificing accessibility.

### 2. Optional focused workflow (only if validated)

**"Open LinkedIn for work, not scrolling"**: a user-selectable session mode that hides the home feed while leaving Jobs, Messaging, Search and compose unaffected. If we cannot guarantee all those unaffected pathways, do not ship. This is a recognizable competitor feature, not a new moat. Investigate user demand among jobseekers before prioritizing.

### 3. Retention through correctness, not gamification

- A strong 45-second first-run experience, with no mandatory account/sign-in and no big settings wizard: pick one problem, show a before/after effect in live LinkedIn or an explicitly labeled demo, and **one-click undo**.
- Default conservative filter. No complex profiles, categories or scoring until user research supports the complexity.
- Keep granular settings in a secondary screen, with accessible keyboard navigation and screen-reader language.
- Minimal local-only feedback ("Visible impact today", optional) is preferable to ungrounded "minutes saved" claims.
- A failure mode is visible and honest: if structural detection becomes unsupported after a LinkedIn change, say so and **fail open** rather than blank the feed.
- Technical reliability includes initial load, infinite scroll, virtualized/replaced posts, rescans, layout drift, multi-tab toggles, good performance, Chrome/Firefox, localization, site actions and slow machines.

## Conversion experience: what the user sees

### A. Chrome Store listing — five 1280×800 real captures, not mockups

1. **Core before/after:** same genuine LinkedIn feed, suggested/promoted content filtered; show one useful ordinary post retained. Capture only after feature ships. Crop/sanitize real private content with consent.
2. **One-click control:** contextual Hide -> Undo, with natural unobtrusive UI.
3. **Quiet the noise:** popup, 1–3 top-level controls and visible enabled status.
4. **Keep LinkedIn useful:** Jobs, messaging, compose and navigation still usable in same browser; grounded feature demonstration.
5. **Trust:** bilingual settings and rule explanation, precise local-only privacy statement.

Marketing visuals: original simple icon with readable 16/32/48/128 forms; cohesive light/dark UI; no giant unrelated image in popup; 440×280 promo and optional 1400×560 marquee; truthful Chrome/Firefox screenshots. Do not imply live features that are not yet implemented. The current repository has image HTML assets and PNG screenshots; visually inspect those before reuse.

### B. Suggested README hierarchy (no empty superlatives)

**Headline:** `LinkedIn, without the feed you didn't ask for.`

**Subhead:** `Keep LinkedIn useful for work and relationships. Hide unwanted posts and authors in one click, filter promotions, and customize what you see—privately in your browser.`

**Three proof points:** `One-click Hide & Undo` • `No account or analytics` • `Chrome + Firefox`.

**Primary visual:** screenshot/GIF of actual use—not badges and text. One screenshot should show the user gets something **today**, without a settings tutorial.

**First CTAs:** "Install for Chrome" and "Get for Firefox" linking to the verified current stores. Below that: 30-second "what happens after install" and only then feature explanations, known limits, FAQ, source/developer/maintenance links. Avoid unsupported "AI-free means better" rhetoric or claims of account data never being stored (saved author IDs are preferences).

**Critical truth:** "Hide suggested posts" must remain **future/experimental** until evidence and code ship. In copy today, lead with what 2.0.0 can actually do: manual Hide, mute authors, promoted filter, bait patterns.

### C. Popup and settings polish

- Short popup with an obvious ON/OFF state, *promoted* (supported) switch, Hide/Undo education and one advanced-settings link.
- Avoid leading with lifetime spam counts: they can be zero even when the extension is useful. Present counters as secondary.
- Keep dark/light mode consistent with host/browsers; avoid multiple conflicting stylesheets accumulating per version.
- Keep one primary action at a time; remove redundant buttons/stat-reset from the first viewport when appropriate.
- Ensure all controls are accessible by keyboard, not exclusively hover.
- Support an offline state gracefully when no LinkedIn tab is open.

## Priorities, evidence gates, and proposed acceptance

| Order | Work | Evidence | Gate to ship |
|---|---|---|---|
| P0 | Reposition discovery around real **existing 2.0.0 capabilities**; update actual store copy after release, simplify README top, create truthful screenshots | Official CWS image/discovery standards + current outdated public 1.6.0 listing | Screenshot matches published version, localized copy accurate, links work, visual QA |
| P0 | Make in-feed Hide/Mute subtle + keyboard-accessible; preserve Undo and native compose/navigation | Current code and competitor "broken UI" review patterns | No native action blocked; meaningful keyboard/focus interaction; real feed evidence |
| P0 | First-install activation and trust walkthrough | Unhook reviews praise 30-second setup | 5–10 users, task success measured, no accounts; no silent auto-filter beyond safe defaults |
| P1 | **Suggested** source filtering (highest user-demand signal) | Recent Reddit posts + preexisting plan 068 | Real DOM examples, independently labeled positives/negatives, exact provenance, multi-locale scope, Chrome+Firefox, fail-open |
| P1 | Reaction-amplified content filter | LinkedIn user complaints | Real stable activity metadata and negative tests; otherwise reject |
| P2 | Local explanation/undo diagnostics | Unhook/LinkOff negative reviews | No hidden content incorrectly claimed as spam; no unexpected persistent content storage |
| P2 (optional) | Focus/session mode with optional friction | News Feed Eradicator/Unhook | User test confirms value, preserve essential LinkedIn pathways, no coercive controls |
| DEFER | AI-slop/humblebrag sentiment scoring, gamification, opaque feed ranking, community rule cloud, scraping | No measured differential benefit or stable labels | Do not start without a proper research gate |

### Suggested usability research (small, measurable, privacy-respecting)

Recruit 10 **real desktop LinkedIn users**, 5 jobseekers and 5 working professionals using LinkedIn for networking/industry content. Give them three tasks without coaching:

1. Install from store/README and explain in their own words what the extension does.
2. Hide a post or unwanted author, undo it, and find the corresponding rule.
3. Keep a useful action (post composition, job search or message) while reducing irrelevant content.

Record **aggregate and consented** task success, completion times, observed confusion, errors and whether a user can predict how the filter behaves. Avoid collecting their actual feed content. Ask whether they'd keep the extension, **why**, and check again after seven days. If no organic demand for source-based controls, revisit the positioning rather than engineering more rules.

**Proposed targets** (not observed results): first meaningful result within 60 s; 9/10 can undo unassisted; 0 critical site interactions broken in the test set; 0 collateral hides across a locked set of independently labeled negative fixtures; browser/locale scope stated explicitly; minimal manual steps to install.

## Contrary arguments / red-team

1. **"Suggested-post hiding is enough"** may be false: a competing extension advertises it and has very few store users. Distribution, trust and working implementation still matter. A viral Reddit complaint is not evidence of willingness to install.
2. **"More features = more value"** is contradicted by successful minimalism. Every extra rule creates UX, performance and maintenance costs.
3. **"Don't see it" isn't "See more of what matters."** A local extension can filter currently rendered material; it cannot command LinkedIn to deliver higher-quality posts server-side. Avoid positioning as a new algorithm.
4. **"No tracking"** is a trust advantage, but limits passive analytics. Choose opt-in interviews, support feedback, privacy-preserving self-initiated diagnostics or store aggregate metrics; never inject hidden telemetry.
5. **"Great screenshots sell it"** only if the extension behaves exactly as shown. Source-level Playwright mock feed tests are necessary but cannot replace a real LinkedIn DOM pilot.

## Next executable handoff

**Research-only conclusion. Do not quietly implement the Suggested/activity source filters yet.** Start with a product-facing audit of the current merged 2.0.0 UI and a user-consented evidence collection plan for Suggested-label post headers. Reuse existing 068/067 harnesses and blockers rather than redesigning them. Once representative real samples pass structural/negative gates, build P1 in a narrow isolated PR; retain current main and store version unless explicitly released. Separately, ship P0 conversion/interaction polish using current verified capabilities, with genuine screenshots.

Required for each implementation: branch, SHA, existing-feature check, regression test, real DOM proof for new selectors, Chrome/Firefox, keyboard/motion/dark-mode, privacy & release notes, documented test outputs. No automatic publishing/merge on research evidence alone.
