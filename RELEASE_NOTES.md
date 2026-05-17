# Release Notes

## 1.2.4

Firefox Android compatibility. Key changes:

- **Android version bump**: `strict_min_version` raised to 142.0 to match `data_collection_permissions` support on Firefox for Android.
- **Remaining warning**: Firefox warns that `background.service_worker` is ignored (it uses `background.scripts` instead). This is harmless cross-browser behavior and does not affect functionality — Chrome uses `service_worker`, Firefox uses `scripts`. Eliminating it would require a build system for browser-specific manifests.

## 1.2.3

Code audit fixes. Key changes:

- **Storage migration hardening**: Added error handling so sync keys are not removed when the local storage write fails (content script and popup).
- **Popup Undo accuracy**: Restoring a post via the in-feed "Show" or "Not spam" buttons now properly cleans up the popup's Undo list.
- **Context menu on updates**: Context menu now recreates on extension upgrade, not just first install.
- **Minor fixes**: Avoid creating the whitelist button DOM element when no author is detected; fix a potential error in the first-run toast when no feed container is found; eliminate a UI flash in options when storage writes fail.
- **Documentation**: Updated release notes and added sync-maintenance comments between built-in pattern definitions.

## 1.2.2

Firefox manifest compliance and Chrome Web Store publication. Key changes:

- **Firefox manifest warnings resolved**: Restored `background.scripts` alongside `service_worker` (Firefox now requires both). Added `browser_specific_settings.gecko.data_collection_permissions` (mandatory for new AMO submissions). Bumped `strict_min_version` to 140.0.
- **Chrome Web Store publication**: Listed on the Chrome Web Store. Added direct install link and badge to all README translations.
- **Firefox add-on submission**: Under review in AMO. Firefox install section updated in all README translations (EN, ES, FR, PT, DE).

## 1.2.1

Firefox compatibility fixes. Key changes:

- **Manifest cleanup**: Removed `background.scripts` and `data_collection_permissions`, bumped `strict_min_version` to 113.0. (Later reverted in 1.2.2 per AMO requirements.)
- **Chrome Web Store publication**: Extension published and live.

## 1.2.0

Security, validation, and release-tooling update. Key changes:

- **Extension message hardening**: Added `sender.id` validation in both content-script and background listeners so external messages are rejected.
- **Badge update validation**: Clamped and type-checked badge text before calling `chrome.action.setBadgeText`.
- **Manifest security policy**: Added an explicit MV3 extension page Content Security Policy in `manifest.json`.
- **Whitelist protections**: Tightened author whitelist matching to trusted LinkedIn actor/header links and stricter `linkedin.com` host validation.
- **Phrase and import guardrails**: Added custom phrase length limits and import size protections across settings, context menu, and content-script pattern building.
- **Packaging confidence**: `test:package` now validates the exact zip for the current manifest version and asserts packaged manifest-version correctness.
- **Smoke coverage**: Added whitelist-focused smoke coverage, including a case where a post mentions a whitelisted profile without being authored by that profile.
- **Project maturity**: Added CI, issue forms, PR template, `SECURITY.md`, and localized README pages for English, Spanish, French, Portuguese, and German.

## 1.1.0

Bug fix and hardening release. Key changes:

- **Storage resilience**: Added error callbacks with state rollback to all storage writes; cross-context changes now sync immediately to the options page.
- **Pattern engine fixes**: Empty phrases no longer create a universal-match regex; `\b` anchors are now conditional so phrases with punctuation work correctly.
- **i18n hardening**: Added fallback helper so every lookup degrades gracefully if a locale key is missing; removed unused `deleteConfirm` key.
- **Import/Export**: Clipboard API guard with automatic fallback; whitespace-only entries rejected.
- **Context menu**: Now updates its title on extension upgrade, not just initial install.
- **Migration**: `ss_onboarded` is now fully migrated from sync to local storage.
- **Known limitation**: Multi-tab counter writes can race (each content script has independent state). Impact is cosmetic and low-frequency.

## 1.0.0

Initial public release of LinkedIn Spam Blocker.

LinkedIn Spam Blocker automatically hides common engagement-bait posts that ask you to comment a keyword to receive a file, template, prompt pack, or similar offer. It includes multilingual built-in detection, custom phrase controls, import/export, snooze, undo, popup stats, and right-click phrase creation.

Privacy note: the extension runs locally in your browser, makes no network requests, and includes no analytics or telemetry.
