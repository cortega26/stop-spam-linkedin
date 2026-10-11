#!/usr/bin/env node

/* Plan 079 Step 0 — demonstrate the plan-071 sanitization gap.
 *
 * Runs the EXACT content assertions that plans/research/071/probe-extensions.test.cjs
 * ("sanitization: only sentinel URNs, recorded provenance context") applies to
 * every entry of cases-real.json, against a crafted entry that still contains
 * PII-SHAPED text. All values below are invented for this demonstration; none
 * of them is a real person, profile, or post.
 *
 * If the gate passes this entry, the gate does not verify sanitization.
 *
 * Run: node plans/research/079/step0-gap-demo.cjs
 */

"use strict";

const assert = require("node:assert/strict");

/* Deliberately UNSANITISED entry: real-shaped name, real-shaped post body,
 * a surviving id attribute, a profile slug, a tracking param, a real-shaped
 * URN, and a srcset. Every field the 071 gate inspects is present and "valid". */
const dirtyEntry = {
  id: "step0-dirty",
  purpose: "Step 0 gap demonstration (NOT a real capture; invented values)",
  markup:
    '<section id="ember1234" data-id="urn:li:activity:7251234567890" ' +
    'class="feed-shared-update-v2">' +
    '<div class="feed-shared-actor">' +
    '<a class="feed-shared-actor__container-link" ' +
    'href="/in/jane-doe-9b3f?trk=feed_main-feed-card_actor">' +
    '<span class="feed-shared-actor__title">Jane Doe</span>' +
    "</a>" +
    '<span class="feed-shared-actor__sub-description">Suggested</span>' +
    "</div>" +
    '<p class="post-body">Excited to share that I have accepted a new role ' +
    "as Head of Data at Northwind Analytics starting next month.</p>" +
    '<img src="https://media.example/x.jpg?trk=feed" ' +
    'srcset="https://media.example/x.jpg 1x, https://media.example/x2.jpg 2x" ' +
    'alt="Photo of Jane Doe speaking at the 2025 summit">' +
    "</section>",
  scanRoot: "parent",
  expectedTarget: null,
  metadataLocale: "en",
  provenance: "user-contributed",
  validationStatus: "real-donated",
  sourceRef: "contributor capture, 2026-09, en UI locale; sanitized per protocol.md §2",
  sanitization:
    "Replaced all human text with inert placeholders; kept class attributes and nesting exactly.",
};

/* ── The full body of the 071 "sanitization:" test, verbatim in behaviour ── */
function plan071SanitizationGate(c) {
  assert.equal(typeof c.sanitization, "string");
  assert.ok(c.sanitization.length > 0, `${c.id}: sanitization recorded`);
  assert.equal(typeof c.sourceRef, "string");
  assert.ok(/UI locale/.test(c.sourceRef), `${c.id}: sourceRef names the contributor UI locale`);
  const urns = Array.from(c.markup.matchAll(/urn:li:activity:([A-Za-z0-9-]+)/g), (m) => m[1]);
  for (const urn of urns) {
    assert.ok(/^71[A-Za-z0-9-]*$/.test(urn), `${c.id}: non-sentinel URN leftover urn:li:activity:${urn}`);
  }
}

let gatePassed = false;
try {
  plan071SanitizationGate(dirtyEntry);
  gatePassed = true;
} catch (err) {
  console.log("071 gate REJECTED the entry:", err.message);
}

/* Adjust the URN so even the one real check 071 performs cannot fire, to show
   that the gate's only content defence is a single sentinel prefix. */
dirtyEntry.markup = dirtyEntry.markup.replace("urn:li:activity:7251234567890", "urn:li:activity:7199");

let gatePassedAfterPrefixFix = false;
try {
  plan071SanitizationGate(dirtyEntry);
  gatePassedAfterPrefixFix = true;
} catch (err) {
  console.log("071 gate rejected after prefix fix:", err.message);
}

const surviving = {
  personName: /Jane Doe/.test(dirtyEntry.markup),
  postBody: /accepted a new role/.test(dirtyEntry.markup),
  globalIdAttribute: /\sid="/.test(dirtyEntry.markup),
  profileSlug: /\/in\/jane-doe-9b3f/.test(dirtyEntry.markup),
  trackingParam: /trk=/.test(dirtyEntry.markup),
  srcset: /srcset=/.test(dirtyEntry.markup),
  altText: /alt="Photo of Jane Doe/.test(dirtyEntry.markup),
};

console.log("\n=== Step 0 result ===");
console.log("071 sanitization gate passed on the dirty entry:", gatePassedAfterPrefixFix);
console.log("surviving PII-shaped content after that pass:", JSON.stringify(surviving, null, 1));

const leaks = Object.values(surviving).filter(Boolean).length;
console.log(
  `\nCONCLUSION: ${leaks} PII-shaped items survive an entry that the plan-071 gate accepts.`
);
console.log(
  "The gate verifies a provenance string and a URN prefix; it does not verify that sanitization happened."
);
console.log(
  "Plan 079 adds the missing producer (sanitize.cjs) and the missing verifier (findLeaks)."
);

process.exit(0);
