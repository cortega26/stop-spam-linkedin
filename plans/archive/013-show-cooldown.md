# Plan 013: Make the "Show" re-block cooldown real — remove the dead WeakMap branch and key the cooldown by post identity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- shared/pattern-data.js content.js tests/unit/ tests/extension-smoke.js package.json .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/004-shared-pattern-data.md` (creates
  `shared/pattern-data.js`, where the new helper goes) and
  `plans/005-unit-test-coverage.md` (creates the `tests/unit/` directory,
  the `npm run test:unit` script, and the CI step this plan's tests reuse)
- **Category**: bug
- **Planned at**: commit `1f7f4e3`, 2026-08-14

## Why this matters

The code documents a "15 min after Show" re-block cooldown
(`CONFIG.COOLDOWN_DURATION_MS` at `content.js:17`), and `restorePost()`
sets one — but it can never fire. `restorePost()` always adds the post to
`forceShow`, and `blockPost()` returns early whenever `forceShow.has(post)`
is true, so the `showCooldowns` branch is unreachable dead code. Worse, the
cooldown is keyed by the DOM *element* in a `WeakMap`, so the exact scenario
its own comment claims to handle — LinkedIn virtual scrolling re-creating
the DOM node for a post — can't be covered by an element key: the new node
isn't in the map. Actual behavior today:

- Live node after "Show": never re-blocked for the session (`forceShow`).
- Re-created node after "Show" (scroll away and back, or reload): re-blocked
  **immediately** — the documented 15-minute protection does not exist.

This plan removes the dead branch and implements the documented contract for
re-created nodes: a cooldown keyed by the post's `data-id` attribute (stable
across node re-creation), with the pure store logic extracted into
`shared/pattern-data.js` so it's unit-testable. Posts without a `data-id`
fall back to the existing `forceShow` behavior (unchanged from today).

## Current state

`content.js:105-107` — the dead cooldown store, element-keyed:
```js
  /* Cooldown after user presses "Show" — prevents re-blocking when
     virtual scrolling re-creates DOM nodes for the same post. */
  const showCooldowns = new WeakMap();
```

`content.js:661-667` — the unreachable branch inside `blockPost()`:
```js
  function blockPost(post, textNode) {
    /* Re-block cooldown — skip if user recently clicked "Show". */
    if (showCooldowns.has(post)) {
      if (Date.now() < showCooldowns.get(post)) return;
      showCooldowns.delete(post);
    }
    if (processed.has(post) || forceShow.has(post)) return;
```

`content.js:984-987` — `restorePost()`, the only writer:
```js
  function restorePost(post) {
    forceShow.add(post);
    processed.delete(post);
    showCooldowns.set(post, Date.now() + CONFIG.COOLDOWN_DURATION_MS);
    post.style.display = "";
```

`content.js:17` — the (currently inert) constant:
```js
    COOLDOWN_DURATION_MS: 15 * 60 * 1000,     /* 15 min after "Show" */
```

The mock feed in `tests/extension-smoke.js` gives blocked posts the
`data-id="urn:li:activity:spam-1"` attribute (lines 24-29), so the smoke
test can exercise the identity-keyed path end to end.

