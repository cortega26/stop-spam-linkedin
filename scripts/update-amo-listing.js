#!/usr/bin/env node

/* Update the live Mozilla Add-ons listing text from STORE_ASSETS.md.
 *
 * STORE_ASSETS.md is the single source of truth for listing copy; this script
 * only transports it, so the repo and the live listing cannot drift. Chrome has
 * no description API (AGENTS.md), so its half stays a manual paste.
 *
 * AMO stores listing text as PLAIN TEXT and strips markdown markers, so this
 * converts markdown to plain text here rather than sending markers that would
 * either appear literally or vanish unpredictably.
 *
 * Usage:
 *   node scripts/update-amo-listing.js --check   # show what would be sent
 *   node scripts/update-amo-listing.js           # PATCH the live listing
 *
 * Requires FIREFOX_API_KEY / FIREFOX_API_SECRET (same vars as submit-stores.js).
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(REPO_ROOT, "STORE_ASSETS.md");
const ADDON_ID = "linkedin-spam-blocker@carlos";

/* Section headings in STORE_ASSETS.md. Missing any is a hard error: a silently
   empty field would blank the live listing. */
const SECTIONS = {
  "summary:en-US": "## English — Short description",
  "description:en-US": "## English — Full description",
  "summary:es-ES": "## Español — Descripción breve",
  "description:es-ES": "## Español — Descripción completa",
};

const NEXT_HEADING = /^## /m;

function sectionText(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) throw new Error(`heading not found in STORE_ASSETS.md: ${heading}`);
  /* Consume the remainder of the heading LINE: headings may carry a suffix such
     as "(Chrome limit: 132 chars)", which must not leak into the description. */
  const afterHeading = start + heading.length;
  const lineEnd = markdown.indexOf("\n", afterHeading);
  const rest = markdown.slice(lineEnd === -1 ? afterHeading : lineEnd);
  const nextMatch = rest.match(NEXT_HEADING);
  const body = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  return body.trim();
}

/** Markdown to the plain text AMO actually stores. */
function toPlainText(md) {
  return md
    .split("\n")
    .map((line) => line.replace(/^###\s+/, "").replace(/^##\s+/, ""))
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(?!\s)(.+?)(?<!\s)\*(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^-\s+/gm, "\u2022 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function jwt(apiKey, apiSecret) {
  const nowSec = Math.floor(Date.now() / 1000);
  const seg = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${seg({ alg: "HS256", typ: "JWT" })}.${seg({ iss: apiKey, iat: nowSec, exp: nowSec + 240 })}`;
  return `${unsigned}.${crypto.createHmac("sha256", apiSecret).update(unsigned).digest("base64url")}`;
}

function buildPayload() {
  const markdown = fs.readFileSync(ASSETS, "utf8");
  const raw = {};
  for (const [key, heading] of Object.entries(SECTIONS)) {
    raw[key] = sectionText(markdown, heading);
  }
  const payload = {
    summary: { "en-US": toPlainText(raw["summary:en-US"]), "es-ES": toPlainText(raw["summary:es-ES"]) },
    description: { "en-US": toPlainText(raw["description:en-US"]), "es-ES": toPlainText(raw["description:es-ES"]) },
  };
  for (const [k, v] of Object.entries(payload.summary)) {
    if (!v) throw new Error(`empty summary for ${k}`);
    if (v.length > 250) throw new Error(`summary ${k} is ${v.length} chars (AMO limit 250)`);
  }
  for (const [k, v] of Object.entries(payload.description)) {
    if (!v) throw new Error(`empty description for ${k}`);
    if (v.length < 200) throw new Error(`description ${k} looks truncated (${v.length} chars)`);
  }
  return payload;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const apiKey = process.env.FIREFOX_API_KEY;
  const apiSecret = process.env.FIREFOX_API_SECRET;

  let payload;
  try {
    payload = buildPayload();
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }

  console.log("Prepared listing text:");
  console.log(`  summary en-US     : ${payload.summary["en-US"].length} chars`);
  console.log(`  summary es-ES     : ${payload.summary["es-ES"].length} chars`);
  console.log(`  description en-US : ${payload.description["en-US"].length} chars`);
  console.log(`  description es-ES : ${payload.description["es-ES"].length} chars`);
  console.log("\n--- summary en-US ---\n" + payload.summary["en-US"]);
  console.log("\n--- description en-US (first 600 chars) ---\n" + payload.description["en-US"].slice(0, 600));

  if (checkOnly) {
    console.log("\n--check: nothing sent.");
    return;
  }
  if (!apiKey || !apiSecret) {
    console.error("\nMissing FIREFOX_API_KEY / FIREFOX_API_SECRET; re-run with --check to inspect only.");
    process.exit(1);
  }

  const token = jwt(apiKey, apiSecret);
  const url = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(ADDON_ID)}/`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`PATCH failed (${res.status}):`, JSON.stringify(out, null, 2));
    process.exit(1);
  }
  console.log(`\nPATCH ok (${res.status}). Live listing now reports:`);
  console.log(`  summary en-US     : ${((out.summary || {})["en-US"] || "").length} chars`);
  console.log(`  description en-US : ${((out.description || {})["en-US"] || "").length} chars`);
  console.log(`  name              : ${(out.name || {})["en-US"]}`);
}

main().catch((err) => {
  console.error(`error: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
