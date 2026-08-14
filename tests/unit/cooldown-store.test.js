#!/usr/bin/env node

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { createCooldownStore } = require(path.join(__dirname, "..", "..", "shared", "pattern-data.js"));

test("has returns false for an unknown key", () => {
  const store = createCooldownStore(1000, 10);
  assert.equal(store.has("urn:li:activity:never-set"), false);
});

test("has returns true immediately after set", () => {
  const store = createCooldownStore(1000, 10);
  store.set("urn:li:activity:spam-1");
  assert.equal(store.has("urn:li:activity:spam-1"), true);
});

test("has returns false after the entry expires", async () => {
  const store = createCooldownStore(20, 10);
  store.set("urn:li:activity:spam-1");
  assert.equal(store.has("urn:li:activity:spam-1"), true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(store.has("urn:li:activity:spam-1"), false);
});

test("evicts the oldest entries past maxEntries", () => {
  const store = createCooldownStore(1000, 3);
  store.set("urn:li:activity:one");
  store.set("urn:li:activity:two");
  store.set("urn:li:activity:three");
  store.set("urn:li:activity:four");
  assert.equal(store.has("urn:li:activity:one"), false);
  assert.equal(store.has("urn:li:activity:four"), true);
});

test("set on an existing key refreshes its expiry", () => {
  const store = createCooldownStore(1000, 10);
  store.set("urn:li:activity:spam-1");
  store.set("urn:li:activity:spam-1");
  assert.equal(store.has("urn:li:activity:spam-1"), true);
});
