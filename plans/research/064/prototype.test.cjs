/* Plan 064 research assertions — NOT shipped. Runs with plain Node:
 *   node --test plans/research/064/prototype.test.cjs
 * Assertion style modeled on tests/unit/pattern-data.test.js.
 * The oracle below re-states the production precedence from
 * options/options.js:1763 with the real shared builders; the parity test
 * proves explainText never flips the effective decision — it only adds a
 * more specific explanation (wouldMatch notes, empty-input error).
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildPatterns,
  buildAllowMatcher,
  getExcludedSignature,
  normalizeExcludedEntries,
} = require(path.join(__dirname, "..", "..", "..", "shared", "pattern-data.js"));

const { explainText, TESTER_MAX_INPUT } = require("./prototype.cjs");
const cases = require("./cases.json");

const ALL_LANGS = ["EN", "ES", "FR", "PT", "DE"];
const MAX_PHRASE_LENGTH = 120;
const EXCLUDED_PREVIEW_LENGTH = 60;

function baseSettings(overrides) {
  return {
    phrases: [],
    langs: [...ALL_LANGS],
    disabledPatternIds: [],
    allowPhrases: [],
    excluded: [],
    ...(overrides || {}),
  };
}

/* Oracle: the current testerFindMatch precedence (options.js:1763),
 * written against the real shared builders. Returns the same shapes the
 * shipped tester branches on ({ allow } / { entry } / null). */
