# Release Notes

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
