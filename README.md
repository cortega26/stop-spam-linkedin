# LinkedIn Spam Blocker

[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.2.4-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-v1.2.4-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/addon/linkedin-spam-blocker/)
[![Local only](https://img.shields.io/badge/privacy-local--only-0a7f64)](PRIVACY_POLICY.md)
[![No telemetry](https://img.shields.io/badge/telemetry-none-0a7f64)](PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

**Read this in:** **English** | [Español](docs/README.es.md) | [Français](docs/README.fr.md) | [Português](docs/README.pt.md) | [Deutsch](docs/README.de.md)

Those "comment STRATEGY below and I'll DM you the framework" posts are everywhere. LinkedIn Spam Blocker hides them automatically — entirely in your browser, with nothing sent anywhere.

It detects posts that ask people to comment a keyword like "CLAUDE", "SKILL", or "PROMPTS" to receive a file, template, prompt pack, or "access." Works in Chrome and Firefox, supports five languages out of the box, and lets you undo or tune blocking when it gets something wrong.

## At a Glance

- **Private by design** — no analytics, telemetry, remote blocklists, AI APIs, or network requests of any kind
- **Multilingual** — built-in patterns for English, Spanish, French, Portuguese, and German, all toggleable
- **Adjustable** — add custom phrases, whitelist authors you trust, and import/export your phrase list
- **Reversible** — show a hidden post temporarily or mark it as "Not spam" so the same text is never blocked again

## Why This Exists

LinkedIn's reporting flow often leaves engagement-bait posts untouched, even when they follow an obvious pattern: "comment X and I'll send you Y." Those posts are optimized for algorithmic reach, not useful discussion, and they can crowd out the work, hiring, and industry updates people actually opened LinkedIn to see.

This extension gives you a local, private way to make your own feed less noisy without waiting for platform enforcement. It does not report posts, contact LinkedIn, or change anything server-side. It only hides matching posts in your browser.

## How It Works

LinkedIn Spam Blocker scans text on supported LinkedIn pages and checks it against built-in engagement-bait patterns plus any custom phrases you add. When a post matches, it is hidden and replaced with a small placeholder so you can restore it immediately.

Detection is heuristic, not magic. It can miss new spam formats, and it can occasionally hide a post you wanted to see. The extension includes "Show", "Not spam", custom phrases, language toggles, and author whitelisting so you can tune it around your own feed.

## Features

**Privacy**
- Zero network requests — no analytics, telemetry, external APIs, or remote blocklists
- All data stays in browser storage; nothing is ever transmitted

**Detection**
- Built-in patterns for English, Spanish, French, Portuguese, and German, individually toggleable
- DOM text analysis instead of brittle LinkedIn CSS class names — survives feed layout changes better
- Incremental scanning catches newly loaded posts as you scroll
- Custom phrases with Exact or Contains matching

**Controls**
- Undo any blocked post from the popup or the in-feed placeholder
- "Not spam" exclusion so the same text is never blocked again
- Author whitelist for profile, company, school, and showcase pages
- Snooze for 30 minutes with automatic resume
- Right-click any selected text to add it as a phrase instantly
- Live settings — phrase and language changes apply without reloading
- Import / Export your phrase list as JSON

**Stats & coverage**
- Today, this week, and lifetime blocked counts in the popup
- Supported pages: feed, profiles, posts, company pages, groups, search, My Network, notifications, jobs, newsletters, and articles

## Limits

- LinkedIn can change its page structure, which may require detection updates.
- New engagement-bait wording can slip through until patterns or custom phrases catch up.
- False positives are possible, especially around posts that quote spam examples or discuss spam behavior.
- Counts are local convenience stats, not analytics-grade reporting.

## What It Does Not Do

- Does not report posts to LinkedIn or interact with LinkedIn servers in any way
- Does not affect what other people see — changes are local to your browser only
- Does not read, store, or transmit your LinkedIn account data, browsing history, or post content

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

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)

### Firefox Add-ons

[Install from Firefox Add-ons](https://addons.mozilla.org/addon/linkedin-spam-blocker/)

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

Use the issue forms to keep reports structured:

- **Bug** — something broke or behaves unexpectedly
- **False positive** — a post was blocked that shouldn't have been
- **Missed pattern** — a spam post slipped through
- **Feature request** — something you'd like to see added

Include the relevant phrase or short excerpt and the LinkedIn page type. Avoid sharing private account details or full post content unless necessary to reproduce the issue.

## License

Source-available proprietary. You may inspect the source and use the extension for personal use, but redistribution, commercial reuse, and derivative competing products are not permitted without prior written permission. See [LICENSE](LICENSE).
