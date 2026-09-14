"use strict";

/* Plan 065 research prototype — NOT shipped, never loaded by the extension.
 * Pure import planner plus a fake-storage commit controller.
 *
 * planImport(snapshot, input, opts) predicts the merge the current
 * options.js importer performs, without touching storage. Where the planner
 * deliberately differs from current code (UTF-8 byte math, version gate,
 * conflict skips), each difference is documented in design.md and covered
 * by a prototype test. Where current code has quirks that do not change the
 * stored patch (duplicate-vs-invalid lumping, excluded double-cap,
 * untrimmed whitelist push), the planner replicates the patch exactly and
 * only reports truer counts.
 */

const {
  PHRASES_STORAGE_KEY,
  STORAGE_KEYS,
  LIMITS,
  DEFAULT_ENABLED_LANGS,
} = require("../../../shared/constants.js");
const SS = require("../../../shared/pattern-data.js");

const REAL_SYNC_QUOTA_BYTES_PER_ITEM = 8192;
const EXCLUDED_PREVIEW_LENGTH = 60; /* options.js normalizeExcludedEntries adapter */

function phraseByteLimit(quota) {
  return Math.floor(quota * 0.95);
}

function safeByteLimit(quota) {
  return Math.floor(quota * 0.9);
}

function utf8Length(value) {
  return new TextEncoder().encode(value).length;
}

/* Serialized size of a stored list value plus its key, in UTF-8 bytes.
 * The preview uses UTF-8 for EVERY category (deliberate change: the current
 * whitelist / blocked-authors / allow paths use UTF-16 string length, which
 * undercounts multibyte text — see design.md). */
function estimateListBytes(list, storageKey) {
  return storageKey.length + utf8Length(JSON.stringify(list));
}

function emptyCounts() {
  return { added: 0, duplicate: 0, invalid: 0, quotaSkipped: 0, evicted: 0 };
}

function cloneSnapshot(snapshot) {
  const source = snapshot || {};
  return {
    phrases: Array.isArray(source.phrases) ? source.phrases.map((p) => ({ ...p })) : [],
    whitelist: Array.isArray(source.whitelist) ? source.whitelist.slice() : [],
    excluded: Array.isArray(source.excluded)
      ? source.excluded.map((e) => (e && typeof e === "object" ? { ...e } : e))
      : [],
    langs: Array.isArray(source.langs) ? source.langs.slice() : [...DEFAULT_ENABLED_LANGS],
    blockedAuthors: Array.isArray(source.blockedAuthors) ? source.blockedAuthors.slice() : [],
    disabledPatterns: Array.isArray(source.disabledPatterns) ? source.disabledPatterns.slice() : [],
    hidePromoted: source.hidePromoted === true,
    hideFeatured: source.hideFeatured === true,
    allowPhrases: Array.isArray(source.allowPhrases)
      ? source.allowPhrases.map((p) => ({ ...p }))
      : [],
  };
}

function rejected(reason, detail) {
  return {
    status: "rejected",
    patch: {},
    summary: { status: "rejected", reason },
    issues: [{ code: reason, detail: detail || reason }],
  };
}

/* Identity for an ss_excluded entry, mirroring options.js excludedIdentity:
 * bare strings (any string, even "") and objects via .sig; else null. */
function excludedIdentity(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.sig === "string") return entry.sig;
  return null;
}

/* Effective signature after the options.js normalize step: the sig an entry
 * will actually occupy once merged. Empty/whitespace strings normalize to
 * nothing (dropped); plain text hashes via SS_getExcludedSignature. */
function effectiveExcludedSig(entry) {
  if (typeof entry === "string") {
    if (!entry.trim()) return null;
    if (entry.startsWith("sig:")) return entry;
    return SS.getExcludedSignature(entry);
  }
  if (entry && typeof entry === "object" && typeof entry.sig === "string") return entry.sig;
  return null;
}

/* Shared block-phrase merge loop. Mirrors options.js importPhraseList order:
 * item cap → validity → case-insensitive duplicate → byte quota (keep
 * scanning after a byte skip). blockTexts is the set of lowercased texts
 * the new phrases must not collide with (existing + planned allow). */