function oracleFindMatch(sliced, settings) {
  const excludedSigs = new Set(
    normalizeExcludedEntries(settings.excluded || [], EXCLUDED_PREVIEW_LENGTH).keys()
  );
  if (excludedSigs.has(getExcludedSignature(sliced))) return null;
  const allowMatchers = buildAllowMatcher(settings.allowPhrases || [], MAX_PHRASE_LENGTH);
  for (const allow of allowMatchers) {
    if (allow.regex.test(sliced)) return { allow };
  }
  const patterns = buildPatterns(
    settings.phrases,
    settings.langs,
    new Set(settings.disabledPatternIds || []),
    MAX_PHRASE_LENGTH
  );
  for (const entry of patterns) {
    if (entry.regex.test(sliced)) return { entry };
  }
  return null;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

test("exclusion beats allow, custom, and built-in rules", () => {
  const text = "comment CLAUDE and I will send you the PDF — good news for everyone";
  const settings = baseSettings({
    phrases: [{ text: "CLAUDE", enabled: true }],
    allowPhrases: [{ text: "good news" }],
    excluded: [{ sig: getExcludedSignature(text), preview: "comment CLAUDE", created: 1 }],
  });
  const out = explainText(text, settings);
  assert.equal(out.kind, "excluded");
  assert.equal(out.reason, "excluded-signature");
  assert.equal(out.effectiveHide, false);
  assert.deepEqual(out.wouldMatch, []);
});

test("allow beats custom and built-in rules", () => {
  const text = "comment CLAUDE and I will send you the PDF — good news for everyone";
  const out = explainText(
    text,
    baseSettings({
      phrases: [{ text: "CLAUDE", enabled: true }],
      allowPhrases: [{ text: "good news" }],
    })
  );
  assert.equal(out.kind, "allowed");
  assert.equal(out.reason, "allow-phrase");
  assert.equal(out.effectiveHide, false);
  assert.deepEqual(out.detail, { allowText: "good news" });
});

test("custom beats built-in (attribution wins)", () => {
  const out = explainText(
    "comment CLAUDE and I will send you the PDF",
    baseSettings({ phrases: [{ text: "CLAUDE", enabled: true }] })
  );
  assert.equal(out.kind, "matched");
  assert.equal(out.reason, "custom-phrase");
  assert.equal(out.effectiveHide, true);
  assert.deepEqual(out.detail, { source: "custom", label: "CLAUDE" });
});

test("built-in match names its label and stable id", () => {
  const out = explainText(
    "comment CLAUDE and I will send you the PDF",
    baseSettings()
  );
  assert.equal(out.kind, "matched");
  assert.equal(out.reason, "builtin-pattern");
  assert.equal(out.effectiveHide, true);
  assert.equal(out.detail.source, "builtin");
  assert.equal(out.detail.id, "EN-1");
});

test("disabled language yields unmatched with a would-match note", () => {
  const out = explainText(
    "comment CLAUDE and I will send you the PDF",
    baseSettings({ langs: ["ES", "FR", "PT", "DE"] })
  );
  assert.equal(out.kind, "unmatched");
  assert.equal(out.reason, "would-match-disabled-language");
  assert.equal(out.effectiveHide, false);
  assert.deepEqual(out.wouldMatch, [{
    type: "builtin",
    via: "disabled-language",
    label: 'comment "WORD" and I\'ll send / share ...',
    id: "EN-1",
    lang: "EN",
  }]);
});

test("disabled individual pattern yields unmatched with a would-match note", () => {
  const out = explainText(
    "comment CLAUDE and I will send you the PDF",
    baseSettings({ disabledPatternIds: ["EN-1"] })
  );
  assert.equal(out.kind, "unmatched");
  assert.equal(out.reason, "would-match-disabled-pattern");
  assert.equal(out.effectiveHide, false);
  assert.deepEqual(out.wouldMatch, [{
    type: "builtin",
    via: "disabled-pattern",
    label: 'comment "WORD" and I\'ll send / share ...',
    id: "EN-1",
    lang: "EN",
  }]);
});

test("disabled custom rule yields unmatched with a would-match note", () => {
  const out = explainText(
    "Sharing my SYNTH-BAIT-PHRASE notes from the workshop yesterday.",
    baseSettings({ phrases: [{ text: "SYNTH-BAIT-PHRASE", enabled: false }] })
  );
  assert.equal(out.kind, "unmatched");
  assert.equal(out.reason, "would-match-disabled-custom");
  assert.equal(out.effectiveHide, false);
  assert.deepEqual(out.wouldMatch, [
    { type: "custom", via: "disabled-custom", label: "SYNTH-BAIT-PHRASE" },
  ]);
});

test("benign text is unmatched with no would-match notes", () => {
  const out = explainText(
    "Had a great coffee chat with the team about our roadmap.",
    baseSettings()
  );
  assert.equal(out.kind, "unmatched");
  assert.equal(out.reason, "no-match");
  assert.equal(out.effectiveHide, false);
  assert.deepEqual(out.wouldMatch, []);
});

test("empty, whitespace-only, and non-string input is an error, not a no-match", () => {
  for (const input of ["", "   \n\t  ", null, undefined, 42]) {
    const out = explainText(input, baseSettings());
    assert.equal(out.kind, "error", `expected error for ${JSON.stringify(input)}`);
    assert.equal(out.reason, "empty-input");
    assert.equal(out.effectiveHide, false);
  }
});

test("over-cap input is truncated and says so", () => {
  const long = "Had a great coffee chat with the team about our roadmap. ".repeat(100);
  assert.ok(long.length > TESTER_MAX_INPUT);
  const out = explainText(long, baseSettings());
  assert.equal(out.kind, "unmatched");
  assert.equal(out.reason, "truncated-no-match");
  assert.equal(out.truncated, true);
  assert.equal(out.effectiveHide, false);
});

test("a match inside the tested prefix still wins on over-cap input", () => {
  const long = `comment CLAUDE and I will send you the PDF${" x".repeat(3000)}`;
  assert.ok(long.length > TESTER_MAX_INPUT);
  const out = explainText(long, baseSettings());
  assert.equal(out.kind, "matched");
  assert.equal(out.truncated, true);
  assert.equal(out.effectiveHide, true);
});

test("an active win suppresses disabled notes", () => {
  const out = explainText(
    "comment CLAUDE and I will send you the PDF",
    baseSettings({
      phrases: [{ text: "CLAUDE", enabled: true }],
      disabledPatternIds: ["EN-1"],
    })
  );
  assert.equal(out.kind, "matched");
  assert.equal(out.reason, "custom-phrase");
  assert.deepEqual(out.wouldMatch, []);
});

test("repeated calls agree and inputs are never mutated", () => {
  const text = "comment CLAUDE and I will send you the PDF — good news for everyone";
  const settings = deepFreeze(baseSettings({
    phrases: [{ text: "CLAUDE", enabled: true }],
    allowPhrases: [{ text: "good news" }],
    excluded: [{ sig: "sig:never-matches-this-text", preview: "x", created: 1 }],
  }));
  const snapshot = JSON.stringify(settings);
  const first = explainText(text, settings);
  const second = explainText(text, settings);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(settings), snapshot);
});

test("every cases.json fixture explains as labeled", () => {
  assert.ok(cases.length >= 10);
  for (const c of cases) {
    const out = explainText(c.text, c.settings);
    assert.equal(out.kind, c.expectedKind, `${c.id}: kind`);
    assert.equal(out.reason, c.expectedReason, `${c.id}: reason`);
  }
});

test("effective decisions match the current matcher on every non-error case", () => {
  for (const c of cases) {
    const out = explainText(c.text, c.settings);
    if (out.kind === "error") continue; // production returns early; no rendered verdict
    const sliced = c.text.trim().slice(0, TESTER_MAX_INPUT);
    const oracle = oracleFindMatch(sliced, c.settings);
    assert.equal(out.effectiveHide, Boolean(oracle && oracle.entry), `${c.id}: hide parity`);
    if (oracle && oracle.entry) assert.equal(out.kind, "matched", `${c.id}: oracle hit`);
    else if (oracle && oracle.allow) assert.equal(out.kind, "allowed", `${c.id}: oracle pardon`);
    else if (out.kind === "unmatched") assert.equal(Boolean(oracle), false, `${c.id}: oracle miss`);
    else assert.equal(out.kind, "excluded", `${c.id}: oracle miss is an exclusion`);
  }
});
