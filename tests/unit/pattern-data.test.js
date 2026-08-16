#!/usr/bin/env node

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  escapeRegex,
  buildPatterns,
  isLinkedInHost,
  parseAuthorId,
  hashString,
  getExcludedSignature,
  getLocalDayKey,
  estimateEntriesBytes,
  pruneExcludedByBytes,
  PATTERN_DATA,
  matchesLabel,
  PROMOTED_LABELS,
  FEATURED_LABELS,
} = require(path.join(__dirname, "..", "..", "shared", "pattern-data.js"));

test("escapeRegex escapes every regex-special character", () => {
  assert.equal(escapeRegex("a.b*c?d"), "a\\.b\\*c\\?d");
  assert.equal(escapeRegex("[hello]"), "\\[hello\\]");
  assert.equal(escapeRegex("plain text"), "plain text");
});

test("isLinkedInHost accepts the apex domain and subdomains", () => {
  assert.equal(isLinkedInHost("linkedin.com"), true);
  assert.equal(isLinkedInHost("www.linkedin.com"), true);
  assert.equal(isLinkedInHost("mobile.linkedin.com"), true);
});

test("isLinkedInHost rejects lookalike and unrelated hosts", () => {
  assert.equal(isLinkedInHost("linkedin.com.evil.com"), false);
  assert.equal(isLinkedInHost("notlinkedin.com"), false);
  assert.equal(isLinkedInHost("evil-linkedin.com"), false);
  assert.equal(isLinkedInHost("example.com"), false);
});

test("parseAuthorId extracts profile IDs from /in/ links", () => {
  assert.equal(parseAuthorId("/in/jane-doe/"), "jane-doe");
  assert.equal(parseAuthorId("https://www.linkedin.com/in/JaneDoe"), "janedoe");
});

test("parseAuthorId prefixes company/school/showcase IDs", () => {
  assert.equal(parseAuthorId("/company/acme-corp/"), "company:acme-corp");
  assert.equal(parseAuthorId("/school/example-university/"), "school:example-university");
  assert.equal(parseAuthorId("/showcase/acme-showcase/"), "showcase:acme-showcase");
});

test("parseAuthorId returns null for non-LinkedIn hosts, even with a matching path shape", () => {
  assert.equal(parseAuthorId("https://linkedin.com.evil.com/in/jane-doe"), null);
  assert.equal(parseAuthorId("https://evil.com/in/jane-doe"), null);
});

test("parseAuthorId returns null for unrecognized paths or missing href", () => {
  assert.equal(parseAuthorId(null), null);
  assert.equal(parseAuthorId(""), null);
  assert.equal(parseAuthorId("/feed/"), null);
});

test("parseAuthorId returns null for malformed percent-encoding", () => {
  assert.equal(parseAuthorId("/in/100%"), null);
  assert.equal(parseAuthorId("/in/%E0%A4%A"), null);
  assert.equal(parseAuthorId("https://www.linkedin.com/in/bad%"), null);
});

test("parseAuthorId still parses valid percent-encoded slugs", () => {
  assert.equal(parseAuthorId("/in/John%20Doe/"), "john doe");
});

test("hashString is deterministic for the same input", () => {
  assert.equal(hashString("hello world"), hashString("hello world"));
});

test("hashString produces different output for different input (no trivial collisions on close inputs)", () => {
  assert.notEqual(hashString("hello world"), hashString("hello worlds"));
  assert.notEqual(hashString("abc"), hashString("acb"));
});

test("getExcludedSignature normalizes case and whitespace before hashing", () => {
  const a = getExcludedSignature("Comment CLAUDE and I'll send it");
  const b = getExcludedSignature("comment   claude   and i'll send it");
  assert.equal(a, b);
});

test("getExcludedSignature is prefixed with sig: and differs for different text", () => {
  const sig = getExcludedSignature("some post text");
  assert.match(sig, /^sig:/);
  assert.notEqual(sig, getExcludedSignature("different post text"));
});

/* NOTE: ES-1's leading alternation (comenta|escribe|responde|pon|poner)
   is bounded with a word boundary plus an optional clitic
   (me|te|le|nos|os|les), so non-imperative forms like "comentaba ..."
   no longer match via prefix while real imperative+clitic bait
   ("comentame ...") still does. EN/FR/PT/DE keep their pre-existing
   stem-prefix matching behavior intentionally (out of scope). */