function planBlockPhrases(existing, items, ctx, allowTexts) {
  const next = existing.map((p) => ({ ...p }));
  const counts = { ...emptyCounts(), conflictSkipped: 0 };
  const seen = new Set(next.map((p) => String((p && p.text) || "").trim().toLowerCase()));
  const limit = phraseByteLimit(ctx.quota);
  for (const item of items) {
    if (next.length >= LIMITS.MAX_CUSTOM_PHRASES) {
      counts.quotaSkipped++;
      continue;
    }
    if (
      !item ||
      typeof item.text !== "string" ||
      !item.text.trim() ||
      item.text.trim().length > LIMITS.MAX_PHRASE_LENGTH
    ) {
      counts.invalid++;
      continue;
    }
    const text = item.text.trim();
    const folded = text.toLowerCase();
    if (seen.has(folded)) {
      counts.duplicate++;
      continue;
    }
    if (allowTexts.has(folded)) {
      counts.conflictSkipped++;
      continue;
    }
    const candidate = {
      id: ctx.uid(),
      text,
      enabled: item.enabled !== false,
      created: item.created || ctx.now,
      mode: item.mode === "contains" ? "contains" : "exact",
    };
    if (SS.estimatePhraseBytes(next.concat([candidate]), PHRASES_STORAGE_KEY) > limit) {
      counts.quotaSkipped++;
      continue;
    }
    next.push(candidate);
    seen.add(folded);
    counts.added++;
  }
  return { next, counts };
}

/* Exact-match string-list merge (whitelist / blocked authors). Mirrors the
 * current loops: item cap → validity-or-duplicate → raw push (no trim
 * normalization of the stored value — measured quirk, replicated), then
 * tail eviction under the byte budget. Eviction eats newly added entries
 * first (they sit at the tail); anything beyond that is existing data. */
function planExactStringList(existing, items, max, storageKey, quota) {
  const next = existing.slice();
  const counts = emptyCounts();
  for (const entry of items) {
    if (next.length >= max) {
      counts.quotaSkipped++;
      continue;
    }
    if (typeof entry !== "string" || !entry.trim()) {
      counts.invalid++;
      continue;
    }
    if (next.includes(entry)) {
      counts.duplicate++;
      continue;
    }
    next.push(entry);
    counts.added++;
  }
  const budget = safeByteLimit(quota);
  let evicted = 0;
  while (next.length > 0 && estimateListBytes(next, storageKey) > budget) {
    next.pop();
    evicted++;
  }
  const evictedExisting = Math.max(0, evicted - counts.added);
  counts.added = Math.max(0, counts.added - evicted);
  counts.evicted = evicted;
  counts.evictedExisting = evictedExisting;
  return { next, counts };
}

/* Never-hide (allow) phrase merge. Mirrors the options.js allow loop:
 * item cap → object validity → case-insensitive duplicate → push, then tail
 * eviction under the byte budget. blockTexts holds lowercased block-phrase
 * texts (existing + newly planned); incoming allow entries colliding with a
 * block rule are skipped with a reason instead of silently shadowing it. */
function planAllowPhrases(existing, items, ctx, blockTexts) {
  const next = existing.map((p) => ({ ...p }));
  const counts = { ...emptyCounts(), conflictSkipped: 0 };
  const seen = new Set(next.map((p) => String((p && p.text) || "").toLowerCase()));
  for (const entry of items) {
    if (next.length >= LIMITS.MAX_ALLOW_PHRASES) {
      counts.quotaSkipped++;
      continue;
    }
    if (
      !entry ||
      typeof entry.text !== "string" ||
      !entry.text.trim() ||
      entry.text.trim().length > LIMITS.MAX_PHRASE_LENGTH
    ) {
      counts.invalid++;
      continue;
    }
    const text = entry.text.trim();
    const folded = text.toLowerCase();
    if (seen.has(folded)) {
      counts.duplicate++;
      continue;
    }
    if (blockTexts.has(folded)) {
      counts.conflictSkipped++;
      continue;
    }
    next.push({ id: ctx.uid(), text, created: entry.created || ctx.now });
    seen.add(folded);
    counts.added++;
  }
  const budget = safeByteLimit(ctx.quota);
  let evicted = 0;
  while (next.length > 0 && estimateListBytes(next, STORAGE_KEYS.ALLOW_PHRASES) > budget) {
    next.pop();
    evicted++;
  }
  const evictedExisting = Math.max(0, evicted - counts.added);
  counts.added = Math.max(0, counts.added - evicted);
  counts.evicted = evicted;
  counts.evictedExisting = evictedExisting;
  return { next, counts };
}

