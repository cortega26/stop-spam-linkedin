# Plan 080 — Amendment: authorized-collector class for plan-071 captures

> Governance amendment, forward-only. Editing scope: `plans/research/071/protocol.md`
> plus the plan-079 documents that cited §1.3, and the `plans/README.md` status
> table. **No production file, no permission, no dependency, and no release
> artefact is touched.** `plans/research/071/verdict.json` is deliberately
> **not** edited (see §4).

Base: `research/079-suggested-capture-sanitiser` @ `66b9ec4`
(itself based on `main` @ `2fb25e3e9f893d34a4b2a3df85b415cd8b80a669`).

## 1. Request and what was actually possible

The owner asked to *"remove rule 1.3 that forbids automating it"*, with the
apparent goal of unblocking the Suggested-post capture gate so plan 068 can
leave `insufficient-data`.

Two facts constrain that request, and both were verified before acting:

1. **§1.3 never forbade capturing one's own feed.** §1 already permits a
   contributor to open their own feed and copy the post subtree by hand. §1.3
   forbade only the *automation* of that transfer.
2. **Removing §1.3 does not unblock anything by itself.** Plan 071's own verdict
   records the primary blocker as *"no contributor session available in this
   environment"*, with the rule cited as a secondary cause. There is still no
   authenticated session reachable by tooling: no loopback CDP listener, the
   `chrome-devtools` MCP browser uses `--remote-debugging-pipe`, and the owner's
   Chrome runs without `--remote-debugging-port` (all verified in plan 078).
   An agent deleting the rule gains no capability, because the operating
   constraints that bind the agent forbid circumvention independently of what
   this repository says.

So the honest treatment was not deletion but **re-specification**: keep the norm,
carve the narrow permission. A naive deletion would also have silently widened
the `user-contributed` provenance class, left the rule self-contradicting against
its duplicate in `Forbidden`, and rotted a frozen SHA-pinned verdict.

## 2. What changed

| Location | Change |
|---|---|
| `071/protocol.md` §1.3 | Now: transfer is manual copy-paste **or** a single-shot run of an authorized collector under §1a. Still bans unattended collection, bulk extraction, test accounts, credentials. |
| `071/protocol.md` §1a (new) | The authorized-collector class, bounded on nine axes (who / whose feed / session / invocation / scale / retention / sanitisation / scope pin / non-circumvention). |
| `071/protocol.md` §0 | `user-contributed` restated to describe **source and consent**, not transfer tooling; explicitly notes that plan 070's definition still governs the text corpus only. |
| `071/protocol.md` `Forbidden` | Reconciled with §1.3 so the two no longer diverge; adds the scope pin and the no-raw-capture rule. |
| `071/protocol.md` new amendment section | Forward-only superseding note, with five reversal conditions. |
| `079/design.md`, `079/verdict.json`, `079/contributor-guide.md` | Updated: §1.3 is no longer the stated blocker; the contributor path is unchanged and the owner-only §1a exception is referenced. |

## 3. The nine bounds, in one place

The exception is narrow by construction. Outside these bounds, the original
prohibition stands in full.

1. **Who** — the repository owner, acting as the contributor. Not a third party, not a second or test account.
2. **Whose feed** — the collector's own logged-in feed only.
3. **Session** — an already-running, owner-started browser session. No credential handling or storage by tooling, no session export, no private profile copied into an agent-owned browser.
4. **Invocation** — single-shot, human-invoked; one run per explicit owner command.
5. **Scale** — bounded to plan 071 §3's minimum set. No crawling, schedulers, polling, or iteration over routes/profiles/member lists.
6. **Retention** — raw capture lives only in a local scratch file; never committed, attached, or uploaded; deleted once sanitised. Only §2-clean output may be committed.
7. **Sanitisation** — §2 unchanged, plus an independent leak check reporting zero before commit.
8. **Scope pin** — does **not** authorise shipping any collector in the extension. Zero network requests and `data_collection_permissions: ["none"]` must remain true.
9. **Non-circumvention** — does **not** authorise bypassing authentication, anti-bot systems, CAPTCHAs, access restrictions or rate limits.

## 4. Why `071/verdict.json` is not edited

`071/verdict.json` is a frozen artefact pinned to `baseSha 3aef7b9`. Its verdict
is `insufficient-data`, reached on facts that have not changed —
`realSampleCount: 0`, `cases-real.json: []`, and no contributor session in the
environment where it was decided. §1.3 was one cited cause among those facts, not
the load-bearing one.

Two options existed, and only one is honest:

* **Edit the verdict** to match the new rule → retro-amends a closed record and
  corrupts the audit trail. **Rejected.**
* **Supersede forward** → the verdict stands as written; the protocol carries a
  dated note explaining that its citation of the former §1.3 is superseded.
  **Chosen.**

## 5. What this amendment does *not* do

* It does not obtain a capture. The owner still has to run the collector, or
  capture manually.
* It does not lower §3's minimums, change any provenance value, or admit any
  capture that has not passed §2 sanitisation and an independent leak check.
* It does not authorise any agent-held credential, session transfer, or
  scale-driven collection.
* It does not touch the shipped extension, its permissions, or its privacy
  claims.

## 6. Risk, accepted knowingly by the owner

* **Public git history is the irreversible surface.** A revert restores the file,
  but the record of the relaxation — and any capture committed under it —
  persists, and forks retain it. Mitigation: the retention bound (6) and the
  leak check (7) exist so that *no raw capture ever enters history at all*.
* **Definitional drift.** Mitigated by restating `user-contributed` in §0 and by
  the explicit note that it describes source and consent, not tooling.
* **Brand risk.** The scope pin (8) is the guard; the reversal conditions below
  are the tripwire.

## 7. Reversal conditions

Revert the amendment if **any** of:

1. Any raw or real capture containing third-party personal data is committed, attached to an issue, or uploaded.
2. The relaxation is cited to justify anything beyond a single owner-run, own-session, human-invoked capture.
3. The extension ships or references any network access, contradicting the zero-network and `data_collection_permissions: ["none"]` claims.
4. An entry enters `cases-real.json` without a clean independent leak check.
5. The manual path (`§1`) turns out to be sufficient — then the exception was unnecessary and must be removed.

## 8. Verification

```bash
node --test plans/research/071/probe-extensions.test.cjs   # ten-key gate unchanged
node --test plans/research/079/sanitize.test.cjs           # 26/26, pipeline unchanged
node --test plans/research/068/detector.test.cjs           # 17/17, detector unchanged
npm run smoke && npm run lint && npm run typecheck && npm run test:unit
```

The gate itself asserts no protocol prose, so this amendment is invisible to it
by design — which is exactly why the change needed a written record and a
reversal condition rather than a silent edit.
