/* Plan 079 capture helper — DEV-TIME CONSOLE SNIPPET, NOT SHIPPED, NOT REQUIRED.
 *
 * This file is meant to be PASTED INTO A BROWSER CONSOLE, not run by Node.
 * It has no shebang on purpose: a `#!` line is not valid in a console paste.
 *
 * You do NOT need this file. Protocol §1 (manual copy-paste) is the default and
 * is enough: open DevTools → Elements → select the post container → Copy →
 * Copy outerHTML → paste into a file. This snippet exists only to remove the two
 * fiddly parts of that: finding the right container in a deep DOM, and getting
 * thousands of characters out of the browser and onto disk on a machine with no
 * clipboard bridge installed.
 *
 * What it does: reads the already-rendered DOM in your own browser, clones one
 * post container, tags it with the research `data-case` marker, and saves it to
 * ~/Downloads. It makes no network request, sends nothing anywhere, does not
 * navigate, does not click, and does not touch LinkedIn's servers beyond the
 * page you already loaded.
 *
 * Protocol position: this is the single-shot, human-invoked, own-session,
 * bounded form permitted by `plans/research/071/protocol.md` §1a. It is bounded
 * to one post per invocation on purpose — do not wrap it in a loop.
 *
 * ── How to use ────────────────────────────────────────────────────────────
 * 1. Open your LinkedIn feed in Chrome, logged in as yourself.
 * 2. Open DevTools (F12) → Console tab.
 * 3. Paste this whole file and press Enter. It prints a table of candidate
 *    posts, marking which ones carry a "Suggested" label.
 * 4. Pick an index from the table and run:
 *
 *      SS_capture.download(<index>, "suggested-01")
 *
 *    That writes ~/Downloads/capture-suggested-01.html. Delete the raw file
 *    once you have sanitised it (§2 / sanitize.cjs).
 * 5. Sanitise it in your terminal (see plans/research/079/contributor-guide.md):
 *
 *      node plans/research/079/sanitize.cjs \
 *        --sanitize ~/Downloads/capture-suggested-01.html \
 *        --id suggested-01 --label Suggested --out /tmp/suggested-01.html
 */

(() => {
  "use strict";

  /* Same selector families the shipped extension and the 068 prototype key on. */
  const POST_SELECTOR = [
    '[data-id*="urn:li:activity:"]',
    ".feed-shared-update-v2",
    '[data-testid="mainFeed"] [role="listitem"]',
  ].join(", ");

  /* The recognized header-metadata elements (plan 068 HEADER_META_SELECTORS). */
  const META_SELECTOR = [
    ".feed-shared-actor__sub-description",
    ".update-components-actor__sub-description",
  ].join(", ");

  /** Outermost matches only, so a nested comment never shadows its post. */
  function findCandidates() {
    const all = Array.from(document.querySelectorAll(POST_SELECTOR));
    const outermost = all.filter((el) => {
      const container = el.parentElement && el.parentElement.closest(POST_SELECTOR);
      return !container;
    });
    return outermost.map((el, index) => {
      const meta = Array.from(el.querySelectorAll(META_SELECTOR))
        .map((n) => (n.textContent || "").trim())
        .filter(Boolean);
      return {
        index,
        suggested: meta.some((t) => /^Suggested\b/i.test(t)),
        meta,
        chars: el.outerHTML.length,
        el,
      };
    });
  }

  /**
   * Builds the capture string for one candidate: a deep clone of the post
   * container with the commit-time `data-case` marker set on the root only.
   * The clone means your live page is never mutated.
   */
  function buildCapture(index, caseId) {
    if (typeof caseId !== "string" || caseId.trim() === "") {
      throw new Error("buildCapture(index, caseId): caseId is required (it becomes data-case)");
    }
    const rows = findCandidates();
    const row = rows[index];
    if (!row) throw new Error(`no candidate at index ${index} (0..${rows.length - 1})`);
    const clone = row.el.cloneNode(true);
    clone.setAttribute("data-case", caseId.trim());
    return { html: clone.outerHTML, suggested: row.suggested, meta: row.meta, chars: clone.outerHTML.length };
  }

  /** Saves the capture to the browser's download folder. One post per call. */
  function download(index, caseId) {
    const { html, suggested } = buildCapture(index, caseId);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capture-${caseId.trim()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    console.log(
      `Saved ${a.download} (${html.length} chars, suggested label: ${suggested ? "yes" : "no"}).\n` +
        `Next: node plans/research/079/sanitize.cjs --sanitize ~/Downloads/${a.download} ` +
        `--id ${caseId.trim()} --label Suggested\n` +
        `Then DELETE the raw file: rm ~/Downloads/${a.download}`
    );
    return a.download;
  }

  const rows = findCandidates();
  if (rows.length === 0) {
    console.warn(
      "No post containers found. Scroll the feed so posts are rendered, then paste this again.\n" +
        "(If the feed renders a shape these selectors do not know, that itself is a finding worth reporting.)"
    );
  } else {
    console.table(
      rows.map((r) => ({
        index: r.index,
        suggested: r.suggested ? "YES" : "",
        meta: r.meta.join(" | ").slice(0, 70),
        chars: r.chars,
      }))
    );
    console.log("Run SS_capture.download(<index>, \"<case-id>\") to save one post.");
  }

  window.SS_capture = { find: findCandidates, build: buildCapture, download };
  return "SS_capture installed. Use SS_capture.download(<index>, \"<case-id>\").";
})();
