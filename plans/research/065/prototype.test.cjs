"use strict";

/* Plan 065 research prototype tests — NOT shipped. Evidence for the design
 * verdict, not proof of production integration. Run with:
 *   node --test plans/research/065/prototype.test.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  planImport,
  previewImport,
  applyPlanned,
  cancelPlanned,
  createMemoryAdapter,
  patchToStorage,
} = require("./prototype.cjs");
const CASES = require("./cases.json");

const NOW = 1770000000000;
const KNOWN_PATTERN_IDS = [
  "EN-1", "EN-2", "ES-1", "ES-2", "FR-1", "FR-2",
  "PT-1", "PT-2", "DE-1", "DE-2",
];

function testOpts(caseDef, uidFn) {
  return {
    uid: uidFn,
    now: NOW,
    knownPatternIds: KNOWN_PATTERN_IDS,
    quotaBytesPerItem: (caseDef.opts && caseDef.opts.quotaBytesPerItem) || 8192,
  };
}

function emptySnapshot() {
  return {
    phrases: [],
    whitelist: [],
    excluded: [],
    langs: ["EN"],
    blockedAuthors: [],
    disabledPatterns: [],
    hidePromoted: false,
    hideFeatured: false,
    allowPhrases: [],
  };
}

test("cases.json: every case plans to its expected patch and summary", () => {
  assert.ok(CASES.length >= 12, `expected >= 12 cases, got ${CASES.length}`);
  for (const c of CASES) {
    let n = 0;
    const plan = planImport(c.before, c.input, testOpts(c, () => `uid-${++n}`));
    if (c.expectedSummary.status === "rejected") {
      assert.equal(plan.status, "rejected", `${c.name}: expected rejection`);
      assert.deepEqual(plan.patch, {}, `${c.name}: rejected patch must be empty`);
      assert.deepEqual(plan.summary, c.expectedSummary, `${c.name}: summary`);
      continue;
    }
    assert.equal(plan.status, "ok", `${c.name}: expected ok, got ${JSON.stringify(plan.summary)}`);
    assert.deepEqual(plan.patch, c.expectedPatch, `${c.name}: patch`);
    assert.deepEqual(plan.summary, c.expectedSummary, `${c.name}: summary`);
  }
});

test("conflict case surfaces two block-allow issues with reasons", () => {
  const c = CASES.find((x) => x.name === "block-allow-conflict-skipped");
  let n = 0;
  const plan = planImport(c.before, c.input, testOpts(c, () => `uid-${++n}`));
  assert.equal(plan.issues.length, 2);
  for (const issue of plan.issues) assert.equal(issue.code, "block-allow-conflict");
});

test("planner does not mutate snapshot or input", () => {
  const snapshot = {
    phrases: [{ id: "p0", text: "Keep", enabled: true, created: 1, mode: "exact" }],
    whitelist: ["zon"],
    excluded: [{ sig: "sig:k", preview: "K", created: 2 }],
    langs: ["EN"],
    blockedAuthors: [],
    disabledPatterns: [],
    hidePromoted: false,
    hideFeatured: false,
    allowPhrases: [{ id: "a0", text: "Nice", created: 3 }],
  };
  const input = {
    version: 1,
    phrases: [{ text: "New" }],
    whitelist: ["amy"],
    excluded: [{ sig: "sig:n", preview: "N", created: 4 }],
    langs: ["EN", "ES"],
    blockedAuthors: ["b"],
    disabledPatterns: ["EN-2"],
    hidePromoted: true,
    hideFeatured: false,
    allowPhrases: [{ text: "Calm" }],
  };
  const frozenSnapshot = structuredClone(snapshot);
  const frozenInput = structuredClone(input);
  deepFreeze(snapshot);
  deepFreeze(input);
  let n = 0;
  const plan = planImport(snapshot, input, testOpts({}, () => `uid-${++n}`));
  assert.equal(plan.status, "ok");
  assert.deepEqual(snapshot, frozenSnapshot, "snapshot mutated");
  assert.deepEqual(input, frozenInput, "input mutated");
});

test("deduplication is stable: same input plans identically twice", () => {
  const input = {
    version: 1,
    phrases: [{ text: "Dup" }, { text: "dup " }, { text: "Fresh" }],
    allowPhrases: [{ text: "Calm" }, { text: "calm" }],
  };
  const run = () => {
    let n = 0;
    return planImport(emptySnapshot(), input, testOpts({}, () => `uid-${++n}`));
  };
  assert.deepEqual(run().patch, run().patch);
});

test("multibyte quota uses UTF-8 bytes, not UTF-16 length", () => {
  /* "é".repeat(100) + "z".repeat(100) fit in 270 UTF-16 units but need 319
   * UTF-8 bytes; the planner must evict the tail entry. */
  let n = 0;
  const plan = planImport(
    emptySnapshot(),
    { version: 1, phrases: [], whitelist: ["é".repeat(100), "z".repeat(100)] },
    testOpts({ opts: { quotaBytesPerItem: 300 } }, () => `uid-${++n}`)
  );
  assert.equal(plan.status, "ok");
  assert.deepEqual(plan.patch.whitelist, ["é".repeat(100)]);
  assert.equal(plan.summary.whitelist.evicted, 1);
});

