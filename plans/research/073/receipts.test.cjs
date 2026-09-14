#!/usr/bin/env node

/* Plan 073 spike characterization tests (NOT SHIPPED).
 *
 * Pins the CURRENT silent behavior of the two context-menu *write* actions
 * (add-phrase, block-author) by driving the real `handleContextMenuClick`
 * through its committed test hook (`globalThis.__SS_handleContextMenuClick`,
 * background.js:186-188) with stubbed `chrome.*` globals — the same
 * fixture-drive pattern as the 063 3-fixture coverage, which lives in the
 * committed suite (tests/extension-interactions.js:2787-2838, section J)
 * and covers ONLY the report-missed-spam dispatch (LinkedIn / non-LinkedIn /
 * missing-tab). Overlap with that suite is exactly one sanity case below
 * ("report-missed … dispatches"); everything else here is the delta: the
 * nine write-action silent sites from plans/research/073/matrix.md.
 *
 * Each case records return value / sent-message array / storage-write calls
 * and asserts the silent outcome against the UNMODIFIED background.js
 * (pin, not fix). Uses node:test + assert/strict; no DOM, no network, no
 * production changes. The shared sources (constants, pattern-data) are the
 * real files, required read-only so URL parsing and limits are faithful.
 *
 * Run: node --test plans/research/073/*.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/* Real shared sources, loaded read-only: they attach SS_CONSTANTS,
   SS_parseAuthorId, SS_isLinkedInHost, … to globalThis in Node. */
require("../../../shared/constants.js");
require("../../../shared/pattern-data.js");

const MENU_ADD_PHRASE = "ss-add-phrase";
const MENU_BLOCK_AUTHOR = "ss-block-author";
const MENU_REPORT_MISSED = "ss-report-missed";

/* Builds an isolated world per case: fresh sync store, fresh chrome stub,
   fresh evaluation of the UNMODIFIED background.js. The stub stays installed
   as the current world until the next loadHandler call (the handler reads
   `chrome` at CALL time, not load time); everything is restored after the
   file's tests. Cases are synchronous end-to-end (the storage stub invokes
   callbacks immediately), so the current world always belongs to the running
   test. */
const installed = {
  done: false,
  savedChrome: undefined,
  savedImportScripts: undefined,
  savedWarn: undefined,
  state: null,
};

test.after(() => {
  if (!installed.done) return;
  if (installed.savedChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = installed.savedChrome;
  if (installed.savedImportScripts === undefined) delete globalThis.importScripts;
  else globalThis.importScripts = installed.savedImportScripts;
  console.warn = installed.savedWarn;
  delete globalThis.__SS_handleContextMenuClick;
});

function loadHandler(options = {}) {
  if (!installed.done) {
    installed.savedChrome = globalThis.chrome;
    installed.savedImportScripts = globalThis.importScripts;
    installed.savedWarn = console.warn;
    globalThis.importScripts = () => {};
    console.warn = (...args) => {
      if (installed.state) installed.state.warns.push(args.map(String).join(" "));
    };
    installed.done = true;
  }

  const state = {
    syncStore: Object.assign({}, options.syncStore),
    sentMessages: [],
    setCalls: [],
    getCalls: [],
    warns: [],
    noReceiver: options.noReceiver === true,
    failNextSet: options.failNextSet === true,
  };

  const chromeStub = {
    i18n: { getMessage: (key) => key },
    runtime: {
      id: "spike-073-test",
      lastError: undefined,
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      openOptionsPage() {},
    },
    contextMenus: {
      removeAll(callback) { if (callback) callback(); },
      create(_item, callback) { if (callback) callback(); },
      onClicked: { addListener() {} },
    },
    storage: {
      sync: {
        QUOTA_BYTES_PER_ITEM: 8192,
        get(keys, callback) {
          state.getCalls.push(Array.isArray(keys) ? keys.slice() : [keys]);
          const result = {};
          for (const key of (Array.isArray(keys) ? keys : [keys])) {
            result[key] = state.syncStore[key];
          }
          callback(result);
        },
        set(items, callback) {
          state.setCalls.push(Object.assign({}, items));
          if (state.failNextSet) {
            chromeStub.runtime.lastError = { message: "stubbed sync write error" };
            if (callback) callback();
            delete chromeStub.runtime.lastError;
          } else {
            Object.assign(state.syncStore, items);
            if (callback) callback();
          }
        },
      },
      local: {
        get(_keys, callback) { if (callback) callback({}); },
        set(_items, callback) { if (callback) callback(); },
      },
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        state.sentMessages.push({ tabId, message });
        if (state.noReceiver) {
          chromeStub.runtime.lastError = {
            message: "Could not establish connection. Receiving end does not exist.",
          };
          if (typeof callback === "function") callback();
          delete chromeStub.runtime.lastError;
        } else if (typeof callback === "function") {
          callback({ ok: true });
        }
        return undefined;
      },
    },
    action: {
      setBadgeText() {},
      setBadgeBackgroundColor() {},
    },
  };

  installed.state = state;
  globalThis.chrome = chromeStub;
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "background.js"),
    "utf8"
  );
  assert.match(source, /__SS_handleContextMenuClick/, "expected the test hook to exist");
  vm.runInThisContext(source, { filename: "background.js" });
  const handler = globalThis.__SS_handleContextMenuClick;
  assert.equal(typeof handler, "function", "expected the hook to expose the handler");
  return { handler, state };
}

