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
  PATTERN_DATA,
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
