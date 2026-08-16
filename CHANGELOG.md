# Changelog

## 1.4.0 - Features, Detection Fixes, Reliability

### Features

- Added an in-feed **"Block this author"** button on text-block placeholders (alongside "Never block this author") — blocking an author keeps their posts hidden feed-wide and switches the placeholder to the author-block variant (plan 040).
- Missed-spam reports now carry the **matched pattern language** in the clipboard payload ("Pattern language: EN") and the issue form gains a **negative-examples** field to prevent over-matching (plan 042).
- **Export/Import now covers all settings**: blocked authors, disabled patterns, and the Promoted/Featured hide toggles now travel with the backup (plan 027).
- Options page shows an **exclusion-count / near-quota warning** when the storage budget is running out (batch 021).

### Detection

- Fixed **French detection**: "commentez X pour recevoir" (missing space) and "je vous enverrai" (object pronouns) now match — previously never blocked.
- Fixed **Portuguese detection**: near-future "vou enviar" now matches — previously never blocked (plan 025).
- FR/PT/DE detection now covered by 12 new unit tests plus per-language e2e coverage; EN/ES/DE verified solid.

### Fixes

- Storage quota measurement is now **UTF-8 byte-accurate** — non-ASCII phrase lists near the cap no longer fail silently (plan 029).
- Added `chrome.runtime.lastError` guards to all storage writes (plan 031).
- Undo rows are deduplicated when posts are snoozed, disabled, or "Show all"-ed (plan 028).
- Imports are **byte-pruned** instead of failing silently when they exceed the storage quota (plan 026).
- Exclusion eviction now scores correctly (plan 022); `parseAuthorId` no longer throws on malformed URIs (plan 024).
- Whitelist restore keeps the same tab via an `oldValue` diff (plan 023); the Show cooldown evicts in the right order (plan 033).
- Context menus are removed and recreated cleanly on extension update (plan 039).
- Options page preserves in-progress edits and renders exactly once instead of double-rendering (plan 030).
- `restorePost` set is pruned so restored posts are never re-flagged (plan 032).

### Tests & tooling

- `buildPatterns` extracted into a shared, unit-tested module (plan 034); unit suite grew 54→63 tests.
- Stats pipeline covered end-to-end (plan 035); Firefox smoke gained a negative control (plan 036).
- Smoke now checks all 17 shipped/test JS files (plan 038); `AGENTS.md` facts refreshed (plan 037).
- E2E runs headless under `xvfb` — no visible browser windows in CI (plan 044).

## 1.3.0 - Features, Detection Fixes, Quality

### Features

- Added an **author blocklist**: a new "Block this author" right-click menu item on LinkedIn profile/company/school/showcase links (via `contextMenus` link context), an in-feed "Unblock this author" placeholder action, and a management section in the options page.
- Added **per-pattern toggles**: each built-in detection pattern (10 total, ids `EN-1`…`DE-2`) can be disabled individually from the options page, independent of language toggles.
- Added **match attribution**: the popup's "Last blocked" list shows which pattern or custom phrase matched each blocked post.
- Added a **"Show all"** popup button that restores every hidden post for the session.
- Added a **"Report missed spam"** placeholder button that copies the matched post text (plus trigger word and page URL) to the clipboard and opens a pre-filled GitHub issue form — no data is sent automatically.
- Added **exclusion management**: "Not spam" exclusions are now stored with preview text and can be reviewed/removed in the options page; eviction is byte-budget based instead of a silent item-count cap.
- **Export/Import now covers all settings**: phrases, author whitelist, exclusions, and enabled languages travel with the export (versioned format); legacy phrase-only exports still import.

### Bug fixes

