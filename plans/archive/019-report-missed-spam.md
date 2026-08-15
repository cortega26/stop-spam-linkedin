# Plan 019: Add a "Report missed spam" button to the blocked-post placeholder

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1f7f4e3..HEAD -- content.js _locales/en/messages.json _locales/es/messages.json tests/extension-smoke.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `1f7f4e3`, 2026-08-14

## Why this matters

The extension's core feedback loop is "missed pattern" reports — the README
sends users to the GitHub issue forms (`README.md:145-152`), but
reproducing a report requires selecting and copying post text, opening
GitHub, picking the template, and pasting. On a site where the spam post
may have scrolled away, that's enough friction that reports don't happen.
The placeholder already sits next to the offending post — a "Report" button
that copies the exact matched text (plus trigger word and page URL) to the
clipboard and opens the pre-selected `missed_spam_pattern` issue form turns
a multi-step chore into one click. It stays true to the extension's
privacy positioning: nothing leaves the browser except what the user
deliberately pastes into their own issue report, and the button's label
makes that explicit.

## Current state

`content.js:743-792` — the placeholder buttons built in `blockPost()`
(the "Not spam", "Never block this author", and "Show" buttons; each is a
`createElement("button")` with a click listener and appended before the
placeholder is inserted at line 794). Model the new button on the existing
"Show" button:

```js
    const restoreBtn = document.createElement("button");
    restoreBtn.textContent = t("show");
    restoreBtn.style.cssText = [
      "background:none; border:1px solid #999; border-radius:4px;",
      "padding:4px 12px; cursor:pointer; font-size:13px; color:#555;",
    ].join("");
    restoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      restorePost(post);
    });
    placeholder.appendChild(restoreBtn);
```

`extractTrigger(text)` (`content.js:971-976`) extracts the quoted trigger
word from a matched text — reuse it for the report payload. The issue
template is `missed_spam_pattern.yml` in `.github/ISSUE_TEMPLATE/`, so the
pre-filled form URL is:

```
https://github.com/cortega26/stop-spam-linkedin/issues/new?template=missed_spam_pattern.yml
```

The content script runs on `https://www.linkedin.com/*` — `navigator.clipboard`
is available on secure contexts and clipboard writes with a user gesture
don't need a permission prompt; there's a synchronous fallback pattern
below for environments where it fails.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `npm run smoke` | exit 0 |
| e2e unpacked | `npm run test:extension` | exit 0, "Extension smoke test passed." |
| Locale parity | `node -e "const e=require('./_locales/en/messages.json'), s=require('./_locales/es/messages.json'); for (const k of ['reportMissed','reportCopied','reportFailed']) if (!e[k] || !s[k]) process.exit(1); console.log('ok')"` | `ok` |

## Scope

**In scope**:
- `content.js` (the report button + copy helper in `blockPost()`)
- `_locales/en/messages.json`, `_locales/es/messages.json` (3 keys each)
- `README.md` (one bullet under "Controls", English file only)
- `tests/extension-smoke.js` (one scenario at the end)

**Out of scope**:
- A report button in the popup — the placeholder is the right surface
  (the post text is right there); a popup variant can follow if users ask.
- Sending anything to any server from the extension itself — the flow is
  clipboard + user-initiated navigation only. Do not add fetch/XHR.
- `false_positive.yml` / `bug_report.yml` flows — the "Not spam" button
  already handles the false-positive case locally.
- `CHANGELOG.md` / `RELEASE_NOTES.md` / version bumps (maintainer's
  release-time job, per `RELEASE_CHECKLIST.md`).
- Plan 018's "Show all" button (separate plan; don't implement it here).

## Git workflow

- Branch: `advisor/019-report-missed`
- Commit message style: `feat(blocking): add "Report" to copy missed-spam evidence and open the issue form`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The report button in `blockPost()`

In `content.js`, inside `blockPost()`, after the "Show" button's
`placeholder.appendChild(restoreBtn);` (line 792), add:

```js
    const reportBtn = document.createElement("button");
    reportBtn.textContent = t("reportMissed");
    reportBtn.style.cssText = [
      "background:none; border:1px solid #d0d0d0; border-radius:4px;",
      "padding:4px 12px; cursor:pointer; font-size:12px; color:#767676;",
    ].join("");
    reportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const excerpt = (textNode ? textNode.textContent : "").trim().slice(0, 600);
      const trigger = textNode ? extractTrigger(textNode.textContent) : "";
      const payload = [
        "Trigger: " + trigger,
        "",
        excerpt,
        "",
        "LinkedIn page: " + window.location.href,
      ].join("\n");
      const copy = () => navigator.clipboard.writeText(payload);
      if (navigator.clipboard) {
        copy().then(
          () => showReportToast(t("reportCopied")),
          () => copyFallback(payload)
        );
      } else {
        copyFallback(payload);
      }
      window.open(
        "https://github.com/cortega26/stop-spam-linkedin/issues/new?template=missed_spam_pattern.yml",
        "_blank",
        "noopener"
      );
    });
    placeholder.appendChild(reportBtn);
```