test("ES-1 matches the previously-dead accented verb forms", () => {
  assert.equal(PATTERN_DATA.ES[0].regex.test("comenta CLAUDE y te envío el PDF completo gratis"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comenta CLAUDE y te enviaré el PDF completo gratis"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comenta CLAUDE y te daré el acceso"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comenta CLAUDE y te envía el PDF completo gratis"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comenta CLAUDE y te comparto el PDF completo gratis"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comenta CLAUDE y te mando el PDF completo gratis"), true);
});

test("ES-1 still rejects non-bait sentences", () => {
  assert.equal(PATTERN_DATA.ES[0].regex.test("comentamos en el post nuestra opinión"), false);
  assert.equal(PATTERN_DATA.ES[0].regex.test("enviaréis las tareas mañana"), false);
  assert.equal(PATTERN_DATA.ES[0].regex.test("te envían documentos por interno"), false);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comentaba CLAUDE y te envío el PDF"), false);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comentamos CLAUDE y te envío el PDF"), false);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comentario CLAUDE y te envío el PDF"), false);
});

test("ES-1 accepts imperative+clitic forms (comentame, escribele, ponme, respondeles, comentanos)", () => {
  assert.equal(PATTERN_DATA.ES[0].regex.test("comentame CLAUDE y te mando el PDF"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("escribele CLAUDE y te doy el pack"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("ponme CLAUDE y te regalo el curso"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("respondeles CLAUDE y te comparto el PDF"), true);
  assert.equal(PATTERN_DATA.ES[0].regex.test("comentanos CLAUDE y te envío el PDF"), true);
});

test("ES-2 is bound like ES-1", () => {
  assert.equal(PATTERN_DATA.ES[1].regex.test("comenta CLAUDE para recibir el PDF"), true);
  assert.equal(PATTERN_DATA.ES[1].regex.test("comentaba CLAUDE para recibir el PDF"), false);
});

test("FR-1 matches natural French bait with and without object pronouns", () => {
  assert.equal(PATTERN_DATA.FR[0].regex.test("commentez COURAGE et j'enverrai le PDF complet"), true);
  assert.equal(PATTERN_DATA.FR[0].regex.test("commentez COURAGE et je partage le guide gratuit"), true);
  assert.equal(PATTERN_DATA.FR[0].regex.test("commentez COURAGE et je vous enverrai le PDF"), true);
  assert.equal(PATTERN_DATA.FR[0].regex.test("commentez COURAGE et je te partage le guide"), true);
});

test("FR-1 still rejects non-bait French sentences", () => {
  assert.equal(PATTERN_DATA.FR[0].regex.test("je commente un article hier"), false);
  assert.equal(PATTERN_DATA.FR[0].regex.test("nous commentons votre post"), false);
});

test("FR-2 matches pour / afin d' + infinitive separated by a space", () => {
  assert.equal(PATTERN_DATA.FR[1].regex.test("commentez MOT pour recevoir le guide gratuit"), true);
  assert.equal(PATTERN_DATA.FR[1].regex.test("ecrivez MOT pour obtenir le pack complet"), true);
  assert.equal(PATTERN_DATA.FR[1].regex.test("reponds MOT afin d'obtenir le pack complet"), true);
});

test("FR-2 still rejects non-bait French sentences mentioning pour", () => {
  assert.equal(PATTERN_DATA.FR[1].regex.test("je commente ton post pour dire que je suis d'accord"), false);
  assert.equal(PATTERN_DATA.FR[1].regex.test("commentez MOT pour notre communauté"), false);
});

test("PT-1 matches enviarei and near-future vou forms", () => {
  assert.equal(PATTERN_DATA.PT[0].regex.test("comente PDF e eu enviarei o link completo"), true);
  assert.equal(PATTERN_DATA.PT[0].regex.test("comente PDF e eu vou enviar o link completo"), true);
  assert.equal(PATTERN_DATA.PT[0].regex.test("comente PDF e eu vou te mandar o link"), true);
});

test("PT-1 still rejects non-bait Portuguese sentences", () => {
  assert.equal(PATTERN_DATA.PT[0].regex.test("eu comentei no post ontem"), false);
  assert.equal(PATTERN_DATA.PT[0].regex.test("comentamos seu artigo ontem"), false);
});

test("PT-2 matches para receber / e receber bait", () => {
  assert.equal(PATTERN_DATA.PT[1].regex.test("comente MOT para receber o e-book"), true);
  assert.equal(PATTERN_DATA.PT[1].regex.test("comente MOT e receber o link"), true);
});

test("PT-2 still rejects non-bait Portuguese sentences", () => {
  assert.equal(PATTERN_DATA.PT[1].regex.test("comentamos para receber respostas"), false);
});

test("DE-1 matches und ich schicke / teile bait", () => {
  assert.equal(PATTERN_DATA.DE[0].regex.test("kommentiere PACK und ich schicke dir die Vorlage"), true);
  assert.equal(PATTERN_DATA.DE[0].regex.test("schreib MOT und ich teile die Datei"), true);
});

test("DE-1 still rejects non-bait German sentences", () => {
  assert.equal(PATTERN_DATA.DE[0].regex.test("ich kommentierte den Beitrag gestern"), false);
});

test("DE-2 matches um / damit bait", () => {
  assert.equal(PATTERN_DATA.DE[1].regex.test("kommentiere MOT um Zugriff zu bekommen"), true);
  assert.equal(PATTERN_DATA.DE[1].regex.test("antworte MOT damit kostenlos schicke ich dir die Vorlage"), true);
});

test("DE-2 still rejects non-bait German sentences", () => {
  assert.equal(PATTERN_DATA.DE[1].regex.test("der Kommentar war zu lang"), false);
});

test("matchesLabel matches each promoted label exactly, one per language", () => {
  for (const label of ["Promoted", "Patrocinado", "Promu", "Promovido", "Beworben"]) {
    assert.equal(matchesLabel(label, PROMOTED_LABELS), true, `expected "${label}" to match`);
  }
});

test("matchesLabel matches each featured label exactly, one per language", () => {
  for (const label of ["Featured", "Destacados", "En vedette", "Em destaque", "Ausgewählt"]) {
    assert.equal(matchesLabel(label, FEATURED_LABELS), true, `expected "${label}" to match`);
  }
});

test("matchesLabel matches a label followed by the · separator", () => {
  assert.equal(matchesLabel("Promoted · Acme Corp", PROMOTED_LABELS), true);
  assert.equal(matchesLabel("Featured · Something", FEATURED_LABELS), true);
});

test("matchesLabel is case-insensitive", () => {
  assert.equal(matchesLabel("promoted", PROMOTED_LABELS), true);
  assert.equal(matchesLabel("FEATURED", FEATURED_LABELS), true);
});

test("matchesLabel rejects text that merely discusses labels", () => {
  assert.equal(matchesLabel("How I promoted my business last week", PROMOTED_LABELS), false);
  assert.equal(matchesLabel("", PROMOTED_LABELS), false);
  assert.equal(matchesLabel("promoted posts are annoying", PROMOTED_LABELS), false);
  assert.equal(matchesLabel("Featured by the CEO", FEATURED_LABELS), false);
});

/* getLocalDayKey must return the LOCAL calendar date, not the UTC one:
   the popup's "today" and 7-day stats and content.js's daily counters
   agree on the day boundary via this shared helper. Constructing dates
   with local-time components keeps the assertions timezone-independent. */
test("getLocalDayKey returns the local calendar date", () => {
  assert.equal(getLocalDayKey(new Date(2026, 0, 15, 23, 30)), "2026-01-15");
  assert.equal(getLocalDayKey(new Date(2026, 0, 16, 0, 30)), "2026-01-16");
});

test("getLocalDayKey zero-pads month and day", () => {
  assert.equal(getLocalDayKey(new Date(2026, 2, 5, 12, 0)), "2026-03-05");
  assert.equal(getLocalDayKey(new Date(2026, 10, 25, 12, 0)), "2026-11-25");
});

test("getLocalDayKey defaults to now and produces a parseable key", () => {
  const key = getLocalDayKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(`${key}T00:00:00`)));
});

/* Exclusion eviction policy (plan 022): pruneExcludedByBytes picks its
   victim by tier first — preview-less entries (already-unrecoverable
   legacy hashes) evict before preview-ful ones, regardless of created —
   then by oldest `created` (nulls sort as 0). A prior packed score of
   `(preview ? 1e12 : 0) + created` inverted once Date.now() passed 1e12
   (year ~2001), dropping recoverable preview entries ahead of cryptic
   hash-only ones; the budget below (full size minus one byte) evicts
   exactly one entry so the victim choice is observable. */
test("preview-less entries evict before preview-ful entries, even with recent created timestamps", () => {
  const now = Date.now();
  const map = new Map([
    ["sig:with-preview", { preview: "Comment CLAUDE and I'll send it", created: null }],
    ["sig:cryptic-hash", { preview: null, created: now }],
  ]);
  pruneExcludedByBytes(map, "ss_excluded", estimateEntriesBytes(map, "ss_excluded") - 1);
  assert.deepEqual([...map.keys()], ["sig:with-preview"]);
});

test("preview-less ties break by oldest created first", () => {
  const now = Date.now();
  const map = new Map([
    ["sig:older", { preview: null, created: now - 10_000 }],
    ["sig:newer", { preview: null, created: now }],
  ]);
  pruneExcludedByBytes(map, "ss_excluded", estimateEntriesBytes(map, "ss_excluded") - 1);
  assert.deepEqual([...map.keys()], ["sig:newer"]);
});

test("the loop stops exactly at the byte budget", () => {
  const entries = [0, 1, 2, 3, 4].map((i) => [`sig:${i}`, { preview: null, created: i }]);
  const map = new Map(entries);
  const survivors = new Map(entries.slice(2));
  const budget = estimateEntriesBytes(survivors, "ss_excluded");
  pruneExcludedByBytes(map, "ss_excluded", budget);
  assert.deepEqual([...map.keys()], ["sig:2", "sig:3", "sig:4"]);
  assert.ok(estimateEntriesBytes(map, "ss_excluded") <= budget);
});

test("estimateEntriesBytes counts key length plus serialized entries", () => {
  const map = new Map([["sig:abc", { preview: "hello", created: 123 }]]);
  assert.equal(estimateEntriesBytes(map, "ss_excluded"), 62);
});

/* buildPatterns assembly branches (plan 034). `[]` langs means no
   built-ins, isolating the custom-phrase branches; EN/ES ids exercise the
   built-in filtering branches against the current pattern data. */
test("buildPatterns exact-mode adds \\b anchors on both sides", () => {
  const [entry] = buildPatterns([{ text: "hello", enabled: true }], [], new Set(), 120);
  assert.equal(entry.regex.source, "\\bhello\\b");
  assert.equal(entry.regex.flags, "i");
  assert.equal(entry.label, "hello");
  assert.equal(entry.source, "custom");
  assert.equal(entry.regex.test("say hello now"), true);
  assert.equal(entry.regex.test("hello!"), true);
  assert.equal(entry.regex.test("xhellox"), false);
});

test("buildPatterns gates \\b anchors on word characters (punctuation-safe)", () => {
  const trailingPunct = buildPatterns([{ text: "hello?", enabled: true }], [], new Set(), 120)[0];
  assert.equal(trailingPunct.regex.source, "\\bhello\\?");
  assert.equal(trailingPunct.regex.test("ask hello? now"), true);
  assert.equal(trailingPunct.regex.test("hello?x"), true);

  /* " hello" trims to "hello" (leading \b returns); a non-word first
     char like "?" is what actually suppresses the leading anchor. */
  const leadingPunct = buildPatterns([{ text: "?hello", enabled: true }], [], new Set(), 120)[0];
  assert.equal(leadingPunct.regex.source, "\\?hello\\b");

  const bothWords = buildPatterns([{ text: "hello world", enabled: true }], [], new Set(), 120)[0];
  assert.equal(bothWords.regex.source, "\\bhello world\\b");
});

test("buildPatterns contains-mode builds an unanchored escaped regex", () => {
  const [entry] = buildPatterns([{ mode: "contains", text: "a.b", enabled: true }], [], new Set(), 120);
  assert.equal(entry.regex.source, "a\\.b");
  assert.equal(entry.regex.flags, "i");
  assert.equal(entry.regex.test("xa.bz"), true);
  assert.equal(entry.regex.test("axb"), false);
});

test("buildPatterns drops phrases over maxPhraseLength and empty/whitespace ones", () => {
  const longPhrase = "x".repeat(121);
  const dropped = buildPatterns(
    [{ text: longPhrase, enabled: true }, { text: "", enabled: true }, { text: "   ", enabled: true }, { text: "ok", enabled: false }],
    [],
    new Set(),
    120
  );
  assert.equal(dropped.length, 0);

  const kept = buildPatterns(
    [{ text: "x".repeat(120), enabled: true }, { text: "fine", enabled: true }],
    [],
    new Set(),
    120
  );
  assert.deepEqual(kept.map((e) => e.label), ["x".repeat(120), "fine"]);
});

test("buildPatterns skips disabled built-in pattern ids", () => {
  const result = buildPatterns([], ["EN"], new Set(["EN-1"]), 120);
  assert.deepEqual(result.map((e) => e.id), ["EN-2"]);
});

test("buildPatterns includes only built-ins for enabled languages", () => {
  const result = buildPatterns([], ["ES"], new Set(), 120);
  assert.deepEqual(result.map((e) => e.id), ["ES-1", "ES-2"]);
  assert.equal(result.every((e) => e.source === "builtin"), true);
});

test("buildPatterns orders custom phrases before built-ins (attribution wins)", () => {
  const result = buildPatterns([{ text: "and I'll send", enabled: true }], ["EN"], new Set(), 120);
  assert.equal(result[0].source, "custom");
  assert.equal(result[1].id, "EN-1");
  const text = "comment CLAUDE and I'll send you the PDF";
  assert.equal(result[0].regex.test(text), true);
  assert.equal(result[1].regex.test(text), true);
});

test("buildPatterns escapes regex metacharacters in custom phrases", () => {
  const [entry] = buildPatterns([{ text: "a.b*c", enabled: true }], [], new Set(), 120);
  assert.equal(entry.regex.source, "\\ba\\.b\\*c\\b");
  assert.equal(entry.regex.test("value a.b*c here"), true);
  assert.equal(entry.regex.test("xa.b*cy"), false);
});
