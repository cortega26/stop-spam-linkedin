# Plan 050: Localize the extension UI for French, Portuguese, and German (audit + process)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4f80330..HEAD -- _locales options popup content.js background.js i18n.js package.json eslint.config.js AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M for the audit + scaffolding; translation validation itself is unbounded (see Step 3)
- **Risk**: LOW (this plan ships no user-facing strings; it produces an audit + translator packet + harness updates)
- **Depends on**: none hard; **soft: run LAST — after plans 051, 053, 054,
  056 and 058** (see the ordering bullet at the top of "Current state")
- **Category**: direction (process plan — like archived plan 012, it documents a validation-gated process rather than shipping unverified translations)
- **Planned at**: commit `ffdffab`, 2026-09-07; refreshed in place at
  `4f80330` (2026-09-07) after the plan-048 merge renamed every
  `t(...)` call to `SS_t(...)` in content/popup/options — key inventory
  below updated accordingly; finding re-verified (still en/es only).

## Why this matters

Detection patterns cover five languages (`EN ES FR PT DE`) and the docs
present the product in five (`docs/README.{es,fr,pt,de}.md`), but the
extension UI itself speaks only two: `_locales/` contains `en/` and `es/`
(136 keys each) and nothing else. A French, Portuguese, or German user gets
spam detection in their language but settings, popup, and placeholders in
English — exactly the surface where tuning requires understanding. Closing
the gap is mechanical work plus a translation-sourcing decision this plan
must not pre-answer with machine output.

## Current state

The facts the executor needs, inlined:

- **Ordering (added 2026-09-13)**: five open plans add EN/ES-only locale
  keys — 051 (match tester), 053 (per-pattern stats), 054 (suggestion
  loop), 056 (allow-phrases, +10 keys), 058 (first-run onboarding, +7
  keys). Step 4 of THIS plan adds a parity check across all shipped
  locales, so if this plan lands first, those plans can only pass it by
  committing unvalidated FR/PT/DE strings — exactly what this plan
  forbids. Before starting, check `plans/README.md`: if any of 051, 053,
  054, 056 or 058 is still TODO or IN PROGRESS, STOP and report so the
  maintainer can resequence. REJECTED plans don't block. Step 3's sourcing
  decision may be taken earlier; only Step 4 must wait.
- `_locales/en/messages.json` and `_locales/es/messages.json`: 136 keys
  each at `4f80330` (verified 2026-09-07). **Expect a higher count** — 056 adds
  10, 058 adds 7, and 051/053/054 each add a few. Do NOT treat a count above
  136 as drift; Step 1's live inventory is authoritative. Only an en/es
  MISMATCH is a STOP condition. Key shape is standard Chrome i18n:
  `"snooze30": { "message": "Snooze 30 min" }`,
  `"removeWhitelistedAuthorLabel": { "message": "... $1 ...", ... }` —
  substitutions via `$1` placeholders filled through the shared
  `SS_t(key, subs)` helper (content.js, popup/popup.js, options/options.js
  — plan 048 moved the former local `t` copies there) or the local `t(key,
  subs)` retained in background.js (plan 048 deliberately left the service
  worker untouched), with `|| key` fallback when a locale key is missing.
- UI strings reach the page two ways: JS `SS_t("key")` calls in
  content.js, popup/popup.js and options/options.js, JS `t("key")` calls in
  background.js (local copy — the ONLY file still using bare `t`), and
  `__MSG_key__` tokens in `popup/popup.html` / `options/options.html`,
  substituted at load by `i18n.js`. **Read `i18n.js` fully in Step 1** —
  this plan does not excerpt it.
- Known audit pitfall (from `plans/README.md`): `countMessage()` in
  options.js builds locale keys dynamically (`oneKey`/`manyKey` args), so a
  naive `grep -o 'SS_t("[a-zA-Z0-9_]*"'` undercounts. The audit must resolve
  call sites by reading, not regex alone.
- `npm run smoke` validates only `manifest.json`,
  `_locales/en/messages.json`, `_locales/es/messages.json` (jq) plus
  `node --check` over the JS list. Any new locale must be added to that
  loop or it ships unvalidated.
- AGENTS.md convention today: "a new key must be added to BOTH
  `_locales/en/messages.json` and `_locales/es/messages.json`." That
  sentence must be updated to cover whatever locales this plan creates.
- Chrome picks `_locales/<browser-locale>/messages.json` automatically
  against `default_locale: en` (`manifest.json:6`) — no manifest change is
  needed to ship a new locale. Verify this claim against Chrome docs
  behavior in Step 2; if wrong, STOP.
- Precedent: archived plan 012 (additional-languages process) was REJECTED
  because detection-pattern validation needs native speakers or a large
  real-example corpus. UI strings are lower-stakes (awkward phrasing, not
  false positives) but the same honesty rule applies: **do not commit
  machine-translated strings as if they were validated translations.**

## Commands you will need

| Purpose   | Command                  | Provenance | Expected on success |
|-----------|--------------------------|------------|---------------------|
| Smoke     | `npm run smoke`          | executed   | exit 0              |
| Lint      | `npm run lint`           | executed   | exit 0              |
| Typecheck | `npm run typecheck`      | executed   | exit 0              |
| Unit      | `npm run test:unit`      | executed   | 64/64 pass          |

## Scope

