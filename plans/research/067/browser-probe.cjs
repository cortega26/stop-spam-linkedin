#!/usr/bin/env node

/* Bounded DOM target/recovery probe (plan 067 research prototype).
 *
 * Exercises CURRENT production code (the unpacked extension loaded in
 * Chromium) inside the isolated mock feed from tests/helpers.js — never a
 * replacement detector, never a live account. Covers initial load,
 * dynamically appended posts, nested comments (plan 059 shape), and
 * restore/re-scan; replaced-node and split-text cases are RECORDED, not
 * asserted (a DOM-capability limit must not become a success claim).
 *
 * Latency samples are observed wall time (append call -> placeholder
 * visible, driver IPC included) with configuration and sample count;
 * there is no timing-threshold assertion.
 *
 * Run: xvfb-run -a node plans/research/067/browser-probe.cjs
 * Writes: plans/research/067/browser-probe-output.json; exit 0 when the
 * structural invariants pass. Chromium only — Firefox equivalents are
 * still required before any cross-browser claim (see design.md). */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright");

const {
  mockLinkedInFeed,
  resolveExtensionPath,
  setSyncStorage,
  assertCount,
} = require("../../../tests/helpers");

const OUTPUT_PATH = path.join(__dirname, "browser-probe-output.json");

const BAIT = 'Comment "PROBE" and I\'ll send you the complete guide for free today.';

async function displayOf(page, selector) {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).display);
}

function summarizeSamples(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    n: samples.length,
    minMs: sorted[0],
    medianMs: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    maxMs: sorted[sorted.length - 1],
    samplesMs: samples,
  };
}

