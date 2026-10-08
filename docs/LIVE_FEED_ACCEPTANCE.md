# Live LinkedIn acceptance and source-filter research gate

**Date:** 2026-10-08 · **Status:** Testing protocol, not a claim of live-site coverage.
This document is deliberately separate from synthetic Playwright fixtures. Browsers logged into LinkedIn may receive different, evolving DOM layouts.

## 1. Verify the shipped actions before accepting this PR

In Chrome and Firefox, on an account used with its owner's permission:

1. Open the LinkedIn home feed with posts that have the older activity URN markup, if available. Check that Feed options appears once per recognized post, with no other page elements covered.
2. On any newer React mainFeed/listitem posts: verify the control appears *only* on actual feed posts, never nested comments or navigational list items. Author mute is offered only when its identity can be identified. Unknown layouts may have no control—fail open.
3. On a normal post, open Feed options with mouse, keyboard (Tab + Enter/Space) and touch-like input; Escape and clicking outside close the menu.
4. Hide that post, Show it, and hide it again. The action is reversible and must not increase automatically detected-spam counters.
5. Mute a known author, restore author from the existing blocklist/options, and verify new posts from the same author respect the preference.
6. Toggle promoted hiding off/on/off on an actual recognized promoted post. Ordinary posts stay visible. A false positive must be recoverable.
7. Check native post composer, interactions, job searches, profile pages, notifications, messaging, sidebar and search do not disappear or stop working. Check a quoted/reposted item and a comment thread.
8. Test page navigation without a full reload, infinite scrolling, replacing a rendered node and two LinkedIn tabs. Ensure no repeated controls or flicker that breaks interaction.
9. Repeat with Spanish LinkedIn UI and system light/dark themes. Check narrow windows and reduced-motion/keyboard focus.
10. Revisit the first-run screen in each browser: promoted remains off until chosen; success/failure is announced correctly; no duplicate What's New.

**Release stop conditions:** a hidden essential native control; an unrequested automatic hide on an unsupported layout; a saved author action that silently fails; data leaving the browser; a broken Show/Undo path; a keyboard-inaccessible control; or any untested expansion of automatic source filtering.

## 2. What evidence is still missing for automatic Suggested filtering

Existing research artifact: [plan 068](../plans/research/068/verdict.json) concluded insufficient-data with **zero real DOM samples**. Plan [067](../plans/research/067/verdict.json) had a development corpus but no independent representative holdout. Neither warrants a production recall/precision claim.

Other open-source projects report that LinkedIn has used both legacy data-id activity cards and a React mainFeed/listitem model; examples: [lkclean](https://github.com/stefw/lkclean), [LinkedIn feed-blocker](https://github.com/andrewpollack/linkedin-feed-blocker), and a [2025 documented Suggested marker](https://blog.georgovassilis.com/2025/05/27/hiding-suggested-linkedin-posts/). These sources give **hypotheses to verify**, not first-hand 2026 authenticated examples.

Obtain real, consent-reviewed **metadata-only** examples from the actual feed:
- A true Suggested post with its header marker and the nearest post-boundary structure.
- A normal network post; an explicit Promoted post; a connection's original post; an activity-amplified post; a repost-with-comment; and a post that merely includes the word Suggested in body text.
- Both legacy and new React structures where available, different language labels and missing-marker cases.
- For every sample, record collection date, browser/version, LinkedIn UI language, pathname, classification rationale, whether the post is original/repost/quoted, and a provenance label distinguishing *real-sanitized* from *synthetic*.

**Privacy and consent rules:** Do not automatically crawl a user's feed. Do not copy full post HTML, names, profile URLs, activity IDs, email, session cookies, CSRF tokens, tracking IDs, or authored content into a public issue or fixture. Prefer a hand-reviewed sanitized header/ancestor structure with tag names, non-identifying selector attributes and placeholder content. Owner consent precedes collection and public sharing. Never transmit the sample automatically.

## 3. Source-filter implementation gate

1. Classify using verified *header/provenance metadata*, not substrings in body text or guessed AI quality.
2. Set a new source filter **off by default**; support an explicit explanation and Show action. Only recognized post containers are eligible.
3. Define narrow supported layouts/locales and fail open elsewhere. Protect composer, search, messages, jobs, post interactions and nested comments.
4. Build independently labeled real positive and negative holdouts, use existing plan 068/067 harnesses, and show confusion counts plus uncertainty; synthetic regression cases never enter public accuracy figures.
5. Run Chrome/Firefox packaged and unpacked e2e; verify real site with participant consent and save signed-off manual acceptance results.
6. Only then update the feature flag, store claims, screenshots and release notes. No live evidence = no shipping automatic Suggested/activity hiding.

## 4. First-minute / week-one UX study

Test 10 real desktop LinkedIn users (5 jobseekers, 5 regular professional users); do not need to read or retain their feed contents. Ask them to install, identify the main benefit, hide/restore a post, optionally mute a repetitive author, and perform a normal job search/message. Observe confusion and broken site controls, then ask after seven days whether the extension remained installed and why.

**Proposed non-observed targets:** first successful action in 60 seconds, at least 9/10 can undo without help, zero critical native interaction breakages within tested cases. Public store ratings, clicks and install counts by themselves do not measure ongoing usefulness.

## 5. Screenshot publication checklist

Current `screenshots/` assets are from older builds and promo SVG is conceptual. Before publishing, replace them with faithful captures of the actual tested UI: first-run selection, real post with Feed options, a real reversible hide, popup controls and protected native site interaction. Use only consented/sanitized content. Do not claim Suggested filtering in screenshots unless it has passed section 3.