/* Excluded ("Not spam") merge. Replicates the current two-phase shape:
 * raw-identity dedupe against existing, push, then normalize the whole list
 * (first-wins, existing entries first) and prune by bytes with the shared
 * pruner. Counting is done on effective post-normalize signatures, which
 * yields the same patch with truer counts (see design.md quirks). The
 * MAX_EXCLUDED_ITEMS gate replicates the current double-count
 * (next.length + added >= MAX) exactly. */
function planExcluded(existing, items, ctx) {
  const counts = { ...emptyCounts(), evictedExisting: 0 };
  const beforeSigs = new Set(
    Array.from(SS.normalizeExcludedEntries(existing, EXCLUDED_PREVIEW_LENGTH).keys())
  );
  const next = existing.map((e) => (e && typeof e === "object" ? { ...e } : e));
  const identities = new Set(next.map(excludedIdentity).filter((id) => id !== null));
  let pushed = 0;
  const pushedEntries = [];
  for (const entry of items) {
    const identity = excludedIdentity(entry);
    if (!identity) {
      counts.invalid++;
      continue;
    }
    /* Measured quirk (options.js:925): excluded.length already includes
     * pushed imports, so the headroom halves. Replicated, not fixed. */
    if (next.length + pushed >= LIMITS.MAX_EXCLUDED_ITEMS) {
      counts.quotaSkipped++;
      continue;
    }
    if (identities.has(identity)) {
      counts.duplicate++;
      continue;
    }
    identities.add(identity);
    next.push(entry && typeof entry === "object" ? { ...entry } : entry);
    pushedEntries.push(entry);
    pushed++;
  }
  const merged = SS.normalizeExcludedEntries(next, EXCLUDED_PREVIEW_LENGTH);
  const freshSigs = [];
  for (const [sig] of merged) {
    if (!beforeSigs.has(sig)) freshSigs.push(sig);
  }
  /* Entries the normalize step collapsed (plain-text import hashing to an
   * existing sig, empty strings, malformed objects that slipped the raw
   * gate) never occupy a slot: reclassify as duplicate/invalid. */
  const collapsed = pushed - freshSigs.length;
  for (let i = 0; i < collapsed; i++) {
    const entry = pushedEntries[pushed - 1 - i];
    if (effectiveExcludedSig(entry) === null) counts.invalid++;
    else counts.duplicate++;
  }
  const sizeBeforePrune = merged.size;
  void sizeBeforePrune;
  SS.pruneExcludedByBytes(merged, STORAGE_KEYS.EXCLUDED, safeByteLimit(ctx.quota));
  return { merged, freshSigs, counts, beforeSigs };
}

