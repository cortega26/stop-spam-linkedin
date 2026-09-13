# Spec — AMO listing description update (must-have copy)

## Status: ACTIVE — 2026-08-15

## Goals

1. Update the **live Mozilla Add-ons (AMO) listing description** for
   `linkedin-spam-blocker@carlos` with the must-have copy from
   `STORE_ASSETS.md` (plan 047): benefit-led EN (`en-US`) + ES (`es-ES`)
   detailed descriptions.
2. Verify the stored description on the live API contains the full copy
   — every key section — and that the earlier anomaly (headings
   "reclaimed"/"recuperado" reported missing) is resolved.
3. Leave the repo's `STORE_ASSETS.md` untouched (it is already the
   source of truth and correct).
4. Provide the user the Chrome Web Store paste-ready text (Chrome has no
   listing-description API; manual dashboard paste is the only path).

## ADDENDUM — Task 2 (badge + repo rule, 2026-08-15)

### Goal

- AMO has published 1.4.0 (`status: public`). The README Firefox badge
  still reads `v1.2.4` — stale. Update the badge to `v1.4.0` in
  README.md and the 4 translations (docs/README.{es,fr,pt,de}.md).
- Make "badge must track the published store version" a **repo rule**
  in AGENTS.md (with the Chrome badge updated at release time via the
  tag workflow, and the Firefox badge updated when AMO review goes
  public).

### Implementation

- Replace `Firefox_Add--ons-v1.2.4` → `Firefox_Add--ons-v1.4.0` in the
  badges line of README.md and each docs/README.*.md (simple string
  swap; verify the exact badge URL shape first with grep).
- AGENTS.md: add a convention bullet under "Conventions checklist"
  stating store badges track the *published* store version (Chrome: on
  release; Firefox: when AMO review completes), and that STORE_ASSETS
  copy is pasted into the dashboards at release time.

### Verification

- `grep -c "Firefox_Add--ons-v1.4.0" README.md docs/README.*.md` ≥ 1
  per file (5 files total).
- `grep -rn "Firefox_Add--ons-v1.2.4" README.md docs/` → 0 matches.
- `npm run smoke` (jq validates locales) + `npm run lint` + `npm run
  typecheck` exit 0.
- Commit: `docs(readme): bump Firefox badge to v1.4.0` +
  `docs(agents): store badges track the published version` (or one
  combined conventional commit).

## Out of scope

- Chrome Web Store description (no API — manual only; deliver text).
- Firefox badge bump in README (separate mini-task, pending AMO public
  status — already public, but badge is a README edit the user hasn't
  requested yet).
- The release workflow / tag / store submission flows.

## Implementation details

### Context (verified facts)

- AMO addon guid: `linkedin-spam-blocker@carlos`, id 3013362,
  `default_locale: en-US`. Version 1.4.0 is **public** on AMO.
- AMO v5 API: `PATCH /api/v5/addons/addon/{guid}/` accepts
  `{"description": {"en-US": "...", "es-ES": "..."}}`.
  - Language code **must** be `es-ES` (400 for `es` and `es_ES`).
  - Requests are throttled (~40s between writes; 429 responses).
- The first PATCH (200 OK) stored a description whose response head was
  `"LinkedIn's feed is full of..."` — i.e. the leading markdown heading
  `### Your feed, reclaimed.` did **not** appear in the stored text.
  Hypothesis to verify: AMO's serializer strips `### ` markdown headings
  from the `description` field (or the stored value was truncated at the
  top). Test must confirm what is actually stored.
- Source copy: `STORE_ASSETS.md` EN detailed description (starts `### Your
  feed, reclaimed.`) and ES detailed description (starts
  `### Tu feed, recuperado.`).
- Credentials: `.env` (gitignored) — FIREFOX_API_KEY / FIREFOX_API_SECRET.
  Never print secret values; print response bodies only.

### Approach

1. **Baseline probe**: GET the addon, print the FULL stored `en-US` and
   `es-ES` descriptions (or first ~600 chars each) to see exactly what
   the earlier PATCH stored — headings present or stripped?
2. **Adjust payload if needed**: if AMO strips `### ` headings, rebuild
   the description payload without them (e.g. convert
   `### Your feed, reclaimed.` → `**Your feed, reclaimed.**` bold, or
   plain text line) while keeping the rest of the copy verbatim.
3. **PATCH** with the corrected payload (respecting the ~40s throttle).
4. **Verify**: GET and assert, per test file, that the stored text
   contains every required marker (see tests/).

### VERIFIED AMO behavior (2026-08-15, live probes)

- AMO's `description` serializer strips **all markdown markers** from
  the stored value: `### ` headings AND `**bold**` are removed; only
  plain text (incl. em-dashes, quotes, blank lines) survives. A 200
  PATCH with markdown therefore stores a degraded copy silently.
- The earlier PATCH stored 3300/3654 chars with headings+bold stripped:
  starts at `LinkedIn's feed is full of...` (heading gone), bullets have
  no `**`, and the `### Install it once...` closer line is GONE.
- Language codes: `en-US` and `es-ES` valid; `es`/`es_ES` → 400.
- Rate limit: ~40s between writes (429 otherwise).

### FINAL approach (decided from the probes)

Build the AMO payload as **plain-text only**:
- `### Section` headings → become a plain text line (`Your feed, reclaimed.`)
- `**Bullet** — text` → `Bullet — text` (no bold markers)
- Keep blank lines between blocks; keep em-dashes and quotes verbatim.
- The closer (`Install it once. Forget it's there. Enjoy your feed
  again.`) becomes the final plain paragraph.
Do NOT modify STORE_ASSETS.md — its markdown version is the source of
truth for Chrome (dashboard supports markdown).

## Verification (how each piece is proven)

- `tests/verify-amo-listing.js` (node, run with `.env` loaded):
  - Reads `.env` FIREFOX creds, builds the AMO JWT, GETs the addon.
  - Asserts `description` has exactly keys `en-US` and `es-ES`.
  - Asserts `en-US` contains ALL of: `reclaimed`, `Block this author`,
    `10 built-in detection patterns`, `Install it once`,
    `zero network` — fails with a diff snippet otherwise.
  - Asserts `es-ES` contains ALL of: `recuperado`,
    `Bloquear a este autor`, `Instálalo una vez` (or the actual closer
    text present in STORE_ASSETS ES).
  - Exit 0 on all pass, 1 with the failing markers listed otherwise.
- Manual check after tests pass: open the public AMO page
  (addons.mozilla.org) and eyeball the rendered description.

## Done criteria

- [ ] `tests/verify-amo-listing.js` passes (exit 0) against the live API
- [ ] The full EN copy incl. `Your feed, reclaimed.` and the
      `Install it once...` closer is stored and returned by GET (as
      plain text — headings/bold intentionally plain)
- [ ] The full ES copy incl. `Tu feed, recuperado.` and
      `Instálalo una vez...` closer is stored and returned by GET
- [ ] `STORE_ASSETS.md` unchanged (`git status` clean for it)
- [ ] Chrome paste-ready text delivered to the user in the final report
