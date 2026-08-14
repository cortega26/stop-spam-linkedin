(function (global) {
  "use strict";

  const PHRASES_STORAGE_KEY = "ss_phrases";

  const STORAGE_KEYS = Object.freeze({
    ENABLED: "ss_enabled",
    COUNT: "ss_blocked_count",
    ONBOARDED: "ss_onboarded",
    DAILY_COUNTS: "ss_daily_counts",
    SNOOZE_UNTIL: "ss_snooze_until",
    EXCLUDED: "ss_excluded",
    LANGS: "ss_enabled_langs",
    WHITELIST: "ss_whitelist",
  });

  const LIMITS = Object.freeze({
    MAX_CUSTOM_PHRASES: 200,
    MAX_PHRASE_LENGTH: 120,
    MAX_WHITELIST: 100,
    MAX_IMPORT_BYTES: 128 * 1024,
    SNOOZE_DURATION_MS: 30 * 60 * 1000,
    /* Generous safety cap for merging imported exclusions: chrome.storage.sync
       allows at most MAX_ITEMS (512) values per key. ss_excluded is pruned by
       byte budget (plan 007), not item count, so this only bounds memory/sync
       limits — it is not a product cap. */
    MAX_EXCLUDED_ITEMS: 512,
  });

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
