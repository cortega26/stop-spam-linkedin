#!/usr/bin/env node

/* E2E test: the LIVE AMO listing description must carry the full
   must-have copy from STORE_ASSETS.md (spec.md, task 047/AMO).

   Usage: set -a; . ./.env; set +a; node tests/verify-amo-listing.js
   Reads FIREFOX_API_KEY / FIREFOX_API_SECRET from the environment.
   Exit 0 = pass; exit 1 = one or more markers missing on AMO. */

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const GUID = "linkedin-spam-blocker@carlos";
const API = "https://addons.mozilla.org/api/v5";

const repoRoot = path.resolve(__dirname, "..");
const storeAssets = fs.readFileSync(path.join(repoRoot, "STORE_ASSETS.md"), "utf8");

function jwt(apiKey, apiSecret) {
  const header = { alg: "HS256", typ: "JWT" };
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = { iss: apiKey, iat: nowSec, exp: nowSec + 240 };
  const seg = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${seg(header)}.${seg(payload)}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

/* Extract the EN detailed description body from STORE_ASSETS.md:
   from "### Your feed, reclaimed." to just before "## Español". */
function extractEnDescription() {
  const start = storeAssets.indexOf("### Your feed, reclaimed.");
  const end = storeAssets.indexOf("## Español");
  assert.ok(start !== -1 && end !== -1 && end > start, "STORE_ASSETS.md EN section markers not found");
  return storeAssets.slice(start, end).trim();
}

/* Extract the ES detailed description body: from
   "### Tu feed, recuperado." to just before "## Screenshots". */
function extractEsDescription() {
  const start = storeAssets.indexOf("### Tu feed, recuperado.");
  const end = storeAssets.indexOf("## Screenshots");
  assert.ok(start !== -1 && end !== -1 && end > start, "STORE_ASSETS.md ES section markers not found");
  return storeAssets.slice(start, end).trim();
}

async function main() {
  const apiKey = process.env.FIREFOX_API_KEY;
  const apiSecret = process.env.FIREFOX_API_SECRET;
  assert.ok(apiKey && apiSecret, "FIREFOX_API_KEY/FIREFOX_API_SECRET must be set");

  const res = await fetch(`${API}/addons/addon/${encodeURIComponent(GUID)}/`, {
    headers: { Authorization: `JWT ${jwt(apiKey, apiSecret)}` },
  });
  assert.equal(res.status, 200, "GET addon failed");
  const addon = await res.json();
  const desc = addon.description || {};
  const en = desc["en-US"] || "";
  const es = desc["es-ES"] || "";

  const enExpected = extractEnDescription();
  const esExpected = extractEsDescription();

  /* AMO strips markdown markers (### and **) from stored descriptions;
     the source in STORE_ASSETS.md keeps them for Chrome. Compare on
     plain-text markers: the heading text, the closer, and key copy. */
  const enMarkers = [
    "Your feed, reclaimed.",
    "comment CLAUDE and I'll send you the",
    "zero effort",
    "Never-hide phrases",
    "Match tester",
    "Per-pattern stats",
    "Comment-level blocking",
    "including school and",
    "Persistent suggestions",
    "First-run walkthrough",
    "Install it once. Forget it's there. Enjoy your feed again.",
    "zero network",
  ];
  const esMarkers = [
    "Tu feed, recuperado.",
    "comenta CLAUDE y te",
    "cero esfuerzo",
    "Frases que nunca se ocultan",
    "Probador de coincidencias",
    "Estadísticas por patrón",
    "Bloqueo a nivel de comentario",
    "feeds de escuelas y de showcase",
    "Sugerencias persistentes",
    "Guía de bienvenida",
    "Instálalo una vez. Olvídate de que está. Vuelve a disfrutar tu feed.",
  ];

  const missingEn = enMarkers.filter((m) => !en.includes(m));
  const missingEs = esMarkers.filter((m) => !es.includes(m));
  /* Source-side sanity: the markers must exist in STORE_ASSETS source
     (as heading text / closer) so the test isn't comparing to nothing. */
  const missingEnFromSource = enMarkers.filter((m) => !enExpected.includes(m));
  const missingEsFromSource = esMarkers.filter((m) => !esExpected.includes(m));

  assert.deepEqual(missingEnFromSource, [], `markers absent from STORE_ASSETS source (EN): ${missingEnFromSource}`);
  assert.deepEqual(missingEsFromSource, [], `markers absent from STORE_ASSETS source (ES): ${missingEsFromSource}`);

  console.log(`AMO keys present: ${Object.keys(desc).join(", ")}`);
  console.log(`en-US stored length: ${en.length} | es-ES stored length: ${es.length}`);
  console.log(`EN markers missing on AMO: ${missingEn.length === 0 ? "NONE ✓" : missingEn.join(", ")}`);
  console.log(`ES markers missing on AMO: ${missingEs.length === 0 ? "NONE ✓" : missingEs.join(", ")}`);

  if (missingEn.length > 0 || missingEs.length > 0) {
    console.error("\n--- FAIL: stored copy is missing markers ---");
    if (missingEn.length > 0) console.error("EN missing:", missingEn);
    if (missingEs.length > 0) console.error("ES missing:", missingEs);
    console.error("--- stored en-US first 400 chars ---");
    console.error(en.slice(0, 400));
    console.error("--- stored es-ES first 400 chars ---");
    console.error(es.slice(0, 400));
    process.exit(1);
  }

  /* The heading question from spec.md: must the literal "reclaimed"
     heading appear? It is a marker above, but check the actual first
     line to report what AMO stored at the top. */
  const enFirstLine = en.split("\n").find((l) => l.trim()) || "";
  console.log(`en-US first non-empty line: ${JSON.stringify(enFirstLine.slice(0, 60))}`);
  const esFirstLine = es.split("\n").find((l) => l.trim()) || "";
  console.log(`es-ES first non-empty line: ${JSON.stringify(esFirstLine.slice(0, 60))}`);

  console.log("AMO listing description test PASSED.");
}

main().catch((err) => {
  console.error("AMO listing description test FAILED:", err.message);
  process.exit(1);
});
