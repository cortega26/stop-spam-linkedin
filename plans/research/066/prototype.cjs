"use strict";

/* Plan 066 research prototype — NOT shipped, never loaded by the extension.
 * Pure serializer for the "Export selected phrases" phrase-pack format,
 * plus a faithful re-implementation of the legacy bare-array import loop
 * (options/options.js importPhraseList, verified at branch-start a284f5d)
 * for round-trip checks. Read production modules in place; nothing here
 * is copied from them.
 *
 * Phrase-pack format: a bare JSON array of newly constructed objects with
 * exactly { text, mode, enabled }. It reuses the legacy import contract:
 * trimmed text, case-insensitive dupe identity, enabled defaults to true
 * (item.enabled !== false), mode defaults to "exact" unless "contains".
 * See plans/research/065/design.md section 2 (legacy row) for the
 * characterized importer semantics this output round-trips through.
 */

const { PHRASES_STORAGE_KEY, LIMITS } = require("../../../shared/constants.js");
const SS = require("../../../shared/pattern-data.js");

function phraseByteLimit(quotaBytesPerItem) {
  return Math.floor(quotaBytesPerItem * 0.95);
}

/* Normalize one stored phrase to its portable export shape. Returns null
 * for entries that must not leave the profile (empty or over-long text).
 * Mode collapses to the importer's accepted set ("contains" or "exact");
 * enabled collapses to a boolean with the importer's default (true). */
function toPackEntry(phrase) {
  if (!phrase || typeof phrase.text !== "string") return null;
  const text = phrase.text.trim();
  if (!text || text.length > LIMITS.MAX_PHRASE_LENGTH) return null;
  return {
    text,
    mode: phrase.mode === "contains" ? "contains" : "exact",
    enabled: phrase.enabled !== false,
  };
}

/* Serialize the explicitly selected phrases to a portable phrase pack.
 * phrases: the full stored list (order is the export order). selectedIds:
 * an Array or Set of stored phrase ids. Selection is keyed by id, so it
 * survives sorting/search filtering; ids with no matching row (deleted
 * rows, stale ids) are dropped. Never mutates its inputs; every entry is
 * a newly constructed allowlist object ({ text, mode, enabled } only). */
function serializeSelected(phrases, selectedIds) {
  const list = Array.isArray(phrases) ? phrases : [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const pack = [];
  for (const phrase of list) {
    if (!phrase || typeof phrase.id !== "string" || !selected.has(phrase.id)) continue;
    const entry = toPackEntry(phrase);
    if (entry) pack.push(entry);
  }
  return pack;
}

/* Mirror of options.js importPhraseList (additive merge, no storage I/O):
 * item cap → validity → case-insensitive duplicate → byte quota (keeps
 * scanning after a skip). existing/items are stored-shape phrases; items
 * in pack shape ({ text, mode, enabled }) are accepted identically.
 * opts: { quotaBytesPerItem = 8192, now = Date.now(), uid = SS.uid }. */
function importPack(existing, items, opts) {
  const options = opts || {};
  const quota = options.quotaBytesPerItem || 8192;
  const now = options.now !== undefined ? options.now : Date.now();
  const uid = options.uid || SS.uid;
  const next = Array.isArray(existing) ? existing.map((p) => ({ ...p })) : [];
  const source = Array.isArray(items) ? items : [];
  let valid = 0;
  let skipped = 0;
  const limit = phraseByteLimit(quota);
  for (const item of source) {
    if (next.length >= LIMITS.MAX_CUSTOM_PHRASES) {
      skipped++;
      continue;
    }
    if (
      !item ||
      !item.text ||
      typeof item.text !== "string" ||
      !item.text.trim() ||
      item.text.trim().length > LIMITS.MAX_PHRASE_LENGTH
    ) {
      skipped++;
      continue;
    }
    const dup = next.some((p) => String((p && p.text) || "").toLowerCase() === item.text.trim().toLowerCase());
    if (dup) {
      skipped++;
      continue;
    }
    const candidate = {
      id: uid(),
      text: item.text.trim(),
      enabled: item.enabled !== false,
      created: item.created || now,
      mode: item.mode === "contains" ? "contains" : "exact",
    };
    if (SS.estimatePhraseBytes(next.concat([candidate]), PHRASES_STORAGE_KEY) > limit) {
      skipped++;
      continue;
    }
    next.push(candidate);
    valid++;
  }
  return { next, valid, skipped };
}

module.exports = { serializeSelected, importPack, toPackEntry };