function phraseEntry(text) {
  return { id: `id-${text.length}`, text, enabled: true, created: 1, mode: "exact" };
}

/* ── add-phrase ─────────────────────────────────────────────── */

test("add-phrase success appends the trimmed selection and sends nothing", () => {
  const { handler, state } = loadHandler({ syncStore: { ss_phrases: [] } });
  const returned = handler(
    { menuItemId: MENU_ADD_PHRASE, selectionText: "  Brand new test phrase  " },
    { id: 7, url: "https://example.com/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 1);
  assert.equal(state.setCalls[0].ss_phrases.length, 1);
  assert.equal(state.setCalls[0].ss_phrases[0].text, "Brand new test phrase");
  assert.equal(state.sentMessages.length, 0);
});

test("add-phrase duplicate (case-insensitive) stays silent (site 7)", () => {
  const { handler, state } = loadHandler({
    syncStore: { ss_phrases: [phraseEntry("Hello World")] },
  });
  const returned = handler(
    { menuItemId: MENU_ADD_PHRASE, selectionText: "hello world" },
    { id: 7, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
  assert.equal(state.warns.length, 0);
});

test("add-phrase list cap (200) stays silent (site 6)", () => {
  const phrases = [];
  for (let i = 0; i < 200; i += 1) phrases.push(phraseEntry(`seed phrase ${i}`));
  const { handler, state } = loadHandler({ syncStore: { ss_phrases: phrases } });
  const returned = handler(
    { menuItemId: MENU_ADD_PHRASE, selectionText: "one more phrase" },
    { id: 7, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
});

test("add-phrase whitespace-only selection never touches storage (site 4)", () => {
  const { handler, state } = loadHandler({ syncStore: { ss_phrases: [] } });
  const returned = handler(
    { menuItemId: MENU_ADD_PHRASE, selectionText: "   " },
    { id: 7, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.getCalls.length, 0);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
});

test("add-phrase over-length selection never touches storage (site 5)", () => {
  const { handler, state } = loadHandler({ syncStore: { ss_phrases: [] } });
  const returned = handler(
    { menuItemId: MENU_ADD_PHRASE, selectionText: `x`.repeat(121) },
    { id: 7, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.getCalls.length, 0);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
});

test("add-phrase quota overflow warns once and skips the write (site 8)", () => {
  const { handler, state } = loadHandler({
    syncStore: { ss_phrases: [phraseEntry(`y`.repeat(7700))] },
  });
  const returned = handler(
    { menuItemId: MENU_ADD_PHRASE, selectionText: "quota probe phrase" },
    { id: 7, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
  assert.equal(state.warns.length, 1);
  assert.match(state.warns[0], /quota/);
});

test("add-phrase write failure warns and throws nothing (site 9)", () => {
  const { handler, state } = loadHandler({
    syncStore: { ss_phrases: [] },
    failNextSet: true,
  });
  const returned = handler(
    { menuItemId: MENU_ADD_PHRASE, selectionText: "doomed phrase" },
    { id: 7, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 1);
  assert.equal(state.sentMessages.length, 0);
  assert.equal(state.warns.length, 1);
  assert.match(state.warns[0], /Failed to save phrase/);
});

/* ── block-author ───────────────────────────────────────────── */

test("block-author success stores the real parsed author id and sends nothing", () => {
  const { handler, state } = loadHandler({ syncStore: {} });
  const expected = globalThis.SS_parseAuthorId(
    "https://www.linkedin.com/in/jane-doe-123/",
    "https://www.linkedin.com"
  );
  assert.equal(expected, "jane-doe-123");
  const returned = handler(
    { menuItemId: MENU_BLOCK_AUTHOR, linkUrl: "https://www.linkedin.com/in/jane-doe-123/" },
    { id: 9, url: "https://example.com/with-a-linkedin-link" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 1);
  assert.deepEqual(state.setCalls[0].ss_blocked_authors, ["jane-doe-123"]);
  assert.equal(state.sentMessages.length, 0);
});

test("block-author unparseable link never touches storage (site 1)", () => {
  assert.equal(
    globalThis.SS_parseAuthorId("https://www.linkedin.com/feed/", "https://www.linkedin.com"),
    null
  );
  const { handler, state } = loadHandler({ syncStore: {} });
  const returned = handler(
    { menuItemId: MENU_BLOCK_AUTHOR, linkUrl: "https://www.linkedin.com/feed/" },
    { id: 9, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.getCalls.length, 0);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
});

test("block-author duplicate stays silent (site 2)", () => {
  const { handler, state } = loadHandler({
    syncStore: { ss_blocked_authors: ["jane-doe-123"] },
  });
  const returned = handler(
    { menuItemId: MENU_BLOCK_AUTHOR, linkUrl: "https://www.linkedin.com/in/jane-doe-123/" },
    { id: 9, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
});

test("block-author cap (100) stays silent (site 3)", () => {
  const blocked = [];
  for (let i = 0; i < 100; i += 1) blocked.push(`author-${i}`);
  const { handler, state } = loadHandler({
    syncStore: { ss_blocked_authors: blocked },
  });
  const returned = handler(
    { menuItemId: MENU_BLOCK_AUTHOR, linkUrl: "https://www.linkedin.com/in/newcomer/" },
    { id: 9, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 0);
  assert.equal(state.sentMessages.length, 0);
});

test("block-author write failure warns and throws nothing (bonus site)", () => {
  const { handler, state } = loadHandler({
    syncStore: { ss_blocked_authors: [] },
    failNextSet: true,
  });
  const returned = handler(
    { menuItemId: MENU_BLOCK_AUTHOR, linkUrl: "https://www.linkedin.com/in/doomed-author/" },
    { id: 9, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.setCalls.length, 1);
  assert.equal(state.sentMessages.length, 0);
  assert.equal(state.warns.length, 1);
  assert.match(state.warns[0], /Failed to save blocked author/);
});

/* ── report-missed (out of scope; one sanity case overlapping the
      committed J-suite + the remaining silent branches for completeness) ── */

test("report-missed LinkedIn click dispatches once to the clicked tab (063 overlap)", () => {
  const { handler, state } = loadHandler();
  handler(
    {
      menuItemId: MENU_REPORT_MISSED,
      pageUrl: "https://www.linkedin.com/feed/",
      selectionText: "handler probe text",
    },
    { id: 424242, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(state.sentMessages.length, 1);
  assert.equal(state.sentMessages[0].tabId, 424242);
  assert.equal(state.sentMessages[0].message.action, "reportMissedSpam");
});

test("report-missed non-LinkedIn page stays silent", () => {
  const { handler, state } = loadHandler();
  const returned = handler(
    { menuItemId: MENU_REPORT_MISSED, pageUrl: "https://example.com/", selectionText: "probe" },
    { id: 424242, url: "https://example.com/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.sentMessages.length, 0);
});

test("report-missed missing tab stays silent", () => {
  const { handler, state } = loadHandler();
  const returned = handler(
    {
      menuItemId: MENU_REPORT_MISSED,
      pageUrl: "https://www.linkedin.com/feed/",
      selectionText: "probe",
    },
    undefined
  );
  assert.equal(returned, undefined);
  assert.equal(state.sentMessages.length, 0);
});

test("report-missed no-receiver lastError stays silent with no retry", () => {
  const { handler, state } = loadHandler({ noReceiver: true });
  const returned = handler(
    {
      menuItemId: MENU_REPORT_MISSED,
      pageUrl: "https://www.linkedin.com/feed/",
      selectionText: "probe",
    },
    { id: 424242, url: "https://www.linkedin.com/feed/" }
  );
  assert.equal(returned, undefined);
  assert.equal(state.sentMessages.length, 1);
  assert.equal(state.warns.length, 0);
});
