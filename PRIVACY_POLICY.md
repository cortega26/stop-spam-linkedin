# Privacy Policy — LinkedIn Spam Blocker

**Last updated:** 13 May 2026

## Data Collection

LinkedIn Spam Blocker **does not collect, store, transmit, or share any personal data**. The extension operates entirely locally within your browser.

## What the extension accesses

### `chrome.storage.sync`
Your enabled/disabled preference, custom phrase list, enabled detection languages, false-positive exclusion signatures, and whitelisted author IDs are stored in your browser's `chrome.storage.sync`. This data stays in your browser profile and may be synchronized across your Chrome browsers via your Google account (Chrome's built-in sync, not our service). We have no access to this data.

False-positive exclusions are created only when you click "Not spam" on a blocked post. In that case, the extension saves a normalized signature of the matched text, not the full post text, so it can avoid blocking that exact text again.

Synced lists are capped to avoid browser sync quota issues during long-term use.

### `chrome.storage.local`
Your blocked count, daily stats, snooze state, and onboarding flag are stored in your browser's `chrome.storage.local`. This runtime data remains on the local browser profile and is not synced by the extension.

### `contextMenus`
The extension adds a right-click menu item ("Add to LinkedIn Spam Blocker") that reads the text you selected and saves it as a blocking phrase only when you choose that menu action. This data is stored in your browser's `chrome.storage.sync`. No selection data is ever transmitted externally.

### LinkedIn pages (`*.linkedin.com/*`)
The content script runs on LinkedIn pages solely to scan post text for spam patterns and remove matching posts from the page. Page content, user data, and LinkedIn activity are not sent anywhere beyond your local browser.

## Third-party services

This extension makes **zero network requests**. No analytics, no telemetry, no external APIs, no CDN-hosted assets. Everything — including the icon — is bundled in the extension package.

Use of extension data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Data retention

Extension data is stored only in `chrome.storage.sync` and `chrome.storage.local` and persists only as long as you keep the extension installed and your browser profile intact. Uninstalling the extension removes extension storage from that browser profile.

## Changes

If this policy changes, the updated version will be posted here and the extension's version number will be incremented.

## Contact

For questions about this policy, open an issue on the extension's GitHub repository (if public) or contact the developer through the Chrome Web Store / Firefox Add-ons listing.
