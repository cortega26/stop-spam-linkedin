# Plan 034: Extract `buildPatterns` to `shared/pattern-data.js` and unit-test the assembly branches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- content.js shared/pattern-data.js tests/unit/pattern-data.test.js`
> If any file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (moving the pattern-assembly core; behavior must be byte-identical)
- **Depends on**: 025 (its corpus tests pin pattern behavior this extraction must preserve)
- **Category**: tests + tech-debt
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

The regex-assembly logic — the piece that turns user phrases and enabled
languages into the actual match list — lives inside the content-script
IIFE (`buildPatterns`, `content.js:522-559`) and is therefore untestable
at unit level. The e2e covers only exact-mode custom phrases and
disabling EN-1; the branches that decide contains-mode regexes, `\b`
anchor gating, the length filter, disabled-pattern skipping, and
custom-first ordering never run in any test. One wrong anchor ("hello?"
is the documented trap) breaks silent non-matching for users. Extraction
to the shared module (the precedent: `post-container.js` and the
cooldown store were extracted the same way in plans 004/005/013) makes
the whole assembly unit-testable with zero behavior change.

## Current state

- `content.js:522-559` — `buildPatterns(phrases, langs)`; uses
  `BASE_PATTERNS` (a local alias of `PATTERN_DATA`), `SS_escapeRegex`,
  `LIMITS.MAX_PHRASE_LENGTH`, and reads `disabledPatterns` from the
  closure.
- `shared/pattern-data.js` — UMD module; `PATTERN_DATA`,
  `SS_escapeRegex` already exported; this is where the extraction lands.
- `content.js:542-551` — the assembly core:
  ```js
  const escaped = SS_escapeRegex(text);
  if (p.mode === "contains") {
    return { regex: new RegExp(escaped, "i"), label: text, source: "custom" };
  }
  const start = /^\w/.test(text) ? "\\b" : "";
  const end = /\w$/.test(text) ? "\\b" : "";
  return { regex: new RegExp(start + escaped + end, "i"), label: text, source: "custom" };
  ```
- `tests/unit/pattern-data.test.js` — the file to extend; `post-container.test.js` shows the extraction-test precedent.

Repo conventions: shared modules are UMD (globals on `root` +
`module.exports`); pure functions take all inputs as parameters (no
closure state). `disabledPatterns` must become a parameter.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass (36→48+)   |
| E2E       | `npm run test:extension` | both files pass     |

## Scope

**In scope**:
- `shared/pattern-data.js`
- `content.js`
- `tests/unit/pattern-data.test.js`
- `eslint.config.js` (globals) and `types/globals.d.ts` (the new export)

**Out of scope** (do NOT touch):
- `options/options.js` — it builds its own display list from
  `PATTERN_DATA` directly; unrelated.
- `background.js`, `popup/popup.js`.
- The regexes themselves (plan 025's territory) — extraction only.

## Git workflow

- Branch: `advisor/034-buildpatterns-extraction`
- Commit message style: conventional, e.g. `refactor(patterns): extract buildPatterns assembly to shared module`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Move `buildPatterns` into `shared/pattern-data.js`

Add to `shared/pattern-data.js`:

```js
/**
 * Assembles the effective pattern list from enabled built-ins and
 * custom phrases. Custom phrases first (they win attribution); built-ins
 * filtered by enabled languages and disabled pattern ids.
 * @param {Array<{text: string, enabled?: boolean, mode?: string}>} phrases
 * @param {readonly string[]} langs Enabled language codes.
 * @param {ReadonlySet<string>} disabledPatterns Pattern ids disabled by the user.
 * @param {number} maxPhraseLength Phrase length cap (LIMITS.MAX_PHRASE_LENGTH).
 * @returns {Array<{regex: RegExp, label: string, source: string}>}
 */
```

The body is the current `content.js:522-559` code, with three changes:
- `BASE_PATTERNS` → the module's own `PATTERN_DATA` (same shape).
- `disabledPatterns.has` → parameter `disabledPatterns.has`.
- `LIMITS.MAX_PHRASE_LENGTH` → parameter `maxPhraseLength`.

Export as `SS_buildPatterns` on `root` and in `module.exports`.

In `content.js`, delete the local `buildPatterns` and replace the four
call sites (`content.js:242, 295, 302, 306`) with
`SS_buildPatterns(userPhrases, enabledLangs, disabledPatterns, LIMITS.MAX_PHRASE_LENGTH)`.
If `BASE_PATTERNS` becomes unused in content.js after this, remove the
alias line (check first: it may be referenced elsewhere).

Add `SS_buildPatterns` to `eslint.config.js` browser globals and
`types/globals.d.ts`.

**Verify**:
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run test:unit` → 36 pass (no behavior change yet).

### Step 2: Unit tests for every assembly branch

Add to `tests/unit/pattern-data.test.js` (import `buildPatterns` from
module.exports):

1. exact-mode adds `\b` both sides: `buildPatterns([{text: "hello"}], [], new Set(), 120)` → regex `/\bhello\b/i`.
2. punctuation-safe gating: `"hello?"` → no trailing `\b` (regex `/\bhello\?/i`); `" hello"` → no leading `\b`; `"hello world"` → both.
3. contains-mode: `{mode: "contains", text: "abc"}` → `new RegExp("abc", "i")` (no anchors, escaped).
4. length filter: text longer than `maxPhraseLength` is dropped; empty/whitespace text dropped.
5. disabled patterns skipped: `disabledPatterns = new Set(["EN-1"])` → EN-1 absent, EN-2 present.
6. language filter: `langs: ["ES"]` → only ES patterns.
7. custom-first ordering: custom phrase plus EN-1 both match a text; `buildPatterns(...)` order puts custom first.
8. escaping: `{text: "a.b*c"}` → regex escapes to `a\.b\*c`.

**Verify**: `npm run test:unit` → all pass, ≥ 48 total. Then `npm run
test:extension` → both files pass (proves content.js still behaves
identically end-to-end).

## Test plan

The 8 unit cases in Step 2 are the deliverable. The existing e2e
(attribution, per-pattern disable, custom-phrase flows in
`tests/extension-interactions.js`) is the extraction's regression net.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` exits 0 with the 8 new assembly tests
- [ ] `npm run test:extension` passes
- [ ] `grep -n "function buildPatterns" content.js` returns nothing (moved)
- [ ] `grep -n "SS_buildPatterns" content.js` shows 4 call sites
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A verification fails twice after a reasonable fix attempt.
- A test requires changing the regex output (i.e. extraction would alter
  behavior) — the extraction MUST be behavior-preserving; report the
  mismatch.
- Plan 025 hasn't landed and its corpus tests are missing — the e2e
  still protects you, but note the dependency in your report.

## Maintenance notes

- Future detection-pattern changes belong in `shared/pattern-data.js`
  with a corpus test — this extraction makes that the natural workflow.
- `buildPatterns`'s custom-first ordering is load-bearing (attribution +
  suggestion gating); keep the comment explaining it with the code.
- Reviewer should verify the four call sites pass identical arguments
  and that no content.js code still references `BASE_PATTERNS` if the
  alias is removed.