function planImport(snapshot, input, opts) {
  const options = opts || {};
  const ctx = {
    quota: options.quotaBytesPerItem || REAL_SYNC_QUOTA_BYTES_PER_ITEM,
    now: options.now !== undefined ? options.now : Date.now(),
    uid: options.uid || SS.uid,
    knownLangs:
      options.knownLangs || [...DEFAULT_ENABLED_LANGS],
    knownPatternIds: options.knownPatternIds || [],
  };
  const base = cloneSnapshot(snapshot);

  if (Array.isArray(input)) {
    if (input.length === 0) return rejected("empty-legacy", "Legacy array import is empty.");
    const allowTexts = new Set(
      base.allowPhrases.map((p) => String((p && p.text) || "").toLowerCase())
    );
    const { next, counts } = planBlockPhrases(base.phrases, input, ctx, allowTexts);
    const issues = [];
    if (counts.conflictSkipped > 0) {
      issues.push({
        code: "block-allow-conflict",
        detail: `${counts.conflictSkipped} incoming phrase(s) collide with never-hide text and were skipped; the allow rule stands.`,
      });
    }
    return {
      status: "ok",
      patch: { phrases: next },
      summary: { phrases: counts },
      issues,
    };
  }

  if (!input || typeof input !== "object" || !Array.isArray(input.phrases)) {
    return rejected("invalid-shape", "File is not a legacy phrase array or a versioned backup object.");
  }

  /* Deliberate change: the current importer ignores `version` entirely, so a
   * future v2 file would half-merge under v1 rules. The preview refuses to
   * plan unsupported versions. */
  if (input.version !== undefined && input.version !== 1) {
    return rejected(
      "unsupported-version",
      `Backup version ${JSON.stringify(input.version)} is not supported; only version 1 can be previewed.`
    );
  }

  const patch = {};
  const summary = {};
  const issues = [];

  const existingAllowTexts = new Set(
    base.allowPhrases.map((p) => String((p && p.text) || "").toLowerCase())
  );
  const phrasePlan = planBlockPhrases(base.phrases, input.phrases, ctx, existingAllowTexts);
  patch.phrases = phrasePlan.next;
  summary.phrases = phrasePlan.counts;
  if (phrasePlan.counts.conflictSkipped > 0) {
    issues.push({
      code: "block-allow-conflict",
      detail: `${phrasePlan.counts.conflictSkipped} incoming block phrase(s) collide with never-hide text and were skipped; the allow rule stands.`,
    });
  }
  const blockTexts = new Set([
    ...base.phrases.map((p) => String((p && p.text) || "").trim().toLowerCase()),
    ...phrasePlan.next
      .slice(base.phrases.length)
      .map((p) => String(p.text).toLowerCase()),
  ]);

  if (Array.isArray(input.whitelist)) {
    const plan = planExactStringList(
      base.whitelist,
      input.whitelist,
      LIMITS.MAX_WHITELIST,
      STORAGE_KEYS.WHITELIST,
      ctx.quota
    );
    patch.whitelist = plan.next;
    summary.whitelist = plan.counts;
  }

  if (Array.isArray(input.excluded)) {
    const plan = planExcluded(base.excluded, input.excluded, ctx);
    const survivingFresh = Array.from(plan.merged.keys()).filter((s) => !plan.beforeSigs.has(s));
    plan.counts.added = survivingFresh.length;
    plan.counts.evicted = Math.max(0, plan.freshSigs.length - survivingFresh.length);
    plan.counts.evictedExisting =
      plan.beforeSigs.size - Array.from(plan.merged.keys()).filter((s) => plan.beforeSigs.has(s)).length;
    patch.excluded = SS.serializeExcluded(plan.merged);
    summary.excluded = plan.counts;
    if (plan.counts.evictedExisting > 0) {
      issues.push({
        code: "byte-eviction-existing",
        detail: `${plan.counts.evictedExisting} existing exclusion(s) would be evicted to fit the sync byte budget.`,
      });
    }
  }

  if (Array.isArray(input.langs)) {
    const known = input.langs.filter(
      (code) => typeof code === "string" && ctx.knownLangs.includes(code)
    );
    const additions = [...new Set(known)].filter((code) => !base.langs.includes(code));
    patch.langs = base.langs.concat(additions);
    summary.langs = {
      from: base.langs.slice(),
      to: base.langs.concat(additions),
      added: additions.length,
      ignored: input.langs.length - new Set(known).size,
    };
  }

  if (Array.isArray(input.blockedAuthors)) {
    const plan = planExactStringList(
      base.blockedAuthors,
      input.blockedAuthors,
      LIMITS.MAX_BLOCKED_AUTHORS,
      STORAGE_KEYS.BLOCKED_AUTHORS,
      ctx.quota
    );
    patch.blockedAuthors = plan.next;
    summary.blockedAuthors = plan.counts;
  }

  if (Array.isArray(input.disabledPatterns)) {
    const knownIds = new Set(ctx.knownPatternIds);
    const next = base.disabledPatterns.slice();
    const counts = { added: 0, duplicate: 0, invalid: 0, quotaSkipped: 0, evicted: 0 };
    for (const id of input.disabledPatterns) {
      if (typeof id !== "string" || !knownIds.has(id)) {
        counts.invalid++;
        continue;
      }
      if (next.includes(id)) {
        counts.duplicate++;
        continue;
      }
      next.push(id);
      counts.added++;
    }
    patch.disabledPatterns = next;
    summary.disabledPatterns = counts;
  }

  if (Array.isArray(input.allowPhrases)) {
    const plan = planAllowPhrases(base.allowPhrases, input.allowPhrases, ctx, blockTexts);
    patch.allowPhrases = plan.next;
    summary.allowPhrases = plan.counts;
    if (plan.counts.conflictSkipped > 0) {
      issues.push({
        code: "block-allow-conflict",
        detail: `${plan.counts.conflictSkipped} incoming never-hide phrase(s) collide with a block phrase and were skipped; the block rule stands.`,
      });
    }
  }

  for (const key of ["hidePromoted", "hideFeatured"]) {
    if (typeof input[key] === "boolean") {
      patch[key] = input[key];
      summary[key] = { from: base[key], to: input[key], changed: base[key] !== input[key] };
    }
  }

  return { status: "ok", patch, summary, issues };
}

