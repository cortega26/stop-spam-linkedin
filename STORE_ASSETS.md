# LinkedIn Spam Blocker — Store Assets

## Short Description (≤132 chars)

Blocks LinkedIn engagement-bait spam that asks you to "Comment X and I will send..."

---

## Detailed Description

LinkedIn's feed is flooded with low-effort engagement-bait posts. The pattern is always the same: post a generic "career hack" or "AI secret," then ask readers to comment a specific word (CLAUDE, SKILL, PROMPTS, etc.) in exchange for a file, PDF, template, or "access." It clogs your feed and adds zero value.

Why this exists: LinkedIn's reporting flow often leaves engagement-bait spam untouched, while reach-based incentives reward posts that generate empty comments. LinkedIn Spam Blocker gives you a local, private way to clean up your own feed without waiting for platform enforcement.

**LinkedIn Spam Blocker automatically detects and removes these posts — no manual reporting required.**

### How it works

The extension scans supported LinkedIn pages for engagement-bait patterns across 5 languages (English, Spanish, French, Portuguese, German). When a match is found, the post is hidden from view and replaced with a subtle placeholder. You can click "Show" to restore any post temporarily or "Not spam" if it was incorrectly blocked.

Everything happens locally in your browser. The extension does not report posts, contact LinkedIn, use AI, call external APIs, collect analytics, or send your browsing data anywhere.

### Features

- **Automatic detection** — 10 built-in patterns covering the most common spam structures across 5 languages
- **Custom phrases** — Add your own trigger words or phrases via the settings page. Choose between "Exact" (whole word) or "Contains" (substring) matching
- **Right-click to add** — Select any text on any page, right-click, and choose "Add to LinkedIn Spam Blocker" to instantly add it as a blocking phrase
- **Import / Export** — Back up your phrase list or share it with others via JSON export and import
- **Snooze** — Temporarily pause blocking for 30 minutes without disabling the extension
- **Undo and false-positive controls** — Restore a post temporarily or mark it as not spam
- **Author whitelist** — Avoid blocking selected profile, company, school, or showcase authors
- **Per-phrase toggles** — Disable individual phrases without deleting them
- **Incremental & robust** — Uses DOM-structure heuristics instead of fragile CSS selectors, so LinkedIn layout changes won't break detection
- **Low overhead** — Only scans newly loaded posts (not the entire page) via MutationObserver. Initial scan runs during idle time
- **Works across LinkedIn** — Feed, profiles, posts, company pages, groups, search, My Network, notifications, jobs, newsletters, and articles
- **Privacy-first** — Zero data collection. No analytics, no tracking, no external requests. Everything runs locally in your browser
- **Chrome & Firefox** — Fully compatible with both browsers (Manifest V3)

### How to use

1. Install the extension
2. Scroll your LinkedIn feed — spam posts are automatically removed
3. Click the extension icon to view your blocked count, toggle blocking, or snooze
4. Click "Manage matching phrases" to add custom keywords or import a phrase list
5. Use "Show" or "Not spam" if a post is incorrectly blocked
6. Right-click any suspicious text you see anywhere on the web and add it instantly

### What it does not do

- Does not report posts to LinkedIn
- Does not remove posts for anyone else
- Does not block accounts globally
- Does not use AI, external APIs, or remote blocklists
- Does not collect analytics, telemetry, browsing history, or LinkedIn account data

### Use cases

- **Recruiters** — Keep your feed focused on real professional content
- **Job seekers** — Avoid fake "get hired fast" engagement traps
- **Daily LinkedIn users** — Reclaim your feed from spam without manual reporting

### Support

For bugs, false positives, or missed spam patterns, report the phrase and LinkedIn page type where it happened.

---

## Screenshots

### Screenshot 1 — Feed with blocked post (screenshots/screenshot-1-feed.png)
Show the LinkedIn feed with a spam post replaced by the "Blocked by LinkedIn Spam Blocker" placeholder and "Show" button. A second visible post remains untouched to show contrast.

### Screenshot 2 — Popup (screenshots/screenshot-3-popup-1280x800.png)
The extension popup showing the enabled toggle, blocked count (e.g., "17"), snooze button, and "Manage matching phrases" link.

### Screenshot 3 — Settings / Phrase CRUD (screenshots/screenshot-2-settings.png)
The options page with a mix of built-in patterns (greyed) and custom phrases with enabled/disabled states, mode badges (Exact / Cont.), and the add form.

### Promo Art

- `screenshots/promo-small-440x280.png`
- `screenshots/promo-large-920x680.png`
- `screenshots/promo-marquee-1400x560.png`

### Remaining Capture

- Context-menu screenshot is still missing if you want that angle in the store listing.

---

## Chrome Web Store Specific

- **Category**: Productivity
- **Language**: English (en)
- **Homepage URL**: (optional — link to GitHub repo if public)

## Firefox Add-ons Specific

- **Tags**: linkedin, spam, productivity, feed, blocker
- **Homepage URL**: (optional)
