# Plan 073 decision matrix: context-menu silent-failure receipts

Base: `3aef7b9` (reconciled: only delta since is +4 `whatsNew*` lines in
`_locales/en/messages.json` from merged plan 072 — irrelevant to this spike;
`background.js` / `content.js` byte-identical to the plan excerpts).
Caps: `MAX_CUSTOM_PHRASES` 200, `MAX_BLOCKED_AUTHORS` 100,
`MAX_PHRASE_LENGTH` 120 (`shared/constants.js:47-53`).
Permissions: `storage` + `contextMenus` only (`manifest.json:15`).

## 1. Silent-site inventory (the nine in-scope sites — write actions only)

The three report-dispatch sites (`background.js:111` missing tab,
`:112` non-LinkedIn guard, `:119-123` no-receiver swallow) are OUT of
scope: plan 063 settled that flow (failure toast + `{ok:false}`), and the
committed suite already drives them
(`tests/extension-interactions.js:2787-2838`, section J — LinkedIn
dispatch / non-LinkedIn reject / missing-tab-id, plus the sender guard).

| # | Site | Trigger | Who hits it | User perceives today | Candidate receipt |
|---|------|---------|-------------|----------------------|-------------------|
| 1 | `background.js:129` block-author, unparseable author (`!authorId → return`) | Right-click a link whose URL fails `SS_parseAuthorId` | ~Nobody: the menu item only appears on `*://*.linkedin.com/{in,company,school,showcase}/*` links (`background.js:43-48`), so the parse essentially always succeeds | Nothing happens | "Couldn't read that profile link — no change." |
| 2 | `background.js:135` block-author, already blocked (`blocked.includes → return`) | Re-block an author already on the list | Anyone tidying repeatedly; occasional | Nothing happens — but the **goal state already holds** (author IS blocked). Idempotent no-op, not a failure | "Already blocked — no change." (would be noise: confirms a state the user can already see working) |
| 3 | `background.js:136` block-author, cap reached (100) | Block a 101st author | Power users only | Nothing happens; author NOT blocked — genuine failure, no recourse offered | "Author list is full — no change." |
| 4 | `background.js:150` add-phrase, empty text (whitespace-only selection) | Selection-context menu with a blank/whitespace selection | Anyone, rarely (menu needs a selection, but it can be whitespace) | Nothing happens; input was vacuous | None sensible — there was nothing to save. Any receipt here is pure noise |
| 5 | `background.js:151` add-phrase, over length (>120 chars) | Selecting a long passage and adding it as a phrase | Anyone, occasionally | Nothing happens; phrase NOT saved — validation failure, user error is visible (they selected a paragraph) | "Too long to save as a phrase — no change." |
| 6 | `background.js:157` add-phrase, list cap (200) | Add a 201st phrase | Power users only | Nothing happens; phrase NOT saved — genuine failure | "Phrase list is full — no change." |
| 7 | `background.js:163` add-phrase, duplicate (case-insensitive) | Re-add a phrase already on the list | Anyone, occasionally | Nothing happens — but the **goal state already holds** (phrase IS saved and enabled). Idempotent no-op, not a failure | "Already in your phrases — no change." (noise: confirms existing state) |
| 8 | `background.js:174-177` add-phrase, sync-quota overflow (`console.warn` + return) | Candidate list would exceed 95% of `QUOTA_BYTES_PER_ITEM` | Power users with the largest lists — the quota path bites exactly them | Nothing happens; phrase NOT saved — genuine failure, `console.warn` is invisible to users | "Too large to save — no change." |
| 9 | `background.js:180-182` add-phrase, write failure (`console.warn` + return) | `chrome.storage.sync.set` reports `lastError` (transient sync errors) | Anyone, rarely and transiently | Nothing happens; phrase NOT saved — genuine failure | "Couldn't save — try again." (retry may succeed) |

