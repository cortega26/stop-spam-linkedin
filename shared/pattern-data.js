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

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isLinkedInHost(hostname) {
    return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  }

  /* baseOrigin defaults to a real LinkedIn origin so relative hrefs like
     "/in/someone" resolve correctly even when window.location isn't
     available (e.g. under Node in a unit test). Callers running inside the
     actual content script should pass window.location.origin explicitly to
     preserve the original behavior exactly. */
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

  function hashString(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function getExcludedSignature(text) {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    return "sig:" + hashString(normalized);
  }

  /* Map-based cooldown store keyed by string identity (e.g. a post's
     data-id). Entries expire after expiryMs; `has` is false for expired
     keys. Evicts oldest entries past maxEntries to bound memory. */
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

  root.SS_PATTERN_DATA = PATTERN_DATA;
  root.SS_escapeRegex = escapeRegex;
  root.SS_isLinkedInHost = isLinkedInHost;
  root.SS_parseAuthorId = parseAuthorId;
  root.SS_hashString = hashString;
  root.SS_getExcludedSignature = getExcludedSignature;
  root.SS_createCooldownStore = createCooldownStore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PATTERN_DATA,
      escapeRegex,
      isLinkedInHost,
      parseAuthorId,
      hashString,
      getExcludedSignature,
      createCooldownStore,
    };
  }
})(typeof self !== "undefined" ? self : globalThis);
