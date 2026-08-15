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
    /* Count label (021): shows the entry count and no near-cap warning
       for a single short entry. */
    assert.match(
      await optionsPage.locator("#excludedCountLabel").textContent(),
      /1 excluded post|1 publicación excluida/,
      "expected the excluded count label to show one entry"
    );
    assert.ok(
      !(await optionsPage.locator("#excludedCountLabel").textContent()).includes(
        "Near the storage limit"
      ),
      "expected no near-cap warning for a single entry"
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

    /* Scenario 6: an oversized import is byte-pruned before the write,
       and the toast does not claim a full merge (plan 026). ~90 entries
       with 60-char previews serialize past the 8 KB per-item sync quota,
       so the shared pruner must evict until the stored value fits and
       the summary must report the evictions as skipped. */
    await setSyncStorage(context, {
      ss_whitelist: [],
      ss_excluded: [],
      ss_phrases: [],
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    const oversizeExcluded = Array.from({ length: 90 }, (_, i) => ({
      sig: `sig:oversize-${String(i).padStart(3, "0")}`,
      preview: `preview-${String(i).padStart(3, "0")}`.padEnd(60, "x"),
      created: 1770000000000 + i,
    }));
    const prevToast6 = await optionsPage.locator("#toast").textContent();
    await importFileOn(optionsPage, {
      version: 1,
      exportedAt: Date.now(),
      phrases: [],
      whitelist: ["oversize-whitelist-author"],
      excluded: oversizeExcluded,
    });
    const oversizeToast = await waitForToastChange(optionsPage, prevToast6);
    assert.match(
      oversizeToast,
      /skipped|se omitieron/,
      "expected the import summary to report skipped entries after byte pruning"
    );
    assert.match(
      oversizeToast,
      /1 whitelisted author|1 autor en lista blanca/,
      "expected the toast to report the whitelist entry as imported"
    );
    const storedOversize = await waitForSyncValue(context, "ss_excluded", (v) =>
      Array.isArray(v) &&
      v.length > 0 &&
      v.every((e) => e.sig.startsWith("sig:oversize-"))
    );
    assert.ok(
      storedOversize.length < 90,
      "expected byte pruning to drop oversized import entries"
    );
    const storedFitsQuota = await context
      .serviceWorkers()[0]
      .evaluate((value) => {
        const safeLimit = Math.floor(
          chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9
        );
        return "ss_excluded".length + JSON.stringify(value).length <= safeLimit;
      }, storedOversize);
    assert.ok(
      storedFitsQuota,
      "expected stored ss_excluded to fit the sync byte quota"
    );
    const storedWhitelist = await waitForSyncValue(context, "ss_whitelist", (v) =>
      Array.isArray(v) && v.includes("oversize-whitelist-author")
    );
    assert.equal(
      storedWhitelist.length,
      1,
      "expected the single whitelist entry to persist through the import"
    );
    await assertCount(
      optionsPage.locator("#excludedList .whitelist-row"),
      storedOversize.length
    );

    /* Scenario 7: the backup round-trip covers blocked authors, disabled
       patterns, and the feed hide toggles (plan 027). A user whose only
       customization is any of these categories must still export, the
       payload must carry them, and restore must bring them back. */
    await setSyncStorage(context, {
      ss_blocked_authors: ["spam-author-1", "spam-author-2"],
      ss_disabled_patterns: ["ES-1"],
      ss_hide_promoted: true,
      ss_hide_featured: true,
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await optionsPage.locator("#blockedAuthorSection").waitFor({
      state: "visible",
      timeout: 10000,
    });
    await assertCount(optionsPage.locator("#blockedAuthorList .whitelist-row"), 2);

    /* Capture the export payload again (the reload cleared the stub). */
    await optionsPage.evaluate(() => {
      navigator.clipboard.writeText = (text) => {
        window.__capturedExport = text;
        return Promise.resolve();
      };
    });
    const prevToastExport = await optionsPage.locator("#toast").textContent();
    await optionsPage.locator("#exportBtn").click();
    const exportedFull = JSON.parse(
      await optionsPage.waitForFunction(() => window.__capturedExport).then((h) => h.jsonValue())
    );
    assert.deepEqual(exportedFull.blockedAuthors, ["spam-author-1", "spam-author-2"]);
    assert.deepEqual(exportedFull.disabledPatterns, ["ES-1"]);
    assert.equal(exportedFull.hidePromoted, true);
    assert.equal(exportedFull.hideFeatured, true);
    const exportFullToast = await waitForToastChange(optionsPage, prevToastExport);
    assert.match(
      exportFullToast,
      /2 blocked authors|2 autores bloqueados/,
      "expected the export summary to report blocked authors"
    );
    assert.match(
      exportFullToast,
      /1 pattern|1 patr[oó]n/,
      "expected the export summary to report the disabled pattern"
    );

    /* Wipe the new keys, then restore everything from the exported file. */
    await setSyncStorage(context, {
      ss_blocked_authors: [],
      ss_disabled_patterns: [],
      ss_hide_promoted: false,
      ss_hide_featured: false,
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await importFileOn(optionsPage, exportedFull);
    const restoredBlocked = await waitForSyncValue(context, "ss_blocked_authors", (v) =>
      Array.isArray(v) &&
      v.includes("spam-author-1") &&
      v.includes("spam-author-2")
    );
    assert.equal(restoredBlocked.length, 2, "expected both blocked authors after restore");
    await waitForSyncValue(context, "ss_disabled_patterns", (v) =>
      Array.isArray(v) && v.includes("ES-1")
    );
    await waitForSyncValue(context, "ss_hide_promoted", (v) => v === true);
    await waitForSyncValue(context, "ss_hide_featured", (v) => v === true);
    await optionsPage.locator("#blockedAuthorSection").waitFor({
      state: "visible",
      timeout: 10000,
    });
    await assertCount(optionsPage.locator("#blockedAuthorList .whitelist-row"), 2);
    const roundTripToast = await waitForToastChange(
      optionsPage,
      exportFullToast
    );
    assert.match(
      roundTripToast,
      /2 blocked authors|2 autores bloqueados/,
      "expected the import summary to report blocked authors"
    );
    assert.match(
      roundTripToast,
      /1 pattern|1 patr[oó]n/,
      "expected the import summary to report the disabled pattern"
    );

    /* Legacy version: 1 file WITHOUT the new fields must still import
       cleanly and leave the new keys untouched (additive semantics). */
    const prevToastLegacy = await optionsPage.locator("#toast").textContent();
    await importFileOn(optionsPage, {
      version: 1,
      exportedAt: Date.now(),
      phrases: [{ text: "LEGACY SHAPE PHRASE", enabled: true }],
    });
    const legacyToast = await waitForToastChange(optionsPage, prevToastLegacy);
    assert.match(
      legacyToast,
      /Imported 1 phrase|Se import[óo] 1 frase|Se importaron: 1 frase/,
      "expected a legacy file without the new fields to import cleanly"
    );
    assert.deepEqual(
      await getSyncStorage(context, "ss_blocked_authors"),
      ["spam-author-1", "spam-author-2"],
      "expected blocked authors untouched by a legacy file"
    );
    assert.deepEqual(
      await getSyncStorage(context, "ss_disabled_patterns"),
      ["ES-1"],
      "expected disabled patterns untouched by a legacy file"
    );
    assert.equal(
      await getSyncStorage(context, "ss_hide_promoted"),
      true,
      "expected hide-promoted untouched by a legacy file"
    );
    assert.equal(
      await getSyncStorage(context, "ss_hide_featured"),
      true,
      "expected hide-featured untouched by a legacy file"
    );

    /* Reset the plan-027 keys so the following sections start from the
       same deterministic feed state as before this scenario. */
    await setSyncStorage(context, {
      ss_blocked_authors: [],
      ss_disabled_patterns: [],
      ss_hide_promoted: false,
      ss_hide_featured: false,
    });

    /* ── Accented-phrase byte quota (plan 029) ── */

    /* The add-phrase pre-check counts UTF-8 bytes (plan 029). Seed 30
       phrases of 90 accented chars (~7,861 bytes serialized) and add one
       more accented phrase (~8,005-byte candidate). The old UTF-16 unit
       count reported ~5,300 units — under the 95% pre-check limit — so the
       write went through; the UTF-8 byte count trips the pre-check and the
       options page must reject the add with the storage-full toast and
       leave storage untouched. */
    const accentedSeed = Array.from({ length: 30 }, (_, i) => ({
      id: `seed-${String(i).padStart(3, "0")}`,
      text: "é".repeat(90),
      enabled: true,
      created: 1770000000000 + i,
      mode: "exact",
    }));
    await setSyncStorage(context, { ss_phrases: accentedSeed });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await optionsPage.locator(".phrase-row.custom").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    await assertCount(optionsPage.locator(".phrase-row.custom"), 30);

    const boundaryPhrase = "café à la ñ boundary probe üü";
    await optionsPage.locator("#phraseInput").fill(boundaryPhrase);
    await optionsPage.locator("#addBtn").click();
    await assertCount(optionsPage.locator(".phrase-row.custom"), 30);
    assert.match(
      await optionsPage.locator("#toast").textContent(),
      /No more room for phrases|No hay más espacio para frases/,
      "expected the storage-full toast when the accented candidate exceeds the byte budget"
    );
    const storedPhrases = await getSyncStorage(context, "ss_phrases");
    assert.equal(
      storedPhrases.length,
      30,
      "expected the rejected phrase to leave storage untouched"
    );
    assert.ok(
      !storedPhrases.some((p) => p.text === boundaryPhrase),
      "expected the over-budget phrase to be rejected, not persisted"
    );

    await optionsPage.close();

    /* ── "Show all" restore (plan 018) ── */

    /* Deterministic start: the export/import scenarios left an exclusion
       entry, a synthetic whitelist without "trusted", and a cumulative
       persisted block count. Reset all three so a fresh load re-blocks
       exactly spam-1 with one placeholder and blockedCount 1. */
    await setSyncStorage(context, {
      ss_whitelist: ["trusted"],
      ss_excluded: [],
    });
    await setLocalStorage(context, { ss_blocked_count: 0 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(page.locator("[data-ss-ph]"), 1);

    /* The popup messages the active tab. Opening the popup as a page makes
       the popup tab itself active, so bring the feed tab to the front and
       reload the popup — it will then target the feed's content script. */
    await page.bringToFront();
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.locator("#blockedCount").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(
      await popup.locator("#blockedCount").textContent(),
      "1",
      "expected popup to show one blocked post before Show all"
    );

    await popup.locator("#showAllBtn").click();

    await assertCount(page.locator("[data-ss-ph]"), 0);
    await assert.notEqual(
      await page.locator('[data-id="urn:li:activity:spam-1"]').evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected spam post to be visible after Show all"
    );
    await assert.notEqual(
      await page.locator('[data-id="urn:li:activity:whitelisted-1"]').evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected whitelisted post to remain visible after Show all"
    );

    await popup.close();

    /* ── "Report missed spam" (plan 019) ── */

    /* Deterministic start: plan 007's scenario excluded spam-1's text;
       clear it so a fresh load re-blocks exactly one placeholder. */
    await setSyncStorage(context, { ss_excluded: [] });
    await page.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(page.locator("[data-ss-ph]"), 1);

    const reportBtn = page.locator("[data-ss-ph] button", {
      hasText: /Report missed spam|Reportar spam no detectado/,
    });

    /* The content script writes the payload to the real clipboard with a
       user gesture, so granting clipboard permissions on the page origin
       lets us read it back. */
    await context.grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin: "https://www.linkedin.com" }
    );
    await reportBtn.click();

    let copied = "";
    const started = Date.now();
    while (!copied && Date.now() - started < 3000) {
      try {
        copied = await page.evaluate(() => navigator.clipboard.readText());
      } catch (_) {
        /* Permission not effective yet — retry briefly. */
      }
      if (!copied) await page.waitForTimeout(200);
    }

    assert.match(
      copied,
      /Comment "CLAUDE"/,
      "expected the spam excerpt on the clipboard"
    );
    assert.match(
      copied,
      /Trigger: "CLAUDE"/,
      "expected the trigger word in the report payload"
    );
    assert.match(
      copied,
      /LinkedIn page:/,
      "expected the page URL in the report payload"
    );

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