- Fixed Spanish detection: `enviaré`/`daré`/`envío` forms never matched (dead `\b` after accented characters); non-imperative forms like "comentaba… y te envío…" no longer false-positive; imperative+clitic forms ("comentame…") still match.
- Fixed a duplicate-placeholder race on toggle-on (two scans could block the same post twice) — `blockPost` is now idempotent.
- Fixed custom-phrase writes failing silently: all three write paths (options, context menu, popup suggestion) now pre-check the real `chrome.storage.sync` byte quota and report failures.
- Fixed snooze never resuming blocking for posts that were already hidden when snooze started.
- Fixed toggle off/on double-counting stats (`counted` set survives re-enable; badge still updates unconditionally).
- Fixed the "Show" re-block cooldown being dead code — now keyed by post identity (`data-id`) so re-created posts honor the 15-minute window.

### Quality & tooling

- Added 20 unit tests (`npm run test:unit`), a 14-scenario Playwright interactions suite, and a shared e2e harness (`tests/helpers.js`).
- Extracted `shared/pattern-data.js` (single source of pattern regexes + labels + ids) and `shared/constants.js` (single source of storage keys and limits).
- Added ESLint 9 flat config (`npm run lint`) with a CI gate; cached Playwright browsers in CI.
- Added `AGENTS.md` with repo conventions and verification commands.

### Documentation

- Updated `PRIVACY_POLICY.md` (blocked-author IDs and disabled-pattern preferences; second context-menu item).
- Added `plans/` with the full implementation-plan backlog and execution record.

## 1.2.4 - Firefox Android Compatibility

### Firefox

- Bumped `strict_min_version` from `140.0` to `142.0` — `data_collection_permissions` requires Firefox for Android 142+ (was warning on Android).

## 1.2.3 - Code Audit Fixes

### Bug fixes

- Fixed `VERSION` file stale at 1.2.0 — now tracks manifest version.
- Fixed `migrateRuntimeStorage` discarding sync keys when local storage write fails — added `chrome.runtime.lastError` guard in both content script and popup.
- Fixed `lastBlocked` array not cleaned when posts are restored via in-feed "Show" or "Not spam" buttons, which left stale Undo entries in the popup.
- Fixed context menu only recreating on `install`, not `update` — extension upgrades now correctly recreate the menu.
- Fixed `whitelistBtn` DOM element being created even when `authorId` is null, wasting resources on posts without detectable authors.
- Fixed `showFirstRunToast` throwing when `target.parentNode` is null (rare: feed container is `document.body`).
- Fixed `options.js save()` rendering before the storage callback completed, causing a UI flash on write failure.

### Documentation

- Updated `RELEASE_NOTES.md` with 1.2.1 and 1.2.2 entries.
- Added sync-maintenance comments between `content.js` `BASE_PATTERNS` and `options.js` `BUILTIN`/`LANG_META`.

## 1.2.2 - Firefox Manifest Compliance

### Firefox

- Restored `background.scripts` alongside `service_worker` — Firefox now requires both for MV3 compatibility (error otherwise).
- Restored `browser_specific_settings.gecko.data_collection_permissions` — now mandatory for all new extension submissions.
- Bumped `strict_min_version` to `140.0` to match `data_collection_permissions` support.
- Updated test assertions to verify both `background.scripts` and `background.service_worker`, plus the `data_collection_permissions` field.

## 1.2.1 - Firefox Compatibility & Chrome Web Store Publication

### Chrome Web Store

- Published on the Chrome Web Store at v1.2.0.
- Added direct install link to README and Spanish README.

### Firefox

- Removed `background.scripts` from manifest — Firefox 113+ supports `service_worker` in MV3, eliminating the "unsupported manifest property" warning.
- Bumped `strict_min_version` from `112.0` to `113.0` to match actual `service_worker` support in Firefox.
- Removed `browser_specific_settings.gecko.data_collection_permissions` (requires Firefox 140+), eliminating the "manifest key not supported" warnings.
- Updated the test assertion from `background.scripts` to `background.service_worker`.
- Removed the stale `data_collection_permissions` assertion from extension-smoke tests.
- Updated README Firefox section to reflect the current submission status.

### Documentation

- Added Chrome Web Store badge to README linking to the published listing.
- Updated Chrome Web Store install instructions from "pending publication" to direct store link.

## 1.2.0 - Security, Validation & Release Tooling

### Security

