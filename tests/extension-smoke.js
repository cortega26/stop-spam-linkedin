#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { chromium } = require("playwright");

const {
  mockLinkedInFeed,
  resolveExtensionPath,
  setSyncStorage,
  getSyncStorage,
  setLocalStorage,
  getLocalStorage,
  sendTabMessage,
  assertCount,
} = require("./helpers");

const extensionPath = resolveExtensionPath();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsb-extension-"));

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

    const spamPost = page.locator('[data-id="urn:li:activity:spam-1"]');
    await assert.equal(
      await spamPost.evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected spam post to be hidden before snooze"
    );

    const snoozeResponse = await sendTabMessage(context, { action: "snooze" });
    assert.ok(snoozeResponse, "expected snooze message to reach the content script");

    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(page.locator("[data-ss-ph]"), 0);

    await setLocalStorage(context, { ss_snooze_until: Date.now() - 1000 });

    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(page.locator("[data-ss-ph]"), 1);

    const countBeforeToggle = await getLocalStorage(context, "ss_blocked_count");
    assert.equal(countBeforeToggle, 1, "expected one spam post counted before toggle");

    const offResponse = await sendTabMessage(context, { action: "toggle", enabled: false });
    assert.ok(offResponse, "expected toggle-off message to reach the content script");

    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(page.locator("[data-ss-ph]"), 0);

    const onResponse = await sendTabMessage(context, { action: "toggle", enabled: true });
    assert.ok(onResponse, "expected toggle-on message to reach the content script");

    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(page.locator("[data-ss-ph]"), 1);

    const countAfterToggle = await getLocalStorage(context, "ss_blocked_count");
    assert.equal(
      countAfterToggle,
      countBeforeToggle,
      "expected blocked count unchanged after toggle off/on"
    );

    await page.reload({ waitUntil: "domcontentloaded" });

    const placeholderAfterReload = page.locator("[data-ss-ph]");
    await placeholderAfterReload.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(placeholderAfterReload, 1);

    await page.getByRole("button", { name: /Show|Mostrar/ }).first().click();

    await assertCount(page.locator("[data-ss-ph]"), 0);
    await assert.notEqual(
      await page.locator('[data-id="urn:li:activity:spam-1"]').evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected spam post to be visible after Show"
    );

    await page.evaluate(() => {
      const section = document.querySelector('[data-id="urn:li:activity:spam-1"]');
      const clone = section.cloneNode(true);
      section.replaceWith(clone);
    });

    await page.waitForTimeout(1500);

    await assert.notEqual(
      await page.locator('[data-id="urn:li:activity:spam-1"]').evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected re-created spam post to stay visible during cooldown"
    );
    await assertCount(page.locator("[data-ss-ph]"), 0);

    /* ── Exclusion management (plan 007) ── */

    /* Deterministic start: reload resets the cooldown state to a fresh
       single initial scan — exactly one placeholder. */
    await page.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(page.locator("[data-ss-ph]"), 1);

    const spamPostText = 'Comment "CLAUDE" and I\'ll send you the complete checklist, template, and workflow for free today.';

    await page
      .locator("[data-ss-ph] button", { hasText: /Not spam|No es spam/ })
      .click();
    await assertCount(page.locator("[data-ss-ph]"), 0);

    const storedExcluded = await getSyncStorage(context, "ss_excluded");
    assert.equal(storedExcluded.length, 1, "expected exactly one stored exclusion");
    assert.equal(typeof storedExcluded[0].sig, "string", "expected object-shaped entry with sig");
    assert.ok(
      storedExcluded[0].sig.startsWith("sig:"),
      "expected sig hash in stored exclusion"
    );
    assert.equal(typeof storedExcluded[0].created, "number", "expected created timestamp");
    assert.ok(
      typeof storedExcluded[0].preview === "string" && storedExcluded[0].preview.length > 0,
      "expected non-empty preview in stored exclusion"
    );
    assert.ok(
      spamPostText.startsWith(storedExcluded[0].preview.replace(/…$/, "")) ||
        storedExcluded[0].preview.replace(/…$/, "").startsWith(spamPostText.slice(0, 20)),
      "expected preview to match a prefix of the original post text"
    );

    const worker = context.serviceWorkers()[0];
    const extensionId = new URL(worker.url()).host;
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`, {
      waitUntil: "domcontentloaded",
    });
    await optionsPage.locator("#excludedList .whitelist-row").waitFor({
      state: "visible",
      timeout: 10000,
    });
    await assertCount(optionsPage.locator("#excludedList .whitelist-row"), 1);
    assert.ok(
      (await optionsPage.locator("#excludedList").textContent()).includes(
        storedExcluded[0].preview
      ),
      "expected options page to show the exclusion preview"
    );

    await optionsPage
      .locator("#excludedList .whitelist-row button", { hasText: /Remove|Eliminar/ })
      .first()
      .click();
    await optionsPage
      .locator("#excludedList .whitelist-row button", { hasText: /Click again to confirm|Clic para confirmar/ })
      .first()
      .click();
    await assertCount(optionsPage.locator("#excludedList .whitelist-row"), 0);
    assert.deepEqual(
      await getSyncStorage(context, "ss_excluded"),
      [],
      "expected ss_excluded to be empty after removing the only entry"
    );

    /* Migration path (plan 007): seed legacy bare-hash entries, then a
       fresh options-page load must upgrade them to the object shape
       without dropping any. */
    const legacyEntries = Array.from({ length: 100 }, (_, i) => `sig:legacy-${String(i).padStart(3, "0")}`);
    await setSyncStorage(context, { ss_excluded: legacyEntries });

    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await optionsPage.locator("#excludedList .whitelist-row").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    await assertCount(optionsPage.locator("#excludedList .whitelist-row"), 100);
    assert.match(
      await optionsPage.locator("#excludedList").textContent(),
      /no preview available|vista previa no disponible/,
      "expected legacy entries to show the no-preview fallback text"
    );

    const migrated = await getSyncStorage(context, "ss_excluded");
    assert.equal(migrated.length, 100, "expected no exclusions lost during migration");
    for (const entry of migrated) {
      assert.equal(typeof entry.sig, "string", "expected migrated entry to be object-shaped");
      assert.ok(entry.sig.startsWith("sig:legacy-"), "expected migrated entry to keep its sig");
      assert.equal(entry.preview, null, "expected legacy hash entries to have no preview");
      assert.equal(entry.created, null, "expected legacy hash entries to have no created timestamp");
    }

    /* ── Full settings export/import (plan 009) ── */

    /* Scenario 1: legacy bare-array import must keep working (backward
       compatibility) and use the original phrases-only toast. */
    await importFileOn(optionsPage, [
      { text: "LEGACY IMPORT PHRASE", enabled: true },
    ]);
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) && v.some((p) => p.text === "LEGACY IMPORT PHRASE")
    );
    assert.match(
      await optionsPage.locator("#toast").textContent(),
      /Imported 1 phrase|Se importó 1 frase/,
      "expected legacy import to report the imported phrase"
    );

    /* Scenario 2: versioned export round-trips phrases + whitelist +
       exclusions + languages. */
    const exportPhrase = {
      id: "p-export",
      text: "ROUND TRIP PHRASE",
      enabled: true,
      created: 1770000000000,
      mode: "exact",
    };
    await setSyncStorage(context, {
      ss_phrases: [exportPhrase],
      ss_whitelist: ["jane-doe"],
      ss_excluded: [
        { sig: "sig:rt-001", preview: "Round trip preview", created: 1770000000001 },
      ],
      ss_enabled_langs: ["EN", "ES", "FR", "PT", "DE"],
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await optionsPage.locator("#excludedList .whitelist-row").waitFor({
      state: "visible",
      timeout: 10000,
    });
    await assertCount(optionsPage.locator("#excludedList .whitelist-row"), 1);

    /* Capture the export payload by stubbing writeText: readText is
       permission-denied on extension origins and grantPermissions
       rejects them, while writeText itself is not stubbed in prod. */
    await optionsPage.evaluate(() => {
      navigator.clipboard.writeText = (text) => {
        window.__capturedExport = text;
        return Promise.resolve();
      };
    });
    await optionsPage.locator("#exportBtn").click();
    const exported = JSON.parse(
      await optionsPage.waitForFunction(() => window.__capturedExport).then((h) => h.jsonValue())
    );
    assert.equal(exported.version, 1, "expected versioned export payload");
    assert.equal(exported.phrases.length, 1, "expected one exported phrase");
    assert.equal(exported.phrases[0].text, "ROUND TRIP PHRASE");
    assert.deepEqual(exported.whitelist, ["jane-doe"]);
    assert.equal(exported.excluded.length, 1);
    assert.equal(exported.excluded[0].sig, "sig:rt-001");
    assert.deepEqual(exported.langs, ["EN", "ES", "FR", "PT", "DE"]);
    assert.match(
      await optionsPage.locator("#toast").textContent(),
      /export/i,
      "expected export summary toast"
    );

    /* Wipe local state, then restore everything from the exported file. */
    await setSyncStorage(context, {
      ss_phrases: [],
      ss_whitelist: [],
      ss_excluded: [],
      ss_enabled_langs: ["EN"],
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await importFileOn(optionsPage, exported);
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) && v.some((p) => p.text === "ROUND TRIP PHRASE")
    );
    await waitForSyncValue(context, "ss_whitelist", (v) =>
      Array.isArray(v) && v.includes("jane-doe")
    );
    await waitForSyncValue(context, "ss_excluded", (v) =>
      Array.isArray(v) && v.some((e) => e.sig === "sig:rt-001")
    );
    await waitForSyncValue(context, "ss_enabled_langs", (v) =>
      Array.isArray(v) && v.length === 5 && v.includes("ES")
    );
    assert.match(
      await optionsPage.locator("#toast").textContent(),
      /Imported 1 phrase|Se importaron: 1 frase/,
      "expected consolidated import summary toast"
    );

    /* Scenario 3: import merges, never replaces — pre-existing local
       entries and imported entries must coexist. */
    const prevToast = await optionsPage.locator("#toast").textContent();
    await setSyncStorage(context, {
      ss_phrases: [
        { id: "p-existing", text: "EXISTING PHRASE", enabled: true, created: 1, mode: "exact" },
      ],
      ss_whitelist: ["existing-author"],
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await importFileOn(optionsPage, {
      version: 1,
      exportedAt: Date.now(),
      phrases: [{ text: "NEW MERGED PHRASE", enabled: true }],
      whitelist: ["new-author"],
    });
    const mergedPhrases = await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) &&
      v.some((p) => p.text === "NEW MERGED PHRASE") &&
      v.some((p) => p.text === "EXISTING PHRASE")
    );
    assert.equal(mergedPhrases.length, 2, "expected both phrases after merge");
    const mergedWhitelist = await waitForSyncValue(context, "ss_whitelist", (v) =>
      Array.isArray(v) &&
      v.includes("new-author") &&
      v.includes("existing-author")
    );
    assert.equal(mergedWhitelist.length, 2, "expected both authors after merge");
    await waitForToastChange(optionsPage, prevToast);

    /* Scenario 4: whitelist cap is respected — the over-cap entry is
       skipped and reported, not silently added. */
    const fullWhitelist = Array.from(
      { length: 100 },
      (_, i) => `author-${String(i).padStart(3, "0")}`
    );
    await setSyncStorage(context, { ss_whitelist: fullWhitelist });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    const prevToast4 = await optionsPage.locator("#toast").textContent();
    await importFileOn(optionsPage, {
      version: 1,
      exportedAt: Date.now(),
      phrases: [],
      whitelist: ["author-over-cap"],
    });
    const cappedWhitelist = await waitForSyncValue(context, "ss_whitelist", (v) =>
      Array.isArray(v) && v.length === 100
    );
    assert.ok(
      !cappedWhitelist.includes("author-over-cap"),
      "expected over-cap whitelist entry to be skipped"
    );
    const capToast = await waitForToastChange(optionsPage, prevToast4);
    assert.match(capToast, /No new entries imported|entradas nuevas/);
    assert.match(capToast, /1 skipped|se omitieron 1/, "expected skip count in toast");

    /* Scenario 5: an unrecognized shape is rejected cleanly with no
       partial state change. */
    await setSyncStorage(context, {
      ss_phrases: [
        { id: "p-guard", text: "GUARD PHRASE", enabled: true, created: 1, mode: "exact" },
      ],
    });
    const phrasesBefore = await getSyncStorage(context, "ss_phrases");
    const prevToast5 = await optionsPage.locator("#toast").textContent();
    await importFileOn(optionsPage, { foo: 1 });
    const badToast = await waitForToastChange(optionsPage, prevToast5);
    assert.match(badToast, /Invalid JSON file|JSON no válido/);
    assert.deepEqual(
      await getSyncStorage(context, "ss_phrases"),
      phrasesBefore,
      "expected no state change from an unrecognized import shape"
    );

    await optionsPage.close();

    console.log("Extension smoke test passed.");
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function importFileOn(optionsPage, data) {
  await optionsPage.locator("#importFile").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}

async function waitForSyncValue(context, key, predicate, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    const value = await getSyncStorage(context, key);
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${key} to satisfy predicate`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function waitForToastChange(optionsPage, prevText, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    const text = await optionsPage.locator("#toast").textContent();
    if (text && text !== prevText) return text;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`toast never changed; last text: "${prevText}"`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