Then add the two helpers at module scope (near `extractTrigger`, ~line 976):

```js
  function copyFallback(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showReportToast(t("reportCopied"));
    } catch (_) {
      showReportToast(t("reportFailed"), true);
    }
    ta.remove();
  }

  function showReportToast(message, warn) {
    const toast = document.createElement("div");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "999999",
      padding: "10px 16px",
      borderRadius: "6px",
      color: "#fff",
      background: warn ? "#a94442" : "#2a6f97",
      fontSize: "13px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
```

(The toast gives users feedback when they can't see the clipboard — e.g.
copy failed; the issue form opening is the fallback path that still helps.)

**Verify**: `npm run smoke` → exit 0; `grep -n "reportMissed\|copyFallback\|showReportToast" content.js` → 3+ matches.

### Step 2: Locale keys

Add to both `_locales/en/messages.json` and `_locales/es/messages.json`
(follow a neighboring key's shape; Spanish translations are your own):

- `reportMissed` — en: "Report missed spam" / es: "Reportar spam no detectado"
- `reportCopied` — en: "Post text copied — paste it into the issue form" /
  es: "Texto de la publicación copiado — pégalo en el formulario de incidencia"
- `reportFailed` — en: "Couldn't copy — please copy the post text manually" /
  es: "No se pudo copiar — copia el texto de la publicación manualmente"

**Verify**: `npm run smoke` → exit 0; the locale-parity command above prints `ok`.

### Step 3: README bullet

In `README.md`'s "Controls" list (lines 52-59), after the "Not spam"
bullet, add:

```markdown
- "Report missed spam" on any placeholder — copies the post text to your
  clipboard and opens a pre-filled GitHub issue (nothing is sent anywhere
  automatically)
```

**Verify**: `grep -n "Report missed spam" README.md` → 1 match.

### Step 4: e2e scenario

Append to `tests/extension-smoke.js`, after the placeholder-text assertion
(~line 103, before the success log):

1. Grant clipboard access on the LinkedIn page context:
   `await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://www.linkedin.com" });`
2. Click the placeholder's "Report missed spam" button:
   `await page.getByRole("button", { name: "Report missed spam" }).click();`
3. Read the clipboard and assert it contains the spam text:
   ```js
   const copied = await page.evaluate(() => navigator.clipboard.readText());
   assert.match(copied, /Comment "CLAUDE"/, "expected the spam excerpt on the clipboard");
   assert.match(copied, /LinkedIn page:/, "expected the page URL in the report payload");
   ```
   (If `clipboard-read` proves flaky in this environment, fall back to
   asserting the button exists and has the right label — but try the
   clipboard assertion first; it's the load-bearing check.)

**Verify**: `npm run test:extension` → exit 0, "Extension smoke test passed."

## Test plan

- One e2e scenario (Step 4) in `tests/extension-smoke.js`: report button
  exists, click copies the excerpt + page URL to the clipboard.
- Existing scenarios must stay green (the new button only adds DOM, and
  the placeholder-text assertion at line ~100 matches a substring, so it
  still passes with the extra button).
- Manual check (document in the commit message): on a real LinkedIn feed,
  confirm the GitHub issue form opens pre-selected with
  `missed_spam_pattern` and the copied payload pastes cleanly.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke` exits 0
- [ ] `npm run test:extension` exits 0, "Extension smoke test passed."
- [ ] `grep -n "reportMissed\|copyFallback\|showReportToast" content.js` ≥ 3 matches
- [ ] Locale-parity check passes for `reportMissed`/`reportCopied`/`reportFailed`
- [ ] `grep -n "Report missed spam" README.md` → 1
- [ ] `grep -rn "fetch(\|XMLHttpRequest\|sendBeacon" content.js` → no matches (no network code added)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `extractTrigger` has drifted from the excerpt such that the payload
  construction in Step 1 wouldn't compile (it's used by the popup too —
  check the popup still renders before proceeding).
- The clipboard assertion in Step 4 fails consistently even after the
  fallback is applied — report; do not weaken the test to a label-only
  check without noting it in `plans/README.md`.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This is the first user-facing link to GitHub from inside the extension.
  Keep the store-listing wording aligned with the README bullet ("nothing
  is sent anywhere automatically") — the privacy reviewer for the Chrome
  and Firefox store submissions will look at this.
- If the repo moves (new owner URL), the hardcoded issue-form URL in
  Step 1 must be updated in the same move.
- Plan 018 also adds a placeholder/popup feature; if both land, their e2e
  scenarios both live in `tests/extension-smoke.js` — keep them ordered
  after the existing assertions and independent of each other.
- A reviewer should scrutinize: the report payload never contains content
  from OTHER posts or account data — only the matched text, trigger, and
  page URL; and that the copy happens only on a user click (no
  background/automatic copying).
