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
