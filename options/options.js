(function () {
  "use strict";

  const { PHRASES_STORAGE_KEY, STORAGE_KEYS, LIMITS, DEFAULT_ENABLED_LANGS } = globalThis.SS_CONSTANTS;

  function estimatePhraseBytes(phrases, storageKey) {
    return storageKey.length + JSON.stringify(phrases).length;
  }

  /* ── State ──────────────────────────────────────────────────── */
  let phrases = [];
  let editId = null;
  let enabledLangs = [...DEFAULT_ENABLED_LANGS];
  let disabledPatterns = [];
  let whitelist = [];
  let blockedAuthors = [];
  let pendingDeleteId = null;
  let pendingWhitelistRemove = null;
  let pendingBlockedAuthorRemove = null;
  let excluded = [];
  let pendingExclusionRemove = null;
  let hidePromoted = false;
  let hideFeatured = false;

  /* ── DOM refs ───────────────────────────────────────────────── */
  const input = document.getElementById("phraseInput");
  const addBtn = document.getElementById("addBtn");
  const list = document.getElementById("phraseList");
  const empty = document.getElementById("emptyState");
  const countLabel = document.getElementById("countLabel");
  const importBtn = document.getElementById("importBtn");
  const exportBtn = document.getElementById("exportBtn");
  const starterPackBtn = document.getElementById("starterPackBtn");
  const importFile = document.getElementById("importFile");
  const toast = document.getElementById("toast");
  const langToggles = document.getElementById("langToggles");
  const whitelistSection = document.getElementById("whitelistSection");
  const whitelistList = document.getElementById("whitelistList");
  const blockedAuthorSection = document.getElementById("blockedAuthorSection");
  const blockedAuthorList = document.getElementById("blockedAuthorList");
  const excludedSection = document.getElementById("excludedSection");
  const excludedList = document.getElementById("excludedList");
  const clearExcludedBtn = document.getElementById("clearExcludedBtn");
  const hidePromotedCheckbox = document.getElementById("hidePromotedCheckbox");
  const hideFeaturedCheckbox = document.getElementById("hideFeaturedCheckbox");
  const searchInput = document.getElementById("searchInput");

  /* ── Bootstrap ──────────────────────────────────────────────── */
  load();
  addBtn.addEventListener("click", handleAdd);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAdd();
  });
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", handleImport);
  exportBtn.addEventListener("click", handleExport);
  starterPackBtn.addEventListener("click", handleStarterPack);
  searchInput.addEventListener("input", debounce(() => render(), 200));
  clearExcludedBtn.addEventListener("click", () => {
    if (clearExcludedBtn.dataset.confirming === "1") {
      clearExcludedBtn.dataset.confirming = "";
      clearExcludedBtn.textContent = t("excludedClearAll");
      clearExcludedBtn.setAttribute("aria-label", t("excludedClearAll"));
      clearExcludedBtn.title = t("excludedClearAll");
      excluded = [];
      pendingExclusionRemove = null;
      chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: serializeExcluded(excluded) });
      renderExcluded();
    } else {
      clearExcludedBtn.dataset.confirming = "1";
      clearExcludedBtn.textContent = t("clickToConfirm");
      clearExcludedBtn.setAttribute("aria-label", t("clickToConfirm"));
      clearExcludedBtn.title = t("clickToConfirm");
      setTimeout(() => {
        if (clearExcludedBtn.dataset.confirming === "1") {
          clearExcludedBtn.dataset.confirming = "";
          clearExcludedBtn.textContent = t("excludedClearAll");
          clearExcludedBtn.setAttribute("aria-label", t("excludedClearAll"));
          clearExcludedBtn.title = t("excludedClearAll");
        }
      }, 3000);
    }
  });

  hidePromotedCheckbox.addEventListener("change", () => {
    hidePromoted = hidePromotedCheckbox.checked;
    chrome.storage.sync.set({ [STORAGE_KEYS.HIDE_PROMOTED]: hidePromoted });
  });
  hideFeaturedCheckbox.addEventListener("change", () => {
    hideFeatured = hideFeaturedCheckbox.checked;
    chrome.storage.sync.set({ [STORAGE_KEYS.HIDE_FEATURED]: hideFeatured });
  });

  /* Clean up toast timer on page unload. */
  window.addEventListener("beforeunload", () => clearTimeout(toastTimer));

  /* ── Storage ────────────────────────────────────────────────── */

  function load() {
    chrome.storage.sync.get([PHRASES_STORAGE_KEY, STORAGE_KEYS.LANGS, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.BLOCKED_AUTHORS, STORAGE_KEYS.EXCLUDED, STORAGE_KEYS.DISABLED_PATTERNS, STORAGE_KEYS.HIDE_PROMOTED, STORAGE_KEYS.HIDE_FEATURED], (result) => {
      phrases = result[PHRASES_STORAGE_KEY] || [];
      enabledLangs = result[STORAGE_KEYS.LANGS] || [...DEFAULT_ENABLED_LANGS];
      disabledPatterns = result[STORAGE_KEYS.DISABLED_PATTERNS] || [];
      whitelist = result[STORAGE_KEYS.WHITELIST] || [];
      blockedAuthors = result[STORAGE_KEYS.BLOCKED_AUTHORS] || [];
      excluded = normalizeExcludedEntries(result[STORAGE_KEYS.EXCLUDED] || []);
      hidePromoted = result[STORAGE_KEYS.HIDE_PROMOTED] === true;
      hideFeatured = result[STORAGE_KEYS.HIDE_FEATURED] === true;
      if (hasLegacyExcludedEntries(result[STORAGE_KEYS.EXCLUDED] || [])) {
        chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: serializeExcluded(excluded) });
      }
      render();
    });
  }

  /* React to storage changes from other contexts (content script, popup). */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes[STORAGE_KEYS.WHITELIST]) {
      whitelist = changes[STORAGE_KEYS.WHITELIST].newValue || [];
      renderWhitelist();
    }
    if (changes[STORAGE_KEYS.BLOCKED_AUTHORS]) {
      blockedAuthors = changes[STORAGE_KEYS.BLOCKED_AUTHORS].newValue || [];
      renderBlockedAuthors();
    }
    if (changes[STORAGE_KEYS.EXCLUDED]) {
      excluded = normalizeExcludedEntries(changes[STORAGE_KEYS.EXCLUDED].newValue || []);
      renderExcluded();
    }
    if (changes[PHRASES_STORAGE_KEY]) {
      phrases = changes[PHRASES_STORAGE_KEY].newValue || [];
      render();
    }
    if (changes[STORAGE_KEYS.LANGS]) {
      enabledLangs = changes[STORAGE_KEYS.LANGS].newValue || [...DEFAULT_ENABLED_LANGS];
      render();
    }
    if (changes[STORAGE_KEYS.DISABLED_PATTERNS]) {
      disabledPatterns = changes[STORAGE_KEYS.DISABLED_PATTERNS].newValue || [];
      render();
    }
    if (changes[STORAGE_KEYS.HIDE_PROMOTED]) {
      hidePromoted = changes[STORAGE_KEYS.HIDE_PROMOTED].newValue === true;
      renderHideToggles();
    }
    if (changes[STORAGE_KEYS.HIDE_FEATURED]) {
      hideFeatured = changes[STORAGE_KEYS.HIDE_FEATURED].newValue === true;
      renderHideToggles();
    }
  });

  function save() {
    const prev = phrases.slice();
    chrome.storage.sync.set({ [PHRASES_STORAGE_KEY]: phrases }, () => {
      if (chrome.runtime.lastError) {
        phrases = prev;
        render();
        showToast("Storage write failed: " + chrome.runtime.lastError.message, true);
        return;
      }
      render();
    });
  }

  /* ── Toast ──────────────────────────────────────────────────── */

  let toastTimer = null;

  function showToast(msg, warn) {
    toast.textContent = msg;
    toast.className = "show" + (warn ? " warn" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.className = "";
    }, 2500);
  }

  function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  function countMessage(oneKey, manyKey, count, substitutions) {
    const values = Array.isArray(substitutions)
      ? substitutions.map(String)
      : [String(substitutions)];
    return t(count === 1 ? oneKey : manyKey, values);
  }

  function renderEmptyState(message, hint) {
    empty.replaceChildren();

    const messageEl = document.createElement("div");
    messageEl.textContent = message;
    empty.appendChild(messageEl);

    if (hint) {
      const hintEl = document.createElement("div");
      hintEl.className = "starter-hint";
      hintEl.textContent = hint;
      empty.appendChild(hintEl);
    }
  }

  /* ── CRUD ───────────────────────────────────────────────────── */

  function highlightDuplicate(text) {
    /* Find visible row by matching text content (index can be wrong
       when a search filter limits visible rows). */
    const lower = text.toLowerCase();
    for (const row of list.querySelectorAll(".phrase-row.custom")) {
      if (row.querySelector(".text")?.textContent.toLowerCase() === lower) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("duplicate-highlight");
        setTimeout(() => row.classList.remove("duplicate-highlight"), 2000);
        break;
      }
    }
  }

  function handleAdd() {
    const text = input.value.trim();
    if (!text) return;
    if (text.length > LIMITS.MAX_PHRASE_LENGTH) {
      showToast(t("phraseTooLongToast", LIMITS.MAX_PHRASE_LENGTH), true);
      return;
    }

    /* Duplicate check */
    const dup = phrases.findIndex(
      (p) => p.text.toLowerCase() === text.toLowerCase()
    );
    if (dup !== -1) {
      showToast(t("duplicatePhraseToast", text), true);
      input.value = "";
      render();
      highlightDuplicate(text);
      return;
    }
    if (phrases.length >= LIMITS.MAX_CUSTOM_PHRASES) {
      showToast(t("phraseLimitToast", LIMITS.MAX_CUSTOM_PHRASES), true);
      return;
    }

    const candidate = phrases.concat([{
      id: uid(),
      text,
      enabled: true,
      created: Date.now(),
      mode: "exact",
    }]);
    const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
    if (estimatePhraseBytes(candidate, PHRASES_STORAGE_KEY) > limit) {
      showToast(t("phraseStorageFullToast"), true);
      return;
    }

    phrases = candidate;
    input.value = "";
    save();
    showToast(t("addedPhraseToast", text));
  }

  function handleToggle(id) {
    const p = phrases.find((x) => x.id === id);
    if (p) {
      p.enabled = !p.enabled;
      save();
    }
  }

  /* Per-pattern toggle for built-in patterns: add/remove the pattern's
     stable id (from shared/pattern-data.js) from ss_disabled_patterns. */
  function handleBuiltinToggle(id) {
    if (disabledPatterns.includes(id)) {
      disabledPatterns = disabledPatterns.filter((x) => x !== id);
    } else {
      disabledPatterns = [...disabledPatterns, id];
    }
    chrome.storage.sync.set({ [STORAGE_KEYS.DISABLED_PATTERNS]: disabledPatterns });
    render();
  }

  function handleDelete(id) {
    const p = phrases.find((x) => x.id === id);
    if (!p) return;

    if (pendingDeleteId === id) {
      /* Second click — confirmed */
      pendingDeleteId = null;
      phrases = phrases.filter((x) => x.id !== id);
      if (editId === id) editId = null;
      save();
      showToast(t("deletedPhraseToast", p.text));
    } else {
      /* First click — ask for confirmation */
      pendingDeleteId = id;
      render();
      setTimeout(() => {
        if (pendingDeleteId === id) {
          pendingDeleteId = null;
          render();
        }
      }, 3000);
    }
  }

  function handleEdit(id) {
    editId = id;
    render();
    const editInput = document.querySelector(".edit-row input");
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }

  function handleSaveEdit(id) {
    const editInput = document.querySelector(".edit-row input");
    if (!editInput) return;
    const text = editInput.value.trim();
    if (!text) return;
    if (text.length > LIMITS.MAX_PHRASE_LENGTH) {
      showToast(t("phraseTooLongToast", LIMITS.MAX_PHRASE_LENGTH), true);
      return;
    }

    /* Duplicate check (skip self) */
    const dup = phrases.findIndex(
      (x) => x.id !== id && x.text.toLowerCase() === text.toLowerCase()
    );
    if (dup !== -1) {
      showToast(t("duplicatePhraseToast", text), true);
      editId = null;
      render();
      highlightDuplicate(text);
      return;
    }

    const p = phrases.find((x) => x.id === id);
    if (p) {
      p.text = text;
      editId = null;
      save();
    }
  }

  function handleCancelEdit() {
    editId = null;
    render();
  }

  /* ── Mode toggle (exact ↔ contains) ─────────────────────────── */

  function toggleMode(id) {
    const p = phrases.find((x) => x.id === id);
    if (p) {
      p.mode = p.mode === "contains" ? "exact" : "contains";
      save();
    }
  }

  /* ── Starter Pack ──────────────────────────────────────────── */

  function handleStarterPack() {
    const defaults = [
      "CLAUDE", "SKILL", "PROMPTS", "AI PROMPTS", "PDF",
      "LINK IN BIO", "DM ME", "TEMPLATE", "COMMENT", "10x",
      "SECRET", "FREE ACCESS", "GROWTH HACK", "CHATGPT", "BOT",
    ];
    const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
    let added = 0;
    let candidate = phrases.slice();
    for (const text of defaults) {
      if (candidate.length >= LIMITS.MAX_CUSTOM_PHRASES) break;
      const dup = candidate.some(p => p.text.toLowerCase() === text.toLowerCase());
      if (dup) continue;
      const next = candidate.concat([{
        id: uid(),
        text,
        enabled: true,
        created: Date.now(),
        mode: "exact",
      }]);
      if (estimatePhraseBytes(next, PHRASES_STORAGE_KEY) > limit) break;
      candidate = next;
      added++;
    }
    if (added > 0) {
      phrases = candidate;
      save();
      showToast(
        countMessage(
          "starterPackAddedOne",
          "starterPackAddedMany",
          added,
          added
        )
      );
    } else {
      showToast(t("starterPackExists"), true);
    }
  }

  /* ── Import / Export ────────────────────────────────────────── */

  function isDefaultLangs() {
    return (
      enabledLangs.length === DEFAULT_ENABLED_LANGS.length &&
      enabledLangs.every((lang, i) => lang === DEFAULT_ENABLED_LANGS[i])
    );
  }

  function hasExportableData() {
    return (
      phrases.length > 0 ||
      whitelist.length > 0 ||
      excluded.length > 0 ||
      !isDefaultLangs()
    );
  }

  /* Localize a count as a noun phrase ("3 phrases") for embedding in a
     consolidated summary toast. */
  function settingsPart(count, oneKey, manyKey) {
    return countMessage(oneKey, manyKey, count, count);
  }

  function joinSettingsParts(parts) {
    if (parts.length === 1) return parts[0];
    return (
      parts.slice(0, -1).join(", ") +
      " " +
      t("settingsPartAnd") +
      " " +
      parts[parts.length - 1]
    );
  }

  /* Identity for an ss_excluded entry that tolerates both the current
     { sig, preview, created } object shape and legacy bare-string
     entries, so dedupe works regardless of the shape the file holds. */
  function excludedIdentity(entry) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object" && typeof entry.sig === "string") {
      return entry.sig;
    }
    return null;
  }

  function handleExport() {
    if (!hasExportableData()) {
      showToast(t("nothingToExport"), true);
      return;
    }

    const payload = {
      version: 1,
      exportedAt: Date.now(),
      phrases: phrases,
      whitelist: whitelist,
      excluded: excluded,
      langs: enabledLangs,
    };
    const json = JSON.stringify(payload, null, 2);

    const parts = [
      settingsPart(
        phrases.length,
        "settingsPartPhrasesOne",
        "settingsPartPhrasesMany"
      ),
    ];
    const extras = [];
    if (whitelist.length > 0) {
      extras.push(
        settingsPart(
          whitelist.length,
          "settingsPartWhitelistOne",
          "settingsPartWhitelistMany"
        )
      );
    }
    if (excluded.length > 0) {
      extras.push(
        settingsPart(
          excluded.length,
          "settingsPartExcludedOne",
          "settingsPartExcludedMany"
        )
      );
    }
    if (!isDefaultLangs()) {
      extras.push(
        settingsPart(
          enabledLangs.length,
          "settingsPartLangsOne",
          "settingsPartLangsMany"
        )
      );
    }

    /* When more than phrases are exported, summarize all categories;
       otherwise keep the phrases-only toast exactly as before. */
    const summary = extras.length > 0 ? joinSettingsParts(parts.concat(extras)) : null;

    function toastFor(clipboard) {
      if (summary === null) {
        return countMessage(
          clipboard ? "exportedClipboardOne" : "exportedDownloadedOne",
          clipboard ? "exportedClipboardMany" : "exportedDownloadedMany",
          phrases.length,
          phrases.length
        );
      }
      return t(
        clipboard ? "exportedSummaryClipboard" : "exportedSummaryDownloaded",
        [summary]
      );
    }

    function downloadFallback() {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "linkedin-spam-blocker-phrases.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast(toastFor(false));
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(
        () => showToast(toastFor(true)),
        downloadFallback
      );
    } else {
      downloadFallback();
    }
  }

  /* Shared phrase validation/merge loop used by both the legacy bare-array
     format and the versioned object format. Carries the byte-quota
     pre-check (plan 001) unchanged — both branches must respect it. */
  function importPhraseList(items) {
    let valid = 0,
      skipped = 0;
    const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
    for (const item of items) {
      if (phrases.length >= LIMITS.MAX_CUSTOM_PHRASES) {
        skipped++;
        continue;
      }
      if (
        !item.text ||
        typeof item.text !== "string" ||
        !item.text.trim() ||
        item.text.trim().length > LIMITS.MAX_PHRASE_LENGTH
      ) {
        skipped++;
        continue;
      }
      const dup = phrases.some(
        (p) => p.text.toLowerCase() === item.text.trim().toLowerCase()
      );
      if (dup) {
        skipped++;
        continue;
      }
      const candidateItem = {
        id: uid(),
        text: item.text.trim(),
        enabled: item.enabled !== false,
        created: item.created || Date.now(),
        mode: item.mode === "contains" ? "contains" : "exact",
      };
      if (estimatePhraseBytes(phrases.concat([candidateItem]), PHRASES_STORAGE_KEY) > limit) {
        skipped++;
        continue;
      }
      phrases.push(candidateItem);
      valid++;
    }
    return { valid, skipped };
  }

  function handleImport() {
    const file = importFile.files[0];
    if (!file) return;
    if (file.size > LIMITS.MAX_IMPORT_BYTES) {
      showToast(t("importFileTooLarge"), true);
      importFile.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      let imported;
      try {
        imported = JSON.parse(e.target.result);
      } catch (_) {
        showToast(t("invalidJsonFile"), true);
        return;
      }

      if (Array.isArray(imported)) {
        /* Legacy format: bare phrase array — keep this path's behavior
           exactly as before the versioned format existed. */
        if (imported.length === 0) {
          showToast(t("importFileEmpty"), true);
          return;
        }
        const { valid, skipped } = importPhraseList(imported);
        save();
        importFile.value = "";
        showToast(
          skipped > 0
            ? countMessage(
                "importedPhrasesSkippedOne",
                "importedPhrasesSkippedMany",
                valid,
                [valid, skipped]
              )
            : countMessage(
                "importedPhrasesOne",
                "importedPhrasesMany",
                valid,
                valid
              )
        );
        return;
      }

      if (imported && typeof imported === "object" && Array.isArray(imported.phrases)) {
        /* Versioned format: { version, exportedAt, phrases, whitelist,
           excluded, langs } — additive merge across all categories,
           never replacing existing local state. */
        const phraseCounts = importPhraseList(imported.phrases);

        let whitelistAdded = 0,
          whitelistSkipped = 0;
        if (Array.isArray(imported.whitelist)) {
          for (const entry of imported.whitelist) {
            if (whitelist.length >= LIMITS.MAX_WHITELIST) {
              whitelistSkipped++;
              continue;
            }
            if (
              typeof entry !== "string" ||
              !entry.trim() ||
              whitelist.includes(entry)
            ) {
              whitelistSkipped++;
              continue;
            }
            whitelist.push(entry);
            whitelistAdded++;
          }
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: whitelist });
        }

        let excludedAdded = 0,
          excludedSkipped = 0;
        if (Array.isArray(imported.excluded)) {
          const identities = new Set(
            excluded.map((entry) => excludedIdentity(entry))
          );
          for (const entry of imported.excluded) {
            const identity = excludedIdentity(entry);
            if (!identity) {
              excludedSkipped++;
              continue;
            }
            if (excluded.length + excludedAdded >= LIMITS.MAX_EXCLUDED_ITEMS) {
              excludedSkipped++;
              continue;
            }
            if (identities.has(identity)) {
              excludedSkipped++;
              continue;
            }
            identities.add(identity);
            excluded.push(entry);
            excludedAdded++;
          }
          /* Keep the merged list in the object shape plan 007 established
             for ss_excluded; normalization is identity-preserving and
             leaves bare-string entries untouched in meaning. */
          excluded = normalizeExcludedEntries(excluded);
          chrome.storage.sync.set({
            [STORAGE_KEYS.EXCLUDED]: serializeExcluded(excluded),
          });
        }

        let langsAdded = 0;
        if (Array.isArray(imported.langs)) {
          const known = imported.langs.filter(
            (code) => typeof code === "string" && LANG_META[code]
          );
          if (known.length > 0) {
            for (const code of known) {
              if (!enabledLangs.includes(code)) {
                enabledLangs.push(code);
                langsAdded++;
              }
            }
            if (langsAdded > 0) {
              saveLangs();
            }
          }
        }

        save();
        render();
        importFile.value = "";

        const parts = [];
        if (phraseCounts.valid > 0) {
          parts.push(
            settingsPart(
              phraseCounts.valid,
              "settingsPartPhrasesOne",
              "settingsPartPhrasesMany"
            )
          );
        }
        if (whitelistAdded > 0) {
          parts.push(
            settingsPart(
              whitelistAdded,
              "settingsPartWhitelistOne",
              "settingsPartWhitelistMany"
            )
          );
        }
        if (excludedAdded > 0) {
          parts.push(
            settingsPart(
              excludedAdded,
              "settingsPartExcludedOne",
              "settingsPartExcludedMany"
            )
          );
        }
        if (langsAdded > 0) {
          parts.push(
            settingsPart(
              langsAdded,
              "settingsPartLangsOne",
              "settingsPartLangsMany"
            )
          );
        }
        const skipped = phraseCounts.skipped + whitelistSkipped + excludedSkipped;
        if (parts.length === 0) {
          showToast(
            skipped > 0
              ? t("importedNothingSkipped", [skipped])
              : t("importedNothing")
          );
        } else {
          const summary = joinSettingsParts(parts);
          showToast(
            skipped > 0
              ? t("importedSummarySkipped", [summary, skipped])
              : t("importedSummary", [summary])
          );
        }
        return;
      }

      showToast(t("invalidJsonFile"), true);
    };
    reader.readAsText(file);
  }

  /* ── Hide toggles (feed content) ────────────────────────────── */

  function renderHideToggles() {
    hidePromotedCheckbox.checked = hidePromoted;
    hideFeaturedCheckbox.checked = hideFeatured;
  }

  /* ── Language toggles ───────────────────────────────────────── */

  function saveLangs() {
    chrome.storage.sync.set({ [STORAGE_KEYS.LANGS]: enabledLangs });
  }

  function handleLangToggle(lang) {
    const idx = enabledLangs.indexOf(lang);
    if (idx === -1) {
      enabledLangs.push(lang);
    } else if (enabledLangs.length > 1) {
      enabledLangs.splice(idx, 1);
    } else {
      return; /* Keep at least one language enabled. */
    }
    saveLangs();
    render();
  }

  function renderLangs() {
    langToggles.innerHTML = "";
    for (const [code, names] of Object.entries(LANG_META)) {
      /* Decision 3 (plan 011): count only ENABLED patterns — patterns whose
         per-pattern toggle is on — matching the checkbox state shown in the
         pattern list below, not the language's total. */
      const count = BUILTIN.filter(
        (b) => b.lang === code && !disabledPatterns.includes(b.id)
      ).length;
      const enabled = enabledLangs.includes(code);
      const div = document.createElement("div");
      div.className = "lang-tog" + (enabled ? " enabled" : " disabled");
      div.addEventListener("click", () => handleLangToggle(code));
      div.addEventListener("keydown", activateOnEnterOrSpace(() => handleLangToggle(code)));
      div.setAttribute("role", "button");
      div.setAttribute("tabindex", "0");
      div.setAttribute("aria-pressed", enabled ? "true" : "false");
      div.setAttribute("aria-label", t("languageToggleLabel", [names.english, enabled ? t("enabled") : t("disabled")]));
      div.title = t("languageToggleLabel", [names.english, enabled ? t("enabled") : t("disabled")]);

      const dot = document.createElement("span");
      dot.className = "lang-dot";
      div.appendChild(dot);

      const label = document.createElement("span");
      label.textContent = names.native;
      div.appendChild(label);

      const countSpan = document.createElement("span");
      countSpan.className = "lang-count";
      countSpan.textContent = countMessage(
        "patternCountOne",
        "patternCountMany",
        count,
        count
      );
      div.appendChild(countSpan);

      langToggles.appendChild(div);
    }
  }

  /* ── Whitelist ──────────────────────────────────────────────── */

  function renderWhitelist() {
    if (whitelist.length === 0) {
      whitelistSection.style.display = "none";
      return;
    }
    whitelistSection.style.display = "block";
    whitelistList.innerHTML = "";
    for (const id of whitelist) {
      const row = document.createElement("div");
      row.className = "whitelist-row";

      const label = document.createElement("span");
      label.className = "wl-id";
      label.textContent = id;
      row.appendChild(label);

      const isConfirming = pendingWhitelistRemove === id;
      const rmBtn = document.createElement("button");
      rmBtn.className = isConfirming ? "confirming" : "";
      rmBtn.textContent = isConfirming ? t("clickToConfirm") : t("remove");
      rmBtn.setAttribute("aria-label", t("removeWhitelistedAuthorLabel", id));
      rmBtn.title = t("removeWhitelistedAuthorLabel", id);
      rmBtn.addEventListener("click", () => {
        if (pendingWhitelistRemove === id) {
          pendingWhitelistRemove = null;
          whitelist = whitelist.filter(w => w !== id);
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: whitelist });
          renderWhitelist();
        } else {
          pendingWhitelistRemove = id;
          renderWhitelist();
          setTimeout(() => {
            if (pendingWhitelistRemove === id) {
              pendingWhitelistRemove = null;
              renderWhitelist();
            }
          }, 3000);
        }
      });
      row.appendChild(rmBtn);

      whitelistList.appendChild(row);
    }
  }

  /* ── Blocked authors (plan 008) ─────────────────────────────── */

  /* Mirrors renderWhitelist: list + confirm-click remove. Entries are
     added via the in-feed placeholder or the link context menu, not by
     typing here — same precedent as the whitelist. */
  function renderBlockedAuthors() {
    if (blockedAuthors.length === 0) {
      blockedAuthorSection.style.display = "none";
      return;
    }
    blockedAuthorSection.style.display = "block";
    blockedAuthorList.innerHTML = "";
    for (const id of blockedAuthors) {
      const row = document.createElement("div");
      row.className = "whitelist-row";

      const label = document.createElement("span");
      label.className = "wl-id";
      label.textContent = id;
      row.appendChild(label);

      const isConfirming = pendingBlockedAuthorRemove === id;
      const rmBtn = document.createElement("button");
      rmBtn.className = isConfirming ? "confirming" : "";
      rmBtn.textContent = isConfirming ? t("clickToConfirm") : t("remove");
      rmBtn.setAttribute("aria-label", t("removeBlockedAuthorLabel", id));
      rmBtn.title = t("removeBlockedAuthorLabel", id);
      rmBtn.addEventListener("click", () => {
        if (pendingBlockedAuthorRemove === id) {
          pendingBlockedAuthorRemove = null;
          blockedAuthors = blockedAuthors.filter(a => a !== id);
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: blockedAuthors });
          renderBlockedAuthors();
        } else {
          pendingBlockedAuthorRemove = id;
          renderBlockedAuthors();
          setTimeout(() => {
            if (pendingBlockedAuthorRemove === id) {
              pendingBlockedAuthorRemove = null;
              renderBlockedAuthors();
            }
          }, 3000);
        }
      });
      row.appendChild(rmBtn);

      blockedAuthorList.appendChild(row);
    }
  }

  /* ── Excluded posts ("Not spam") ────────────────────────────── */

  /* Same semantics as content.js's normalizeExcludedEntries: accepts the
     legacy bare-"sig:"-string and plain-text shapes as well as the current
     { sig, preview, created } object shape. Uses SS_getExcludedSignature
     from shared/pattern-data.js for hashing. */
  function normalizeExcludedEntries(entries) {
    const map = new Map();
    for (const entry of entries || []) {
      if (typeof entry === "string" && entry.trim()) {
        if (entry.startsWith("sig:")) {
          if (!map.has(entry)) {
            map.set(entry, { preview: null, created: null });
          }
        } else {
          const sig = SS_getExcludedSignature(entry);
          if (!map.has(sig)) {
            map.set(sig, {
              preview: truncateForPreview(entry, 60),
              created: null,
            });
          }
        }
      } else if (entry && typeof entry === "object" &&
                 typeof entry.sig === "string" && entry.sig.startsWith("sig:")) {
        if (!map.has(entry.sig)) {
          const preview = typeof entry.preview === "string" && entry.preview.trim()
            ? entry.preview
            : null;
          const created = typeof entry.created === "number" ? entry.created : null;
          map.set(entry.sig, { preview, created });
        }
      }
    }
    return Array.from(map, ([sig, meta]) => ({ sig, preview: meta.preview, created: meta.created }));
  }

  function hasLegacyExcludedEntries(entries) {
    return (entries || []).some((entry) =>
      typeof entry === "string" && entry.trim()
    );
  }

  function serializeExcluded(entries) {
    return entries.map((entry) => ({
      sig: entry.sig,
      preview: entry.preview,
      created: entry.created,
    }));
  }

  function truncateForPreview(text, maxLen) {
    const trimmed = String(text).trim();
    if (trimmed.length <= maxLen) return trimmed;
    return trimmed.slice(0, maxLen) + "…";
  }

  function renderExcluded() {
    if (excluded.length === 0) {
      excludedSection.style.display = "none";
      excludedList.innerHTML = "";
      clearExcludedBtn.style.display = "none";
      clearExcludedBtn.dataset.confirming = "";
      clearExcludedBtn.textContent = t("excludedClearAll");
      clearExcludedBtn.setAttribute("aria-label", t("excludedClearAll"));
      clearExcludedBtn.title = t("excludedClearAll");
      return;
    }
    excludedSection.style.display = "block";
    clearExcludedBtn.style.display = "block";
    excludedList.innerHTML = "";
    for (const entry of excluded) {
      const row = document.createElement("div");
      row.className = "whitelist-row";

      const label = document.createElement("span");
      label.className = "wl-id";
      label.textContent = entry.preview || t("excludedNoPreview");
      row.appendChild(label);

      const removeLabel = entry.preview || t("excludedNoPreview");
      const isConfirming = pendingExclusionRemove === entry.sig;
      const rmBtn = document.createElement("button");
      rmBtn.className = isConfirming ? "confirming" : "";
      rmBtn.textContent = isConfirming ? t("clickToConfirm") : t("remove");
      rmBtn.setAttribute("aria-label", t("removeExcludedLabel", removeLabel));
      rmBtn.title = t("removeExcludedLabel", removeLabel);
      rmBtn.addEventListener("click", () => {
        if (pendingExclusionRemove === entry.sig) {
          pendingExclusionRemove = null;
          excluded = excluded.filter((e) => e.sig !== entry.sig);
          chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: serializeExcluded(excluded) });
          renderExcluded();
        } else {
          pendingExclusionRemove = entry.sig;
          renderExcluded();
          setTimeout(() => {
            if (pendingExclusionRemove === entry.sig) {
              pendingExclusionRemove = null;
              renderExcluded();
            }
          }, 3000);
        }
      });
      row.appendChild(rmBtn);

      excludedList.appendChild(row);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */

  function render() {
    list.innerHTML = "";

    renderLangs();
    renderHideToggles();
    renderWhitelist();
    renderBlockedAuthors();
    renderExcluded();

    const query = searchInput.value.trim().toLowerCase();

    /* Built-in patterns — only for enabled languages, filtered by query */
    for (const bp of BUILTIN) {
      if (!enabledLangs.includes(bp.lang)) continue;
      if (query && !bp.label.toLowerCase().includes(query)) continue;
      list.appendChild(createBuiltinRow(bp));
    }

    /* Filter custom phrases by search query */
    const filtered = query
      ? phrases.filter((p) => p.text.toLowerCase().includes(query))
      : phrases;

    const enabled = filtered.filter((p) => p.enabled).length;
    countLabel.textContent =
      phrases.length === 0
        ? t("noCustomPhrasesShort")
        : countMessage(
            "customPhraseStatusOne",
            "customPhraseStatusMany",
            filtered.length,
            [enabled, filtered.length]
          );

    if (phrases.length === 0) {
      empty.style.display = "block";
      renderEmptyState(t("noCustomPhrases"), t("tryStarterPack"));
    } else if (query && filtered.length === 0) {
      empty.style.display = "block";
      renderEmptyState(t("noPhrasesMatch", query));
    } else {
      empty.style.display = "none";
      for (const p of filtered) {
        list.appendChild(createRow(p));
      }
    }
  }

  function createBuiltinRow(bp) {
    const div = document.createElement("div");
    div.className = "phrase-row builtin";

    const label = document.createElement("label");
    label.className = "toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !disabledPatterns.includes(bp.id);
    cb.setAttribute("aria-label", t("builtinPatternToggleLabel", bp.label));
    cb.title = t("builtinPatternToggleHint");
    cb.addEventListener("change", () => handleBuiltinToggle(bp.id));
    label.appendChild(cb);
    label.appendChild(document.createElement("span")).className = "slider";
    div.appendChild(label);

    const text = document.createElement("div");
    text.className = "text";
    const lang = document.createElement("span");
    lang.className = "lang-label";
    lang.textContent = bp.lang;
    text.appendChild(lang);
    text.append(document.createTextNode(bp.label));
    const bl = document.createElement("span");
    bl.className = "builtin-label";
    bl.textContent = t("builtinLabel");
    text.appendChild(bl);
    div.appendChild(text);
    div.appendChild(document.createElement("div")).className = "actions";
    return div;
  }

  function createRow(p) {
    const div = document.createElement("div");
    div.className = "phrase-row custom";

    /* Toggle */
    const label = document.createElement("label");
    label.className = "toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = p.enabled;
    cb.setAttribute("aria-label", t("phraseToggleLabel", p.text));
    cb.title = t("phraseToggleLabel", p.text);
    cb.addEventListener("change", () => handleToggle(p.id));
    label.appendChild(cb);
    label.appendChild(document.createElement("span")).className = "slider";
    div.appendChild(label);

    /* Mode badge (clickable) */
    const badge = document.createElement("span");
    badge.className = "mode-badge" + (p.mode === "contains" ? " contains" : "");
    badge.textContent = p.mode === "contains" ? t("contains") : t("exact");
    badge.title =
      p.mode === "contains"
        ? t("containsTooltip")
        : t("exactTooltip");
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-label", t("modeToggleLabel", [p.text, badge.textContent]));
    badge.addEventListener("click", () => toggleMode(p.id));
    badge.addEventListener("keydown", activateOnEnterOrSpace(() => toggleMode(p.id)));
    div.appendChild(badge);

    /* Text (or edit form) */
    const text = document.createElement("div");
    text.className = "text";

    if (editId === p.id) {
      const editWrap = document.createElement("div");
      editWrap.className = "edit-row";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = p.text;
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSaveEdit(p.id);
        if (e.key === "Escape") handleCancelEdit();
      });
      editWrap.appendChild(inp);

      const saveBtn = document.createElement("button");
      saveBtn.className = "save";
      saveBtn.textContent = t("save");
      saveBtn.addEventListener("click", () => handleSaveEdit(p.id));
      editWrap.appendChild(saveBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = t("cancel");
      cancelBtn.addEventListener("click", handleCancelEdit);
      editWrap.appendChild(cancelBtn);

      text.appendChild(editWrap);
    } else {
      text.textContent = p.text;
    }
    div.appendChild(text);

    /* Actions */
    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.textContent = t("edit");
    editBtn.setAttribute("aria-label", t("editPhraseLabel", p.text));
    editBtn.title = t("editPhraseLabel", p.text);
    editBtn.addEventListener("click", () => handleEdit(p.id));
    actions.appendChild(editBtn);

    const isConfirming = pendingDeleteId === p.id;
    const delBtn = document.createElement("button");
    delBtn.className = "danger" + (isConfirming ? " confirming" : "");
    delBtn.textContent = isConfirming ? t("clickToConfirm") : t("delete");
    delBtn.setAttribute("aria-label", t("deletePhraseLabel", p.text));
    delBtn.title = t("deletePhraseLabel", p.text);
    delBtn.addEventListener("click", () => handleDelete(p.id));
    actions.appendChild(delBtn);

    div.appendChild(actions);
    return div;
  }

  /* ── Language metadata ──────────────────────────────────────── */

  const LANG_META = {
    EN: { native: "English",   english: "English" },
    ES: { native: "Español",   english: "Spanish" },
    FR: { native: "Français",  english: "French" },
    PT: { native: "Português", english: "Portuguese" },
    DE: { native: "Deutsch",   english: "German" },
  };

  /* ── Built-in patterns (display only) ───────────────────────── */

  /* Derived from shared/pattern-data.js — see that file for the actual
     pattern definitions this describes. The id is the stable per-pattern
     identity users toggle on and off. */
  const BUILTIN = Object.entries(SS_PATTERN_DATA).flatMap(([lang, entries]) =>
    entries.map((entry) => ({ lang, label: entry.label, id: entry.id }))
  );

  /* ── Helpers ────────────────────────────────────────────────── */

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

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function activateOnEnterOrSpace(callback) {
    return (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      callback();
    };
  }
})();
