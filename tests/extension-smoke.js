#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const extensionPath = resolveExtensionPath();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsb-extension-"));

const mockLinkedInFeed = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Mock LinkedIn Feed</title>
  </head>
  <body>
    <main>
      <section data-id="urn:li:activity:spam-1">
        <p>
          <a href="/in/trusted/">Mentioned trusted profile</a>
          Comment "CLAUDE" and I'll send you the complete checklist,
          template, and workflow for free today.
        </p>
      </section>
      <section data-id="urn:li:activity:whitelisted-1">
        <div class="update-components-actor">
          <a href="/in/trusted/">Trusted Author</a>
        </div>
        <p>
          Comment "CLAUDE" and I'll send you the complete checklist,
          template, and workflow for free today.
        </p>
      </section>
      <section data-id="urn:li:activity:clean-1">
        <p>
          This ordinary professional update should stay visible because it
          does not ask anyone to comment a magic word for a download.
        </p>
      </section>
    </main>
  </body>
</html>`;

async function main() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--disable-gpu",
      "--no-sandbox",
    ],
  });

  try {
    await setSyncStorage(context, { ss_whitelist: ["trusted"] });

    await context.route("https://www.linkedin.com/feed/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: mockLinkedInFeed,
      });
    });

    const page = await context.newPage();
    await page.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
    });

    const placeholder = page.locator("[data-ss-ph]");
    await placeholder.waitFor({ state: "visible", timeout: 10000 });

    await assertCount(page.locator('[data-id="urn:li:activity:spam-1"]'), 1);
    await assertCount(page.locator('[data-id="urn:li:activity:whitelisted-1"]'), 1);
    await assertCount(page.locator('[data-id="urn:li:activity:clean-1"]'), 1);

    await assert.equal(
      await page.locator('[data-id="urn:li:activity:spam-1"]').evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected spam post to be hidden"
    );
    await assert.notEqual(
      await page.locator('[data-id="urn:li:activity:whitelisted-1"]').evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected post from whitelisted author to remain visible"
    );
    await assert.notEqual(
      await page.locator('[data-id="urn:li:activity:clean-1"]').evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected clean post to remain visible"
    );
    await assert.match(
      await placeholder.textContent(),
      /Blocked by LinkedIn Spam Blocker|Bloqueado por LinkedIn Spam Blocker/,
      "expected extension placeholder text"
    );

    console.log("Extension smoke test passed.");
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

function resolveExtensionPath() {
  const inputPath = process.argv[2];
  if (!inputPath) return repoRoot;

  const absolutePath = path.resolve(repoRoot, inputPath);
  const stat = fs.statSync(absolutePath);

  if (stat.isDirectory()) return absolutePath;
  if (!absolutePath.endsWith(".zip")) {
    throw new Error(`Unsupported extension path: ${inputPath}`);
  }

  const unpackedDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsb-package-"));
  execUnzip(absolutePath, unpackedDir);
  assertPackageVersion(unpackedDir, inputPath);
  process.on("exit", () => {
    fs.rmSync(unpackedDir, { recursive: true, force: true });
  });
  return unpackedDir;
}

async function setSyncStorage(context, patch) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", {
    timeout: 10000,
  });
  await worker.evaluate((value) => new Promise((resolve) => {
    chrome.storage.sync.set(value, resolve);
  }), patch);
}

function assertPackageVersion(unpackedDir, inputPath) {
  const repoManifest = readJson(path.join(repoRoot, "manifest.json"));
  const repoPackage = readJson(path.join(repoRoot, "package.json"));
  const packageManifest = readJson(path.join(unpackedDir, "manifest.json"));

  assert.equal(
    repoManifest.version,
    repoPackage.version,
    "expected package.json and manifest.json versions to match"
  );
  assert.equal(
    packageManifest.version,
    repoManifest.version,
    `expected ${inputPath} manifest version to match repo version ${repoManifest.version}`
  );
  assert.deepEqual(
    packageManifest.background?.scripts,
    repoManifest.background?.scripts,
    `expected ${inputPath} background.scripts to match repo manifest`
  );
  assert.deepEqual(
    packageManifest.browser_specific_settings?.gecko?.data_collection_permissions,
    repoManifest.browser_specific_settings?.gecko?.data_collection_permissions,
    `expected ${inputPath} Gecko data_collection_permissions to match repo manifest`
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function execUnzip(zipPath, destination) {
  require("node:child_process").execFileSync("unzip", ["-q", zipPath, "-d", destination], {
    stdio: "inherit",
  });
}

async function assertCount(locator, expected) {
  const actual = await locator.count();
  assert.equal(actual, expected);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
