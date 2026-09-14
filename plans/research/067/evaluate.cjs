#!/usr/bin/env node

/* Offline detection evaluator (plan 067 research prototype — not shipped).
 *
 * Uses the ACTUAL shared Node exports (shared/pattern-data.js,
 * shared/constants.js) and mirrors content.js findMatch precedence:
 * exclusion signature -> allow-phrase -> first pattern match, where
 * buildPatterns orders custom phrases before built-ins. Testing regexes
 * alone would omit those user protections, so the evaluator classifies
 * through the same three layers.
 *
 * CLI:
 *   node plans/research/067/evaluate.cjs            human-readable summary
 *   node plans/research/067/evaluate.cjs --json     metrics + every misclassified ID
 *   node plans/research/067/evaluate.cjs --check    schema, arithmetic, dedupe/split
 *                                                   invariants, and the recorded
 *                                                   baseline of expected failures
 *   node plans/research/067/evaluate.cjs --compare <result.json>
 *                                                   diff this corpus run against a
 *                                                   recorded result (candidate runs)
 *
 * Timing is deliberately excluded: results are deterministic. Production
 * regexes must NOT be changed to make the report green. */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  buildPatterns,
  buildAllowMatcher,
  getExcludedSignature,
  normalizeExcludedEntries,
} = require("../../../shared/pattern-data.js");
const { LIMITS, DEFAULT_ENABLED_LANGS } = require("../../../shared/constants.js");

const RESEARCH_DIR = __dirname;
const CORPUS_PATH = path.join(RESEARCH_DIR, "corpus.json");
const BASELINE_PATH = path.join(RESEARCH_DIR, "baseline.json");

const EXPECTED_VALUES = ["spam", "legitimate", "ambiguous"];
const PROVENANCE_VALUES = ["synthetic", "regression", "user-contributed", "public-excerpt"];
const LABEL_VALUES = ["verified", "unverified"];
const SPLIT_VALUES = ["development", "holdout"];

/* Collapse case/whitespace so near-identical wording dedupes to one key.
 * Variants of one source must stay in the same split (leakage guard). */
function normalizeText(text) {
  return String(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function defaultSettings() {
  return {
    langs: [...DEFAULT_ENABLED_LANGS],
    customPhrases: [],
    allowPhrases: [],
    excludedTexts: [],
    disabledPatterns: [],
  };
}

function resolveSettings(entry) {
  const over = (entry && entry.settings) || {};
  const base = defaultSettings();
  return {
    langs: Array.isArray(over.langs) && over.langs.length ? over.langs : base.langs,
    customPhrases: Array.isArray(over.customPhrases) ? over.customPhrases : base.customPhrases,
    allowPhrases: Array.isArray(over.allowPhrases) ? over.allowPhrases : base.allowPhrases,
    excludedTexts: Array.isArray(over.excludedTexts) ? over.excludedTexts : base.excludedTexts,
    disabledPatterns: Array.isArray(over.disabledPatterns) ? over.disabledPatterns : base.disabledPatterns,
  };
}

/* Mirrors content.js findMatch (exclusion -> allow -> first match). */
function classify(entry) {
  const text = entry.text;
  const settings = resolveSettings(entry);
  const excluded = normalizeExcludedEntries(
    settings.excludedTexts.map((t) => (typeof t === "string" ? t : t)),
    60
  );
  if (excluded.has(getExcludedSignature(text))) {
    return { spam: false, reason: "excluded", matchedId: null, matchedSource: null, matchedLabel: null };
  }
  const allow = buildAllowMatcher(settings.allowPhrases, LIMITS.MAX_PHRASE_LENGTH);
  for (const rule of allow) {
    if (rule.regex.test(text)) {
      return { spam: false, reason: "allow:" + rule.text, matchedId: null, matchedSource: null, matchedLabel: null };
    }
  }
  const patterns = buildPatterns(
    settings.customPhrases,
    settings.langs,
    new Set(settings.disabledPatterns),
    LIMITS.MAX_PHRASE_LENGTH
  );
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      return {
        spam: true,
        reason: (pattern.source === "custom" ? "custom:" : "builtin:") + (pattern.id || pattern.label),
        matchedId: pattern.id || null,
        matchedSource: pattern.source,
        matchedLabel: pattern.label,
      };
    }
  }
  return { spam: false, reason: "no-match", matchedId: null, matchedSource: null, matchedLabel: null };
}

