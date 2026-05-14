#!/usr/bin/env node

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"));
const packageDir = path.join(repoRoot, "dist");
const zipName = `linkedin-spam-blocker-${manifest.version}.zip`;
const zipPath = path.join(packageDir, zipName);

const files = [
  "manifest.json",
  "background.js",
  "content.js",
  "i18n.js",
  "LICENSE",
  "CHANGELOG.md",
  "PRIVACY_POLICY.md",
  "README.md",
  "RELEASE_NOTES.md",
  "VERSION",
  "_locales/en/messages.json",
  "_locales/es/messages.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "popup/popup.html",
  "popup/popup.js",
  "options/options.html",
  "options/options.js",
];

fs.mkdirSync(packageDir, { recursive: true });
fs.rmSync(zipPath, { force: true });

for (const file of files) {
  const absolutePath = path.join(repoRoot, file);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing package file: ${file}`);
  }
}

execFileSync("zip", ["-q", "-r", zipPath, ...files], {
  cwd: repoRoot,
  stdio: "inherit",
});

console.log(`Created ${path.relative(repoRoot, zipPath)}`);
