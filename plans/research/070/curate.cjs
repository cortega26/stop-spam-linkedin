#!/usr/bin/env node

/* Plan 070 research prototype — holdout curation checker (NOT SHIPPED).
 *
 * Validates a candidate corpus entry (issue-derived draft) against the
 * corpus schema and the curation policy (plans/research/070/policy.md)
 * before it may be appended to plans/research/070/holdout-seed.json.
 * This file never ships: it lives under plans/research/070/ and is
 * excluded from the packaged zip by design (scripts/package-extension.js
 * uses a fixed file list).
 *
 * The schema mirrors plans/research/067/evaluate.cjs (enums at
 * evaluate.cjs:43-46, required fields at evaluate.cjs:130, settings
 * object check at evaluate.cjs:151). The text folding below is a small
 * intentional duplication of evaluate.cjs:48-52 with a pointer comment,
 * exactly as background.js keeps its own t/uid copies — the 067
 * evaluator stays the single source of truth and is never modified.
 *
 * CLI:
 *   node plans/research/070/curate.cjs --check <candidate.json>
 *                                                   validate one entry (exit 0/1, one-line reason)
 *   node plans/research/070/curate.cjs --help       schema docs (exit 0)
 *
 * Candidate file shape: a single JSON object with keys id, language,
 * text, expected, provenance, sourceRef, labelStatus, split, plus
 * optional settings (object) and expectedReason (string).
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RESEARCH_DIR = __dirname;
const DEV_CORPUS_PATH = path.join(RESEARCH_DIR, "..", "067", "corpus.json");
const SEED_PATH = path.join(RESEARCH_DIR, "holdout-seed.json");

/* Same four enums as evaluate.cjs:43-46. */
const EXPECTED_VALUES = ["spam", "legitimate", "ambiguous"];
const PROVENANCE_VALUES = ["synthetic", "regression", "user-contributed", "public-excerpt"];
const LABEL_VALUES = ["verified", "unverified"];
const SPLIT_VALUES = ["development", "holdout"];

/* Holdout admission bar (policy.md section 1): only independently
 * labeled sources may enter the holdout split. */
const HOLDOUT_PROVENANCE_VALUES = ["user-contributed", "public-excerpt"];

/* Same folding as evaluate.cjs:48-52 (normalizeText). Near-identical
 * wording collapses to one key; variants of one source must stay in
 * the same split (leakage guard, evaluate.cjs:176-181). */
function normalizeText(text) {
  return String(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function loadJsonArray(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Validate a candidate entry against the schema + policy.
 *
 * @param {any} candidate the parsed candidate object
 * @param {Array} devEntries entries of plans/research/067/corpus.json
 * @param {Array} seedEntries entries of plans/research/070/holdout-seed.json
 * @returns {{ok: boolean, reason: string}} one-line verdict
 */
function checkCandidate(candidate, devEntries, seedEntries) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, reason: "candidate must be a JSON object" };
  }
  const where = candidate.id ? `candidate (${candidate.id})` : "candidate";
  const required =
    candidate.split === "development"
      ? ["id", "language", "text", "expected", "provenance", "labelStatus", "split"]
      : ["id", "language", "text", "expected", "provenance", "sourceRef", "labelStatus", "split"];
  for (const field of required) {
    if (typeof candidate[field] !== "string" || candidate[field].trim() === "") {
      return { ok: false, reason: `${where}: missing or empty required field "${field}"` };
    }
  }
  if (candidate.expected && !EXPECTED_VALUES.includes(candidate.expected)) {
    return { ok: false, reason: `${where}: bad expected "${candidate.expected}"` };
  }
  if (candidate.provenance && !PROVENANCE_VALUES.includes(candidate.provenance)) {
    return { ok: false, reason: `${where}: bad provenance "${candidate.provenance}"` };
  }
  if (candidate.labelStatus && !LABEL_VALUES.includes(candidate.labelStatus)) {
    return { ok: false, reason: `${where}: bad labelStatus "${candidate.labelStatus}"` };
  }
  if (candidate.split && !SPLIT_VALUES.includes(candidate.split)) {
    return { ok: false, reason: `${where}: bad split "${candidate.split}"` };
  }
  if (candidate.settings !== undefined && (typeof candidate.settings !== "object" || candidate.settings === null)) {
    return { ok: false, reason: `${where}: settings must be an object when present` };
  }
  if (normalizeText(candidate.text) === "") {
    return { ok: false, reason: `${where}: text is empty or whitespace-only` };
  }
  /* Holdout admission bar (policy.md section 1). */
  if (candidate.split === "holdout") {
    if (candidate.labelStatus !== "verified") {
      return { ok: false, reason: `${where}: split "holdout" requires labelStatus "verified"` };
    }
    if (!HOLDOUT_PROVENANCE_VALUES.includes(candidate.provenance)) {
      return { ok: false, reason: `${where}: split "holdout" requires provenance user-contributed or public-excerpt` };
    }
  }
  /* Id uniqueness against BOTH files. */
  const knownIds = new Set();
  for (const entry of [...devEntries, ...seedEntries]) {
    if (entry && typeof entry.id === "string") knownIds.add(entry.id);
  }
  if (knownIds.has(candidate.id)) {
    return { ok: false, reason: `${where}: duplicate id "${candidate.id}"` };
  }
  /* Dedupe + leakage (policy.md section 2, folding per evaluate.cjs:48-52). */
  const key = normalizeText(candidate.text);
  const allKnown = [...devEntries, ...seedEntries];
  for (const entry of allKnown) {
    if (!entry || typeof entry.text !== "string") continue;
    if (normalizeText(entry.text) === key) {
      if (candidate.split === "holdout" && entry.split === "development") {
        return { ok: false, reason: `${where}: leakage — near-duplicate of development entry "${entry.id}"` };
      }
      return { ok: false, reason: `${where}: near-duplicate of entry "${entry.id}"` };
    }
  }
  return { ok: true, reason: `${where}: OK` };
}

