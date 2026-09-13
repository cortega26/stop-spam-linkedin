(function (root) {
  "use strict";

  /* Single source of truth for built-in spam-detection patterns.
     content.js derives BASE_PATTERNS (regexes, used for matching) and
     options.js derives BUILTIN (labels, used for display) from this file —
     see their respective usages. Regex text below must stay byte-for-byte
     identical to what content.js used before this file existed; this is a
     data move, not a detection-behavior change.

     Each entry carries a stable `id` (language-prefixed, 1-indexed) so
     users can disable individual patterns (stored in ss_disabled_patterns)
     without relying on fragile array-index identity. ANY future pattern
     added here MUST get a new id following this scheme (e.g. "EN-3"); ids
     must never be reused or renumbered while a pattern keeps its language. */
  /**
   * Built-in spam-detection patterns keyed by language code. Each entry
   * carries a stable, language-prefixed id.
   * @type {Record<string, ReadonlyArray<{ id: string; regex: RegExp; label: string }>>}
   */
  const PATTERN_DATA = Object.freeze({
    EN: Object.freeze([
      Object.freeze({
        id: "EN-1",
        regex: /(?:comment|type|write|reply|drop)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:and|to)\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message|get|receive|send you|share the|give you)\b/i,
        label: 'comment "WORD" and I\'ll send / share ...',
      }),
      Object.freeze({
        id: "EN-2",
        regex: /[`'""«»\u201c\u201d\u201e]\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]\s+and\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message)\b/i,
        label: '"WORD" and I will send ...',
      }),
    ]),
    ES: Object.freeze([
      Object.freeze({
        id: "ES-1",
        regex: /(?:comenta|escribe|responde|pon|poner)(?:me|te|le|nos|os|les)?\b\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:y\s+(?:te\s+|le\s+|me\s+)?)(?:env\u00ed[oa]|enviar\u00e9|comparto|mando|dar\u00e9|doy|regalo)(?!\w)/i,
        label: 'comenta "WORD" y te enviaré / comparto ...',
      }),
      Object.freeze({
        id: "ES-2",
        regex: /(?:comenta|escribe|responde|pon|poner)(?:me|te|le|nos|os|les)?\b\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:para|y)\s+(?:recibir|obtener|acceder|descargar)\b/i,
        label: 'comenta "WORD" para recibir / descargar ...',
      }),
    ]),
    FR: Object.freeze([
      Object.freeze({
        id: "FR-1",
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:et\s+(?:je\s+(?:te\s+|vous\s+|le\s+|la\s+|les\s+|nous\s+|vais\s+)?|j'\s?))?(?:enverrai|envoie|partage|donne|donnerai|envoie le|partage le)\b/i,
        label: 'commentez "WORD" et j\'enverrai / je partage ...',
      }),
      Object.freeze({
        id: "FR-2",
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:pour\s+|afin\s+d')(?:recevoir|obtenir|acceder|avoir|telecharger)\b/i,
        label: 'commentez "WORD" pour recevoir / télécharger ...',
      }),
    ]),
    PT: Object.freeze([
      Object.freeze({
        id: "PT-1",
        regex: /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:e\s+(?:eu\s+|vou\s+)?)(?:enviarei|envio|compartilho|mando|mandei|dou|darei|envio o|compartilho o|vou\s+enviar|vou\s+te\s+mandar|vou\s+mandar)\b/i,
        label: 'comente "WORD" e enviarei / compartilho ...',
      }),
      Object.freeze({
        id: "PT-2",
        regex: /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:para|e)\s+(?:receber|obter|acessar|baixar|pegar)\b/i,
        label: 'comente "WORD" para receber / baixar ...',
      }),
    ]),
    DE: Object.freeze([
      Object.freeze({
        id: "DE-1",
        regex: /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:und\s+(?:ich\s+)?)(?:schicke|sende|teile|gebe|schick dir|send dir)\b/i,
        label: 'kommentiere "WORD" und ich schicke / teile ...',
      }),
      Object.freeze({
        id: "DE-2",
        regex: /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:um\s+|damit\s+)(?:zugriff|zu\s+bekommen|zu\s+erhalten|kostenlos)\b/i,
        label: 'kommentiere "WORD" um zu bekommen / erhalten ...',
      }),
    ]),
  });

  /**
   * Escapes regex metacharacters so a string can be used literally inside
   * a RegExp.
   * @param {string} str Input string.
   * @returns {string} String with regex metacharacters escaped.
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* Built-in match-list entries carry the display label (blocked-post
     attribution), the stable id (per-pattern disable), and
     source: "builtin"; custom phrase entries carry source: "custom". */
  /**
   * Assembles the effective pattern list from enabled built-ins and
   * custom phrases. Custom phrases first (they win attribution); built-ins
   * filtered by enabled languages and disabled pattern ids.
   * @param {Array<{text: string, enabled?: boolean, mode?: string}>} phrases
   * @param {readonly string[]} langs Enabled language codes.
   * @param {ReadonlySet<string>} disabledPatterns Pattern ids disabled by the user.
   * @param {number} maxPhraseLength Phrase length cap (LIMITS.MAX_PHRASE_LENGTH).
   * @returns {Array<{regex: RegExp, label: string, source: string}>}
   */
  function buildPatterns(phrases, langs, disabledPatterns, maxPhraseLength) {
    const builtin = [];
    /* langs is always a non-empty array: content.js's call sites pass the
       live enabledLangs list (never falsy). */
    for (const lang of langs) {
      if (PATTERN_DATA[lang]) {
        for (const entry of PATTERN_DATA[lang]) {
          if (disabledPatterns.has(entry.id)) continue;
          builtin.push({
            regex: entry.regex,
            label: entry.label,
            source: "builtin",
            id: entry.id,
          });
        }
      }
    }
    const custom = (phrases || [])
      .filter((p) => (
        p &&
        p.enabled &&
        typeof p.text === "string" &&
        p.text.trim().length > 0 &&
        p.text.trim().length <= maxPhraseLength
      ))
      .map((p) => {
        const text = p.text.trim();
        const escaped = escapeRegex(text);
        if (p.mode === "contains") {
          return { regex: new RegExp(escaped, "i"), label: text, source: "custom" };
        }
        /* Only add \b anchors when adjacent char is a word character.
           Prevents silent non-matching phrases like "hello?" where \b
           after ? can never be true (non-word → end = no boundary). */
        const start = /^\w/.test(text) ? "\\b" : "";
        const end = /\w$/.test(text) ? "\\b" : "";
        return { regex: new RegExp(start + escaped + end, "i"), label: text, source: "custom" };
      });
    /* Custom phrases first: when a text matches both a built-in pattern
       and an enabled custom phrase, the first matching entry is the one
       attributed (and gates the trigger-word suggestion). Custom-first
       reproduces the original semantics — any custom phrase covering the
       text wins over the generic built-in label. */
    return [...custom, ...builtin];
  }

  /**
   * Compiles allow-phrases ("never hide a post containing this text") into
   * case-insensitive substring matchers. Allow-phrases have no exact mode
   * by design: a pardon should be forgiving (plan 056 Decision 2).
   * @param {Array<{text: string}>} allowPhrases
   * @param {number} maxPhraseLength Phrase length cap (LIMITS.MAX_PHRASE_LENGTH).
   * @returns {Array<{regex: RegExp, text: string}>}
   */
  function buildAllowMatcher(allowPhrases, maxPhraseLength) {
    return (allowPhrases || [])
      .filter((p) => (
        p &&
        typeof p.text === "string" &&
        p.text.trim().length > 0 &&
        p.text.trim().length <= maxPhraseLength
      ))
      .map((p) => {
        const text = p.text.trim();
        return { regex: new RegExp(escapeRegex(text), "i"), text };
      });
  }

  /**
   * True when hostname is linkedin.com or a subdomain of it.
   * @param {string} hostname Hostname without protocol.
   * @returns {boolean}
   */
  function isLinkedInHost(hostname) {
    return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  }

  /* baseOrigin defaults to a real LinkedIn origin so relative hrefs like
     "/in/someone" resolve correctly even when window.location isn't
     available (e.g. under Node in a unit test). Callers running inside the
     actual content script should pass window.location.origin explicitly to
     preserve the original behavior exactly. */
  /**
   * Parses a LinkedIn identity URL (profile, company, school, showcase)
   * into a stable author id — lowercased, prefixed for non-profile types —
   * or null when the href isn't a LinkedIn identity URL.
   * @param {string} href Absolute or relative href from an author anchor.
   * @param {string} [baseOrigin] Origin used to resolve relative hrefs.
   * @returns {string | null}
   */
  function parseAuthorId(href, baseOrigin) {
    if (!href) return null;

    const patterns = [
      { re: /^\/in\/([^/?#]+)/, prefix: "" },
      { re: /^\/company\/([^/?#]+)/, prefix: "company:" },
      { re: /^\/school\/([^/?#]+)/, prefix: "school:" },
      { re: /^\/showcase\/([^/?#]+)/, prefix: "showcase:" },
    ];

    let url;
    try {
      url = new URL(href, baseOrigin || "https://www.linkedin.com");
    } catch (_) {
      return null;
    }
    if (!isLinkedInHost(url.hostname)) return null;

    for (const pattern of patterns) {
      const match = url.pathname.match(pattern.re);
      if (match) {
        try {
          return pattern.prefix + decodeURIComponent(match[1].toLowerCase());
        } catch (_) {
          return null;
        }
      }
    }

    return null;
  }

  /**
   * FNV-1a hash of a string, rendered as base-36.
   * @param {string} value Input string.
   * @returns {string}
   */
  function hashString(value) {
    /* FNV-1a offset basis and prime. Decimal forms of 0x811c9dc5 and
       0x01000193. These MUST NEVER change: exclusion signatures are
       persisted hashes — changing them would invalidate every user's
       stored "Not spam" exclusions. */
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  /**
   * Normalized signature for the excluded-item list: lowercased,
   * whitespace-collapsed, then hashed with a "sig:" prefix.
   * @param {string} text
   * @returns {string}
   */
  function getExcludedSignature(text) {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    return "sig:" + hashString(normalized);
  }

  /* Label texts LinkedIn shows on sponsored posts / the profile Featured
     section, in the extension's 5 supported UI languages. Exact-match
     checking keeps false positives near zero (a post DISCUSSING promotion
     won't match). */
  /** @type {readonly string[]} */
  const PROMOTED_LABELS = Object.freeze(["Promoted", "Patrocinado", "Promu", "Promovido", "Beworben"]);
  /** @type {readonly string[]} */
  const FEATURED_LABELS = Object.freeze(["Featured", "Destacados", "En vedette", "Em destaque", "Ausgewählt"]);

  /* True when text is one of the labels, possibly followed by a " · "
     separator (LinkedIn renders "Promoted · Sponsor Name" as one element). */
  /**
   * Exact-match check of text against a list of labels, tolerating a
   * " · " separator and trailing sponsor text.
   * @param {string} text Text to check.
   * @param {readonly string[]} labels Label list to match against.
   * @returns {boolean}
   */
  function matchesLabel(text, labels) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    for (const label of labels) {
      const l = label.toLowerCase();
      if (lower === l) return true;
      if (lower.startsWith(l + " ·")) return true;
    }
    return false;
  }

  /**
   * Calendar date key (YYYY-MM-DD) for a date in the *local* timezone.
   * The popup's "today"/7-day stats and content.js's daily counters must
   * agree on the day boundary; using toISOString() (UTC) made "today"
   * reset at UTC midnight for everyone else.
   * @param {Date} [date] Date to key; defaults to now.
   * @returns {string}
   */
  function getLocalDayKey(date) {
    const d = date || new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }

  /* Map-based cooldown store keyed by string identity (e.g. a post's
     data-id). Entries expire after expiryMs; `has` is false for expired
     keys. Evicts oldest entries past maxEntries to bound memory. */
  /**
   * Creates a bounded, expiring key store.
   * @param {number} expiryMs Entry lifetime in milliseconds.
   * @param {number} maxEntries Upper bound on the number of stored keys.
   * @returns {{ has(key: string): boolean; set(key: string): void }}
   */
  function createCooldownStore(expiryMs, maxEntries) {
    const map = new Map();
    return {
      has(key) {
        const expiry = map.get(key);
        if (expiry === undefined) return false;
        if (Date.now() >= expiry) {
          map.delete(key);
          return false;
        }
        return true;
      },
      set(key) {
        /* Re-insert refreshes so eviction (keys().next()) drops the key
           with the shortest remaining lifetime, not the longest. */
        if (map.has(key)) map.delete(key);
        map.set(key, Date.now() + expiryMs);
        while (map.size > maxEntries) {
          const oldest = map.keys().next().value;
          map.delete(oldest);
        }
      },
    };
  }

  /* Exclusion-map byte accounting and eviction (plan 022). Entries are
     { sig, preview, created } objects keyed by signature; the entry shape
     MUST stay in sync with content.js's normalizeExcludedEntries, which
     lives in a different file since this logic was extracted. */
  /**
   * Serialized byte size of an exclusion map plus its storage key, using
   * the same serialization shape as the content.js "Not spam" write path.
   * Counts UTF-8 bytes (TextEncoder), matching the phrase-quota math in
   * estimatePhraseBytes — never UTF-16 string length, which undercounts
   * non-ASCII text.
   * @param {Map<string, {preview: (string|null), created: (number|null)}>} map
   * @param {string} storageKey
   * @returns {number}
   */
  function estimateEntriesBytes(map, storageKey) {
    const serialized = JSON.stringify(Array.from(map, ([sig, meta]) => ({
      sig,
      preview: meta.preview,
      created: meta.created,
    })));
    return storageKey.length + new TextEncoder().encode(serialized).length;
  }

  /**
   * Evicts entries from an exclusion map until its estimated bytes fit
   * under safeByteLimit. Mutates the map in place. The victim policy is
   * documented in content.js's "Not spam" flow: preview-less entries
   * (already-unrecoverable legacy hashes) evict before preview-ful ones,
   * ties broken by oldest `created` (nulls sort first — treat as
   * "oldest").
   * @param {Map<string, {preview: (string|null), created: (number|null)}>} map
   * @param {string} storageKey
   * @param {number} safeByteLimit
   */
  function pruneExcludedByBytes(map, storageKey, safeByteLimit) {
    while (map.size > 0 && estimateEntriesBytes(map, storageKey) > safeByteLimit) {
      /* Victim selection is a two-key comparison that the current epoch
         cannot defeat: preview-less entries always sort before
         preview-ful ones (tier 0 < tier 1), and ties break by oldest
         `created` (nulls sort as 0 — treat as "oldest"). The previous
         packed score (a constant of order 1 trillion plus created)
         inverted once Date.now() passed that constant (~2001), silently
         evicting recoverable preview entries ahead of cryptic hash-only
         ones. */
      let victimSig = null;
      let victimTier = Infinity;
      let victimCreated = Infinity;
      for (const [sig, meta] of map) {
        const tier = meta.preview ? 1 : 0;
        const created = meta.created || 0;
        if (tier < victimTier || (tier === victimTier && created < victimCreated)) {
          victimTier = tier;
          victimCreated = created;
          victimSig = sig;
        }
      }
      if (victimSig === null) break;
      map.delete(victimSig);
    }
  }

  /* Shared pure UI/storage helpers (plan 048). content.js, popup.js and
     options.js load this module first (manifest content_scripts[] order
     and <script> tags), so the copies they each carried now live here.
     background.js intentionally keeps its own copies — see AGENTS.md. */

  /**
   * Localized message lookup with key fallback.
   * @param {string} key i18n message key.
   * @param {any} [substitutions] Substitutions for the message.
   * @returns {string}
   */
  function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  /**
   * Random id, falling back when crypto.randomUUID is unavailable.
   * @returns {string}
   */
  function uid() {
    try {
      return crypto.randomUUID();
    } catch (_) {
      return (
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 9)
      );
    }
  }

  /**
   * Serialized byte size of a custom-phrase list plus its storage key,
   * counted as UTF-8 bytes for the storage.sync per-item quota check.
   * @param {Array<{text: string, enabled?: boolean, mode?: string}>} phrases
   * @param {string} storageKey
   * @returns {number}
   */
  function estimatePhraseBytes(phrases, storageKey) {
    const bytes = new TextEncoder().encode(JSON.stringify(phrases)).length;
    return storageKey.length + bytes;
  }

  /**
   * Trims text for the exclusion-list preview, appending "…" when cut.
   * @param {any} text Input text.
   * @param {number} maxLen Maximum length before truncation.
   * @returns {string}
   */
  function truncateForPreview(text, maxLen) {
    const trimmed = String(text).trim();
    if (trimmed.length <= maxLen) return trimmed;
    return trimmed.slice(0, maxLen) + "…";
  }

  /**
   * Normalizes stored exclusion entries into a signature-keyed map,
   * accepting the legacy bare-"sig:"-string and plain-text shapes as well
   * as the current { sig, preview, created } object shape.
   * @param {Array<any>} entries Raw stored entries.
   * @param {number} previewLength Preview length for plain-text entries.
   * @returns {Map<string, {preview: (string|null), created: (number|null)}>}
   */
  function normalizeExcludedEntries(entries, previewLength) {
    const map = new Map();
    for (const entry of entries || []) {
      if (typeof entry === "string" && entry.trim()) {
        if (entry.startsWith("sig:")) {
          if (!map.has(entry)) {
            map.set(entry, { preview: null, created: null });
          }
        } else {
          const sig = getExcludedSignature(entry);
          if (!map.has(sig)) {
            map.set(sig, {
              preview: truncateForPreview(entry, previewLength),
              created: null,
            });
          }
        }
      } else if (entry && typeof entry === "object" &&
                 typeof entry.sig === "string" && entry.sig.startsWith("sig:")) {
        if (!map.has(entry.sig)) {
          const preview = typeof entry.preview === "string" && entry.preview.trim()
            ? entry.preview
            : null;
          const created = typeof entry.created === "number" ? entry.created : null;
          map.set(entry.sig, { preview, created });
        }
      }
    }
    return map;
  }

  /**
   * Serializes an exclusion map to the stored [{ sig, preview, created }]
   * array shape.
   * @param {Map<string, {preview: (string|null), created: (number|null)}>} map
   * @returns {Array<{sig: string, preview: (string|null), created: (number|null)}>}
   */
  function serializeExcluded(map) {
    return Array.from(map, ([sig, meta]) => ({
      sig,
      preview: meta.preview,
      created: meta.created,
    }));
  }

  /**
   * Sanitizer for the persisted pending-suggestion queue (plan 054):
   * drops entries that are not { word, timestamp } objects with a
   * non-empty word string within maxWordLength, keeps order, and re-caps
   * to the maxItems most recent — matching the runtime FIFO shift that
   * evicts the oldest when the in-memory queue exceeds the cap.
   * @param {Array<any>} entries Raw stored entries.
   * @param {number} maxWordLength Maximum accepted word length.
   * @param {number} maxItems Maximum queue length.
   * @returns {Array<{word: string, timestamp: number}>}
   */
  function normalizePendingSuggestions(entries, maxWordLength, maxItems) {
    const out = [];
    for (const entry of entries || []) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof entry.word === "string" &&
        entry.word.trim() !== "" &&
        entry.word.length <= maxWordLength &&
        typeof entry.timestamp === "number"
      ) {
        out.push({ word: entry.word, timestamp: entry.timestamp });
      }
    }
    return out.slice(-maxItems);
  }

  /**
   * Sanitizer for the persisted dismissed-suggestion list (plan 054):
   * keeps only non-empty string words within maxWordLength. The list is
   * intentionally uncapped — dismissals are permanent, and words are
   * tiny against the storage.local quota.
   * @param {Array<any>} entries Raw stored entries.
   * @param {number} maxWordLength Maximum accepted word length.
   * @returns {Array<string>}
   */
  function normalizeDismissedSuggestions(entries, maxWordLength) {
    const out = [];
    for (const entry of entries || []) {
      if (typeof entry === "string" && entry.trim() !== "" && entry.length <= maxWordLength) {
        out.push(entry);
      }
    }
    return out;
  }

  /**
   * Trailing-edge debounce: invokes fn ms after the last call.
   * @param {(...args: any[]) => void} fn Function to debounce.
   * @param {number} ms Delay in milliseconds.
   * @returns {(...args: any[]) => void}
   */
  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /**
   * Reads a runtime counter that migrated from storage.sync to
   * storage.local: local wins when present, then sync, then fallback.
   * @param {{ [key: string]: any }} localResult storage.local result.
   * @param {{ [key: string]: any }} syncResult storage.sync result.
   * @param {string} key Storage key.
   * @param {any} fallback Default when neither area has the key.
   * @returns {any}
   */
  function readRuntimeValue(localResult, syncResult, key, fallback) {
    if (localResult[key] !== undefined) return localResult[key];
    if (syncResult[key] !== undefined) return syncResult[key];
    return fallback;
  }

  root.SS_PATTERN_DATA = PATTERN_DATA;
  root.SS_PROMOTED_LABELS = PROMOTED_LABELS;
  root.SS_FEATURED_LABELS = FEATURED_LABELS;
  root.SS_matchesLabel = matchesLabel;
  root.SS_escapeRegex = escapeRegex;
  root.SS_buildPatterns = buildPatterns;
  root.SS_buildAllowMatcher = buildAllowMatcher;
  root.SS_isLinkedInHost = isLinkedInHost;
  root.SS_parseAuthorId = parseAuthorId;
  root.SS_hashString = hashString;
  root.SS_getExcludedSignature = getExcludedSignature;
  root.SS_getLocalDayKey = getLocalDayKey;
  root.SS_createCooldownStore = createCooldownStore;
  root.SS_estimateEntriesBytes = estimateEntriesBytes;
  root.SS_pruneExcludedByBytes = pruneExcludedByBytes;
  root.SS_t = t;
  root.SS_uid = uid;
  root.SS_estimatePhraseBytes = estimatePhraseBytes;
  root.SS_truncateForPreview = truncateForPreview;
  root.SS_normalizeExcludedEntries = normalizeExcludedEntries;
  root.SS_serializeExcluded = serializeExcluded;
  root.SS_normalizePendingSuggestions = normalizePendingSuggestions;
  root.SS_normalizeDismissedSuggestions = normalizeDismissedSuggestions;
  root.SS_debounce = debounce;
  root.SS_readRuntimeValue = readRuntimeValue;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PATTERN_DATA,
      PROMOTED_LABELS,
      FEATURED_LABELS,
      matchesLabel,
      escapeRegex,
      buildPatterns,
      buildAllowMatcher,
      isLinkedInHost,
      parseAuthorId,
      hashString,
      getExcludedSignature,
      getLocalDayKey,
      createCooldownStore,
      estimateEntriesBytes,
      pruneExcludedByBytes,
      t,
      uid,
      estimatePhraseBytes,
      truncateForPreview,
      normalizeExcludedEntries,
      serializeExcluded,
      normalizePendingSuggestions,
      normalizeDismissedSuggestions,
      debounce,
      readRuntimeValue,
    };
  }
})(typeof self !== "undefined" ? self : globalThis);
