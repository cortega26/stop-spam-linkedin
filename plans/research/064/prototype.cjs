/* Plan 064 research prototype — NOT shipped.
 *
 * Pure explainText(text, settings) for the match-tester explanation design.
 * Uses the actual Node exports from shared/pattern-data.js (never copied
 * regexes). Mirrors the production precedence in options/options.js:1763
 * (exclusion -> allow -> first active match over the SS_buildPatterns
 * custom-first list), then adds a bounded, read-only second pass over
 * inactive rules for the "would match if enabled" note.
 *
 * Provenance of the mirrored constants:
 * - TESTER_MAX_INPUT = 5000 (options/options.js:1756)
 * - MAX_PHRASE_LENGTH = 120 (shared/constants.js LIMITS, passed to the
 *   SS_buildPatterns / SS_buildAllowMatcher calls in runTester)
 * - EXCLUDED_PREVIEW_LENGTH = 60 (options/options.js:1476 adapter)
 */

"use strict";

const path = require("node:path");

const {
  PATTERN_DATA,
  buildPatterns,
  buildAllowMatcher,
  getExcludedSignature,
  normalizeExcludedEntries,
} = require(path.join(__dirname, "..", "..", "..", "shared", "pattern-data.js"));

const TESTER_MAX_INPUT = 5000;
const MAX_PHRASE_LENGTH = 120;
const EXCLUDED_PREVIEW_LENGTH = 60;

/**
 * Bounded second pass over inactive rules. Runs ONLY when no active rule
 * wins and no pardon applies. Never enables anything or writes storage.
 * @param {string} sliced Tested (trimmed, capped) text.
 * @param {Array<any>} phrases Raw custom-phrase list from settings.
 * @param {readonly string[]} langs Enabled detection languages.
 * @param {ReadonlySet<string>} disabledIds Individually disabled pattern ids.
 * @returns {Array<{type: string, via: string, label: string, id?: string, lang?: string}>}
 */
function findWouldMatch(sliced, phrases, langs, disabledIds) {
  const out = [];
  /* 1. Individually disabled built-in ids, searched across every
     language's data (an id stays listed even when its language is also
     disabled — the more specific cause wins, reported once). */
  for (const [lang, entries] of Object.entries(PATTERN_DATA)) {
    for (const entry of entries) {
      if (disabledIds.has(entry.id) && entry.regex.test(sliced)) {
        out.push({
          type: "builtin",
          via: "disabled-pattern",
          label: entry.label,
          id: entry.id,
          lang,
        });
      }
    }
  }
  /* 2. Built-ins from disabled detection languages (skipping ids already
     reported above so a doubly-disabled rule lists once). */
  const enabledLangs = new Set(langs);
  for (const [lang, entries] of Object.entries(PATTERN_DATA)) {
    if (enabledLangs.has(lang)) continue;
    for (const entry of entries) {
      if (disabledIds.has(entry.id)) continue;
      if (entry.regex.test(sliced)) {
        out.push({
          type: "builtin",
          via: "disabled-language",
          label: entry.label,
          id: entry.id,
          lang,
        });
      }
    }
  }
  /* 3. Disabled custom rules — each compiled through the real builder
     with only the enabled flag flipped, so validity rules (empty text,
     length cap, exact/contains modes) stay identical to production. */
  for (const phrase of phrases) {
    if (phrase && phrase.enabled) continue;
    const [compiled] =
      buildPatterns([{ ...(phrase || {}), enabled: true }], [], new Set(), MAX_PHRASE_LENGTH);
    if (compiled && compiled.regex.test(sliced)) {
      out.push({ type: "custom", via: "disabled-custom", label: compiled.label });
    }
  }
  return out;
}

/**
 * Explains the match-tester verdict for pasted text. Pure: reads settings,
 * never mutates its inputs, never touches storage.
 * @param {any} text Pasted input (expected string).
 * @param {any} settings Plain settings data: { phrases, langs,
 *   disabledPatternIds, allowPhrases, excluded } using the stored shapes
 *   (ss_phrases entries, lang codes, pattern ids, ss_allow_phrases
 *   entries, ss_excluded entries).
 * @returns {{ kind: string, reason: string, truncated: boolean,
 *   wouldMatch: Array<object>, effectiveHide: boolean, detail: object|null }}
 */
function explainText(text, settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  if (typeof text !== "string" || text.trim() === "") {
    return {
      kind: "error",
      reason: "empty-input",
      truncated: false,
      wouldMatch: [],
      effectiveHide: false,
      detail: null,
    };
  }
  const raw = text.trim();
  const truncated = raw.length > TESTER_MAX_INPUT;
  const sliced = raw.slice(0, TESTER_MAX_INPUT);

  const phrases = Array.isArray(s.phrases) ? s.phrases : [];
  const langs = Array.isArray(s.langs) ? s.langs : [];
  const disabledIds = new Set(
    Array.isArray(s.disabledPatternIds) ? s.disabledPatternIds : []
  );

  /* Same exclusion semantics as testerFindMatch: the signature set is
     normalized from the stored ss_excluded shapes, then probed. */
  const excludedSigs = new Set(
    normalizeExcludedEntries(s.excluded || [], EXCLUDED_PREVIEW_LENGTH).keys()
  );
  if (excludedSigs.has(getExcludedSignature(sliced))) {
    return {
      kind: "excluded",
      reason: "excluded-signature",
      truncated,
      wouldMatch: [],
      effectiveHide: false,
      detail: null,
    };
  }

  const allowMatchers = buildAllowMatcher(s.allowPhrases || [], MAX_PHRASE_LENGTH);
  const allowHit = allowMatchers.find((a) => a.regex.test(sliced));
  if (allowHit) {
    return {
      kind: "allowed",
      reason: "allow-phrase",
      truncated,
      wouldMatch: [],
      effectiveHide: false,
      detail: { allowText: allowHit.text },
    };
  }

  /* Production-identical active list: custom-first, built-ins filtered by
     enabled languages and disabled ids. */
  const active = buildPatterns(phrases, langs, disabledIds, MAX_PHRASE_LENGTH);
  const hit = active.find((entry) => entry.regex.test(sliced));
  if (hit) {
    if (hit.source === "custom") {
      return {
        kind: "matched",
        reason: "custom-phrase",
        truncated,
        wouldMatch: [],
        effectiveHide: true,
        detail: { source: "custom", label: hit.label },
      };
    }
    return {
      kind: "matched",
      reason: "builtin-pattern",
      truncated,
      wouldMatch: [],
      effectiveHide: true,
      detail: { source: "builtin", label: hit.label, id: hit.id },
    };
  }

  const wouldMatch = findWouldMatch(sliced, phrases, langs, disabledIds);
  /* Reason priority: the most actionable disabled cause wins; truncation
     stays orthogonal via the `truncated` flag (the UI always appends the
     truncation note when it is set). */
  let reason = "no-match";
  if (wouldMatch.some((w) => w.via === "disabled-language")) {
    reason = "would-match-disabled-language";
  } else if (wouldMatch.some((w) => w.via === "disabled-pattern")) {
    reason = "would-match-disabled-pattern";
  } else if (wouldMatch.some((w) => w.via === "disabled-custom")) {
    reason = "would-match-disabled-custom";
  } else if (truncated) {
    reason = "truncated-no-match";
  }
  return {
    kind: "unmatched",
    reason,
    truncated,
    wouldMatch,
    effectiveHide: false,
    detail: null,
  };
}

module.exports = { explainText, TESTER_MAX_INPUT, MAX_PHRASE_LENGTH };
