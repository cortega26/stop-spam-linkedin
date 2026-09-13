# Plan 061: Make the store-version badges live (shields.io store endpoints)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 324658a..HEAD -- README.md docs/README.es.md docs/README.fr.md docs/README.pt.md docs/README.de.md AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (README/AGENTS.md docs only — the rendered badge switches from a static shields.io badge to a live store endpoint badge)
- **Depends on**: none (060's release is merged; the badge state below is post-060)
- **Category**: process/DX (kills the recurring manual badge-bump follow-up class)
- **Planned at**: commit `7af2c98`, 2026-09-13, on `main` (post-release-1.5.0)

## Why this matters

The store badges are manual and therefore both a chore and a lie-risk: the
README Chrome badge already claims `v1.5.0` while the Chrome Web Store has
not published it, and the 4 translated READMEs still show `v1.4.0` for both
stores (stale both ways). Every release spawns a "bump the badge" follow-up
(plan 060's maintenance note), and the AGENTS.md rule ("badge tracks the
PUBLISHED store version") is enforced only by human memory. shields.io
provides live version endpoints for both stores; the moment a store
publishes, the badge flips with zero human action and can never show a
false claim. This plan swaps the static badges for the live endpoints.

## Current state

The facts the executor needs, inlined (verified at `7af2c98`):

- **The badge lines are IDENTICAL across all five files** (README.md:9-10,
  docs/README.{es,fr,pt,de}.md:9-10):
  ```markdown
  [![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.5.0-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)
  [![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-v1.4.0-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/addon/linkedin-spam-blocker/)
  ```
  (README.md:9 has `v1.5.0` per plan 060's release-time bump; the four
  translations still carry `v1.4.0` on BOTH badges — stale. The markdown
  LINK targets (the store URLs) are correct in all five and stay unchanged.)
- **The live endpoints are verified working** (reviewer, 2026-09-13 — both
  return HTTP 200 SVG and currently render `v1.4.0`, the true published
  state):
  - Chrome: `https://img.shields.io/chrome-web-store/v/eolknfnafdodmaaajdiidaanpjbfolfc`
  - Firefox: `https://img.shields.io/amo/v/linkedin-spam-blocker`
  Both accept shields.io's standard query params — `label`, `logo`,
  `logoColor`, `color` — so the badges keep their current label text and
  colors (`label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4`
  and `label=Firefox%20Add-ons&logo=firefoxbrowser&logoColor=white&color=FF7139`).
- **The AGENTS.md rule** (lines 93-99) reads:
  > **Store badges track the PUBLISHED store version.** The README badge
  > for each store reflects what that store has actually published, not
  > the repo's manifest version: the Chrome badge is bumped at release
  > time ... and the Firefox badge is bumped when AMO review completes ...
  > A badge ahead of the store's published state is a false claim — keep
  > them honest.
  This text is rewritten by Step 2: the honesty principle survives; the
  manual-bump mechanism dies.
- Repo conventions: markdown tables/links in the READMEs follow the
  existing style; AGENTS.md is the repo-facts contract (keep it in sync
  with the change — its Verification table is untouched by this plan).

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke | `npm run smoke` | executed | exit 0 |
| Lint | `npm run lint` | executed | exit 0 |
| Typecheck | `npm run typecheck` | executed | exit 0 |
| Unit | `npm run test:unit` | executed | exit 0, 81 tests |
| Badge render | `curl -sI "<endpoint>"` | executed | HTTP 200, content-type image/svg+xml |

## Scope

**In scope**:
- `README.md` — the two badge lines
- `docs/README.es.md`, `docs/README.fr.md`, `docs/README.pt.md`,
  `docs/README.de.md` — the same two lines in each (identical shape)
- `AGENTS.md` — the badge-rule bullet (lines ~93-99)
- `plans/README.md` — your status row

**Out of scope** (do NOT touch):
- Any runtime code, `manifest.json`, version files, locales, `STORE_ASSETS.md`.
- The markdown LINK targets (store URLs) — they stay exactly as they are.
- The badge positions (line 9-10) — keep the order and surroundings.
- Plan 060's archived maintenance note (historical record — leave it).

## Git workflow

- Branch: `advisor/061-live-store-badges`
- One commit, message style:
  `docs(badges): use live store version endpoints for Chrome and Firefox badges`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 81 tests.

### Step 1: Swap the badge URLs in all five files

Replace ONLY the `img.shields.io/badge/...` URL inside each of the two
markdown badges (keep the `[![...]` alt text and the trailing `(link)` —
the markdown link target stays the store URL). The new lines:

```markdown
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/eolknfnafdodmaaajdiidaanpjbfolfc?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)
[![Firefox Add-ons](https://img.shields.io/amo/v/linkedin-spam-blocker?label=Firefox%20Add-ons&logo=firefoxbrowser&logoColor=white&color=FF7139)](https://addons.mozilla.org/addon/linkedin-spam-blocker/)
```

Apply identically in all five files (README.md and the 4 translations).
Do NOT touch anything else on those lines.

**Verify**:
```
grep -c "img.shields.io/amo/v/linkedin-spam-blocker\|img.shields.io/chrome-web-store/v/" README.md docs/README.es.md docs/README.fr.md docs/README.pt.md docs/README.de.md
grep -rn "badge/Chrome_Web_Store\|badge/Firefox_Add" README.md docs/ | wc -l
```
→ the first grep reports 10 (2 per file × 5); the second reports `0`
(no static badge URLs remain).

### Step 2: Rewrite the AGENTS.md badge rule

Replace the manual-bump text (lines ~93-99) with the live-badge rule.
Keep the honesty principle and add the new mechanism:

```markdown
- **Store badges are live store endpoints** (shields.io `amo/v` and
  `chrome-web-store/v`), so they always reflect what each store has
  actually published — never the repo's manifest version. They cannot go
  stale and require no release-time action. The only thing to verify at
  release time is that the badges render (e.g. `curl -sI` on the badge
  URLs). If a badge ever shows the wrong version, the store API is the
  authority — report a bug in the docs, don't hand-edit a version into
  the badge.
```

Keep the surrounding bullet structure intact (it is a bullet in the
"Conventions checklist").

**Verify**: `grep -n "live store endpoints" AGENTS.md` → a match; `grep -n "bumped at release" AGENTS.md` → no match.

### Step 3: Render check + full gate

**Verify**:
```
curl -s "https://img.shields.io/amo/v/linkedin-spam-blocker?label=Firefox%20Add-ons&logo=firefoxbrowser&logoColor=white&color=FF7139" | grep -o "v1\.[0-9.]*"
curl -s "https://img.shields.io/chrome-web-store/v/eolknfnafdodmaaajdiidaanpjbfolfc?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4" | grep -o "v1\.[0-9.]*"
```
→ both print the live published versions (`v1.4.0` today — the truthful
state; they will flip to `v1.5.0` automatically when the stores publish).
Then:
```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
```
→ all exit 0, 81 tests. And `git diff --name-only main...HEAD` lists only
the six in-scope files.

## Test plan

- No new automated tests (docs-only). The render check in Step 3 IS the
  verification — it proves the new URLs serve badges and show the live
  version. The AGENTS.md rewrite is machine-checked by the greps.
- Regression: the markdown link targets are unchanged (grep the store
  URLs still present).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "amo/v/linkedin-spam-blocker\|chrome-web-store/v/" README.md docs/README.*.md` → 10 (2 per file)
- [ ] `grep -rn "badge/Chrome_Web_Store\|badge/Firefox_Add" README.md docs/` → 0 matches
- [ ] The two curl render checks print a `v1.x.y` version each (live values)
- [ ] The markdown link targets (chromewebstore.google.com... and addons.mozilla.org...) are unchanged in all five files
- [ ] `grep -n "live store endpoints" AGENTS.md` → match; `grep -n "bumped at release" AGENTS.md` → no match
- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 (81 tests)
- [ ] `git diff --name-only main...HEAD` lists only the six in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A badge line differs in shape between the files (e.g. a translation
  has a different label text or a missing logo param) — match that file's
  actual line rather than force-copying the English shape; report what
  you found.
- Either shields.io endpoint stops serving SVG (500/404) during this
  plan's execution — the swap depends on the endpoint living; report
  rather than picking a different badge service.
- The markdown link targets differ from "Current state" — drift; report.

## Maintenance notes

- **This is the last manual badge chore.** The 060 deferred follow-up
  ("Firefox badge → v1.5.0 when AMO publishes") is OVERTAKEN by this
  plan: the live badge flips itself. Future releases need no badge work
  at all.
- **Reviewer focus**: (1) the five files stay byte-identical except the
  badge URLs — a translation with a diverged label would need matching,
  not copying; (2) AGENTS.md's honesty principle survives in the rewrite
  (the badge still means "published version", it's just self-maintaining).
- **Deferred:** nothing new. The store-API-as-authority note in AGENTS.md
  is the documentation of this design.