(function () {
  "use strict";

  const { STORAGE_KEYS, LIMITS } = globalThis.SS_CONSTANTS;

  const toggleEl = /** @type {HTMLInputElement} */ (document.getElementById("toggleEnabled"));
  const countEl = document.getElementById("blockedCount");
  const resetBtn = document.getElementById("resetBtn");
  const snoozeBtn = document.getElementById("snoozeBtn");
  const showAllBtn = document.getElementById("showAllBtn");
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
  const patternSection = document.getElementById("patternSection");
  const patternList = document.getElementById("patternList");

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
      if (chrome.runtime.lastError) {
        console.warn("Storage migration (local.set) failed:", chrome.runtime.lastError.message);
        return;
      }
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
            STORAGE_KEYS.PATTERN_COUNTS,
            STORAGE_KEYS.SNOOZE_UNTIL,
            STORAGE_KEYS.PENDING_SUGGESTIONS,
          ],
          /** @param {{ [key: string]: any }} localResult */
          (localResult) => {
            migrateRuntimeState(syncResult, localResult);

            const snoozeUntil = SS_readRuntimeValue(
              localResult,
              syncResult,
              STORAGE_KEYS.SNOOZE_UNTIL,
              0
            );

            cb({
              enabled: syncResult[STORAGE_KEYS.ENABLED] !== false,
              blockedCount: SS_readRuntimeValue(
                localResult,
                syncResult,
                STORAGE_KEYS.COUNT,
                0
              ),
              dailyCounts: SS_readRuntimeValue(
                localResult,
                syncResult,
                STORAGE_KEYS.DAILY_COUNTS,
                {}
              ),
              patternCounts: localResult[STORAGE_KEYS.PATTERN_COUNTS] || {},
              snoozeUntil,
              snoozed: Date.now() < snoozeUntil,
              lastBlocked: [],
              /* Plan 054 §5 decision (read-only fallback): with no live
                 tab, render the persisted queue so suggestions survive
                 reload; Add/Dismiss stay on the live path (or options)
                 to avoid duplicating the content-script validation. */
              suggestions: SS_normalizePendingSuggestions(
                localResult[STORAGE_KEYS.PENDING_SUGGESTIONS] || [],
                LIMITS.MAX_PHRASE_LENGTH,
                LIMITS.MAX_PENDING_SUGGESTIONS
              ),
            });
          }
        );
      }
    );
  }

  function setExtensionState(syncPatch, localPatch, cb) {
    const tasks = [];

    if (syncPatch && Object.keys(syncPatch).length > 0) {
      tasks.push((done) => chrome.storage.sync.set(syncPatch, () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to save extension state (sync.set):", chrome.runtime.lastError.message);
        }
        done();
      }));
    }
    if (localPatch && Object.keys(localPatch).length > 0) {
      tasks.push((done) => chrome.storage.local.set(localPatch, () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to save extension state (local.set):", chrome.runtime.lastError.message);
        }
        done();
      }));
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

  /* Resolve a pattern-counts bucket to a display label: built-in ids map
     to their pattern label (SS_PATTERN_DATA), custom/author buckets to
     their i18n names, and any unknown bucket renders raw (defensive). */
  function patternBucketLabel(bucket) {
    for (const lang of Object.keys(SS_PATTERN_DATA)) {
      for (const entry of SS_PATTERN_DATA[lang]) {
        if (entry.id === bucket) return entry.label;
      }
    }
    if (bucket === "custom") return SS_t("byPatternCustom");
    if (bucket === "author") return SS_t("byPatternAuthor");
    return bucket;
  }

  function renderState(response, hasLiveState) {
    showConnectionState(true);
    connectionNotice.textContent = SS_t("noLiveTabNotice");
    connectionNotice.style.display = hasLiveState ? "none" : "block";
    showAllBtn.style.display = hasLiveState ? "" : "none";
    toggleEl.checked = response.enabled;
    countEl.textContent = response.blockedCount;

    /* Stats */
    if (response.dailyCounts) {
      const today = SS_getLocalDayKey();
      const todayVal = response.dailyCounts[today] || 0;
      let weekVal = 0;
      const d = new Date();
      for (let i = 0; i < 7; i++) {
        const key = SS_getLocalDayKey(d);
        weekVal += response.dailyCounts[key] || 0;
        d.setDate(d.getDate() - 1);
      }
      todayCountEl.textContent = todayVal;
      weekCountEl.textContent = String(weekVal);
      lifetimeCountEl.textContent = response.blockedCount;
    }

    /* By-pattern breakdown (plan 053): top 5 buckets sorted desc, live
       via getState or offline via getStoredState — same shape. */
    if (response.patternCounts && Object.keys(response.patternCounts).length > 0) {
      patternSection.style.display = "block";
      patternList.innerHTML = "";
      Object.entries(response.patternCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([bucket, count]) => {
          const row = document.createElement("div");
          row.className = "pattern-item";
          const name = document.createElement("span");
          name.className = "pattern-name";
          name.textContent = patternBucketLabel(bucket);
          row.appendChild(name);
          const value = document.createElement("span");
          value.className = "pattern-count";
          value.textContent = String(count);
          row.appendChild(value);
          patternList.appendChild(row);
        });
    } else {
      patternSection.style.display = "none";
    }

    /* Last blocked */
    if (hasLiveState && response.lastBlocked && response.lastBlocked.length > 0) {
      lastBlockedSection.style.display = "block";
      lastBlockedList.innerHTML = "";
      response.lastBlocked.forEach((item) => {
        const row = document.createElement("div");
        row.className = "last-blocked-item";

        const main = document.createElement("div");
        main.className = "lb-main";

        const text = document.createElement("span");
        text.className = "lb-text";
        text.textContent = item.triggerText;
        main.appendChild(text);

        if (item.label) {
          const match = document.createElement("span");
          match.className = "lb-match";
          match.textContent = SS_t("matchedLabel") + " " + item.label;
          main.appendChild(match);
        }
        row.appendChild(main);

        const time = document.createElement("span");
        time.className = "lb-time";
        const ago = Math.round((Date.now() - item.timestamp) / 60000);
        time.textContent = ago < 1 ? SS_t("justNow") : ago + SS_t("mAgo");
        row.appendChild(time);

        const undoBtn = document.createElement("button");
        undoBtn.className = "lb-undo";
        undoBtn.textContent = SS_t("undo");
        undoBtn.addEventListener("click", () => {
          send({ action: "undoBlock", id: item.id }, (resp) => {
            if (resp && resp.ok) refreshState();
          });
        });
        row.appendChild(undoBtn);

        lastBlockedList.appendChild(row);
      });
    } else {
      lastBlockedSection.style.display = "none";
    }

    /* Suggestions: rendered whenever the list is non-empty (design §5
       drops the hasLiveState gate). Add/Dismiss buttons only exist on the
       live path — the fallback is read-only (see §5 decision in
       getStoredState) and shows a hint pointing to a LinkedIn tab. */
    if (response.suggestions && response.suggestions.length > 0) {
      suggestionSection.style.display = "block";
      suggestionList.innerHTML = "";
      if (!hasLiveState) {
        const hint = document.createElement("div");
        hint.className = "suggestion-fallback-hint connection-notice";
        hint.style.display = "block";
        hint.textContent = SS_t("suggestionsFallbackHint");
        suggestionList.appendChild(hint);
      }
      response.suggestions.forEach((s) => {
        const row = document.createElement("div");
        row.className = "suggestion-item";

        const text = document.createElement("span");
        text.className = "suggestion-text";
        text.textContent = SS_t("add") + ' "' + s.word + '"?';
        row.appendChild(text);

        if (hasLiveState) {
          const addBtn = document.createElement("button");
          addBtn.className = "suggestion-add";
          addBtn.textContent = SS_t("add");
          addBtn.addEventListener("click", () => {
            send({ action: "addSuggestion", word: s.word }, (resp) => {
              if (resp && resp.ok) refreshState();
            });
          });
          row.appendChild(addBtn);

          const dismissBtn = document.createElement("button");
          dismissBtn.className = "suggestion-dismiss";
          dismissBtn.textContent = "×";
          dismissBtn.title = SS_t("suggestionDismiss");
          dismissBtn.setAttribute("aria-label", SS_t("suggestionDismiss"));
          dismissBtn.addEventListener("click", () => {
            send({ action: "dismissSuggestion", word: s.word }, () => refreshState());
          });
          row.appendChild(dismissBtn);
        }

        suggestionList.appendChild(row);
      });
    } else {
      suggestionSection.style.display = "none";
    }

    if (response.snoozed) {
      const until = new Date(response.snoozeUntil);
      snoozeStatus.textContent =
        SS_t("snoozedUntil") + " " + until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      snoozeBtn.textContent = SS_t("cancelSnooze");
      snoozeBtn.dataset.snoozing = "1";
    } else {
      snoozeStatus.textContent = "";
      snoozeBtn.textContent = SS_t("snooze30");
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
            [STORAGE_KEYS.PATTERN_COUNTS]: {},
          },
          refreshState
        );
      });
      resetBtn.dataset.confirming = "";
      resetBtn.textContent = SS_t("resetCount");
    } else {
      resetBtn.dataset.confirming = "1";
      resetBtn.textContent = SS_t("clickToConfirm");
      setTimeout(() => {
        if (resetBtn.dataset.confirming === "1") {
          resetBtn.dataset.confirming = "";
          resetBtn.textContent = SS_t("resetCount");
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
          { [STORAGE_KEYS.SNOOZE_UNTIL]: Date.now() + LIMITS.SNOOZE_DURATION_MS },
          refreshState
        );
      });
    }
  });

  showAllBtn.addEventListener("click", () => {
    send({ action: "restoreAll" }, (response) => {
      if (response && response.ok) refreshState();
    });
  });

  /* --- Open options page --- */
  manageLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  /* --- Initial load --- */
  refreshState();
})();
