/* Plan 069 research prototype — NOT shipped.
 *
 * Reversible hide-once state adapter for the design in ./design.md. Uses
 * the ACTUAL shared container helper (never copied detection code, never
 * a body-wide scan): resolution is resolveManualTarget(doc, anchorNode),
 * the 063 selection contract (content.js:1404 at a7f852a — live anchor,
 * editable rejection, SS_findPostContainer with the 059 comment
 * preference, visible no-op when unresolvable).
 *
 * It is deliberately NOT a drop-in copy of blockPost (content.js:790):
 * blockPost with a new reason would fall into the counting / lastBlocked
 * / suggestion / badge path (content.js:824-873). This adapter carries a
 * manual-only reason marker and provably never touches counters, badge,
 * suggestions, the undo list, or storage. Production placement is decided
 * in verdict.json; this file is evidence, not the implementation.
 *
 * UMD so the Chromium probe can inject it with a script tag (browser
 * global SS_ManualHide) while Node tests require() it.
 */

(function (root, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("../../../shared/post-container.js"));
  } else {
    root.SS_ManualHide = factory({ findPostContainer: root.SS_findPostContainer });
  }
})(typeof self !== "undefined" ? self : globalThis, function (deps) {
  "use strict";

  /* Mirrored with provenance (not imported — content.js keeps these as
     file-local consts):
     - CONFIG block, content.js:10-21 at a7f852a
     - POST_SELECTORS, content.js:34-38 at a7f852a
     Only the detection subset is mirrored; observer/cooldown-timing
     fields are omitted because the adapter never schedules scans. */
  const CONFIG = Object.freeze({
    MIN_TEXT_LENGTH: 30,
    SIBLING_CONTENT_THRESHOLD: 100,
    SIBLING_COUNT_THRESHOLD: 2,
    FEED_SIBLING_FALLBACK: 6,
    DEPTH_LIMIT: 20,
    CONTENT_LENGTH_THRESHOLD: 300,
  });

  const POST_SELECTORS = Object.freeze([
    '[data-id*="urn:li:activity:"]',
    ".feed-shared-update-v2",
    "article",
  ]);

  const COMMENT_SELECTORS = Object.freeze([".comment", ".comments-comment-item"]);

  const MANUAL_REASON = "manual-hide-once";

  function asElement(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  /* Mirrors content.js:isEditableSelectionNode (content.js:1382): text in
     form controls or active comment-draft boxes must never resolve. The
     attribute fallback exists only because jsdom does not implement
     HTMLElement.isContentEditable (it is undefined there); in a real
     browser the first branch decides, exactly like production. */
  function isEditableNode(node) {
    const el = asElement(node);
    if (!el || typeof el.closest !== "function") return false;
    if (el.closest("input, textarea, select")) return true;
    const editable = el.closest("[contenteditable]");
    if (!editable) return false;
    if (typeof editable.isContentEditable === "boolean") {
      return editable.isContentEditable;
    }
    const attr =
      typeof editable.getAttribute === "function"
        ? editable.getAttribute("contenteditable")
        : null;
    return attr !== null && String(attr).toLowerCase() !== "false";
  }

  /* 063 resolution, hide-side variant: the live anchor resolves through
     the shared helper; anything unresolvable (no anchor, detached node,
     editable control, unknown container) is null — the caller fails
     visibly with no mutation. There is deliberately no string fallback:
     the background's selectionText must never be used to hunt body text
     for a node to hide. */
  function resolveManualTarget(doc, anchorNode) {
    if (!doc || !anchorNode) return null;
    const el = asElement(anchorNode);
    if (!el) return null;
    if (typeof doc.contains !== "function" || !doc.contains(el)) return null;
    if (isEditableNode(anchorNode)) return null;
    try {
      return deps.findPostContainer(anchorNode, CONFIG, POST_SELECTORS, doc) || null;
    } catch (_) {
      return null;
    }
  }

  /* Same post-key fallback as production getPostKey (content.js:783): a
     comment element has no data-id, so Show protection rides on the
     parent post's key. */
  function getPostKey(el) {
    if (!el || typeof el.getAttribute !== "function") return null;
    const own = el.getAttribute("data-id");
    if (own) return own;
    const post =
      typeof el.closest === "function"
        ? el.closest('[data-id*="urn:li:activity:"]')
        : null;
    return post ? post.getAttribute("data-id") : null;
  }

  function isCommentTarget(target) {
    return (
      !!target &&
      typeof target.matches === "function" &&
      target.matches(COMMENT_SELECTORS.join(", "))
    );
  }

  function hasPlaceholder(target) {
    const sib = target && target.nextElementSibling;
    return !!(sib && sib.dataset && sib.dataset.ssPh);
  }

  /* Research state: element-identity keyed, ephemeral by construction
     (no serialization, no ids retained after the node is gone).
     counters/storageWrites/suggestions/undo/badgeCalls are spies the
     tests use to prove the manual path is side-effect free. */
  function createResearchState() {
    return {
      manuallyHidden: new Set(),
      forceShow: new WeakSet(),
      cooldown: new Set(),
      counters: {
        blockedCount: 0,
        patternCounts: {},
        suggestions: [],
        undo: [],
        badgeCalls: [],
      },
      storageWrites: [],
    };
  }

  function buildPlaceholder(doc, target) {
    const comment = isCommentTarget(target);
    const placeholder = doc.createElement("div");
    placeholder.dataset.ssPh = "1";
    placeholder.dataset.ssManual = MANUAL_REASON;
    const label = doc.createElement("span");
    /* Draft copy from design §5 (not shipped, no locale files touched). */
    label.textContent = comment
      ? "You hid this comment. It will reappear if the page reloads."
      : "You hid this post. It will reappear if the page reloads.";
    placeholder.appendChild(label);
    /* Safe-DOM pattern from content.js:1033-1043: textContent, listener,
       then appendChild. */
    const button = doc.createElement("button");
    button.textContent = "Show";
    button.addEventListener("click", () => {
      manualShow(doc, target, placeholder.__ssState);
    });
    placeholder.appendChild(button);
    return { placeholder, button, comment };
  }

  /* The explicit user action. Wins for this element only — even over
     forceShow/cooldown/allow state — while changing no rule, no counter,
     no list, and no storage. Duplicate or stale-DOM repeats are
     idempotent no-ops (never a second placeholder). */
  function manualHide(doc, target, state) {
    if (!target) return { ok: false, reason: "no-target" };
    if (!doc || typeof doc.contains !== "function" || !doc.contains(target)) {
      return { ok: false, reason: "detached" };
    }
    if (!target.parentNode) return { ok: false, reason: "detached" };
    if (hasPlaceholder(target) || target.style.display === "none") {
      return { ok: false, reason: "already-hidden" };
    }
    /* One-click exception, element-scoped: clear only this target's Show
       protection. Rule precedence for everything else is untouched. */
    state.forceShow.delete(target);
    const key = getPostKey(target);
    if (key) state.cooldown.delete(key);

    target.style.display = "none";
    state.manuallyHidden.add(target);

    const built = buildPlaceholder(doc, target);
    built.placeholder.__ssState = state;
    /* Production insertion idiom (content.js:1069): insert before the
       next sibling, never appendChild into the post. */
    target.parentNode.insertBefore(built.placeholder, target.nextSibling);

    /* No counters, no badge, no suggestions, no undo entry, no storage:
       the absence of those writes IS the assertion surface. */
    return { ok: true, reason: "hidden", comment: built.comment };
  }

  /* Adjacent Show: same protection semantics as restorePost
     (content.js:1487) — forceShow + cooldown so re-scans keep it shown —
     minus lastBlocked pruning (manual hides never enter the undo list). */
  function manualShow(doc, target, state) {
    if (!target || !state) return { ok: false, reason: "no-target" };
    state.forceShow.add(target);
    state.manuallyHidden.delete(target);
    const key = getPostKey(target);
    if (key) state.cooldown.add(key);
    target.style.display = "";
    const sib = target.nextElementSibling;
    if (sib && sib.dataset && sib.dataset.ssPh) sib.remove();
    return { ok: true, reason: "shown" };
  }

  /* Show-all / disable / snooze recovery for the manual set (production:
     restoreBlocked, content.js:1102). showAll keeps Show protection;
     snoozeOrDisable mirrors restoreBlocked exactly: restore WITHOUT
     forceShow, so the next automatic pass treats the node as visible —
     and, having no rule for it, leaves it visible. */
  function manualShowAll(doc, state) {
    let restored = 0;
    for (const target of Array.from(state.manuallyHidden)) {
      if (doc.contains(target)) {
        manualShow(doc, target, state);
        restored++;
      } else {
        state.manuallyHidden.delete(target);
      }
    }
    return { ok: true, reason: "shown-all", restored };
  }

  function snoozeOrDisable(doc, state) {
    let restored = 0;
    for (const target of Array.from(state.manuallyHidden)) {
      if (doc.contains(target)) {
        target.style.display = "";
        const sib = target.nextElementSibling;
        if (sib && sib.dataset && sib.dataset.ssPh) sib.remove();
        restored++;
      }
      state.manuallyHidden.delete(target);
    }
    return { ok: true, reason: "snoozed", restored };
  }

  /* Simulated automatic scan for the Show-protection proof. `flagged` is
     the set of elements the (simulated) automatic rules match; the guard
     order mirrors blockPost's (content.js:790-815): cooldown, processed-
     equivalent (already hidden), existing placeholder, forceShow, allow.
     Unlike the manual path it DOES count/persist/undo — that contrast is
     what the tests assert. It never hides; it only records what the
     automatic rules WOULD hide, so the proof cannot itself mutate DOM. */
  function autoRescan(doc, flagged, state) {
    const wouldHide = [];
    const skipped = [];
    for (const target of flagged) {
      if (!target || !doc.contains(target)) {
        skipped.push({ target, reason: "detached" });
        continue;
      }
      const key = getPostKey(target);
      if (key && state.cooldown.has(key)) {
        skipped.push({ target, reason: "cooldown" });
        continue;
      }
      if (state.forceShow.has(target)) {
        skipped.push({ target, reason: "force-show" });
        continue;
      }
      if (hasPlaceholder(target) || target.style.display === "none") {
        skipped.push({ target, reason: "already-hidden" });
        continue;
      }
      if (target.hasAttribute && target.hasAttribute("data-allowed")) {
        skipped.push({ target, reason: "allowed" });
        continue;
      }
      wouldHide.push(target);
    }
    /* Counting/persistence/undo happen here — the automatic path only.
       The manual path must leave every one of these at its prior value. */
    for (const target of wouldHide) {
      state.counters.blockedCount++;
      state.counters.patternCounts.auto =
        (state.counters.patternCounts.auto || 0) + 1;
      state.counters.undo.push({ id: getPostKey(target) || "uid:research" });
      state.counters.badgeCalls.push(String(state.counters.blockedCount));
      state.storageWrites.push({
        keys: ["ss_count", "ss_daily_counts", "ss_pattern_counts"],
      });
    }
    return { wouldHide, skipped };
  }

  return {
    CONFIG,
    POST_SELECTORS,
    COMMENT_SELECTORS,
    MANUAL_REASON,
    asElement,
    isEditableNode,
    resolveManualTarget,
    getPostKey,
    isCommentTarget,
    hasPlaceholder,
    createResearchState,
    manualHide,
    manualShow,
    manualShowAll,
    snoozeOrDisable,
    autoRescan,
  };
});
