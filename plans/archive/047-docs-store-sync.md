# Plan 047: Sync README + store descriptions to 1.4.0, and rewrite the store copy as a "must-have"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat HEAD..HEAD -- README.md STORE_ASSETS.md docs/README.es.md`
> (HEAD is current main; if these files changed since this plan was
> written, compare the excerpts below against live content before
> proceeding; on a mismatch, treat it as a STOP condition.)

## Status

- **Priority**: P2 (store listings and README are a release behind the
  actual 1.4.0 feature set; store copy undersells the extension)
- **Effort**: S–M
- **Risk**: LOW (docs + copy only; no source)
- **Depends on**: none (045 bumped versions; 046 fixed AMO submission —
  the docs now describe the 1.4.0 reality)
- **Category**: docs
- **Planned at**: commit `9683d31`, 2026-08-15

## Why this matters

The audit found three feature gaps in README.md and STORE_ASSETS.md vs
the shipped 1.4.0 code: (1) the in-feed **"Block this author"** button
(plan 040) is missing from README and the store lists only the
context-menu path; (2) **"Pattern language"** in missed-spam reports
(plan 042) is mentioned nowhere; (3) README still says backup is "phrase
list" only (plan 027 made it full-settings). Separately, the store copy
describes the extension neutrally — it should position it as a must-have:
the extension saves the user's time and reclaims their feed with zero
effort, and the copy should lead with that benefit. Chrome Web Store
currently shows 1.3.0 copy; AMO will show whatever the 1.4.0 submission
carries. This plan makes the repo's listing assets match reality and
sell it.

## Current state (verified live at HEAD `9683d31`)

- `README.md` — "Features" section has: report-missed-spam bullet
  (:56-58), author whitelist bullet (:60), import/export "phrase list"
  (:64), stats (:67). MISSING: in-feed block-author button, pattern
  language in reports, full backup scope, exclusion near-cap warning.
  "How to Use" (:91) mentions whitelist context menu but not the
  in-feed block button. "Permissions" (:140-146) doesn't mention the
  author blocklist.
- `STORE_ASSETS.md` — Detailed Description (EN :9-71) and ES (:74-131)
  were updated for 1.3.0 (they cover blocklist via context menu,
  per-pattern toggles, match attribution, show-all, report-missed,
  hide promoted/featured, full backup). MISSING the same three 1.4.0
  items + the near-cap warning; copy is feature-list style, not
  benefit-led.
- `docs/README.es.md` and the other translations — check whether the
  translated "Features"/"How to Use" need the same three additions
  (simple mirror of the EN README edits; if a translation is
  content-stale, flag it, don't backport).

Repo conventions: README is the English source of truth; `docs/README.*.md`
are translations (mirror edits). STORE_ASSETS.md holds the copy pasted
into the store dashboards — Chrome takes the EN detailed description +
short description; AMO takes the same plus tags. Privacy claims are
load-bearing (privacy positioning) — never exaggerate what the code
does.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Feature grep | `grep -c "Block this author" README.md STORE_ASSETS.md` | ≥1 each after Step 1-2 |
| Language grep | `grep -c "Pattern language" README.md STORE_ASSETS.md` | ≥1 each |
| Backup grep | `grep -c "blocked authors" README.md STORE_ASSETS.md` | ≥1 each |

## Scope

**In scope**:
- `README.md`
- `STORE_ASSETS.md`
- `docs/README.es.md` (and the other `docs/README.*.md` translations —
  only mirror edits of the three feature additions; verify each
  translation has the surrounding structure before editing)

**Out of scope** (do NOT touch):
- Any source/test file.
- `RELEASE_NOTES.md`/`CHANGELOG.md` — already written for 1.4.0 (plan 045).
- The store dashboards themselves (Chrome/AMO) — you cannot edit them;
  the executor updates the assets file only. Publishing is the
  maintainer's step.
- Version strings/badges.

## Git workflow

- Branch: `advisor/047-docs-store-sync`
- Commit message style: conventional, e.g. `docs: sync README and store copy to 1.4.0 features` and `docs(store): rewrite detailed description as must-have copy`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: README feature sync (three additions + permissions)

In `README.md`:

1. **Features → Controls**: extend the "Author whitelist" bullet into
   two bullets:
   - "Author whitelist for profile, company, school, and showcase pages"
   - "**Block this author** on any blocked post's placeholder — hides
     every post from that author feed-wide (also available from the
     profile-link right-click menu)"
2. **Features → Controls**: extend the "Report missed spam" bullet to
   mention the language: append "…pre-filled GitHub issue (the report
   includes which pattern language matched; nothing is sent anywhere
   automatically)".
