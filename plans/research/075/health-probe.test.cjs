#!/usr/bin/env node

/* Plan 075 research prototype tests (NOT SHIPPED).
 *
 * Sequence-level tests for health-probe.cjs over synthetic scan events
 * (single source of truth: the design's section 2 — N = 5 consecutive
 * qualifying scans after a 3-invocation warm-up). Modeled on
 * plans/research/068/detector.test.cjs table shape (node:test +
 * assert/strict, per-case outcomes collected and summarized).
 *
 * Provenance note (per plan 067 denominator rules): every sequence here
 * is spike-authored synthetic input — no real LinkedIn DOM is involved,
 * so no precision/recall/FPR rate is claimed. The gate asserted is the
 * plan's fixed requirement: silence on cold-start/empty-page, exactly
 * one fire on sustained drift, reset on resolution.
 *
 * Run: node --test plans/research/075/*.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createDriftMonitor, WARMUP_SCANS, FIRE_THRESHOLD } = require("./health-probe.cjs");

/* Shorthands for scan events: N = neutral (no matches), Q = qualifying
   (match, no resolution), R = resolving (match + resolution). */
const N = (postsEnumerated = 0) => ({
  textNodesSeen: 0,
  containersResolved: 0,
  postsEnumerated,
});
const Q = (postsEnumerated = 0) => ({
  textNodesSeen: 2,
  containersResolved: 0,
  postsEnumerated,
});
const R = (postsEnumerated = 0) => ({
  textNodesSeen: 2,
  containersResolved: 1,
  postsEnumerated,
});

function drive(monitor, events) {
  return events.map((event) => monitor.observe(event));
}

test("design constants pin N = 5 with a 3-scan warm-up", () => {
  assert.equal(WARMUP_SCANS, 3, "warm-up matches design.md section 2");
  assert.equal(FIRE_THRESHOLD, 5, "fire threshold matches design.md section 2");
  const monitor = createDriftMonitor();
  assert.equal(monitor.warmupScans, 3);
  assert.equal(monitor.fireThreshold, 5);
});

test("cold-start sequence stays silent", () => {
  const monitor = createDriftMonitor();
  const outcomes = drive(monitor, [
    N(), N(), N(), // hydration rounds inside warm-up
    R(), // first real scan resolves
    N(), // clean follow-up
    R(),
  ]);
  assert.deepEqual(outcomes, [
    "warmup",
    "warmup",
    "warmup",
    "reset",
    "neutral",
    "reset",
  ]);
  assert.equal(monitor.snapshot().fired, false);
  assert.equal(monitor.snapshot().streak, 0);
});

test("sustained zero-resolution streak fires exactly once", () => {
  const monitor = createDriftMonitor();
  const outcomes = drive(monitor, [N(), N(), N(), Q(), Q(), Q(), Q(), Q(), Q(), Q()]);
  assert.deepEqual(outcomes.slice(0, 3), ["warmup", "warmup", "warmup"]);
  assert.deepEqual(outcomes.slice(3, 7), ["streak", "streak", "streak", "streak"]);
  assert.equal(outcomes[7], "fire", "5th consecutive qualifying scan fires");
  assert.deepEqual(outcomes.slice(8), ["streak", "streak"], "no second fire without reset");
  assert.equal(monitor.snapshot().fired, true);
});

test("single resolved container resets the streak", () => {
  const monitor = createDriftMonitor();
  const outcomes = drive(monitor, [N(), N(), N(), Q(), Q(), Q(), Q(), R()]);
  assert.equal(outcomes[outcomes.length - 1], "reset");
  assert.equal(monitor.snapshot().streak, 0);
  assert.equal(monitor.snapshot().fired, false);
});

test("empty-page sequence (zeros throughout) stays silent", () => {
  const monitor = createDriftMonitor();
  const events = Array.from({ length: 13 }, () => N());
  const outcomes = drive(monitor, events);
  assert.ok(
    outcomes.slice(WARMUP_SCANS).every((outcome) => outcome === "neutral"),
    "post-warm-up empty scans are all neutral"
  );
  assert.equal(monitor.snapshot().streak, 0);
  assert.equal(monitor.snapshot().fired, false);
});

test("distinguishes no-posts from posts-but-no-containers", () => {
  const monitor = createDriftMonitor();
  drive(monitor, [N(), N(), N()]);
  // Blocklist user on a clean feed: posts enumerated, nothing matched.
  assert.equal(monitor.observe(N(5)), "neutral", "enumerated-but-clean stays silent");
  assert.equal(monitor.snapshot().streak, 0);
  // Default-config drift: text matched, nothing enumerated, nothing resolved.
  assert.equal(monitor.observe(Q(0)), "streak", "unenumerated drift still extends");
  assert.equal(monitor.snapshot().streak, 1);
});

test("warm-up invocations are excluded even when qualifying", () => {
  const monitor = createDriftMonitor();
  const outcomes = drive(monitor, [Q(), Q(), Q(), Q(), Q(), Q(), Q()]);
  assert.deepEqual(outcomes.slice(0, 3), ["warmup", "warmup", "warmup"]);
  assert.equal(monitor.snapshot().streak, 4, "streak counts only post-warm-up scans");
  assert.equal(monitor.snapshot().fired, false, "4 post-warm-up qualifying scans do not fire");
});

test("monitor re-arms after a reset", () => {
  const monitor = createDriftMonitor();
  drive(monitor, [N(), N(), N(), Q(), Q(), Q(), Q(), Q()]);
  assert.equal(monitor.snapshot().fired, true);
  assert.equal(monitor.observe(R()), "reset");
  const outcomes = drive(monitor, [Q(), Q(), Q(), Q(), Q()]);
  assert.equal(outcomes[outcomes.length - 1], "fire", "second streak fires again after reset");
  assert.equal(monitor.snapshot().fired, true);
});

test("monitor state holds counts only, never observed content", () => {
  const monitor = createDriftMonitor();
  drive(monitor, [N(), N(), N()]);
  monitor.observe({
    textNodesSeen: 1,
    containersResolved: 0,
    postsEnumerated: 0,
    exfiltrated: "comment CLAUDE for the free framework",
  });
  const snapshot = JSON.stringify(monitor.snapshot());
  assert.ok(
    !snapshot.includes("CLAUDE"),
    "stray string fields on events never enter monitor state"
  );
});
