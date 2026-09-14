# Plan 073: Decide context-menu silent-failure receipts (spike)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3aef7b9..HEAD -- background.js content.js _locales/en/messages.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (serial discipline only: after 072 — both touch
  `_locales/*.json` and `tests/extension-interactions.js`, so parallel
  worktrees would conflict on merge; before 074/075, which share
  `content.js`)
- **Category**: direction
- **Planned at**: commit `3aef7b9`, 2026-09-14

## Why this matters

Two context-menu actions — "Add to LinkedIn Spam Blocker" (any page) and
"Block this author" (LinkedIn links) — fail silently in at least six
situations: duplicate entry, list cap reached, phrase too long, empty
selection, sync-quota overflow, storage write error. The service worker
has no UI surface, so today a user who right-clicks and sees nothing
happen cannot distinguish "saved" from "silently skipped." The affected
paths are rare (caps are generous: 200 phrases, 100 authors), but the
quota path bites exactly the power users with the largest lists, and
"nothing happened" with no recourse is the worst failure shape. This is a
spike, not a build: measure the paths, prototype the cheapest honest
feedback, and record a verdict. A documented-silence verdict is valid if
the evidence says the cure (new permission, new message protocol) costs
more than the disease.

## Current state

The facts the executor needs, inlined:

- **Silent return sites** (`background.js:107-185`,
  `handleContextMenuClick`):
  - Report dispatch: `if (!tab || typeof tab.id !== "number") return;`
    (`background.js:111`); non-LinkedIn URL guard (`background.js:112`);
    missing receiver swallowed via empty `lastError` branch
    (`background.js:119-123`, comment: "No content receiver (e.g.
    chrome:// tab) — stay silent").
  - Block-author: unparseable author (`background.js:129`); already
    blocked (`background.js:135`); cap reached (`background.js:136`).
  - Add-phrase: empty text (`background.js:150`); over length
    (`background.js:151`); phrase-list cap (`background.js:157`);
    duplicate (`background.js:163`, comment: "silently skip — no UI to
    report in service worker"); quota overflow (`background.js:174-177`,
    `console.warn` only); write failure (`background.js:180-182`,
    `console.warn` only).
- **Test hook already exists** (`background.js:186-188`):
  `globalThis.__SS_handleContextMenuClick = handleContextMenuClick;`
  with the comment "worker globals are unreachable from page/prod code."
  The archived 063 build drove "real onClicked 3-fixture" coverage
  (plans index, 063 row) — read
  `plans/archive/063-missed-spam-report-build.md` for the established
  fixture-drive pattern before inventing your own.
- **Message discipline**: content-script listener verifies
  `sender.id === chrome.runtime.id` (AGENTS.md content-script details;
  background mirrors it at `background.js:70`). Any worker→tab receipt
  must travel the existing `chrome.tabs.sendMessage(tab.id, …)` path
  used for `reportMissedSpam` (`background.js:116-124`) — dispatched to
  the clicked tab only, never re-resolved, lastError-tolerant.
- **Content-side notice precedent**: `showFirstRunToast`
  (`content.js:1260-1291`) builds a styled, self-removing (`setTimeout …
  5000`) banner with `textContent` (safe-DOM idiom — no innerHTML).
  There is no content-side toast *system*; a receipt would either reuse
  this banner shape or stay out of the page entirely.
- **The heavy alternative and its cost**: `chrome.notifications` would
  need a new `"notifications"` permission in `manifest.json` (currently
  `storage` + `contextMenus` only, `manifest.json:15`), which changes
  the install consent surface and forces `PRIVACY_POLICY.md` + store
  copy updates. That cost is the reason this plan is a spike with an
  explicit decision, not a build.
- **Repo conventions:** `"use strict"` IIFEs; `background.js` keeps its
  own `t`/`uid`/`estimatePhraseBytes` copies by decision (plan 048 —
  do not consolidate); conventional-ish commits; `xvfb-run -a` for
  browser runs.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke | `npm run smoke` | declared | exit 0 |
| Lint | `npm run lint` | declared | exit 0 |
| Typecheck | `npm run typecheck` | declared | exit 0 |
| Unit | `npm run test:unit` | declared | all pass (81 at `3aef7b9`) |
| Spike tests | `node --test plans/research/073/*.test.cjs` | declared | all pass |

No browser gate is required for the verdict (the decision matrix is
Node-testable via the `__SS_handleContextMenuClick` hook; see Step 2).
If you attempt an optional browser proof, use `xvfb-run -a` and record
it — do not install toolchains (Hard Rule 2 for you as advisor applies
to the executor's tree hygiene as well: no installs in the user tree).

## Scope

**In scope** (the only files you should modify/create):
- `plans/research/073/` (create): `matrix.md`, `prototype.*` (only if
  option (a) is prototyped — see Step 3), `*.test.cjs`, `verdict.json`
- `plans/README.md` (your status row only)

**Out of scope** (do NOT touch, even though they look related):
- `background.js`, `content.js`, `manifest.json`, locale files,
  `PRIVACY_POLICY.md` — all read-only in this spike. The verdict may
  *recommend* edits to them for a future build plan; it must not make
  them.
- The report-missed-spam flow's `no-destination` path (063 settled it:
  failure toast + `{ok:false}`) — receipts here concern the two
  *write* actions (add-phrase, block-author), not reporting.
- `chrome.notifications` permission request or any manifest change —
  forbidden in the spike; option (b) ends at a costed recommendation.

## Git workflow

- Branch: `advisor/073-menu-receipts`
- Commit per step; message style: conventional-ish (see `git log --oneline`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Run smoke, lint, typecheck, unit on the unmodified checkout. Read the
archived 063 plan's fixture-drive section (find the "3-fixture" /
"onClicked" coverage — grep `__SS_handleContextMenuClick` in `tests/`
to see if the drive lives in the committed suite).

**Verify**: gates green; you can state where the existing onClicked
coverage lives (file + line) or that it was worktree-only (then the
spike needs its own harness — Step 2 covers both cases).

### Step 1: Write the decision matrix (`matrix.md`)

Enumerate every silent path from "Current state" (all nine sites) in a
table: trigger → who hits it (rare / power-user / anyone) → what the
user perceives today → candidate receipt. Then evaluate exactly three
options:

- **(a) Worker→tab content notice**: `tabs.sendMessage` receipt to the
  clicked tab; content script renders a `showFirstRunToast`-shaped
  banner. Constraints: no receiver on chrome:// or non-LinkedIn tabs
  (add-phrase fires on ANY page — `background.js:34-38` has no
  `documentUrlPatterns`), so the design must specify the no-receiver
  fallback (second silence? no — state it); must reuse the sender-id
  guard; must not look like page content (LinkedIn-styled spoofing
  risk — banner must be visually extension-owned).
- **(b) `chrome.notifications`**: costed only — new permission,
  consent-surface change, privacy-policy + store-copy updates, both
  browsers' behavior. No code.
- **(c) Documented silence**: keep behavior, upgrade the six comments
  to a named policy ("receipts intentionally absent: …") in a future
  build plan — i.e. this verdict would recommend (c) with rationale.

Score each on: new permissions (must stay zero for (a)/(c)),
new files/message kinds, non-LinkedIn-tab behavior, failure modes of
the receipt itself (a receipt that can fail needs its own fallback
story — infinite regress is a valid reason to pick (c)).

**Verify**: matrix lists all nine sites; each option has a fallback
story or an explicit "no fallback, acceptable because …"; no new
permission is smuggled into (a).

### Step 2: Prove the matrix is testable

Using the `__SS_handleContextMenuClick` hook pattern from Step 0,
write `plans/research/073/receipts.test.cjs` driving the handler with
stubbed `chrome.*` globals across the matrix: duplicate, cap, quota,
unparseable author, missing tab, non-LinkedIn URL, no-receiver
lastError. Assert current (silent) outcomes to pin behavior — these
are characterization tests: return values / sent-message arrays /
storage-write calls recorded per case.

If the 063 fixture-drive already covers some paths in the committed
suite, state the overlap and cover only the delta here (no duplicate
suites).

**Verify**: `node --test plans/research/073/*.test.cjs` → all pass
(≥ 10 assertions); the suite passes against the UNMODIFIED
`background.js` (pin, not fix).

### Step 3: Prototype the winner (only if (a))

If the matrix picks (a): build a throwaway prototype under
`plans/research/073/` (content-side banner function reading nothing
but the receipt message `{ action: "menuReceipt", kind, key }`,
banner copy from a fixed allowlist — never echoing raw selection text
into the page, to avoid reflecting attacker-influenced strings into
DOM even via `textContent`), and drive it through the Step-2 harness
plus an optional mock-page run. Copy allowlist (fixed, no locale keys
in the spike — production localization belongs to the build plan):
`duplicate` → "Already in your phrases — no change.",
`cap` → "Phrase list is full — no change.",
`quota` → "Too large to save — no change.",
`authorDup` / `authorCap` analogues.

If the matrix picks (b) or (c): no prototype. The verdict carries the
costing (b) or the policy wording (c).

**Verify**: prototype tests pass; no production file modified
(`git diff --name-only 3aef7b9...HEAD` shows only `plans/` paths).

### Step 4: Record the verdict (`verdict.json`)

Mirror prior verdict shapes: `plan`, `verdict` (`proceed` with a named
option + build scope, or `documented-silence` with the policy wording
— both valid), `decidedAt`, `baseSha`, `productionFiles` (the future
build's list, or `[]` for (c)), `checks[]`, `measuredResults`,
`missingEvidence`, `nextWork` (the follow-up build plan scope if
(a)/(b) won), `notes`.

**Verify**: JSON parses; every check listed matches a command actually
run; the matrix's nine sites are all dispositioned.

## Test plan

- Characterization suite `plans/research/073/receipts.test.cjs` (Step
  2, ≥ 10 assertions) pinning current silent behavior through the
  committed test hook — modeled on the 063 3-fixture drive (read that
  plan's pattern first).
- Prototype tests if (a) (receipt allowlist, no-receiver fallback,
  sender-guard compliance).
- No production tests change (production untouched — proven by the
  `git diff` scope check in Done criteria).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test plans/research/073/*.test.cjs` → all pass
- [ ] `npm run smoke`, `npm run lint`, `npm run test:unit` → green
- [ ] `plans/research/073/` contains `matrix.md`, tests, `verdict.json`
  (+ prototype only if (a))
- [ ] `matrix.md` dispositions all nine silent sites from "Current state"
- [ ] `git diff --name-only 3aef7b9...HEAD` lists only `plans/` paths
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match live code (drift —
  especially if 072 or a pending build already touched `background.js`
  or added receipt-like messaging).
- The harness cannot drive `handleContextMenuClick` in Node (e.g. the
  hook was removed) — report; do not restructure production to make the
  spike testable.
- Option (a) turns out to need a new permission, a new host pattern, or
  content-script injection on non-LinkedIn tabs — re-score as (b)/(c)
  rather than widening scope; the spike must not propose permission
  changes as a side effect.
- You are tempted to "just implement" the receipt in production while
  here — the spike's product is the verdict; implementation is a
  follow-up build plan.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- If (a) proceeds to build: the build plan must add EN+ES locale keys
  (smoke parity), e2e scenarios in `tests/extension-interactions.js`,
  and must run serially after 072 (shared locale/test files).
- If (c) wins: the policy wording goes wherever menu behavior is
  documented next (code comments + verdict), so the next audit doesn't
  re-report silence as a fresh finding.
- **Deferred:** receipt copy localization review; notification-based
  receipts (revisit only on maintainer demand — permission cost stands).
- Reviewers should scrutinize: the no-receiver fallback story (the
  add-phrase menu fires off-LinkedIn where no content script exists)
  and any prototype message kind that isn't allowlisted or
  sender-guarded.
