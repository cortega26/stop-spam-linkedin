"use strict";

/* Plan 066 research prototype tests — NOT shipped. Evidence for the design
 * verdict, not proof of production integration. Run with:
 *   node --test plans/research/066/prototype.test.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { serializeSelected, importPack } = require("./prototype.cjs");
const CASES = require("./cases.json");

const NOW = 1770000000000;
const PAYLOAD_KEYS = ["enabled", "mode", "text"];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

test("cases.json: every case serializes to its expected pack", () => {
  assert.ok(CASES.length >= 7, `expected >= 7 cases, got ${CASES.length}`);
  for (const c of CASES) {
    assert.deepEqual(serializeSelected(c.phrases, c.selectedIds), c.expected, `${c.name}: pack`);
  }
});

test("output key set on every entry is exactly text/mode/enabled", () => {
  for (const c of CASES) {
    for (const entry of serializeSelected(c.phrases, c.selectedIds)) {
      assert.deepEqual([...Object.keys(entry)].sort(), PAYLOAD_KEYS, `${c.name}: keys`);
      assert.equal(typeof entry.text, "string");
      assert.ok(entry.mode === "exact" || entry.mode === "contains", `${c.name}: mode`);
      assert.equal(typeof entry.enabled, "boolean");
    }
  }
});

test("serializer does not mutate frozen inputs and has no side effects", () => {
  for (const c of CASES) {
    const phrases = deepFreeze(JSON.parse(JSON.stringify(c.phrases)));
    const selected = deepFreeze([...c.selectedIds]);
    const before = JSON.stringify({ phrases, selected });
    const out = serializeSelected(phrases, selected);
    assert.equal(JSON.stringify({ phrases, selected }), before, `${c.name}: inputs unchanged`);
    for (const entry of out) {
      assert.ok(!Object.isFrozen(entry), `${c.name}: output must be fresh mutable objects`);
    }
    assert.deepEqual(out, c.expected, `${c.name}: pack from frozen inputs`);
  }
});

test("poisoned source metadata never leaves the profile", () => {
  const phrases = [
    {
      id: "p1",
      text: "good rule",
      enabled: true,
      created: 111,
      mode: "contains",
      authorId: "ac:secret",
      history: ["edited"],
      patternStats: { hits: 9 },
      blockedAuthors: ["bob"],
      whitelist: ["alice"],
      excluded: [{ sig: "sig:x" }],
      allowPhrases: [{ text: "kind words" }],
      suggestion: "buy followers",
    },
  ];
  const [entry] = serializeSelected(phrases, ["p1"]);
  assert.deepEqual(entry, { text: "good rule", mode: "contains", enabled: true });
  assert.ok(!("id" in entry || "created" in entry || "authorId" in entry));
  assert.equal(JSON.stringify(entry).includes("secret"), false);
});

test("output follows stored-list order regardless of selection order", () => {
  const phrases = [
    { id: "a", text: "alpha", enabled: true, created: 1, mode: "exact" },
    { id: "b", text: "beta", enabled: true, created: 2, mode: "exact" },
    { id: "c", text: "gamma", enabled: true, created: 3, mode: "exact" },
  ];
  const pack = serializeSelected(phrases, ["c", "a"]);
  assert.deepEqual(pack.map((e) => e.text), ["alpha", "gamma"]);
});

test("selectedIds accepts a Set; empty selection exports an empty pack", () => {
  const phrases = [{ id: "a", text: "alpha", enabled: true, created: 1, mode: "exact" }];
  assert.deepEqual(serializeSelected(phrases, new Set(["a"])), [
    { text: "alpha", mode: "exact", enabled: true },
  ]);
  assert.deepEqual(serializeSelected(phrases, []), []);
  assert.deepEqual(serializeSelected(phrases, new Set()), []);
});

test("round-trip: pack imports into a fresh profile preserving text, mode, and disabled state", () => {
  let n = 0;
  const uid = () => `uid-${++n}`;
  for (const c of CASES) {
    const pack = serializeSelected(c.phrases, c.selectedIds);
    n = 0;
    const { next, valid, skipped } = importPack([], pack, { now: NOW, uid });
    assert.equal(valid, pack.length, `${c.name}: all pack entries import`);
    assert.equal(skipped, 0, `${c.name}: no skips on fresh profile`);
    assert.deepEqual(
      next.map((p) => ({ text: p.text, mode: p.mode, enabled: p.enabled })),
      pack,
      `${c.name}: semantics survive the legacy import`
    );
  }
});

test("round-trip: re-importing a pack is a duplicate no-op, like the real importer", () => {
  const pack = serializeSelected(CASES[3].phrases, CASES[3].selectedIds);
  let n = 0;
  const first = importPack([], pack, { now: NOW, uid: () => `uid-${++n}` });
  const second = importPack(first.next, pack, { now: NOW, uid: () => `uid-${++n}` });
  assert.equal(second.valid, 0);
  assert.equal(second.skipped, pack.length);
  assert.deepEqual(second.next, first.next);
});

test("legacy import contract: pack entries behave like characterized 065 inputs", () => {
  let n = 0;
  const uid = () => `uid-${++n}`;
  // Bare { text } entries default to enabled + exact, matching the 065 legacy-add-mixed case.
  const { next } = importPack([], [{ text: " Alpha " }, { text: "Beta", enabled: false, mode: "contains" }], {
    now: NOW,
    uid,
  });
  assert.deepEqual(
    next.map((p) => ({ text: p.text, mode: p.mode, enabled: p.enabled })),
    [
      { text: "Alpha", mode: "exact", enabled: true },
      { text: "Beta", mode: "contains", enabled: false },
    ]
  );
  // Empty packs are rejected by the UI layer (importFileEmpty); the pure
  // loop stays total and reports nothing to do.
  const empty = importPack([], [], { now: NOW, uid });
  assert.deepEqual([empty.valid, empty.skipped, empty.next], [0, 0, []]);
});
