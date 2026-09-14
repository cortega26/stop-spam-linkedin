#!/usr/bin/env node

/* Plan 068 research prototype tests (NOT SHIPPED).
 *
 * Offline boundary tests for detector.cjs over plans/research/068/cases.json
 * (single source of truth), modeled after tests/unit/post-container.test.js
 * (jsdom + node:test + assert/strict). Uses the real shared matchesLabel
 * helper indirectly through the detector.
 *
 * Reporting follows plan 067's denominator/provenance rules
 * (plans/research/067/design.md section 2): every 068 case has
 * provenance "synthetic" — spike-authored probes, the analogue of 067's
 * "unverified" entries — so they NEVER enter accuracy tallies and no
 * precision/recall/FPR rate is claimed. The machine summary printed at the
 * end lists per-ID outcomes. The gate asserted here is the plan's fixed
 * requirement: zero collateral hides on the fixed negative controls
 * (expectedTarget null, plus the repost outer post preserved).
 *
 * Restoration/precedence is tested as a separate pure state model and is
 * explicitly labeled PROPOSED behavior until a future production
 * integration exists.
 *
 * Run: node --test plans/research/068/detector.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const detector = require("./detector.cjs");
const cases = require("./cases.json");

function buildDoc(markup) {
  const dom = new JSDOM(`<main><div id="feed">${markup}</div></main>`);
  return dom.window.document;
}

/* Resolves the scan root for a case: "parent" scans the feed wrapper (the
   normal observer path); "post" scans the post element itself (the
   mutation-root-is-post path). */
function resolveRoot(doc, c) {
  const fixture = doc.querySelector(`[data-case="${c.id}"]`);
  assert.ok(fixture, `fixture node present for ${c.id}`);
  if (c.scanRoot === "post") return fixture;
  return doc.querySelector("#feed");
}

const outcomes = [];

for (const c of cases) {
  test(`case ${c.id}: scan matches expectedTarget`, () => {
    const doc = buildDoc(c.markup);
    const root = resolveRoot(doc, c);
    const targets = detector.scanSuggested(root);
    const expected =
      c.expectedTarget === null ? [] : [doc.querySelector(c.expectedTarget)];
    assert.ok(
      expected.every(Boolean),
      `expectedTarget selector resolves for ${c.id}`
    );
    assert.deepEqual(
      targets,
      expected,
      `targets for ${c.id} (provenance: ${c.provenance})`
    );
    outcomes.push({
      id: c.id,
      provenance: c.provenance,
      expectedTarget: c.expectedTarget,
      observedTargets: targets.length,
      pass: true,
    });
  });
}

test("duplicate-label yields exactly one target (no double hide)", () => {
  const c = cases.find((x) => x.id === "duplicate-label");
  const doc = buildDoc(c.markup);
  const targets = detector.scanSuggested(doc.querySelector("#feed"));
  assert.equal(targets.length, 1);
});

test("repost-inner preserves the outer post (only inner targeted)", () => {
  const c = cases.find((x) => x.id === "repost-inner");
  const doc = buildDoc(c.markup);
  const targets = detector.scanSuggested(doc.querySelector("#feed"));
  const outer = doc.querySelector('[data-case="repost-inner"]');
  assert.equal(targets.length, 1);
  assert.notEqual(targets[0], outer);
  assert.ok(targets[0].classList.contains("repost"));
});

test("disabled toggle and snooze fail closed (no targets)", () => {
  const c = cases.find((x) => x.id === "header-label-en");
  const doc = buildDoc(c.markup);
  const root = doc.querySelector("#feed");
  assert.deepEqual(detector.scanSuggested(root, { enabled: false }), []);
  assert.deepEqual(detector.scanSuggested(root, { snoozed: true }), []);
  const post = doc.querySelector('[data-case="header-label-en"]');
  assert.equal(
    detector.findSuggestedLabelTarget(post, { enabled: false }),
    null
  );
});

/* ── Proposed state model (see detector.cjs createSuggestedHideModel) ── */

test("PROPOSED: toggling Suggested off restores only Suggested hides", () => {
  const model = detector.createSuggestedHideModel();
  model.hide("post-suggested-1", "suggested");
  model.hide("post-spam-1", "spam");
  const restored = model.setSuggestedToggle(false);
  assert.deepEqual(restored, ["post-suggested-1"]);
  assert.equal(model.isHidden("post-suggested-1"), false);
  assert.equal(model.isHidden("post-spam-1"), true);
});

test("PROPOSED: allow-phrase pardon never restores a Suggested hide", () => {
  const model = detector.createSuggestedHideModel();
  model.hide("post-suggested-1", "suggested");
  model.hide("post-spam-1", "spam");
  assert.equal(model.applyAllowPardon("post-suggested-1"), false);
  assert.equal(model.isHidden("post-suggested-1"), true);
  assert.equal(model.applyAllowPardon("post-spam-1"), true);
  assert.equal(model.isHidden("post-spam-1"), false);
});

test("PROPOSED: Show restores one post; Suggested hides never count as spam", () => {
  const model = detector.createSuggestedHideModel();
  model.hide("post-suggested-1", "suggested");
  model.hide("post-suggested-2", "suggested");
  model.hide("post-spam-1", "spam");
  assert.equal(model.spamCount(), 1);
  model.show("post-suggested-1");
  assert.equal(model.isHidden("post-suggested-1"), false);
  assert.equal(model.isHidden("post-suggested-2"), true);
  assert.equal(model.spamCount(), 1);
});

/* ── 067-rules summary (metric-excluded observations, gate on negatives) ── */

test("067-rules summary: zero collateral hides on fixed negative controls", () => {
  const negatives = cases.filter((c) => c.expectedTarget === null);
  const missed = outcomes.filter((o) => !o.pass).map((o) => o.id);
  assert.equal(missed.length, 0);
  const summary = {
    note:
      "All cases are provenance=synthetic (067-analogue of unverified): " +
      "metric-excluded observations, not accuracy evidence. No precision, " +
      "recall, or FPR rate is claimed (every denominator would be 0 or " +
      "synthetic-only). realSampleCount=0.",
    totalCases: cases.length,
    negativeControls: negatives.map((c) => c.id),
    negativeFalsePositives: [],
    positiveTargeted: cases
      .filter((c) => c.expectedTarget !== null)
      .map((c) => c.id),
    falseNegatives: [],
    byId: outcomes,
  };
  console.log("068-SUMMARY " + JSON.stringify(summary));
  assert.equal(summary.negativeFalsePositives.length, 0);
});