- Added `sender.id` validation to both the content script and background service worker message listeners — messages from outside the extension are now rejected.
- Clamped and type-checked `msg.text` in the background `updateBadge` handler before passing it to `chrome.action.setBadgeText`.
- Added explicit Content Security Policy to `manifest.json` (`script-src 'self'; object-src 'self'`), documenting and enforcing MV3 default restrictions.

### Documentation

- Added README status badges for CI, latest release, Manifest V3, browser support, local-only privacy, no telemetry, and license.
- Reworked the README introduction, feature summary, install guidance, support notes, and limitations section to be clearer and more engaging while keeping the privacy and detection claims precise.
- Added a language selector below the README badges with links for English, Spanish, French, Portuguese, and German.
- Added localized README pages for Spanish, French, Portuguese, and German under `docs/`.
- Added a GitHub social preview image asset at `screenshots/github-social-preview.png`.

### Repository

- Added GitHub Actions CI for smoke checks, unpacked extension testing, and packaged extension testing.
- Added GitHub issue forms for bug reports, false positives, missed spam patterns, and feature requests.
- Added a pull request template and `SECURITY.md`.
- Configured the GitHub repository for squash-only merges, branch cleanup after merge, topics, and `main` branch protection requiring the `Extension checks` workflow.

### Extension

- Hardened package smoke testing so `test:package` validates the exact zip for the current manifest version instead of any matching `dist/*.zip`.
- Added zip manifest-version assertions to prevent stale release artifacts from being accidentally tested as the current build.
- Hardened author whitelist matching to use known LinkedIn actor/header links only, avoiding bypasses from arbitrary profile links inside post content.
- Tightened LinkedIn host validation for author links to `linkedin.com` and `*.linkedin.com`.
- Added custom phrase length limits and import size guardrails across settings, import, context menu, and content-script pattern building.
- Added smoke coverage for whitelist behavior, including a spam post that mentions a whitelisted profile but is not authored by that profile.

## 1.1.0 - Audit & Hardening

- Added `t()` i18n fallback helper across all JS files — every `chrome.i18n.getMessage()` call now defaults to its key name if the locale is incomplete.
- Removed unused `deleteConfirm` locale key from both language files.
- Fixed context menu not updating on extension upgrade (`background.js` `onInstalled` guard).
- Fixed duplicate `storage.local.set` calls per block event — merged into a single batched write.
- Added `ss_onboarded` to popup storage migration so it fully migrates from sync to local.
- Added storage error callback with state rollback to `addSuggestion` handler.
- Added storage error callback with reversion to options `save()`.
- Added `onChanged` listener for phrase, language, and whitelist keys on the options page — cross-context edits now reflect immediately.
- Added case-insensitive duplicate check on phrase edit.
- Fixed empty-text phrases creating a universal-match regex (`/\b\b/i`) — filtered in `buildPatterns`.
- Fixed `\b` word-boundary anchors breaking phrases that start or end with non-word characters — anchors are now conditional.
- Fixed import accepting whitespace-only text — `trim()` validation added.
- Fixed duplicate highlight missing case-insensitive matches — uses `.toLowerCase()` comparison.
- Fixed `addSuggestion` null crash with `!msg.word` guard.
- Added `navigator.clipboard` existence guard with download fallback for export.
- Documented multi-tab counter race limitation in code comment.

## 1.0.0 - Initial Release

- Blocks LinkedIn engagement-bait posts that ask readers to comment a keyword in exchange for a file, template, or access.
- Includes built-in detection patterns for English, Spanish, French, Portuguese, and German.
- Supports custom phrases with exact or contains matching, plus import/export for phrase lists.
- Adds a right-click context menu for quickly adding selected text as a blocking phrase.
- Provides a popup with enabled state, blocked counts, recent undo, suggestions, reset, and 30-minute snooze.
- Supports feed, profile, post, company, group, search, My Network, notification, jobs, newsletter, and article pages on LinkedIn.
- Runs locally with no analytics, no telemetry, no external APIs, and no network requests.
- Stores false-positive exclusions as normalized signatures instead of full matched post text.
