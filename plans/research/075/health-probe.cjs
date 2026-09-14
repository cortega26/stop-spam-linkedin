#!/usr/bin/env node

/* Plan 075 research prototype (NOT SHIPPED).
 *
 * Pure, precedence-free drift-tripwire counter over synthetic scan-event
 * sequences. Implements plans/research/075/design.md section 2 exactly:
 * fire after N = 5 consecutive qualifying scans
 * (textNodesSeen > 0 && containersResolved == 0) once the 3-invocation
 * warm-up has passed; containersResolved > 0 resets; textNodesSeen == 0
 * scans are neutral. Holds three integer counters plus streak/fired
 * flags — never text, never DOM references, never blocking state.
 *
 * Run: node --test plans/research/075/*.test.cjs
 */

"use strict";

const WARMUP_SCANS = 3;
const FIRE_THRESHOLD = 5;

/**
 * @typedef {Object} ScanEvent
 * @property {number} textNodesSeen Matches from findSpamTextNodes.
 * @property {number} containersResolved Non-null SS_findPostContainer results.
 * @property {number} postsEnumerated Author/label-pass candidates (context only).
 */

/**
 * Creates an isolated tripwire counter.
 * @param {{ warmupScans?: number, fireThreshold?: number }} [options]
 */
function createDriftMonitor(options) {
  const warmupScans =
    options && typeof options.warmupScans === "number"
      ? options.warmupScans
      : WARMUP_SCANS;
  const fireThreshold =
    options && typeof options.fireThreshold === "number"
      ? options.fireThreshold
      : FIRE_THRESHOLD;

  let invocations = 0;
  let streak = 0;
  let fired = false;

  /**
   * Observes one scan event. Returns "fire" exactly once per streak,
   * "reset" when a resolution clears the streak, "warmup" while excluded,
   * "neutral" for non-qualifying scans, "streak" otherwise.
   * @param {ScanEvent} event
   * @returns {"fire" | "reset" | "warmup" | "neutral" | "streak"}
   */
  function observe(event) {
    invocations += 1;
    if (invocations <= warmupScans) return "warmup";

    const textNodesSeen = event.textNodesSeen | 0;
    const containersResolved = event.containersResolved | 0;

    if (containersResolved > 0) {
      streak = 0;
      fired = false;
      return "reset";
    }
    if (textNodesSeen === 0) return "neutral";

    streak += 1;
    if (streak >= fireThreshold && !fired) {
      fired = true;
      return "fire";
    }
    return "streak";
  }

  function snapshot() {
    return { invocations, streak, fired };
  }

  return { observe, snapshot, warmupScans, fireThreshold };
}

module.exports = { createDriftMonitor, WARMUP_SCANS, FIRE_THRESHOLD };
