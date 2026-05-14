(function () {
  "use strict";

  const STORAGE_KEY = "ss_phrases";
  const MENU_ID = "ss-add-phrase";
  const MAX_CUSTOM_PHRASES = 200;

  /* ── Init ───────────────────────────────────────────────────── */
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage("contextMenuTitle"),
      contexts: ["selection"],
    });
  });

  /* ── Badge relay (called from content script) ──────────────── */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "updateBadge") {
      chrome.action.setBadgeText({ text: msg.text });
      if (msg.text) {
        chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
      }
      sendResponse({ ok: true });
    }
  });

  /* ── Click handler ──────────────────────────────────────────── */
  chrome.contextMenus.onClicked.addListener((info, _tab) => {
    if (info.menuItemId !== MENU_ID) return;

    const text = (info.selectionText || "").trim();
    if (!text) return;

    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      const phrases = result[STORAGE_KEY] || [];
      if (phrases.length >= MAX_CUSTOM_PHRASES) return;

      /* Duplicate check */
      const dup = phrases.find(
        (p) => p.text.toLowerCase() === text.toLowerCase()
      );
      if (dup) return; /* silently skip — no UI to report in service worker */

      phrases.push({
        id: uid(),
        text,
        enabled: true,
        created: Date.now(),
        mode: "exact",
      });

      chrome.storage.sync.set({ [STORAGE_KEY]: phrases });
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
