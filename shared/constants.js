(function (global) {
  "use strict";

  /** Custom-phrases storage key (kept in sync with its consumers). @type {string} */
  const PHRASES_STORAGE_KEY = "ss_phrases";

  /**
   * Every storage key used by the extension, frozen. All keys are
   * ss_-prefixed.
   * @type {Record<string, string>}
   */
  const STORAGE_KEYS = Object.freeze({
    ENABLED: "ss_enabled",
    COUNT: "ss_blocked_count",
    ONBOARDED: "ss_onboarded",
    DAILY_COUNTS: "ss_daily_counts",
    SNOOZE_UNTIL: "ss_snooze_until",
    EXCLUDED: "ss_excluded",
    LANGS: "ss_enabled_langs",
    WHITELIST: "ss_whitelist",
    BLOCKED_AUTHORS: "ss_blocked_authors",
    DISABLED_PATTERNS: "ss_disabled_patterns",
    HIDE_PROMOTED: "ss_hide_promoted",
    HIDE_FEATURED: "ss_hide_featured",
    /* Spike 043: suggestion loop persistence (storage.local, ephemeral). */
    PENDING_SUGGESTIONS: "ss_pending_suggestions",
    DISMISSED_SUGGESTIONS: "ss_dismissed_suggestions",
  });

  /**
   * Hard caps for user data and runtime limits.
   * @typedef {Object} SSLimits
   * @property {number} MAX_CUSTOM_PHRASES
   * @property {number} MAX_PHRASE_LENGTH
   * @property {number} MAX_WHITELIST
   * @property {number} MAX_BLOCKED_AUTHORS
   * @property {number} MAX_IMPORT_BYTES
   * @property {number} SNOOZE_DURATION_MS
   * @property {number} MAX_EXCLUDED_ITEMS
   */
  /** @type {SSLimits} */
  const LIMITS = Object.freeze({
    MAX_CUSTOM_PHRASES: 200,
    MAX_PHRASE_LENGTH: 120,
    MAX_WHITELIST: 100,
    MAX_BLOCKED_AUTHORS: 100,
    MAX_IMPORT_BYTES: 128 * 1024,
    SNOOZE_DURATION_MS: 30 * 60 * 1000,
    /* Generous safety cap for merging imported exclusions: chrome.storage.sync
       allows at most MAX_ITEMS (512) values per key. ss_excluded is pruned by
       byte budget (plan 007), not item count, so this only bounds memory/sync
       limits — it is not a product cap. */
    MAX_EXCLUDED_ITEMS: 512,
  });

  /** Languages enabled by default (built-in pattern coverage). @type {readonly string[]} */
  const DEFAULT_ENABLED_LANGS = Object.freeze(["EN", "ES", "FR", "PT", "DE"]);

  global.SS_CONSTANTS = Object.freeze({
    PHRASES_STORAGE_KEY,
    STORAGE_KEYS,
    LIMITS,
    DEFAULT_ENABLED_LANGS,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.SS_CONSTANTS;
  }
})(typeof self !== "undefined" ? self : globalThis);