function canonicalSettings(entry) {
  return JSON.stringify(resolveSettings(entry));
}

function validateCorpus(corpus) {
  const errors = [];
  if (!Array.isArray(corpus) || corpus.length === 0) {
    return ["corpus must be a non-empty array"];
  }
  const seenIds = new Set();
  const textGroups = new Map();
  corpus.forEach((entry, index) => {
    const where = `corpus[${index}]${entry && entry.id ? ` (${entry.id})` : ""}`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${where}: entry must be an object`);
      return;
    }
    for (const field of ["id", "language", "text", "expected", "provenance", "sourceRef", "labelStatus", "split"]) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        errors.push(`${where}: missing or empty required field "${field}"`);
      }
    }
    if (entry.id) {
      if (seenIds.has(entry.id)) errors.push(`${where}: duplicate id "${entry.id}"`);
      seenIds.add(entry.id);
    }
    if (entry.expected && !EXPECTED_VALUES.includes(entry.expected)) {
      errors.push(`${where}: bad expected "${entry.expected}"`);
    }
    if (entry.provenance && !PROVENANCE_VALUES.includes(entry.provenance)) {
      errors.push(`${where}: bad provenance "${entry.provenance}"`);
    }
    if (entry.labelStatus && !LABEL_VALUES.includes(entry.labelStatus)) {
      errors.push(`${where}: bad labelStatus "${entry.labelStatus}"`);
    }
    if (entry.split && !SPLIT_VALUES.includes(entry.split)) {
      errors.push(`${where}: bad split "${entry.split}"`);
    }
    if (entry.settings !== undefined && (typeof entry.settings !== "object" || entry.settings === null)) {
      errors.push(`${where}: settings must be an object when present`);
    }
    if (typeof entry.text === "string") {
      const key = normalizeText(entry.text);
      if (!textGroups.has(key)) textGroups.set(key, []);
      textGroups.get(key).push(entry);
    }
  });
  /* Dedupe invariant: byte-identical (post-normalization) text with
   * identical settings and expectation is a true duplicate and an error.
   * Same wording under different settings is the precedence matrix
   * (e.g. en-builtin-01 vs en-custom-01) — allowed, reported separately. */
  for (const [key, group] of textGroups) {
    const exact = new Map();
    for (const entry of group) {
      const sig = `${canonicalSettings(entry)}||${entry.expected}`;
      if (!exact.has(sig)) exact.set(sig, []);
      exact.get(sig).push(entry.id);
    }
    for (const ids of exact.values()) {
      if (ids.length > 1) {
        errors.push(`exact duplicate text+settings+expected: ${ids.join(", ")} (normalized: "${key.slice(0, 60)}")`);
      }
    }
    /* Split invariant: variants of one source stay together — the same
     * wording must never straddle development/holdout (leakage). */
    const splits = new Set(group.map((entry) => entry.split));
    if (splits.size > 1) {
      errors.push(`text variants span splits (${[...splits].join("/")}): ${group.map((e) => e.id).join(", ")}`);
    }
  }
  return errors;
}

/* Same wording under different settings (the precedence matrix). */
function settingsVariants(corpus) {
  const groups = new Map();
  for (const entry of corpus) {
    const key = normalizeText(entry.text);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry.id);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

function metric(value, numerator, denominator) {
  return {
    value: denominator === 0 ? null : value,
    numerator,
    denominator,
  };
}

function computeMetrics(counts) {
  const { tp, fp, tn, fn } = counts;
  return {
    tp,
    fp,
    tn,
    fn,
    precision: metric(tp + fp === 0 ? null : tp / (tp + fp), tp, tp + fp),
    recall: metric(tp + fn === 0 ? null : tp / (tp + fn), tp, tp + fn),
    fpr: metric(fp + tn === 0 ? null : fp / (fp + tn), fp, fp + tn),
  };
}

/* Independent arithmetic re-derivation for --check: recompute each rate
 * from the raw counts with a separate expression and compare. */
function verifyMetrics(evaluated) {
  const problems = [];
  const check = (scope, metrics) => {
    const { tp, fp, tn, fn } = metrics;
    const expected = {
      precision: tp + fp === 0 ? null : tp / (tp + fp),
      recall: tp + fn === 0 ? null : tp / (tp + fn),
      fpr: fp + tn === 0 ? null : fp / (fp + tn),
    };
    for (const name of Object.keys(expected)) {
      const got = metrics[name].value;
      const want = expected[name];
      const same = (got === null && want === null) || (typeof got === "number" && typeof want === "number" && Math.abs(got - want) < 1e-12);
      if (!same) problems.push(`${scope}.${name}: recorded ${got}, recomputed ${want}`);
      if (metrics[name].numerator === undefined || metrics[name].denominator === undefined) {
        problems.push(`${scope}.${name}: missing explicit denominator`);
      }
    }
  };
  check("overall", evaluated.metrics);
  for (const [scope, metrics] of Object.entries(evaluated.strata.byLanguage)) check(`lang:${scope}`, metrics);
  for (const [scope, metrics] of Object.entries(evaluated.strata.byProvenance)) check(`provenance:${scope}`, metrics);
  for (const [scope, metrics] of Object.entries(evaluated.strata.bySplit)) check(`split:${scope}`, metrics);
  return problems;
}

function emptyCounts() {
  return { tp: 0, fp: 0, tn: 0, fn: 0 };
}

function evaluate(corpus) {
  const predictions = corpus.map((entry) => ({ id: entry.id, ...classify(entry) }));
  const byId = new Map(predictions.map((p) => [p.id, p]));
  const overall = emptyCounts();
  const byLanguage = {};
  const byProvenance = {};
  const bySplit = {};
  let ambiguous = 0;
  let unverified = 0;
  const misclassified = [];

  for (const entry of corpus) {
    const predicted = byId.get(entry.id).spam;
    const judged = entry.labelStatus === "verified" && (entry.expected === "spam" || entry.expected === "legitimate");
    if (entry.expected === "ambiguous") {
      ambiguous += 1;
    } else if (entry.labelStatus !== "verified") {
      unverified += 1;
    }
    if (!judged) {
      /* Ambiguous and unverified entries never enter accuracy tallies,
       * but unverified spam/legitimate disagreements stay visible. */
      if (entry.expected !== "ambiguous" && ((entry.expected === "spam") !== predicted)) {
        misclassified.push({ id: entry.id, expected: entry.expected, predicted, labelStatus: entry.labelStatus });
      }
      continue;
    }
    const bucket = (entry.expected === "spam") === predicted
      ? (entry.expected === "spam" ? "tp" : "tn")
      : (entry.expected === "spam" ? "fn" : "fp");
    overall[bucket] += 1;
    if (!byLanguage[entry.language]) byLanguage[entry.language] = emptyCounts();
    if (!byProvenance[entry.provenance]) byProvenance[entry.provenance] = emptyCounts();
    if (!bySplit[entry.split]) bySplit[entry.split] = emptyCounts();
    byLanguage[entry.language][bucket] += 1;
    byProvenance[entry.provenance][bucket] += 1;
    bySplit[entry.split][bucket] += 1;
    if (bucket === "fp" || bucket === "fn") {
      misclassified.push({ id: entry.id, expected: entry.expected, predicted, labelStatus: entry.labelStatus });
    }
  }

  const mapMetrics = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, computeMetrics(v)]));
  misclassified.sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    corpusSize: corpus.length,
    judged: overall.tp + overall.fp + overall.tn + overall.fn,
    ambiguous,
    unverified,
    metrics: computeMetrics(overall),
    strata: {
      byLanguage: mapMetrics(byLanguage),
      byProvenance: mapMetrics(byProvenance),
      bySplit: mapMetrics(bySplit),
    },
    misclassified,
    predictions,
  };
}

/* Diff two evaluate() results: surfaces newly introduced discrepancies
 * (and silently fixed ones) instead of hiding either. */
function compareResults(before, after) {
  const beforeIds = new Set((before.misclassified || []).map((m) => m.id));
  const afterIds = new Set((after.misclassified || []).map((m) => m.id));
  return {
    fixed: [...beforeIds].filter((id) => !afterIds.has(id)).sort(),
    introduced: [...afterIds].filter((id) => !beforeIds.has(id)).sort(),
    same: beforeIds.size === afterIds.size && [...beforeIds].every((id) => afterIds.has(id)),
  };
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function loadCorpus() {
  return JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
}

function summarize(evaluated) {
  const lines = [];
  const m = evaluated.metrics;
  const fmt = (x) => (x.value === null ? `null (${x.numerator}/${x.denominator})` : `${x.value.toFixed(4)} (${x.numerator}/${x.denominator})`);
  lines.push(`corpus=${evaluated.corpusSize} judged=${evaluated.judged} ambiguous=${evaluated.ambiguous} unverified=${evaluated.unverified}`);
  lines.push(`tp=${m.tp} fp=${m.fp} tn=${m.tn} fn=${m.fn}`);
  lines.push(`precision=${fmt(m.precision)} recall=${fmt(m.recall)} fpr=${fmt(m.fpr)}`);
  lines.push(`misclassified(${evaluated.misclassified.length}): ${evaluated.misclassified.map((x) => x.id).join(", ") || "(none)"}`);
  return lines.join("\n");
}

function runCheck() {
  const failures = [];
  let corpus;
  try {
    corpus = loadCorpus();
  } catch (err) {
    console.error(`FAIL: cannot load corpus: ${err.message}`);
    return 1;
  }
  const schemaErrors = validateCorpus(corpus);
  if (schemaErrors.length) {
    console.error("FAIL: corpus schema/invariants:");
    for (const err of schemaErrors) console.error(`  - ${err}`);
    return 1;
  }
  const evaluated = evaluate(corpus);
  const arithmetic = verifyMetrics(evaluated);
  if (arithmetic.length) {
    console.error("FAIL: metric arithmetic:");
    for (const err of arithmetic) console.error(`  - ${err}`);
    return 1;
  }
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  } catch (err) {
    console.error(`FAIL: cannot load baseline ${BASELINE_PATH}: ${err.message}`);
    return 1;
  }
  const corpusHash = sha256File(CORPUS_PATH);
  if (baseline.corpusSha256 !== corpusHash) {
    console.error(`FAIL: corpus hash ${corpusHash} != baseline corpusSha256 ${baseline.corpusSha256}; re-record the baseline deliberately, do not edit it to fit.`);
    return 1;
  }
  const got = evaluated.misclassified.map((x) => x.id).sort();
  const want = [...(baseline.expectedMisclassified || [])].sort();
  const same = got.length === want.length && got.every((id, i) => id === want[i]);
  if (!same) {
    const cmp = compareResults({ misclassified: want.map((id) => ({ id })) }, evaluated);
    console.error("FAIL: misclassified set differs from recorded baseline:");
    if (cmp.introduced.length) console.error(`  introduced: ${cmp.introduced.join(", ")}`);
    if (cmp.fixed.length) console.error(`  fixed (re-record if intentional): ${cmp.fixed.join(", ")}`);
    failures.push("baseline-mismatch");
  }
  if (failures.length) return 1;
  console.log("CHECK OK");
  console.log(summarize(evaluated));
  console.log(`settings-variants: ${settingsVariants(corpus).map((g) => g.join("+")).join(" ") || "(none)"}`);
  return 0;
}

function main(argv) {
  if (argv.includes("--check")) return runCheck();
  const corpus = loadCorpus();
  const schemaErrors = validateCorpus(corpus);
  if (schemaErrors.length) {
    console.error("corpus schema/invariants failed:");
    for (const err of schemaErrors) console.error(`  - ${err}`);
    return 1;
  }
  const evaluated = evaluate(corpus);
  const compareIndex = argv.indexOf("--compare");
  if (compareIndex !== -1) {
    const otherPath = argv[compareIndex + 1];
    if (!otherPath) {
      console.error("--compare requires a <result.json> path");
      return 1;
    }
    const other = JSON.parse(fs.readFileSync(otherPath, "utf8"));
    const cmp = compareResults(other, evaluated);
    console.log(JSON.stringify(cmp, null, 2));
    return cmp.same ? 0 : 1;
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify(evaluated, null, 2));
    return 0;
  }
  console.log(summarize(evaluated));
  return 0;
}

module.exports = {
  normalizeText,
  resolveSettings,
  classify,
  validateCorpus,
  settingsVariants,
  computeMetrics,
  verifyMetrics,
  evaluate,
  compareResults,
  sha256File,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
