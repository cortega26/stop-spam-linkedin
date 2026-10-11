#!/usr/bin/env node

/* Plan 079 research prototype — Suggested-capture sanitiser + leak verifier
 * (NOT SHIPPED).
 *
 * Why this exists: plans/research/071/protocol.md §2 requires a contributor to
 * hand-sanitise a copied post subtree before it may enter cases-real.json, and
 * §2.4 requires the contributor to "state the exact grep used" to prove no real
 * name, sentence, or URN remains. Two prior attempts (070/071) closed
 * insufficient-data with zero donated captures, and the plan-071 gate that
 * guards cases-real.json verifies only a provenance string, a URN prefix, and
 * that `sanitization` is non-empty — it does NOT verify that sanitisation
 * happened (see step0-gap-demo.cjs). Hand-sanitisation is therefore both the
 * bottleneck and an unverified privacy boundary. This module makes it
 * mechanical and checkable: it PRODUCES sanitised markup (§2.1–§2.3) and
 * VERIFIES the result (§2.4).
 *
 * Nothing here ships: plans/ is excluded from the packaged zip by
 * scripts/package-extension.js (fixed file list). This file modifies no
 * production file, and reads no file under plans/research/068 or /071.
 *
 * Design commitments
 * - Zero dependencies. A minimal quote-aware tokeniser, so untouched markup
 *   stays byte-identical and only surgical spans are rewritten.
 * - Fail closed, no override. Unparsable tag syntax, unparsable URL entities,
 *   or any structural change aborts with an error rather than emitting output
 *   that might still contain human text.
 * - Structural preservation is enforced, not promised (§2.2): element names,
 *   class values and nesting must be identical before and after, or nothing is
 *   emitted.
 * - Text survives only as an approved vocabulary: the placeholder token, the
 *   caller-declared structural label, and punctuation-only tokens. Every other
 *   alphanumeric run becomes the placeholder.
 *
 * Usage
 *   node sanitize.cjs --sanitize capture.html --id case-01 --label Suggested \
 *        [--locale en] [--out case-01.html] [--json]
 *   node sanitize.cjs --leaks cases-real.json      # re-verify committed corpus
 *   node sanitize.cjs --self-test                  # round-trip on the dirty sample
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PLACEHOLDER = "Placeholder";

/* Sentinel base for urn:li payloads (protocol §2.3, "urn:li:activity:71XX"). */
const SENTINEL_BASE = "71";

/* Attributes dropped wholesale: DOM-global ids, subresource integrity and
 * CORS hints (no selector value), and anything that reconstructs a real
 * identity or impression trail. Event-handler attributes are dropped too —
 * they are code, never post structure. */
const DROP_ATTR_EXACT = Object.freeze([
  "id",
  "nonce",
  "integrity",
  "crossorigin",
  "referrerpolicy",
  "srcset",
  "imagesrcset",
  "data-urn",
  "ping",
  /* Presentation only, and a plausible carrier for remote URLs via url(...). */
  "style",
]);
const DROP_ATTR_PATTERNS = Object.freeze([
  /^on[a-z]+$/i,
  /^data-(trk|tracking|impression|analytics)/i,
  /^data-.*-(ref|tracking|id)$/i,
]);

/* Attributes carrying a URL: query/fragment stripped, slug rewritten,
 * urn:li payload sentinelised. */
const URL_ATTRS = Object.freeze(["href", "src", "poster", "action", "formaction", "data-src"]);

/* Attributes carrying human-readable text: value replaced by the placeholder. */
const TEXT_ATTRS = Object.freeze([
  "alt",
  "title",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "placeholder",
  "label",
  "value",
  "content",
]);

/* Default-deny allowlist: the ONLY attribute names whose values may survive
 * verbatim. Everything else is treated as untrusted text and placeholdered.
 * Rationale: a value-allowlist is the difference between "we think these
 * attributes are safe" and "no attribute keeps a value we did not sanction".
 * An unknown attribute that turned out to be load-bearing fails visibly in the
 * detector outcome rather than silently leaking; a maintainer extends this list
 * in one place when a real capture demands it. */
