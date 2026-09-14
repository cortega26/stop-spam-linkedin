#!/usr/bin/env node

/* Plan 069 research browser probe (NOT SHIPPED).
 *
 * Bounded Chromium probe for the RESEARCH-ONLY prototype (prototype.cjs)
 * on an isolated mock page (about:blank) — never the production content
 * script, never a live account, never LinkedIn. Injects the prototype plus
 * the real shared/post-container.js helper into the page, inserts mock
 * posts (one with a LinkedIn-class comment), and verifies
 * selection-anchored hide, the comment boundary, keyboard activation of
 * Show, and Show-all/snooze reveal. The in-page hide harness mirrors the
 * production placeholder pattern (content.js:1033-1043 at a7f852a:
 * button.textContent, listener, then appendChild) and is labeled as an
 * experiment; production integration does not exist yet.
 *
 * Run: xvfb-run -a node plans/research/069/browser-probe.cjs
 * Writes: plans/research/069/browser-probe-output.json; exit 0 when the
 * structural invariants pass. Chromium only — not proof of Firefox.
 */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright");

const OUTPUT_PATH = path.join(__dirname, "browser-probe-output.json");
const SHARED_PATH = path.join(__dirname, "..", "..", "..", "shared", "post-container.js");
const PROTOTYPE_PATH = path.join(__dirname, "prototype.cjs");

const LONG_BODY = "y".repeat(320);

function postHtml(id, body) {
  return (
    `<section data-id="${id}" class="feed-shared-update-v2">` +
    '<div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>' +
    `<p class="post-body">${body}</p>` +
    "<span>Promoted</span>" +
    "</section>"
  );
}

function postWithCommentHtml(id, body, comment) {
  return (
    `<section data-id="${id}" class="feed-shared-update-v2">` +
    '<div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>' +
    `<p class="post-body">${body}</p>` +
    '<div class="comments"><div class="comments-list">' +
    `<div class="comments-comment-item"><p class="comment-body">${comment}</p></div>` +
    "</div></div>" +
    "</section>"
  );
}

