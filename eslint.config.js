"use strict";

const js = require("@eslint/js");

const browserExtensionGlobals = {
  chrome: "readonly",
  importScripts: "readonly",
  self: "readonly",
  document: "readonly",
  window: "readonly",
  globalThis: "readonly",
  navigator: "readonly",
  location: "readonly",
  Element: "readonly",
  Node: "readonly",
  NodeFilter: "readonly",
  MutationObserver: "readonly",
  Text: "readonly",
  TextEncoder: "readonly",
  Blob: "readonly",
  FileReader: "readonly",
  URL: "readonly",
  crypto: "readonly",
  requestIdleCallback: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  SS_PATTERN_DATA: "readonly",
  SS_escapeRegex: "readonly",
  SS_isLinkedInHost: "readonly",
  SS_parseAuthorId: "readonly",
  SS_hashString: "readonly",
  SS_getExcludedSignature: "readonly",
  SS_getLocalDayKey: "readonly",
  SS_createCooldownStore: "readonly",
  SS_estimateEntriesBytes: "readonly",
  SS_pruneExcludedByBytes: "readonly",
  SS_PROMOTED_LABELS: "readonly",
  SS_FEATURED_LABELS: "readonly",
  SS_matchesLabel: "readonly",
  SS_CONSTANTS: "readonly",
  SS_findBySiblingHeuristic: "readonly",
  SS_findByKnownSelectors: "readonly",
  SS_findPostContainer: "readonly",
};

const nodeGlobals = {
  require: "readonly",
  module: "readonly",
  exports: "readonly",
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  console: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  URL: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  Blob: "readonly",
};

const testBrowserGlobals = {
  chrome: "readonly",
  document: "readonly",
  window: "readonly",
  navigator: "readonly",
  getComputedStyle: "readonly",
};

// The repo's `_`-prefix convention marks callback args and catch bindings
// that are intentionally unused (e.g. `chrome.runtime.onMessage.addListener((msg, _sender) => …)`
// and `catch (_)`); keep no-unused-vars strict for everything else.
const unusedVarsWithUnderscoreConvention = [
  "error",
  { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
];

module.exports = [
  {
    name: "linkedin-spam-blocker/extension-sources",
    files: [
      "content.js",
      "background.js",
      "popup/**/*.js",
      "options/**/*.js",
      "i18n.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserExtensionGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": unusedVarsWithUnderscoreConvention,
    },
  },
  {
    name: "linkedin-spam-blocker/shared",
    files: ["shared/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserExtensionGlobals, ...nodeGlobals },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": unusedVarsWithUnderscoreConvention,
    },
  },
  {
    name: "linkedin-spam-blocker/node-tools",
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": unusedVarsWithUnderscoreConvention,
    },
  },
  {
    name: "linkedin-spam-blocker/tests",
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      // e2e tests run Node, but their page.evaluate/worker.evaluate
      // callbacks execute in the browser/extension context.
      globals: {
        ...nodeGlobals,
        ...testBrowserGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": unusedVarsWithUnderscoreConvention,
    },
  },
];