/* Maps planner patch categories to real storage keys for the one-write
 * Apply. Phrases live under PHRASES_STORAGE_KEY; the rest under
 * STORAGE_KEYS. */
const PATCH_KEY_MAP = {
  phrases: () => PHRASES_STORAGE_KEY,
  whitelist: () => STORAGE_KEYS.WHITELIST,
  excluded: () => STORAGE_KEYS.EXCLUDED,
  langs: () => STORAGE_KEYS.LANGS,
  blockedAuthors: () => STORAGE_KEYS.BLOCKED_AUTHORS,
  disabledPatterns: () => STORAGE_KEYS.DISABLED_PATTERNS,
  hidePromoted: () => STORAGE_KEYS.HIDE_PROMOTED,
  hideFeatured: () => STORAGE_KEYS.HIDE_FEATURED,
  allowPhrases: () => STORAGE_KEYS.ALLOW_PHRASES,
};

function patchToStorage(patch) {
  const out = {};
  for (const [category, value] of Object.entries(patch)) {
    if (PATCH_KEY_MAP[category]) out[PATCH_KEY_MAP[category]()] = value;
  }
  return out;
}

function snapshotsEqualForPatch(before, after, patch) {
  for (const category of Object.keys(patch)) {
    const a = before[category];
    const b = after[category];
    if (JSON.stringify(a === undefined ? null : a) !== JSON.stringify(b === undefined ? null : b)) {
      return false;
    }
  }
  return true;
}

/* Fake async storage adapter: solely to exercise the controller shape (no
 * writes on preview/cancel, one write on apply, stale re-preview, error
 * paths). Not a model of browser sync semantics. */
function createMemoryAdapter(initial, hooks) {
  const store = { ...(initial || {}) };
  const calls = { get: 0, set: 0 };
  const setBodies = [];
  const fail = (hooks && hooks.fail) || {};
  return {
    calls,
    setBodies,
    async getSnapshot() {
      calls.get++;
      if (fail.get) throw new Error(fail.get);
      return JSON.parse(JSON.stringify(store));
    },
    async set(values) {
      calls.set++;
      setBodies.push(JSON.parse(JSON.stringify(values)));
      if (fail.set) throw new Error(fail.set);
      Object.assign(store, JSON.parse(JSON.stringify(values)));
    },
    readRaw() {
      return JSON.parse(JSON.stringify(store));
    },
  };
}

async function previewImport(adapter, input, opts) {
  const snapshot = await adapter.getSnapshot();
  const plan = planImport(snapshot, input, opts);
  if (plan.status !== "ok") return { status: "rejected", plan, snapshot };
  return { status: "preview", plan, snapshot, input };
}

async function applyPlanned(adapter, pending, opts) {
  if (!pending || pending.status !== "preview") {
    return { status: "error", message: "No pending preview to apply." };
  }
  let current;
  try {
    current = await adapter.getSnapshot();
  } catch (error) {
    return { status: "error", message: `Re-read before apply failed: ${error.message}`, pending };
  }
  if (!snapshotsEqualForPatch(pending.snapshot, current, pending.plan.patch)) {
    const plan = planImport(current, pending.input, opts);
    return { status: "stale", message: "Settings changed since the preview; recomputed.", plan, snapshot: current, pending };
  }
  try {
    await adapter.set(patchToStorage(pending.plan.patch));
  } catch (error) {
    return { status: "error", message: `Apply write failed: ${error.message}`, pending };
  }
  return { status: "applied", appliedKeys: Object.keys(patchToStorage(pending.plan.patch)) };
}

function cancelPlanned() {
  return { status: "cancelled" };
}

module.exports = {
  planImport,
  previewImport,
  applyPlanned,
  cancelPlanned,
  createMemoryAdapter,
  patchToStorage,
  REAL_SYNC_QUOTA_BYTES_PER_ITEM,
};
