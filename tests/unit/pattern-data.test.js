#!/usr/bin/env node

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  escapeRegex,
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