async function main() {
  const observations = { browser: "chromium", cases: {} };
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-gpu"],
    });
    try {
      observations.playwrightVersion = require("playwright/package.json").version;
    } catch (_) {
      observations.playwrightVersion = "unknown";
    }
    const page = await browser.newPage();
    await page.goto("about:blank");
    await page.addScriptTag({ path: SHARED_PATH });
    await page.addScriptTag({ path: PROTOTYPE_PATH });
    await page.evaluate(
      ({ html1, html2 }) => {
        document.body.innerHTML =
          `<main><div id="feed">${html1}${html2}</div>` +
          "<footer><p>About this extension</p></footer></main>";
        /* Research-only experiment harness (NOT production): explicit
           manual-hide actions over a session-ephemeral state object. */
        window.SS69_state = window.SS_ManualHide.createResearchState();
        window.SS69_selectText = (selector, from, to) => {
          const textNode = document.querySelector(selector).firstChild;
          const range = document.createRange();
          range.setStart(textNode, from);
          range.setEnd(textNode, to);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          return sel.anchorNode !== null;
        };
        window.SS69_hideSelection = () => {
          const sel = window.getSelection();
          const anchor = sel ? sel.anchorNode : null;
          const target = window.SS_ManualHide.resolveManualTarget(document, anchor);
          if (!target) return { ok: false, reason: "no-target" };
          return window.SS_ManualHide.manualHide(document, target, window.SS69_state);
        };
      },
      {
        html1: postHtml("urn:li:activity:ss69-1", LONG_BODY),
        html2: postWithCommentHtml(
          "urn:li:activity:ss69-2",
          LONG_BODY,
          "comment CLAUDE and I'll send you the framework"
        ),
      }
    );

    const display = async (id) =>
      page.locator(`[data-id="${id}"]`).evaluate((el) => getComputedStyle(el).display);
    const placeholderCount = async () => page.locator("[data-ss-ph]").count();

    /* ── Case 1: selection-anchored hide of a visible post ── */
    await page.evaluate(() =>
      window.SS69_selectText('[data-id="urn:li:activity:ss69-1"] .post-body', 0, 10)
    );
    const hide1 = await page.evaluate(() => window.SS69_hideSelection());
    assert.equal(hide1.ok, true, "post selection hides");
    assert.equal(hide1.comment, false, "resolved as a post, not a comment");
    assert.equal(await display("urn:li:activity:ss69-1"), "none", "target post hidden");
    assert.notEqual(await display("urn:li:activity:ss69-2"), "none", "sibling post visible");
    assert.equal(await placeholderCount(), 1, "one placeholder");
    observations.cases.selectionHidePost = { pass: true, placeholderCount: 1 };

    /* ── Case 2: comment boundary — bait comment hides the comment only ── */
    await page.evaluate(() =>
      window.SS69_selectText(
        '[data-id="urn:li:activity:ss69-2"] .comment-body',
        0,
        7
      )
    );
    const hide2 = await page.evaluate(() => window.SS69_hideSelection());
    assert.equal(hide2.ok, true, "comment selection hides");
    assert.equal(hide2.comment, true, "resolved as a comment");
    assert.equal(
      await page
        .locator('[data-id="urn:li:activity:ss69-2"] .comments-comment-item')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "comment hidden"
    );
    assert.notEqual(await display("urn:li:activity:ss69-2"), "none", "parent post stays visible");
    assert.equal(await placeholderCount(), 2, "two placeholders");
    observations.cases.commentBoundary = { pass: true, placeholderCount: 2 };

    /* ── Case 3: keyboard activation of Show restores the post ── */
    await page
      .locator('[data-id="urn:li:activity:ss69-1"] + [data-ss-ph] button')
      .focus();
    await page.keyboard.press("Enter");
    assert.notEqual(await display("urn:li:activity:ss69-1"), "none", "keyboard Show restores");
    assert.equal(await placeholderCount(), 1, "one placeholder remains");
    const forceShow = await page.evaluate(() =>
      window.SS69_state.forceShow.has(
        document.querySelector('[data-id="urn:li:activity:ss69-1"]')
      )
    );
    assert.equal(forceShow, true, "restored target carries Show protection");
    observations.cases.keyboardShow = { pass: true, placeholderCount: 1 };

    /* ── Case 4: Show-all reveal restores the remaining manual hide ── */
    await page.evaluate(() =>
      window.SS_ManualHide.manualShowAll(document, window.SS69_state)
    );
    assert.notEqual(await display("urn:li:activity:ss69-2"), "none", "post visible");
    assert.notEqual(
      await page
        .locator('[data-id="urn:li:activity:ss69-2"] .comments-comment-item')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "tracked comment target restored by show-all"
    );
    assert.equal(await placeholderCount(), 0, "no placeholders after show-all");
    observations.cases.showAll = { pass: true, placeholderCount: 0 };

    /* ── Case 5: snooze/disable reveal + no-persistence spot check ── */
    await page.evaluate(() =>
      window.SS69_selectText('[data-id="urn:li:activity:ss69-2"] .post-body', 0, 10)
    );
    const hide3 = await page.evaluate(() => window.SS69_hideSelection());
    assert.equal(hide3.ok, true, "re-hide before snooze");
    const final = await page.evaluate(() => {
      window.SS_ManualHide.snoozeOrDisable(document, window.SS69_state);
      const s = window.SS69_state;
      return {
        placeholders: document.querySelectorAll("[data-ss-ph]").length,
        tracked: s.manuallyHidden.size,
        blockedCount: s.counters.blockedCount,
        undo: s.counters.undo.length,
        storageWrites: s.storageWrites.length,
      };
    });
    assert.equal(final.placeholders, 0, "no placeholders after snooze");
    assert.equal(final.tracked, 0, "manual set empty after snooze");
    assert.equal(final.blockedCount, 0, "no spam counts from manual hides");
    assert.equal(final.undo, 0, "manual hides never entered the undo list");
    assert.equal(final.storageWrites, 0, "no storage writes from manual hides");
    assert.notEqual(await display("urn:li:activity:ss69-1"), "none", "post visible");
    assert.notEqual(await display("urn:li:activity:ss69-2"), "none", "post visible");
    observations.cases.snoozeReveal = { pass: true, ...final };

    observations.placeholderFinal = await placeholderCount();
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(observations, null, 2) + "\n");
    console.log(`PROBE OK: ${OUTPUT_PATH}`);
    console.log(JSON.stringify(observations.cases, null, 2));
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error(`PROBE FAIL: ${err && err.message}`);
  process.exit(1);
});
