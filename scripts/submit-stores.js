#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"));
const zipPath = path.join(repoRoot, "dist", `linkedin-spam-blocker-${manifest.version}.zip`);

if (!fs.existsSync(zipPath)) {
  console.error(`Zip not found: ${zipPath}`);
  console.error("Run 'npm run package' first.");
  process.exit(1);
}

const store = process.argv[2];
if (!store || !["chrome", "firefox"].includes(store)) {
  console.error("Usage: node scripts/submit-stores.js <chrome|firefox>");
  process.exit(1);
}

async function submitChrome() {
  const extensionId = process.env.CHROME_EXTENSION_ID;
  const publisherId = process.env.CHROME_PUBLISHER_ID;
  const clientId = process.env.CHROME_CLIENT_ID;
  const clientSecret = process.env.CHROME_CLIENT_SECRET;
  const refreshToken = process.env.CHROME_REFRESH_TOKEN;

  if (!extensionId || !publisherId || !clientId || !clientSecret || !refreshToken) {
    console.error("Missing Chrome env vars: CHROME_EXTENSION_ID, CHROME_PUBLISHER_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN");
    process.exit(1);
  }

  const { default: chromeWebstoreUpload } = await import("chrome-webstore-upload");
  const webStore = chromeWebstoreUpload({
    extensionId,
    publisherId,
    clientId,
    clientSecret,
    refreshToken,
  });

  console.log(`Uploading ${path.basename(zipPath)} to Chrome Web Store...`);
  const upload = await webStore.uploadExisting(fs.createReadStream(zipPath));
  console.log("Upload:", JSON.stringify(upload, null, 2));

  console.log("Publishing...");
  const publish = await webStore.publish();
  console.log("Publish:", JSON.stringify(publish, null, 2));

  console.log("Chrome Web Store: done.");
}

async function submitFirefox() {
  const apiKey = process.env.FIREFOX_API_KEY;
  const apiSecret = process.env.FIREFOX_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error("Missing Firefox env vars: FIREFOX_API_KEY, FIREFOX_API_SECRET");
    process.exit(1);
  }

  const header = { alg: "HS256", typ: "JWT" };
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = { iss: apiKey, iat: nowSec, exp: nowSec + 240 };

  const seg = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${seg(header)}.${seg(payload)}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(unsigned).digest("base64url");
  const jwt = `${unsigned}.${signature}`;

  const fileBuffer = fs.readFileSync(zipPath);
  const formData = new FormData();
  formData.append("upload", new Blob([fileBuffer], { type: "application/zip" }), path.basename(zipPath));
  formData.append("channel", "listed");

  console.log(`Uploading ${path.basename(zipPath)} to Mozilla Add-ons...`);
  const response = await fetch("https://addons.mozilla.org/api/v5/addons/upload/", {
    method: "POST",
    headers: { Authorization: `JWT ${jwt}` },
    body: formData,
  });

  const result = await response.json();
  console.log("Response:", JSON.stringify(result, null, 2));

  if (!response.ok) {
    console.error("Firefox upload failed:", result);
    process.exit(1);
  }

  console.log("Mozilla Add-ons: done.");
}

(async () => {
  try {
    if (store === "chrome") {
      await submitChrome();
    } else if (store === "firefox") {
      await submitFirefox();
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
