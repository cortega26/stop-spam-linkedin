# Feed Control V2 — Product, UX and release gates

**Base verified:** `cortega26/stop-spam-linkedin`, `main` at `9b908d944a6c11463d71188df46946c7c1f2846a` (2026-10-08). The shipped 1.6.0 state used heuristic engagement-bait patterns, whitelists, author blocklists, opt-in promoted/featured hiding, local stats and a rule tester. This branch adds user-facing features and a frontend redesign.

## Product promise

**Choose what stays in your LinkedIn feed, instantly, without handing your data to a second service.** The permanent pain isn't one spam phrase; it's the time lost to unwanted posts and too many options scattered across LinkedIn.

### Verified implementation on this branch (not yet published)

1. One-click manual hide on known feed post containers; Hide action does not count as detected spam.
2. One-click author mute on known author-linked feed posts, persisted through existing author rules.
3. Immediate enable/disable of promoted hiding from popup and selective restoration on disable.
4. New popup information hierarchy, typography, contrast, responsive dark mode and direct advanced-settings route.
5. Settings hero, section navigation and card layouts; safely narrowed optional starter phrases.
6. Rewritten English/Spanish copy and original editable marketing illustration.
7. Browser regression cases added for manual hide, author mute and live category toggles.

### Existing capabilities to preserve

Cross-browser MV3, local-only runtime, Chrome `storage`/`contextMenus` permissions, five detection languages, custom exact/contains rules, exclusion signatures, phrase/import/export compatibility, undo, Show all, snooze, tests and store IDs.

## Risk / unknowns

- **Unknown:** Representative real LinkedIn DOM samples for the Suggested label and broader categories; plan 068 previously returned `insufficient-data`. Do not implement synthetic-only detection.
- **Unknown:** Whether prospective users value presets, focus mode or topic preferences; obtain 5–10 supervised usability sessions before adding complex automatic filters.
- **Known trade-off:** Manual feed controls increase visible affordance on each post. Validate actual post layouts, overlap with LinkedIn actions and narrow/mobile widths before release.
- **Known trade-off:** Selecting vague words filters legitimate content; never ship an overly broad default pack.
- **Known limit:** We cannot alter server-side recommendations or reveal posts LinkedIn did not show.

## Release criteria

1. `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:extension`, `npm run test:package`, `npm run test:firefox` all pass on the candidate SHA.
2. Keyboard navigation, text contrast, popup/options overflow and EN+ES copies checked.
3. Test real current feed DOM for post menus, nested comments, dynamic loading and other locales. Synthetic Playwright feed checks are regressions, **not** evidence of full LinkedIn coverage.
4. Verify Chrome and Firefox extension packages; review screenshots and visual store assets from the actual release candidate.
5. Prepare next-version bump together across `manifest.json`, `package.json`, `VERSION`, `RELEASE_NOTES.md`, `CHANGELOG.md` per `RELEASE_CHECKLIST.md`. No premature store publication.
6. Update the actual store listings and privacy descriptions, and measure activation and feedback without automatically collecting user activity.

## Optional later experiments (not approved builds)

- User-selected categories like Suggested, provided **real** header-metadata fixtures support reliable recognition.
- Explicit user-created rule groups with safe previews, avoiding opaque "strictness" sliders.
- Clearer in-feed explanation and precise author actions, evaluated via 5–10 usability sessions.

**Non-goals:** AI-written-content labeling, network/LLM dependence, silent account activity, auto unfollowing, engagement bots, claim of ranking control, storing a feed history or default blanket hiding of job/company posts.
