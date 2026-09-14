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

  /* Missed-spam report destination + excerpt cap (plan 063): shared by
     the placeholder button and the selection-anchored reportMissedSpam
     message so both report kinds triage identically. */
  const REPORT_ISSUE_URL = "https://github.com/cortega26/stop-spam-linkedin/issues/new?template=missed_spam_pattern.yml";
  const REPORT_EXCERPT_MAX = 600;

  /* Effective pattern list, assembled by SS_buildPatterns
     (shared/pattern-data.js) from built-in patterns + user keywords. */
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
  /* Posts hidden by the opt-in label filters (Promoted/Featured). A
     whitelist change must never un-hide these: they're hidden by class,
     not by author. */
  const labelBlockedPosts = new Set();

  /* Cooldown after user presses "Show" — keyed by post identity
     (data-id) so it survives virtual-scroll node re-creation.
     Posts without a data-id rely on forceShow (live node only). */
  const cooldownStore = SS_createCooldownStore(CONFIG.COOLDOWN_DURATION_MS, 100);

  /* Sliding window of last 5 blocked posts for undo in popup. */
  const lastBlocked = [];
  let lastBlockedSeq = 0;

  /* Onboarding & daily stats. */
  let onboarded = false;
  let dailyCounts = {};
  /* Per-pattern lifetime block counts (ss_pattern_counts): flat bucket →
     count, e.g. { "EN-1": 3, "custom": 2, "author": 1 }. Reset together
     with the other counters; kept out of backup (plan 053 privacy
     decision) and out of the sync-migration list (the key never lived in
     sync). */
  let patternCounts = {};

  /* User-excluded text signatures (false-positive feedback). */
  let excludedSignatures = new Map();

  /* Enabled detection languages (subset of the built-in pattern keys). */
  let enabledLangs = [...DEFAULT_ENABLED_LANGS];

  /* Built-in pattern ids the user turned off (from ss_disabled_patterns). */
  let disabledPatterns = new Set();

  /* User phrases (for checking if a match was built-in or custom). */
  let userPhrases = [];

  /* Compiled allow-phrases — text the user never wants hidden. */
  let allowMatchers = [];

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
    [STORAGE_KEYS.ENABLED, STORAGE_KEYS.COUNT, STORAGE_KEYS.ONBOARDED, STORAGE_KEYS.DAILY_COUNTS, STORAGE_KEYS.SNOOZE_UNTIL, STORAGE_KEYS.EXCLUDED, STORAGE_KEYS.ALLOW_PHRASES, STORAGE_KEYS.LANGS, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.BLOCKED_AUTHORS, STORAGE_KEYS.DISABLED_PATTERNS, STORAGE_KEYS.HIDE_PROMOTED, STORAGE_KEYS.HIDE_FEATURED, PHRASES_STORAGE_KEY],
    /** @param {{ [key: string]: any }} syncResult */
    (syncResult) => {
      chrome.storage.local.get(
        [
          STORAGE_KEYS.COUNT,
          STORAGE_KEYS.ONBOARDED,
          STORAGE_KEYS.DAILY_COUNTS,
          STORAGE_KEYS.PATTERN_COUNTS,
          STORAGE_KEYS.SNOOZE_UNTIL,
          STORAGE_KEYS.PENDING_SUGGESTIONS,
          STORAGE_KEYS.DISMISSED_SUGGESTIONS,
        ],
        /** @param {{ [key: string]: any }} localResult */
        (localResult) => {
          migrateRuntimeStorage(syncResult, localResult);

          enabled = syncResult[STORAGE_KEYS.ENABLED] !== false;
          blockedCount = SS_readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.COUNT,
            0
          );
          onboarded = SS_readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.ONBOARDED,
            false
          ) === true;
          dailyCounts = SS_readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.DAILY_COUNTS,
            {}
          );
          patternCounts = localResult[STORAGE_KEYS.PATTERN_COUNTS] || {};
          snoozeUntil = SS_readRuntimeValue(
            localResult,
            syncResult,
            STORAGE_KEYS.SNOOZE_UNTIL,
            0
          );
          excludedSignatures = SS_normalizeExcludedEntries(syncResult[STORAGE_KEYS.EXCLUDED] || [], CONFIG.EXCLUSION_PREVIEW_LENGTH);
          enabledLangs = syncResult[STORAGE_KEYS.LANGS] || [...DEFAULT_ENABLED_LANGS];
          whitelistedAuthors = new Set(syncResult[STORAGE_KEYS.WHITELIST] || []);
          blockedAuthors = new Set(syncResult[STORAGE_KEYS.BLOCKED_AUTHORS] || []);
          disabledPatterns = new Set(syncResult[STORAGE_KEYS.DISABLED_PATTERNS] || []);
          hidePromoted = syncResult[STORAGE_KEYS.HIDE_PROMOTED] === true;
          hideFeatured = syncResult[STORAGE_KEYS.HIDE_FEATURED] === true;
          spamPatterns = SS_buildPatterns(syncResult[PHRASES_STORAGE_KEY], enabledLangs, disabledPatterns, LIMITS.MAX_PHRASE_LENGTH);
          userPhrases = syncResult[PHRASES_STORAGE_KEY] || [];
          allowMatchers = SS_buildAllowMatcher(syncResult[STORAGE_KEYS.ALLOW_PHRASES] || [], LIMITS.MAX_PHRASE_LENGTH);
          pendingSuggestions = SS_normalizePendingSuggestions(localResult[STORAGE_KEYS.PENDING_SUGGESTIONS] || [], LIMITS.MAX_PHRASE_LENGTH, LIMITS.MAX_PENDING_SUGGESTIONS);
          dismissedSuggestions = new Set(SS_normalizeDismissedSuggestions(localResult[STORAGE_KEYS.DISMISSED_SUGGESTIONS] || [], LIMITS.MAX_PHRASE_LENGTH));
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
  chrome.storage.onChanged.addListener(
    /** @param {{ [key: string]: { newValue?: any; oldValue?: any } }} changes */
    (changes, area) => {
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
      if (changes[STORAGE_KEYS.PATTERN_COUNTS]) {
        patternCounts = changes[STORAGE_KEYS.PATTERN_COUNTS].newValue || {};
      }
      if (changes[STORAGE_KEYS.SNOOZE_UNTIL]) {
        syncSnoozeState(changes[STORAGE_KEYS.SNOOZE_UNTIL].newValue || 0);
      }
      if (changes[STORAGE_KEYS.PENDING_SUGGESTIONS]) {
        pendingSuggestions = SS_normalizePendingSuggestions(changes[STORAGE_KEYS.PENDING_SUGGESTIONS].newValue || [], LIMITS.MAX_PHRASE_LENGTH, LIMITS.MAX_PENDING_SUGGESTIONS);
      }
      if (changes[STORAGE_KEYS.DISMISSED_SUGGESTIONS]) {
        dismissedSuggestions = new Set(SS_normalizeDismissedSuggestions(changes[STORAGE_KEYS.DISMISSED_SUGGESTIONS].newValue || [], LIMITS.MAX_PHRASE_LENGTH));
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
        spamPatterns = SS_buildPatterns(changes[PHRASES_STORAGE_KEY].newValue, enabledLangs, disabledPatterns, LIMITS.MAX_PHRASE_LENGTH);
      }
      if (changes[STORAGE_KEYS.EXCLUDED]) {
        excludedSignatures = SS_normalizeExcludedEntries(changes[STORAGE_KEYS.EXCLUDED].newValue || [], CONFIG.EXCLUSION_PREVIEW_LENGTH);
      }
      if (changes[STORAGE_KEYS.ALLOW_PHRASES]) {
        allowMatchers = SS_buildAllowMatcher(changes[STORAGE_KEYS.ALLOW_PHRASES].newValue || [], LIMITS.MAX_PHRASE_LENGTH);
        restoreAllowedPosts();
      }
      if (changes[STORAGE_KEYS.LANGS]) {
        enabledLangs = changes[STORAGE_KEYS.LANGS].newValue || [...DEFAULT_ENABLED_LANGS];
        spamPatterns = SS_buildPatterns(userPhrases, enabledLangs, disabledPatterns, LIMITS.MAX_PHRASE_LENGTH);
      }
      if (changes[STORAGE_KEYS.DISABLED_PATTERNS]) {
        disabledPatterns = new Set(changes[STORAGE_KEYS.DISABLED_PATTERNS].newValue || []);
        spamPatterns = SS_buildPatterns(userPhrases, enabledLangs, disabledPatterns, LIMITS.MAX_PHRASE_LENGTH);
      }
      if (changes[STORAGE_KEYS.WHITELIST]) {
        /* Diff against oldValue, not the live set: the in-flow writers
           (addToWhitelist message, "Never block this author" button)
           mutate whitelistedAuthors before storage.sync.set, so onChanged
           in the writing tab would see the new id already present. Using
           the event payload keeps same-tab and cross-tab writes on the
           same path — newly-added ids un-hide their blocked posts. */
        const previous = new Set(changes[STORAGE_KEYS.WHITELIST].oldValue || []);
        whitelistedAuthors = new Set(changes[STORAGE_KEYS.WHITELIST].newValue || []);
        for (const id of whitelistedAuthors) {
          if (!previous.has(id)) restoreAuthorPosts(id);
        }
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

  /* Mirror the in-memory suggestion queue + dismissal set to
     storage.local. Written together in one set for atomicity (plan 054
     §2): the in-memory state stays authoritative at runtime; storage is
     the mirror the popup fallback and options surface read. */
  function persistSuggestions() {
    chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_SUGGESTIONS]: pendingSuggestions,
      [STORAGE_KEYS.DISMISSED_SUGGESTIONS]: [...dismissedSuggestions],
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save suggestions (local.set):", chrome.runtime.lastError.message);
      }
    });
  }

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
          patternCounts,
          onboarded,
          lastBlocked: lastBlocked.map(item => ({
            id: item.id,
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
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn("Failed to save toggle state (sync.set):", chrome.runtime.lastError.message);
          }
        });
        sendResponse({ enabled });
        break;

      case "resetCount":
        blockedCount = 0;
        dailyCounts = {};
        patternCounts = {};
        chrome.storage.local.set({
          [STORAGE_KEYS.COUNT]: 0,
          [STORAGE_KEYS.DAILY_COUNTS]: {},
          [STORAGE_KEYS.PATTERN_COUNTS]: {},
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn("Failed to save reset counters (local.set):", chrome.runtime.lastError.message);
          }
        });
        setBadge("");
        sendResponse({ blockedCount: 0, dailyCounts: {}, patternCounts: {} });
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
          /* Resolve by stable id, not index: the popup's row order can
             shift when a new block lands between render and click. */
          const index = lastBlocked.findIndex(item => item.id === msg.id);
          const entry = index >= 0 ? lastBlocked[index] : undefined;
          if (entry) {
            restorePost(entry.post);
            lastBlocked.splice(index, 1);
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
        chrome.storage.local.set({ [STORAGE_KEYS.ONBOARDED]: true }, () => {
          if (chrome.runtime.lastError) {
            console.warn("Failed to save onboarding flag (local.set):", chrome.runtime.lastError.message);
          }
        });
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
          if (SS_estimatePhraseBytes(candidate, PHRASES_STORAGE_KEY) > limit) {
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
          persistSuggestions();
          sendResponse({ ok: true });
        }
        break;

      case "dismissSuggestion":
        pendingSuggestions = pendingSuggestions.filter(s => s.word !== msg.word);
        if (msg.word) dismissedSuggestions.add(msg.word);
        persistSuggestions();
        sendResponse({ ok: true });
        break;

      case "addToWhitelist":
        if (msg.authorId) {
          whitelistedAuthors.add(msg.authorId);
          pruneSet(whitelistedAuthors, LIMITS.MAX_WHITELIST);
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save whitelist add (sync.set):", chrome.runtime.lastError.message);
            }
          });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;

      case "removeFromWhitelist":
        if (msg.authorId) {
          whitelistedAuthors.delete(msg.authorId);
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save whitelist remove (sync.set):", chrome.runtime.lastError.message);
            }
          });
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
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save blocked author add (sync.set):", chrome.runtime.lastError.message);
            }
          });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;

      case "removeFromBlockedAuthor":
        if (msg.authorId) {
          blockedAuthors.delete(msg.authorId);
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save blocked author remove (sync.set):", chrome.runtime.lastError.message);
            }
          });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;

      case "getBlockedAuthors":
        sendResponse({ blockedAuthors: [...blockedAuthors] });
        break;

      case "reportMissedSpam":
        /* Async: clipboard write + tab open finish after the listener
           returns, so keep the channel open via `return true`. `ok:true`
           means a usable report was prepared AND its destination was
           confirmed (window.open or the background fallback ack);
           both-failed yields {ok:false, reason:"no-destination"}.
           `copied` reports whether the payload reached the clipboard. */
        handleReportMissedSpam(msg, sendResponse);
        return true;
    }
    return false;
  });

  /* ==================================================================
   *  SPAM DETECTION
   * ================================================================== */

  /* Returns the matched pattern entry ({ regex, label, source }) or null.
     Because SS_buildPatterns orders custom phrases first, a text covered by
     both a custom phrase and a built-in pattern attributes to the custom
     phrase. Allow-phrases short-circuit before any pattern: a post
     containing user-named never-hide text is never hidden, even when a
     custom phrase or built-in pattern also matches (plan 056 Decision 1). */
  function findMatch(text) {
    if (excludedSignatures.has(SS_getExcludedSignature(text))) return null;
    for (const allow of allowMatchers) {
      if (allow.regex.test(text)) return null;
    }
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
      filter
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) callback(node);

    /* Shadow DOM */
    const elWalker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      null
    );
    for (let node = elWalker.nextNode(); node; node = elWalker.nextNode()) {
      if (node instanceof Element && node.shadowRoot) forEachTextNode(node.shadowRoot, callback);
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

  /* Implemented in shared/post-container.js — see that file for the
     actual heuristics. content.js only wires them up with the live
     CONFIG and POST_SELECTORS so they stay unit-testable. */

  /* ==================================================================
   *  SCANNING
   * ================================================================== */

  function scan(root) {
    if (!enabled || Date.now() < snoozeUntil) return;
    root = root || document.body;

    const matches = findSpamTextNodes(root);
    for (const { node: textNode, match } of matches) {
      const container = SS_findPostContainer(textNode, CONFIG, POST_SELECTORS);
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
  function getPostKey(el) {
    const own = el.getAttribute("data-id");
    if (own) return own;
    const post = el.closest ? el.closest('[data-id*="urn:li:activity:"]') : null;
    return post ? post.getAttribute("data-id") : null;
  }

  function blockPost(post, textNode, info) {
    /* Re-block cooldown — skip if user recently clicked "Show". The key
       is the element's own data-id, or — for non-post targets like a
       comment element (plan 059) — the parent post's data-id, so a
       shown comment stays shown across SPA node re-creation. */
    const postKey = getPostKey(post);
    const isPostTarget = !!postKey && post.hasAttribute("data-id");
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
    if (isLabelBlock) labelBlockedPosts.add(post);
    /* Label hides are opt-in cosmetic filters: they must not touch the
       stats, the badge, or the popup's undo list. Everything else below
       (cooldown/forceShow/restore) still applies so Show/disable work. */
    if (!isLabelBlock && !counted.has(post)) {
      counted.add(post);
      blockedCount++;
      const key = getTodayKey();
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
      /* Per-pattern bucket (plan 053): built-ins attribute by their stable
         id; custom phrases by source; author-blocklist blocks by reason;
         "builtin" is a defensive fallback unreachable in practice. Label
         hides never reach here (isLabelBlock). */
      const bucket = info && info.id
        ? info.id
        : info && info.source === "custom"
          ? "custom"
          : info && info.reason === "author-blocklist"
            ? "author"
            : "builtin";
      patternCounts[bucket] = (patternCounts[bucket] || 0) + 1;
    }
    if (!isLabelBlock) setBadge(String(blockedCount));

    /* Track last blocked for undo in popup. The id is the post's stable
       data-id when present (survives node re-creation), else a unique
       session id — the popup resolves undo by id, never by array index,
       so a new block between render and click can't shift the wrong post
       into the clicked row. */
    if (textNode && !isLabelBlock) {
      const postKey = post.getAttribute("data-id");
      lastBlocked.unshift({
        post,
        id: postKey || `uid:${++lastBlockedSeq}`,
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
        if (pendingSuggestions.length > LIMITS.MAX_PENDING_SUGGESTIONS) pendingSuggestions.shift();
        persistSuggestions();
      }
    }

    /* First-run toast. */
    if (!onboarded) showFirstRunToast();

    const placeholder = document.createElement("div");
    placeholder.dataset.ssPh = "1";
    placeholder.style.cssText = isPostTarget
      ? [
        "display:flex; align-items:center; gap:12px;",
        "padding:16px 24px; margin:8px 0;",
        "background:#f8f9fa; border:1px solid #e0e0e0; border-radius:8px;",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
        "font-size:14px; color:#666;",
      ].join("")
      : [
        "display:flex; align-items:center; gap:8px;",
        "padding:6px 10px; margin:4px 0;",
        "background:#f8f9fa; border:1px solid #e0e0e0; border-radius:6px;",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
        "font-size:12px; color:#666;",
      ].join("");

    const label = document.createElement("span");
    label.textContent = isAuthorBlock
      ? SS_t("blockedByAuthor")
      : isLabelBlock
        ? (info.reason === "promoted" ? SS_t("blockedPromoted") : SS_t("blockedFeatured"))
        : SS_t("blockedBy");
    placeholder.appendChild(label);

    const matchedText = textNode ? textNode.textContent : "";

    /* "Not spam" is meaningless for author-driven and label-driven blocks —
       author blocks have no text to exclude, and a label block is a
       LinkedIn label, not spam text — so it is skipped (plan 008 Decision 2
       for author blocks; label blocks have no matched text at all). */
    if (!isAuthorBlock && !isLabelBlock) {
      const notSpamBtn = document.createElement("button");
      notSpamBtn.textContent = SS_t("notSpam");
      notSpamBtn.title = SS_t("notSpamTooltip");
      notSpamBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:13px; color:#767676;",
      ].join("");
      notSpamBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (matchedText) {
          const sig = SS_getExcludedSignature(matchedText);
          excludedSignatures.set(sig, {
            preview: SS_truncateForPreview(matchedText, CONFIG.EXCLUSION_PREVIEW_LENGTH),
            created: Date.now(),
          });
          SS_pruneExcludedByBytes(
            excludedSignatures,
            STORAGE_KEYS.EXCLUDED,
            Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.9)
          );
          chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED]: SS_serializeExcluded(excludedSignatures) }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save excluded signature (sync.set):", chrome.runtime.lastError.message);
            }
          });
        }
        restorePost(post);
      });
      placeholder.appendChild(notSpamBtn);
    }

    /* Author-driven blocks get the inverse action: remove the author
       from the blocklist and restore the post (plan 008 Decision 2). */
    if (isAuthorBlock) {
      const unblockBtn = document.createElement("button");
      unblockBtn.textContent = SS_t("unblockAuthor");
      unblockBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:13px; color:#767676;",
      ].join("");
      unblockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (info.authorId) {
          blockedAuthors.delete(info.authorId);
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save unblocked author (sync.set):", chrome.runtime.lastError.message);
            }
          });
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
      whitelistBtn.textContent = SS_t("neverBlock");
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
          chrome.storage.sync.set({ [STORAGE_KEYS.WHITELIST]: [...whitelistedAuthors] }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save whitelist entry (sync.set):", chrome.runtime.lastError.message);
            }
          });
        }
        restorePost(post);
      });
      placeholder.appendChild(whitelistBtn);
    }

    /* "Block this author" button — the blocklist counterpart to the
       whitelist button above: hides every post by this author feed-wide.
       Only meaningful on text-block placeholders (author-block
       placeholders already show the unblock action, and label blocks are
       author-agnostic). On click the post stays hidden and its
       placeholder is swapped to the author-block variant (plan 040 D1). */
    if (authorId && !isAuthorBlock && !isLabelBlock) {
      const blockBtn = document.createElement("button");
      blockBtn.textContent = SS_t("blockAuthor");
      blockBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:12px; color:#767676;",
      ].join("");
      blockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = getAuthorId(post);
        if (id) {
          blockedAuthors.add(id);
          pruneSet(blockedAuthors, LIMITS.MAX_BLOCKED_AUTHORS);
          chrome.storage.sync.set({ [STORAGE_KEYS.BLOCKED_AUTHORS]: [...blockedAuthors] }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Failed to save blocked author (sync.set):", chrome.runtime.lastError.message);
            }
          });
          /* Swap the placeholder to the author-block variant: re-run
             blockPost with the author-blocklist reason now that the
             author is blocked. The re-entry guards are satisfied — the
             old placeholder is removed first, processed is cleared, and
             this post is not on cooldown or forceShow. The post stays
             hidden; counting is idempotent (counted.has(post)). */
          const ph = post.nextElementSibling;
          if (ph && ph.dataset && ph.dataset.ssPh) ph.remove();
          processed.delete(post);
          blockPost(post, null, { reason: "author-blocklist", authorId: id });
        }
      });
      placeholder.appendChild(blockBtn);
    }

    const restoreBtn = document.createElement("button");
    restoreBtn.textContent = SS_t("show");
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
      reportBtn.textContent = SS_t("reportMissed");
      reportBtn.style.cssText = [
        "background:none; border:1px solid #d0d0d0; border-radius:4px;",
        "padding:4px 12px; cursor:pointer; font-size:12px; color:#767676;",
      ].join("");
      reportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const excerpt = (textNode ? textNode.textContent : "").trim().slice(0, REPORT_EXCERPT_MAX);
        const trigger = textNode ? extractTrigger(textNode.textContent) : "";
        /* Built-in pattern ids carry the language prefix ("EN-1" → "EN");
           custom phrases have no language. The button is gated on textNode,
           so author/label blocks (textNode null) never reach here. */
        const language = info && info.id ? info.id.split("-")[0] : "custom";
        copyReportPayload(buildReportPayload(excerpt, trigger, language));
        openReportTab();
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
      [STORAGE_KEYS.PATTERN_COUNTS]: patternCounts,
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save block counters (local.set):", chrome.runtime.lastError.message);
      }
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
    /* Bulk restore invalidates the popup's undo window: the same posts
       will be re-blocked by the next scan and re-added, so dropping the
       stale rows here prevents duplicate undo entries after snooze,
       disable, or "Show all". */
    lastBlocked.length = 0;
    setBadge("");
  }

  /* Restore every blocked post authored by `authorId` (whitelist
     additions from the options page / import). Label-driven hides are
     excluded: they're a whole-class filter, not per-author. restorePost
     also prunes the popup's undo list. */
  function restoreAuthorPosts(authorId) {
    for (const post of blockedPosts) {
      if (labelBlockedPosts.has(post)) continue;
      if (getAuthorId(post) === authorId) restorePost(post);
    }
  }

  /* Un-hide posts an allow-phrase now pardons. Mirrors
     restoreAuthorPosts, including the labelBlockedPosts guard: posts
     hidden by the Promoted/Featured toggles are not text-blocked and
     must never be un-hidden by a text pardon. */
  function restoreAllowedPosts() {
    if (allowMatchers.length === 0) return;
    for (const post of blockedPosts) {
      if (labelBlockedPosts.has(post)) continue;
      const text = post.textContent || "";
      for (const allow of allowMatchers) {
        if (allow.regex.test(text)) {
          restorePost(post);
          break;
        }
      }
    }
  }

  /* ==================================================================
   *  SNOOZE
   * ================================================================== */

  function snooze() {
    syncSnoozeState(Date.now() + LIMITS.SNOOZE_DURATION_MS);
    chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: snoozeUntil }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save snooze state (local.set):", chrome.runtime.lastError.message);
      }
    });
  }

  function clearSnooze() {
    syncSnoozeState(0);
    chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: 0 }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save snooze clear (local.set):", chrome.runtime.lastError.message);
      }
    });
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
      chrome.storage.local.set({ [STORAGE_KEYS.SNOOZE_UNTIL]: 0 }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to save snooze expiry (local.set):", chrome.runtime.lastError.message);
        }
      });
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
      SS_debounce((mutations) => {
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
   *  STATS & ONBOARDING HELPERS
   * ================================================================== */

  function getTodayKey() {
    return SS_getLocalDayKey();
  }

  function showFirstRunToast() {
    if (onboarded) return;
    onboarded = true;
    chrome.storage.local.set({ [STORAGE_KEYS.ONBOARDED]: true }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save first-run flag (local.set):", chrome.runtime.lastError.message);
      }
    });

    const banner = document.createElement("div");
    banner.textContent = SS_t("blockedToast", [String(blockedCount)]);
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
    /* Returns whether the payload reached the clipboard so callers can
       report `copied` truthfully instead of claiming success on failure. */
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {
      ok = false;
    }
    ta.remove();
    showReportToast(SS_t(ok ? "reportCopied" : "reportFailed"), !ok);
    return ok;
  }

  /* Shared 6-line report shape: Trigger, Pattern language, blank,
     excerpt, blank, LinkedIn page. Both the placeholder button and the
     selection-anchored missed-spam flow build it here so triage sees
     one format. The excerpt is never placed in the issue URL. */
  function buildReportPayload(excerpt, trigger, language) {
    return [
      "Trigger: " + trigger,
      "Pattern language: " + language,
      "",
      excerpt,
      "",
      "LinkedIn page: " + window.location.href,
    ].join("\n");
  }

  /* Clipboard-first copy with a selectable-text fallback. Resolves true
     only when the payload actually reached the clipboard. */
  function copyReportPayload(payload) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(payload).then(
        () => {
          showReportToast(SS_t("reportCopied"));
          return true;
        },
        () => copyFallback(payload)
      );
    }
    return Promise.resolve(copyFallback(payload));
  }

  /* Opens the user-visible issue form. Resolves true after exactly one
     destination was confirmed: window.open when available, otherwise a
     single background chrome.tabs.create fallback (the worker needs no
     gesture). Resolves false only when BOTH failed. Only the user
     submits the form. */
  function openReportTab() {
    let opened = null;
    try {
      opened = window.open(REPORT_ISSUE_URL, "_blank", "noopener");
    } catch (_) {
      opened = null;
    }
    if (opened) return Promise.resolve(true);
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "openReportTab" }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }
          resolve(!!(response && response.ok));
        });
      } catch (_) {
        /* Messaging unavailable — no destination. */
        resolve(false);
      }
    });
  }

  /* True when the selection anchor lives in an editable control (input,
     textarea, select, contenteditable): reporting password-box or
     comment-draft text as spam makes no sense. */
  function isEditableSelectionNode(node) {
    if (!node) return false;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el || !el.closest) return false;
    if (el.closest("input, textarea, select")) return true;
    const editable = el.closest("[contenteditable]");
    return !!(editable && editable.isContentEditable);
  }

  /* Selection-anchored missed-spam report (plan 063): resolves the live
     selection's anchor through SS_findPostContainer (comment selections
     stay on the comment element via the 059 preference — never expanded
     to the parent post), caps to REPORT_EXCERPT_MAX, and reports with
     the literal "none" language marker (no pattern matched). With no
     recognized container the selected text itself is the excerpt — never
     anchor.textContent, which may be an entire unrelated paragraph, and
     never the whole page. `ok:true` means a usable report was prepared
     AND its destination was confirmed (window.open or the background
     fallback ack); when BOTH destinations fail the response is
     {ok:false, reason:"no-destination"} with the failure toast.
     `copied` says whether the clipboard write succeeded. Nothing is
     saved and nothing is submitted automatically. */
  function handleReportMissedSpam(msg, sendResponse) {
    const fallbackText = typeof (msg && msg.selectionText) === "string"
      ? msg.selectionText.trim()
      : "";
    let liveText = "";
    let anchor = null;
    try {
      const sel = window.getSelection();
      if (sel) {
        liveText = (sel.toString() || "").trim();
        anchor = sel.anchorNode || null;
      }
    } catch (_) {
      liveText = "";
      anchor = null;
    }
    const selectedText = liveText || fallbackText;
    if (!selectedText) {
      showReportToast(SS_t("reportFailed"), true);
      sendResponse({ ok: false, reason: "no-selection" });
      return;
    }
    if (anchor && isEditableSelectionNode(anchor)) {
      showReportToast(SS_t("reportFailed"), true);
      sendResponse({ ok: false, reason: "editable" });
      return;
    }
    let sourceText = selectedText;
    if (anchor) {
      try {
        const container = SS_findPostContainer(anchor, CONFIG, POST_SELECTORS);
        if (container) {
          const containerText = (container.textContent || "").trim();
          if (containerText) sourceText = containerText;
        }
      } catch (_) {
        /* Fall through with the selected text. */
      }
    }
    const excerpt = sourceText.slice(0, REPORT_EXCERPT_MAX);
    if (!excerpt) {
      showReportToast(SS_t("reportFailed"), true);
      sendResponse({ ok: false, reason: "no-selection" });
      return;
    }
    const payload = buildReportPayload(excerpt, extractTrigger(excerpt), "none");
    copyReportPayload(payload).then((copied) => {
      openReportTab().then((destinationOk) => {
        if (destinationOk) {
          sendResponse({ ok: true, copied: !!copied });
          return;
        }
        showReportToast(SS_t("reportFailed"), true);
        sendResponse({ ok: false, reason: "no-destination" });
      });
    });
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
    /* Same parent-post fallback as blockPost (plan 059): a comment
       element has no data-id, so its cooldown rides on the parent post. */
    const postKey = getPostKey(post);
    if (postKey) cooldownStore.set(postKey);
    post.style.display = "";
    const ph = post.nextElementSibling;
    if (ph && ph.dataset && ph.dataset.ssPh) ph.remove();

    /* Restored posts are no longer "blocked"; pruning keeps whitelist
       restores and bulk restore from re-processing them. */
    blockedPosts.delete(post);
    labelBlockedPosts.delete(post);

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

  function pruneSet(set, maxSize) {
    while (set.size > maxSize) {
      const first = set.values().next().value;
      set.delete(first);
    }
  }
})();
