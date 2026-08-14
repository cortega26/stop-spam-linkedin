# Plan 010 (design): Show which pattern or phrase actually triggered each block

> **Executor instructions**: This is a **design plan** — read "Why this is
> a design plan" before starting. Resolve the open decisions below, then
> implement following the recommended shape, adapting to whatever
> `content.js`/`popup/popup.js` look like at execution time. Run every
> verification command and confirm the expected result. If anything in
> "STOP conditions" occurs, stop and report. When done, update the status
> row for this plan in `plans/README.md`.
>
> **Status note**: this plan interacts closely with `plans/004-shared-pattern-data.md`
> (cleaner labels if it's landed) and touches the same functions
> `plans/005-unit-test-coverage.md` extracts. **Recommended: mark this
> BLOCKED (awaiting 004) in `plans/README.md` and don't start implementing
> until 004's status is DONE**, even though a fallback path without it
> exists (see Decision 1) — the fallback produces a worse result for no
> real time savings, since 004 is already a small, low-risk plan.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js popup/popup.js`
> (add `shared/pattern-data.js` to this diff once `plans/004` has landed).
> If `buildPatterns`, `isSpam`, `blockPost`, or `lastBlocked`'s shape have
> changed materially from the excerpts below, re-derive this plan's
> approach against the live code.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (additive; see "Why this matters" for the simplification
  it also enables)
- **Depends on**: `plans/004-shared-pattern-data.md` (soft — see status note above)
- **Category**: direction (feature)
- **Planned at**: commit `1f7f4e3`, 2026-08-08

## Why this is a design plan

Implementing attribution requires changing what `buildPatterns()` returns
(from a flat array of `RegExp` to something that also carries a label) and
threading that through `isSpam` → `findSpamTextNodes` → `blockPost` →
`lastBlocked` → the popup's rendering — four functions and one data
structure, not a single-file mechanical change. The exact label source
depends on whether `plans/004-shared-pattern-data.md` has landed (clean,
pre-existing labels) or not (this plan would need to invent its own,
duplicating exactly the kind of hand-maintained parallel data
`plans/004` exists to eliminate). Given that dependency and the
multi-function threading, this is scoped as a design plan so the decision
about label sourcing is made deliberately rather than baked into
prematurely-specific code.

## Why this matters

`lastBlocked` (`content.js:110`, populated in `blockPost()`,
`content.js:680-687`) already stores a heuristically-extracted trigger
snippet per block (`extractTrigger`, `content.js:971-976` — looks for a
quoted word, falls back to the first 40 characters of the matched text).
The popup renders this list with an "Undo" button per entry. What it
*doesn't* show is **which specific pattern or phrase actually matched** —
useful for a user deciding, after a false positive, whether to disable an
entire built-in language or edit/remove a specific custom phrase. Right
now they can only see the raw matched text and have to guess.

This also **simplifies existing code**: `blockPost()` currently
re-derives, from scratch, whether a match was "custom" or "built-in" purely
to decide whether to auto-suggest a trigger word
(`content.js:690-718`) — reimplementing `escapeRegex` + the same `\b`
mode-anchoring logic `buildPatterns` already used to build the pattern in
the first place, just to check `userPhrases.some(...)` again:
```js
    if (textNode) {
      const txt = textNode.textContent;
      const isCustom = userPhrases.some(p => {
        if (
          !p.enabled ||
          typeof p.text !== "string" ||
          !p.text.trim() ||
          p.text.trim().length > CONFIG.MAX_PHRASE_LENGTH
        ) return false;
        const text = p.text.trim();
        const escaped = escapeRegex(text);
        if (p.mode === "contains") {
          return new RegExp(escaped, "i").test(txt);
        }
        const start = /^\w/.test(text) ? "\\b" : "";
        const end = /\w$/.test(text) ? "\\b" : "";
        return new RegExp(start + escaped + end, "i").test(txt);
      });
      if (!isCustom) {
        const word = extractSuggestionWord(txt);
        ...
```
If `isSpam`/`findSpamTextNodes` already know *which* pattern object
matched (because attribution requires that), this entire re-derivation
block can be deleted and replaced with a direct check against the match's
source (`matchInfo.source === "builtin"`) — this plan is a net reduction
in `content.js`'s line count and duplicated logic, not just a feature
addition.

## Current state

`content.js:439-468` — `buildPatterns`, returns a flat array of `RegExp`
today (see `plans/004-shared-pattern-data.md`'s "Current state" for the
full excerpt if it's landed and this has changed shape).

`content.js:474-477` — `isSpam`, the single call site that would need to
change from boolean to "which pattern matched":
```js
  function isSpam(text) {
    if (excludedSignatures.has(getExcludedSignature(text))) return false;
    return spamPatterns.some((re) => re.test(text));
  }
```

`content.js:524-533` — `findSpamTextNodes`, calls `isSpam` per candidate
text node:
```js
  function findSpamTextNodes(root) {
    const hits = [];
    forEachTextNode(root, (node) => {
      if (isSpam(node.textContent)) {
        if (node.parentElement) processed.add(node.parentElement);
        hits.push(node);
      }
    });
    return hits;
  }
```

`content.js:661-804` — `blockPost(post, textNode)`, where `lastBlocked`
entries are built (`content.js:680-687`):
```js
    if (textNode) {
      lastBlocked.unshift({
        post,
        triggerText: extractTrigger(textNode.textContent),
        timestamp: Date.now(),
      });
      if (lastBlocked.length > 5) lastBlocked.pop();
    }
```

`content.js:301-307` — the `getState` message response, where
`lastBlocked` entries are serialized for the popup:
```js
          lastBlocked: lastBlocked.map(item => ({
            triggerText: item.triggerText,
            timestamp: item.timestamp,
          })),
```

`popup/popup.js:205-231` — where `lastBlocked` entries are rendered
(the `.lb-text` span currently shows only `item.triggerText`).

## Design decisions

### Decision 1: where do labels come from

- **If `plans/004-shared-pattern-data.md` has landed**: `SS_PATTERN_DATA`
  already associates each built-in regex with a human-readable `label`
  (e.g. `'comment "WORD" and I\'ll send / share ...'`). Use it directly —
  `buildPatterns` should return `{ regex, label, source: "builtin" }` for
  built-ins (reading `label` straight from `SS_PATTERN_DATA`) and
  `{ regex, label: phrase.text, source: "custom" }` for user phrases.
- **If `plans/004` has not landed** (not recommended — see the status note
  at the top of this plan): `buildPatterns` would need its own inline
  label per built-in pattern, which is exactly the kind of
  hand-maintained parallel array `plans/004` exists to eliminate — don't
  do this unless there's a specific reason `plans/004` is being skipped
  entirely, and if so, note that reason in this plan's eventual commit
  message.

### Decision 2: match order matters when text matches both a builtin pattern AND a custom phrase

`buildPatterns` concatenates `[...builtin, ...custom]` today
(`content.js:467`: `return [...builtin, ...custom];`). If attribution is
implemented naively as "return the first array entry whose regex matches,"
a text that happens to match both a builtin pattern and an enabled custom
phrase would always attribute to the **builtin** match — because builtin
entries come first in the array — regardless of the custom phrase also
matching.

This isn't just a cosmetic ordering choice: it's exactly the case the
`isCustom` block being deleted (see "Why this matters") was computing,
independently, for the auto-suggest-trigger-word decision. The *original*
code checks **every** custom phrase against the text, so if any enabled
custom phrase matches, `isCustom` is `true` regardless of whether a
builtin pattern happens to match too — suppressing the trigger-word
suggestion. A naive "first match in the concatenated array" replacement
would instead report `source: "builtin"` for the same text (since builtin
entries are ordered first), silently flipping the suggestion to fire when
it previously wouldn't have.

**Fix: build the array as `[...custom, ...builtin]` instead — custom
phrases first.** This is a one-line reordering with no other effect
(`isSpam`'s `.some()` check, still used wherever a plain boolean is needed,
is order-independent — reordering only changes which entry `.find()`/
first-match logic returns when *both* would match). With custom phrases
first, "return the first match" now naturally reproduces the original
`isCustom` semantic: if any custom phrase matches, that's what gets
returned (and attributed, and used for the suggestion-suppression check),
exactly matching the original code's "was this covered by a custom phrase"
priority. It's also arguably the better attribution to *show* the user
regardless of the suggestion logic: "matched your phrase 'X'" is more
specific and actionable than a generic builtin pattern label when both are
true.

Do not implement this plan without the reordering fix. If you find a
different way to preserve the original suppression semantic (e.g. an
explicit secondary check rather than reordering), that's acceptable too —
but verify it against the specific overlap scenario in this plan's Test
plan section, not just the two non-overlapping cases (builtin-only,
custom-only) that are easy to get right by construction.

### Decision 3: how far attribution UI goes

Recommended minimal scope: the popup's "Last blocked" list
(`popup/popup.js:205-231`) shows the matched label alongside the existing
trigger snippet, e.g. `"CLAUDE" — matched: comment "WORD" and I'll send /
share ...` for a built-in match, or `"my custom phrase" — matched your
phrase` for a custom one. Do not attempt to also surface attribution in
the in-feed placeholder (`content.js:727-794`) as part of this plan — that
placeholder is already fairly button-dense (Not spam / Never block author
/ Show), and adding attribution text there is a separate UX call with its
own space constraints; leave it for a follow-up if wanted.

## Recommended shape

- `buildPatterns(phrases, langs)` returns `Array<{ regex: RegExp, label:
  string, source: "builtin" | "custom" }>` instead of `Array<RegExp>`,
  ordered `[...custom, ...builtin]` — **custom phrases first** (Decision
  2's fix; this is a change from the current `[...builtin, ...custom]`
  order).
- Replace `isSpam(text)` with a function that returns the matched entry or
  `null` (e.g. `findMatch(text)`), keeping `isSpam` as a thin boolean
  wrapper (`const isSpam = (text) => !!findMatch(text);`) **only if**
  something outside `findSpamTextNodes` still needs a plain boolean call —
  check for other call sites before deciding whether to keep the wrapper
  or just replace `isSpam` outright at its one current call site.
- `findSpamTextNodes` captures the match info per hit (e.g. return
  `{ node, match }` pairs instead of bare nodes) and passes it through to
  `blockPost`.
- `blockPost(post, textNode, matchInfo)` stores `matchInfo.label` (and
  `matchInfo.source`) on the `lastBlocked` entry, and uses
  `matchInfo.source === "builtin"` in place of the deleted
  `isCustom`-re-derivation block (see "Why this matters") to decide
  whether to auto-suggest a trigger word.
- `getState`'s response includes the label per `lastBlocked` entry.
- `popup/popup.js`'s render function displays it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax check | `npm run smoke` | exit 0 |
| Unpacked extension e2e | `npm run test:extension` | exit 0 |
| Packaged extension e2e | `npm run test:package` | exit 0 |

## Scope

**In scope**: `content.js`, `popup/popup.js`, `popup/popup.html` (if new
markup is needed for the label), `_locales/en/messages.json`,
`_locales/es/messages.json` (a label prefix string, e.g. `"matchedLabel"`
→ "Matched:").

**Out of scope**: the in-feed placeholder (Decision 3); any change to
`shared/pattern-data.js`'s data itself (only how it's *read*, if
`plans/004` has landed); `options/options.js` (its `BUILTIN` display
already shows labels independently — no change needed there).

## Git workflow

- Branch: `advisor/010-blocked-by-attribution`
- Commit message style: `feat(popup): show which pattern matched each blocked post`
- Do NOT push or open a PR unless the operator instructed it.

## Phased approach

### Phase 1: Confirm `plans/004`'s status and Decision 1
Check `plans/README.md`. If 004 isn't DONE, stop and either wait for it or
explicitly document why you're proceeding without it.

### Phase 2: Change `buildPatterns` and add `findMatch`
Implement the shape from "Recommended shape." Verify with a quick manual
check (temporarily log `findMatch`'s result for a known spam string) that
labels resolve correctly for both a built-in and a custom-phrase match
before wiring up the rest of the chain.

### Phase 3: Thread match info through `findSpamTextNodes` → `blockPost` → `lastBlocked` → `getState`
Delete the `isCustom` re-derivation block (`content.js:690-718`) as part of
this phase, replacing it with the `matchInfo.source` check.

### Phase 4: Render in the popup
Add the label to `popup/popup.js`'s last-blocked row rendering.

## Test plan

- e2e: block a post matching a built-in pattern and confirm the popup's
  last-blocked entry shows a built-in label; add a custom phrase, trigger a
  block via it, confirm the popup shows that phrase's own text as the
  label instead.
- Regression: confirm the auto-suggest-trigger-word behavior (popup's
  "Add "WORD"?" suggestion chip) still only fires for built-in matches,
  not custom-phrase matches — this is the behavior the deleted
  `isCustom` block used to gate; verify the replacement gates it
  identically.
- **Overlap case (required — do not skip)**: add a custom phrase whose
  text is also covered by an enabled built-in pattern (e.g. add "CLAUDE"
  as a custom exact-match phrase, which also falls inside the existing EN
  built-in pattern's quoted-word matching), then trigger a block with text
  that both would match. Confirm: (a) the popup's attribution shows the
  *custom* phrase as the match reason, not the generic builtin label, and
  (b) the auto-suggest-trigger-word suggestion does **not** fire (since a
  custom phrase already covers it) — both are the direct check on
  Decision 2's ordering fix, and both would silently fail with a naive
  "first entry in `[...builtin, ...custom]`" implementation.

## Done criteria

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0 (including the overlap-case scenario — not just the two non-overlapping cases)
- [ ] `npm run test:package` exits 0
- [ ] `grep -n "isCustom" content.js` returns no matches (confirms the
      duplicated re-derivation block was actually deleted, not left
      alongside the new logic)
- [ ] `grep -n "\.\.\.custom.*\.\.\.builtin\|custom.concat(builtin)" content.js` (or equivalent) confirms custom phrases are ordered before builtin patterns in whatever `buildPatterns` returns — the Decision 2 fix
- [ ] The popup visibly shows a matched-pattern label for a newly blocked post (manual check)
- [ ] For the overlap case specifically: the shown label is the custom phrase's own text, not a generic builtin label
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `plans/004-shared-pattern-data.md` is not DONE and you don't have an
  explicit, documented reason to proceed without it.
- The auto-suggest-trigger-word regression check fails — that's a
  behavior change beyond this plan's scope (attribution display), not
  something to "fix forward" without understanding why the replacement
  gate diverged from the original.
- `npm run test:extension` or `npm run test:package` fails twice after a
  reasonable fix attempt.

## Maintenance notes

- If `plans/008-author-blocklist.md` also lands, both plans add a third
  parameter to `blockPost()` — see that plan's maintenance notes for the
  merge approach.
- A reviewer should scrutinize: that `findMatch`'s label lookup handles a
  custom phrase whose `text` contains characters that would need escaping
  for display (e.g. quotes) — the label is rendered as-is via `textContent`
  in the popup (not `innerHTML`), so this should be safe by construction,
  but worth a specific look given it's user-authored text reaching a new
  render path.
