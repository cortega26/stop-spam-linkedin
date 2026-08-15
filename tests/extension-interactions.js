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
