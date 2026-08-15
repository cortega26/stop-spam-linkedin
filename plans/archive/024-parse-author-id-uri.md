# Plan 024: Guard `decodeURIComponent` in `SS_parseAuthorId` — URIError aborts scan/restore batches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ca9905f..HEAD -- shared/pattern-data.js tests/unit/pattern-data.test.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `ca9905f`, 2026-08-15

## Why this matters

`SS_parseAuthorId` promises "returns a stable author id … or null when the
href isn't a LinkedIn identity URL". Its implementation throws an
uncaught `URIError` on malformed percent-encoding (e.g. `/in/100%`), because
`decodeURIComponent(match[1])` runs *outside* the try block that guards the
URL parsing. Every caller runs in an unbounded loop over posts or links:
`getAuthorId` is used from `scanForBlockedAuthors`, `blockPost`, and
`restoreAuthorPosts` (all in `for` loops), and `background.js` calls it
directly in the context-menu click handler. One malformed href (corrupt
card, foreign slug, or future LinkedIn markup change) throws mid-loop: the
remaining posts in that scan batch are never blocked, and — worse — their
text nodes were already marked `processed`, so they are not re-examined
for the rest of the session.

## Current state

- `shared/pattern-data.js:116-142` — `parseAuthorId`; the decode is outside the try:
  ```js
  let url;
  try {
    url = new URL(href, baseOrigin || "https://www.linkedin.com");
  } catch (_) {
    return null;
  }
  if (!isLinkedInHost(url.hostname)) return null;

  for (const pattern of patterns) {
    const match = url.pathname.match(pattern.re);
    if (match) {
      return pattern.prefix + decodeURIComponent(match[1].toLowerCase());
    }
  }
  return null;
  ```
- Callers: `content.js:1234-1243` (`getAuthorId`), `content.js:677`, `content.js:779`, `content.js:1021-1026` (`restoreAuthorPosts`), `background.js:57` (context-menu handler).
- `tests/unit/pattern-data.test.js:40-60` — existing `parseAuthorId` tests; the pattern to extend.

Repo conventions: the function's contract is documented "or null" — match
it on every failure path. The shared module is UMD: fix in
`shared/pattern-data.js`, tests go in `tests/unit/pattern-data.test.js`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Smoke     | `npm run smoke`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Unit      | `npm run test:unit`      | all pass (36→40 after Step 2) |

## Scope

**In scope**:
- `shared/pattern-data.js`
- `tests/unit/pattern-data.test.js`

**Out of scope** (do NOT touch):
- `content.js`, `background.js` — no caller changes needed; the fix at the
  source protects all of them.
- Any change to `parseAuthorId`'s signature or return values for valid hrefs.

## Git workflow

- Branch: `advisor/024-parse-author-id-uri`
- Commit message style: conventional, e.g. `fix(authors): return null from parseAuthorId on malformed percent-encoding`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Move the decode inside the failure-guarded path

In `shared/pattern-data.js`, wrap the decode so a `URIError` returns null:

```js
for (const pattern of patterns) {
  const match = url.pathname.match(pattern.re);
  if (match) {
    try {
      return pattern.prefix + decodeURIComponent(match[1].toLowerCase());
    } catch (_) {
      return null;
    }
  }
}
```

(Alternatively wrap the whole function body in one try/catch returning
null — pick whichever keeps the code cleanest; the contract is: any
malformed input → null.)

**Verify**:
- `node -e "const pd=require('./shared/pattern-data.js'); console.log(pd.parseAuthorId('/in/100%'))"` → `null` (not a thrown URIError)
- `node -e "const pd=require('./shared/pattern-data.js'); console.log(pd.parseAuthorId('/in/jane-doe/'))"` → `jane-doe` (valid path unchanged)
- `npm run smoke` → exit 0; `npm run lint` → exit 0; `npm run typecheck` → exit 0

### Step 2: Unit tests

Add to `tests/unit/pattern-data.test.js`, next to the existing
`parseAuthorId` tests:

1. `parseAuthorId returns null for malformed percent-encoding` —
   `/in/100%`, `/in/%E0%A4%A`, `https://www.linkedin.com/in/bad%` → all
   null, and no throw.
2. `parseAuthorId still parses valid percent-encoded slugs` —
   `/in/John%20Doe/` → `john doe` (and lowercased), confirming the decode
   still works.
3. `parseAuthorId still returns null for non-LinkedIn hosts` — the
   existing test at line 51-54 already covers; do not duplicate.

**Verify**: `npm run test:unit` → all pass (36 + 2 new = 38).

## Test plan

Unit tests only (Step 2). The e2e suite exercises `getAuthorId`
indirectly through the whitelist/blocklist flows
(`tests/extension-interactions.js`); no e2e change needed — a malformed
href isn't worth a mock-feed fixture.

## Done criteria

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck` exit 0
- [ ] `npm run test:unit` exits 0 with 38 passing tests (36 + 2 new)
- [ ] `node -e "...parseAuthorId('/in/100%')..."` prints `null` without throwing
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited code doesn't match the excerpts (drift).
- A step's verification fails twice after a reasonable fix attempt.
- Valid-URL parsing regresses (the lowercasing + decode order must stay
  `decodeURIComponent(match[1].toLowerCase())`).

## Maintenance notes

- The `patterns` array's prefix handling (company/school/showcase) is
  unaffected — the try only wraps the decode.
- If a future change makes `match[1]` already-decoded, the double-decode
  hazard returns; the unit test `john doe` case pins single-decoding.
- Reviewer should check that no caller now needs a try/catch of its own
  around `getAuthorId`.
