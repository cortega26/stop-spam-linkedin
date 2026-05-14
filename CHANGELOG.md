# Changelog

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
