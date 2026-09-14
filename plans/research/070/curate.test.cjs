#!/usr/bin/env node

/* Plan 070 research prototype tests (NOT SHIPPED).
 *
 * Offline checks for curate.cjs over small inline fixtures (single source
 * of truth per case table below), modeled after
 * plans/research/068/detector.test.cjs (case table + invariants). Uses
 * node:test + assert/strict; no DOM, no network, no production changes.
 *
 * The dev/seed entry lists are inline so the tests never depend on the
 * live contents of plans/research/067/corpus.json or holdout-seed.json;
 * one integration case loads the real files read-only to prove a fresh
 * id does not collide.
 *
 * Run: node --test plans/research/070/*.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const curate = require("./curate.cjs");

const DEV_FIXTURES = [
  {
    id: "en-builtin-01",
    language: "EN",
    text: "Comment CLAUDE and I will send you the checklist today",
    expected: "spam",
    provenance: "regression",
    sourceRef: "tests/helpers.js:22-25",
    labelStatus: "verified",
    split: "development",
  },
];

const SEED_FIXTURES = [
  {
    id: "holdout-01",
    language: "EN",
    text: "Drop the word GUIDE below and I will DM you the template",
    expected: "spam",
    provenance: "user-contributed",
    sourceRef: "https://github.com/cortega26/stop-spam-linkedin/issues/1 (Feed)",
    labelStatus: "verified",
    split: "holdout",
  },
];

function validHoldoutCandidate() {
  return {
    id: "holdout-02",
    language: "EN",
    text: "Reply with the keyword PROMPT and I will send the framework tonight",
    expected: "spam",
    provenance: "user-contributed",
    sourceRef: "https://github.com/cortega26/stop-spam-linkedin/issues/2 (Feed)",
    labelStatus: "verified",
    split: "holdout",
    expectedReason: "reporter keyword: PROMPT",
  };
}

/* Enum violations: one case per enum (evaluate.cjs:43-46 values). */
const ENUM_CASES = [
  { field: "expected", value: "maybe-spam" },
  { field: "provenance", value: "scraped" },
  { field: "labelStatus", value: "pending" },
  { field: "split", value: "test" },
];

for (const c of ENUM_CASES) {
  test(`enum violation: bad ${c.field} fails`, () => {
    const candidate = { ...validHoldoutCandidate(), [c.field]: c.value };
    const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
    assert.equal(result.ok, false);
    assert.match(result.reason, new RegExp(`bad ${c.field}`));
  });
}

test("valid holdout candidate passes", () => {
  const result = curate.checkCandidate(validHoldoutCandidate(), DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, true);
  assert.match(result.reason, /OK/);
});

test("valid development candidate passes", () => {
  const candidate = {
    id: "dev-draft-01",
    language: "ES",
    text: "Comenta GUÍA y te envío la plantilla esta noche",
    expected: "spam",
    provenance: "synthetic",
    sourceRef: "",
    labelStatus: "unverified",
    split: "development",
  };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, true);
});

test("duplicate id against the development corpus fails", () => {
  const candidate = { ...validHoldoutCandidate(), id: "en-builtin-01" };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, false);
  assert.match(result.reason, /duplicate id/);
});

test("duplicate id against the holdout seed fails", () => {
  const candidate = { ...validHoldoutCandidate(), id: "holdout-01" };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, false);
  assert.match(result.reason, /duplicate id/);
});

test("near-duplicate of a development entry fails as leakage for holdout", () => {
  const candidate = {
    ...validHoldoutCandidate(),
    text: "  comment   claude AND i WILL send you the checklist   today ",
  };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, false);
  assert.match(result.reason, /leakage/);
  assert.match(result.reason, /en-builtin-01/);
});

test("near-duplicate within the seed fails", () => {
  const candidate = {
    ...validHoldoutCandidate(),
    split: "development",
    labelStatus: "unverified",
    provenance: "synthetic",
    sourceRef: "",
    text: "drop THE word guide below and i will dm you the template",
  };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, false);
  assert.match(result.reason, /near-duplicate/);
  assert.match(result.reason, /holdout-01/);
});

test("missing sourceRef on holdout fails", () => {
  const candidate = { ...validHoldoutCandidate(), sourceRef: "   " };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, false);
  assert.match(result.reason, /sourceRef/);
});

test("missing sourceRef on development passes", () => {
  const candidate = {
    id: "dev-draft-02",
    language: "EN",
    text: "A development draft without a source reference yet",
    expected: "legitimate",
    provenance: "synthetic",
    labelStatus: "unverified",
    split: "development",
  };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, true);
});

test("empty and whitespace-only text fails", () => {
  for (const text of ["", "   ", "\n\t  "]) {
    const candidate = { ...validHoldoutCandidate(), id: `holdout-ws-${text.length}`, text };
    const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
    assert.equal(result.ok, false, `text ${JSON.stringify(text)} must fail`);
    assert.match(result.reason, /text/);
  }
});

test("holdout with unverified labelStatus fails (policy admission bar)", () => {
  const candidate = { ...validHoldoutCandidate(), labelStatus: "unverified" };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, false);
  assert.match(result.reason, /verified/);
});

test("holdout with synthetic provenance fails (policy admission bar)", () => {
  const candidate = { ...validHoldoutCandidate(), provenance: "synthetic" };
  const result = curate.checkCandidate(candidate, DEV_FIXTURES, SEED_FIXTURES);
  assert.equal(result.ok, false);
  assert.match(result.reason, /provenance/);
});

test("non-object candidate fails", () => {
  for (const bad of [null, "text", ["array"]]) {
    const result = curate.checkCandidate(bad, DEV_FIXTURES, SEED_FIXTURES);
    assert.equal(result.ok, false);
  }
});

test("normalizeText folds case and whitespace like evaluate.cjs:48-52", () => {
  assert.equal(curate.normalizeText("  Comment   CLAUDE\n"), "comment claude");
});

test("fresh id does not collide with the real reference files (read-only)", () => {
  const dev = curate.loadJsonArray(require("node:path").join(__dirname, "..", "067", "corpus.json"));
  const seed = curate.loadJsonArray(require("node:path").join(__dirname, "holdout-seed.json"));
  assert.ok(dev.length > 0, "development corpus loads");
  const candidate = {
    ...validHoldoutCandidate(),
    id: "holdout-curate-selftest-fresh-id",
    text: "Curate self-test probe wording that matches no real entry anywhere",
  };
  const result = curate.checkCandidate(candidate, dev, seed);
  assert.equal(result.ok, true);
});
