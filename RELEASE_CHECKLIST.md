# Release Checklist

## Before Packaging

- Confirm `manifest.json` version is the intended release version.
- Confirm `PRIVACY_POLICY.md` date and storage descriptions are current.
- Run `npm install` if dependencies are not installed.
- Run `npm run smoke`.
- Run `npm run test:extension`.
- Run `npm run test:package`.
- Load the extension unpacked in Chrome and verify blocking on a real **authenticated** LinkedIn feed (legacy data-id and any modern mainFeed/listitem variants present), without broad assumptions about user account data.
- Open the popup on LinkedIn and on a non-LinkedIn tab to verify both live and saved-state behavior.
- Open the options page and verify add, edit, delete, language toggles, import, export, and starter pack.

## Package

- Run `npm run package`.
- Inspect `dist/linkedin-spam-blocker-{version}.zip` (version from manifest.json).
- Confirm the zip includes extension runtime files, locales, icons, popup/options files, privacy policy, README, changelog, release notes, version file, and license.
- Confirm the zip excludes `node_modules/`, `tests/`, `scripts/`, `.codacy/`, `.agents/`, `.claude/`, `.continue/`, `assets/`, `screenshots/`, and local/editor files.

## Store Submission

### Automated (CI)

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which packages the extension and submits to both stores.

**Required GitHub secrets** (set in repo Settings → Secrets and variables → Actions):

| Secret | Source |
|--------|--------|
| `CHROME_EXTENSION_ID` | Chrome Web Store item ID (`eolknfnafdodmaaajdiidaanpjbfolfc`) |
| `CHROME_PUBLISHER_ID` | Chrome Web Store → Account → Publisher ID |
| `CHROME_CLIENT_ID` | Google Cloud Console → OAuth 2.0 client |
| `CHROME_CLIENT_SECRET` | Google Cloud Console |
| `CHROME_REFRESH_TOKEN` | Generated via OAuth playground with `https://www.googleapis.com/auth/chromewebstore` scope |
| `FIREFOX_API_KEY` | [addons.mozilla.org → API Keys](https://addons.mozilla.org/en-US/developers/addon/api/key/) |
| `FIREFOX_API_SECRET` | [addons.mozilla.org → API Keys](https://addons.mozilla.org/en-US/developers/addon/api/key/) |

Or run locally: `npm run submit:chrome` / `npm run submit:firefox` with the same env vars set.

### Manual

- Use `STORE_ASSETS.md` for short description, detailed description, category, tags, and asset references.
- Upload the generated zip.
- Upload screenshots and promo assets from `screenshots/`.
- Paste the current version's notes from `RELEASE_NOTES.md`.
- Verify Chrome Web Store and Firefox Add-ons privacy disclosures match `PRIVACY_POLICY.md`.

## First-minute, authenticity and accessible UI acceptance

- [ ] First install: filters work by default, promoted is still opt-in, actions confirm only on successful sync writes, storage errors are recoverable.
- [ ] New user sees welcome but not a second What's New card; onboarding dismissal survives reload.
- [ ] Feed options: Tab, Enter, Space, Escape and outside-click behaviors in Chrome and Firefox. Hide, Mute, Show/Undo and repeat Hide all work.
- [ ] In real LinkedIn, no overlap or behavior damage to posting, messaging, search, jobs, navigation, comments and native buttons. Unsupported layouts fail open.
- [ ] Verify new React layout fallback only adds **manual** controls on real feed posts; it must not automatically filter Sponsored/Suggested posts based on unverified metadata.
- [ ] Inspect options/popup at 320px, 390px, desktop, light/dark themes, in English and Spanish. Check accessible focus and reduced motion.
- [ ] Update all honest real screenshots, store text and version availability notice. Do not tag and auto-submit stores until these gates pass.

## Waiver record — 2.0.0 (2026-10-11)

The seven acceptance gates above were **not** completed before tagging `v2.0.0`.
The owner was shown each one, the specific risk, and the store-side consequences,
and instructed the release to proceed. Recorded here so this file does not
silently contradict what happened.

Released anyway, on the owner's explicit decision. What that leaves unverified:

- **Real-feed behaviour (gate 4)** — no logged-in pass was run, so "no overlap or
  damage to posting, messaging, search, jobs, navigation, comments and native
  buttons" is unconfirmed for this version.
- **Gate 5 was waived as a decision, not a tick.** The opt-in Promoted filter now
  enumerates the modern React layout, which it never did before. Only the Spanish
  label (`Promocionado`) is verified on that layout; `Promoted`, `Promu`,
  `Promovido` and `Beworben` are unverified there. Manual controls are unchanged
  and Mute remains deliberately withheld on that layout (see `AGENTS.md`).
- **Presentation (gate 6)** — 320/390/desktop and light/dark were not inspected by
  hand.
- **Store listing (gate 7)** — screenshots and listing text are still 1.6.0-era
  while the package is named *LinkedIn Feed Control*. This is a review-side risk,
  not a code defect.

Gate 3's Firefox half is also unverified: `npm run test:firefox` covers install,
blocking and popup bootstrap, but not the feed-options keyboard/touch behaviours.

Verified before tagging instead: `npm run package` and `npm run test:package`
(the real distributable zip, loaded in Chromium) both exit 0; the zip matches the
include and exclude lists above; smoke, lint, typecheck, `test:unit` (82/82) and
`test:extension` all pass; CI green on the tagged commit.

**Outstanding after this release:** update `README.md`'s availability notice and
`STORE_ASSETS.md` once the stores accept 2.0.0, and replace the screenshots with
real captures. If a manual pass later finds a promoted false positive or native-UI
damage, fix forward with 2.0.1 — a store-accepted version cannot be re-uploaded.