**In scope**:
- A key-inventory audit (new doc committed as `docs/i18n-audit.md` — the
  one documentation file this workflow creates; keep it factual: key,
  en text, es text, placeholders, call sites, translator notes)
- Translator packet: per-key context (where the string appears, character
  constraints for buttons/badges, what `$1` holds)
- Harness updates so new locales can't rot: extend the `npm run smoke`
  locale loop, add an en↔es↔new parity check (every key present in every
  shipped locale; every `$1` placeholder preserved)
- AGENTS.md i18n convention update

**Out of scope** (do NOT do):
- Committing `fr`/`pt`/`de` translations themselves unless the sourcing
  decision in Step 3 is affirmatively resolved with the maintainer. If
  unresolved, the plan still completes: the audit + packet + harness are
  the deliverable and the locale files stay unwritten.
- `STORE_ASSETS.md`, store listings, README translations.
- Detection patterns (plan 012's REJECTED scope stays rejected).

## Git workflow

- Branch: `advisor/050-ui-localization`
- Commit style: conventional-ish, e.g. `docs(i18n): audit UI strings for FR/PT/DE localization` (see `git log --oneline`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run all four executed commands on the unmodified checkout; confirm the
tabled results.

**Verify**: smoke/lint/typecheck exit 0; unit 64/64 pass.

### Step 1: Build the complete key inventory

Extract every `SS_t("...")` call site (content.js, popup/popup.js,
options/options.js) plus every bare `t("...")` in background.js,
every `__MSG_...__` token (both HTML files), and resolve `countMessage()`'s
dynamic args by reading its call sites. For each key record: en text, es
text, `$`-placeholders, UI location (popup/options/placeholder/toast/menu),
and length constraints (badge text is clamped to 4 chars in background.js;
buttons should stay short). Cross-check against the plan-012-era finding
that en/es are today at parity — report any drift found.

**Verify**: `npm run smoke` → exit 0 (read-only step; nothing changed yet).

### Step 2: Write `docs/i18n-audit.md` + translator packet

Commit the inventory as a table plus a translator-notes section per tricky
key (pluralization via oneKey/manyKey, `$1` contents, strings with
embedded quotes like the manifest description). Confirm and document the
no-manifest-change claim for shipping a new locale.

**Verify**: `npm run smoke` → exit 0.

### Step 3: Translation-sourcing decision (STOP gate)

Do NOT generate the translations yourself. Resolve, with the maintainer
(via the operator), one of: (a) native-speaker translation (preferred —
  state the required reviewer profile per language); (b) maintainer-approved
machine translation explicitly marked for later native review; (c) defer
locale files entirely — ship only the audit + harness. If (c), skip Step 4's
file creation, keep the parity check testing en↔es only, and record the
decision in `docs/i18n-audit.md` so the next run doesn't re-ask.

**Verify**: the decision is written down in `docs/i18n-audit.md`
("Sourcing: <a|b|c>, decided <date>") before any locale file is created.

### Step 4: Scaffold locales (only under 3a/3b) + harness updates

Create `_locales/{fr,pt,de}/messages.json` with identical key sets (every
key, every `$1` preserved), update the `npm run smoke` loop in
`package.json` to validate all shipped locales, add the parity check
(wherever fits the no-build-step convention — a `jq`-based comparison in
smoke or a small node script; keep it dependency-free), and update the
AGENTS.md i18n bullet to list all shipped locales.

**Verify**: `npm run smoke` → exit 0; deliberately break parity in a temp
copy (remove one key) and confirm the check fails; restore.

### Step 5: Full verification

```
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
```

**Verify**: all exit 0 / 64+ pass; `git diff --name-only main...HEAD`
(three dots — compares against the merge base, so files other plans
merged meanwhile do not show up) lists only in-scope files.

## Test plan

- Parity check (new): fails on a missing key or dropped `$1` in any locale
  (proven by the deliberate-break run in Step 4).
- No runtime behavior change: existing e2e untouched; if locales were added,
  one smoke-level assertion that each new file parses and matches the en key
  set exactly.
- Structural pattern: the smoke loop in `package.json:6`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 / pass
- [ ] `docs/i18n-audit.md` exists with the full key table + sourcing decision
- [ ] If locales were scaffolded: `jq` parity across all shipped locales passes; AGENTS.md i18n bullet updated
- [ ] If deferred (3c): no `_locales` additions; the deferral is recorded in the audit doc
- [ ] No machine-translated string is committed as a validated translation
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of plans 051, 053, 054, 056 or 058 is still TODO or IN PROGRESS in
  `plans/README.md` — run this plan after them (see "Current state"
  ordering bullet). Step 3's decision alone may proceed; Step 4 may not.
- The en↔es key sets are NOT at parity (the assumed baseline is wrong —
  report the drift first).
- Chrome does not auto-load new `_locales/<lang>/` dirs without a manifest
  change (the no-manifest-change claim fails).
- The maintainer does not resolve Step 3 — complete the audit + harness
  under option (c) and stop there; do not invent translations to finish.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Every future user-facing string must be added to ALL shipped locales at
  once (extend the AGENTS.md bullet written here); the parity check is the
  enforcement.
- A reviewer should scrutinize placeholder preservation (`$1`≠`$ 1`) and
  any string that grew past its UI container in the new languages.
- **Deferred:** the translations themselves under option (c) — unblocked by
  a sourcing decision, nothing else.
