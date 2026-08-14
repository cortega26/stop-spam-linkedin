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
  getLocalStorage,
  getExtensionId,
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

    /* ── Popup: reset count (plan 014 step 3.5) ─────────────────── */

    await linkedInPage.bringToFront();
    await popup.locator("#resetBtn").click();
    await popup.locator("#resetBtn").click();
    await waitForLocalValue(context, "ss_blocked_count", (v) => v === 0);

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

    await optionsPage.close();
    await popup.close();

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
