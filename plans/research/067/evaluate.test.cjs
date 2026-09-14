#!/usr/bin/env node

/* Unit tests for the plan-067 offline evaluator (research prototype).
 * Run: node --test plans/research/067/evaluate.test.cjs */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeText,
  classify,
  validateCorpus,
  settingsVariants,
  computeMetrics,
  verifyMetrics,
  evaluate,
  compareResults,
} = require("./evaluate.cjs");

function entry(overrides) {
  return {
    id: "t-1",
    language: "EN",
    text: "some text",
    expected: "spam",
    provenance: "synthetic",
    sourceRef: "test",
    labelStatus: "verified",
    split: "development",
    ...overrides,
  };
}

test("computeMetrics derives precision/recall/FPR with explicit denominators", () => {
  const m = computeMetrics({ tp: 8, fp: 2, tn: 7, fn: 3 });
  assert.equal(m.precision.value, 0.8);
  assert.deepEqual([m.precision.numerator, m.precision.denominator], [8, 10]);
  assert.equal(m.recall.value, 8 / 11);
  assert.deepEqual([m.recall.numerator, m.recall.denominator], [8, 11]);
  assert.equal(m.fpr.value, 2 / 9);
  assert.deepEqual([m.fpr.numerator, m.fpr.denominator], [2, 9]);
});

test("computeMetrics returns null for undefined metrics with zero denominators", () => {
  const empty = computeMetrics({ tp: 0, fp: 0, tn: 0, fn: 0 });
  assert.equal(empty.precision.value, null);
  assert.equal(empty.recall.value, null);
  assert.equal(empty.fpr.value, null);
  assert.equal(empty.precision.denominator, 0);

  /* No legitimate examples: FPR undefined, recall defined. */
  const noLegit = computeMetrics({ tp: 3, fp: 0, tn: 0, fn: 1 });
  assert.equal(noLegit.fpr.value, null);
  assert.equal(noLegit.recall.value, 0.75);
});

test("ambiguous and unverified entries are excluded from accuracy tallies", () => {
  const corpus = [
    entry({ id: "v-spam", text: 'Comment "X" and I\'ll send you the file', expected: "spam", labelStatus: "verified" }),
    entry({ id: "v-legit", text: "an ordinary professional update", expected: "legitimate", labelStatus: "verified" }),
    entry({ id: "u-spam", text: "Type YES to receive the thing", expected: "spam", labelStatus: "unverified" }),
    entry({ id: "a-1", text: "anything at all here", expected: "ambiguous", labelStatus: "unverified" }),
  ];
  const out = evaluate(corpus);
  assert.equal(out.judged, 2);
  assert.equal(out.ambiguous, 1);
  assert.equal(out.unverified, 1);
  assert.deepEqual([out.metrics.tp, out.metrics.tn], [1, 1]);
  /* The unverified miss stays visible without entering the tallies. */
  assert.ok(out.misclassified.some((m) => m.id === "u-spam" && m.labelStatus === "unverified"));
  assert.ok(!out.misclassified.some((m) => m.id === "a-1"));
});

test("validateCorpus rejects missing fields, bad enums, and duplicate ids", () => {
  assert.ok(validateCorpus([]).length > 0);
  assert.ok(validateCorpus("nope").length > 0);
  const missing = entry({ id: "m" });
  delete missing.text;
  assert.ok(validateCorpus([missing]).some((e) => e.includes('"text"')));
  assert.ok(validateCorpus([entry({ id: "b", expected: "maybe" })]).some((e) => e.includes("bad expected")));
  assert.ok(validateCorpus([entry({ id: "d" }), entry({ id: "d", text: "other words" })]).some((e) => e.includes("duplicate id")));
});

test("validateCorpus rejects exact text+settings+expected duplicates", () => {
  const a = entry({ id: "dup-a", text: "same words here" });
  const b = entry({ id: "dup-b", text: "same  words   here", expected: "spam" });
  const errors = validateCorpus([a, b]);
  assert.ok(errors.some((e) => e.includes("exact duplicate")), errors.join("\n"));
});

test("same wording under different settings is the allowed precedence matrix", () => {
  const corpus = [
    entry({ id: "p-base", text: 'Comment "X" and I\'ll send you the file' }),
    entry({ id: "p-allow", text: 'Comment "X" and I\'ll send you the file', expected: "legitimate", settings: { allowPhrases: [{ text: "send you" }] } }),
  ];
  assert.deepEqual(validateCorpus(corpus), []);
  assert.deepEqual(settingsVariants(corpus), [["p-base", "p-allow"]]);
});

test("text variants must not straddle development/holdout splits", () => {
  const corpus = [
    entry({ id: "s-dev", text: "shared wording here", split: "development" }),
    entry({ id: "s-hold", text: "shared wording here", split: "holdout", settings: { allowPhrases: [{ text: "zzz" }] } }),
  ];
  const errors = validateCorpus(corpus);
  assert.ok(errors.some((e) => e.includes("span splits")), errors.join("\n"));
});

test("exclusion signatures take precedence over built-in matches", () => {
  const text = 'Comment "X" and I\'ll send you the file';
  const base = classify(entry({ text }));
  assert.equal(base.spam, true);
  const excluded = classify(entry({ text, expected: "legitimate", settings: { excludedTexts: [text.toUpperCase()] } }));
  assert.equal(excluded.spam, false);
  assert.equal(excluded.reason, "excluded");
});

test("allow-phrases pardon text that custom phrases and built-ins also match", () => {
  const text = "comment CLAUDE and good news for you and I'll send it";
  const custom = classify(entry({ text, settings: { customPhrases: [{ text: "CLAUDE", enabled: true }] } }));
  assert.equal(custom.spam, true);
  assert.equal(custom.matchedSource, "custom");
  const pardoned = classify(entry({
    text,
    expected: "legitimate",
    settings: { customPhrases: [{ text: "CLAUDE", enabled: true }], allowPhrases: [{ text: "good news" }] },
  }));
  assert.equal(pardoned.spam, false);
  assert.match(pardoned.reason, /^allow:/);
});

test("custom phrases win attribution over overlapping built-ins", () => {
  const text = 'comment CLAUDE and I\'ll send you the PDF';
  const out = classify(entry({ text, settings: { customPhrases: [{ text: "CLAUDE", enabled: true }] } }));
  assert.equal(out.spam, true);
  assert.equal(out.matchedSource, "custom");
  assert.equal(out.matchedLabel, "CLAUDE");
});

test("evaluate is deterministic across repeated runs", () => {
  const corpus = require("./corpus.json");
  const first = evaluate(corpus);
  const second = evaluate(corpus);
  assert.deepEqual(second, first);
});

test("compareResults surfaces an intentionally bad prediction", () => {
  const good = { misclassified: [{ id: "a" }] };
  const bad = { misclassified: [{ id: "a" }, { id: "b" }] };
  const cmp = compareResults(good, bad);
  assert.deepEqual(cmp.introduced, ["b"]);
  assert.deepEqual(cmp.fixed, []);
  assert.equal(cmp.same, false);
  assert.equal(compareResults(good, good).same, true);
});

test("verifyMetrics passes on the real corpus evaluation", () => {
  const corpus = require("./corpus.json");
  assert.deepEqual(validateCorpus(corpus), []);
  assert.deepEqual(verifyMetrics(evaluate(corpus)), []);
});

test("normalizeText collapses case and whitespace for dedupe keys", () => {
  assert.equal(normalizeText("  Hello   WORLD\n"), "hello world");
});