Observed bonus site (same disposition as 9, not in the plan's nine):
`background.js:139-141` block-author write failure (`console.warn` only) —
genuine failure, same rarity/transience as 9.

Two of the nine (2, 7) are **idempotent no-ops**: silence is arguably the
*correct* behavior, not a defect. One (4) is vacuous input. The remaining
six split into user-error validation (1, 5) and genuine failures with no
recourse (3, 6, 8, 9 + bonus). All have the same user-visible shape —
"nothing happened" — and all share one recourse that already exists: the
options page lists show true state (phrase/author present or not).

## 2. Options

### (a) Worker→tab content notice

Design: `chrome.tabs.sendMessage(tab.id, { action: "menuReceipt", kind, key })`
on each failure path (the existing dispatch path used for
`reportMissedSpam`, `background.js:116-124` — clicked tab only, never
re-resolved, lastError-tolerant); content script renders a
`showFirstRunToast`-shaped (`content.js:1260-1291`) self-removing banner
with `textContent` from a fixed allowlist — never echoing raw selection
text into the page. Reuses the `sender.id === chrome.runtime.id` guard
(`background.js:70`). Banner must be visually extension-owned (must not
look like page content — LinkedIn-styled spoofing risk).

Reachability hole (decisive): the add-phrase menu has
`contexts: ["selection"]` with **no** `documentUrlPatterns`
(`background.js:34-38`), so it fires on ANY page; the block-author menu's
`targetUrlPatterns` constrain the *link*, not the *document* — it fires on
any page containing a LinkedIn profile link. But the content script only
runs on LinkedIn hosts (`manifest.json:31-51`). On every off-LinkedIn tab,
`tabs.sendMessage` fails with `lastError` (no receiver) — exactly the
swallow at `background.js:119-123`. So option (a) **degrades to silence in
a large share of its own trigger contexts**, and its no-receiver fallback
story can only be "stay silent off-LinkedIn" — i.e. (a) collapses into (c)
wherever the user isn't on LinkedIn.

Fallback story: lastError-tolerant send (stay silent when no receiver);
banner insert guarded (tab closed / no `<main>` → `document.body.prepend`
fallback, mirroring `showFirstRunToast`). No second channel — a receipt
that can fail gets no further fallback, by explicit policy.

Cost: 1 new message kind (`menuReceipt`), content.js handler + banner CSS,
EN+ES locale keys (smoke parity), e2e scenarios in
`tests/extension-interactions.js`; new failure modes (receipt send fails,
banner insert edge cases). Permissions stay zero. Success path stays
silent (failure-only receipts make silence meaningful: no news = saved).

### (b) `chrome.notifications`

Costed only — no code in this spike. Would need a new `"notifications"`
permission in `manifest.json` (currently `storage` + `contextMenus` only),
which changes the install consent surface, forces `PRIVACY_POLICY.md` +
store-listing-copy updates, and behaves differently in Chrome vs Firefox
(action-center vs system notification persistence, icon requirements).
It is the only option that reaches off-LinkedIn and chrome:// tabs — but
it buys that reach for paths hit rarely-to-never, at the price of the
extension's minimal-permission story (a listed product guarantee:
`README.md` / `PRIVACY_POLICY.md`). Fallback story: none needed for
delivery (system-owned surface), but denied-at-OS-level notifications fail
silently — the regress reappears one layer down. No prototype: the cost
is in manifest/consent/policy, not code.

### (c) Documented silence

Keep behavior; upgrade the six `return`-site comments to a named policy
("receipts intentionally absent: …") in a future build plan. Zero new
permissions, zero new files/message kinds, identical behavior on every
tab kind, zero new failure modes — there is no receipt to fail, so the
infinite regress terminates by construction. The "fallback story" is the
existing recourse: options-page lists show true state. For the two
idempotent no-ops (sites 2, 7) silence is not even a compromise — it is
correct. Recommended policy wording is in `verdict.json`.

## 3. Scoring

| Criterion | (a) worker→tab notice | (b) notifications | (c) documented silence |
|-----------|----------------------|-------------------|------------------------|
| New permissions | 0 (required) | 1 (`notifications`) + consent-surface change — disqualifying weight for rare paths | 0 |
| New files / message kinds | 1 kind (`menuReceipt`) + content handler + EN+ES keys + e2e | 0 code, but policy + store-copy updates in both browsers | 0 (comment-only follow-up) |
| Non-LinkedIn-tab behavior | **Silent anyway** (no content script off-LinkedIn — hole covers both write actions) | Reaches everywhere | Uniformly silent, honestly documented |
| Receipt failure modes | Send-fails (no receiver, closed tab), banner-insert edges — needs its own fallback story (stated above; terminates in silence) | OS-denied notifications fail silently — regress one layer down | None — no receipt to fail |
| Fixes the genuine failures (3, 6, 8, 9)? | Only on LinkedIn tabs | Yes, everywhere | No — but documents recourse (options page) |
| Noise risk on no-ops (2, 7) / vacuous (4) | Must carve out 2/7/4 or spam confirmations | Same carve-out needed | Silent by policy — correct for no-ops |

## 4. Recommendation

**(c) documented-silence.** The evidence: two of nine sites are no-ops
where silence is correct; one is vacuous input; the six genuine
failures/validation paths are rare (generous caps: 200/100/120 chars) and
already have recourse (options-page lists). Against that, (a) cannot reach
the user in a large share of trigger contexts (both write menus fire
off-LinkedIn, where no content script exists) — it is (c) with extra code
wherever it matters least — and (b) trades the minimal-permission install
story for rare-path niceties, with its own silent-failure layer. The cure
costs more than the disease. No prototype per plan Step 3 (only if (a)).