function printHelp() {
  const lines = [
    "curate.cjs — holdout candidate checker (plan 070 research prototype, not shipped).",
    "",
    "Usage:",
    "  node plans/research/070/curate.cjs --check <candidate.json>",
    "  node plans/research/070/curate.cjs --help",
    "",
    "Candidate schema (mirrors plans/research/067/evaluate.cjs:43-46 and :130):",
    "  id           string, unique against plans/research/067/corpus.json AND holdout-seed.json",
    "  language     string, non-empty (corpus convention: EN, ES, FR, PT, DE)",
    "  text         string, non-empty after trimming",
    "  expected     one of: spam, legitimate, ambiguous",
    "  provenance   one of: synthetic, regression, user-contributed, public-excerpt",
    "  sourceRef    string, non-empty; REQUIRED for split holdout (issue URL or",
    "               publication attribution per policy.md section 1); optional for",
    "               development drafts (the 067 evaluator still requires it at merge)",
    "  labelStatus  one of: verified, unverified (holdout requires verified)",
    "  split        one of: development, holdout (holdout additionally requires",
    "               provenance user-contributed or public-excerpt)",
    "  settings     optional object (customPhrases / allowPhrases / excludedTexts /",
    "               disabledPatterns / langs)",
    "  expectedReason  optional string (reporter keyword goes here, never into text)",
    "",
    "Checks: schema + enums, id uniqueness (both files), normalizeText dedupe",
    "(same folding as evaluate.cjs:48-52), leakage (holdout candidate colliding",
    "with a development entry). Exit 0 with OK, exit 1 with a one-line reason.",
    "Policy: plans/research/070/policy.md.",
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return 0;
  }
  const flagIndex = argv.indexOf("--check");
  if (flagIndex === -1 || !argv[flagIndex + 1]) {
    process.stderr.write("usage: curate.cjs --check <candidate.json> | --help\n");
    return 1;
  }
  const candidatePath = argv[flagIndex + 1];
  let candidate;
  try {
    candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  } catch (err) {
    process.stdout.write(`candidate: unreadable JSON (${err && err.code ? err.code : err})\n`);
    return 1;
  }
  let devEntries;
  let seedEntries;
  try {
    devEntries = loadJsonArray(DEV_CORPUS_PATH);
    seedEntries = loadJsonArray(SEED_PATH);
  } catch (err) {
    process.stdout.write(`candidate: cannot load reference corpus (${err && err.message ? err.message : err})\n`);
    return 1;
  }
  const result = checkCandidate(candidate, devEntries, seedEntries);
  process.stdout.write(result.reason + "\n");
  return result.ok ? 0 : 1;
}

module.exports = {
  EXPECTED_VALUES,
  PROVENANCE_VALUES,
  LABEL_VALUES,
  SPLIT_VALUES,
  HOLDOUT_PROVENANCE_VALUES,
  normalizeText,
  loadJsonArray,
  checkCandidate,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
