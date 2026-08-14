(function (root) {
  "use strict";

  /* Single source of truth for built-in spam-detection patterns.
     content.js derives BASE_PATTERNS (regexes, used for matching) and
     options.js derives BUILTIN (labels, used for display) from this file —
     see their respective usages. Regex text below must stay byte-for-byte
     identical to what content.js used before this file existed; this is a
     data move, not a detection-behavior change. */
  const PATTERN_DATA = Object.freeze({
    EN: Object.freeze([
      Object.freeze({
        regex: /(?:comment|type|write|reply|drop)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:and|to)\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message|get|receive|send you|share the|give you)\b/i,
        label: 'comment "WORD" and I\'ll send / share ...',
      }),
      Object.freeze({
        regex: /[`'""«»\u201c\u201d\u201e]\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]\s+and\s+(?:i'? ?ll|i will)\s+(?:send|share|give|dm|message)\b/i,
        label: '"WORD" and I will send ...',
      }),
    ]),
    ES: Object.freeze([
      Object.freeze({
        regex: /(?:comenta|escribe|responde|pon|poner)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:y\s+(?:te\s+|le\s+|me\s+)?)(?:env\u00ed|enviar\u00e9|comparto|mando|dar\u00e9|doy|regalo)\b/i,
        label: 'comenta "WORD" y te enviaré / comparto ...',
      }),
      Object.freeze({
        regex: /(?:comenta|escribe|responde|pon|poner)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:para|y)\s+(?:recibir|obtener|acceder|descargar)\b/i,
        label: 'comenta "WORD" para recibir / descargar ...',
      }),
    ]),
    FR: Object.freeze([
      Object.freeze({
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:et\s+(?:je\s+|j'|je\s+vais\s+))?(?:enverrai|envoie|partage|donne|donnerai|envoie le|partage le)\b/i,
        label: 'commentez "WORD" et j\'enverrai / je partage ...',
      }),
      Object.freeze({
        regex: /(?:commentez|commente|ecrivez|ecris|reponds|tape|tapez)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:pour|afin\s+d')(?:recevoir|obtenir|acceder|avoir|telecharger)\b/i,
        label: 'commentez "WORD" pour recevoir / télécharger ...',
      }),
    ]),
    PT: Object.freeze([
      Object.freeze({
        regex: /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:e\s+(?:eu\s+|vou\s+)?)(?:enviarei|envio|compartilho|mando|mandei|dou|darei|envio o|compartilho o)\b/i,
        label: 'comente "WORD" e enviarei / compartilho ...',
      }),
      Object.freeze({
        regex: /(?:comente|escreva|responda|digite|coloca)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:para|e)\s+(?:receber|obter|acessar|baixar|pegar)\b/i,
        label: 'comente "WORD" para receber / baixar ...',
      }),
    ]),
    DE: Object.freeze([
      Object.freeze({
        regex: /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:und\s+(?:ich\s+)?)(?:schicke|sende|teile|gebe|schick dir|send dir)\b/i,
        label: 'kommentiere "WORD" und ich schicke / teile ...',
      }),
      Object.freeze({
        regex: /(?:kommentiere|schreib|schreibe|tippe|antworte|gib)\s*[`'""«»\u201c\u201d\u201e]?\w+(?:\s+\w+)?[`'""\u00bb\u201d\u201e]?\s+(?:um\s+|damit\s+)(?:zugriff|zu\s+bekommen|zu\s+erhalten|kostenlos)\b/i,
        label: 'kommentiere "WORD" um zu bekommen / erhalten ...',
      }),
    ]),
  });

  root.SS_PATTERN_DATA = PATTERN_DATA;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PATTERN_DATA };
  }
})(typeof self !== "undefined" ? self : globalThis);
