#!/usr/bin/env node

/* Report the PUBLISHED version on each store next to the source version.
 *
 * Used to answer "has the store rolled over yet?" after a release, so follow-up
 * steps (listing copy, availability notices) happen at the right moment rather
 * than early or never.
 *
 * Usage:
 *   node scripts/check-store-versions.js          # human-readable
 *   node scripts/check-store-versions.js --quiet  # exit code only
 *
 * Exit codes: 0 = every store matches the source version, 1 = at least one is
 * behind (still in review), 2 = a store could not be read.
 *
 * Sources: Mozilla publishes an official unauthenticated API. Chrome Web Store
 * has no such endpoint, so its version comes from the public shields.io badge
 * that this repo already uses in its README - a third-party mirror, and the
 * reason the two stores are labelled differently below.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SOURCE_VERSION = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "manifest.json"), "utf8")).version;
const CHROME_ID = "eolknfnafdodmaaajdiidaanpjbfolfc";
const AMO_SLUG = "linkedin-spam-blocker";

const quiet = process.argv.includes("--quiet");

async function getJson(url, timeoutMs = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function chromePublished() {
  const data = await getJson(`https://img.shields.io/chrome-web-store/v/${CHROME_ID}.json`);
  return { version: String(data.message || "").replace(/^v/, ""), source: "shields.io mirror of the CWS listing" };
}

async function amoPublished() {
  const data = await getJson(`https://addons.mozilla.org/api/v5/addons/addon/${AMO_SLUG}/`);
  const version = (data.current_version || {}).version;
  const state = (data.current_version || {}).file?.status || (data.current_version || {}).channel;
  return { version, state, source: "addons.mozilla.org public API" };
}

async function main() {
  if (!quiet) console.log(`source (manifest.json): ${SOURCE_VERSION}\n`);

  let behind = 0;
  let unreadable = 0;

  try {
    const c = await chromePublished();
    const match = c.version === SOURCE_VERSION;
    if (!match) behind += 1;
    if (!quiet) {
      console.log(`Chrome Web Store : ${c.version}  ${match ? "UP TO DATE" : "BEHIND (in review)"}`);
      console.log(`                   via ${c.source}`);
    }
  } catch (err) {
    unreadable += 1;
    if (!quiet) console.log(`Chrome Web Store : unreadable (${err.message})`);
  }

  try {
    const a = await amoPublished();
    const match = a.version === SOURCE_VERSION;
    if (!match) behind += 1;
    if (!quiet) {
      console.log(`Firefox Add-ons  : ${a.version}  ${match ? "UP TO DATE" : "BEHIND"}${a.state ? `  [${a.state}]` : ""}`);
      console.log(`                   via ${a.source}`);
    }
  } catch (err) {
    unreadable += 1;
    if (!quiet) console.log(`Firefox Add-ons  : unreadable (${err.message})`);
  }

  if (unreadable > 0) {
    if (!quiet) console.log(`\nAt least one store could not be read; retry later.`);
    process.exit(2);
  }
  if (behind > 0) {
    if (!quiet) console.log(`\n${behind} store(s) still behind. Follow-ups in the release issue are due when they match.`);
    process.exit(1);
  }
  if (!quiet) console.log(`\nBoth stores publish ${SOURCE_VERSION}. Follow-up steps are due now.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`error: ${err && err.message ? err.message : err}`);
  process.exit(2);
});
