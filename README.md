# LinkedIn Feed Control

## LinkedIn, without the feed you didn't ask for.

LinkedIn is useful for finding opportunities and maintaining professional relationships. The endless stream of distractions is optional. **Hide unwanted posts, mute authors, and filter promoted content—privately, with reversible controls.**

**[Chrome Web Store](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc) · [Firefox Add-ons](https://addons.mozilla.org/addon/linkedin-spam-blocker/) · [Latest source](https://github.com/cortega26/stop-spam-linkedin)**

> **Current availability:** the browser stores still publish **1.6.0**, focused on engagement-bait blocking. Feed Control 2.0 is available in source, and the new first-run experience/contextual controls are under review. These aren't claims about what the old store packages already ship. This notice must be updated alongside the store release.

![Original Feed Control product illustration (not a browser screenshot)](assets/feed-control-promo.svg)

*Original product illustration, not an image of real LinkedIn posts. Genuine screenshots of the next release are an acceptance requirement.*

### Make your feed yours, in under a minute

| Instead of... | Do this |
| --- | --- |
| A distracting post | Open **Feed options → Hide this post**; **Show** restores it |
| The same repetitive author | Open **Feed options → Mute this author** on a recognized post |
| Paid posts | Enable **Hide promoted posts** and undo it whenever you choose |
| Comment-for-file engagement bait | Let five-language local rules filter it automatically |
| An incorrect hide | Choose **Show**, **Not spam**, or protect the author or phrase |

**No new account. No telemetry. No remote AI processing.** Detection takes place in your browser. Saved rules and author IDs stay in extension storage and may be synchronized by your browser, according to its settings.

**How it starts:** Install → open LinkedIn → use the small **Feed options** menu on a recognized post → Hide or Mute. Optional promoted filtering is one clear choice during first-run setup. Advanced rules stay out of your way until you need them.

**Limits:** This does not alter LinkedIn's recommendations on its servers or retrieve posts it never delivers. **Suggested-post and connection-activity filtering have not shipped**; those features require evidence against LinkedIn's real changing DOM, not speculative text matching.

<details>
<summary>Version, browsers and project details</summary>

[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](manifest.json)
[![Source available](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

Part of the [Tooltician](https://tooltician.com) ecosystem. Read in English · [Español](docs/README.es.md) · [Français](docs/README.fr.md) · [Português](docs/README.pt.md) · [Deutsch](docs/README.de.md). Interface: English and Spanish; built-in spam detection: five languages.

</details>

## At a Glance

- **Private by design** — no analytics, telemetry, remote blocklists, AI APIs, or network requests of any kind
- **Multilingual** — built-in patterns for English, Spanish, French, Portuguese, and German, all toggleable
- **Under your control** — hide individual posts, mute authors, manage phrases, and import/export settings
- **Reversible** — show a hidden post temporarily or mark it as "Not spam" so the same text is never blocked again

## Why This Exists

LinkedIn's reporting flow often leaves engagement-bait posts untouched, even when they follow an obvious pattern: "comment X and I'll send you Y." Those posts are optimized for algorithmic reach, not useful discussion, and they can crowd out the work, hiring, and industry updates people actually opened LinkedIn to see.

This extension gives you a local, private way to make your own feed less noisy without waiting for platform enforcement. It does not report posts, contact LinkedIn, or change anything server-side. It only hides matching posts in your browser.

## How It Works

Feed Control examines text on supported LinkedIn pages against built-in engagement-bait patterns and the custom phrases you choose. It also adds one-click manual controls to recognized feed posts. When a post matches, it is hidden and replaced with a small placeholder so you can restore it immediately.

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
- **Hide this post** — manually hide an ordinary feed post without adding a permanent keyword rule or incrementing spam-detection counters
- **Mute this author** — persistently suppress a recognized author's feed posts from the post itself
- Undo any blocked post from the popup or the in-feed placeholder
- "Show all" from the popup to restore every hidden post for the session
- "Not spam" exclusion so the same text is never blocked again
- "Report missed spam" on any placeholder — copies the post text to your
  clipboard and opens a pre-filled GitHub issue (the report includes which
  pattern language matched; nothing is sent anywhere automatically).
  Right-clicking selected LinkedIn text offers the same "Report missed spam"
  action with identical clipboard + pre-filled-issue behavior (unmatched
  reports carry the "none" language marker)
- Optional toggles to hide "Promoted" posts in the feed and the "Featured" section on profiles (off by default; enable in settings)
- Author whitelist for profile, company, school, and showcase pages
- **Block this author** on any blocked post's placeholder — hides
  every post from that author feed-wide (also available from the
  profile-link right-click menu)
- Snooze for 30 minutes with automatic resume
- Right-click menus: selected text offers "Add to Feed Control" and "Report missed spam"; LinkedIn profile/company/school/showcase links offer "Block this author"
- Live settings — phrase and language changes apply without reloading
- Import / Export full settings as JSON — phrases, whitelist, author
  blocklist, disabled patterns, and the Promoted/Featured hide toggles

**Stats & coverage**
- Today, this week, and lifetime blocked counts in the popup
- Supported pages: feed, profiles, posts, company pages, school pages, showcase pages, groups, search, My Network, notifications, jobs, newsletters, and articles

## Limits

- LinkedIn can change its page structure, which may require detection updates.
- New engagement-bait wording can slip through until patterns or custom phrases catch up.
- False positives are possible, especially around posts that quote spam examples or discuss spam behavior.
- Counts are local convenience stats, not analytics-grade reporting.

## What It Does Not Do

- Does not report posts to LinkedIn or interact with LinkedIn servers in any way
- Does not affect what other people see — changes are local to your browser only
- Does not transmit your LinkedIn account data, browsing history, or post content. Explicitly saved author IDs and phrase preferences remain in browser storage.

## How To Use

For the fastest setup, install the extension and use LinkedIn normally. The discreet **Feed options** menu on recognized posts contains **Hide this post** and, where an author is identifiable, **Mute this author**. No pattern configuration is needed first.

1. Install the extension.
2. Open LinkedIn and scroll normally.
3. Matching engagement-bait posts are hidden automatically.
4. Click the extension icon to view stats, toggle blocking, snooze, or open settings.
5. Click "Show" on any blocked post to restore it temporarily.
6. Click "Not spam" if a post was incorrectly blocked.
7. Click "Block this author" on any blocked post to hide that author's posts feed-wide.
8. Add custom phrases from settings or by selecting text and choosing "Add to Feed Control" in the right-click menu when your feed invents a new flavor of bait.
9. Use the popup's **Hide promoted posts** checkbox to immediately toggle the filter.
10. Right-click selected LinkedIn text and choose "Report missed spam" to copy it and open a pre-filled issue when spam slips through.

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

The pictures below are **real captures from an earlier packaged release**. They are retained for historical reference, not passed off as screenshots of this unreleased UX. Current-version, sanitized Chrome and Firefox captures will replace them after real-site acceptance.

| Previous feed view | Previous settings view |
| --- | --- |
| ![Earlier release: LinkedIn feed filtering](screenshots/screenshot-1-feed.png) | ![Earlier release: settings](screenshots/screenshot-2-settings.png) |

![Earlier release popup, pending accurate recapture](screenshots/screenshot-3-popup-1280x800.png)

## Development

No build step is required. The extension is vanilla JavaScript and Manifest V3.

Useful commands:

- `npm run smoke` — validates JSON and checks JavaScript syntax
- `npm run test:extension` — loads the unpacked extension in Chromium and verifies a mock LinkedIn spam post is hidden
- `npm run test:package` — packages the extension, then tests the exact zip for the current manifest version
- `npm run package` — creates `dist/linkedin-spam-blocker-{version}.zip` (version from manifest.json)

## Permissions

- `storage` — saves preferences, custom phrases, language settings, stats, snooze state, whitelist entries, and false-positive exclusion signatures in browser storage
- `contextMenus` — adds the right-click "Add to Feed Control" and "Report missed spam" actions for selected text and the "Block this author" action for LinkedIn profile/company/school/showcase links
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

---

Built and maintained by **Carlos Ortega** — automation, data systems, and web technical hygiene consulting. Portfolio and services: **[tooltician.com](https://tooltician.com/)**.

*Part of the [Tooltician](https://tooltician.com) ecosystem — privacy-first browser extension that cleans your LinkedIn feed.*