test("invalid file shapes are rejected without a patch", () => {
  for (const input of [null, 42, "nope", true, { foo: 1 }, { version: 1 }]) {
    const plan = planImport(emptySnapshot(), input, testOpts({}, () => "uid-x"));
    assert.equal(plan.status, "rejected", `expected rejection for ${JSON.stringify(input)}`);
    assert.deepEqual(plan.patch, {});
  }
});

test("versionless object still plans (old-export compatibility); v2 is refused", () => {
  let n = 0;
  const legacy = planImport(
    emptySnapshot(),
    { phrases: [{ text: "Old" }] },
    testOpts({}, () => `uid-${++n}`)
  );
  assert.equal(legacy.status, "ok");
  assert.equal(legacy.patch.phrases.length, 1);
  const future = planImport(
    emptySnapshot(),
    { version: 99, phrases: [{ text: "New" }] },
    testOpts({}, () => "uid-x")
  );
  assert.equal(future.status, "rejected");
  assert.equal(future.summary.reason, "unsupported-version");
});

test("missing fields are untouched; empty arrays change nothing", () => {
  const before = {
    ...emptySnapshot(),
    whitelist: ["keep-me"],
    hidePromoted: true,
  };
  let n = 0;
  const plan = planImport(
    before,
    { version: 1, exportedAt: NOW, phrases: [] },
    testOpts({}, () => `uid-${++n}`)
  );
  assert.equal(plan.status, "ok");
  assert.deepEqual(Object.keys(plan.patch), ["phrases"]);
  assert.deepEqual(plan.patch.phrases, []);
});

test("boolean and language overrides are explicit transitions", () => {
  let n = 0;
  const plan = planImport(
    { ...emptySnapshot(), langs: ["EN"], hidePromoted: true },
    { version: 1, phrases: [], langs: ["EN", "DE"], hidePromoted: false },
    testOpts({}, () => `uid-${++n}`)
  );
  assert.deepEqual(plan.summary.langs, { from: ["EN"], to: ["EN", "DE"], added: 1, ignored: 0 });
  assert.deepEqual(plan.summary.hidePromoted, { from: true, to: false, changed: true });
});

test("measured quirk: excluded item-cap double-counts (256, not 512, per import)", () => {
  const items = Array.from({ length: 300 }, (_, i) => ({
    sig: `sig:bulk-${String(i).padStart(3, "0")}`,
    preview: `p-${i}`,
    created: i,
  }));
  const plan = planImport(
    emptySnapshot(),
    { version: 1, phrases: [], excluded: items },
    testOpts({ opts: { quotaBytesPerItem: 200000 } }, () => "uid-x")
  );
  assert.equal(plan.summary.excluded.added, 256);
  assert.equal(plan.summary.excluded.quotaSkipped, 44);
});

