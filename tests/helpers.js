#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

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

async function getSyncStorage(context, key) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", {
    timeout: 10000,
  });
  return worker.evaluate((k) => new Promise((resolve) => {
    chrome.storage.sync.get(k, (result) => resolve(result[k]));
  }), key);
}

async function setLocalStorage(context, patch) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", {
    timeout: 10000,
  });
  await worker.evaluate((value) => new Promise((resolve) => {
    chrome.storage.local.set(value, resolve);
  }), patch);
}

async function getLocalStorage(context, key) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", {
    timeout: 10000,
  });
  return worker.evaluate((k) => new Promise((resolve) => {
    chrome.storage.local.get(k, (result) => resolve(result[k]));
  }), key);
}

async function sendTabMessage(context, msg) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", {
    timeout: 10000,
  });
  return worker.evaluate((message) => new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        resolve(null);
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        resolve(chrome.runtime.lastError ? null : response);
      });
    });
  }), msg);
}

async function getExtensionId(context) {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", {
    timeout: 10000,
  });
  return new URL(worker.url()).host;
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
    packageManifest.background?.service_worker,
    repoManifest.background?.service_worker,
    `expected ${inputPath} background.service_worker to match repo manifest`
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

module.exports = {
  repoRoot,
  mockLinkedInFeed,
  resolveExtensionPath,
  setSyncStorage,
  getSyncStorage,
  setLocalStorage,
  getLocalStorage,
  sendTabMessage,
  getExtensionId,
  assertPackageVersion,
  readJson,
  execUnzip,
  assertCount,
};
