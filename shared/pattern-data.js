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
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:et\s+(?:je\s+|j'|je\s+vais\s+))?(?:enverrai|envoie|partage|donne|donnerai|envoie le|partage le)\b/i,
        label: 'commentez "WORD" et j\'enverrai / je partage ...',
      }),
      Object.freeze({
        id: "FR-2",
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:pour|afin\s+d')(?:recevoir|obtenir|acceder|avoir|telecharger)\b/i,
        label: 'commentez "WORD" pour recevoir / télécharger ...',
      }),
    ]),
    PT: Object.freeze([
      Object.freeze({
        id: "PT-1",
        regex: /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:e\s+(?:eu\s+|vou\s+)?)(?:enviarei|envio|compartilho|mando|mandei|dou|darei|envio o|compartilho o)\b/i,
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
        return pattern.prefix + decodeURIComponent(match[1].toLowerCase());
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
   * the same serialization shape as content.js's write path.
   * @param {Map<string, {preview: (string|null), created: (number|null)}>} map
   * @param {string} storageKey
   * @returns {number}
   */
  function estimateEntriesBytes(map, storageKey) {
    return storageKey.length + JSON.stringify(Array.from(map, ([sig, meta]) => ({
      sig,
      preview: meta.preview,
      created: meta.created,
    }))).length;
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
      let victimSig = null;
      let victimScore = Infinity;
      for (const [sig, meta] of map) {
        /* 1e12 — sort-priority constant, exact and well below 2^53: makes
           preview-less entries evict first regardless of created time. */
        const score = (meta.preview ? 1e12 : 0) + (meta.created || 0);
        if (score < victimScore) {
          victimScore = score;
          victimSig = sig;
        }
      }
      if (victimSig === null) break;
      map.delete(victimSig);
    }
  }

  root.SS_PATTERN_DATA = PATTERN_DATA;
  root.SS_PROMOTED_LABELS = PROMOTED_LABELS;
  root.SS_FEATURED_LABELS = FEATURED_LABELS;
  root.SS_matchesLabel = matchesLabel;
  root.SS_escapeRegex = escapeRegex;
  root.SS_isLinkedInHost = isLinkedInHost;
  root.SS_parseAuthorId = parseAuthorId;
  root.SS_hashString = hashString;
  root.SS_getExcludedSignature = getExcludedSignature;
  root.SS_getLocalDayKey = getLocalDayKey;
  root.SS_createCooldownStore = createCooldownStore;
  root.SS_estimateEntriesBytes = estimateEntriesBytes;
  root.SS_pruneExcludedByBytes = pruneExcludedByBytes;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PATTERN_DATA,
      PROMOTED_LABELS,
      FEATURED_LABELS,
      matchesLabel,
      escapeRegex,
      isLinkedInHost,
      parseAuthorId,
      hashString,
      getExcludedSignature,
      getLocalDayKey,
      createCooldownStore,
      estimateEntriesBytes,
      pruneExcludedByBytes,
    };
  }
})(typeof self !== "undefined" ? self : globalThis);
