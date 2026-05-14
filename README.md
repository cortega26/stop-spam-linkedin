# LinkedIn Spam Blocker

[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-supported-4285F4?logo=googlechrome&logoColor=white)](#manual-unpacked-install)
[![Firefox](https://img.shields.io/badge/Firefox-supported-FF7139?logo=firefoxbrowser&logoColor=white)](#manual-unpacked-install)
[![Local only](https://img.shields.io/badge/privacy-local--only-0a7f64)](PRIVACY_POLICY.md)
[![No telemetry](https://img.shields.io/badge/telemetry-none-0a7f64)](PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

Clean up the LinkedIn feed noise without sending your feed anywhere.

LinkedIn Spam Blocker hides common engagement-bait posts that ask people to comment a keyword like "CLAUDE", "SKILL", or "PROMPTS" to receive a file, template, prompt pack, or "access." It runs locally in your browser, works in Chrome and Firefox, and lets you undo or tune blocking when it gets something wrong.

## At a Glance

- **Private by design** — no analytics, telemetry, remote blocklists, AI APIs, or network requests
- **Built for the real LinkedIn feed** — scans newly loaded posts as you scroll, without relying on brittle CSS selectors
- **Adjustable** — add custom phrases, choose enabled languages, whitelist authors, and import/export your phrase list
- **Reversible** — show a hidden post temporarily or mark it as "Not spam" so the same text is not blocked again
- **Lightweight** — vanilla JavaScript, Manifest V3, no build step required

## Why This Exists

LinkedIn's reporting flow often leaves engagement-bait posts untouched, even when they follow an obvious pattern: "comment X and I'll send you Y." Those posts are optimized for algorithmic reach, not useful discussion, and they can crowd out the work, hiring, and industry updates people actually opened LinkedIn to see.

This extension gives you a local, private way to make your own feed less noisy without waiting for platform enforcement. It does not report posts, contact LinkedIn, or change anything server-side. It only hides matching posts in your browser.

## How It Works

LinkedIn Spam Blocker scans text on supported LinkedIn pages and checks it against built-in engagement-bait patterns plus any custom phrases you add. When a post matches, it is hidden and replaced with a small placeholder so you can restore it immediately.

Detection is heuristic, not magic. It can miss new spam formats, and it can occasionally hide a post you wanted to see. The extension includes "Show", "Not spam", custom phrases, language toggles, and author whitelisting so you can tune it around your own feed.

## Features

- **Local-only detection** — zero network requests, no analytics, no telemetry, no external APIs
- **Built-in spam patterns** — detects common comment-to-reveal structures in English, Spanish, French, Portuguese, and German
- **Custom phrases** — add your own trigger words with Exact or Contains matching, capped to keep storage and matching lightweight
- **Selector-independent scanning** — uses DOM text analysis instead of brittle LinkedIn CSS class names
- **Incremental scanning** — checks newly loaded posts as you scroll
- **Right-click phrase creation** — select text and add it from the browser context menu
- **Live settings updates** — phrase and language changes apply without reloading the extension
- **Snooze** — pause blocking for 30 minutes with auto-resume
- **Import / Export** — back up or share your phrase list as JSON
- **Undo and false-positive controls** — click "Show" or "Not spam" from the placeholder
- **Author whitelist** — avoid blocking selected profile, company, school, or showcase authors
- **Stats** — today, this week, and lifetime blocked counts in the popup
- **Supported LinkedIn routes** — feed, profiles, posts, company pages, groups, search, My Network, notifications, jobs, newsletters, and articles

## Limits

- LinkedIn can change its page structure, which may require detection updates.
- New engagement-bait wording can slip through until patterns or custom phrases catch up.
- False positives are possible, especially around posts that quote spam examples or discuss spam behavior.
- Counts are local convenience stats, not analytics-grade reporting.

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
7. Add custom phrases from settings or by selecting text and using the right-click menu when your feed invents a new flavor of bait.

## Install

### Chrome Web Store

Listing pending publication. Use the unpacked install steps below for now.

### Firefox Add-ons

Listing pending publication. Use the temporary add-on install steps below for now.

### Latest Package

The latest packaged zip is attached to the [GitHub release](https://github.com/cortega26/stop-spam-linkedin/releases/latest). For local development or manual review, the unpacked install path below is usually easiest.

### Manual Unpacked Install

1. Clone the repo: `git clone https://github.com/cortega26/stop-spam-linkedin.git`
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
- `npm run test:package` — packages the extension, then tests the exact zip for the current manifest version
- `npm run package` — creates `dist/linkedin-spam-blocker-{version}.zip` (version from manifest.json)

## Permissions

- `storage` — saves preferences, custom phrases, language settings, stats, snooze state, whitelist entries, and false-positive exclusion signatures in browser storage
- `contextMenus` — adds the right-click "Add to LinkedIn Spam Blocker" action for selected text
- Static content-script matches on supported `https://www.linkedin.com/*` routes — scans LinkedIn pages without requesting a broader host permission

No data is ever transmitted. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Support

For bugs, false positives, or missed spam patterns, open an issue with the relevant phrase or short excerpt and the LinkedIn page type where it happened. Please avoid sharing private account details or full post content unless it is necessary to reproduce the issue.

## License

Source-available proprietary. You may inspect the source and use the extension for personal use, but redistribution, commercial reuse, and derivative competing products are not permitted without prior written permission. See [LICENSE](LICENSE).