const STRUCTURAL_ATTRS = Object.freeze([
  "class",
  "data-id",
  "data-testid",
  "data-case",
  "role",
  "dir",
  "lang",
  "rel",
  "target",
  "type",
  "name",
  "scope",
  "tabindex",
  "colspan",
  "rowspan",
  "span",
  "width",
  "height",
  "viewbox",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "fill-rule",
  "clip-rule",
  "xmlns",
  "preserveaspectratio",
  "focusable",
  "disabled",
  "checked",
  "hidden",
  "multiple",
  "selected",
  "readonly",
  "required",
  "open",
  "aria-hidden",
  "aria-expanded",
  "aria-haspopup",
  "aria-selected",
  "aria-current",
  "aria-disabled",
  "aria-level",
  "aria-posinset",
  "aria-setsize",
  "aria-multiselectable",
  "aria-orientation",
  "aria-sort",
  "aria-atomic",
  "aria-busy",
  "aria-checked",
  "aria-modal",
  "aria-live",
  "aria-relevant",
]);

/* Subtree dropped entirely: never post structure, high exfiltration surface. */
const DROP_SUBTREE_TAGS = Object.freeze(["script", "style"]);

/* HTML void elements never nest, so they must not advance depth in the
   structural fingerprint. */
const VOID_TAGS = Object.freeze([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** True when a tag nests children. */
function nests(tag) {
  return !tag.selfClosing && !VOID_TAGS.includes(tag.name.toLowerCase());
}

/* Entity kinds whose urn:li payloads are sentinelised. The KIND is preserved
 * (see the deviation note in design.md): collapsing every kind to "activity"
 * would make urn:li:company:* values match POST_SELECTORS
 * ('[data-id*="urn:li:activity:"]') and fabricate a positive that the real
 * capture did not contain. */
const URN_RE = /^urn:li:([a-z]+):(.+)$/i;

const ALNUM_RE = /[\p{L}\p{N}]/u;

/* ── tokeniser ─────────────────────────────────────────────────────────── */

/** Finds the index of the tag-terminating ">", skipping quoted spans. */
function findTagEnd(html, start) {
  let quote = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

/** True when a "<"-prefixed span opens a markup tag rather than literal text. */
function looksLikeTag(raw) {
  return /^<(?:\/|[a-zA-Z]|!\[CDATA\[|!)/.test(raw);
}

/**
 * Splits markup into text / tag / comment / declaration tokens.
 * @param {string} html
 * @returns {{tokens: object[]}|{error: string}}
 */
function tokenize(html) {
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      tokens.push({ type: "text", raw: html.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ type: "text", raw: html.slice(i, lt) });
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) return { error: "unterminated HTML comment" };
      tokens.push({ type: "comment", raw: html.slice(lt, end + 3) });
      i = end + 3;
      continue;
    }
    const end = findTagEnd(html, lt);
    if (end === -1) return { error: "unterminated tag (no closing '>')" };
    const raw = html.slice(lt, end + 1);
    tokens.push({ type: looksLikeTag(raw) ? "tag" : "text", raw });
    i = end + 1;
  }
  return { tokens };
}

/* ── attribute parsing / rendering ─────────────────────────────────────── */

/**
 * Parses the attribute span of a tag. Returns null on any syntax the module
 * does not fully understand, which the caller treats as fail-closed.
 * @param {string} rest
 */
function parseAttrs(rest) {
  const attrs = [];
  const n = rest.length;
  let i = 0;
  while (i < n) {
    while (i < n && /\s/.test(rest[i])) i++;
    if (i >= n) break;
    if (rest[i] === "/") {
      i++;
      continue;
    }
    const nameStart = i;
    while (i < n && !/[\s=/]/.test(rest[i])) i++;
    const name = rest.slice(nameStart, i);
    if (name === "" || /["'<>`]/.test(name)) return null;
    while (i < n && /\s/.test(rest[i])) i++;
    if (rest[i] !== "=") {
      attrs.push({ name, hasValue: false, value: null, quote: '"' });
      continue;
    }
    i++;
    while (i < n && /\s/.test(rest[i])) i++;
    if (i >= n) return null;
    const quote = rest[i];
    let value;
    if (quote === '"' || quote === "'") {
      const end = rest.indexOf(quote, i + 1);
      if (end === -1) return null; /* unterminated quoted value */
      value = rest.slice(i + 1, end);
      i = end + 1;
    } else {
      const valStart = i;
      while (i < n && !/\s/.test(rest[i])) i++;
      value = rest.slice(valStart, i);
      if (/[<>"'`=]/.test(value)) return null;
    }
    attrs.push({ name, hasValue: true, value, quote: quote === "'" ? "'" : '"' });
  }
  return attrs;
}

/**
 * Parses one tag token. Returns null when the syntax is not understood, which
 * the caller treats as fail-closed.
 * @param {string} raw
 */
function parseTag(raw) {
  if (/^<!/.test(raw)) {
    return { name: raw, declaration: true, closing: false, selfClosing: false, attrs: [] };
  }
  if (raw[0] !== "<" || raw[raw.length - 1] !== ">") return null;
  let inner = raw.slice(1, -1);
  let closing = false;
  if (inner[0] === "/") {
    closing = true;
    inner = inner.slice(1);
  }
  const m = /^([a-zA-Z][\w:.-]*)/.exec(inner);
  if (!m) return null;
  const name = m[1];
  let rest = inner.slice(name.length).replace(/\s+$/, "");
  let selfClosing = false;
  if (rest.endsWith("/")) {
    selfClosing = true;
    rest = rest.slice(0, -1);
  }
  if (closing) return rest.trim() === "" ? { name, declaration: false, closing, selfClosing, attrs: [] } : null;
  const attrs = parseAttrs(rest);
  if (attrs === null) return null;
  return { name, declaration: false, closing, selfClosing, attrs };
}

function renderTag(tag) {
  if (tag.declaration) return tag.name.endsWith(">") ? tag.name : tag.name + ">";
  if (tag.closing) return `</${tag.name}>`;
  const parts = tag.attrs.map((a) =>
    a.hasValue ? `${a.name}="${a.value}"` : a.name
  );
  const body = parts.length ? " " + parts.join(" ") : "";
  return `<${tag.name}${body}${tag.selfClosing ? " /" : ""}>`;
}

/* ── value sanitisers ──────────────────────────────────────────────────── */

function isDroppedAttr(name) {
  const lower = name.toLowerCase();
  if (DROP_ATTR_EXACT.includes(lower)) return true;
  return DROP_ATTR_PATTERNS.some((re) => re.test(lower));
}

/**
 * Sentinelises a urn:li payload while preserving the entity kind.
 * @param {string} value
 * @param {string} sentinel two-character sentinel suffix.
 */
function sentinelizeUrn(value, sentinel) {
  const m = URN_RE.exec(value.trim());
  if (!m) return null;
  const alreadySentinel = m[2].startsWith(sentinel);
  const tail = alreadySentinel ? m[2] : sentinel;
  return `urn:li:${m[1]}:${tail}`;
}

/**
 * Sanitises one URL-valued attribute: strips query and fragment, sentinelises
 * urn:li payloads, and placeholders profile / company / school / showcase slugs.
 */
function sanitizeUrl(value, sentinel) {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return { value: trimmed, changed: false };

  const urn = sentinelizeUrn(trimmed, sentinel);
  if (urn) return { value: urn, changed: urn !== trimmed };

  const hashIdx = trimmed.indexOf("#");
  const queryIdx = trimmed.indexOf("?");
  let cut = trimmed.length;
  if (hashIdx !== -1) cut = Math.min(cut, hashIdx);
  if (queryIdx !== -1) cut = Math.min(cut, queryIdx);
  let base = trimmed.slice(0, cut);

  const slug = /(^|\/)(in|company|school|showcase|groups)\/([^/?#]+)/i.exec(base);
  if (slug) {
    base = base.replace(slug[0], `${slug[1]}${slug[2]}/${PLACEHOLDER}`);
  }
  return { value: base, changed: base !== trimmed };
}

/**
 * Replaces human text with the placeholder while preserving:
 *  - any declared label PHRASE verbatim, anywhere in the text,
 *  - punctuation-only tokens (separators such as "·", "|", "-"), and
 *  - leading / trailing whitespace.
 * Runs of placeholders collapse to one token.
 *
 * Phrase-level (not token-level) matching matters: real header metadata is
 * often "Suggested for you · <Sponsor>" or "Promoted · <Advertiser>". A
 * token-wise matcher would placeholder "for you" and destroy the exact label
 * string the detector keys on.
 * @param {string} raw
 * @param {string[]} keepLabels Declared label phrases.
 */
function sanitizeText(raw, keepLabels) {
  const trimmed = raw.trim();
  if (trimmed === "") return { text: raw, changed: false };
  if (trimmed === PLACEHOLDER) return { text: raw, changed: false };

  const phrases = (keepLabels || [])
    .filter((l) => typeof l === "string" && l.trim() !== "")
    .map((l) => l.trim())
    .sort((a, b) => b.length - a.length);

  const out = [];
  let changed = false;
  let buffer = "";

  /* Emit the buffered non-label text as placeholder / separator tokens. */
  const flush = () => {
    if (buffer === "") return;
    for (const word of buffer.split(/\s+/)) {
      if (word === "") continue;
      /* The placeholder is itself sanctioned vocabulary, so an already
         sanitised run is kept without reporting a change. */
      if (word === PLACEHOLDER || !ALNUM_RE.test(word)) {
        out.push(word); /* punctuation-only token: a structural separator */
        continue;
      }
      out.push(PLACEHOLDER);
      changed = true;
    }
    buffer = "";
  };

  let i = 0;
  while (i < trimmed.length) {
    const phrase = phrases.find((p) => trimmed.startsWith(p, i));
    if (phrase) {
      flush();
      out.push(phrase); /* preserved verbatim */
      i += phrase.length;
    } else {
      buffer += trimmed[i];
      i += 1;
    }
  }
  flush();

  const collapsed = [];
  for (const token of out) {
    if (token === "") continue;
    if (token === PLACEHOLDER && collapsed.length > 0 && collapsed[collapsed.length - 1] === PLACEHOLDER) {
      continue;
    }
    collapsed.push(token);
  }

  const lead = raw.match(/^\s*/)[0];
  const trail = raw.match(/\s*$/)[0];
  return { text: lead + collapsed.join(" ") + trail, changed };
}

/**
 * Removes every sanctioned token (placeholder, declared label phrases,
 * urn sentinels) from a string. Any alphanumeric character left afterwards is
 * by definition unsanctioned — the verifier's core invariant.
 * @param {string} value
 * @param {string[]} keepLabels
 */
function stripSanctioned(value, keepLabels) {
  let residual = String(value).replace(/urn:li:[\w]+:[\w-]+/gi, " ");
  for (const phrase of keepLabels || []) {
    if (typeof phrase === "string" && phrase !== "") {
      residual = residual.split(phrase).join(" ");
    }
  }
  return residual.split(PLACEHOLDER).join(" ");
}

/* ── structural fingerprint (protocol §2.2 enforcement) ────────────────── */

/**
 * Canonical signature of the DOM shape a detector keys on: element names,
 * class values and nesting, in document order. Non-structural subtrees
 * (script/style) and dropped attribute names are excluded on both sides, so
 * the signature is comparable before and after sanitisation.
 * @param {string} html
 */
function structuralFingerprint(html) {
  const tok = tokenize(html);
  if (tok.error) return { error: tok.error };
  const parts = [];
  let depth = 0;
  let skipDepth = null;
  for (const t of tok.tokens) {
    if (t.type === "comment" || t.type === "text") continue;
    const tag = parseTag(t.raw);
    if (!tag) return { error: `unparsable tag: ${t.raw.slice(0, 60)}` };
    if (tag.declaration) continue;
    const lowered = tag.name.toLowerCase();
    if (skipDepth === null && DROP_SUBTREE_TAGS.includes(lowered) && !tag.closing && nests(tag)) {
      skipDepth = depth;
      depth++;
      continue;
    }
    if (skipDepth !== null) {
      if (tag.closing) depth--;
      else if (nests(tag)) depth++;
      if (depth <= skipDepth) skipDepth = null;
      continue;
    }
    if (tag.closing) {
      depth--;
      continue;
    }
    const classAttr = tag.attrs.find((a) => a.name.toLowerCase() === "class");
    const attrNames = tag.attrs
      .map((a) => a.name.toLowerCase())
      .filter((n) => !isDroppedAttr(n))
      .sort()
      .join(",");
    parts.push(`${depth}|${lowered}|${classAttr ? classAttr.value : ""}|${attrNames}`);
    if (nests(tag)) depth++;
  }
  return { fingerprint: parts.join("\n") };
}

/* ── sanitiser ─────────────────────────────────────────────────────────── */

/**
 * @param {string} html
 * @param {{keepLabels?: string[], caseId?: string, sentinel?: string}} [options]
 * @returns {{markup: string, changes: object[], error?: undefined}|{error: string}}
 */
function sanitizeMarkup(html, options) {
  const opts = options || {};
  const keepLabels = Array.isArray(opts.keepLabels) ? opts.keepLabels.filter(Boolean) : [];
  const sentinel = opts.sentinel || deriveSentinel(opts.caseId || "case");

  if (!String(html).includes("<")) {
    return {
      error:
        "fail-closed: input contains no markup. Expected the raw HTML of a post " +
        "container. If you saved a JSON-quoted string, pass the file as-is to the " +
        "CLI (it auto-unwraps) or unwrap it yourself first.",
    };
  }

  const tok = tokenize(html);
  if (tok.error) return { error: tok.error };

  const before = structuralFingerprint(html);
  if (before.error) return { error: before.error };

  const changes = [];
  const out = [];
  let skipDepth = 0;
  let depth = 0;
  let droppedSubtrees = 0;

  for (const t of tok.tokens) {
    if (t.type === "comment") {
      changes.push({ kind: "drop-comment", detail: t.raw.slice(0, 40) });
      continue;
    }
    if (t.type === "text") {
      if (skipDepth > 0) continue;
      const res = sanitizeText(t.raw, keepLabels);
      if (res.changed) changes.push({ kind: "placeholder-text", detail: PLACEHOLDER });
      out.push(res.text);
      continue;
    }
    const tag = parseTag(t.raw);
    if (!tag) return { error: `fail-closed: unparsable tag: ${t.raw.slice(0, 80)}` };
    const lowered = tag.name.toLowerCase();

    if (skipDepth > 0) {
      if (tag.closing) {
        depth--;
        if (depth < skipDepth) skipDepth = 0;
      } else if (nests(tag)) {
        depth++;
      }
      continue;
    }
    if (DROP_SUBTREE_TAGS.includes(lowered) && !tag.closing && nests(tag)) {
      skipDepth = depth + 1;
      depth++;
      droppedSubtrees++;
      changes.push({ kind: "drop-subtree", detail: `<${lowered}>` });
      continue;
    }
    if (tag.closing) {
      depth--;
      out.push(renderTag(tag));
      continue;
    }
    if (tag.declaration) {
      out.push(renderTag(tag));
      continue;
    }

    const kept = [];
    for (const a of tag.attrs) {
      const name = a.name.toLowerCase();
      if (isDroppedAttr(name)) {
        changes.push({ kind: "drop-attr", detail: `${lowered}[${name}]` });
        continue;
      }
      if (!a.hasValue) {
        kept.push(a);
        continue;
      }
      /* urn:li payloads are sentinelised wherever they appear (protocol §2.3),
         not only in URL attributes: data-id carries the activity urn that
         POST_SELECTORS ('[data-id*="urn:li:activity:"]') keys on. */
      if (URN_RE.test(a.value.trim())) {
        const urn = sentinelizeUrn(a.value, sentinel);
        if (urn) {
          if (urn !== a.value) changes.push({ kind: "sentinelize-urn", detail: `${lowered}[${name}]` });
          kept.push({ ...a, value: urn });
          continue;
        }
      }
      if (URL_ATTRS.includes(name)) {
        const res = sanitizeUrl(a.value, sentinel);
        if (res.changed) changes.push({ kind: "sanitize-url", detail: `${lowered}[${name}]` });
        kept.push({ ...a, value: res.value });
        continue;
      }
      if (STRUCTURAL_ATTRS.includes(name)) {
        kept.push(a);
        continue;
      }
      /* Default-deny: anything not allowlisted is untrusted text. */
      const res = sanitizeText(a.value, keepLabels);
      if (res.changed) {
        changes.push({
          kind: TEXT_ATTRS.includes(name) ? "placeholder-attr" : "placeholder-unknown-attr",
          detail: `${lowered}[${name}]`,
        });
      }
      kept.push({ ...a, value: res.text.trim() });
      continue;
    }
    out.push(renderTag({ ...tag, attrs: kept }));
    if (nests(tag)) depth++;
  }

  if (skipDepth > 0) return { error: "fail-closed: unterminated dropped subtree" };

  const markup = out.join("");
  const after = structuralFingerprint(markup);
  if (after.error) return { error: after.error };
  if (after.fingerprint !== before.fingerprint) {
    return {
      error:
        "fail-closed: sanitisation changed the DOM structure (protocol §2.2). " +
        "No output was emitted.",
    };
  }
  return { markup, changes, sentinel, droppedSubtrees };
}

/** Deterministic two-character sentinel, distinct per case (protocol §2.3). */
function deriveSentinel(caseId) {
  const hex = crypto.createHash("sha256").update(String(caseId)).digest("hex");
  return SENTINEL_BASE + hex.slice(0, 1) + hex.slice(1, 2).replace(/[^a-z0-9]/gi, "0");
}

/* ── leak verifier (protocol §2.4, mechanised) ─────────────────────────── */

/**
 * Verifies that sanitisation actually happened. Returns an array of findings;
 * an empty array is the pass condition. This is the machine form of the
 * "exact grep" §2.4 asks the contributor to state.
 * @param {string} markup
 * @param {{keepLabels?: string[]}} [options]
 * @returns {object[]}
 */
function findLeaks(markup, options) {
  const opts = options || {};
  const keepLabels = Array.isArray(opts.keepLabels) ? opts.keepLabels.filter(Boolean) : [];
  const findings = [];

  const tok = tokenize(markup);
  if (tok.error) return [{ rule: "unparsable", detail: tok.error }];

  /* Attribute-name and URL checks. */
  for (const t of tok.tokens) {
    if (t.type === "comment") {
      findings.push({ rule: "html-comment", detail: t.raw.slice(0, 40) });
      continue;
    }
    if (t.type !== "tag") continue;
    const tag = parseTag(t.raw);
    if (!tag) {
      findings.push({ rule: "unparsable-tag", detail: t.raw.slice(0, 60) });
      continue;
    }
    const lowered = tag.name.toLowerCase();
    if (DROP_SUBTREE_TAGS.includes(lowered)) {
      findings.push({ rule: "script-or-style", detail: `<${lowered}>` });
    }
    for (const a of tag.attrs) {
      const name = a.name.toLowerCase();
      if (isDroppedAttr(name)) {
        findings.push({ rule: "dropped-attr-survives", detail: `${lowered}[${name}]` });
        continue;
      }
      if (!a.hasValue) continue;
      /* Any urn:li payload in any attribute must be a sentinel (protocol §2.3). */
      const urnAny = URN_RE.exec(a.value.trim());
      if (urnAny && !urnAny[2].startsWith(SENTINEL_BASE)) {
        findings.push({ rule: "non-sentinel-urn", detail: `${lowered}[${name}]` });
      }
      if (URL_ATTRS.includes(name)) {
        if (/[?#&]/.test(a.value)) {
          findings.push({ rule: "url-query-or-fragment", detail: `${lowered}[${name}]=${a.value.slice(0, 60)}` });
        }
        const slug = /(^|\/)(in|company|school|showcase|groups)\/(?!Placeholder\b)[^/?#]+/i.exec(a.value);
        if (slug) {
          findings.push({ rule: "real-profile-slug", detail: `${lowered}[${name}]` });
        }
      }
      /* Default-deny: any attribute that is neither allowlisted-structural nor
         a URL must carry only sanctioned tokens. URL attributes get the
         query/slug/urn checks above instead (their paths are host + route
         evidence; see the documented limitation in design.md). */
      if (!STRUCTURAL_ATTRS.includes(name) && !URL_ATTRS.includes(name)) {
        if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(a.value)) {
          findings.push({ rule: "email", detail: `${lowered}[${name}]` });
        }
        const residual = stripSanctioned(a.value, keepLabels);
        const runs = residual.match(/[\p{L}\p{N}][\p{L}\p{N}._'-]*/gu) || [];
        for (const run of runs) {
          findings.push({ rule: "surviving-attr-text", detail: `${lowered}[${name}]:${run.slice(0, 40)}` });
        }
      }
    }
  }

  /* Text-node check: after sanctioned tokens are stripped, nothing may remain. */
  let depth = 0;
  let skipDepth = 0;
  for (const t of tok.tokens) {
    if (t.type === "tag") {
      const tag = parseTag(t.raw);
      if (!tag) continue;
      const lowered = tag.name.toLowerCase();
      if (skipDepth > 0) {
        if (tag.closing) { depth--; if (depth < skipDepth) skipDepth = 0; }
        else if (nests(tag)) depth++;
        continue;
      }
      if (DROP_SUBTREE_TAGS.includes(lowered) && !tag.closing && nests(tag)) {
        skipDepth = depth + 1; depth++; continue;
      }
      if (tag.closing) depth--;
      else if (nests(tag)) depth++;
      continue;
    }
    if (t.type !== "text" || skipDepth > 0) continue;
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t.raw)) {
      findings.push({ rule: "email", detail: "text node" });
    }
    /* After every sanctioned token is removed, any surviving alphanumeric run
       is unsanctioned by definition — stronger and simpler than checking a
       denylist of looks-like-a-name patterns. */
    const residual = stripSanctioned(t.raw, keepLabels);
    const runs = residual.match(/[\p{L}\p{N}][\p{L}\p{N}._'-]*/gu) || [];
    for (const run of runs) {
      findings.push({ rule: "surviving-text", detail: run.slice(0, 40) });
    }
    if (/\d{4,}/.test(residual)) {
      findings.push({ rule: "long-digit-run", detail: "text node" });
    }
  }

  /* Collapse duplicates so reports stay readable. */
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.rule}|${f.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * End-to-end admission check for one candidate entry: sanitisation verifies,
 * structure is intact, and the plan-071 schema-compatible minimal fields are
 * present. The full 10-key schema gate remains plan 071's
 * probe-extensions.test.cjs — this function does not replace it.
 */
function validateSanitizedCase(entry, options) {
  const opts = options || {};
  const errors = [];
  if (!entry || typeof entry !== "object") return { ok: false, errors: ["entry is not an object"] };
  for (const key of ["id", "markup", "sourceRef", "sanitization", "metadataLocale"]) {
    if (typeof entry[key] !== "string" || entry[key].trim() === "") {
      errors.push(`missing or empty required field: ${key}`);
    }
  }
  if (typeof entry.markup === "string") {
    const leaks = findLeaks(entry.markup, opts);
    for (const leak of leaks) errors.push(`leak [${leak.rule}] ${leak.detail}`);
  }
  if (typeof entry.sanitization === "string" && entry.sanitization.length > 0) {
    if (!/placeholder|sanitiz/i.test(entry.sanitization)) {
      errors.push("sanitization field does not describe a placeholder substitution");
    }
  }
  return { ok: errors.length === 0, errors };
}

/* ── CLI ───────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = { keepLabels: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sanitize") out.sanitize = argv[++i];
    else if (a === "--leaks") out.leaks = argv[++i];
    else if (a === "--id") out.caseId = argv[++i];
    else if (a === "--label") out.keepLabels.push(argv[++i]);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--self-test") out.selfTest = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (!a.startsWith("--")) out.positional = a;
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help || (!args.sanitize && !args.leaks && !args.selfTest)) {
    console.log(
      "usage: sanitize.cjs --sanitize <capture.html> --id <case-id> [--label Suggested]\n" +
      "                   [--out <file>] [--json]\n" +
      "       sanitize.cjs --leaks <cases-real.json>\n" +
      "       sanitize.cjs --self-test\n" +
      "\n" +
      "  --label  structural text to preserve (repeatable), e.g. Suggested\n" +
      "  --id     case id; also derives the deterministic urn sentinel\n" +
      "  --json   machine-readable output\n" +
      "  --out    write the sanitised markup to a file\n" +
      "\n" +
      "  metadataLocale is an entry field, not a markup field: set it in the\n" +
      "  cases-real.json entry, not here."
    );
    return args.help ? 0 : 2;
  }

  if (args.leaks) {
    const file = path.resolve(args.leaks);
    const entries = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(entries)) {
      console.error("expected a JSON array");
      return 1;
    }
    let failed = 0;
    for (const e of entries) {
      const leaks = findLeaks(e.markup || "", { keepLabels: args.keepLabels });
      if (leaks.length > 0) {
        failed++;
        console.error(`FAIL ${e.id}:`);
        for (const l of leaks) console.error(`  [${l.rule}] ${l.detail}`);
      } else {
        console.log(`ok   ${e.id}`);
      }
    }
    console.log(`\n${entries.length} entries checked, ${failed} with leaks`);
    return failed === 0 ? 0 : 1;
  }

  let sourceHtml;
  if (args.selfTest) {
    sourceHtml = fs.readFileSync(path.join(__dirname, "dirty-sample.html"), "utf8");
  } else {
    sourceHtml = fs.readFileSync(path.resolve(args.sanitize), "utf8");
    /* Tolerate a JSON-quoted string: some capture routes (and the DevTools MCP
       file output) save the markup JSON-encoded rather than as a raw file. */
    if (/^\s*"/.test(sourceHtml)) {
      try {
        const unwrapped = JSON.parse(sourceHtml);
        if (typeof unwrapped === "string") {
          console.error("note: input was JSON-quoted; unwrapped it automatically.");
          sourceHtml = unwrapped;
        }
      } catch (_) {
        /* fall through and let the sanitiser report the real problem */
      }
    }
  }

  const result = sanitizeMarkup(sourceHtml, {
    keepLabels: args.keepLabels,
    caseId: args.caseId || "case",
  });
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  if (args.keepLabels.length > 0) {
    console.error(
      "note: preserving these declared label phrases verbatim: " +
        args.keepLabels.map((l) => JSON.stringify(l)).join(", ")
    );
    console.error(
      "      Declare ONLY structural metadata (the Suggested label). Anything you declare here is"
    );
    console.error(
      "      kept and will NOT be flagged as a leak, so never declare a person's name or a post body."
    );
  }
  const leaks = findLeaks(result.markup, { keepLabels: args.keepLabels });

  if (args.json) {
    console.log(JSON.stringify({ markup: result.markup, changes: result.changes, sentinel: result.sentinel, leaks }, null, 2));
  } else {
    console.log(`sentinel: urn:li:<kind>:${result.sentinel}`);
    console.log(`changes: ${result.changes.length}`);
    for (const c of result.changes.slice(0, 40)) console.log(`  - ${c.kind} ${c.detail}`);
    console.log(`\nleak findings: ${leaks.length}`);
    for (const l of leaks) console.log(`  [${l.rule}] ${l.detail}`);
    console.log("\n--- sanitised markup ---");
    console.log(result.markup);
  }
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), result.markup);
    console.error(`written: ${path.resolve(args.out)}`);
  }
  return leaks.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  PLACEHOLDER,
  SENTINEL_BASE,
  DROP_ATTR_EXACT,
  DROP_SUBTREE_TAGS,
  URL_ATTRS,
  TEXT_ATTRS,
  STRUCTURAL_ATTRS,
  tokenize,
  parseTag,
  renderTag,
  sanitizeText,
  stripSanctioned,
  sanitizeUrl,
  sentinelizeUrn,
  sanitizeMarkup,
  structuralFingerprint,
  deriveSentinel,
  findLeaks,
  validateSanitizedCase,
};
