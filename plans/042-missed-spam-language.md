# Plan 042: Missed-spam report carries the matched pattern's language (direction D3)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js .github/ISSUE_TEMPLATE/missed_spam_pattern.yml tests/extension-interactions.js _locales/en/messages.json _locales/es/messages.json`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (soft: 034 lands first — the pattern id flows
  through `info`, which 034 preserves; either order works)
- **Category**: direction (feature)
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

The "Report missed spam" button copies a payload to the clipboard and
opens the `missed_spam_pattern` GitHub issue form. The payload contains
trigger, excerpt, and page URL — but not the matched pattern's language,
which the issue template explicitly asks for (`.github/ISSUE_TEMPLATE/missed_spam_pattern.yml:22-26`)
and which determines which pattern file needs fixing. The pattern engine
is organized by language (5 toggleable languages); every report today
forces the reporter to hand-type the language — or leaves it blank,
slowing the triage the form exists for. Plan 012's validation process
also requires 10-15 positive AND negative examples; the template has no
negative-examples field. This plan carries the language automatically
and adds the negative-examples field.

## Current state

- `content.js:949-976` — the report button handler builds:
  ```js
  const payload = [
    "Trigger: " + trigger,
    "",
    excerpt,
    "",
    "LinkedIn page: " + window.location.href,
  ].join("\n");
  ```
- `content.js:803-814` — `lastBlocked` entries carry `label`/`source`
  from `info` — but `info.id` (the pattern id, e.g. `EN-1` → language
  `EN`) is NOT stored on the entry today. Check whether `info.id` is
  available at the report site (the report button is built inside
  `blockPost`, which receives `info` — so the id is in scope).
- `.github/ISSUE_TEMPLATE/missed_spam_pattern.yml` — the form fields.
- `_locales/en|es/messages.json` — any new label keys go in BOTH.

Repo conventions: the report payload is user-initiated clipboard +
external issue link with `noopener` (`content.js:969-973`); nothing is
sent by the extension (privacy positioning — preserve that).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass            |
| E2E       | `npm run test:extension` | both files pass     |

## Scope

**In scope**:
- `content.js` (report payload + pattern-id propagation if needed)
- `.github/ISSUE_TEMPLATE/missed_spam_pattern.yml` (negative-examples field)
- `tests/extension-interactions.js` (clipboard assertion — the existing report e2e at ~line 540)
- `_locales/en/messages.json`, `_locales/es/messages.json` (only if a
  new label key is needed — prefer reusing existing keys)

**Out of scope** (do NOT touch):
- The issue form's other fields.
- `background.js`, `popup/popup.js`, `options/options.js`.
- Anything that would send data automatically (the report stays
  user-initiated).

## Git workflow

- Branch: `advisor/042-missed-spam-language`
- Commit message style: conventional, e.g. `feat(report): include matched pattern language in missed-spam payload`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Include the language in the payload

In `content.js` report handler: determine the matched pattern id from
`info` (the handler is inside `blockPost`, which has `info` — check the
actual variable name and scope; `info.id` for built-ins, `"custom"` for
custom phrases, `"author"` for author blocks, undefined for label
hides — mirror the `isLabelBlock` exclusion). Derive language as the
prefix before `-` for built-in ids (`EN-1` → `EN`), or the source word
for custom. Add to the payload:

```js
"Pattern language: " + language,
```

placed after the Trigger line. If `info.id` isn't in scope at the
handler, thread it through (the report button is built inside
`blockPost` where `info` is a parameter — verify and use it).

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → all pass.

### Step 2: Add the negative-examples field to the issue form

In `.github/ISSUE_TEMPLATE/missed_spam_pattern.yml`, add an optional
field:

```yaml
- type: textarea
  id: negative-examples
  attributes:
    label: "Similar posts that should NOT be blocked"
    description: "Optional: 10-15 examples of similar text that is NOT spam, to prevent over-matching."
    placeholder: "Paste similar posts that should stay visible..."
  validations:
    required: false
```

Match the existing form's style (check the current file for the exact
attribute conventions).

**Verify**: read the yml — it parses as valid YAML (or run `node -e
"require('yaml')..."` if the yaml package is available — otherwise
eyeball-check against the existing fields' shape).

### Step 3: e2e — clipboard payload contains the language

Extend the existing report-button e2e (`tests/extension-interactions.js`
~line 540, the clipboard scenario): after clicking report, read the
clipboard (the existing scenario already does this) and assert the
payload contains `Pattern language: EN` (the mock's spam-1 matches
EN-1/EN-2).

**Verify**: `npm run test:extension` → both files pass.

## Test plan

One e2e clipboard assertion (Step 3). The existing report scenario is
the pattern to extend.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0
- [ ] `npm run test:extension` passes with the clipboard-language assertion
- [ ] `grep -n "Pattern language" content.js` matches in the payload builder
- [ ] `grep -n "negative-examples" .github/ISSUE_TEMPLATE/missed_spam_pattern.yml` matches
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- `info.id` is NOT available at the report handler and threading it
  requires changing `blockPost`'s signature beyond a parameter read —
  report the scope before proceeding.
- The issue template's existing fields use a different style than the
  example above (match the file, don't fight it).

## Maintenance notes

- Plan 012's validation gate (positive + negative examples) becomes
  easier to satisfy once the form collects negatives — that's the
  intended coupling.
- If plan 041 (per-pattern stats) lands, the pattern-id provenance here
  and the stats bucket keys should use the same id vocabulary —
  coordinate.
- Reviewer should confirm the payload change is additive (old payload
  consumers — there are none — and the clipboard test both updated).
