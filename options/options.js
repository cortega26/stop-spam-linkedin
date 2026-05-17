(function () {
  "use strict";

  const STORAGE_KEY = "ss_phrases";
  const LANG_STORAGE_KEY = "ss_enabled_langs";
  const WHITELIST_STORAGE_KEY = "ss_whitelist";
  const MAX_CUSTOM_PHRASES = 200;
  const MAX_PHRASE_LENGTH = 120;
  const MAX_IMPORT_BYTES = 128 * 1024;

  /* ── State ──────────────────────────────────────────────────── */
  let phrases = [];
  let editId = null;
  let enabledLangs = ["EN", "ES", "FR", "PT", "DE"];
  let whitelist = [];
  let pendingDeleteId = null;
  let pendingWhitelistRemove = null;

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

  /* Clean up toast timer on page unload. */
  window.addEventListener("beforeunload", () => clearTimeout(toastTimer));

  /* ── Storage ────────────────────────────────────────────────── */

  function load() {
    chrome.storage.sync.get([STORAGE_KEY, LANG_STORAGE_KEY, WHITELIST_STORAGE_KEY], (result) => {
      phrases = result[STORAGE_KEY] || [];
      enabledLangs = result[LANG_STORAGE_KEY] || ["EN", "ES", "FR", "PT", "DE"];
      whitelist = result[WHITELIST_STORAGE_KEY] || [];
      render();
    });
  }

  /* React to storage changes from other contexts (content script, popup). */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes[WHITELIST_STORAGE_KEY]) {
      whitelist = changes[WHITELIST_STORAGE_KEY].newValue || [];
      renderWhitelist();
    }
    if (changes[STORAGE_KEY]) {
      phrases = changes[STORAGE_KEY].newValue || [];
      render();
    }
    if (changes[LANG_STORAGE_KEY]) {
      enabledLangs = changes[LANG_STORAGE_KEY].newValue || ["EN", "ES", "FR", "PT", "DE"];
      render();
    }
  });

  function save() {
    const prev = phrases.slice();
    chrome.storage.sync.set({ [STORAGE_KEY]: phrases }, () => {
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
    if (text.length > MAX_PHRASE_LENGTH) {
      showToast(t("phraseTooLongToast", MAX_PHRASE_LENGTH), true);
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
    if (phrases.length >= MAX_CUSTOM_PHRASES) {
      showToast(t("phraseLimitToast", MAX_CUSTOM_PHRASES), true);
      return;
    }

    phrases.push({
      id: uid(),
      text,
      enabled: true,
      created: Date.now(),
      mode: "exact",
    });
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
    if (text.length > MAX_PHRASE_LENGTH) {
      showToast(t("phraseTooLongToast", MAX_PHRASE_LENGTH), true);
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
    let added = 0;
    for (const text of defaults) {
      if (phrases.length >= MAX_CUSTOM_PHRASES) break;
      const dup = phrases.some(p => p.text.toLowerCase() === text.toLowerCase());
      if (!dup) {
        phrases.push({
          id: uid(),
          text,
          enabled: true,
          created: Date.now(),
          mode: "exact",
        });
        added++;
      }
    }
    if (added > 0) {
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

  function handleExport() {
    if (phrases.length === 0) {
      showToast(t("nothingToExport"), true);
      return;
    }
    const json = JSON.stringify(phrases, null, 2);

    function downloadFallback() {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "linkedin-spam-blocker-phrases.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast(
        countMessage(
          "exportedDownloadedOne",
          "exportedDownloadedMany",
          phrases.length,
          phrases.length
        )
      );
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(
        () => showToast(
          countMessage(
            "exportedClipboardOne",
            "exportedClipboardMany",
            phrases.length,
            phrases.length
          )
        ),
        downloadFallback
      );
    } else {
      downloadFallback();
    }
  }

  function handleImport() {
    const file = importFile.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
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

      if (!Array.isArray(imported) || imported.length === 0) {
        showToast(t("importFileEmpty"), true);
        return;
      }

      /* Validate structure */
      let valid = 0,
        skipped = 0;
      for (const item of imported) {
        if (phrases.length >= MAX_CUSTOM_PHRASES) {
          skipped++;
          continue;
        }
        if (
          !item.text ||
          typeof item.text !== "string" ||
          !item.text.trim() ||
          item.text.trim().length > MAX_PHRASE_LENGTH
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
        phrases.push({
          id: uid(),
          text: item.text.trim(),
          enabled: item.enabled !== false,
          created: item.created || Date.now(),
          mode: item.mode === "contains" ? "contains" : "exact",
        });
        valid++;
      }

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
    };
    reader.readAsText(file);
  }

  /* ── Language toggles ───────────────────────────────────────── */

  function saveLangs() {
    chrome.storage.sync.set({ [LANG_STORAGE_KEY]: enabledLangs });
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
      const count = BUILTIN.filter((b) => b.lang === code).length;
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
          chrome.storage.sync.set({ [WHITELIST_STORAGE_KEY]: whitelist });
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

  /* ── Render ─────────────────────────────────────────────────── */

  function render() {
    list.innerHTML = "";

    renderLangs();
    renderWhitelist();

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
    cb.checked = true;
    cb.disabled = true;
    cb.setAttribute("aria-label", t("builtinPatternToggleLabel", bp.label));
    cb.title = t("builtinPatternToggleLabel", bp.label);
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

  /* ── Built-in patterns (display only) ─────────────────────────
     Keep in sync with BASE_PATTERNS and LANG_META above.
     When adding a language or pattern to content.js, update
     LANG_META, BUILTIN, and the language toggle logic here.     */

  const BUILTIN = [
    { lang: "EN", label: 'comment "WORD" and I\'ll send / share ...' },
    { lang: "EN", label: '"WORD" and I will send ...' },
    { lang: "ES", label: 'comenta "WORD" y te enviaré / comparto ...' },
    { lang: "ES", label: 'comenta "WORD" para recibir / descargar ...' },
    { lang: "FR", label: 'commentez "WORD" et j\'enverrai / je partage ...' },
    { lang: "FR", label: 'commentez "WORD" pour recevoir / télécharger ...' },
    { lang: "PT", label: 'comente "WORD" e enviarei / compartilho ...' },
    { lang: "PT", label: 'comente "WORD" para receber / baixar ...' },
    { lang: "DE", label: 'kommentiere "WORD" und ich schicke / teile ...' },
    { lang: "DE", label: 'kommentiere "WORD" um zu bekommen / erhalten ...' },
  ];

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