test("measured quirk: whitelist push keeps the raw untrimmed value", () => {
  const plan = planImport(
    emptySnapshot(),
    { version: 1, phrases: [], whitelist: ["  spaced  "] },
    testOpts({}, () => "uid-x")
  );
  assert.deepEqual(plan.patch.whitelist, ["  spaced  "]);
});

test("controller: preview and cancel write nothing; apply writes once", async () => {
  const adapter = createMemoryAdapter({
    phrases: [],
    whitelist: [],
    excluded: [],
    langs: ["EN"],
    blockedAuthors: [],
    disabledPatterns: [],
    hidePromoted: false,
    hideFeatured: false,
    allowPhrases: [],
  });
  let n = 0;
  const opts = testOpts({}, () => `uid-${++n}`);
  const input = {
    version: 1,
    phrases: [{ text: "P1" }],
    whitelist: ["amy"],
    hidePromoted: true,
  };
  const pending = await previewImport(adapter, input, opts);
  assert.equal(pending.status, "preview");
  assert.equal(adapter.calls.set, 0, "preview must not write");

  assert.deepEqual(cancelPlanned(), { status: "cancelled" });
  assert.equal(adapter.calls.set, 0, "cancel must not write");

  const result = await applyPlanned(adapter, pending, opts);
  assert.equal(result.status, "applied");
  assert.equal(adapter.calls.set, 1, "apply must attempt exactly one write");
  const written = adapter.setBodies[0];
  assert.deepEqual(
    Object.keys(written).sort(),
    ["ss_hide_promoted", "ss_phrases", "ss_whitelist"].sort(),
    "one sync.set call must carry every touched key"
  );
  assert.deepEqual(patchToStorage(pending.plan.patch), written);
  const raw = adapter.readRaw();
  assert.equal(raw.ss_phrases.length, 1);
  assert.deepEqual(raw.ss_whitelist, ["amy"]);
  assert.equal(raw.ss_hide_promoted, true);
});

test("controller: changed snapshot invalidates the preview and recomputes", async () => {
  const adapter = createMemoryAdapter({ phrases: [], whitelist: [] });
  let n = 0;
  const opts = testOpts({}, () => `uid-${++n}`);
  const pending = await previewImport(adapter, { version: 1, phrases: [{ text: "P1" }] }, opts);
  assert.equal(pending.status, "preview");
  await adapter.set({ phrases: [{ id: "ext", text: "P1", enabled: true, created: 1, mode: "exact" }] });
  const setsBefore = adapter.calls.set;
  const result = await applyPlanned(adapter, pending, opts);
  assert.equal(result.status, "stale");
  assert.equal(result.plan.summary.phrases.duplicate, 1, "recomputed plan sees the new entry");
  assert.equal(adapter.calls.set, setsBefore, "stale apply must not write");
});

test("controller: no success is reported on read or write errors", async () => {
  const readFail = createMemoryAdapter({}, { fail: { get: "boom-read" } });
  let readError = null;
  try {
    await previewImport(readFail, { version: 1, phrases: [] }, testOpts({}, () => "uid-x"));
  } catch (error) {
    readError = error;
  }
  assert.ok(readError, "preview read failure must surface, not resolve");

  const writeFail = createMemoryAdapter({ phrases: [] }, { fail: { set: "boom-write" } });
  const pending = await previewImport(writeFail, { version: 1, phrases: [{ text: "P1" }] }, testOpts({}, () => "uid-1"));
  assert.equal(pending.status, "preview");
  const result = await applyPlanned(writeFail, pending, testOpts({}, () => "uid-1"));
  assert.equal(result.status, "error");
  assert.ok(pending, "pending preview is retained for recovery after a write error");

  const rereadFail = createMemoryAdapter({ phrases: [] }, {});
  const pending2 = await previewImport(rereadFail, { version: 1, phrases: [{ text: "P1" }] }, testOpts({}, () => "uid-1"));
  rereadFail.getSnapshot = async () => {
    throw new Error("boom-reread");
  };
  const result2 = await applyPlanned(rereadFail, pending2, testOpts({}, () => "uid-1"));
  assert.equal(result2.status, "error");
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}
