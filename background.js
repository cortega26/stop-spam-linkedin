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
  const MENU_ID_REPORT_MISSED = "ss-report-missed";
  const REPORT_ISSUE_URL = "https://github.com/cortega26/stop-spam-linkedin/issues/new?template=missed_spam_pattern.yml";

  function estimatePhraseBytes(phrases, storageKey) {
    const bytes = new TextEncoder().encode(JSON.stringify(phrases)).length;
    return storageKey.length + bytes;
  }

  /* ── Init ───────────────────────────────────────────────────── */
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "install" && details.reason !== "update") return;
    chrome.contextMenus.removeAll(() => {
      const createMenu = (options) => {
        chrome.contextMenus.create(options, () => {
          if (chrome.runtime.lastError) {
            console.warn("contextMenus.create failed:", chrome.runtime.lastError.message);
          }
        });
      };
      createMenu({
        id: MENU_ID,
        title: t("contextMenuTitle"),
        contexts: ["selection"],
      });
      createMenu({
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
      createMenu({
        id: MENU_ID_REPORT_MISSED,
        title: t("reportMissedMenu"),
        contexts: ["selection"],
        documentUrlPatterns: ["*://*.linkedin.com/*"],
      });
    });

    if (details.reason === "install") {
      chrome.storage.local.set({ [STORAGE_KEYS.WELCOME_PENDING]: true }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to set welcome flag (local.set):", chrome.runtime.lastError.message);
        }
        chrome.runtime.openOptionsPage();
      });
    }
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
      return false;
    }
    if (msg.action === "openReportTab") {
      /* Fallback when the content script's window.open was blocked: the
         service worker needs no gesture to open exactly one tab. */
      chrome.tabs.create({ url: REPORT_ISSUE_URL }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false });
        } else {
          sendResponse({ ok: true });
        }
      });
      return true;
    }
    return false;
  });

  /* True when the clicked page is a LinkedIn host. Tab/page URLs come
     from the browser event, never from page content. */
  function isLinkedInPageUrl(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      return SS_isLinkedInHost(new URL(value).hostname);
    } catch (_) {
      return false;
    }
  }

  /* ── Click handler ──────────────────────────────────────────── */
  function handleContextMenuClick(info, tab) {
    if (info.menuItemId === MENU_ID_REPORT_MISSED) {
      /* Dispatch to the clicked tab only — never re-resolve the active
         tab later. Missing receiver: no retries, no navigation. */
      if (!tab || typeof tab.id !== "number") return;
      if (!isLinkedInPageUrl(info.pageUrl || tab.url || tab.pendingUrl)) return;
      const selectionText = typeof info.selectionText === "string"
        ? info.selectionText
        : "";
      chrome.tabs.sendMessage(
        tab.id,
        { action: "reportMissedSpam", selectionText },
        () => {
          if (chrome.runtime.lastError) {
            /* No content receiver (e.g. chrome:// tab) — stay silent. */
          }
        }
      );
      return;
    }
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
  }
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
  /* Test hook: worker globals are unreachable from page/prod code. */
  globalThis.__SS_handleContextMenuClick = handleContextMenuClick;

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
