(function (root) {
  "use strict";

  /* Post-container detection heuristics, extracted verbatim from
     content.js (plan: unit-test container detection with jsdom). The
     bodies below are byte-identical to what content.js used before this
     file existed — only `document.body` became `doc.body` (doc derived
     from the caller or globalThis.document), module constants became
     `config.*`, and POST_SELECTORS became a parameter — so this is a
     code move, not a detection-behavior change.

     `doc` is the document the textNode lives in. Callers pass
     doc explicitly when running outside the browser (jsdom tests); the
     browser content script relies on the globalThis.document default. */

  /* ── Strategy 1: sibling-content heuristic (zero selectors) ──── */

  /**
   * Thresholds controlling the sibling-content heuristic.
   * @typedef {Object} PostContainerConfig
   * @property {number} DEPTH_LIMIT Max ancestors walked.
   * @property {number} SIBLING_CONTENT_THRESHOLD Chars a sibling needs to count as heavy.
   * @property {number} SIBLING_COUNT_THRESHOLD Heavy siblings needed to accept a level.
   * @property {number} FEED_SIBLING_FALLBACK Sibling count triggering the fallback accept.
   * @property {number} MIN_TEXT_LENGTH Chars needed for the fallback accept.
   * @property {number} CONTENT_LENGTH_THRESHOLD Chars at depth >= 4 that accept a container.
   */

  /**
   * Walks up from the text node looking for a container whose siblings are
   * individually heavy — the shape of a LinkedIn feed post.
   * @param {Node} textNode Text node inside the candidate post.
   * @param {PostContainerConfig} config Threshold values.
   * @param {Document} [doc] Document the textNode lives in.
   * @returns {Element | null}
   */
  function findBySiblingHeuristic(textNode, config, doc) {
    doc = doc || globalThis.document;
    let el = textNode.parentElement;
    let depth = 0;

    while (el && el !== doc.body && depth < config.DEPTH_LIMIT) {
      depth++;
      const parent = el.parentElement;
      if (!parent || parent === doc.body) break;

      const siblings = parent.children;
      let heavySiblings = 0;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] === el) continue;
        if (
          siblings[i].textContent.trim().length >
          config.SIBLING_CONTENT_THRESHOLD
        )
          heavySiblings++;
      }

      if (heavySiblings >= config.SIBLING_COUNT_THRESHOLD) {
        const gp = parent.parentElement;
        if (gp && gp !== doc.body) {
          let gpHeavy = 0;
          for (const child of gp.children) {
            if (child === parent) continue;
            if (
              child.textContent.trim().length >
              config.SIBLING_CONTENT_THRESHOLD
            )
              gpHeavy++;
          }
          if (gpHeavy >= config.SIBLING_COUNT_THRESHOLD) {
            el = parent;
            continue;
          }
        }
        return el;
      }

      if (siblings.length >= config.FEED_SIBLING_FALLBACK) {
        if (el.textContent.trim().length > config.MIN_TEXT_LENGTH) return el;
      }

      if (
        depth >= 4 &&
        el.textContent.trim().length > config.CONTENT_LENGTH_THRESHOLD
      )
        return el;

      el = parent;
    }

    return null;
  }

  /* ── Strategy 2: known attribute / tag selectors ──────────────── */

  /**
   * Walks up from the text node, returning the first ancestor matching any
   * of the known post selectors.
   * @param {Node} textNode Text node inside the candidate post.
   * @param {readonly string[]} postSelectors CSS selectors to test.
   * @param {Document} [doc] Document the textNode lives in.
   * @returns {Element | null}
   */
  function findByKnownSelectors(textNode, postSelectors, doc) {
    doc = doc || globalThis.document;
    let el = textNode.parentElement;
    while (el && el !== doc.body) {
      for (const sel of postSelectors) {
        if (el.matches?.(sel)) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  /* ── Strategy chain ───────────────────────────────────────────── */

  /**
   * Runs each detection strategy in order, returning the first Element
   * result (strategies that throw are skipped).
   * @param {Node} textNode Text node inside the candidate post.
   * @param {PostContainerConfig} config Threshold values.
   * @param {readonly string[]} postSelectors CSS selectors to test.
   * @param {Document} [doc] Document the textNode lives in.
   * @returns {Element | null}
   */
  function findPostContainer(textNode, config, postSelectors, doc) {
    doc = doc || globalThis.document;
    const strategies = [
      (node) => findBySiblingHeuristic(node, config, doc),
      (node) => findByKnownSelectors(node, postSelectors, doc),
    ];
    for (const strategy of strategies) {
      try {
        const result = strategy(textNode);
        if (
          result instanceof
          (doc && doc.defaultView
            ? doc.defaultView.Element
            : typeof Element !== "undefined"
              ? Element
              : Object)
        )
          return result;
      } catch (_) {
        /* skip failed strategy */
      }
    }
    return null;
  }

  root.SS_findBySiblingHeuristic = findBySiblingHeuristic;
  root.SS_findByKnownSelectors = findByKnownSelectors;
  root.SS_findPostContainer = findPostContainer;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      findBySiblingHeuristic,
      findByKnownSelectors,
      findPostContainer,
    };
  }
})(typeof self !== "undefined" ? self : globalThis);
