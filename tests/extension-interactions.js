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
  getExtensionId,
  sendTabMessage,
  assertCount,
} = require("./helpers");

const extensionPath = resolveExtensionPath();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsb-interactions-"));

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

    const linkedInPage = await context.newPage();
    await linkedInPage.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
    });

    const placeholder = linkedInPage.locator("[data-ss-ph]");
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* ── Popup: live state + undo (plan 014 step 2) ─────────────── */

    /* The popup messages the ACTIVE tab, so the mock feed tab must stay
       focused for every popup interaction. Opening the popup focuses its
       own tab, so after opening it we refocus the feed and reload the
       popup: its refresh then reaches the content script and shows live
       state (blocked count + last-blocked rows) instead of the fallback. */
    const popup = await context.newPage();
    await popup.goto(
      `chrome-extension://${await getExtensionId(context)}/popup/popup.html`,
      { waitUntil: "domcontentloaded" }
    );

    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });

    await popup.waitForFunction(
      () =>
        document.querySelectorAll(".last-blocked-item").length >= 1 &&
        getComputedStyle(document.getElementById("noConnection")).display === "none" &&
        document.getElementById("blockedCount").textContent === "1",
      { timeout: 10000 }
    );
    assert.equal(
      await popup.locator("#blockedCount").textContent(),
      "1",
      "expected popup to show one blocked post"
    );

    /* Stats (plan 035): the single block must land in today's local-day
       bucket in storage, and the popup must sum it into the today, 7-day,
       and lifetime counters. */
    await waitForLocalValue(context, "ss_daily_counts", (v) =>
      v !== undefined && typeof v === "object" && Object.keys(v).length === 1
    );
    const dailyCounts = await getLocalStorage(context, "ss_daily_counts");
    const expectedDayKey = getLocalDayKey();
    assert.deepEqual(
      Object.keys(dailyCounts),
      [expectedDayKey],
      "expected ss_daily_counts to hold exactly one key for today's local day"
    );
    assert.equal(dailyCounts[expectedDayKey], 1, "expected one block counted for today");
    assert.equal(
      await popup.locator("#todayCount").textContent(),
      "1",
      "expected today counter to show one block"
    );
    assert.equal(
      await popup.locator("#weekCount").textContent(),
      "1",
      "expected 7-day counter to show one block"
    );
    assert.equal(
      await popup.locator("#lifetimeCount").textContent(),
      "1",
      "expected lifetime counter to show one block"
    );

    /* By-pattern breakdown (plan 053): the single built-in block must
       render in the popup's pattern section as one EN-1 bucket. */
    await popup.waitForFunction(
      () => document.querySelectorAll(".pattern-item").length === 1,
      null,
      { timeout: 10000 }
    );
    assert.equal(
      await popup
        .locator(".pattern-item", { hasText: /comment "WORD"/ })
        .locator(".pattern-count")
        .textContent(),
      "1",
      "expected popup pattern row to show one EN-1 block"
    );

    await linkedInPage.bringToFront();
    await popup.locator(".lb-undo").first().click();

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 0);

    /* ── Popup: undo resolves by stable id, not index (021) ─────── */

    /* Reload for a deterministic blocked state (the undo above put
       spam-1 on the re-block cooldown). */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Block a second post so the popup renders two undo rows. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:spam-2";
      section.innerHTML =
        '<p>Comment "CLAUDE" and I\'ll send you the second checklist for free today.</p>';
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 2,
      { timeout: 10000 }
    );

    /* Snapshot the two rows: row 0 = spam-2, row 1 = spam-1. */
    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.waitForFunction(
      () => document.querySelectorAll(".last-blocked-item").length === 2,
      { timeout: 10000 }
    );

    /* A third block lands AFTER the popup rendered its rows, shifting
       indices to [spam-3, spam-2, spam-1]. The clicked row must still
       resolve to spam-1 by its stable id — index lookup would restore
       spam-2 instead. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:spam-3";
      section.innerHTML =
        '<p>Comment "CLAUDE" and I\'ll send you the third checklist for free today.</p>';
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 3,
      { timeout: 10000 }
    );

    await linkedInPage.bringToFront();
    await popup.locator(".lb-undo").nth(1).click();

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    const spam2Display = await linkedInPage
      .locator('[data-id="urn:li:activity:spam-2"]')
      .evaluate((el) => getComputedStyle(el).display);
    const spam3Display = await linkedInPage
      .locator('[data-id="urn:li:activity:spam-3"]')
      .evaluate((el) => getComputedStyle(el).display);
    assert.equal(spam2Display, "none", "undo must restore spam-1, not the index-shifted spam-2");
    assert.equal(spam3Display, "none", "spam-3 must stay hidden");
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* ── Whitelist add un-hides that author's blocked posts (021) ── */

    /* Reload for a deterministic state; the injected spam-2/spam-3
       nodes above were part of the previous document. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* A spam post whose author is NOT yet whitelisted. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:spam-author-1";
      section.innerHTML =
        '<div class="update-components-actor">' +
        '<a href="/in/spam-author/">Spam Author</a>' +
        "</div>" +
        '<p>Comment "CLAUDE" and I\'ll send you the checklist for free today.</p>';
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 2,
      { timeout: 10000 }
    );
    const hiddenBefore = await linkedInPage
      .locator('[data-id="urn:li:activity:spam-author-1"]')
      .evaluate((el) => getComputedStyle(el).display);
    assert.equal(hiddenBefore, "none", "spam-author-1 must be blocked before whitelisting");

    /* Whitelisting the author in options/storage must un-hide their
       posts, exactly like the in-flow "Never block this author" button. */
    await setSyncStorage(context, { ss_whitelist: ["trusted", "spam-author"] });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:spam-author-1"]',
      { timeout: 4000 }
    );
    const spam1Display = await linkedInPage
      .locator('[data-id="urn:li:activity:spam-1"]')
      .evaluate((el) => getComputedStyle(el).display);
    assert.equal(spam1Display, "none", "unrelated post must stay hidden");
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* ── Same-tab whitelist restore: "Never block this author"
       un-hides ALL of that author's posts in the writing tab (023) ─ */

    /* Reload for a deterministic state; the injected spam-author-1
       node above was part of the previous document. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Two posts by the SAME author, each blocked on text. With the
       bug, the onChanged diff compared against the live whitelist set
       (already mutated by the button handler), so the writing tab
       restored only the clicked post — the other stayed hidden. */
    await linkedInPage.evaluate(() => {
      for (const id of ["same-author-1", "same-author-2"]) {
        const section = document.createElement("section");
        section.dataset.id = `urn:li:activity:${id}`;
        section.innerHTML =
          '<div class="update-components-actor">' +
          '<a href="/in/same-author/">Same Author</a>' +
          "</div>" +
          '<p>Comment "CLAUDE" and I\'ll send you the checklist for free today.</p>';
        document.querySelector("main").appendChild(section);
      }
    });
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 3,
      { timeout: 10000 }
    );

    /* Click "Never block this author" on the FIRST injected post's
       placeholder; only same-author posts carry that button here. */
    await linkedInPage
      .locator("[data-ss-ph] button", {
        hasText: /Never block|No bloquear/,
      })
      .first()
      .click();

    /* Both of the author's posts must un-hide in THIS tab — the
       regression this fix enables. spam-1 stays hidden. */
    await linkedInPage.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector('[data-id="urn:li:activity:same-author-1"]')
        ).display !== "none" &&
        getComputedStyle(
          document.querySelector('[data-id="urn:li:activity:same-author-2"]')
        ).display !== "none",
      { timeout: 4000 }
    );
    const spam1DisplaySameTab = await linkedInPage
      .locator('[data-id="urn:li:activity:spam-1"]')
      .evaluate((el) => getComputedStyle(el).display);
    assert.equal(spam1DisplaySameTab, "none", "unrelated post must stay hidden");
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 1,
      { timeout: 4000 }
    );
    const sameTabWhitelist = await getSyncStorage(context, "ss_whitelist");
    assert.ok(
      Array.isArray(sameTabWhitelist) && sameTabWhitelist.includes("same-author"),
      "expected same-author to be written to the whitelist"
    );

    /* ── Popup: toggle off/on (plan 014 step 3.1-3.2) ───────────── */

    /* The undo above put spam-1 on the 15-minute re-block cooldown
       (plan 013), so reload first for a deterministic blocked state. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    await linkedInPage.bringToFront();
    await popup.locator("label.toggle").click();

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 0);
    await waitForSyncValue(context, "ss_enabled", (v) => v === false);

    await linkedInPage.bringToFront();
    await popup.locator("label.toggle").click();

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);
    await waitForSyncValue(context, "ss_enabled", (v) => v === true);

    /* ── Popup: snooze + cancel snooze (plan 014 step 3.3-3.4) ──── */

    await linkedInPage.bringToFront();
    await popup.locator("#snoozeBtn").click();

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:spam-1"]',
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 0);
    const snoozeUntil = await getLocalStorage(context, "ss_snooze_until");
    assert.ok(
      typeof snoozeUntil === "number" && snoozeUntil > Date.now() + 25 * 60 * 1000,
      "expected a ~30-minute snooze window in storage"
    );

    /* The button label switches to the cancel variant once snoozed. No DOM
       re-blocking assertion here — plan 002 owns the snooze-resume flow. */
    await linkedInPage.bringToFront();
    await popup.locator("#snoozeBtn").click();
    await waitForLocalValue(context, "ss_snooze_until", (v) => v === 0);

    /* ── Snooze→resume leaves a single undo row (028) ───────────── */

    /* The cancel wrote ss_snooze_until: 0, which makes the content
       script re-scan immediately and re-block the post. */
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 1,
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* The undo window must hold exactly ONE row for the post. With the
       bug, restoreBlocked leaves lastBlocked untouched, so every bulk
       restore → re-scan cycle (snooze, disable) pushes a fresh row for
       the same post and the popup renders duplicates. */
    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.waitForFunction(
      () => document.querySelectorAll(".last-blocked-item").length === 1,
      { timeout: 10000 }
    );
    assert.equal(
      await popup.locator(".last-blocked-item").count(),
      1,
      "expected exactly one undo row after snooze→resume"
    );

    /* ── Popup: reset count (plan 014 step 3.5) ─────────────────── */

    await linkedInPage.bringToFront();
    await popup.locator("#resetBtn").click();
    await popup.locator("#resetBtn").click();
    await waitForLocalValue(context, "ss_blocked_count", (v) => v === 0);

    /* Stats reset (plan 035): the daily buckets must empty to exactly {}
       and the popup counters must re-render to 0. */
    assert.deepEqual(
      await waitForLocalValue(context, "ss_daily_counts", (v) =>
        v !== undefined && typeof v === "object" && Object.keys(v).length === 0
      ),
      {},
      "expected ss_daily_counts to be exactly {} after reset"
    );
    assert.deepEqual(
      await waitForLocalValue(context, "ss_pattern_counts", (v) =>
        v !== undefined && typeof v === "object" && Object.keys(v).length === 0
      ),
      {},
      "expected ss_pattern_counts to be exactly {} after reset"
    );
    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.waitForFunction(
      () =>
        getComputedStyle(document.getElementById("noConnection")).display === "none" &&
        document.getElementById("blockedCount").textContent === "0",
      { timeout: 10000 }
    );
    assert.equal(
      await popup.locator("#todayCount").textContent(),
      "0",
      "expected today counter to show zero after reset"
    );
    assert.equal(
      await popup.locator("#weekCount").textContent(),
      "0",
      "expected 7-day counter to show zero after reset"
    );
    assert.equal(
      await popup.locator("#lifetimeCount").textContent(),
      "0",
      "expected lifetime counter to show zero after reset"
    );
    assert.equal(
      await popup
        .locator("#patternSection")
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the by-pattern section to be hidden after reset"
    );

    /* ── Placeholder: never block this author + author scoping
          (plan 014 step 4.2-4.3) ─────────────────────────────────── */

    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* The shared fixture stays at 3 sections so every other scenario's
       placeholder counts are unaffected; this section is appended here
       only, for the never-block-author flow. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:author-block-1";
      const actor = document.createElement("div");
      actor.className = "update-components-actor";
      const link = document.createElement("a");
      link.href = "/in/spammer/";
      link.textContent = "Spammy Author";
      actor.appendChild(link);
      section.appendChild(actor);
      const p = document.createElement("p");
      p.textContent =
        'Comment "SECRET" and I\'ll send you the full growth framework, ' +
        "template pack, and checklist right now today.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:author-block-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    await linkedInPage
      .locator("[data-ss-ph] button", {
        hasText: /Never block this author|No bloquear a este autor/,
      })
      .click();

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:author-block-1"]',
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);
    const whitelist = await getSyncStorage(context, "ss_whitelist");
    assert.ok(
      Array.isArray(whitelist) && whitelist.includes("spammer"),
      "expected spammer to be written to the whitelist"
    );

    /* The same text with a different author must still be blocked —
       proves the whitelist is author-scoped, not text-scoped. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:spam-3";
      const actor = document.createElement("div");
      actor.className = "update-components-actor";
      const link = document.createElement("a");
      link.href = "/in/other-spammer/";
      link.textContent = "Other Spammy Author";
      actor.appendChild(link);
      section.appendChild(actor);
      const p = document.createElement("p");
      p.textContent =
        'Comment "SECRET" and I\'ll send you the full growth framework, ' +
        "template pack, and checklist right now today.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:spam-3"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* ── Options page (plan 014 step 5; import is skipped — plan 009
          already covers it in the smoke file) ───────────────────── */

    const optionsPage = await context.newPage();
    await optionsPage.goto(
      `chrome-extension://${await getExtensionId(context)}/options/options.html`,
      { waitUntil: "domcontentloaded" }
    );
    await optionsPage.locator("#langToggles .lang-tog").first().waitFor({
      state: "visible",
      timeout: 10000,
    });

    /* Add phrase */
    await optionsPage.locator("#phraseInput").fill("TESTWORD");
    await optionsPage.locator("#addBtn").click();
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) &&
      v.some((p) => p.text === "TESTWORD" && p.enabled === true)
    );

    /* Toggle the custom phrase off */
    const testwordRow = optionsPage.locator(".phrase-row.custom", { hasText: "TESTWORD" });
    await testwordRow.locator("label.toggle").click();
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) &&
      v.some((p) => p.text === "TESTWORD" && p.enabled === false)
    );

    /* Edit it to TESTWORD2 */
    await testwordRow.locator(".actions button", { hasText: /Edit|Editar/ }).click();
    await optionsPage.locator(".edit-row input").fill("TESTWORD2");
    await optionsPage.locator(".edit-row input").press("Enter");
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) &&
      v.some((p) => p.text === "TESTWORD2") &&
      !v.some((p) => p.text === "TESTWORD")
    );

    /* Delete it (two-click confirmation) */
    const renamedRow = optionsPage.locator(".phrase-row.custom", { hasText: "TESTWORD2" });
    await renamedRow.locator(".actions button", { hasText: /Delete|Eliminar/ }).click();
    await optionsPage.locator(".phrase-row.custom .actions button.confirming").click();
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) && !v.some((p) => p.text === "TESTWORD2")
    );

    /* Language toggles: disable and re-enable Spanish */
    await optionsPage.locator(".lang-tog", { hasText: "Español" }).click();
    await waitForSyncValue(context, "ss_enabled_langs", (v) =>
      Array.isArray(v) && !v.includes("ES")
    );
    await optionsPage.locator(".lang-tog", { hasText: "Español" }).click();
    await waitForSyncValue(context, "ss_enabled_langs", (v) =>
      Array.isArray(v) && v.includes("ES")
    );

    /* ── Edit preservation (plan 030) ──────────────────────────── */

    /* An in-progress edit must survive the re-render a sibling toggle
       triggers: the edit input keeps the typed draft (not the stored
       text) and keeps focus, and the toggle still persists. */
    await optionsPage.locator("#phraseInput").fill("PHRASE A");
    await optionsPage.locator("#addBtn").click();
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) && v.some((p) => p.text === "PHRASE A")
    );
    await optionsPage.locator("#phraseInput").fill("PHRASE B");
    await optionsPage.locator("#addBtn").click();
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) && v.some((p) => p.text === "PHRASE B")
    );

    const phraseARow = optionsPage.locator(".phrase-row.custom", { hasText: "PHRASE A" });
    const phraseBRow = optionsPage.locator(".phrase-row.custom", { hasText: "PHRASE B" });

    /* Start editing phrase A and type a draft (without saving). */
    await phraseARow.locator(".actions button", { hasText: /Edit|Editar/ }).click();
    await optionsPage.locator(".edit-row input").fill("PHRASE A DRAFT");

    /* Toggle phrase B's enable switch: save() → render() → onChanged. */
    await phraseBRow.locator("label.toggle").click();

    /* The toggle persisted: storage and B's row both show the new state. */
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) &&
      v.some((p) => p.text === "PHRASE B" && p.enabled === false)
    );
    assert.equal(
      await phraseBRow.locator("label.toggle input").isChecked(),
      false,
      "expected phrase B's toggle state to reflect the storage write"
    );

    /* The edit row for A must still hold the draft and keep focus. */
    assert.equal(
      await optionsPage.locator(".edit-row input").inputValue(),
      "PHRASE A DRAFT",
      "expected the in-progress edit to survive the sibling-toggle re-render"
    );
    assert.equal(
      await optionsPage.evaluate(() =>
        !!document.activeElement && document.activeElement.matches(".edit-row input")
      ),
      true,
      "expected focus to stay in the edit input after the re-render"
    );

    /* Cancel the edit to leave clean state for the next scenario. */
    await optionsPage.locator(".edit-row input").press("Escape");

    /* ── Attribution: which pattern matched (plan 010) ─────────── */

    /* Deterministic start: no custom phrases, fresh feed. spam-1 matches
       the EN built-in pattern only. */
    await setSyncStorage(context, { ss_phrases: [] });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Built-in attribution: the popup must show the built-in pattern's
       label, and the trigger-word suggestion chip must appear (suggestions
       fire for built-in matches only). */
    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.locator(".last-blocked-item").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.match(
      await popup.locator(".last-blocked-item .lb-match").first().textContent(),
      /(?:Matched|Coincide con): comment "WORD" and I'll send \/ share \.\.\./,
      "expected the built-in EN pattern label on the last-blocked row"
    );
    await popup.locator(".suggestion-item").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.match(
      await popup.locator(".suggestion-item .suggestion-text").first().textContent(),
      /CLAUDE/,
      "expected a trigger-word suggestion for a built-in match"
    );

    /* Custom-only: a phrase no built-in pattern covers. The block must
       attribute to the custom phrase's own text, and no suggestion may be
       offered for that phrase. */
    await setSyncStorage(context, {
      ss_phrases: [{ text: "TEMPLATE PACK", enabled: true, mode: "exact" }],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:custom-1";
      const p = document.createElement("p");
      p.textContent = "Send me the template pack to get the full guide.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:custom-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.locator(".last-blocked-item").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.match(
      await popup.locator(".last-blocked-item .lb-match").first().textContent(),
      /(?:Matched|Coincide con): TEMPLATE PACK$/,
      "expected the custom phrase's own text as the label for a custom match"
    );
    const suggestionTexts = await popup.locator(".suggestion-text").allTextContents();
    assert.ok(
      suggestionTexts.every((t) => !t.includes("TEMPLATE PACK")),
      "expected no suggestion for the custom-phrase match"
    );

    /* Overlap case (plan 010 Decision 2): the custom exact phrase
       "CLAUDE" also falls inside the built-in EN pattern's quoted-word
       matching, so both cover spam-1's text. The block must attribute to
       the custom phrase (not the generic built-in label), and the
       trigger-word suggestion must not fire. */
    await setSyncStorage(context, {
      ss_phrases: [{ text: "CLAUDE", enabled: true, mode: "exact" }],
    });
    /* Plan 054: restore-on-boot now survives reloads, so the CLAUDE
       suggestion pushed earlier in this scenario legitimately persists
       into this reload (the design's prototype finding — the original
       assertion encoded wipe-on-reload semantics). Reset the persisted
       queue so this scenario keeps asserting its real invariant: a
       custom-covered match never pushes a suggestion. */
    await setLocalStorage(context, {
      ss_pending_suggestions: [],
      ss_dismissed_suggestions: [],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.locator(".last-blocked-item").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    const overlapLabel = await popup
      .locator(".last-blocked-item .lb-match")
      .first()
      .textContent();
    assert.match(
      overlapLabel,
      /(?:Matched|Coincide con): CLAUDE$/,
      "expected the custom phrase to win attribution over the built-in pattern"
    );
    assert.doesNotMatch(
      overlapLabel,
      /comment "WORD"/,
      "expected no generic built-in label for the overlap case"
    );
    assert.equal(
      await popup.locator(".suggestion-item").count(),
      0,
      "expected no trigger-word suggestion when a custom phrase covers the match"
    );

    /* Restore a clean custom-phrase state for any future scenarios. */
    await setSyncStorage(context, { ss_phrases: [] });

    /* ── Suggestion persistence (plan 054) ─────────────────────── */

    /* Dismiss-then-reload: a dismissed word must NOT be re-suggested
       after the feed reloads. On pre-build code this scenario fails —
       dismissals were in-memory, so the reload re-suggests the word. */
    await setSyncStorage(context, { ss_phrases: [] });
    await setLocalStorage(context, { ss_pending_suggestions: [], ss_dismissed_suggestions: [] });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* The single built-in match offers exactly one suggestion (CLAUDE). */
    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.locator(".suggestion-item").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await popup.locator(".suggestion-item").count(),
      1,
      "expected exactly one pending suggestion from the single built-in match"
    );

    /* Dismiss from the live popup; the dismissal must reach storage.
       The section is hidden (not emptied) when the queue drains, so
       assert on its computed display, not the row count. */
    await popup.locator(".suggestion-dismiss").first().click();
    await popup.waitForFunction(
      () => getComputedStyle(document.getElementById("suggestionSection")).display === "none",
      null,
      { timeout: 10000 }
    );
    await waitForLocalValue(context, "ss_dismissed_suggestions", (v) =>
      Array.isArray(v) && v.includes("CLAUDE")
    );

    /* Reload: the same built-in match must NOT re-suggest CLAUDE. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);
    await linkedInPage.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.locator(".last-blocked-item").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await popup.locator(".suggestion-item").count(),
      0,
      "expected the dismissed word NOT to be re-suggested after reload"
    );

    /* Clean the persisted dismissals for the scenarios that follow. */
    await setLocalStorage(context, { ss_pending_suggestions: [], ss_dismissed_suggestions: [] });

    /* Options surface: Add as contains writes a contains-mode phrase,
       Add as exact writes an exact-mode phrase, and the plan 056 guard
       refuses a suggestion equal to an existing never-hide phrase. */
    await setSyncStorage(context, { ss_phrases: [], ss_allow_phrases: [] });
    await setLocalStorage(context, {
      ss_pending_suggestions: [
        { word: "CLAUDE", timestamp: Date.now() },
        { word: "PDF", timestamp: Date.now() },
      ],
      ss_dismissed_suggestions: [],
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await optionsPage.locator("#suggestionSection").waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await optionsPage.locator("#suggestionList .whitelist-row").count(),
      2,
      "expected the options section to list every pending suggestion"
    );

    /* Add as contains: the safer mode the popup cannot offer. */
    await optionsPage
      .locator("#suggestionList .whitelist-row", { hasText: "PDF" })
      .locator("button", { hasText: /contains|contiene/i })
      .click();
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) && v.some((p) => p.text === "PDF" && p.mode === "contains")
    );
    await waitForLocalValue(context, "ss_pending_suggestions", (v) =>
      Array.isArray(v) && !v.some((s) => s.word === "PDF")
    );

    /* Add as exact: the popup's default mode, available here too. */
    await optionsPage
      .locator("#suggestionList .whitelist-row", { hasText: "CLAUDE" })
      .locator("button", { hasText: /exact|exacta/i })
      .click();
    await waitForSyncValue(context, "ss_phrases", (v) =>
      Array.isArray(v) && v.some((p) => p.text === "CLAUDE" && p.mode === "exact")
    );
    await optionsPage.waitForFunction(
      () => getComputedStyle(document.getElementById("suggestionSection")).display === "none",
      null,
      { timeout: 10000 }
    );

    /* Plan 056 conflict guard: a suggestion equal to an existing
       never-hide phrase must be refused without writing anything. */
    await setSyncStorage(context, {
      ss_phrases: [],
      ss_allow_phrases: [{ id: "allow-claude", text: "CLAUDE", created: Date.now() }],
    });
    await setLocalStorage(context, {
      ss_pending_suggestions: [{ word: "CLAUDE", timestamp: Date.now() }],
    });
    await optionsPage.reload({ waitUntil: "domcontentloaded" });
    await optionsPage.locator("#suggestionSection").waitFor({
      state: "visible",
      timeout: 10000,
    });
    await optionsPage
      .locator("#suggestionList .whitelist-row", { hasText: "CLAUDE" })
      .locator("button", { hasText: /exact|exacta/i })
      .click();
    await optionsPage.waitForFunction(
      () => document.getElementById("toast").textContent.length > 0,
      null,
      { timeout: 10000 }
    );
    assert.match(
      await optionsPage.locator("#toast").textContent(),
      /already a custom phrase|ya es una frase personalizada/,
      "expected the allow-conflict toast for a suggestion matching a never-hide phrase"
    );
    await waitForLocalValue(context, "ss_pending_suggestions", (v) =>
      Array.isArray(v) && v.some((s) => s.word === "CLAUDE")
    );
    assert.deepEqual(
      await getSyncStorage(context, "ss_phrases"),
      [],
      "expected no phrase to be written for a conflicting suggestion add"
    );

    /* Clean up for the scenarios that follow. */
    await setSyncStorage(context, { ss_phrases: [], ss_allow_phrases: [] });
    await setLocalStorage(context, { ss_pending_suggestions: [], ss_dismissed_suggestions: [] });

    /* Popup fallback (plan 054 §5 decision — read-only): with no live
       LinkedIn tab responding, the popup renders the persisted queue
       instead of the old hardcoded empty list. Add/Dismiss stay on the
       live path, so the fallback shows a hint instead of buttons. */
    await setLocalStorage(context, {
      ss_pending_suggestions: [{ word: "FALLBACKWORD", timestamp: Date.now() }],
    });
    await popup.bringToFront();
    await popup.reload({ waitUntil: "domcontentloaded" });
    await popup.locator(".suggestion-item").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.match(
      await popup.locator(".suggestion-item .suggestion-text").first().textContent(),
      /FALLBACKWORD/,
      "expected the persisted queue to render in the popup fallback"
    );
    assert.equal(
      await popup.locator(".suggestion-item .suggestion-add").count(),
      0,
      "expected no Add button in the read-only popup fallback"
    );
    assert.equal(
      await popup.locator(".suggestion-item .suggestion-dismiss").count(),
      0,
      "expected no Dismiss button in the read-only popup fallback"
    );
    assert.equal(
      await popup.locator(".suggestion-fallback-hint").count(),
      1,
      "expected the fallback hint pointing to a LinkedIn tab"
    );
    assert.equal(
      await popup.locator("#connectionNotice").evaluate((el) => getComputedStyle(el).display),
      "block",
      "expected the no-live-tab notice in the popup fallback"
    );

    /* Restore focus to the feed and clear the seeded queue. */
    await linkedInPage.bringToFront();
    await setLocalStorage(context, { ss_pending_suggestions: [], ss_dismissed_suggestions: [] });

    /* ── Per-pattern disable (plan 011) ─────────────────────────── */

    /* Deterministic start: no custom phrases, no disabled patterns.
       Fixture post ids: en2-only-1 matches ONLY EN-2 ("WORD" and I will
       send ...), en1-only-1 matches ONLY EN-1 (comment/type "WORD" and
       I'll send ... — verified against both regexes at plan time),
       es1-only-1 matches ONLY ES-1 (comenta "WORD" y te comparto ...). */
    await setSyncStorage(context, { ss_phrases: [], ss_disabled_patterns: [] });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Baseline: with both EN patterns enabled, the EN-2-only post is
       blocked too. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:en2-only-1";
      const p = document.createElement("p");
      p.textContent =
        '"TEMPLATE" and I will send you the full checklist, ' +
        "template, and workflow for free today.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:en2-only-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* Disable EN-1 via the options page's per-pattern toggle. */
    const en1Row = optionsPage.locator(".phrase-row.builtin", {
      hasText: 'comment "WORD"',
    });
    await en1Row.locator("label.toggle").click();
    await waitForSyncValue(context, "ss_disabled_patterns", (v) =>
      Array.isArray(v) && v.includes("EN-1")
    );

    /* Reload: spam-1 matches EN-1 AND EN-2, so it must stay blocked
       (proves EN-2 is unaffected by EN-1's disablement). The EN-1-only
       fixture must stay VISIBLE (proves EN-1 is genuinely off). */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:en1-only-1";
      const p = document.createElement("p");
      p.textContent =
        "Type MAGIC and I'll send you the complete checklist, " +
        "template, and workflow for free today.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });
    /* Watch the placeholder count for ~4s: any block of the EN-1-only
       post would raise it to 2 and fail the assertion. */
    const en1OnlyWatchStart = Date.now();
    for (;;) {
      const phCount = await linkedInPage.locator("[data-ss-ph]").count();
      assert.ok(
        phCount <= 1,
        "expected the EN-1-only post NOT to be blocked while EN-1 is disabled"
      );
      if (Date.now() - en1OnlyWatchStart > 4000) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:en1-only-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the EN-1-only post to stay visible while EN-1 is disabled"
    );

    /* Cross-language isolation: an ES-1-only post is still blocked
       while EN-1 is off. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:es1-only-1";
      const p = document.createElement("p");
      p.textContent =
        'Comenta "CLAVE" y te comparto la guía completa, la plantilla ' +
        "y el flujo de trabajo gratis hoy.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:es1-only-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* Re-enable EN-1: spam-1 is blocked again and the EN-1-only post is
       blocked too. */
    await en1Row.locator("label.toggle").click();
    await waitForSyncValue(context, "ss_disabled_patterns", (v) =>
      Array.isArray(v) && v.length === 0
    );
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:en1-only-2";
      const p = document.createElement("p");
      p.textContent =
        "Type MAGIC and I'll send you the complete checklist, " +
        "template, and workflow for free today.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:en1-only-2"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* ── Author blocklist (plan 008) ────────────────────────────── */

    /* Deterministic start: restore the file-start baseline whitelist
       (the never-block-author scenario above added "spammer" to it —
       a whitelisted author must win over the blocklist) and seed the
       blocklist with the same author id. The fixture post carries
       NON-spam text, so its block can only be author-driven. */
    await setSyncStorage(context, { ss_whitelist: ["trusted"] });
    await setSyncStorage(context, { ss_blocked_authors: ["spammer"] });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    /* Only spam-1 is blocked: the whitelisted-1 post (author "trusted")
       must stay visible even though its text matches, and spam-1 has no
       actor wrapper to match the blocklist pass. */
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:author-only-1";
      const actor = document.createElement("div");
      actor.className = "update-components-actor";
      const link = document.createElement("a");
      link.href = "/in/spammer/";
      link.textContent = "Blocked Author";
      actor.appendChild(link);
      section.appendChild(actor);
      const p = document.createElement("p");
      p.textContent =
        "An ordinary professional update sharing our team's quarterly " +
        "results and upcoming roadmap highlights.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:author-only-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    const authorPlaceholder = linkedInPage.locator("[data-ss-ph]").last();
    assert.match(
      await authorPlaceholder.locator("span").first().textContent(),
      /Blocked — you've blocked this author|Bloqueado/,
      "expected the author-blocked placeholder to explain the block is by author"
    );
    assert.equal(
      await authorPlaceholder.locator("button", {
        hasText: /Unblock this author|Desbloquear a este autor/,
      }).count(),
      1,
      "expected an 'Unblock this author' button on the author-blocked placeholder"
    );
    assert.equal(
      await authorPlaceholder.locator("button", { hasText: /Not spam|No es spam/ }).count(),
      0,
      "expected NO 'Not spam' button on the author-blocked placeholder"
    );
    /* Regression: the text-block placeholder for spam-1 keeps the
       standard "Not spam" button. */
    assert.equal(
      await linkedInPage.locator("[data-ss-ph]").first().locator("button", {
        hasText: /Not spam|No es spam/,
      }).count(),
      1,
      "expected the text-block placeholder to keep its 'Not spam' button"
    );

    /* Unblocking restores the post and removes the author from storage. */
    await authorPlaceholder
      .locator("button", { hasText: /Unblock this author|Desbloquear a este autor/ })
      .click();
    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display !== "none";
      },
      '[data-id="urn:li:activity:author-only-1"]',
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);
    const blockedAuthorsAfter = await getSyncStorage(context, "ss_blocked_authors");
    assert.ok(
      Array.isArray(blockedAuthorsAfter) && !blockedAuthorsAfter.includes("spammer"),
      "expected spammer to be removed from the blocked-authors storage"
    );

    await optionsPage.close();
    await popup.close();

    /* ── ES-1 accented verb regression (es1-accented-verbs) ─────── */

    /* Deterministic start: reload resets the DOM to the shared 3-section
       fixture (sections appended in earlier scenarios vanish). Only
       spam-1 (EN match) is blocked — whitelisted-1 and clean-1 stay
       visible — so exactly one placeholder exists. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* The "envío" form of the ES-1 verb alternation used to die on the
       non-unicode `\b` after the accented í: the post never matched.
       The appended section uses that exact verb. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.setAttribute("data-id", "urn:li:activity:es-spam-1");
      const actor = document.createElement("div");
      actor.className = "update-components-actor";
      const link = document.createElement("a");
      link.href = "/in/es-spammer/";
      link.textContent = "Autor ES";
      actor.appendChild(link);
      const paragraph = document.createElement("p");
      paragraph.textContent =
        "Comenta CLAUDE y te envío el PDF completo, la plantilla y el flujo de trabajo gratis hoy mismo.";
      section.appendChild(actor);
      section.appendChild(paragraph);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:es-spam-1"]',
      { timeout: 5000 }
    );
    /* Placeholder count grew 1 -> 2, and the placeholder sits right
       after the hidden section (content.js inserts it as the post's
       next sibling). */
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);
    assert.equal(
      await linkedInPage
        .locator('[data-id="urn:li:activity:es-spam-1"]')
        .evaluate((el) => {
          const next = el.nextElementSibling;
          return next !== null && next.hasAttribute("data-ss-ph");
        }),
      true,
      "expected a placeholder as the next sibling of the hidden ES post"
    );

    /* ES over-broadness regression (es-imperative-boundary): the leading
       alternation is now bounded (clitic-tolerant), so the non-imperative
       "Comentaba ..." section must stay visible while the clitic form
       "Comentame ..." must still be caught. Both sections are appended in
       one evaluate so the observer scans them in the same debounced batch —
       waiting for es-spam-3 to hide proves that batch ran, making the
       es-spam-2 "stays visible" assertion meaningful. */
    await linkedInPage.evaluate(() => {
      const append = (id, text) => {
        const section = document.createElement("section");
        section.setAttribute("data-id", id);
        const actor = document.createElement("div");
        actor.className = "update-components-actor";
        const link = document.createElement("a");
        link.href = "/in/es-spammer/";
        link.textContent = "Autor ES";
        actor.appendChild(link);
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        section.appendChild(actor);
        section.appendChild(paragraph);
        document.querySelector("main").appendChild(section);
      };
      append(
        "urn:li:activity:es-spam-2",
        "Comentaba CLAUDE y te envío el PDF completo, la plantilla y el flujo de trabajo gratis hoy mismo."
      );
      append(
        "urn:li:activity:es-spam-3",
        "Comentame CLAUDE y te mando el PDF completo, la plantilla y el flujo de trabajo gratis hoy mismo."
      );
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:es-spam-3"]',
      { timeout: 5000 }
    );
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:es-spam-2"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the non-imperative 'Comentaba ...' section to stay visible (boundary fix)"
    );
    assert.equal(
      await linkedInPage
        .locator('[data-id="urn:li:activity:es-spam-3"]')
        .evaluate((el) => {
          const next = el.nextElementSibling;
          return next !== null && next.hasAttribute("data-ss-ph");
        }),
      true,
      "expected a placeholder as the next sibling of the hidden clitic-form ES post"
    );
    /* Placeholder count grew 2 -> 3: only es-spam-3 earned a placeholder
       (es-spam-2 stays visible, so it has none). */
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 3);

    /* ── FR/PT/DE detection end-to-end (025) ────────────────────── */

    /* Deterministic start: reload resets the DOM to the shared
       3-section fixture; only spam-1 (EN match) is blocked. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* One bait post per newly-covered language. Each text exercises a
       pattern that plan 025 either fixed (FR-1 object pronouns, PT-1
       near-future vou) or newly covered (DE-1). */
    await linkedInPage.evaluate(() => {
      const posts = [
        ["urn:li:activity:fr-spam-1", "Commentez COURAGE et je vous enverrai le PDF complet."],
        ["urn:li:activity:pt-spam-1", "Comente PDF e eu vou enviar o link completo."],
        ["urn:li:activity:de-spam-1", "Kommentiere PACK und ich schicke dir die Vorlage."],
      ];
      for (const [id, text] of posts) {
        const section = document.createElement("section");
        section.dataset.id = id;
        const p = document.createElement("p");
        p.textContent = text;
        section.appendChild(p);
        document.querySelector("main").appendChild(section);
      }
    });
    /* The three appended posts join spam-1's placeholder: 1 -> 4. */
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 4,
      { timeout: 10000 }
    );
    for (const id of ["fr-spam-1", "pt-spam-1", "de-spam-1"]) {
      assert.equal(
        await linkedInPage
          .locator(`[data-id="urn:li:activity:${id}"]`)
          .evaluate((el) => getComputedStyle(el).display),
        "none",
        `expected the ${id} post to be hidden by its language's pattern`
      );
    }

    /* ── Opt-in hide: "Promoted" feed posts (label-hide) ────────── */

    /* Deterministic start: reload resets the DOM to the shared fixture
       (no promoted post in it), and the toggle is off by default. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Toggle off: a NON-spam section carrying a "Promoted" label span
       must stay visible. The 1500ms window covers the observer debounce
       (500ms) plus slack — any would-be block would have happened. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:promoted-1";
      const span = document.createElement("span");
      span.textContent = "Promoted";
      section.appendChild(span);
      const p = document.createElement("p");
      p.textContent =
        "A brief industry update from our marketing team about the launch " +
        "event later this quarter.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForTimeout(1500);
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:promoted-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the promoted post to stay visible while the toggle is off"
    );

    /* Toggle on (preserving the whitelist baseline). The reload wipes the
       evaluate-added node, so the promoted section is appended again —
       with the toggle on, only spam-1 is blocked until it is appended. */
    await setSyncStorage(context, {
      ss_hide_promoted: true,
      ss_whitelist: ["trusted"],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:promoted-1";
      const span = document.createElement("span");
      span.textContent = "Promoted";
      section.appendChild(span);
      const p = document.createElement("p");
      p.textContent =
        "A brief industry update from our marketing team about the launch " +
        "event later this quarter.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:promoted-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);
    assert.equal(
      await linkedInPage
        .locator('[data-id="urn:li:activity:promoted-1"]')
        .evaluate((el) => {
          const next = el.nextElementSibling;
          return next !== null && next.hasAttribute("data-ss-ph");
        }),
      true,
      "expected a placeholder as the next sibling of the hidden promoted post"
    );

    /* ── Opt-in hide: "Featured" section on profiles (label-hide) ── */

    const mockProfilePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Mock LinkedIn Profile</title>
  </head>
  <body>
    <main>
      <section id="featured-section">
        <h2>Featured</h2>
        <div>pinned post content here</div>
      </section>
    </main>
  </body>
</html>`;

    await context.route("https://www.linkedin.com/in/test-profile/**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: mockProfilePage,
      });
    });

    const profilePage = await context.newPage();
    await setSyncStorage(context, { ss_hide_featured: true });
    await profilePage.goto("https://www.linkedin.com/in/test-profile/", {
      waitUntil: "domcontentloaded",
    });
    await profilePage.locator("[data-ss-ph]").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(
      await profilePage
        .locator("#featured-section")
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the Featured section to be hidden while the toggle is on"
    );

    /* Toggle-off regression: with the toggle cleared, a reload leaves the
       section visible again. */
    await setSyncStorage(context, { ss_hide_featured: false });
    await profilePage.reload({ waitUntil: "domcontentloaded" });
    await profilePage.locator("#featured-section").waitFor({ state: "visible", timeout: 10000 });
    assert.notEqual(
      await profilePage
        .locator("#featured-section")
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the Featured section to be visible again after the toggle is off"
    );
    await profilePage.close();

    /* ── Placeholder: "Block this author" from a text-blocked post
          (plan 040 D1) ──────────────────────────────────────────── */

    /* Deterministic start: reload resets the DOM to the shared 3-section
       fixture. Only spam-1 (EN text match) is blocked. */
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* An authored spam post whose author is NOT yet blocked. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:block-me-1";
      const actor = document.createElement("div");
      actor.className = "update-components-actor";
      const link = document.createElement("a");
      link.href = "/in/block-me/";
      link.textContent = "Block Me Author";
      actor.appendChild(link);
      section.appendChild(actor);
      const p = document.createElement("p");
      p.textContent =
        'Comment "CLAUDE" and I\'ll send you the complete checklist, ' +
        "template, and workflow for free today.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:block-me-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* The text-blocked post's placeholder carries exactly one of the
       new buttons (spam-1's placeholder has no author, so none). */
    const blockAuthorBtn = linkedInPage.locator("[data-ss-ph] button", {
      hasText: /Block this author|Bloquear a este autor/,
    });
    assert.equal(
      await blockAuthorBtn.count(),
      1,
      "expected exactly one 'Block this author' button in the feed"
    );
    await blockAuthorBtn.click();

    /* The post STAYS hidden and its placeholder is swapped to the
       author-block variant (plan 040 choice (a)): author-blocked label
       + Unblock action, and none of the text-block actions. */
    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const ph = el.nextElementSibling;
        if (!ph || !ph.hasAttribute("data-ss-ph")) return false;
        const label = ph.querySelector("span");
        return label !== null && /Blocked — you've blocked this author|Bloqueado/.test(label.textContent);
      },
      '[data-id="urn:li:activity:block-me-1"]',
      { timeout: 4000 }
    );
    const swapped = await linkedInPage
      .locator('[data-id="urn:li:activity:block-me-1"]')
      .evaluate((el) => {
        const ph = el.nextElementSibling;
        const buttons = ph ? [...ph.querySelectorAll("button")].map((b) => b.textContent) : [];
        return {
          display: getComputedStyle(el).display,
          label: ph ? ph.querySelector("span").textContent : "",
          buttons,
        };
      });
    assert.equal(swapped.display, "none", "post must stay hidden after blocking its author");
    assert.match(
      swapped.label,
      /Blocked — you've blocked this author|Bloqueado/,
      "expected the placeholder to switch to the author-block variant"
    );
    assert.ok(
      swapped.buttons.some((b) => /Unblock this author|Desbloquear a este autor/.test(b)),
      "expected an 'Unblock this author' button on the swapped placeholder"
    );
    assert.ok(
      !swapped.buttons.some((b) => /Not spam|No es spam/.test(b)),
      "expected NO 'Not spam' button on the swapped placeholder"
    );
    assert.ok(
      !swapped.buttons.some((b) => /Block this author|Bloquear a este autor/.test(b)),
      "expected NO 'Block this author' button on the swapped placeholder"
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    const blockedAfterPlan040 = await getSyncStorage(context, "ss_blocked_authors");
    assert.ok(
      Array.isArray(blockedAfterPlan040) && blockedAfterPlan040.includes("block-me"),
      "expected block-me to be written to the blocked-authors storage"
    );

    /* A second post by the same author with CLEAN text (no spam match)
       must be blocked by the author blocklist alone, with the author-
       block placeholder variant. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:block-me-2";
      const actor = document.createElement("div");
      actor.className = "update-components-actor";
      const link = document.createElement("a");
      link.href = "/in/block-me/";
      link.textContent = "Block Me Author";
      actor.appendChild(link);
      section.appendChild(actor);
      const p = document.createElement("p");
      p.textContent =
        "An ordinary professional update sharing our team's quarterly " +
        "results and upcoming roadmap highlights.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const ph = el.nextElementSibling;
        if (!ph || !ph.hasAttribute("data-ss-ph")) return false;
        const buttons = [...ph.querySelectorAll("button")].map((b) => b.textContent);
        return getComputedStyle(el).display === "none" &&
          buttons.some((b) => /Unblock this author|Desbloquear a este autor/.test(b));
      },
      '[data-id="urn:li:activity:block-me-2"]',
      { timeout: 5000 }
    );
    const secondPostState = await linkedInPage
      .locator('[data-id="urn:li:activity:block-me-2"]')
      .evaluate((el) => {
        const ph = el.nextElementSibling;
        const buttons = ph ? [...ph.querySelectorAll("button")].map((b) => b.textContent) : [];
        return {
          display: getComputedStyle(el).display,
          hasUnblock: buttons.some((b) =>
            /Unblock this author|Desbloquear a este autor/.test(b)
          ),
        };
      });
    assert.equal(secondPostState.display, "none", "the author's second post must be hidden");
    assert.equal(
      secondPostState.hasUnblock,
      true,
      "expected the author-block placeholder variant on the second post"
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 3);

    /* ── Never-hide phrases: pardon beats patterns (plan 056) ───── */

    /* Scenario 1 — Pardon hides nothing. A never-hide phrase matching
       the bait post's text (seeded before load) keeps it visible: zero
       placeholders on the page. */
    await setSyncStorage(context, {
      ss_allow_phrases: [{ id: "allow-1", text: "complete checklist", created: Date.now() }],
      ss_phrases: [],
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    /* Give the initial scan room to run; any block would have happened. */
    await linkedInPage.waitForTimeout(1500);
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 0);
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:spam-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the bait post to stay visible under a matching never-hide phrase"
    );

    /* Scenario 2 — Live un-hide. With no allow-phrases, spam-1 is
       blocked. Writing a matching phrase to sync storage un-hides it in
       THIS tab without a reload — proves restoreAllowedPosts and the
       onChanged wiring. */
    await setSyncStorage(context, {
      ss_allow_phrases: [],
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    await setSyncStorage(context, {
      ss_allow_phrases: [{ id: "allow-2", text: "complete checklist", created: Date.now() }],
    });
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 0,
      { timeout: 4000 }
    );
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:spam-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the post to un-hide when a matching never-hide phrase is added"
    );

    /* Scenario 3 — Overlap case (plan 056 Decision 1). A custom phrase
       AND an allow-phrase both match the same post, with DIFFERENT texts
       (the options page refuses equal texts as a conflict, so reusing one
       string would be unsettable). The pardon must win: the post stays
       visible. Without this scenario a refactor could silently flip the
       precedence and every other test still passes. */
    await setSyncStorage(context, {
      ss_phrases: [{ text: "checklist", enabled: true, mode: "exact" }],
      ss_allow_phrases: [{ id: "allow-3", text: "engagement bait", created: Date.now() }],
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    /* spam-1 matches the custom phrase (and the built-in EN pattern) —
       the allow-phrase does not cover it, so exactly one placeholder. */
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:overlap-1";
      const p = document.createElement("p");
      p.textContent =
        "This post analyzes the engagement bait checklist and why it keeps " +
        "appearing in professional feeds.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });
    /* Give the debounced observer scan room to run; a block would have
       happened within it. */
    await linkedInPage.waitForTimeout(1500);
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:overlap-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the allow-phrase to win over the matching custom phrase"
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Scenario 4 — Label-block guard. A never-hide phrase must NOT
       pardon a post hidden by the Promoted toggle: allow-phrases pardon
       text blocks only. Both the initial match AND a phrase written
       after the post is already hidden must leave it hidden
       (restoreAllowedPosts skips label-blocked posts). */
    await setSyncStorage(context, {
      ss_hide_promoted: true,
      ss_allow_phrases: [{ id: "allow-4a", text: "marketing team", created: Date.now() }],
      ss_phrases: [],
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:promoted-allow-1";
      const span = document.createElement("span");
      span.textContent = "Promoted";
      section.appendChild(span);
      const p = document.createElement("p");
      p.textContent =
        "A brief update from our marketing team about the launch event later " +
        "this quarter.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });

    await linkedInPage.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && getComputedStyle(el).display === "none";
      },
      '[data-id="urn:li:activity:promoted-allow-1"]',
      { timeout: 5000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* A second phrase matching the promoted post arrives after the hide;
       the pardon must not restore a label-blocked post. */
    await setSyncStorage(context, {
      ss_allow_phrases: [
        { id: "allow-4a", text: "marketing team", created: Date.now() },
        { id: "allow-4b", text: "launch event", created: Date.now() },
      ],
    });
    await linkedInPage.waitForTimeout(1500);
    assert.equal(
      await linkedInPage
        .locator('[data-id="urn:li:activity:promoted-allow-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the promoted post to stay hidden despite a matching never-hide phrase"
    );
    assert.equal(
      await linkedInPage
        .locator('[data-id="urn:li:activity:spam-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the text-blocked post to stay hidden"
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* ── Match tester (plan 051) ───────────────────────────────── */

    /* Deterministic start: custom phrase CLAUDE (exact), allow-phrase
       "good news", no exclusions, stock toggles. spam-1's text matches
       the custom phrase AND the EN built-in (custom wins attribution);
       clean-1's text matches nothing. The probe-pair assertions below
       prove the tester verdict agrees with the content script on the
       same texts. */
    await setSyncStorage(context, {
      ss_phrases: [{ text: "CLAUDE", enabled: true, mode: "exact" }],
      ss_allow_phrases: [{ id: "t-allow", text: "good news", created: Date.now() }],
      ss_excluded: [],
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
      ss_disabled_patterns: [],
      ss_hide_promoted: false,
      ss_hide_featured: false,
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Content-script verdict on the spam probe: spam-1 is blocked. */
    assert.equal(
      await linkedInPage
        .locator('[data-id="urn:li:activity:spam-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the spam probe post to be blocked by the content script"
    );
    /* Content-script verdict on the benign probe: clean-1 stays visible. */
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:clean-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the benign probe post to stay visible"
    );

    /* Overlap probe: the allow-phrase covers text the custom phrase also
       matches — the pardon must win (plan 056 precedence) in BOTH the
       content script and the tester. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:tester-overlap-1";
      const p = document.createElement("p");
      p.textContent =
        "Comment CLAUDE and you will hear some good news about the launch.";
      section.appendChild(p);
      document.querySelector("main").appendChild(section);
    });
    await linkedInPage.waitForTimeout(1500);
    assert.notEqual(
      await linkedInPage
        .locator('[data-id="urn:li:activity:tester-overlap-1"]')
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the allow-phrase to pardon the overlap probe post"
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Drive the tester on the options page with the same probe texts. */
    const testerPage = await context.newPage();
    await testerPage.goto(
      `chrome-extension://${await getExtensionId(context)}/options/options.html`,
      { waitUntil: "domcontentloaded" }
    );
    await testerPage.locator("#langToggles .lang-tog").first().waitFor({
      state: "visible",
      timeout: 10000,
    });

    const spamProbe =
      'Comment "CLAUDE" and I\'ll send you the complete checklist, ' +
      "template, and workflow for free today.";
    await testerPage.locator("#testInput").fill(spamProbe);
    await testerPage.locator("#testBtn").click();
    await testerPage.waitForFunction(
      (sel) => /Matched:|Coincide con:/.test(document.querySelector(sel).textContent),
      "#testResult",
      { timeout: 5000 }
    );
    assert.match(
      await testerPage.locator("#testResult").textContent(),
      /CLAUDE/,
      "expected the tester hit line to name the custom phrase"
    );

    const benignProbe =
      "This ordinary professional update should stay visible because it " +
      "does not ask anyone to comment a magic word for a download.";
    await testerPage.locator("#testInput").fill(benignProbe);
    await testerPage.locator("#testBtn").click();
    await testerPage.waitForFunction(
      (sel) => /nothing matched|nada coincide/.test(document.querySelector(sel).textContent),
      "#testResult",
      { timeout: 5000 }
    );

    /* Allowed probe: the pardon verdict names the allow phrase. */
    await testerPage.locator("#testInput").fill(
      "Comment CLAUDE and you will hear some good news about the launch."
    );
    await testerPage.locator("#testBtn").click();
    await testerPage.waitForFunction(
      (sel) => /allowed by|permitida por/.test(document.querySelector(sel).textContent),
      "#testResult",
      { timeout: 5000 }
    );
    assert.match(
      await testerPage.locator("#testResult").textContent(),
      /good news/,
      "expected the allowed verdict to name the never-hide phrase"
    );

    await testerPage.close();

    /* ── Plan 059: bait text in a comment hides the comment, not the post ── */

    /* Reset to stock settings and reload for a deterministic page:
       spam-1 hidden, clean-1 visible, one placeholder. */
    await setSyncStorage(context, {
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
      ss_phrases: [],
      ss_allow_phrases: [],
      ss_excluded: [],
    });
    await linkedInPage.reload({ waitUntil: "domcontentloaded" });
    await placeholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* Inject a post whose ONLY bait text sits in a comment — the
       light-thread shape 057 proved resolves to the POST today. */
    await linkedInPage.evaluate(() => {
      const section = document.createElement("section");
      section.dataset.id = "urn:li:activity:comment-post-1";
      section.innerHTML =
        '<div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>' +
        '<p class="post-body">' + "y".repeat(320) + "</p>" +
        '<div class="comments"><div class="comments-list">' +
        '<div class="comment"><p class="comment-body">comment CLAUDE and I\'ll send you the framework</p></div>' +
        "</div></div>";
      document.querySelector("main").appendChild(section);
    });

    /* The debounced observer scan must hide the COMMENT (with an inline
       placeholder as its next sibling) and leave the post visible. */
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 2,
      null,
      { timeout: 10000 }
    );

    const commentPostDisplay = await linkedInPage
      .locator('[data-id="urn:li:activity:comment-post-1"]')
      .evaluate((el) => getComputedStyle(el).display);
    assert.notEqual(
      commentPostDisplay,
      "none",
      "the post must stay visible when bait text sits in a comment"
    );
    await linkedInPage.waitForFunction(
      () => {
        const section = document.querySelector(
          '[data-id="urn:li:activity:comment-post-1"]'
        );
        if (!section) return false;
        const comment = section.querySelector(".comment");
        if (!comment) return false;
        const ph = comment.nextElementSibling;
        return (
          getComputedStyle(comment).display === "none" &&
          ph && ph.dataset && ph.dataset.ssPh === "1"
        );
      },
      null,
      { timeout: 10000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    const cleanDisplay = await linkedInPage
      .locator('[data-id="urn:li:activity:clean-1"]')
      .evaluate((el) => getComputedStyle(el).display);
    const spamDisplay = await linkedInPage
      .locator('[data-id="urn:li:activity:spam-1"]')
      .evaluate((el) => getComputedStyle(el).display);
    assert.notEqual(cleanDisplay, "none", "clean-1 must stay visible");
    assert.equal(spamDisplay, "none", "spam-1 must stay hidden");

    /* The placeholder's Show button (SS_t("show")) must restore the
       comment — restorePost keys the cooldown on the parent post. */
    await linkedInPage
      .locator(".comment + [data-ss-ph] button", { hasText: /Show|Mostrar/ })
      .click();
    await linkedInPage.waitForFunction(
      () => {
        const comment = document.querySelector(
          '[data-id="urn:li:activity:comment-post-1"] .comment'
        );
        return comment && getComputedStyle(comment).display !== "none";
      },
      null,
      { timeout: 4000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 1);

    /* ── Plan 058: first-run walkthrough card on the options page ── */

    /* 1. Fresh install shows the card: flag true → card visible. */
    await setLocalStorage(context, { ss_welcome_pending: true });
    const welcomePage = await context.newPage();
    await welcomePage.goto(
      `chrome-extension://${await getExtensionId(context)}/options/options.html`,
      { waitUntil: "domcontentloaded" }
    );
    await welcomePage.locator("#welcomeCard").waitFor({
      state: "visible",
      timeout: 10000,
    });

    /* 2. Dismiss persists: hide, clear the flag, survive a reload. */
    await welcomePage.locator("#welcomeDismissBtn").click();
    await welcomePage.waitForFunction(
      () => getComputedStyle(document.getElementById("welcomeCard")).display === "none",
      null,
      { timeout: 5000 }
    );
    await waitForLocalValue(context, "ss_welcome_pending", (v) => v === false);
    await welcomePage.reload({ waitUntil: "domcontentloaded" });
    await welcomePage.locator("#langToggles .lang-tog").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await welcomePage
        .locator("#welcomeCard")
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the welcome card to stay hidden after dismissal"
    );
    await welcomePage.close();

    /* 3. No flag, no card: the every-subsequent-visit case. */
    const welcomeWorker = context.serviceWorkers()[0];
    await welcomeWorker.evaluate(() => new Promise((resolve) => {
      chrome.storage.local.remove("ss_welcome_pending", resolve);
    }));
    const revisitPage = await context.newPage();
    await revisitPage.goto(
      `chrome-extension://${await getExtensionId(context)}/options/options.html`,
      { waitUntil: "domcontentloaded" }
    );
    await revisitPage.locator("#langToggles .lang-tog").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await revisitPage
        .locator("#welcomeCard")
        .evaluate((el) => getComputedStyle(el).display),
      "none",
      "expected the welcome card to stay hidden when no flag is set"
    );
    await revisitPage.close();

    /* ── Per-pattern stats (plan 053): built-in + custom buckets ─── */

    /* Seed a custom phrase, then load a feed whose two posts match one
       custom phrase and one built-in pattern (EN-1) respectively. The
       distinct URL keeps this scenario from disturbing the shared mock
       feed used by every earlier scenario. */
    const pstatsUrl = "https://www.linkedin.com/feed/?pstats=1";
    await context.route(pstatsUrl, (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Mock LinkedIn Feed</title></head>
  <body>
    <main>
      <section data-id="urn:li:activity:custom-1">
        <p>I just published my holographic spreadsheets guide covering pivot tables, dashboards, and advanced formulas.</p>
      </section>
      <section data-id="urn:li:activity:builtin-1">
        <p>Comment "CLAUDE" and I'll send you the complete checklist, template, and workflow for free today.</p>
      </section>
    </main>
  </body>
</html>`,
      });
    });
    await setSyncStorage(context, {
      ss_phrases: [
        { id: "pstats-custom", text: "holographic spreadsheets", enabled: true, mode: "contains", created: Date.now() },
      ],
    });

    /* Counts are lifetime, so earlier scenarios have already populated
       ss_pattern_counts (EN-1/author). Zero all three counters before
       navigating so this scenario can assert exact bucket values. */
    await setLocalStorage(context, {
      ss_blocked_count: 0,
      ss_daily_counts: {},
      ss_pattern_counts: {},
    });

    await linkedInPage.goto(pstatsUrl, { waitUntil: "domcontentloaded" });
    await linkedInPage.waitForFunction(
      () => document.querySelectorAll("[data-ss-ph]").length === 2,
      null,
      { timeout: 10000 }
    );
    await assertCount(linkedInPage.locator("[data-ss-ph]"), 2);

    /* Both buckets land in ss_pattern_counts: custom from the phrase
       match, EN-1 from the built-in match. */
    assert.deepEqual(
      await waitForLocalValue(context, "ss_pattern_counts", (v) =>
        v !== undefined && typeof v === "object" && v.custom === 1 && v["EN-1"] === 1
      ),
      { custom: 1, "EN-1": 1 },
      "expected ss_pattern_counts to hold one custom and one EN-1 block"
    );

    /* The popup renders both buckets. */
    const patternPopup = await context.newPage();
    await patternPopup.goto(
      `chrome-extension://${await getExtensionId(context)}/popup/popup.html`,
      { waitUntil: "domcontentloaded" }
    );
    await linkedInPage.bringToFront();
    await patternPopup.reload({ waitUntil: "domcontentloaded" });
    await patternPopup.waitForFunction(
      () => document.querySelectorAll(".pattern-item").length === 2,
      null,
      { timeout: 10000 }
    );
    assert.equal(
      await patternPopup
        .locator(".pattern-item", { hasText: /Custom phrases|Frases personalizadas/ })
        .locator(".pattern-count")
        .textContent(),
      "1",
      "expected popup pattern row to show one custom-phrase block"
    );
    assert.equal(
      await patternPopup
        .locator(".pattern-item", { hasText: /comment "WORD"/ })
        .locator(".pattern-count")
        .textContent(),
      "1",
      "expected popup pattern row to show one EN-1 block"
    );
    await patternPopup.close();

    /* Reset clears all three counters (lifetime total, daily buckets,
       per-pattern buckets) together. */
    await linkedInPage.bringToFront();
    const resetPatternsResponse = await sendTabMessage(context, { action: "resetCount" });
    assert.ok(resetPatternsResponse, "expected resetCount message to reach the content script");
    assert.equal(
      await waitForLocalValue(context, "ss_blocked_count", (v) => v === 0),
      0,
      "expected ss_blocked_count to be 0 after reset"
    );
    assert.deepEqual(
      await waitForLocalValue(context, "ss_daily_counts", (v) =>
        v !== undefined && typeof v === "object" && Object.keys(v).length === 0
      ),
      {},
      "expected ss_daily_counts to be exactly {} after reset"
    );
    assert.deepEqual(
      await waitForLocalValue(context, "ss_pattern_counts", (v) =>
        v !== undefined && typeof v === "object" && Object.keys(v).length === 0
      ),
      {},
      "expected ss_pattern_counts to be exactly {} after reset"
    );

    /* ── Plan 063: selection-anchored missed-spam report ─── */

    /* Stock settings + a dedicated feed tab: spam-1 hidden, clean-1
       visible, exactly one placeholder. Stock storage keeps every
       selection/report below independent of the pstatsUrl page above. */
    await setSyncStorage(context, {
      ss_whitelist: ["trusted"],
      ss_blocked_authors: [],
      ss_phrases: [],
      ss_allow_phrases: [],
      ss_excluded: [],
      ss_disabled_patterns: [],
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "https://www.linkedin.com",
    });
    /* Never contact GitHub from tests: the issue form is fulfilled
       locally, so tab-open assertions stay hermetic. */
    await context.route(
      "https://github.com/cortega26/stop-spam-linkedin/issues/new**",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html><body>report form</body></html>",
        });
      }
    );
    /* Hermetic fallback guard (worker-side chrome.tabs.create wrapper):
       window.open popups from the content script ARE intercepted by the
       route above, but tabs opened via the background tabs.create
       fallback are created in the browser process and bypass Playwright
       route interception — with real network they load the live GitHub
       login redirect (unhermetic) and break the exactly-one-tab count
       (this harness's Chromium reports window.open null while still
       opening the popup, so the fallback fires on every trigger; the
       request itself still runs, only the second real tab is
       suppressed). The single window.open tab stays fully asserted
       below; G2 layers its own failing wrapper on top for the
       double-failure path and restores this guard afterwards. */
    const reportWorker = context.serviceWorkers()[0];
    await reportWorker.evaluate(() => {
      globalThis.__SS_reportCreateCalls = [];
      globalThis.__SS_origReportTabsCreate = chrome.tabs.create;
      chrome.tabs.create = function (opts, cb) {
        globalThis.__SS_reportCreateCalls.push(opts && opts.url);
        if (typeof cb === "function") cb();
        return undefined;
      };
    });
    const reportPage = await context.newPage();
    await reportPage.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
    });
    const reportPlaceholder = reportPage.locator("[data-ss-ph]");
    await reportPlaceholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(reportPage.locator("[data-ss-ph]"), 1);
    await reportPage.bringToFront();

    /* Content-world patching via CDP: page.evaluate runs in the page's
       main world, but the extension content script lives in an isolated
       world — page-side Object.defineProperty on window.open,
       navigator.clipboard, or document.execCommand never reaches it, so
       clipboard/window stubs for the failure scenarios must be evaluated
       in the isolated world itself (Playwright's own utility world gets
       the same harmless stub). Worlds are recreated on every navigation,
       so patch again after any reload; the reload itself is the restore.
       Install and restore stubs by assignment, never delete: in this
       harness's Chromium window.open is an own property with no proto
       fallback, so `delete window.open` destroys it permanently (proved
       by probe — typeof stays 'undefined' afterwards). Save the native
       on window first, then assign it back.
       Throws loudly if no target world is found. */
    const cdpSession = await context.newCDPSession(reportPage);
    await cdpSession.send("Page.enable");
    await cdpSession.send("Runtime.enable");
    const worldContextIds = new Map();
    cdpSession.on("Runtime.executionContextCreated", ({ context: ctx }) => {
      worldContextIds.set(ctx.id, ctx.auxData || {});
    });
    cdpSession.on("Runtime.executionContextDestroyed", ({ executionContextId }) => {
      worldContextIds.delete(executionContextId);
    });
    async function patchContentWorld(script) {
      const frameId = (await cdpSession.send("Page.getFrameTree")).frameTree.frame.id;
      /* Allow a beat for pending context-creation events to arrive. */
      await reportPage.waitForTimeout(250);
      for (let attempt = 0; attempt < 2; attempt++) {
        const targets = [...worldContextIds.entries()]
          .filter(([, aux]) => aux && aux.isDefault === false && (!aux.frameId || aux.frameId === frameId))
          .map(([id]) => id);
        assert.ok(targets.length > 0, "expected an isolated world for the feed page");
        let patched = 0;
        for (const contextId of targets) {
          try {
            const response = await cdpSession.send("Runtime.evaluate", {
              expression: script,
              contextId,
            });
            assert.ok(!response.exceptionDetails, "expected the content-world stub to evaluate cleanly");
            patched++;
          } catch (error) {
            /* Navigations leave corpse ids behind (destruction events are
               not reliably delivered): skip them, prune, and keep going. */
            if (/Cannot find context/.test(String((error).message || error))) {
              worldContextIds.delete(contextId);
              continue;
            }
            throw error;
          }
        }
        if (patched > 0) return;
        await reportPage.waitForTimeout(250);
      }
      throw new Error("expected the content-world stub to land after retry");
    }
    /* Contexts created before Runtime.enable are missed, so reload once
       to capture fresh creation events for the worlds above. */
    await reportPage.reload({ waitUntil: "domcontentloaded" });
    await reportPlaceholder.waitFor({ state: "visible", timeout: 10000 });
    await assertCount(reportPage.locator("[data-ss-ph]"), 1);
    await reportPage.bringToFront();

    async function snapshotReportStorage() {
      const worker = context.serviceWorkers()[0];
      return worker.evaluate(() => new Promise((resolve) => {
        chrome.storage.sync.get(null, (syncAll) => {
          chrome.storage.local.get(null, (localAll) => {
            resolve({ sync: syncAll, local: localAll });
          });
        });
      }));
    }

    async function readReportClipboard() {
      const started = Date.now();
      for (;;) {
        const text = await reportPage.evaluate(() => navigator.clipboard.readText());
        if (text || Date.now() - started > 3000) return text;
        await reportPage.waitForTimeout(200);
      }
    }

    async function selectNeedle(selector, needle) {
      return reportPage.evaluate(({ root, text }) => {
        const host = document.querySelector(root);
        const walker = document.createTreeWalker(host, window.NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const index = node.textContent.indexOf(text);
          if (index >= 0) {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + text.length);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
          }
          node = walker.nextNode();
        }
        return false;
      }, { root: selector, text: needle });
    }

    /* Listener-first: the issue tab steals focus, so every trigger below
       registers context.waitForEvent("page") BEFORE sending, and the
       feed tab is refocused before subsequent actions (049 §6 trap). */
    async function triggerAndExpectSingleIssueTab(trigger) {
      const before = context.pages().length;
      const pagePromise = context.waitForEvent("page", { timeout: 8000 });
      const result = await trigger();
      const issueTab = await pagePromise;
      assert.match(
        issueTab.url(),
        /issues\/new\?template=missed_spam_pattern\.yml/,
        "expected the issue-template destination"
      );
      await reportPage.waitForTimeout(500);
      assert.equal(
        context.pages().length,
        before + 1,
        "expected exactly one issue tab (no double-open)"
      );
      return { result, issueTab };
    }

    async function triggerAndExpectNoIssueTab(trigger) {
      const pagePromise = context
        .waitForEvent("page", { timeout: 1500 })
        .then((page) => page)
        .catch(() => null);
      const result = await trigger();
      const unexpected = await pagePromise;
      if (unexpected) await unexpected.close();
      assert.equal(unexpected, null, "expected no issue tab to open");
      return result;
    }

    async function closeIssueTab(issueTab) {
      await issueTab.close();
      await reportPage.bringToFront();
    }

    /* Toast assertions must accept both shipped UI locales: the
       extension renders toasts in the browser UI locale, which varies by
       environment. Asserting growth (not mere presence) keeps stale
       toasts from earlier scenarios from satisfying the check; interval
       polling keeps the wait independent of rAF throttling while the
       issue tab holds focus. */
    const localeEn063 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "_locales/en/messages.json"), "utf8"));
    const localeEs063 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "_locales/es/messages.json"), "utf8"));
    async function countFixedDivs() {
      return reportPage.evaluate(() => [...document.querySelectorAll("div")]
        .filter((d) => getComputedStyle(d).position === "fixed").length);
    }
    /* Toasts auto-remove after 3s, so a stale toast can expire between the
       count snapshot and the trigger, masking the new toast's growth.
       Clearing first makes the growth check deterministic. */
    async function clearFixedDivs() {
      await reportPage.evaluate(() => [...document.querySelectorAll("div")]
        .forEach((d) => { if (getComputedStyle(d).position === "fixed") d.remove(); }));
    }
    async function expectNewReportToast(kind, countBefore) {
      const accepted = [localeEn063[kind].message, localeEs063[kind].message];
      await reportPage.waitForFunction(
        (n) => [...document.querySelectorAll("div")]
          .filter((d) => getComputedStyle(d).position === "fixed").length > n,
        countBefore,
        { timeout: 5000, polling: 250 }
      );
      const fixedTexts = await reportPage.evaluate(() => [...document.querySelectorAll("div")]
        .filter((d) => getComputedStyle(d).position === "fixed")
        .map((d) => d.textContent));
      assert.ok(
        accepted.includes(fixedTexts[fixedTexts.length - 1]),
        `expected the newest toast to be ${kind}`
      );
    }

    /* Steady-state snapshot: report actions below must not mutate
       phrases, exclusions, author lists, counters, or suggestions. */
    const reportStorageBefore = await snapshotReportStorage();

    /* A. Happy path: a short partial selection resolves through the
       post container, so the FULL post excerpt lands on the clipboard
       with the "none" language marker and one issue tab opens. */
    assert.equal(
      await selectNeedle('[data-id="urn:li:activity:clean-1"]', "ordinary"),
      true,
      "expected to place a partial selection in the clean post"
    );
    const happy = await triggerAndExpectSingleIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam" })
    );
    assert.deepEqual(
      happy.result,
      { ok: true, copied: true },
      "expected a prepared + copied report"
    );
    const happyCopied = await readReportClipboard();
    assert.match(
      happyCopied,
      /This ordinary professional update should stay visible/,
      "expected the full post excerpt from a partial selection (container path)"
    );
    assert.match(happyCopied, /Trigger: /, "expected the trigger line");
    assert.match(
      happyCopied,
      /Pattern language: none/,
      "expected the unmatched-report language marker"
    );
    assert.match(
      happyCopied,
      /LinkedIn page: https:\/\/www\.linkedin\.com/,
      "expected the page URL"
    );
    await closeIssueTab(happy.issueTab);

    /* B. No selection: the {ok:false} error path is reached (asserted,
       not assumed), the clipboard sentinel survives, no tab opens. */
    await reportPage.evaluate(() => window.getSelection().removeAllRanges());
    await reportPage.evaluate(() => navigator.clipboard.writeText("sentinel-b-preserved"));
    const noSel = await triggerAndExpectNoIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam" })
    );
    assert.deepEqual(
      noSel,
      { ok: false, reason: "no-selection" },
      "expected the no-selection error path"
    );
    assert.equal(
      await readReportClipboard(),
      "sentinel-b-preserved",
      "expected the clipboard left intact with no selection"
    );

    /* C. No container: text outside any post falls back to the exact
       selected text — never the whole anchor paragraph. */
    const orphanSentence = "Orphan note about carrots and project timelines";
    await reportPage.evaluate((text) => {
      const div = document.createElement("div");
      div.id = "ss-orphan-note";
      div.textContent = `intro padding. ${text} trailing padding.`;
      document.body.appendChild(div);
    }, orphanSentence);
    assert.equal(
      await selectNeedle("#ss-orphan-note", "carrots and project"),
      true,
      "expected to select inside the orphan note"
    );
    const orphan = await triggerAndExpectSingleIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam" })
    );
    assert.deepEqual(orphan.result, { ok: true, copied: true });
    const orphanCopied = await readReportClipboard();
    assert.equal(
      orphanCopied.split("\n")[3],
      "carrots and project",
      "expected the exact selected text as the excerpt (no-container fallback)"
    );
    assert.match(orphanCopied, /Pattern language: none/);
    await closeIssueTab(orphan.issueTab);

    /* D. Editable control: a selection inside a comment draft is
       rejected on its own error path, clipboard untouched, no tab. */
    await reportPage.evaluate(() => {
      const ed = document.createElement("div");
      ed.id = "ss-editable-note";
      ed.contentEditable = "true";
      ed.textContent = "draft comment with magic words for testing editors";
      document.body.appendChild(ed);
    });
    assert.equal(
      await selectNeedle("#ss-editable-note", "magic words"),
      true,
      "expected to select inside the editable note"
    );
    await reportPage.evaluate(() => navigator.clipboard.writeText("sentinel-d-preserved"));
    const editable = await triggerAndExpectNoIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam" })
    );
    assert.deepEqual(
      editable,
      { ok: false, reason: "editable" },
      "expected the editable-control error path"
    );
    assert.equal(
      await readReportClipboard(),
      "sentinel-d-preserved",
      "expected the clipboard left intact for editable selections"
    );

    /* E. Comment boundary: a selection inside a comment on an innocent
       post reports the comment only — never the parent post — and
       blocks nothing. */
    const commentText = "This thoughtful reply adds project context for teammates.";
    await reportPage.evaluate((text) => {
      const host = document.querySelector('[data-id="urn:li:activity:clean-1"]');
      const wrap = document.createElement("div");
      wrap.className = "comments";
      const comment = document.createElement("div");
      comment.className = "comment";
      comment.textContent = text;
      wrap.appendChild(comment);
      host.appendChild(wrap);
    }, commentText);
    assert.equal(
      await selectNeedle('[data-id="urn:li:activity:clean-1"] .comment', "thoughtful reply"),
      true,
      "expected to select inside the comment"
    );
    const comment = await triggerAndExpectSingleIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam" })
    );
    assert.deepEqual(comment.result, { ok: true, copied: true });
    const commentCopied = await readReportClipboard();
    assert.equal(
      commentCopied.split("\n")[3],
      commentText,
      "expected the comment text only (no parent-post expansion)"
    );
    assert.ok(
      !commentCopied.includes("magic word"),
      "comment report must not leak parent-post text"
    );
    await closeIssueTab(comment.issueTab);
    await assertCount(
      reportPage.locator("[data-ss-ph]"),
      1,
      "expected the comment report to block nothing"
    );

    /* F. 600-character cap: a 1000-char selection is truncated. */
    await reportPage.evaluate((text) => {
      const div = document.createElement("div");
      div.id = "ss-long-note";
      div.textContent = text;
      document.body.appendChild(div);
    }, "z".repeat(2000));
    await reportPage.evaluate(() => {
      const div = document.getElementById("ss-long-note");
      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 1000);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    const capped = await triggerAndExpectSingleIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam" })
    );
    assert.deepEqual(capped.result, { ok: true, copied: true });
    assert.equal(
      (await readReportClipboard()).split("\n")[3].length,
      600,
      "expected the excerpt capped at 600 characters"
    );
    await closeIssueTab(capped.issueTab);

    /* G. Rejected clipboard: writeText rejects AND execCommand fails →
       the visible failure toast appears, copied is false (never claimed),
       and the issue tab still opens. Stubs are installed and restored by
       assignment (never delete — see the helper note); no reload, since
       a reload would recount the mock spam post into the stats and
       pollute the read-only storage proof below. */
    assert.equal(
      await selectNeedle("#ss-orphan-note", "carrots and project"),
      true,
      "expected to reselect inside the orphan note"
    );
    await patchContentWorld([
      "window.__SS_noCopy = {",
      "  wt: navigator.clipboard.writeText,",
      "  ec: document.execCommand,",
      "};",
      "navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));",
      "document.execCommand = () => false;",
    ].join("\n"));
    const failPagePromise = context.waitForEvent("page", { timeout: 8000 });
    await clearFixedDivs();
    const toastCountBeforeG = await countFixedDivs();
    const failResult = await sendTabMessage(context, { action: "reportMissedSpam" });
    assert.deepEqual(
      failResult,
      { ok: true, copied: false },
      "expected prepared-but-not-copied on clipboard failure"
    );
    const failTab = await failPagePromise;
    assert.match(failTab.url(), /missed_spam_pattern/);
    await expectNewReportToast("reportFailed", toastCountBeforeG);
    await closeIssueTab(failTab);
    await patchContentWorld([
      "navigator.clipboard.writeText = window.__SS_noCopy.wt;",
      "document.execCommand = window.__SS_noCopy.ec;",
      "delete window.__SS_noCopy;",
    ].join("\n"));

    /* G2. Double failure: window.open blocked AND the background
       fallback ack fails → {ok:false, reason:"no-destination"} with the
       failure toast and no issue tab. The worker-side tabs.create
       wrapper forces the ack to fail; the wrapper is restored right
       after the trigger and the window.open stub is restored by
       assignment (no reload — see G). */
    assert.equal(
      await selectNeedle('[data-id="urn:li:activity:clean-1"]', "ordinary"),
      true,
      "expected to place a partial selection in the clean post"
    );
    const noDestWorker = context.serviceWorkers()[0];
    await noDestWorker.evaluate(() => {
      globalThis.__SS_origTabsCreate = chrome.tabs.create;
      chrome.tabs.create = function (_opts, cb) {
        try {
          Object.defineProperty(chrome.runtime, "lastError", {
            value: { message: "injected double-failure" },
            configurable: true,
          });
        } catch (_) {
          /* If lastError cannot be faked, throwing still fails the ack. */
          throw new Error("injected double-failure");
        }
        if (typeof cb === "function") cb();
        try {
          delete chrome.runtime.lastError;
        } catch (_) {
          /* Best-effort restore of the faked property. */
        }
        return undefined;
      };
    });
    await patchContentWorld(
      "window.__SS_origOpen = window.open; window.open = () => null;"
    );
    await clearFixedDivs();
    const toastCountBeforeG2 = await countFixedDivs();
    const noDest = await triggerAndExpectNoIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam" })
    );
    await noDestWorker.evaluate(() => {
      if (globalThis.__SS_origTabsCreate) {
        chrome.tabs.create = globalThis.__SS_origTabsCreate;
        delete globalThis.__SS_origTabsCreate;
      }
    });
    assert.deepEqual(
      noDest,
      { ok: false, reason: "no-destination" },
      "expected the double-failure error path"
    );
    await expectNewReportToast("reportFailed", toastCountBeforeG2);
    await patchContentWorld(
      "window.open = window.__SS_origOpen; delete window.__SS_origOpen;"
    );
    await assertCount(reportPage.locator("[data-ss-ph]"), 1);

    /* H. Missing receiver: messaging a tab with no content script
       resolves null — no retry, no navigation, no crash. */
    const blankPage = await context.newPage();
    await blankPage.goto("about:blank");
    await blankPage.bringToFront();
    const missing = await triggerAndExpectNoIssueTab(() =>
      sendTabMessage(context, { action: "reportMissedSpam", selectionText: "probe" })
    );
    assert.equal(missing, null, "expected null with no content receiver");
    await blankPage.close();
    await reportPage.bringToFront();

    /* I. Old report still works: the placeholder button keeps its exact
       payload shape (EN marker) after the helper extraction. */
    const oldBtn = reportPage.locator("[data-ss-ph] button", {
      hasText: /Report missed spam|Reportar spam no detectado/,
    });
    const oldPagePromise = context.waitForEvent("page", { timeout: 8000 });
    await oldBtn.click();
    const oldTab = await oldPagePromise;
    assert.match(oldTab.url(), /missed_spam_pattern/);
    const oldCopied = await readReportClipboard();
    assert.match(oldCopied, /Comment "CLAUDE"/);
    assert.match(oldCopied, /Pattern language: EN/);
    assert.match(oldCopied, /LinkedIn page:/);
    await closeIssueTab(oldTab);
    await assertCount(reportPage.locator("[data-ss-ph]"), 1);

    /* J. Background dispatch proof: invoke the real onClicked handler
       exposed as globalThis.__SS_handleContextMenuClick (test hook —
       worker globals are unreachable from page/prod code). sendMessage
       is wrapped with a recorder, then unwrapped; three fixtures cover
       the LinkedIn dispatch, the non-LinkedIn-host reject, and the
       missing-tab-id branch. The sender guard stays intact throughout:
       every message above traveled via real chrome.tabs.sendMessage. */
    const backgroundSrc = fs.readFileSync(
      path.join(__dirname, "..", "background.js"),
      "utf8"
    );
    assert.match(backgroundSrc, /ss-report-missed/);
    assert.match(backgroundSrc, /reportMissedMenu/);
    assert.match(backgroundSrc, /contexts:\s*\["selection"\]/);
    assert.match(backgroundSrc, /documentUrlPatterns/);
    assert.match(backgroundSrc, /chrome\.tabs\.sendMessage\(\s*tab\.id/);
    const dispatchWorker = context.serviceWorkers()[0];
    const dispatchResult = await dispatchWorker.evaluate(() => new Promise((resolve) => {
      const handler = globalThis.__SS_handleContextMenuClick;
      if (typeof handler !== "function") {
        resolve({ hasHandler: false });
        return;
      }
      const calls = [];
      const orig = chrome.tabs.sendMessage;
      chrome.tabs.sendMessage = function (tabId, msg, cb) {
        calls.push({ tabId, msg });
        if (typeof cb === "function") cb({ ok: true, copied: true });
        return undefined;
      };
      try {
        handler(
          { menuItemId: "ss-report-missed", pageUrl: "https://www.linkedin.com/feed/", selectionText: "handler probe text" },
          { id: 424242, url: "https://www.linkedin.com/feed/" }
        );
        const linkedInCalls = calls.slice();
        calls.length = 0;
        handler(
          { menuItemId: "ss-report-missed", pageUrl: "https://example.com/", selectionText: "probe" },
          { id: 424242, url: "https://example.com/" }
        );
        const nonLinkedInCalls = calls.slice();
        calls.length = 0;
        handler(
          { menuItemId: "ss-report-missed", pageUrl: "https://www.linkedin.com/feed/", selectionText: "probe" },
          undefined
        );
        const missingTabCalls = calls.slice();
        resolve({ hasHandler: true, linkedInCalls, nonLinkedInCalls, missingTabCalls });
      } finally {
        chrome.tabs.sendMessage = orig;
      }
    }));
    assert.equal(dispatchResult.hasHandler, true, "expected the exposed onClicked handler");
    assert.equal(dispatchResult.linkedInCalls.length, 1, "expected one dispatch for a LinkedIn click");
    assert.equal(dispatchResult.linkedInCalls[0].tabId, 424242, "expected dispatch to the clicked tab.id");
    assert.equal(
      dispatchResult.linkedInCalls[0].msg.action,
      "reportMissedSpam",
      "expected the reportMissedSpam action"
    );
    assert.equal(
      dispatchResult.linkedInCalls[0].msg.selectionText,
      "handler probe text",
      "expected the clicked selection text"
    );
    assert.equal(dispatchResult.nonLinkedInCalls.length, 0, "expected no dispatch for a non-LinkedIn host");
    assert.equal(dispatchResult.missingTabCalls.length, 0, "expected no dispatch with a missing tab id");

    /* Report actions are read-only: storage is byte-identical to the
       steady-state snapshot (counters included). */
    assert.deepEqual(
      await snapshotReportStorage(),
      reportStorageBefore,
      "expected report actions to mutate no stored state"
    );
    await reportWorker.evaluate(() => {
      if (globalThis.__SS_origReportTabsCreate) {
        chrome.tabs.create = globalThis.__SS_origReportTabsCreate;
        delete globalThis.__SS_origReportTabsCreate;
      }
    });
    await reportPage.close();

    console.log("Extension interactions test passed.");
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function waitForSyncValue(context, key, predicate, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    const value = await getSyncStorage(context, key);
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for sync ${key} to satisfy predicate`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function waitForLocalValue(context, key, predicate, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    const value = await getLocalStorage(context, key);
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for local ${key} to satisfy predicate`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/* Mirror of SS_getLocalDayKey: the extension's local-time YYYY-MM-DD
   bucket key. If the two ever disagree, this duplication is doing its
   job (plan 035). */
function getLocalDayKey() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