**Conventions to match**: `shared/pattern-data.js` (created by plan 004) is
a UMD-style IIFE that assigns to a global on `self`/`globalThis` and also
does `if (typeof module !== "undefined" && module.exports) { module.exports
= {...} }` — add `createCooldownStore` to its exports the same way plan 005
adds `escapeRegex` etc. Unit tests use `node:test` + `node:assert/strict`
(modeled on `tests/extension-smoke.js`'s assertion style) and run via
`npm run test:unit` (created by plan 005 — it must exist before this plan
runs; if it doesn't, STOP and report). The repo has no linter enforced yet
(plan 006), but keep the existing style: `"use strict"` IIFEs, 2-space
indent, `const` over `let`, comment every non-obvious branch.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Syntax    | `npm run smoke` | exit 0 |
| Unit tests | `npm run test:unit` | exit 0, all pass (includes the new cooldown tests) |
| e2e unpacked | `npm run test:extension` | exit 0, "Extension smoke test passed." |

## Scope

**In scope**:
- `shared/pattern-data.js` (add `createCooldownStore` export)
- `content.js` (remove the dead `showCooldowns` WeakMap + branch; wire the
  new store keyed by `data-id`)
- New file: `tests/unit/cooldown-store.test.js`
- `tests/extension-smoke.js` (add the re-created-node scenario at the end)

**Out of scope**:
- Changing `CONFIG.COOLDOWN_DURATION_MS`'s value (15 min stays).
- Touching `forceShow`'s semantics — the live-node protection is
  deliberate and documented in the README ("restore it temporarily").
- Plan 002's snooze-resume bug and plan 003's toggle double-count — both
  are separate plans in this folder; don't fix them here.
- Posts without a `data-id` (heuristic-found containers): no identity
  exists to key on; their behavior is unchanged. Do not try to invent an
  identity for them — that's a design change, not this plan.
- `package.json` / `.github/workflows/ci.yml`: plan 005 already added the
  `test:unit` script and CI step. If you discover they're missing anyway,
  STOP and report instead of adding them here.

## Git workflow

- Branch: `advisor/013-show-cooldown`
- Commit message style (match repo, e.g. from `git log`:
  `fix(blocking): honor 15-min cooldown for re-created posts after Show`):
  one commit per step.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `createCooldownStore` to `shared/pattern-data.js`

Open `shared/pattern-data.js` (created by plan 004 — if it doesn't exist,
STOP and report: plan 004 hasn't landed). Append a pure factory and add it
to the exports:

```js
  /* Map-based cooldown store keyed by string identity (e.g. a post's
     data-id). Entries expire after expiryMs; `has` is false for expired
     keys. Evicts oldest entries past maxEntries to bound memory. */
  function createCooldownStore(expiryMs, maxEntries) {
    const map = new Map();
    return {
      has(key) {
        const expiry = map.get(key);
        if (expiry === undefined) return false;
        if (Date.now() >= expiry) {
          map.delete(key);
          return false;
        }
        return true;
      },
      set(key) {
        map.set(key, Date.now() + expiryMs);
        while (map.size > maxEntries) {
          const oldest = map.keys().next().value;
          map.delete(oldest);
        }
      },
    };
  }
```

Expose it from the same `module.exports` / global export the file already
has (the exact export object shape depends on what plan 004/005 left — add
`createCooldownStore` next to the existing names; keep every existing export
intact).

**Verify**:
- `node --check shared/pattern-data.js` → exit 0
- `npm run test:unit` → still green (nothing new tested yet; confirms the
  file still loads in Node)

### Step 2: Rewire `content.js`

1. Delete the `showCooldowns` declaration (`content.js:105-107`) and
   replace it with a store instance (the `data-id` attribute the known
   selectors match on is `urn:li:activity:*`):
   ```js
   /* Cooldown after user presses "Show" — keyed by post identity
      (data-id) so it survives virtual-scroll node re-creation.
      Posts without a data-id rely on forceShow (live node only). */
   const cooldownStore = createCooldownStore(CONFIG.COOLDOWN_DURATION_MS, 100);
   ```
2. Replace the dead branch in `blockPost()` (`content.js:663-666`) with:
   ```js
     const postKey = post.getAttribute("data-id");
     if (postKey && cooldownStore.has(postKey)) return;
   ```
   Keep the following line (`if (processed.has(post) || forceShow.has(post)) return;`)
   unchanged.
3. In `restorePost()` (`content.js:987`), replace the `showCooldowns.set`
   line with:
   ```js
     const postKey = post.getAttribute("data-id");
     if (postKey) cooldownStore.set(postKey);
   ```

Resulting behavior: click "Show" → `forceShow` protects the live node
(session-long, as before) AND the identity cooldown protects re-created
nodes with the same `data-id` for 15 minutes. After 15 min, a re-created
node can be blocked again — that is the documented contract.

**Verify**:
- `npm run smoke` → exit 0 (includes `node --check content.js`)
- `grep -n "showCooldowns" content.js` → no matches
- `grep -n "cooldownStore" content.js` → 3 matches (declaration, blockPost
  guard, restorePost set)

### Step 3: Unit tests for the store

Create `tests/unit/cooldown-store.test.js` using `node:test` +
`node:assert/strict` (no framework — match `tests/extension-smoke.js`'s
style, `require("../shared/pattern-data.js")`). Cover:

- `has` on an unknown key → `false`
- `set` then immediate `has` → `true`
- expiry: store with `expiryMs = 20`, `set`, `await new Promise(r => setTimeout(r, 40))`, `has` → `false`
- cap eviction: store with `maxEntries = 3`, set 4 distinct keys, `has` on
  the first key → `false`, `has` on the newest → `true`
- `set` on an existing key refreshes expiry (set, wait past nothing — assert
  still `true` immediately after a second `set`)

**Verify**: `npm run test:unit` → all tests pass, including the 5 new ones
(you'll see the new file listed in the output).

### Step 4: e2e scenario for the re-created node

Append to `tests/extension-smoke.js`, after the existing placeholder-text
assertion (line ~103, before the final `console.log("Extension smoke test passed.")`):

1. Click the placeholder's "Show" button:
   `await page.getByRole("button", { name: "Show" }).click();`
   (Locale is `en` in the test browser, so the button reads "Show" via
   `t("show")`.) Assert `[data-ss-ph]` count is 0 and the spam section's
   `display` is not `none`.
2. Re-create the node to simulate virtual scrolling:
   ```js
   await page.evaluate(() => {
     const section = document.querySelector('[data-id="urn:li:activity:spam-1"]');
     const clone = section.cloneNode(true);
     section.replaceWith(clone);
   });
   ```
3. Wait ~1500ms (debounce is 500ms + scan), then assert the NEW node
   (`page.locator('[data-id="urn:li:activity:spam-1"]')`) still has
   `display` not `none` — the identity cooldown must hold it visible.
4. (Optional sanity check that cooldown isn't a blanket "never re-block":
   no assertion needed here — the unit tests cover expiry.)

**Verify**: `npm run test:extension` → exit 0, "Extension smoke test
passed."

## Test plan

- New unit tests (Step 3): 5 cases in `tests/unit/cooldown-store.test.js`,
  modeled after the assertion style in `tests/extension-smoke.js`.
- New e2e scenario (Step 4) in `tests/extension-smoke.js`: Show → node
  re-creation → stays visible. This is the regression test for the exact
  promise the old comment made and failed to keep.
- Existing e2e (hide-spam, whitelist, clean-post) must still pass — they
  exercise `blockPost()`'s guard path with no `data-id` change.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:unit` exits 0; `tests/unit/cooldown-store.test.js`
      exists with the 5 cases
- [ ] `npm run test:extension` exits 0, "Extension smoke test passed."
- [ ] `grep -rn "showCooldowns" content.js` returns nothing
- [ ] `grep -c "createCooldownStore" shared/pattern-data.js content.js` ≥ 3
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `shared/pattern-data.js` doesn't exist (plan 004 hasn't landed) or
  `npm run test:unit` doesn't exist in `package.json` (plan 005 hasn't
  landed).
- The code at the locations in "Current state" doesn't match the excerpts.
- The smoke scenario shows the re-created node getting re-blocked even
  though Step 2's wiring looks correct — this would mean the cooldown
  key doesn't match (e.g. LinkedIn data-id attribute differs in the mock),
  and the fix needs a different key source: investigate and report, do not
  silently pick another attribute.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a future plan changes how posts get blocked without a `data-id` (e.g.
  plan 008's author blocklist), revisit the cooldown's key source — the
  no-`data-id` fallback (forceShow only) is the weakest part of this design
  and should be extended only with a real identity, not another heuristic.
- `forceShow` and the cooldown now protect different nodes with the same
  intent (don't annoy the user who pressed "Show"). A reviewer should
  scrutinize that the cooldown branch sits BEFORE the `processed`/`forceShow`
  check (it does in Step 2), so re-created nodes hit the cooldown before
  anything else.
- The `data-id` attribute on the placeholder-adjacent post is also what the
  exclusion signature (plan 007) and attribution features (plan 010) build
  on — if `data-id` stops being reliable on real LinkedIn pages, all three
  need a coordinated revisit.
