(function () {
  "use strict";

  const { STORAGE_KEYS, LIMITS, DEFAULT_ENABLED_LANGS, PHRASES_STORAGE_KEY } = globalThis.SS_CONSTANTS;

  /* ==================================================================
   *  CONFIGURATION
   * ================================================================== */

  const CONFIG = Object.freeze({
    MIN_TEXT_LENGTH: 30,
    SIBLING_CONTENT_THRESHOLD: 100,
    SIBLING_COUNT_THRESHOLD: 2,
    FEED_SIBLING_FALLBACK: 6,
    DEPTH_LIMIT: 20,
    CONTENT_LENGTH_THRESHOLD: 300,
    OBSERVER_DEBOUNCE_MS: 500,
    INITIAL_SCAN_DELAY_MS: 1000,
    COOLDOWN_DURATION_MS: 15 * 60 * 1000,  /* 15 min after "Show" */
    EXCLUSION_PREVIEW_LENGTH: 60,
  });

  function estimatePhraseBytes(phrases, storageKey) {
    return storageKey.length + JSON.stringify(phrases).length;
  }

  /* Derived from shared/pattern-data.js — see that file for the actual
     pattern definitions and their display labels. Each entry carries its
     display label so blocked-post attribution can show which pattern
     matched, and its stable id so users can disable individual patterns. */
  const BASE_PATTERNS = Object.freeze(
    Object.fromEntries(
      Object.entries(SS_PATTERN_DATA).map(([lang, entries]) => [
        lang,
        Object.freeze(
          entries.map((entry) =>
            Object.freeze({
              regex: entry.regex,
              label: entry.label,
              source: "builtin",
              id: entry.id,
            })
          )
        ),
      ])
    )
  );

  function t(key, subs) {
    return chrome.i18n.getMessage(key, subs) || key;
  }

  /* Built from BASE_PATTERNS + user keywords at runtime. */
  let spamPatterns = [];

  /* Fallback selectors — tried after the selector-free heuristic fails. */
  const POST_SELECTORS = Object.freeze([
    '[data-id*="urn:li:activity:"]',
    ".feed-shared-update-v2",
    "article",
  ]);

  /* Author-blocklist enumeration selectors (plan 008 Decision 1): only the
     two post-specific selectors — deliberately NOT "article", which is
     broad enough to match non-post elements (job cards, search results,
     article reader views). An over-broad match would hide unrelated
     content with no text signal to cross-check against. */
  const AUTHOR_BLOCK_SELECTORS = Object.freeze([
    '[data-id*="urn:li:activity:"]',
    ".feed-shared-update-v2",
  ]);

  const AUTHOR_LINK_SELECTORS = Object.freeze([
    ".update-components-actor a[href]",
    ".update-components-actor__meta-link[href]",
    ".update-components-actor__title a[href]",
    ".feed-shared-actor a[href]",
    ".feed-shared-actor__container-link[href]",
    ".entity-result__title-text a[href]",
    "[data-control-name*='actor'] a[href]",
    "a[data-control-name*='actor'][href]",
  ]);

  /* ==================================================================
   *  STATE
   * ================================================================== */

  let enabled = true;
  let blockedCount = 0;
  let observer = null;
  let processed = new WeakSet();
  let forceShow = new WeakSet();
  let counted = new WeakSet();
  let snoozeTimer = null;
  let snoozeUntil = 0;

  /* Strong set of blocked elements so we can restore them on disable. */
  const blockedPosts = new Set();

  /* Cooldown after user presses "Show" — keyed by post identity
     (data-id) so it survives virtual-scroll node re-creation.
     Posts without a data-id rely on forceShow (live node only). */
  const cooldownStore = SS_createCooldownStore(CONFIG.COOLDOWN_DURATION_MS, 100);

  /* Sliding window of last 5 blocked posts for undo in popup. */
  const lastBlocked = [];

  /* Onboarding & daily stats. */
  let onboarded = false;
  let dailyCounts = {};

  /* User-excluded text signatures (false-positive feedback). */
  let excludedSignatures = new Map();

  /* Enabled detection languages (subset of BASE_PATTERNS keys). */
  let enabledLangs = [...DEFAULT_ENABLED_LANGS];

  /* Built-in pattern ids the user turned off (from ss_disabled_patterns). */
  let disabledPatterns = new Set();

  /* User phrases (for checking if a match was built-in or custom). */
  let userPhrases = [];

  /* Pending suggestions (trigger words from built-in matches). */
  let pendingSuggestions = [];
  let dismissedSuggestions = new Set();

  /* Whitelisted author IDs. */
  let whitelistedAuthors = new Set();

  /* Author IDs the user always wants blocked, independent of text. */
  let blockedAuthors = new Set();

  /* Opt-in label-hide toggles (both default off): hide "Promoted" feed
     posts and the profile "Featured" section. */
  let hidePromoted = false;
  let hideFeatured = false;

  /* ==================================================================
   *  INITIALISATION
   * ================================================================== */

  function readRuntimeValue(localResult, syncResult, key, fallback) {
    if (localResult[key] !== undefined) return localResult[key];
    if (syncResult[key] !== undefined) return syncResult[key];
    return fallback;
  }

  function migrateRuntimeStorage(syncResult, localResult) {
    const localPatch = {};
    const removeKeys = [];

    [
      STORAGE_KEYS.COUNT,
      STORAGE_KEYS.ONBOARDED,
      STORAGE_KEYS.DAILY_COUNTS,
      STORAGE_KEYS.SNOOZE_UNTIL,
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

  /* Inject styles for placeholder buttons (hover, active, dark mode). */
  const style = document.createElement("style");
  style.textContent = [
    "[data-ss-ph] button:hover{background:#e8e8e8!important;border-color:#bbb!important}",
    "[data-ss-ph] button:active{background:#dcdcdc!important}",
    "@media(prefers-color-scheme:dark){",
    "[data-ss-ph]{background:#2a2a2a!important;border-color:#444!important;color:#ccc!important}",
    "[data-ss-ph] button{color:#999!important;border-color:#555!important}",
    "[data-ss-ph] button:hover{background:#3a3a3a!important;border-color:#666!important}",
    "[data-ss-ph] button:active{background:#444!important}",
    "}",
  ].join("");
  document.head.appendChild(style);

  chrome.storage.sync.get(
    [STORAGE_KEYS.ENABLED, STORAGE_KEYS.COUNT, STORAGE_KEYS.ONBOARDED, STORAGE_KEYS.DAILY_COUNTS, STORAGE_KEYS.SNOOZE_UNTIL, STORAGE_KEYS.EXCLUDED, STORAGE_KEYS.LANGS, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.BLOCKED_AUTHORS, STORAGE_KEYS.DISABLED_PATTERNS, STORAGE_KEYS.HIDE_PROMOTED, STORAGE_KEYS.HIDE_FEATURED, PHRASES_STORAGE_KEY],
    (syncResult) => {
      chrome.storage.local.get(
        [
          STORAGE_KEYS.COUNT,
          STORAGE_KEYS.ONBOARDED,
          STORAGE_KEYS.DAILY_COUNTS,
          STORAGE_KEYS.SNOOZE_UNTIL,
        ],
        (localResult) => {
          migrateRuntimeStorage(syncResult, localResult);

          enabled = syncResult[STORAGE_KEYS.ENABLED] !== false;
          blockedCount = readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.COUNT,
            0
          );
          onboarded = readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.ONBOARDED,
            false
          ) === true;
          dailyCounts = readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.DAILY_COUNTS,
            {}
          );
          snoozeUntil = readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.SNOOZE_UNTIL,
            0
          );
          excludedSignatures = normalizeExcludedEntries(syncResult[STORAGE_KEYS.EXCLUDED] || []);
          enabledLangs = syncResult[STORAGE_KEYS.LANGS] || [...DEFAULT_ENABLED_LANGS];
          whitelistedAuthors = new Set(syncResult[STORAGE_KEYS.WHITELIST] || []);
          blockedAuthors = new Set(syncResult[STORAGE_KEYS.BLOCKED_AUTHORS] || []);
          disabledPatterns = new Set(syncResult[STORAGE_KEYS.DISABLED_PATTERNS] || []);
          hidePromoted = syncResult[STORAGE_KEYS.HIDE_PROMOTED] === true;
          hideFeatured = syncResult[STORAGE_KEYS.HIDE_FEATURED] === true;
          spamPatterns = buildPatterns(syncResult[PHRASES_STORAGE_KEY], enabledLangs);
          userPhrases = syncResult[PHRASES_STORAGE_KEY] || [];
          if (!enabled) return;
          if (Date.now() < snoozeUntil) {
            syncSnoozeState(snoozeUntil);
            return;
          }
          scheduleInitialScan();
          startObserver();
        }
      );
    }
  );

  /* React to changes from options page or other tabs. */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes[STORAGE_KEYS.COUNT]) {
        blockedCount = changes[STORAGE_KEYS.COUNT].newValue || 0;
        setBadge(enabled && blockedCount > 0 ? String(blockedCount) : "");
      }
      if (changes[STORAGE_KEYS.ONBOARDED]) {
        onboarded = changes[STORAGE_KEYS.ONBOARDED].newValue === true;
      }
      if (changes[STORAGE_KEYS.DAILY_COUNTS]) {
        dailyCounts = changes[STORAGE_KEYS.DAILY_COUNTS].newValue || {};
      }
      if (changes[STORAGE_KEYS.SNOOZE_UNTIL]) {
        syncSnoozeState(changes[STORAGE_KEYS.SNOOZE_UNTIL].newValue || 0);
      }
      return;
    }

    if (area === "sync") {
      if (changes[STORAGE_KEYS.ENABLED]) {
        enabled = changes[STORAGE_KEYS.ENABLED].newValue !== false;
        if (enabled) {
          processed = new WeakSet();
          forceShow = new WeakSet();
          if (Date.now() >= snoozeUntil) {
            scheduleInitialScan();
            startObserver();
          }
        } else {
          restoreBlocked();
          stopObserver();
          setBadge("");
        }
      }
      if (changes[PHRASES_STORAGE_KEY]) {
        userPhrases = changes[PHRASES_STORAGE_KEY].newValue || [];
        spamPatterns = buildPatterns(changes[PHRASES_STORAGE_KEY].newValue, enabledLangs);
      }
      if (changes[STORAGE_KEYS.EXCLUDED]) {
        excludedSignatures = normalizeExcludedEntries(changes[STORAGE_KEYS.EXCLUDED].newValue || []);
      }
      if (changes[STORAGE_KEYS.LANGS]) {
        enabledLangs = changes[STORAGE_KEYS.LANGS].newValue || [...DEFAULT_ENABLED_LANGS];
        spamPatterns = buildPatterns(userPhrases, enabledLangs);
      }
      if (changes[STORAGE_KEYS.DISABLED_PATTERNS]) {
        disabledPatterns = new Set(changes[STORAGE_KEYS.DISABLED_PATTERNS].newValue || []);
        spamPatterns = buildPatterns(userPhrases, enabledLangs);
      }
      if (changes[STORAGE_KEYS.WHITELIST]) {
        whitelistedAuthors = new Set(changes[STORAGE_KEYS.WHITELIST].newValue || []);
      }
      if (changes[STORAGE_KEYS.BLOCKED_AUTHORS]) {
        blockedAuthors = new Set(changes[STORAGE_KEYS.BLOCKED_AUTHORS].newValue || []);
      }
      if (changes[STORAGE_KEYS.HIDE_PROMOTED]) {
        hidePromoted = changes[STORAGE_KEYS.HIDE_PROMOTED].newValue === true;
      }
      if (changes[STORAGE_KEYS.HIDE_FEATURED]) {
        hideFeatured = changes[STORAGE_KEYS.HIDE_FEATURED].newValue === true;
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    switch (msg.action) {
      case "getState":
        sendResponse({
          enabled,
          blockedCount,
          snoozed: Date.now() < snoozeUntil,
          snoozeUntil,
          dailyCounts,
          onboarded,
          lastBlocked: lastBlocked.map(item => ({
            triggerText: item.triggerText,
            label: item.label,
            source: item.source,
            timestamp: item.timestamp,
          })),
          suggestions: pendingSuggestions.map(s => ({ word: s.word, timestamp: s.timestamp })),
        });
        break;

      case "toggle":
        enabled = msg.enabled;
        if (enabled) {
          clearSnooze();
          processed = new WeakSet();
          forceShow = new WeakSet();
          scheduleInitialScan();
          startObserver();
        } else {
          clearSnooze();
          restoreBlocked();
          stopObserver();
        }
        chrome.storage.sync.set({
          [STORAGE_KEYS.ENABLED]: enabled,
        });
        sendResponse({ enabled });
        break;

      case "resetCount":
        blockedCount = 0;
        dailyCounts = {};
        chrome.storage.local.set({
          [STORAGE_KEYS.COUNT]: 0,
          [STORAGE_KEYS.DAILY_COUNTS]: {},
        });
        setBadge("");
        sendResponse({ blockedCount: 0, dailyCounts: {} });
        break;

      case "snooze":
        snooze();
        sendResponse({ snoozeUntil });
        break;

      case "clearSnooze":
        clearSnooze();
        sendResponse({ snoozed: false });
        break;

      case "undoBlock":
        {
          const entry = lastBlocked[msg.index];
          if (entry) {
            restorePost(entry.post);
            lastBlocked.splice(msg.index, 1);
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false });
          }
        }
        break;

      case "restoreAll":
        restoreBlocked();
        lastBlocked.length = 0;
        sendResponse({ ok: true });
        break;

      case "dismissOnboard":
        onboarded = true;
        chrome.storage.local.set({ [STORAGE_KEYS.ONBOARDED]: true });
        sendResponse({ ok: true });
        break;

      case "addSuggestion":
        if (
          !msg.word ||
          msg.word.length > LIMITS.MAX_PHRASE_LENGTH ||
          userPhrases.some(p => p.text.toLowerCase() === msg.word.toLowerCase())
        ) {
          sendResponse({ ok: false, reason: "duplicate" });
          break;
        }
        if (userPhrases.length >= LIMITS.MAX_CUSTOM_PHRASES) {
          sendResponse({ ok: false, reason: "limit" });
          break;
        }
        {
          const candidate = userPhrases.concat([{
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9),
            text: msg.word,
            enabled: true,
            created: Date.now(),
            mode: "exact",
          }]);

          const limit = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.95);
          if (estimatePhraseBytes(candidate, PHRASES_STORAGE_KEY) > limit) {
            sendResponse({ ok: false, reason: "quota" });
            break;
          }

          userPhrases = candidate;
          chrome.storage.sync.set({ [PHRASES_STORAGE_KEY]: userPhrases }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save suggestion phrase:", chrome.runtime.lastError.message);
            }
          });
          pendingSuggestions = pendingSuggestions.filter(s => s.word !== msg.word);
          sendResponse({ ok: true });
        }
        break;

      case "dismissSuggestion":
        pendingSuggestions = pendingSuggestions.filter(s => s.word !== msg.word);
        if (msg.word) dismissedSuggestions.add(msg.word);
        sendResponse({ ok: true });
        break;

      case "addToWhitelist":
        if (msg.authorId) {
          whitelistedAuthors.add(msg.authorId);
          pruneSet(whitelistedAuthors, LIMITS.MAX_WHITELIST);
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;

      case "removeFromWhitelist":
        if (msg.authorId) {
          whitelistedAuthors.delete(msg.authorId);
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;

      case "getWhitelist":
        sendResponse({ whitelist: [...whitelistedAuthors] });
        break;

      case "addToBlockedAuthor":
        if (msg.authorId) {
          blockedAuthors.add(msg.authorId);
          pruneSet(blockedAuthors, LIMITS.MAX_BLOCKED_AUTHORS);
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;

      case "removeFromBlockedAuthor":
        if (msg.authorId) {
          blockedAuthors.delete(msg.authorId);
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;

      case "getBlockedAuthors":
        sendResponse({ blockedAuthors: [...blockedAuthors] });
        break;
    }
  });

  /* ==================================================================
   *  PATTERN BUILDING
   * ================================================================== */

  function buildPatterns(phrases, langs) {
    const builtin = [];
    for (const lang of langs || DEFAULT_ENABLED_LANGS) {
      if (BASE_PATTERNS[lang]) {
        for (const entry of BASE_PATTERNS[lang]) {
          if (disabledPatterns.has(entry.id)) continue;
          builtin.push(entry);
        }
      }
    }
    const custom = (phrases || [])
      .filter((p) => (
        p &&
        p.enabled &&
        typeof p.text === "string" &&
        p.text.trim().length > 0 &&
        p.text.trim().length <= LIMITS.MAX_PHRASE_LENGTH
      ))
      .map((p) => {
        const text = p.text.trim();
        const escaped = SS_escapeRegex(text);
        if (p.mode === "contains") {
          return { regex: new RegExp(escaped, "i"), label: text, source: "custom" };
        }
        /* Only add \b anchors when adjacent char is a word character.
           Prevents silent non-matching phrases like "hello?" where \b
           after ? can never be true (non-word → end = no boundary). */
        const start = /^\w/.test(text) ? "\\b" : "";
        const end = /\w$/.test(text) ? "\\b" : "";
        return { regex: new RegExp(start + escaped + end, "i"), label: text, source: "custom" };
      });
    /* Custom phrases first: when a text matches both a built-in pattern
       and an enabled custom phrase, the first matching entry is the one
       attributed (and gates the trigger-word suggestion). Custom-first
       reproduces the original semantics — any custom phrase covering the
       text wins over the generic built-in label. */
    return [...custom, ...builtin];
  }

  /* ==================================================================
   *  SPAM DETECTION
   * ================================================================== */

  /* Returns the matched pattern entry ({ regex, label, source }) or null.
     Because buildPatterns orders custom phrases first, a text covered by
     both a custom phrase and a built-in pattern attributes to the custom
     phrase. */
  function findMatch(text) {
    if (excludedSignatures.has(SS_getExcludedSignature(text))) return null;
    for (const entry of spamPatterns) {
      if (entry.regex.test(text)) return entry;
    }
    return null;
  }

  /* ==================================================================
   *  TEXT-NODE ITERATION (supports Shadow DOM)
   * ================================================================== */

  function forEachTextNode(root, callback) {
    if (!root || !callback) return;

    const filter = { acceptNode: makeTextFilter() };

    /* Light DOM */
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      filter,
      false
    );
    let node;
    while ((node = walker.nextNode())) callback(node);

    /* Shadow DOM */
    const elWalker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );
    while ((node = elWalker.nextNode())) {
      if (node.shadowRoot) forEachTextNode(node.shadowRoot, callback);
    }
  }

  function makeTextFilter() {
    return function (textNode) {
      if (!textNode.parentElement) return NodeFilter.FILTER_REJECT;
      const tag = textNode.parentElement.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
        return NodeFilter.FILTER_REJECT;
      if (processed.has(textNode.parentElement))
        return NodeFilter.FILTER_REJECT;
      if (textNode.textContent.trim().length < CONFIG.MIN_TEXT_LENGTH)
        return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    };
  }

  function findSpamTextNodes(root) {
    const hits = [];
    forEachTextNode(root, (node) => {
      const match = findMatch(node.textContent);
      if (match) {
        if (node.parentElement) processed.add(node.parentElement);
        hits.push({ node, match });
      }
    });
    return hits;
  }

  /* ==================================================================
   *  POST-CONTAINER DETECTION — STRATEGY CHAIN
   * ================================================================== */

  const CONTAINER_STRATEGIES = [
    findBySiblingHeuristic,
    findByKnownSelectors,
  ];

  function findPostContainer(textNode) {
    for (const strategy of CONTAINER_STRATEGIES) {
      try {
        const result = strategy(textNode);
        if (result instanceof Element) return result;
      } catch (_) {
        /* skip failed strategy */
      }
    }
    return null;
  }

  /* ── Strategy 1: sibling-content heuristic (zero selectors) ──── */

  function findBySiblingHeuristic(textNode) {
    let el = textNode.parentElement;
    let depth = 0;

    while (el && el !== document.body && depth < CONFIG.DEPTH_LIMIT) {
      depth++;
      const parent = el.parentElement;
      if (!parent || parent === document.body) break;

      const siblings = parent.children;
      let heavySiblings = 0;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] === el) continue;
        if (
          siblings[i].textContent.trim().length >
          CONFIG.SIBLING_CONTENT_THRESHOLD
        )
          heavySiblings++;
      }

      if (heavySiblings >= CONFIG.SIBLING_COUNT_THRESHOLD) {
        const gp = parent.parentElement;
        if (gp && gp !== document.body) {
          let gpHeavy = 0;
          for (const child of gp.children) {
            if (child === parent) continue;
            if (
              child.textContent.trim().length >
              CONFIG.SIBLING_CONTENT_THRESHOLD
            )
              gpHeavy++;
          }
          if (gpHeavy >= CONFIG.SIBLING_COUNT_THRESHOLD) {
            el = parent;
            continue;
          }
        }
        return el;
      }

      if (siblings.length >= CONFIG.FEED_SIBLING_FALLBACK) {
        if (el.textContent.trim().length > CONFIG.MIN_TEXT_LENGTH) return el;
      }

      if (
        depth >= 4 &&
        el.textContent.trim().length > CONFIG.CONTENT_LENGTH_THRESHOLD
      )
        return el;

      el = parent;
    }

    return null;
  }

  /* ── Strategy 2: known attribute / tag selectors ──────────────── */

  function findByKnownSelectors(textNode) {
    let el = textNode.parentElement;
    while (el && el !== document.body) {
      for (const sel of POST_SELECTORS) {
        if (el.matches?.(sel)) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  /* ==================================================================
   *  SCANNING
   * ================================================================== */

  function scan(root) {
    if (!enabled || Date.now() < snoozeUntil) return;
    root = root || document.body;

    const matches = findSpamTextNodes(root);
    for (const { node: textNode, match } of matches) {
      const container = findPostContainer(textNode);
      if (
        container &&
        !processed.has(container) &&
        !forceShow.has(container)
      ) {
        blockPost(container, textNode, match);
      }
    }
  }

  /* Author-blocklist pass (plan 008): enumerate post containers directly
     and block any whose author the user always wants hidden. Mirrors
     scan()'s guards (enabled, snooze) and lets blockPost apply the same
     whitelist/cooldown/force-show protections. Called from the same
     places scan() is, so newly-loaded posts are checked too. */
  function scanForBlockedAuthors(root) {
    if (!enabled || Date.now() < snoozeUntil) return;
    if (blockedAuthors.size === 0) return;
    root = root || document.body;

    for (const selector of AUTHOR_BLOCK_SELECTORS) {
      /* A mutation-observer root can itself be the post element, and
         querySelectorAll only matches descendants — include the root in
         the candidates. */
      let posts = root.querySelectorAll(selector);
      if (root.matches?.(selector)) posts = [root, ...posts];
      for (const post of posts) {
        const authorId = getAuthorId(post);
        if (authorId && blockedAuthors.has(authorId)) {
          blockPost(post, null, { reason: "author-blocklist", authorId });
        }
      }
    }
  }

  /* Label-hide pass (promoted posts): enumerate post containers with the
     same selectors as scanForBlockedAuthors and block any whose content
     carries LinkedIn's "Promoted" label (exact-match against the localized
     label list — a post merely DISCUSSING promotion does not match). Only
     runs while the opt-in toggle is on. querySelectorAll("*") per post is
     acceptable here: the pass runs only over enumerated post containers
     and only when the toggle is enabled. */
  function scanForLabeledPosts(root) {
    if (!enabled || Date.now() < snoozeUntil) return;
    if (!hidePromoted) return;
    root = root || document.body;

    for (const selector of AUTHOR_BLOCK_SELECTORS) {
      let posts = root.querySelectorAll(selector);
      if (root.matches?.(selector)) posts = [root, ...posts];
      for (const post of posts) {
        for (const el of post.querySelectorAll("*")) {
          if (SS_matchesLabel(el.textContent, SS_PROMOTED_LABELS)) {
            blockPost(post, null, { reason: "promoted" });
            break;
          }
        }
      }
    }
  }

  /* Label-hide pass (profile "Featured" section): find the section's
     heading by its localized label and block the SECTION element that
     contains it (walking up at most 3 ancestors, falling back to the
     heading's parent). Only runs on /in/ profile pages while the opt-in
     toggle is on; a profile has one Featured section, so only the first
     match per root is hidden. */
  function scanForFeaturedSection(root) {
    if (!enabled || Date.now() < snoozeUntil) return;
    if (!hideFeatured || !/^\/in\//.test(window.location.pathname)) return;
    root = root || document.body;

    let headings = root.querySelectorAll("h2, h3");
    if (root.matches?.("h2, h3")) headings = [root, ...headings];
    for (const heading of headings) {
      if (!SS_matchesLabel(heading.textContent, SS_FEATURED_LABELS)) continue;
      let section = heading;
      for (let i = 0; i < 3 && section.parentElement; i++) {
        section = section.parentElement;
        if (section.tagName === "SECTION") break;
      }
      if (section.tagName !== "SECTION") section = heading.parentElement;
      blockPost(section, null, { reason: "featured" });
      break;
    }
  }

  function scheduleInitialScan() {
    const doScan = () => {
      scan(document.body);
      scanForBlockedAuthors(document.body);
      scanForLabeledPosts(document.body);
      scanForFeaturedSection(document.body);
    };
    if (window.requestIdleCallback) {
      requestIdleCallback(doScan, { timeout: 2000 });
    } else {
      setTimeout(doScan, CONFIG.INITIAL_SCAN_DELAY_MS);
    }
  }

  /* ==================================================================
   *  BLOCKING
   * ================================================================== */

  /* `info` is the context for the block: the matched pattern entry
     ({ label, source, id }) for text-based blocks, or
     { reason: "author-blocklist", authorId } for the author-blocklist
     pass (plan 008 Decision 2). A null textNode means the block was
     author-driven, not text-driven. */
  function blockPost(post, textNode, info) {
    /* Re-block cooldown — skip if user recently clicked "Show". */
    const postKey = post.getAttribute("data-id");
    if (postKey && cooldownStore.has(postKey)) return;
    if (processed.has(post) || forceShow.has(post)) return;

    /* Idempotency guard: a placeholder as the post's next sibling means
       it is already blocked — a duplicate scan (toggle-on schedules one
       while storage.onChanged schedules another) must not block it again,
       which would stack a second placeholder and a second undo entry. */
    const existingPh = post.nextElementSibling;
    if (existingPh && existingPh.dataset && existingPh.dataset.ssPh) return;

    /* Skip if author is whitelisted. */
    const isAuthorBlock = !!(info && info.reason === "author-blocklist");
    const isLabelBlock = !!(info && (info.reason === "promoted" || info.reason === "featured"));
    const authorId = isAuthorBlock
      ? info.authorId
      : textNode
        ? getAuthorId(post)
        : null;
    if (authorId && whitelistedAuthors.has(authorId)) return;

    processed.add(post);
    post.style.display = "none";
    blockedPosts.add(post);
    /* Label hides are opt-in cosmetic filters: they must not touch the
       stats, the badge, or the popup's undo list. Everything else below
       (cooldown/forceShow/restore) still applies so Show/disable work. */
    if (!isLabelBlock && !counted.has(post)) {
      counted.add(post);
      blockedCount++;
      const key = getTodayKey();
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    }
    if (!isLabelBlock) setBadge(String(blockedCount));

    /* Track last blocked for undo in popup. */
    if (textNode && !isLabelBlock) {
      lastBlocked.unshift({
        post,
        triggerText: extractTrigger(textNode.textContent),
        label: info ? info.label : undefined,
        source: info ? info.source : undefined,
        timestamp: Date.now(),
      });
      if (lastBlocked.length > 5) lastBlocked.pop();
    }

    /* Auto-suggest trigger word if matched by built-in pattern only. */
    if (textNode && info && info.source !== "custom") {
      const word = extractSuggestionWord(textNode.textContent);
      if (word &&
          !dismissedSuggestions.has(word) &&
          !userPhrases.some(p => p.text.toLowerCase() === word.toLowerCase()) &&
          !pendingSuggestions.some(s => s.word === word)) {
        pendingSuggestions.push({ word, timestamp: Date.now() });
        if (pendingSuggestions.length > 3) pendingSuggestions.shift();
      }
    }

    /* First-run toast. */
    if (!onboarded) showFirstRunToast();

    const placeholder = document.createElement("div");
    placeholder.dataset.ssPh = "1";
    placeholder.style.cssText = [
      "display:flex; align-items:center; gap:12px;",
      "padding:16px 24px; margin:8px 0;",
      "background:#f8f9fa; border:1px solid #e0e0e0; border-radius:8px;",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
      "font-size:14px; color:#666;",
    ].join("");

    const label = document.createElement("span");
    label.textContent = isAuthorBlock
      ? t("blockedByAuthor")
      : isLabelBlock
        ? (info.reason === "promoted" ? t("blockedPromoted") : t("blockedFeatured"))
        : t("blockedBy");
    placeholder.appendChild(label);

    const matchedText = textNode ? textNode.textContent : "";

    /* "Not spam" is meaningless for author-driven and label-driven blocks —
       author blocks have no text to exclude, and a label block is a
       LinkedIn label, not spam text — so it is skipped (plan 008 Decision 2
       for author blocks; label blocks have no matched text at all). */
    if (!isAuthorBlock && !isLabelBlock) {
      const notSpamBtn = document.createElement("button");
      notSpamBtn.textContent = t("notSpam");
      notSpamBtn.title = t("notSpamTooltip");
      notSpamBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:13px; color:#767676;",
      ].join("");
      notSpamBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (matchedText) {
          const sig = SS_getExcludedSignature(matchedText);
          excludedSignatures.set(sig, {
            preview: truncateForPreview(matchedText, CONFIG.EXCLUSION_PREVIEW_LENGTH),
            created: Date.now(),
          });
          pruneExcludedByBytes(
            excludedSignatures,
            STORAGE_KEYS.EXCLUDED,
            Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9)
          );
          chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: serializeExcluded(excludedSignatures) });
        }
        restorePost(post);
      });
      placeholder.appendChild(notSpamBtn);
    }

    /* Author-driven blocks get the inverse action: remove the author
       from the blocklist and restore the post (plan 008 Decision 2). */
    if (isAuthorBlock) {
      const unblockBtn = document.createElement("button");
      unblockBtn.textContent = t("unblockAuthor");
      unblockBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:13px; color:#767676;",
      ].join("");
      unblockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (info.authorId) {
          blockedAuthors.delete(info.authorId);
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] });
        }
        restorePost(post);
      });
      placeholder.appendChild(unblockBtn);
    }

    /* "Never block this author" button (only if we found an author ID —
       meaningless for an author-driven block, where the inverse action
       above already covers it, and for label-driven blocks, which hide a
       whole class of posts rather than one author). */
    if (authorId && !isAuthorBlock && !isLabelBlock) {
      const whitelistBtn = document.createElement("button");
      whitelistBtn.textContent = t("neverBlock");
      whitelistBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:12px; color:#767676;",
      ].join("");
      whitelistBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = getAuthorId(post);
        if (id) {
          whitelistedAuthors.add(id);
          pruneSet(whitelistedAuthors, LIMITS.MAX_WHITELIST);
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] });
        }
        restorePost(post);
      });
      placeholder.appendChild(whitelistBtn);
    }

    const restoreBtn = document.createElement("button");
    restoreBtn.textContent = t("show");
    restoreBtn.style.cssText = [
      "background:none; border:1px solid #999; border-radius:4px;",
      "padding:4px 12px; cursor:pointer; font-size:13px; color:#555;",
    ].join("");
    restoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      restorePost(post);
    });
    placeholder.appendChild(restoreBtn);

    /* "Report missed spam" only makes sense when there IS matched text —
       its payload is built from the text node, and a label block has no
       spam text to report. */
    if (textNode) {
      const reportBtn = document.createElement("button");
      reportBtn.textContent = t("reportMissed");
      reportBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:12px; color:#767676;",
      ].join("");
      reportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const excerpt = (textNode ? textNode.textContent : "").trim().slice(0, 600);
        const trigger = textNode ? extractTrigger(textNode.textContent) : "";
        const payload = [
          "Trigger: " + trigger,
          "",
          excerpt,
          "",
          "LinkedIn page: " + window.location.href,
        ].join("\n");
        const copy = () => navigator.clipboard.writeText(payload);
        if (navigator.clipboard) {
          copy().then(
            () => showReportToast(t("reportCopied")),
            () => copyFallback(payload)
          );
        } else {
          copyFallback(payload);
        }
        window.open(
          "https://github.com/cortega26/stop-spam-linkedin/issues/new?template=missed_spam_pattern.yml",
          "_blank",
          "noopener"
        );
      });
      placeholder.appendChild(reportBtn);
    }

    post.parentNode?.insertBefore(placeholder, post.nextSibling);

    /* Note: multi-tab race — two LinkedIn tabs can overwrite each
       other's count+stats since each content script has independent
       state. A central coordinator (service-worker serialised counter)
       would fix this, but incidence is low and impact is cosmetic. */
    chrome.storage.local.set({
      [STORAGE_KEYS.COUNT]: blockedCount,
      [STORAGE_KEYS.DAILY_COUNTS]: dailyCounts,
    });
  }

  /* ==================================================================
   *  BADGE
   * ================================================================== */

  function setBadge(text) {
    try {
      chrome.runtime.sendMessage({ action: "updateBadge", text });
    } catch (_) {
      /* Content script may not have runtime messaging in some contexts. */
    }
  }

  /* ==================================================================
   *  RESTORE
   * ================================================================== */

  function restoreBlocked() {
    for (const post of blockedPosts) {
      post.style.display = "";
      const ph = post.nextElementSibling;
      if (ph && ph.dataset && ph.dataset.ssPh) ph.remove();
    }
    blockedPosts.clear();
    processed = new WeakSet();
    setBadge("");
  }

  /* ==================================================================
   *  SNOOZE
   * ================================================================== */

  function snooze() {
    syncSnoozeState(Date.now() + LIMITS.SNOOZE_DURATION_MS);
    chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: snoozeUntil });
  }

  function clearSnooze() {
    syncSnoozeState(0);
    chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: 0 });
  }

  function syncSnoozeState(nextSnoozeUntil) {
    snoozeUntil = nextSnoozeUntil || 0;

    if (snoozeTimer) {
      clearTimeout(snoozeTimer);
      snoozeTimer = null;
    }

    if (!snoozeUntil || Date.now() >= snoozeUntil) {
      snoozeUntil = 0;
      if (enabled) {
        scheduleInitialScan();
        startObserver();
      }
      return;
    }

    restoreBlocked();
    snoozeTimer = setTimeout(() => {
      snoozeUntil = 0;
      chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: 0 });
      if (enabled) {
        scheduleInitialScan();
        startObserver();
      }
    }, snoozeUntil - Date.now());
  }

  /* ==================================================================
   *  MUTATION OBSERVER — INCREMENTAL
   * ================================================================== */

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(
      debounce((mutations) => {
        if (!enabled || Date.now() < snoozeUntil) return;
        const roots = collectNewRoots(mutations);
        for (const root of roots) {
          scan(root);
          scanForBlockedAuthors(root);
          scanForLabeledPosts(root);
          scanForFeaturedSection(root);
        }
      }, CONFIG.OBSERVER_DEBOUNCE_MS)
    );
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function collectNewRoots(mutations) {
    const roots = new Set();
    for (let m = 0; m < mutations.length; m++) {
      const added = mutations[m].addedNodes;
      for (let n = 0; n < added.length; n++) {
        const node = added[n];
        if (node.nodeType === Node.ELEMENT_NODE) {
          let ancestor = node.parentElement;
          let isNested = false;
          while (ancestor && ancestor !== document.body) {
            if (roots.has(ancestor)) {
              isNested = true;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if (!isNested) roots.add(node);
        }
      }
    }
    return roots;
  }

  /* ==================================================================
   *  UTILITY
   * ================================================================== */

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /* ==================================================================
   *  STATS & ONBOARDING HELPERS
   * ================================================================== */

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function showFirstRunToast() {
    if (onboarded) return;
    onboarded = true;
    chrome.storage.local.set({ [STORAGE_KEYS.ONBOARDED]: true });

    const banner = document.createElement("div");
    banner.textContent = t("blockedToast", [String(blockedCount)]);
    Object.assign(banner.style, {
      padding: "10px 24px",
      margin: "8px auto",
      maxWidth: "540px",
      background: "#d4edda",
      border: "1px solid #c3e6cb",
      borderRadius: "8px",
      color: "#155724",
      fontSize: "14px",
      textAlign: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    });

    const target = document.querySelector('[class*="feed"]') || document.querySelector("main");
    if (target && target.parentNode) {
      target.parentNode.insertBefore(banner, target);
    } else {
      document.body.prepend(banner);
    }
    setTimeout(() => banner.remove(), 5000);
  }

  function extractTrigger(text) {
    const m = text.match(/[`'""«»“”„]\w+(?:\s+\w+)?[`'""»“”„]/);
    if (m) return m[0];
    const t = text.trim();
    return t.length > 40 ? t.slice(0, 40) + "..." : t;
  }

  function copyFallback(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showReportToast(t("reportCopied"));
    } catch (_) {
      showReportToast(t("reportFailed"), true);
    }
    ta.remove();
  }

  function showReportToast(message, warn) {
    const toast = document.createElement("div");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "999999",
      padding: "10px 16px",
      borderRadius: "6px",
      color: "#fff",
      background: warn ? "#a94442" : "#2a6f97",
      fontSize: "13px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /* Extract a clean trigger word (no quotes) for suggestions, or null. */
  function extractSuggestionWord(text) {
    const m = text.match(/[`'""«»“”„](\w+(?:\s+\w+)?)[`'""»“”„]/);
    return m ? m[1] : null;
  }

  function restorePost(post) {
    forceShow.add(post);
    processed.delete(post);
    const postKey = post.getAttribute("data-id");
    if (postKey) cooldownStore.set(postKey);
    post.style.display = "";
    const ph = post.nextElementSibling;
    if (ph && ph.dataset && ph.dataset.ssPh) ph.remove();

    /* Keep lastBlocked in sync so the popup undo list stays accurate. */
    for (let i = lastBlocked.length - 1; i >= 0; i--) {
      if (lastBlocked[i].post === post) lastBlocked.splice(i, 1);
    }
  }

  /* Extract the LinkedIn author profile ID from known author/header links only. */
  function getAuthorId(post) {
    for (const selector of AUTHOR_LINK_SELECTORS) {
      for (const link of post.querySelectorAll(selector)) {
        const authorId = SS_parseAuthorId(link.getAttribute("href"), window.location.origin);
        if (authorId) return authorId;
      }
    }

    return null;
  }

  function truncateForPreview(text, maxLen) {
    const trimmed = String(text).trim();
    if (trimmed.length <= maxLen) return trimmed;
    return trimmed.slice(0, maxLen) + "…";
  }

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
              preview: truncateForPreview(entry, CONFIG.EXCLUSION_PREVIEW_LENGTH),
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
    return map;
  }

  function serializeExcluded(map) {
    return Array.from(map, ([sig, meta]) => ({
      sig,
      preview: meta.preview,
      created: meta.created,
    }));
  }

  function estimateEntriesBytes(map, storageKey) {
    return storageKey.length + JSON.stringify(serializeExcluded(map)).length;
  }

  function pruneExcludedByBytes(map, storageKey, safeByteLimit) {
    while (map.size > 0 && estimateEntriesBytes(map, storageKey) > safeByteLimit) {
      /* Evict the least useful entry: prefer removing entries with no
         preview (already-unrecoverable legacy hashes, or migrated
         plain-text that's already been through one round of truncation)
         over ones with a live preview; break ties by oldest `created`
         (nulls sort first — treat as "oldest"). */
      let victimSig = null;
      let victimScore = Infinity;
      for (const [sig, meta] of map) {
        const score = (meta.preview ? 1_000_000_000_000 : 0) + (meta.created || 0);
        if (score < victimScore) {
          victimScore = score;
          victimSig = sig;
        }
      }
      if (victimSig === null) break;
      map.delete(victimSig);
    }
  }

  function pruneSet(set, maxSize) {
    while (set.size > maxSize) {
      const first = set.values().next().value;
      set.delete(first);
    }
  }
})();
