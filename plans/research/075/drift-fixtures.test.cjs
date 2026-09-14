#!/usr/bin/env node

/* Plan 075 DOM-realism probe (NOT SHIPPED).
 *
 * Feeds synthetic mock pages through the REAL container resolver
 * (shared/post-container.js) and pipes the resulting counts into the
 * health-probe.cjs tripwire: the current-mock shape must resolve (reset
 * path — stays silent) while a restructured-markup variant must fail
 * resolution on every bait node (streak path — fires exactly once).
 *
 * Provenance: fully synthetic fixtures (no live LinkedIn DOM, no
 * account, jsdom only) — they pin the tripwire's wiring to the real
 * strategies, not real-world detection accuracy.
 *
 * Thresholds below are copied from content.js:10-21 (CONFIG) and
 * content.js:34-38 (POST_SELECTORS) at base eaf7631; the resolver
 * bodies are the shared module itself, required directly.
 *
 * Run: node --test plans/research/075/*.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const {
  findPostContainer,
} = require("../../../shared/post-container.js");
const { createDriftMonitor } = require("./health-probe.cjs");

const WARMUP_PLUS_STREAK = 10;

/* Copy of content.js CONFIG thresholds (content.js:10-21). */
const CONFIG = {
  MIN_TEXT_LENGTH: 30,
  SIBLING_CONTENT_THRESHOLD: 100,
  SIBLING_COUNT_THRESHOLD: 2,
  FEED_SIBLING_FALLBACK: 6,
  DEPTH_LIMIT: 20,
  CONTENT_LENGTH_THRESHOLD: 300,
};

/* Copy of content.js POST_SELECTORS (content.js:34-38). */
const POST_SELECTORS = [
  '[data-id*="urn:li:activity:"]',
  ".feed-shared-update-v2",
  "article",
];

/* Short bait keeps every post's textContent under the 100-char heavy-
   sibling threshold, so the ONLY structural difference under test is
   the presence/absence of the known-selector hooks — not text volume. */
const BAIT = 'Comment "CLAUDE" for the free guide today.';

const CURRENT_MOCK = `<!doctype html><html><body><main>
  <section data-id="urn:li:activity:spam-1"><p>${BAIT}</p></section>
  <section data-id="urn:li:activity:spam-2"><p>${BAIT}</p></section>
</main></body></html>`;

/* Restructured variant: same bait, but plain divs with light single-
   child chains — no data-id, no feed-shared-update-v2, no article, no
   heavy siblings, depth < 4, so both the sibling heuristic and the
   known-selector strategy must return null. */
const RESTRUCTURED_MOCK = `<!doctype html><html><body><main>
  <div class="x-item"><div class="x-body"><p>${BAIT}</p></div></div>
  <div class="x-item"><div class="x-body"><p>${BAIT}</p></div></div>
</main></body></html>`;

/* Counts bait text nodes and real resolutions, mirroring the H1 hook
   (content.js:670-672): textNodesSeen ~ matches, containersResolved ~
   non-null SS_findPostContainer results. Counts only — the bait string
   itself never leaves this file. */
function scanDoc(doc) {
  const walker = doc.createTreeWalker(
    doc.body,
    doc.defaultView.NodeFilter.SHOW_TEXT
  );
  let textNodesSeen = 0;
  let containersResolved = 0;
  let node = walker.nextNode();
  while (node) {
    if (node.textContent.includes("CLAUDE")) {
      textNodesSeen += 1;
      if (findPostContainer(node, CONFIG, POST_SELECTORS, doc)) {
        containersResolved += 1;
      }
    }
    node = walker.nextNode();
  }
  return { textNodesSeen, containersResolved, postsEnumerated: 0 };
}

test("current mock shape resolves every bait node (reset path)", () => {
  const doc = new JSDOM(CURRENT_MOCK).window.document;
  const event = scanDoc(doc);
  assert.equal(event.textNodesSeen, 2, "both bait nodes seen");
  assert.equal(event.containersResolved, 2, "both bait nodes resolve");

  const monitor = createDriftMonitor();
  monitor.observe({ textNodesSeen: 0, containersResolved: 0, postsEnumerated: 0 });
  monitor.observe({ textNodesSeen: 0, containersResolved: 0, postsEnumerated: 0 });
  monitor.observe({ textNodesSeen: 0, containersResolved: 0, postsEnumerated: 0 });
  assert.equal(monitor.observe(event), "reset", "resolving scan clears the streak");
  assert.equal(monitor.snapshot().fired, false, "current mock never fires");
});

test("restructured markup resolves nothing (streak path)", () => {
  const doc = new JSDOM(RESTRUCTURED_MOCK).window.document;
  const event = scanDoc(doc);
  assert.equal(event.textNodesSeen, 2, "both bait nodes seen");
  assert.equal(
    event.containersResolved,
    0,
    "neither bait node resolves under restructured markup"
  );

  const monitor = createDriftMonitor();
  const outcomes = [];
  for (let i = 0; i < WARMUP_PLUS_STREAK; i++) {
    outcomes.push(monitor.observe(scanDoc(new JSDOM(RESTRUCTURED_MOCK).window.document)));
  }
  assert.deepEqual(outcomes.slice(0, 3), ["warmup", "warmup", "warmup"]);
  assert.equal(outcomes[7], "fire", "sustained drift fires exactly once");
  assert.ok(
    outcomes.slice(8).every((outcome) => outcome === "streak"),
    "no repeat fire without a reset"
  );
  assert.equal(monitor.snapshot().fired, true);
});
