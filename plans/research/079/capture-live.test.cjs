#!/usr/bin/env node

/* Plan 079 — offline tests for the language handling in capture-live.cjs.
 * NOT SHIPPED. No browser needed: these exercise the pure helpers, which are
 * the part most likely to regress and the part a non-English user depends on.
 *
 * Run: node --test plans/research/079/capture-live.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { DEGREE_RE, SHORT_NOISE_RE, labelClusters, postHasLabel, expectationFor } = require("./capture-live.cjs");

/* ── connection-degree detection (must never eat a real label) ─────────── */

test("DEGREE_RE matches connection degrees across locales", () => {
  const degrees = [
    "• 2º", "• 1er", "• 3ᵉʳ", "3ʳᵉ", "2e", "1st", "2nd", "• 3rd", "2ème", "2eme",
  ];
  for (const d of degrees) {
    assert.equal(DEGREE_RE.test(d), true, `expected ${JSON.stringify(d)} to read as a degree`);
  }
});

test("DEGREE_RE never matches a recommendation label", () => {
  const labels = [
    "Suggested", "Suggested for you", "Sugerido para ti", "Sugerido",
    "Promocionado", "Patrocinado", "Promoted", "Vorgeschlagen", "Suggéré",
    "Sugestão", "Sponsorisé", "Contacto Uno",
  ];
  for (const l of labels) {
    assert.equal(DEGREE_RE.test(l), false, `expected ${JSON.stringify(l)} NOT to read as a degree`);
  }
});

test("DEGREE_RE is anchored, so a degree embedded in longer text is not stripped", () => {
  /* Anchoring is deliberate: an unanchored pattern with a trailing \\b silently
     fails on Unicode ordinals such as "º", which is how "• 2º" once leaked into
     the label candidates. */
  assert.equal(DEGREE_RE.test("2º and a note about something"), false);
  assert.equal(DEGREE_RE.test("Suggested for you"), false);
});

/* ── label clustering ─────────────────────────────────────────────────── */

test("labelClusters drops degrees, dedupes and counts", () => {
  const candidates = [
    { shortTexts: ["• 2º"] },
    { shortTexts: ["Sugerido para ti"] },
    { shortTexts: ["Sugerido para ti"] },
    { shortTexts: ["Promocionado"] },
    { shortTexts: ["• 1er"] },
    { shortTexts: [] },
    { shortTexts: ["Suggested for you"] },
  ];
  const clusters = labelClusters(candidates);
  const texts = clusters.map((c) => c.text);
  assert.deepEqual(texts, ["Sugerido para ti", "Promocionado", "Suggested for you"]);
  assert.equal(clusters[0].count, 2);
  assert.equal(clusters[1].count, 1);
  /* Every degree was filtered out. */
  assert.ok(!texts.some((t) => DEGREE_RE.test(t)));
});

test("labelClusters tolerates an empty or degreeless feed", () => {
  assert.deepEqual(labelClusters([]), []);
  assert.deepEqual(labelClusters([{ shortTexts: ["• 3º"] }]), []);
});

/* ── expectation: positives vs documented fail-open negatives ─────────── */

test("a non-English label is a FAIL-OPEN NEGATIVE, not a failure", () => {
  const exp = expectationFor("Sugerido para ti", { shape: "legacy", enumerable: true }, "es");
  assert.equal(exp.negative, true);
  assert.match(exp.reason, /English-only/);
  assert.match(exp.reason, /es/);
});

test("an English label in an enumerable container is a POSITIVE", () => {
  const exp = expectationFor("Suggested", { shape: "legacy", enumerable: true }, "en");
  assert.equal(exp.negative, false);
  assert.match(exp.reason, /expected to be targeted/);
});

test("an English label in a non-enumerable container is a NEGATIVE", () => {
  /* The modern listitem shape is manual-control-only by decision, so automatic
     filtering failing open on it is the documented intent. */
  const exp = expectationFor("Suggested", { shape: "modern", enumerable: false }, "en");
  assert.equal(exp.negative, true);
  assert.match(exp.reason, /manual-control-only|not in the enumerable/);
});

test("expectationFor is locale-aware and never hardcodes English metadata", () => {
  /* Same label text, four UI locales: the locale must reach the reason, because
     it becomes the entry's metadataLocale. */
  for (const locale of ["es", "fr", "pt", "de"]) {
    const exp = expectationFor("Vorgeschlagen", { shape: "legacy", enumerable: true }, locale);
    assert.equal(exp.negative, true);
    assert.ok(exp.reason.includes(locale), `reason must name locale ${locale}`);
  }
});

/* ── class-independent label detection ────────────────────────────────── */

test("postHasLabel matches by exact text, never by class", () => {
  /* LinkedIn's current feed uses hashed atomic classes (gflkzy, gflkxr, ...)
     that change every deploy, so the label can only be found by its text. */
  const labelled = { shortTexts: ["• 2º", "Sugerido para ti", "Esta publicacion la sugiere el algoritmo."] };
  const bodyOnly = { shortTexts: ["• 1er", "Un articulo sobre contenido sugerido y como evitarlo."] };
  assert.equal(postHasLabel(labelled, "Sugerido para ti"), true);
  assert.equal(postHasLabel(bodyOnly, "Sugerido para ti"), false);
  /* A substring mention must NOT count as the label. */
  assert.equal(postHasLabel({ shortTexts: ["Sugerido para ti y algo mas"] }, "Sugerido para ti"), false);
  assert.equal(postHasLabel({}, "Sugerido para ti"), false);
});

test("SHORT_NOISE_RE filters counts, timestamps and UI verbs, not labels", () => {
  for (const noise of ["1.204", "2 d", "12", "Reacciones", "Comentarios", "Compartir", "Me gusta", "3 comentarios", "Follow"]) {
    assert.equal(SHORT_NOISE_RE.test(noise), true, `expected ${JSON.stringify(noise)} to be noise`);
  }
  for (const keep of ["Sugerido para ti", "Promocionado", "Suggested", "Vorgeschlagen", "Patrocinado"]) {
    assert.equal(SHORT_NOISE_RE.test(keep), false, `expected ${JSON.stringify(keep)} to survive`);
  }
});

test("labelClusters ranks label-like strings above short post bodies", () => {
  const clusters = labelClusters([
    { shortTexts: ["Una nota normal de mi red.", "• 2º"] },
    { shortTexts: ["Sugerido para ti"] },
    { shortTexts: ["Promocionado"] },
  ]);
  const texts = clusters.map((c) => c.text);
  /* The label-like entries come first even though counts are equal. */
  assert.ok(texts.indexOf("Sugerido para ti") < texts.indexOf("Una nota normal de mi red."));
  assert.ok(texts.indexOf("Promocionado") < texts.indexOf("Una nota normal de mi red."));
  assert.equal(clusters.find((c) => c.text === "Sugerido para ti").labelLike, true);
  assert.equal(clusters.find((c) => c.text === "Una nota normal de mi red.").labelLike, false);
  /* Degrees never appear. */
  assert.ok(!texts.includes("• 2º"));
});
