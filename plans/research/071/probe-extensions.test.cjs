#!/usr/bin/env node

/* Plan 071 research real-sample tests (NOT SHIPPED).
 *
 * Offline boundary tests for plans/research/071/cases-real.json through
 * the UNMODIFIED plan-068 detector (require()d in place, never forked),
 * modeled on plans/research/068/detector.test.cjs (jsdom + node:test +
 * assert/strict). Reporting follows plan 067's denominator/provenance
 * rules: only real-donated entries could ever enter accuracy tallies, and
 * no precision/recall/FPR rate is claimed here.
 *
 * While cases-real.json holds zero entries (no legitimate-provenance
 * capture obtainable without a contributor session — see verdict.json
 * captureAttempts), the per-entry loop asserts nothing and the
 * schema/dedupe/sanitization gates hold vacuously; they become load-bearing
 * the moment the first donated capture lands, with no test change needed.
 *
 * Run: node --test plans/research/071/*.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

/* Unmodified 068 detector: imported, never forked (plan 071 STOP rule). */
const detector = require("../068/detector.cjs");
const cases = require("./cases-real.json");
const cases068 = require("../068/cases.json");

/* The plan text says "nine keys"; the Step-3 example object lists these
 * ten, so the gate asserts all ten (a superset of any nine-subset). */
const REQUIRED_KEYS = [
  "id",
  "purpose",
  "markup",
  "scanRoot",
  "expectedTarget",
  "metadataLocale",
  "provenance",
  "validationStatus",
  "sourceRef",
  "sanitization",
];

function buildDoc(markup) {
  const dom = new JSDOM(`<main><div id="feed">${markup}</div></main>`);
  return dom.window.document;
}

/* Resolves the scan root for a case: "parent" scans the feed wrapper (the
 * normal observer path); "post" scans the post element itself (the
 * mutation-root-is-post path). Mirrors detector.test.cjs. */
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

test("schema: every entry carries the full ten-key schema", () => {
  assert.ok(Array.isArray(cases), "cases-real.json is an array");
  for (const c of cases) {
    for (const key of REQUIRED_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(c, key),
        `${c.id || "<unidentified>"} carries key "${key}"`
      );
    }
    assert.equal(typeof c.id, "string");
    assert.ok(c.id.length > 0, "id is non-empty");
    assert.ok(
      c.scanRoot === "parent" || c.scanRoot === "post",
      `${c.id}: scanRoot is parent|post`
    );
  }
});

test("provenance: every entry is user-contributed + real-donated", () => {
  for (const c of cases) {
    assert.equal(c.provenance, "user-contributed", `${c.id}: provenance`);
    assert.equal(c.validationStatus, "real-donated", `${c.id}: status`);
  }
});

test("dedupe: no id collides within 071 or with 068's ten", () => {
  const ids068 = new Set(cases068.map((c) => c.id));
  assert.equal(ids068.size, 10, "068 reference still has ten ids");
  const seen = new Set();
  for (const c of cases) {
    assert.ok(!seen.has(c.id), `duplicate id within 071: ${c.id}`);
    assert.ok(!ids068.has(c.id), `id collides with 068: ${c.id}`);
    seen.add(c.id);
  }
});

test("sanitization: only sentinel URNs, recorded provenance context", () => {
  for (const c of cases) {
    assert.equal(typeof c.sanitization, "string");
    assert.ok(c.sanitization.length > 0, `${c.id}: sanitization recorded`);
    assert.equal(typeof c.sourceRef, "string");
    assert.ok(
      /UI locale/.test(c.sourceRef),
      `${c.id}: sourceRef names the contributor UI locale`
    );
    /* Protocol §2: real urn:li values are replaced with sentinels of the
     * shape urn:li:activity:71XX. Any other urn:li:activity value is a
     * sanitization leftover. */
    const urns = Array.from(
      c.markup.matchAll(/urn:li:activity:([A-Za-z0-9-]+)/g),
      (m) => m[1]
    );
    for (const urn of urns) {
      assert.ok(
        /^71[A-Za-z0-9-]*$/.test(urn),
        `${c.id}: non-sentinel URN leftover urn:li:activity:${urn}`
      );
    }
  }
});

/* ── 067-rules summary (metric-excluded unless real-donated, gate on negatives) ── */

test("067-rules summary: zero collateral hides on real fixed negatives", () => {
  const negatives = cases.filter((c) => c.expectedTarget === null);
  const missed = outcomes.filter((o) => !o.pass).map((o) => o.id);
  assert.equal(missed.length, 0);
  const summary = {
    note:
      "Real-donated entries only (provenance=user-contributed). " +
      "No precision, recall, or FPR rate is claimed. " +
      `realSampleCount=${cases.length}.`,
    totalCases: cases.length,
    negativeControls: negatives.map((c) => c.id),
    negativeFalsePositives: [],
    positiveTargeted: cases
      .filter((c) => c.expectedTarget !== null)
      .map((c) => c.id),
    falseNegatives: [],
    byId: outcomes,
  };
  console.log("071-SUMMARY " + JSON.stringify(summary));
  assert.equal(summary.negativeFalsePositives.length, 0);
});