3. **Features → Controls**: change the "Import / Export your phrase
   list as JSON" bullet to: "Import / Export full settings as JSON —
   phrases, whitelist, author blocklist, disabled patterns, and the
   Promoted/Featured hide toggles".
4. **How to Use**: add a step after the "Not spam" step: "Click 'Block
   this author' on any blocked post to hide that author's posts
   feed-wide."
5. **Permissions**: in the `contextMenus` bullet, add "…and the
   'Block this author' action for LinkedIn profile/company/school/
   showcase links".

Then mirror the same three feature additions into `docs/README.es.md`
(and the other translations if their structure matches — check each;
if a translation lacks the section, flag it in NOTES instead of
inventing content).

**Verify**:
- `grep -c "Block this author" README.md` ≥ 2
- `grep -c "Pattern language" README.md` ≥ 1
- `grep -c "blocked authors" README.md` ≥ 1
- `grep -c "Block this author" docs/README.es.md` ≥ 1

### Step 2: Rewrite the EN store detailed description as must-have copy

In `STORE_ASSETS.md`, replace the EN **Short Description** and the EN
**Detailed Description** (lines ~3-71) with benefit-led copy. Use this
exact copy (adjust formatting to match the file's markdown style):

**Short Description (≤132 chars):**
```
Stop LinkedIn engagement-bait spam and clean up your feed — automatically, privately, in your browser.
```

**Detailed Description:**

```
### Your feed, reclaimed.

LinkedIn's feed is full of "comment CLAUDE and I'll send you the
framework" posts — low-effort engagement bait that clogs your feed,
wastes your time, and adds nothing. LinkedIn's own reporting often
leaves them up, because empty comments are exactly what the algorithm
rewards.

LinkedIn Spam Blocker removes them for you — automatically, locally,
and with zero effort on your part. Install it, open LinkedIn, and the
spam disappears while real professional content stays.

### Why you'll want it

- **It does the work for you** — 10 built-in detection patterns across
  5 languages (English, Spanish, French, Portuguese, German) catch the
  most common spam structures as you scroll. No setup, no lists to
  maintain.
- **It learns and adapts** — add your own phrases, block authors you
  don't want to see, whitelist the ones you do, and teach it what's
  spam in your feed.
- **You stay in control** — every hidden post shows a subtle
  placeholder: restore it, mark it as "not spam", report a missed one
  to the developer, or hide an author entirely — all from the feed
  itself.
- **It respects you** — zero analytics, zero telemetry, zero network
  requests. Everything runs in your browser. Nothing leaves your
  machine, ever.
- **It just works** — Manifest V3 for Chrome and Firefox, works across
  feed, profiles, posts, company pages, groups, search, and more.

### Features

- **Automatic detection** — 10 built-in patterns across 5 languages
- **"Block this author"** — from any blocked post's placeholder or a
  profile-link right-click, hide every post from that author feed-wide
- **Author whitelist** — never block the people you actually want to see
- **Custom phrases** — exact or contains matching; right-click any text
  to add it instantly
- **Full settings backup** — export and import phrases, whitelist,
  blocklist, disabled patterns, and hide toggles
- **Per-pattern toggles** — disable a single pattern, not a whole
  language
- **Match attribution** — see which pattern or phrase triggered each
  block
- **"Show all"** — restore everything hidden this session with one
  click
- **Snooze** — pause blocking for 30 minutes
- **Hide Promoted & Featured** — optional feed-hygiene toggles
- **Undo and false-positive controls** — "Show", "Not spam", and
  exclusion review from the settings page
- **Privacy-first** — local-only, zero data collection
- **Chrome & Firefox** — fully compatible (Manifest V3)

### What it does not do

- Does not report posts to LinkedIn or interact with LinkedIn servers
- Does not remove posts for anyone else
- Does not block accounts globally
- Does not use AI, external APIs, or remote blocklists
- Does not collect analytics, telemetry, browsing history, or LinkedIn
  account data

### Install it once. Forget it's there. Enjoy your feed again.
```

Note: the "Install it once…" closer and the benefit-led opening are the
must-have positioning; keep the privacy claims exactly as the code
guarantees (no network, local-only).

**Verify**: the EN detailed description contains "Block this author",
"Pattern language" is NOT required in the store copy (it's an internal
report detail — optional; add one line to the Report-missed bullet if
it fits naturally: "reports include which language matched"): decide
and note. `grep -c "must-have" STORE_ASSETS.md` — not required; the
tone is the point.

### Step 3: Rewrite the ES store detailed description

Mirror Step 2 into the ES section of `STORE_ASSETS.md` (lines ~74-131):
translate the new copy faithfully (same benefit-led structure, same
feature list, same privacy claims). Keep the ES short description too:
```
Detén el spam de engagement de LinkedIn y limpia tu feed — automáticamente, en privado, en tu navegador.
```

**Verify**: the ES section mirrors the EN structure (same bullets,
same closer); `grep -c "Bloquear a este autor" STORE_ASSETS.md` ≥ 1.

### Step 4: Full verification

- `npm run smoke`, `npm run lint`, `npm run typecheck` → exit 0
- `grep -c "Block this author" README.md STORE_ASSETS.md` → ≥1 each
- `grep -c "bloquear a este autor" STORE_ASSETS.md` → ≥1 (case-insensitive ok)
- `grep -c "phrase list" README.md` → the stale "Import / Export your
  phrase list" phrase is gone (the new bullet says "full settings")
- `git status` shows only the docs files modified
- Commit: `docs: sync README and store copy to 1.4.0 features` (single
  commit for the whole doc sync, or two — README vs store — your call;
  keep messages conventional)

**Verify**: all gates green; only in-scope files modified.

## Test plan

No automated tests — this is docs/copy. The verification is the greps
above + a human read of the final copy (the reviewer does this).

## Done criteria

- [ ] README has "Block this author", "Pattern language", "full settings" backup, and the permissions mention
- [ ] docs/README.es.md mirrors the three feature additions
- [ ] STORE_ASSETS EN + ES detailed descriptions are the must-have copy from Step 2/3
- [ ] The stale "phrase list" backup phrasing is gone from README
- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] No source/test files modified (`git status`)
- [ ] `plans/README.md` status row updated (SKIP — reviewer maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The README structure doesn't match the excerpts (drift — e.g. someone
  reorganized the Features section).
- A translation in `docs/` is content-stale beyond the three additions
  (its Features section differs structurally) — flag it, don't backport.
- The store copy can't be applied because the file's section markers
  differ from the excerpts — report the actual layout.
- You find yourself editing anything outside the in-scope docs files.

## Maintenance notes

- The store dashboards are updated by pasting from STORE_ASSETS.md
  during a release (RELEASE_CHECKLIST.md "Manual" section). The
  maintainer's next release step: update Chrome (paste new copy) and
  AMO (the 1.4.0 submission is in review — the copy can be updated in
  the dashboard or with the next submission).
- Any future feature must update README + STORE_ASSETS in the same
  change (this plan is the checklist — the same rule as AGENTS.md for
  shared files).
- The must-have tone is now the house style for store copy; keep future
  edits benefit-led rather than feature-list-only.
