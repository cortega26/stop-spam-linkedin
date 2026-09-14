/* Plan 068 research prototype — Suggested-post label detector (NOT SHIPPED).
 *
 * Bounded spike evaluating an optional, off-by-default Suggested-post label
 * filter. This file never ships: it lives under plans/research/068/ and is
 * excluded from the packaged zip by design (scripts/package-extension.js
 * uses a fixed file list). It reads production helpers in place via
 * require() and never copies whole modules.
 *
 * Candidate boundary (see design.md): exactly one category, Suggested;
 * explicitly English-label-only. A label match counts only inside a
 * RECOGNIZED post-header metadata element. Body text, comments, nested
 * reposts, unknown layouts, and non-English labels fail open.
 *
 * Unlike content.js scanForLabeledPosts (which sweeps post descendants with
 * querySelectorAll("*")), this prototype NEVER does a broad descendant
 * sweep: it queries only the conservative header-metadata selectors below.
 */

(function (root, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("../../../shared/pattern-data.js"));
  } else {
    root.SS_SuggestedDetector = factory({ matchesLabel: root.SS_matchesLabel });
  }
})(typeof self !== "undefined" ? self : globalThis, function (deps) {
  "use strict";

  /* English-only candidate labels. No translations are guessed: any other
     metadata locale fails open (see non-english-label case). */
  const SUGGESTED_LABELS = Object.freeze(["Suggested"]);

  /* Post enumeration mirrors the production label pass
     (content.js AUTHOR_BLOCK_SELECTORS): the two post-specific selectors,
     deliberately not "article". */
  const POST_SELECTORS = Object.freeze([
    '[data-id*="urn:li:activity:"]',
    ".feed-shared-update-v2",
  ]);
  const POST_SELECTOR = POST_SELECTORS.join(", ");

  /* Conservative recognized structures: LinkedIn actor sub-description
     elements in the post header — the same actor class family production
     already trusts for author links (content.js AUTHOR_LINK_SELECTORS).
     Anything else (unknown layouts, body paragraphs) fails open. */
  const HEADER_META_SELECTORS = Object.freeze([
    ".feed-shared-actor__sub-description",
    ".update-components-actor__sub-description",
  ]);
  const HEADER_META_SELECTOR = HEADER_META_SELECTORS.join(", ");

  /* Ancestors that disqualify a label match: comments, comment lists,
     repost containers, and body text. A label inside any of these must not
     hide the surrounding post. */
  const EXCLUSION_ANCESTOR_SELECTOR =
    ".comment, .comments, .repost, .post-body";

  function defaultOpts(opts) {
    const o = opts || {};
    return {
      enabled: o.enabled !== false,
      snoozed: o.snoozed === true,
      labels: o.labels || SUGGESTED_LABELS,
      matchesLabel: o.matchesLabel || deps.matchesLabel,
    };
  }

  /* True when the label element sits inside excluded content (comment,
     repost, body) or inside a NESTED post container that is not the
     candidate post itself (reshared content's label is not the outer
     post's label). Walks up to — but not including — the candidate post. */
  function isExcluded(labelEl, post) {
    let node = labelEl.parentElement;
    while (node && node !== post) {
      if (node.matches) {
        if (node.matches(EXCLUSION_ANCESTOR_SELECTOR)) return true;
        if (node.matches(POST_SELECTOR)) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /* Returns the post element when its own header metadata carries a
     Suggested label, else null. Respects the disabled/snoozed state like
     the production label pass (content.js scanForLabeledPosts). */
  function findSuggestedLabelTarget(post, opts) {
    const o = defaultOpts(opts);
    if (!post || !post.querySelectorAll) return null;
    if (!o.enabled || o.snoozed) return null;
    const candidates = post.querySelectorAll(HEADER_META_SELECTOR);
    for (const el of candidates) {
      if (isExcluded(el, post)) continue;
      if (o.matchesLabel(el.textContent, o.labels)) return post;
    }
    return null;
  }

  /* Scans a root (feed container or mutation record target) for Suggested
     posts. When the root IS itself a post (mutation-root-is-post), it is
     included via root.matches — mirroring the production pass. Returns a
     deduped array of target post elements (duplicate visual + screen-reader
     labels yield one target). */
  function scanSuggested(root, opts) {
    const o = defaultOpts(opts);
    if (!root || !root.querySelectorAll) return [];
    if (!o.enabled || o.snoozed) return [];
    const seen = new Set();
    const posts = [];
    if (root.matches && root.matches(POST_SELECTOR) && !seen.has(root)) {
      seen.add(root);
      posts.push(root);
    }
    for (const post of root.querySelectorAll(POST_SELECTOR)) {
      if (seen.has(post)) continue;
      seen.add(post);
      posts.push(post);
    }
    const targets = [];
    for (const post of posts) {
      if (findSuggestedLabelTarget(post, o)) targets.push(post);
    }
    return targets;
  }

  /* PROPOSED state model (not production integration): how a future
     Suggested toggle would interact with restore/precedence, mirroring the
     existing cosmetic label semantics (content.js isLabelBlock):
     - Suggested hides are reversible placeholders, like Promoted/Featured.
     - They never increment spam counts or pattern-hit totals.
     - Toggling the category off restores ONLY Suggested hides.
     - Allow-phrase (never-hide) pardons never restore Suggested hides
       (matches the promoted-allow e2e: restoreAllowedPosts skips
       label-blocked posts).
     - Show restores a single post. */
  function createSuggestedHideModel() {
    const hidden = new Map(); /* postId -> { reason } */
    return {
      hide(postId, reason) {
        hidden.set(postId, { reason: reason || "spam" });
      },
      show(postId) {
        hidden.delete(postId);
      },
      setSuggestedToggle(on) {
        if (on) return [];
        const restored = [];
        for (const [id, info] of hidden) {
          if (info.reason === "suggested") {
            hidden.delete(id);
            restored.push(id);
          }
        }
        return restored;
      },
      applyAllowPardon(postId) {
        const info = hidden.get(postId);
        if (info && info.reason !== "suggested") hidden.delete(postId);
        return !hidden.has(postId);
      },
      isHidden(postId) {
        return hidden.has(postId);
      },
      hiddenIds() {
        return Array.from(hidden.keys());
      },
      spamCount() {
        let n = 0;
        for (const info of hidden.values()) {
          if (info.reason !== "suggested") n++;
        }
        return n;
      },
    };
  }

  return {
    SUGGESTED_LABELS,
    POST_SELECTORS,
    HEADER_META_SELECTORS,
    findSuggestedLabelTarget,
    scanSuggested,
    createSuggestedHideModel,
  };
});
