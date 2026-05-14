(function () {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    ENABLED: "ss_enabled",
    COUNT: "ss_blocked_count",
    DAILY_COUNTS: "ss_daily_counts",
    SNOOZE_UNTIL: "ss_snooze_until",
    ONBOARDED: "ss_onboarded",
  });

  const SNOOZE_DURATION_MS = 30 * 60 * 1000;

  function t(key, subs) {
    return chrome.i18n.getMessage(key, subs) || key;
  }

  const toggleEl = document.getElementById("toggleEnabled");
  const countEl = document.getElementById("blockedCount");
  const resetBtn = document.getElementById("resetBtn");
  const snoozeBtn = document.getElementById("snoozeBtn");
  const snoozeStatus = document.getElementById("snoozeStatus");
  const manageLink = document.getElementById("manageLink");
  const todayCountEl = document.getElementById("todayCount");
  const weekCountEl = document.getElementById("weekCount");
  const lifetimeCountEl = document.getElementById("lifetimeCount");
  const lastBlockedSection = document.getElementById("lastBlockedSection");
  const lastBlockedList = document.getElementById("lastBlockedList");
  const suggestionSection = document.getElementById("suggestionSection");
  const suggestionList = document.getElementById("suggestionList");
  const noConnection = document.getElementById("noConnection");
  const mainContent = document.getElementById("mainContent");
  const loadingState = document.getElementById("loadingState");
  const connectionNotice = document.getElementById("connectionNotice");

  /* --- Get current tab --- */
  function getTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      cb(tabs[0]);
    });
  }

  /* --- Send message to content script --- */
  function send(msg, cb) {
    getTab((tab) => {
      if (!tab?.id) {
        if (cb) cb(null);
        return;
      }
      chrome.tabs.sendMessage(tab.id, msg, (response) => {
        if (chrome.runtime.lastError) {
          if (cb) cb(null);
          return;
        }
        if (cb) cb(response);
      });
    });
  }

  function readRuntimeValue(localResult, syncResult, key, fallback) {
    if (localResult[key] !== undefined) return localResult[key];
    if (syncResult[key] !== undefined) return syncResult[key];
    return fallback;
  }

  function migrateRuntimeState(syncResult, localResult) {
    const localPatch = {};
    const removeKeys = [];

    [
      STORAGE_KEYS.COUNT,
      STORAGE_KEYS.DAILY_COUNTS,
      STORAGE_KEYS.SNOOZE_UNTIL,
      STORAGE_KEYS.ONBOARDED,
    ].forEach((key) => {
      if (localResult[key] === undefined && syncResult[key] !== undefined) {
        localPatch[key] = syncResult[key];
        removeKeys.push(key);
      }
    });

    if (removeKeys.length === 0) return;

    chrome.storage.local.set(localPatch, () => {
      chrome.storage.sync.remove(removeKeys);
    });
  }

  function getStoredState(cb) {
    chrome.storage.sync.get(
      [
        STORAGE_KEYS.ENABLED,
        STORAGE_KEYS.COUNT,
        STORAGE_KEYS.DAILY_COUNTS,
        STORAGE_KEYS.SNOOZE_UNTIL,
      ],
      (syncResult) => {
        chrome.storage.local.get(
          [
            STORAGE_KEYS.COUNT,
            STORAGE_KEYS.DAILY_COUNTS,
            STORAGE_KEYS.SNOOZE_UNTIL,
          ],
          (localResult) => {
            migrateRuntimeState(syncResult, localResult);

            const snoozeUntil = readRuntimeValue(
              localResult,
              syncResult,
              STORAGE_KEYS.SNOOZE_UNTIL,
              0
            );

            cb({
              enabled: syncResult[STORAGE_KEYS.ENABLED] !== false,
              blockedCount: readRuntimeValue(
                localResult,
                syncResult,
                STORAGE_KEYS.COUNT,
                0
              ),
              dailyCounts: readRuntimeValue(
                localResult,
                syncResult,
                STORAGE_KEYS.DAILY_COUNTS,
                {}
              ),
              snoozeUntil,
              snoozed: Date.now() < snoozeUntil,
              lastBlocked: [],
              suggestions: [],
            });
          }
        );
      }
    );
  }

  function setExtensionState(syncPatch, localPatch, cb) {
    const tasks = [];

    if (syncPatch && Object.keys(syncPatch).length > 0) {
      tasks.push((done) => chrome.storage.sync.set(syncPatch, done));
    }
    if (localPatch && Object.keys(localPatch).length > 0) {
      tasks.push((done) => chrome.storage.local.set(localPatch, done));
    }

    if (tasks.length === 0) {
      if (cb) cb();
      return;
    }

    let pending = tasks.length;
    tasks.forEach((task) => {
      task(() => {
        pending -= 1;
        if (pending === 0 && cb) cb();
      });
    });
  }

  function clearBadge() {
    chrome.action.setBadgeText({ text: "" });
  }

  /* --- Show/hide connection/loading states --- */
  function showConnectionState(connected) {
    loadingState.style.display = "none";
    noConnection.style.display = connected ? "none" : "block";
    mainContent.style.display = connected ? "block" : "none";
  }

  function renderState(response, hasLiveState) {
    showConnectionState(true);
    connectionNotice.textContent = t("noLiveTabNotice");
    connectionNotice.style.display = hasLiveState ? "none" : "block";
    toggleEl.checked = response.enabled;
    countEl.textContent = response.blockedCount;

    /* Stats */
    if (response.dailyCounts) {
      const today = new Date().toISOString().slice(0, 10);
      const todayVal = response.dailyCounts[today] || 0;
      let weekVal = 0;
      const d = new Date();
      for (let i = 0; i < 7; i++) {
        const key = d.toISOString().slice(0, 10);
        weekVal += response.dailyCounts[key] || 0;
        d.setDate(d.getDate() - 1);
      }
      todayCountEl.textContent = todayVal;
      weekCountEl.textContent = weekVal;
      lifetimeCountEl.textContent = response.blockedCount;
    }

    /* Last blocked */
    if (hasLiveState && response.lastBlocked && response.lastBlocked.length > 0) {
      lastBlockedSection.style.display = "block";
      lastBlockedList.innerHTML = "";
      response.lastBlocked.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "last-blocked-item";

        const text = document.createElement("span");
        text.className = "lb-text";
        text.textContent = item.triggerText;
        row.appendChild(text);

        const time = document.createElement("span");
        time.className = "lb-time";
        const ago = Math.round((Date.now() - item.timestamp) / 60000);
        time.textContent = ago < 1 ? t("justNow") : ago + t("mAgo");
        row.appendChild(time);

        const undoBtn = document.createElement("button");
        undoBtn.className = "lb-undo";
        undoBtn.textContent = t("undo");
        undoBtn.addEventListener("click", () => {
          send({ action: "undoBlock", index }, (resp) => {
            if (resp && resp.ok) refreshState();
          });
        });
        row.appendChild(undoBtn);

        lastBlockedList.appendChild(row);
      });
    } else {
      lastBlockedSection.style.display = "none";
    }

    /* Suggestions */
    if (hasLiveState && response.suggestions && response.suggestions.length > 0) {
      suggestionSection.style.display = "block";
      suggestionList.innerHTML = "";
      response.suggestions.forEach((s) => {
        const row = document.createElement("div");
        row.className = "suggestion-item";

        const text = document.createElement("span");
        text.className = "suggestion-text";
        text.textContent = t("add") + ' "' + s.word + '"?';
        row.appendChild(text);

        const addBtn = document.createElement("button");
        addBtn.className = "suggestion-add";
        addBtn.textContent = t("add");
        addBtn.addEventListener("click", () => {
          send({ action: "addSuggestion", word: s.word }, (resp) => {
            if (resp && resp.ok) refreshState();
          });
        });
        row.appendChild(addBtn);

        const dismissBtn = document.createElement("button");
        dismissBtn.className = "suggestion-dismiss";
        dismissBtn.textContent = "×";
        dismissBtn.title = t("suggestionDismiss");
        dismissBtn.setAttribute("aria-label", t("suggestionDismiss"));
        dismissBtn.addEventListener("click", () => {
          send({ action: "dismissSuggestion", word: s.word }, () => refreshState());
        });
        row.appendChild(dismissBtn);

        suggestionList.appendChild(row);
      });
    } else {
      suggestionSection.style.display = "none";
    }

    if (response.snoozed) {
      const until = new Date(response.snoozeUntil);
      snoozeStatus.textContent =
        t("snoozedUntil") + " " + until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      snoozeBtn.textContent = t("cancelSnooze");
      snoozeBtn.dataset.snoozing = "1";
    } else {
      snoozeStatus.textContent = "";
      snoozeBtn.textContent = t("snooze30");
      snoozeBtn.dataset.snoozing = "";
    }
  }

  /* --- Refresh state from content script --- */
  function refreshState() {
    loadingState.style.display = "flex";
    noConnection.style.display = "none";
    mainContent.style.display = "none";
    send({ action: "getState" }, (response) => {
      if (!response) {
        getStoredState((storedState) => {
          renderState(storedState, false);
        });
        return;
      }
      renderState(response, true);
    });
  }

  /* --- Toggle --- */
  toggleEl.addEventListener("change", () => {
    send({ action: "toggle", enabled: toggleEl.checked }, (response) => {
      if (response) {
        refreshState();
        return;
      }

      const patch = {
        [STORAGE_KEYS.ENABLED]: toggleEl.checked,
      };
      if (!toggleEl.checked) clearBadge();
      setExtensionState(patch, { [STORAGE_KEYS.SNOOZE_UNTIL]: 0 }, refreshState);
    });
  });

  /* --- Reset with confirmation --- */
  resetBtn.addEventListener("click", () => {
    if (resetBtn.dataset.confirming === "1") {
      send({ action: "resetCount" }, (response) => {
        if (response) {
          refreshState();
          return;
        }

        clearBadge();
        setExtensionState(
          null,
          {
            [STORAGE_KEYS.COUNT]: 0,
            [STORAGE_KEYS.DAILY_COUNTS]: {},
          },
          refreshState
        );
      });
      resetBtn.dataset.confirming = "";
      resetBtn.textContent = t("resetCount");
    } else {
      resetBtn.dataset.confirming = "1";
      resetBtn.textContent = t("clickToConfirm");
      setTimeout(() => {
        if (resetBtn.dataset.confirming === "1") {
          resetBtn.dataset.confirming = "";
          resetBtn.textContent = t("resetCount");
        }
      }, 3000);
    }
  });

  /* --- Snooze --- */
  snoozeBtn.addEventListener("click", () => {
    if (snoozeBtn.dataset.snoozing) {
      send({ action: "clearSnooze" }, (response) => {
        if (response) {
          refreshState();
          return;
        }

        setExtensionState(null, { [STORAGE_KEYS.SNOOZE_UNTIL]: 0 }, refreshState);
      });
    } else {
      send({ action: "snooze" }, (response) => {
        if (response) {
          refreshState();
          return;
        }

        setExtensionState(
          null,
          { [STORAGE_KEYS.SNOOZE_UNTIL]: Date.now() + SNOOZE_DURATION_MS },
          refreshState
        );
      });
    }
  });

  /* --- Open options page --- */
  manageLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  /* --- Initial load --- */
  refreshState();
})();