async function main() {
  const extensionPath = resolveExtensionPath();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsb-067-probe-"));
  const observations = {
    browser: "chromium",
    note: "append-to-placeholder wall time includes Playwright IPC; it is not a content-script-only cost",
    cases: {},
    latency: null,
  };
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--disable-gpu",
        "--no-sandbox",
      ],
    });
    observations.browserVersion = chromium.version || "unknown";
    try {
      observations.playwrightVersion = require("playwright/package.json").version;
    } catch (_) {
      observations.playwrightVersion = "unknown";
    }

    await setSyncStorage(context, {
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
      ss_phrases: [],
      ss_allow_phrases: [],
      ss_excluded: [],
      ss_disabled_patterns: [],
      ss_hide_promoted: false,
      ss_hide_featured: false,
    });

    await context.route("https://www.linkedin.com/feed/**", (route) => {
      route.fulfill({ status: 200, contentType: "text/html", body: mockLinkedInFeed });
    });

    const page = await context.newPage();
    observations.userAgent = await page.evaluate(() => navigator.userAgent);
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });

    /* ── Case 1: initial load ── */
    const placeholder = page.locator("[data-ss-ph]");
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    const spamDisplay = await displayOf(page, '[data-id="urn:li:activity:spam-1"]');
    const whiteDisplay = await displayOf(page, '[data-id="urn:li:activity:whitelisted-1"]');
    const cleanDisplay = await displayOf(page, '[data-id="urn:li:activity:clean-1"]');
    assert.equal(spamDisplay, "none", "initial: spam-1 hidden");
    assert.notEqual(whiteDisplay, "none", "initial: whitelisted-1 visible");
    assert.notEqual(cleanDisplay, "none", "initial: clean-1 visible");
    await assertCount(placeholder, 1);
    observations.cases.initial = {
      pass: true,
      hiddenTargets: ["urn:li:activity:spam-1"],
      visibleControls: ["urn:li:activity:whitelisted-1", "urn:li:activity:clean-1"],
      placeholderCount: 1,
      collateralHides: [],
    };

    /* ── Case 2: dynamically appended posts (+ latency samples) ── */
    const latencies = [];
    for (let i = 1; i <= 5; i++) {
      const id = `urn:li:activity:probe-dyn-${i}`;
      const before = await page.locator("[data-ss-ph]").count();
      const t0 = Date.now();
      await page.evaluate(({ postId, bait }) => {
        const section = document.createElement("section");
        section.dataset.id = postId;
        const actor = document.createElement("div");
        actor.innerHTML = '<a href="/in/someone"><span>Someone</span></a>';
        const p = document.createElement("p");
        p.textContent = bait;
        section.appendChild(actor);
        section.appendChild(p);
        document.querySelector("main").appendChild(section);
      }, { postId: id, bait: `${BAIT} (#${i})` });
      await page.waitForFunction(
        (count) => document.querySelectorAll("[data-ss-ph]").length === count,
        before + 1,
        { timeout: 10000 }
      );
      latencies.push(Date.now() - t0);
      assert.equal(await displayOf(page, `[data-id="${id}"]`), "none", `dynamic: ${id} hidden`);
    }
    await assertCount(page.locator("[data-ss-ph]"), 6);
    observations.cases.dynamicAppend = { pass: true, hiddenTargets: [1, 2, 3, 4, 5].map((i) => `urn:li:activity:probe-dyn-${i}`), placeholderCount: 6 };
    observations.latency = {
      ...summarizeSamples(latencies),
      what: "append-evaluate-call to placeholder-visible (ms), Playwright IPC included",
      config: "chromium persistent context, headless=false under xvfb-run, --no-sandbox --disable-gpu",
    };

    /* ── Case 3: bait in a nested comment hides the comment, not the post ── */
    const commentPostId = "urn:li:activity:probe-comment-1";
    await page.evaluate(({ postId }) => {
      const section = document.createElement("section");
      section.dataset.id = postId;
      section.innerHTML =
        '<div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>' +
        '<p class="post-body">' + "y".repeat(320) + "</p>" +
        '<div class="comments"><div class="comments-list">' +
        '<div class="comment"><p class="comment-body">comment PROBE and I\'ll send you the framework</p></div>' +
        "</div></div>";
      document.querySelector("main").appendChild(section);
    }, { postId: commentPostId });
    await page.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 7,
      null,
      { timeout: 10000 }
    );
    assert.notEqual(await displayOf(page, `[data-id="${commentPostId}"]`), "none", "comment case: post stays visible");
    const commentHidden = await page.waitForFunction(
      (postId) => {
        const section = document.querySelector(`[data-id="${postId}"]`);
        const comment = section && section.querySelector(".comment");
        const ph = comment && comment.nextElementSibling;
        return !!comment
          && getComputedStyle(comment).display === "none"
          && !!ph && !!ph.dataset && ph.dataset.ssPh === "1";
      },
      commentPostId,
      { timeout: 10000 }
    );
    assert.ok(commentHidden, "comment case: comment hidden with inline placeholder sibling");
    observations.cases.nestedComment = {
      pass: true,
      selectedTarget: `${commentPostId} .comment (not the post)`,
      postVisible: true,
      placeholderCount: 7,
    };

    /* ── Case 4: restore via Show, then re-scan must not re-hide ── */
    await page.locator(`[data-id="${commentPostId}"] .comment + [data-ss-ph] button`, { hasText: /Show|Mostrar/ }).click();
    await page.waitForFunction(
      (postId) => {
        const comment = document.querySelector(`[data-id="${postId}"] .comment`);
        return comment && getComputedStyle(comment).display !== "none";
      },
      commentPostId,
      { timeout: 4000 }
    );
    await assertCount(page.locator("[data-ss-ph]"), 6);
    /* Wait past the observer debounce: the exclusion must keep it visible. */
    await page.waitForTimeout(1500);
    const restoredDisplay = await displayOf(page, `[data-id="${commentPostId}"] .comment`);
    assert.notEqual(restoredDisplay, "none", "restore: comment stays visible after re-scan");
    await assertCount(page.locator("[data-ss-ph]"), 6);
    observations.cases.restoreRescan = { pass: true, placeholderCount: 6, rescanStable: true };

    /* ── Case 5 (record-only): replaced node text ── */
    const replaceId = "urn:li:activity:probe-replace-1";
    await page.evaluate(({ postId }) => {
      const section = document.createElement("section");
      section.dataset.id = postId;
      section.innerHTML = '<div class="actor"><a href="/in/someone"><span>Someone</span></a></div><p class="post-body">A calm professional note about quarterly planning.</p>';
      document.querySelector("main").appendChild(section);
    }, { postId: replaceId });
    await page.waitForTimeout(1200);
    await page.evaluate(({ postId, bait }) => {
      document.querySelector(`[data-id="${postId}"] .post-body`).textContent = bait;
    }, { postId: replaceId, bait: BAIT });
    let replaceHidden = false;
    try {
      await page.waitForFunction(
        (postId) => {
          const el = document.querySelector(`[data-id="${postId}"]`);
          return el && getComputedStyle(el).display === "none";
        },
        replaceId,
        { timeout: 6000 }
      );
      replaceHidden = true;
    } catch (_) {
      replaceHidden = false;
    }
    observations.cases.replacedNode = {
      pass: null,
      observed: replaceHidden ? "hidden-after-replace" : "still-visible-after-replace",
      note: "recorded only; not a structural invariant",
    };

    /* ── Case 6 (record-only): bait split across text nodes ── */
    const splitId = "urn:li:activity:probe-split-1";
    await page.evaluate(({ postId }) => {
      const section = document.createElement("section");
      section.dataset.id = postId;
      const actor = document.createElement("div");
      actor.innerHTML = '<a href="/in/someone"><span>Someone</span></a>';
      const p = document.createElement("p");
      for (const chunk of ['Comment "PROBE"', " and I'll ", "send you the complete guide"]) {
        const span = document.createElement("span");
        span.textContent = chunk;
        p.appendChild(span);
      }
      section.appendChild(actor);
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    }, { postId: splitId });
    let splitHidden = false;
    try {
      await page.waitForFunction(
        (postId) => {
          const el = document.querySelector(`[data-id="${postId}"]`);
          return el && getComputedStyle(el).display === "none";
        },
        splitId,
        { timeout: 6000 }
      );
      splitHidden = true;
    } catch (_) {
      splitHidden = false;
    }
    observations.cases.splitText = {
      pass: null,
      observed: splitHidden ? "hidden-despite-split" : "still-visible-when-split",
      note: "matcher runs per text node; a split bait phrase is a known DOM-capability limit, recorded not asserted",
    };

    observations.placeholderFinal = await page.locator("[data-ss-ph]").count();
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(observations, null, 2) + "\n");
    console.log(`PROBE OK: ${OUTPUT_PATH}`);
    console.log(JSON.stringify({ cases: observations.cases, latency: observations.latency }, null, 2));
  } finally {
    if (context) await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`PROBE FAIL: ${err && err.message}`);
  process.exit(1);
});
