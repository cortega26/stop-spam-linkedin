#!/usr/bin/env node

/* Plan 071 research browser probe (NOT SHIPPED).
 *
 * Bounded Chromium probe for the RESEARCH-ONLY prototype (068 detector.cjs)
 * over plans/research/071/cases-real.json on an isolated mock page
 * (about:blank) — never the production content script, never a live
 * account, never LinkedIn. Injects the unmodified 068 prototype plus the
 * real shared pattern-data.js helper into the page, inserts each real
 * donated case, and verifies targeted/null outcomes per entry.
 *
 * With zero real entries the per-entry loop asserts nothing and the probe
 * reduces to its structural invariants (detector loads, empty feed scans
 * clean, disabled/snoozed fail closed) — the harness is load-bearing the
 * moment the first donated capture lands, with no probe change needed.
 *
 * Run: xvfb-run -a node plans/research/071/probe-extensions.cjs
 * Writes: plans/research/071/probe-extensions-output.json; exit 0 when the
 * structural invariants and every per-entry outcome pass. Chromium only;
 * Firefox equivalents are pending (see verdict.json missingEvidence).
 */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright");

const OUTPUT_PATH = path.join(__dirname, "probe-extensions-output.json");
const SHARED_PATH = path.join(__dirname, "..", "..", "..", "shared", "pattern-data.js");
const DETECTOR_PATH = path.join(__dirname, "..", "068", "detector.cjs");
const CASES_PATH = path.join(__dirname, "cases-real.json");

async function main() {
  const realCases = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
  assert.ok(Array.isArray(realCases), "cases-real.json is an array");
  const observations = {
    browser: "chromium",
    caseCount: realCases.length,
    structuralInvariants: {},
    cases: {},
  };
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
    });

    /* ── Structural invariants (hold with zero entries too) ── */
    const invariants = await page.evaluate(() => {
      const detector = window.SS_SuggestedDetector;
      if (!detector) return { detectorPresent: false };
      const labels = Array.from(detector.SUGGESTED_LABELS || []);
      const emptyScan = detector.scanSuggested(document.body);
      const disabledScan = detector.scanSuggested(document.body, { enabled: false });
      const snoozedScan = detector.scanSuggested(document.body, { snoozed: true });
      return {
        detectorPresent: true,
        englishOnlyLabels: JSON.stringify(labels) === JSON.stringify(["Suggested"]),
        emptyFeedYieldsNoTargets: emptyScan.length === 0,
        disabledFailsClosed: disabledScan.length === 0,
        snoozedFailsClosed: snoozedScan.length === 0,
      };
    });
    observations.structuralInvariants = invariants;
    assert.equal(invariants.detectorPresent, true, "detector loads in page");
    assert.equal(invariants.englishOnlyLabels, true, "labels stay English-only");
    assert.equal(invariants.emptyFeedYieldsNoTargets, true, "empty feed scans clean");
    assert.equal(invariants.disabledFailsClosed, true, "disabled fails closed");
    assert.equal(invariants.snoozedFailsClosed, true, "snoozed fails closed");

    /* ── Per-entry outcomes over cases-real.json ── */
    for (const c of realCases) {
      const outcome = await page.evaluate((entry) => {
        const feed = document.querySelector("#feed");
        feed.innerHTML = entry.markup;
        const fixture = feed.querySelector(`[data-case="${entry.id}"]`);
        if (!fixture) return { pass: false, error: "fixture missing" };
        const root = entry.scanRoot === "post" ? fixture : feed;
        const targets = window.SS_SuggestedDetector.scanSuggested(root);
        if (entry.expectedTarget === null) {
          return {
            pass: targets.length === 0,
            observedTargets: targets.length,
            expectedTarget: null,
          };
        }
        const expected = document.querySelector(entry.expectedTarget);
        if (!expected) return { pass: false, error: "expectedTarget unresolved" };
        return {
          pass: targets.length === 1 && targets[0] === expected,
          observedTargets: targets.length,
          expectedTarget: entry.expectedTarget,
        };
      }, c);
      observations.cases[c.id] = outcome;
      assert.equal(outcome.pass, true, `real case ${c.id} outcome`);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(observations, null, 2) + "\n");
    console.log(`PROBE OK: ${OUTPUT_PATH}`);
    console.log(JSON.stringify(observations, null, 2));
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error(`PROBE FAIL: ${err && err.message}`);
  process.exit(1);
});
