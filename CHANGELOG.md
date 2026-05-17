# Changelog

## Unreleased

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
