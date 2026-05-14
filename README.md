# LinkedIn Spam Blocker

Automatically hides LinkedIn engagement-bait posts that ask you to comment a specific word ("CLAUDE", "SKILL", "PROMPTS", and the usual suspects) in exchange for a file, template, prompt pack, or "access." Works in Chrome and Firefox.

## Why This Exists

LinkedIn's reporting flow often leaves engagement-bait posts untouched, even when they follow an obvious spam pattern: "comment X and I'll send you Y." These posts are optimized for algorithmic reach, not useful discussion, and the platform's incentives tend to reward them.

This extension gives users a local, private way to clean up their own feed without waiting for platform enforcement. It does not report posts, contact LinkedIn, or send data anywhere; it simply hides matching posts in your browser.

## How It Works

LinkedIn Spam Blocker scans text on supported LinkedIn pages and checks it against built-in engagement-bait patterns plus any custom phrases you add. Matching posts are hidden and replaced with a small placeholder, so you can restore them immediately if the extension gets one wrong.

Detection runs locally in the browser. There are no analytics, no telemetry, no external APIs, and no network requests.

## Features

- **Local-only detection** — zero network requests, no analytics, no telemetry
- **Built-in spam patterns** — detects common engagement-bait structures in English, Spanish, French, Portuguese, and German
- **Custom phrases** — add your own trigger words with Exact or Contains matching
- **Selector-independent scanning** — uses DOM text-analysis heuristics instead of brittle CSS selectors
- **Incremental scanning** — checks newly loaded posts as you scroll
- **Right-click phrase creation** — select text and add it from the browser context menu
- **Live settings updates** — phrase and language changes apply without reloading the extension
- **Snooze** — pause blocking for 30 minutes with auto-resume
- **Import / Export** — back up or share your phrase list as JSON
- **Undo and false-positive controls** — click "Show" or "Not spam" from the placeholder
- **Author whitelist** — avoid blocking selected profile, company, school, or showcase authors
- **Stats** — today, this week, and lifetime blocked counts in the popup
- **Supported LinkedIn routes** — feed, profiles, posts, company pages, groups, search, My Network, notifications, jobs, newsletters, and articles

## What It Does Not Do

- Does not report posts to LinkedIn
- Does not remove posts from LinkedIn for anyone else
- Does not block accounts globally
- Does not use AI, external APIs, or remote blocklists
- Does not collect analytics, telemetry, browsing history, or LinkedIn account data
- Does not modify LinkedIn server-side data

## How To Use

1. Install the extension.
2. Open LinkedIn and scroll normally.
3. Matching engagement-bait posts are hidden automatically.
4. Click the extension icon to view stats, toggle blocking, snooze, or open settings.
5. Click "Show" on any blocked post to restore it temporarily.
6. Click "Not spam" if a post was incorrectly blocked.
7. Add custom phrases from settings or by selecting text and using the right-click menu.

## Install

### Chrome Web Store

Listing pending publication. Use the unpacked install steps below for now.

### Firefox Add-ons

Listing pending publication. Use the temporary add-on install steps below for now.

### Manual Unpacked Install

1. Clone the repo: `git clone ...`
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `stop-spam-linkedin` folder
5. For Firefox, open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select `manifest.json`

## Screenshots

### Feed Blocking

![Feed blocking screenshot](screenshots/screenshot-1-feed.png)

### Settings

![Settings screenshot](screenshots/screenshot-2-settings.png)

### Popup

![Popup screenshot](screenshots/screenshot-3-popup-1280x800.png)

## Development

No build step is required. The extension is vanilla JavaScript and Manifest V3.

Useful commands:

- `npm run smoke` — validates JSON and checks JavaScript syntax
- `npm run test:extension` — loads the unpacked extension in Chromium and verifies a mock LinkedIn spam post is hidden
- `npm run package` — creates `dist/linkedin-spam-blocker-{version}.zip` (version from manifest.json)

## Permissions

- `storage` — saves preferences, custom phrases, language settings, stats, snooze state, whitelist entries, and false-positive exclusion signatures in browser storage
- `contextMenus` — adds the right-click "Add to LinkedIn Spam Blocker" action for selected text
- Static content-script matches on supported `https://www.linkedin.com/*` routes — scans LinkedIn pages without requesting a broader host permission

No data is ever transmitted. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Support

For bugs, false positives, or missed spam patterns, open an issue with the phrase that triggered the problem and the LinkedIn page type where it happened.

## License

Source-available proprietary. You may inspect the source and use the extension for personal use, but redistribution, commercial reuse, and derivative competing products are not permitted without prior written permission. See [LICENSE](LICENSE).
