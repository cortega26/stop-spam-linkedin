(function () {
  "use strict";

  importScripts("shared/constants.js");
  importScripts("shared/pattern-data.js");

  const { PHRASES_STORAGE_KEY, STORAGE_KEYS, LIMITS } = globalThis.SS_CONSTANTS;

  function t(key, subs) {
    return chrome.i18n.getMessage(key, subs) || key;
  }

  const MENU_ID = "ss-add-phrase";
  const MENU_ID_BLOCK_AUTHOR = "ss-block-author";

  function estimatePhraseBytes(phrases, storageKey) {
    const bytes = new TextEncoder().encode(JSON.stringify(phrases)).length;
    return storageKey.length + bytes;
  }

  /* ── Init ───────────────────────────────────────────────────── */
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "install" && details.reason !== "update") return;
    chrome.contextMenus.create({
      id: MENU_ID,
      title: t("contextMenuTitle"),
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_ID_BLOCK_AUTHOR,
      title: t("blockAuthorMenu"),
      contexts: ["link"],
      targetUrlPatterns: [
        "*://*.linkedin.com/in/*",
        "*://*.linkedin.com/company/*",
        "*://*.linkedin.com/school/*",
        "*://*.linkedin.com/showcase/*",
      ],
    });
  });

  /* ── Badge relay (called from content script) ──────────────── */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (msg.action === "updateBadge") {
      const text = typeof msg.text === "string" ? msg.text.slice(0, 4) : "";
      chrome.action.setBadgeText({ text });
      if (text) {
        chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
      }
      sendResponse({ ok: true });
    }
  });

  /* ── Click handler ──────────────────────────────────────────── */
  chrome.contextMenus.onClicked.addListener((info, _tab) => {
    if (info.menuItemId === MENU_ID_BLOCK_AUTHOR) {
      const authorId = SS_parseAuthorId(info.linkUrl, "https://www.linkedin.com");
      if (!authorId) return;

      chrome.storage.sync.get([STORAGE_KEYS.BLOCKED_AUTHORS],
        /** @param {{ [key: string]: any }} result */
        (result) => {
        const blocked = result[STORAGE_KEYS.BLOCKED_AUTHORS] || [];
        if (blocked.includes(authorId)) return;
        if (blocked.length >= LIMITS.MAX_BLOCKED_AUTHORS) return;
        blocked.push(authorId);
        chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: blocked }, () => {
          if (chrome.runtime.lastError) {
            console.warn("Failed to save blocked author via context menu:", chrome.runtime.lastError.message);
          }
        });
      });
      return;
    }

    if (info.menuItemId !== MENU_ID) return;

    const text = (info.selectionText || "").trim();
    if (!text) return;
    if (text.length > LIMITS.MAX_PHRASE_LENGTH) return;

    chrome.storage.sync.get([PHRASES_STORAGE_KEY],
      /** @param {{ [key: string]: any }} result */
      (result) => {
      const phrases = result[PHRASES_STORAGE_KEY] || [];
      if (phrases.length >= LIMITS.MAX_CUSTOM_PHRASES) return;

      /* Duplicate check */
      const dup = phrases.find(
        (p) => typeof p.text === "string" && p.text.toLowerCase() === text.toLowerCase()
      );
      if (dup) return; /* silently skip — no UI to report in service worker */

      const candidate = phrases.concat([{
        id: uid(),
        text,
        enabled: true,
        created: Date.now(),
        mode: "exact",
      }]);

      const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
      if (estimatePhraseBytes(candidate, PHRASES_STORAGE_KEY) > limit) {
        console.warn("Skipped adding phrase via context menu: would exceed storage.sync quota.");
        return;
      }

      chrome.storage.sync.set({ [PHRASES_STORAGE_KEY]: candidate }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to save phrase via context menu:", chrome.runtime.lastError.message);
        }
      });
    });
  });

  /* ── UID (fallback-safe) ────────────────────────────────────── */
  function uid() {
    try {
      return crypto.randomUUID();
    } catch (_) {
      return (
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 9)
      );
    }
  }
})();
