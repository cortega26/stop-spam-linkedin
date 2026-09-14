#!/usr/bin/env node

/* Plan 068 research browser probe (NOT SHIPPED).
 *
 * Bounded Chromium probe for the RESEARCH-ONLY prototype (detector.cjs) on
 * an isolated mock page (about:blank) — never the production content
 * script, never a live account, never LinkedIn. Injects the prototype plus
 * the real shared pattern-data.js helper into the page, inserts mock posts,
 * and verifies inserted-post and replaced-post behavior plus Show restore.
 * The in-page hide harness mirrors the production placeholder pattern
 * (content.js:1016: button.textContent, listener, then appendChild) and is
 * labeled as an experiment; production integration does not exist yet.
 *
 * Run: xvfb-run -a node plans/research/068/browser-probe.cjs
 * Writes: plans/research/068/browser-probe-output.json; exit 0 when the
 * structural invariants pass. Chromium only.
 */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright");

const OUTPUT_PATH = path.join(__dirname, "browser-probe-output.json");
const SHARED_PATH = path.join(__dirname, "..", "..", "..", "shared", "pattern-data.js");
const DETECTOR_PATH = path.join(__dirname, "detector.cjs");

function postHtml(id, headerMeta, body, extra) {
  return (
    `<section data-id="${id}" class="feed-shared-update-v2">` +
    '<div class="feed-shared-actor"><div class="feed-shared-actor__meta">' +
    "<span class=\"feed-shared-actor__title\">Someone</span>" +
    (headerMeta === null
      ? ""
      : `<span class="feed-shared-actor__sub-description">${headerMeta}</span>`) +
    "</div></div>" +
    `<p class="post-body">${body}</p>` +
    (extra || "") +
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
    await page.addScriptTag({ path: DETECTOR_PATH });
    await page.evaluate(() => {
      document.body.innerHTML = '<main id="feed"></main>';
      /* Research-only experiment harness (NOT production): hide helper
         mirroring the production placeholder shape. */
      window.SS68_forceShow = new Set();
      window.SS68_scan = () => {
        const targets = window.SS_SuggestedDetector.scanSuggested(document.body);
        for (const post of targets) {
          if (window.SS68_forceShow.has(post)) continue;
          if (post.nextElementSibling && post.nextElementSibling.dataset.ss68Ph) continue;
          post.style.display = "none";
          const ph = document.createElement("div");
          ph.dataset.ss68Ph = "1";
          const button = document.createElement("button");
          button.textContent = "Show";
          button.addEventListener("click", () => {
            window.SS68_forceShow.add(post);
            post.style.display = "";
            ph.remove();
          });
          ph.appendChild(button);
          post.after(ph);
        }
        return targets.length;
      };
    });

    const CALM = "A calm professional note about quarterly planning.";

    /* ── Case 1: inserted posts — Suggested hidden, body-word + clean visible ── */
    await page.evaluate(
      ({ htmlSuggested, htmlBodyWord, htmlClean }) => {
        const feed = document.querySelector("#feed");
        feed.insertAdjacentHTML("beforeend", htmlSuggested);
        feed.insertAdjacentHTML("beforeend", htmlBodyWord);
        feed.insertAdjacentHTML("beforeend", htmlClean);
        window.SS68_scan();
      },
      {
        htmlSuggested: postHtml("urn:li:activity:ss68-1", "Suggested", CALM),
        htmlBodyWord: postHtml(
          "urn:li:activity:ss68-2",
          "3rd+ · 2d",
          "I suggested we reschedule the workshop to Thursday morning."
        ),
        htmlClean: postHtml("urn:li:activity:ss68-3", "1st · 1w", CALM),
      }
    );
    const display = async (id) =>
      page.locator(`[data-id="${id}"]`).evaluate((el) => getComputedStyle(el).display);
    assert.equal(await display("urn:li:activity:ss68-1"), "none", "inserted: suggested hidden");
    assert.notEqual(await display("urn:li:activity:ss68-2"), "none", "inserted: body-word visible");
    assert.notEqual(await display("urn:li:activity:ss68-3"), "none", "inserted: clean visible");
    assert.equal(await page.locator("[data-ss68-ph]").count(), 1, "inserted: one placeholder");
    observations.cases.inserted = {
      pass: true,
      hiddenTargets: ["urn:li:activity:ss68-1"],
      visibleControls: ["urn:li:activity:ss68-2", "urn:li:activity:ss68-3"],
      placeholderCount: 1,
      collateralHides: [],
    };

    /* ── Case 2: dynamically appended Suggested post ── */
    await page.evaluate(({ html }) => {
      document.querySelector("#feed").insertAdjacentHTML("beforeend", html);
      window.SS68_scan();
    }, { html: postHtml("urn:li:activity:ss68-4", "Suggested", CALM) });
    await page.waitForFunction(
      () => document.querySelectorAll("[data-ss68-ph]").length === 2,
      null,
      { timeout: 5000 }
    );
    assert.equal(await display("urn:li:activity:ss68-4"), "none", "dynamic: appended suggested hidden");
    observations.cases.dynamicAppend = {
      pass: true,
      hiddenTargets: ["urn:li:activity:ss68-4"],
      placeholderCount: 2,
    };

    /* ── Case 3: replaced header node (clean post becomes Suggested) ── */
    await page.evaluate(
      ({ html }) => {
        document.querySelector("#feed").insertAdjacentHTML("beforeend", html);
        window.SS68_scan();
      },
      { html: postHtml("urn:li:activity:ss68-5", "2nd · 5d", CALM) }
    );
    assert.notEqual(await display("urn:li:activity:ss68-5"), "none", "replaced: clean before replace");
    await page.evaluate(() => {
      const meta = document.querySelector('[data-id="urn:li:activity:ss68-5"] .feed-shared-actor__sub-description');
      const replacement = document.createElement("span");
      replacement.className = "feed-shared-actor__sub-description";
      replacement.textContent = "Suggested";
      meta.replaceWith(replacement);
      window.SS68_scan();
    });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-id="urn:li:activity:ss68-5"]');
        return el && getComputedStyle(el).display === "none";
      },
      null,
      { timeout: 5000 }
    );
    assert.equal(await page.locator("[data-ss68-ph]").count(), 3, "replaced: three placeholders");
    observations.cases.replacedHeader = {
      pass: true,
      hiddenTargets: ["urn:li:activity:ss68-5"],
      placeholderCount: 3,
    };

    /* ── Case 4: Show restores; re-scan keeps it visible ── */
    await page.locator('[data-id="urn:li:activity:ss68-1"] + [data-ss68-ph] button').click();
    assert.notEqual(await display("urn:li:activity:ss68-1"), "none", "restore: shown post visible");
    await page.evaluate(() => window.SS68_scan());
    await page.waitForTimeout(500);
    assert.notEqual(await display("urn:li:activity:ss68-1"), "none", "restore: stays visible after re-scan");
    assert.equal(await page.locator("[data-ss68-ph]").count(), 2, "restore: two placeholders remain");
    observations.cases.restoreRescan = { pass: true, placeholderCount: 2, rescanStable: true };

    observations.placeholderFinal = await page.locator("[data-ss68-ph]").count();
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
