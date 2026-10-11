#!/usr/bin/env node

/* Plan 079 research prototype tests (NOT SHIPPED).
 *
 * Proves the two claims the plan rests on:
 *  1. plan-071's existing sanitization gate does NOT verify sanitization
 *     (the Step-0 gap, pinned here as a regression guard);
 *  2. sanitize.cjs both PRODUCES sanitised markup that satisfies protocol §2
 *     and VERIFIES it (§2.4), while preserving the DOM structure (§2.2) and
 *     the Suggested-label signal the 068 detector keys on.
 *
 * Every fixture value is invented. No real person, profile, post, URN or
 * media URL appears in this file.
 *
 * Run: node --test plans/research/079/sanitize.test.cjs
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const {
  PLACEHOLDER,
  sanitizeMarkup,
  structuralFingerprint,
  findLeaks,
  validateSanitizedCase,
  deriveSentinel,
  sanitizeUrl,
  sanitizeText,
  parseTag,
  tokenize,
} = require("./sanitize.cjs");

const detector = require("../068/detector.cjs");

const DIRTY = fs.readFileSync(path.join(__dirname, "dirty-sample.html"), "utf8");
const KEEP = ["Suggested"];
/* Repository root, three levels up from plans/research/079/. */
const root = path.join(__dirname, "..", "..", "..");

/* Raw (unsanitised) shapes with the plan-071 commit-time `data-case` research
   marker already present (protocol §2.3 exempts that marker from dropping).
   All values are invented. */
const RAW_POSITIVE =
  '<section data-case="suggested-01" data-id="urn:li:activity:7251234567890" class="feed-shared-update-v2">' +
  '<div class="feed-shared-actor">' +
  '<a class="feed-shared-actor__container-link" href="/in/jane-doe-9b3f?trk=feed">' +
  '<span class="feed-shared-actor__title">Jane Doe</span></a>' +
  '<span class="feed-shared-actor__sub-description">Suggested \u00b7 Northwind Analytics</span>' +
  "</div>" +
  '<p class="post-body">Excited to share that I have accepted a new role.</p>' +
  "</section>";

const RAW_NEGATIVE =
  '<section data-case="suggested-02" data-id="urn:li:activity:7251234567891" class="feed-shared-update-v2">' +
  '<div class="feed-shared-actor">' +
  '<a class="feed-shared-actor__container-link" href="/in/quiet-author/?trk=feed">' +
  '<span class="feed-shared-actor__title">Jane Roe</span></a>' +
  '<span class="feed-shared-actor__sub-description">Jane Roe</span>' +
  "</div>" +
  '<p class="post-body">A calm professional note about suggested reading lists and nothing else.</p>' +
  "</section>";

/** Independent structural signature computed with jsdom (not the module's). */
function jsdomFingerprint(html) {
  const dom = new JSDOM(`<body><div id="host">${html}</div></body>`);
  const host = dom.window.document.querySelector("#host");
  const parts = [];
  const walk = (node) => {
    for (const child of node.children) {
      const cls = child.getAttribute("class");
      const attrNames = Array.from(child.attributes || [])
        .map((a) => a.name)
        .filter((n) => n !== "id" && n !== "srcset" && n !== "data-urn")
        .sort()
        .join(",");
      parts.push(`${child.tagName.toLowerCase()}|${cls === null ? "" : cls}|${attrNames}`);
      walk(child);
    }
  };
  walk(host);
  return parts.join("\n");
}

/* ── Step 0: the gap this plan exists to close ─────────────────────────── */

test("step 0: the plan-071 sanitization gate accepts an unsanitised entry", () => {
  /* The exact content assertions from plans/research/071/probe-extensions.test.cjs
     "sanitization: only sentinel URNs, recorded provenance context". */
  const entry = {
    id: "gap-demo",
    sanitization: "Replaced all human text with inert placeholders.",
    sourceRef: "contributor capture, 2026-09, en UI locale; sanitized per protocol.md §2",
    markup: '<section data-id="urn:li:activity:7199"><span>Jane Doe</span></section>',
  };
  assert.equal(typeof entry.sanitization, "string");
  assert.ok(entry.sanitization.length > 0);
  assert.ok(/UI locale/.test(entry.sourceRef));
  for (const m of entry.markup.matchAll(/urn:li:activity:([A-Za-z0-9-]+)/g)) {
    assert.ok(/^71[A-Za-z0-9-]*$/.test(m[1]));
  }
  /* …and yet a real-shaped name is still present. */
  assert.ok(/Jane Doe/.test(entry.markup), "the gate passed a name through");
  assert.ok(
    findLeaks(entry.markup).some((l) => l.rule === "surviving-text"),
    "findLeaks must catch what the 071 gate misses"
  );
});

test("step 0: findLeaks rejects the dirty fixture on every PII-shaped class", () => {
  const rules = new Set(findLeaks(DIRTY, { keepLabels: KEEP }).map((l) => l.rule));
  for (const expected of [
    "non-sentinel-urn",
    "dropped-attr-survives",
    "url-query-or-fragment",
    "real-profile-slug",
    "surviving-attr-text",
    "surviving-text",
    "script-or-style",
    "html-comment",
  ]) {
    assert.ok(rules.has(expected), `expected rule "${expected}" in ${[...rules].join(", ")}`);
  }
});

/* ── sanitiser: output correctness ─────────────────────────────────────── */

test("sanitize: removes every PII-shaped item and reports zero leaks", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  assert.equal(res.error, undefined, `unexpected error: ${res.error}`);
  assert.deepEqual(findLeaks(res.markup, { keepLabels: KEEP }), []);

  assert.ok(!/Jane Doe/.test(res.markup), "name removed");
  assert.ok(!/accepted a new role/.test(res.markup), "post body removed");
  assert.ok(!/\sid="/.test(res.markup), "global id attribute removed");
  assert.ok(!/jane-doe-9b3f/.test(res.markup), "profile slug removed");
  assert.ok(!/trk=/.test(res.markup), "tracking param removed");
  assert.ok(!/srcset=/.test(res.markup), "srcset removed");
  assert.ok(!/2025 summit/.test(res.markup), "alt text removed");
  assert.ok(!/northwind\.example/.test(res.markup), "script content removed");
});

test("sanitize: preserves the declared structural label and separators", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  assert.ok(/<span class="feed-shared-actor__sub-description">Suggested<\/span>/.test(res.markup));

  /* A combined label must keep the label and the "·" separator (the exact
     grammar SS_matchesLabel accepts) while placeholdering the sponsor name. */
  const combined = sanitizeText("Suggested \u00b7 Acme Corp", KEEP);
  assert.equal(combined.text, `Suggested \u00b7 ${PLACEHOLDER}`);

  /* Without the label declared, the same text is placeholdered but the
     separator glyph survives: §2.1 lists human text (names, bodies, counts,
     timestamps) as the replacement target, and "·" is none of those. */
  assert.equal(sanitizeText("Suggested \u00b7 Acme Corp", []).text, `Placeholder \u00b7 ${PLACEHOLDER}`);
});

test("sanitize: sentinelises urn:li while preserving the entity kind", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  /* data-id is the value POST_SELECTORS keys on: the sentinel must keep the
     activity kind so the selector still matches. */
  assert.match(res.markup, /data-id="urn:li:activity:712d"/);

  /* A company urn must NOT be rewritten to an activity urn: doing so would
     fabricate a POST_SELECTORS match the capture never had. */
  const other = sanitizeMarkup('<div data-id="urn:li:company:987654321"></div>', { caseId: "c" });
  assert.match(other.markup, /urn:li:company:71/);
  assert.ok(!/urn:li:activity/.test(other.markup));
});

test("sanitize: sentinel is deterministic per case id and distinct across ids", () => {
  assert.equal(deriveSentinel("case-01"), deriveSentinel("case-01"));
  assert.notEqual(deriveSentinel("case-01"), deriveSentinel("case-02"));
  assert.match(deriveSentinel("case-01"), /^71[A-Za-z0-9]{2}$/);
});

test("sanitize: drops script, style and comment nodes entirely", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  assert.ok(!/<script/i.test(res.markup));
  assert.ok(!/<style/i.test(res.markup));
  assert.ok(!/<!--/.test(res.markup));
});

/* ── protocol §2.2: structural preservation, enforced ──────────────────── */

test("§2.2: structural fingerprint is unchanged by sanitisation", () => {
  const before = structuralFingerprint(DIRTY);
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  const after = structuralFingerprint(res.markup);
  assert.equal(before.error, undefined);
  assert.equal(after.error, undefined);
  assert.equal(after.fingerprint, before.fingerprint);
});

test("§2.2: the module's fingerprint agrees with an independent jsdom walk", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  const viaJsdom = jsdomFingerprint(res.markup);
  const viaModule = structuralFingerprint(res.markup).fingerprint;
  /* Same element order, class values and surviving attribute names. The
     module also records depth, so compare the shared projection. */
  const project = (fp) =>
    fp
      .split("\n")
      .map((line) => line.split("|").slice(1).join("|"))
      .join("\n");
  assert.equal(project(viaModule), viaJsdom);
});

test("§2.2: class attributes and nesting survive verbatim", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  const before = new JSDOM(`<body>${DIRTY}</body>`).window.document;
  const after = new JSDOM(`<body>${res.markup}</body>`).window.document;
  const classes = (doc) =>
    Array.from(doc.querySelectorAll("*"))
      .map((el) => el.getAttribute("class"))
      .filter(Boolean)
      .join("|");
  assert.equal(classes(after), classes(before));
});

test("§2.2: the fingerprint guard holds across varied shapes", () => {
  /* The guard is unreachable by construction (sanitisation never alters tag
     names, class values or nesting), so the meaningful assertion is that
     every shape round-trips with an identical fingerprint and no error. */
  const shapes = [
    "<section data-id=\"urn:li:activity:1\" class=\"a\"><p>Jane</p></section>",
    "<div class=\"x\"><span class=\"y\">Suggested</span><br><img src=\"/a?b=1\" alt=\"Jane\"></div>",
    "<ul><li class=\"c\">one</li><li class=\"c\">two</li></ul>",
    "<section class=\"a\"><p>unclosed-but-parseable",
    "<p>Self closing <input value=\"Jane\"/> after</p>",
  ];
  for (const shape of shapes) {
    const before = structuralFingerprint(shape);
    const res = sanitizeMarkup(shape, { keepLabels: KEEP, caseId: "s" });
    assert.equal(res.error, undefined, `${shape}: ${res.error}`);
    assert.equal(structuralFingerprint(res.markup).fingerprint, before.fingerprint, shape);
  }
});

test("fail-closed: unterminated constructs are rejected with no output", () => {
  for (const bad of [
    '<p class="unterminated>Jane Doe</p>',
    "<!-- unterminated comment",
    "<p>stray < bracket</p>",
  ]) {
    const tok = tokenize(bad);
    const res = sanitizeMarkup(bad, {});
    const failed = tok.error || res.error;
    assert.ok(failed, `expected a fail-closed error for: ${bad}`);
    assert.equal(res.markup, undefined, "no partial output on failure");
  }
});

test("fail-closed: malformed tag syntax is rejected, never partially rewritten", () => {
  assert.equal(parseTag("<p class=\"unterminated>"), null);
  const res = sanitizeMarkup('<p class="unterminated>Jane Doe</p>', {});
  assert.ok(res.error, "expected rejection rather than silent rewrite");
});

/* ── protocol §2.4: verifier rules, one per class ──────────────────────── */

test("findLeaks: flags each PII class on a minimal crafted input", () => {
  const cases = [
    ["surviving-text", '<p>Jane</p>', []],
    ["surviving-attr-text", '<img alt="Jane Doe">', []],
    ["dropped-attr-survives", '<p id="x">Placeholder</p>', []],
    ["script-or-style", "<script>1</script>", []],
    ["html-comment", "<!-- hi -->", []],
    ["non-sentinel-urn", '<div data-id="urn:li:activity:123"></div>', []],
    ["url-query-or-fragment", '<a href="/x?trk=y">Placeholder</a>', []],
    ["real-profile-slug", '<a href="/in/jane-doe">Placeholder</a>', []],
    ["email", "<p>jane@example.com</p>", []],
    ["long-digit-run", "<p>1204</p>", []],
  ];
  for (const [rule, markup, keep] of cases) {
    const found = findLeaks(markup, { keepLabels: keep }).map((l) => l.rule);
    assert.ok(found.includes(rule), `${rule}: got ${found.join(", ") || "(none)"}`);
  }
});

test("findLeaks: a fully sanitised capture is clean", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  assert.deepEqual(findLeaks(res.markup, { keepLabels: KEEP }), []);
});

test("sanitize is idempotent: re-sanitising emits no further changes", () => {
  const once = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  const twice = sanitizeMarkup(once.markup, { keepLabels: KEEP, caseId: "case-01" });
  assert.equal(twice.error, undefined);
  assert.equal(twice.markup, once.markup);
  assert.deepEqual(twice.changes, []);
});

/* ── integration: sanitisation must not destroy the signal ─────────────── */

test("integration: the 068 detector still targets the post after sanitisation", () => {
  const res = sanitizeMarkup(RAW_POSITIVE, { keepLabels: KEEP, caseId: "suggested-01" });
  assert.equal(res.error, undefined);
  assert.deepEqual(findLeaks(res.markup, { keepLabels: KEEP }), []);

  /* The sanitised markup must survive the real, unmodified 068 detector. */
  const dom = new JSDOM(`<main><div id="feed">${res.markup}</div></main>`);
  const doc = dom.window.document;
  const targets = detector.scanSuggested(doc.querySelector("#feed"));
  assert.equal(targets.length, 1, "detector must still find exactly one target");
  assert.equal(targets[0].getAttribute("class"), "feed-shared-update-v2");
  assert.match(targets[0].getAttribute("data-id"), /^urn:li:activity:71/);

  /* And a body-mention negative must still fail open after sanitisation. */
  const negative = sanitizeMarkup(RAW_NEGATIVE, { keepLabels: KEEP, caseId: "suggested-02" });
  assert.equal(negative.error, undefined);
  const dom2 = new JSDOM(`<main><div id="feed">${negative.markup}</div></main>`);
  assert.equal(detector.scanSuggested(dom2.window.document.querySelector("#feed")).length, 0);
});

/* ── end-to-end: the whole pipeline, against the UNMODIFIED 071 gate ───── */

test("end-to-end: a sanitised capture satisfies the existing plan-071 gate", () => {
  const { spawnSync } = require("node:child_process");
  const os = require("node:os");

  /* Mirror the repo layout at the same depth so the 068 detector's relative
     require("../../../shared/pattern-data.js") still resolves. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ss079-"));
  try {
    const rr = path.join(tmp, "plans", "research");
    fs.mkdirSync(path.join(rr, "068"), { recursive: true });
    fs.mkdirSync(path.join(rr, "071"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "shared"), { recursive: true });
    /* The 071 gate requires jsdom; symlink the repo's node_modules so module
       resolution succeeds from the temp mirror without installing anything. */
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"), "dir");
    fs.copyFileSync(path.join(root, "shared", "pattern-data.js"), path.join(tmp, "shared", "pattern-data.js"));
    fs.copyFileSync(path.join(__dirname, "..", "068", "detector.cjs"), path.join(rr, "068", "detector.cjs"));
    fs.copyFileSync(path.join(__dirname, "..", "068", "cases.json"), path.join(rr, "068", "cases.json"));
    /* The 071 gate itself — copied, never modified. */
    fs.copyFileSync(
      path.join(__dirname, "..", "071", "probe-extensions.test.cjs"),
      path.join(rr, "071", "probe-extensions.test.cjs")
    );

    const posRes = sanitizeMarkup(RAW_POSITIVE, { keepLabels: KEEP, caseId: "suggested-01" });
    const negRes = sanitizeMarkup(RAW_NEGATIVE, { keepLabels: KEEP, caseId: "suggested-02" });
    assert.equal(posRes.error, undefined);
    assert.equal(negRes.error, undefined);

    const entries = [
      {
        id: "suggested-01",
        purpose: "Positive control produced by the plan-079 pipeline.",
        markup: posRes.markup,
        scanRoot: "parent",
        expectedTarget: '[data-case="suggested-01"]',
        metadataLocale: "en",
        provenance: "user-contributed",
        validationStatus: "real-donated",
        sourceRef: "contributor capture, 2026-10, en UI locale; sanitized per protocol.md §2",
        sanitization: "All human text replaced with placeholders via sanitize.cjs; classes and nesting kept exactly.",
      },
      {
        id: "suggested-02",
        purpose: "Negative control: body mention must fail open.",
        markup: negRes.markup,
        scanRoot: "parent",
        expectedTarget: null,
        metadataLocale: "en",
        provenance: "user-contributed",
        validationStatus: "real-donated",
        sourceRef: "contributor capture, 2026-10, en UI locale; sanitized per protocol.md §2",
        sanitization: "All human text replaced with placeholders via sanitize.cjs; classes and nesting kept exactly.",
      },
    ];

    /* Admission must accept them, and the leak verifier must stay clean. */
    for (const e of entries) {
      const verdict = validateSanitizedCase(e, { keepLabels: KEEP });
      assert.equal(verdict.ok, true, `${e.id}: ${verdict.errors.join("; ")}`);
    }

    fs.writeFileSync(path.join(rr, "071", "cases-real.json"), JSON.stringify(entries, null, 2));
    /* Strip NODE_TEST_CONTEXT: an inherited test context makes the child
       runner suppress its own reporter output. */
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const run = spawnSync(
      "node",
      ["--test", "--test-reporter=tap", path.join(rr, "071", "probe-extensions.test.cjs")],
      { encoding: "utf8", env: childEnv, cwd: tmp }
    );
    assert.equal(run.status, 0, `071 gate failed on pipeline output:\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /# fail 0/, `unexpected 071 reporter output:\n${run.stdout}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("default-deny: an unknown attribute carrying text is placeholdered", () => {
  const raw =
    '<section class="feed-shared-update-v2" data-id="urn:li:activity:7251" ' +
    'data-owner-name="Jane Doe" data-team="Northwind Analytics" ' +
    'style="background-image:url(https://media.example/x.jpg)">' +
    '<p>Body</p></section>';
  const res = sanitizeMarkup(raw, { keepLabels: KEEP, caseId: "dd" });
  assert.equal(res.error, undefined);
  assert.deepEqual(findLeaks(res.markup, { keepLabels: KEEP }), []);

  assert.ok(!/Jane Doe/.test(res.markup), "unknown attribute value must not survive");
  assert.ok(!/Northwind/.test(res.markup), "unknown attribute value must not survive");
  assert.ok(!/style=/.test(res.markup), "style is dropped");
  assert.match(res.markup, /data-owner-name="Placeholder"/);

  /* The allowlisted structural attributes keep their values verbatim. */
  assert.match(res.markup, /class="feed-shared-update-v2"/);
  assert.match(res.markup, /data-id="urn:li:activity:71/);
});

test("default-deny: the verifier flags text in an unknown attribute", () => {
  const found = findLeaks('<div data-owner-name="Jane Doe"></div>', { keepLabels: KEEP });
  assert.ok(found.some((f) => f.rule === "surviving-attr-text"), JSON.stringify(found));
});

test("modern-React shape: structure and signal survive, PII does not", () => {
  const raw =
    '<div data-testid="mainFeed">' +
    '<div role="listitem" data-testid="feed-item" data-id="urn:li:activity:7299" class="scaffold">' +
    '<a class="update-components-actor__meta-link" href="/in/jane-doe-9b3f?trk=feed">' +
    '<span class="update-components-actor__title">Jane Doe</span></a>' +
    '<span class="update-components-actor__sub-description">Suggested \u00b7 Northwind Analytics</span>' +
    '<div data-testid="expandable-text-box">Excited to share a new role.</div>' +
    "</div></div>";

  const res = sanitizeMarkup(raw, { keepLabels: KEEP, caseId: "modern" });
  assert.equal(res.error, undefined);
  assert.deepEqual(findLeaks(res.markup, { keepLabels: KEEP }), []);

  /* Structural test hooks the manual-control path keys on must survive. */
  assert.match(res.markup, /data-testid="mainFeed"/);
  assert.match(res.markup, /data-testid="expandable-text-box"/);
  assert.match(res.markup, /role="listitem"/);
  assert.match(res.markup, /data-testid="feed-item"/);
  /* The label signal survives; the person and the sponsor do not. */
  assert.match(res.markup, /Suggested \u00b7 Placeholder/);
  assert.ok(!/Jane Doe/.test(res.markup));
  assert.ok(!/Northwind/.test(res.markup));
});

test("phrase labels: declared phrases are preserved verbatim, by design", () => {
  /* Real header metadata is often "Suggested for you · <Sponsor>" — a
     token-wise matcher would placeholder "for you" and destroy the exact
     string the detector keys on. */
  const combined = sanitizeText("Suggested for you \u00b7 Northwind Analytics", ["Suggested for you"]);
  assert.equal(combined.text, `Suggested for you \u00b7 ${PLACEHOLDER}`);

  /* Several declared phrases, each kept verbatim. */
  const multi = sanitizeText("Promoted \u00b7 Northwind", ["Promoted", "Northwind"]);
  assert.equal(multi.text, "Promoted \u00b7 Northwind");
  const bothKept = sanitizeText("Promoted \u00b7 Suggested", ["Promoted", "Suggested"]);
  assert.equal(bothKept.text, "Promoted \u00b7 Suggested");

  /* THE FOOTGUN, pinned: --label is a declaration of trust. Declaring a
     person's name makes the sanitiser preserve it AND makes the verifier
     accept it, because the verifier checks against the declared set. Only
     structural metadata may be declared. */
  const misuse = sanitizeText("Suggested \u00b7 Jane Doe", ["Suggested", "Jane Doe"]);
  assert.equal(misuse.text, "Suggested \u00b7 Jane Doe");

  /* Already clean text reports no change (idempotence depends on this). */
  assert.equal(sanitizeText("Suggested for you", ["Suggested for you"]).changed, false);
  assert.equal(sanitizeText("Suggested \u00b7 Placeholder", ["Suggested"]).changed, false);
});

test("phrase labels: the verifier accepts declared phrases and nothing else", () => {
  assert.deepEqual(findLeaks(`<p>Suggested for you \u00b7 ${PLACEHOLDER}</p>`, { keepLabels: ["Suggested for you"] }), []);
  /* The same text without the phrase declared is a leak. */
  const leaked = findLeaks(`<p>Suggested for you \u00b7 ${PLACEHOLDER}</p>`, { keepLabels: ["Suggested"] });
  assert.ok(leaked.some((f) => f.rule === "surviving-text" && f.detail === "for"), JSON.stringify(leaked));
});

test("CLI: declared labels are echoed so the declaration is auditable", () => {
  const { spawnSync } = require("node:child_process");
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ss079lbl-"));
  try {
    const file = path.join(tmp, "c.html");
    fs.writeFileSync(
      file,
      '<section data-id="urn:li:activity:7251" class="feed-shared-update-v2">' +
        '<span class="feed-shared-actor__sub-description">Suggested for you</span></section>'
    );
    const run = spawnSync(
      "node",
      [path.join(__dirname, "sanitize.cjs"), "--sanitize", file, "--id", "lbl-01", "--label", "Suggested for you"],
      { encoding: "utf8" }
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stderr, /declared label phrases/i);
    assert.match(run.stderr, /Suggested for you/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("fail-closed: non-markup input is rejected with an actionable message", () => {
  const res = sanitizeMarkup("just some prose with no tags at all", {});
  assert.ok(res.error);
  assert.match(res.error, /no markup/);
  assert.equal(res.markup, undefined);
});

test("CLI: a JSON-quoted capture file is unwrapped automatically", () => {
  const { spawnSync } = require("node:child_process");
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ss079cli-"));
  try {
    const raw = '<section data-id="urn:li:activity:7251" class="feed-shared-update-v2">' +
      '<span class="feed-shared-actor__sub-description">Suggested for you</span>' +
      "<p>Body</p></section>";
    const file = path.join(tmp, "quoted.json");
    fs.writeFileSync(file, JSON.stringify(raw)); /* JSON-quoted, as some capture routes save it */

    const run = spawnSync("node", [path.join(__dirname, "sanitize.cjs"), "--sanitize", file, "--id", "cli-01", "--label", "Suggested for you", "--json"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stderr, /JSON-quoted/);
    const parsed = JSON.parse(run.stdout);
    assert.deepEqual(parsed.leaks, []);
    assert.match(parsed.markup, /Suggested for you/);
    assert.ok(!/Body/.test(parsed.markup));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* ── admission helper ─────────────────────────────────────────────────── */

test("validateSanitizedCase: accepts a sanitised, well-formed entry", () => {
  const res = sanitizeMarkup(DIRTY, { keepLabels: KEEP, caseId: "case-01" });
  const verdict = validateSanitizedCase(
    {
      id: "case-01",
      markup: res.markup,
      metadataLocale: "en",
      sourceRef: "contributor capture, 2026-09, en UI locale; sanitized per protocol.md §2",
      sanitization: "All human text replaced with inert placeholders; classes and nesting kept.",
    },
    { keepLabels: KEEP }
  );
  assert.equal(verdict.ok, true, verdict.errors.join("; "));
});

test("validateSanitizedCase: rejects leaks, missing fields and vague sanitization", () => {
  const good = {
    id: "x",
    markup: `<section data-id="urn:li:activity:7199"><span>${PLACEHOLDER}</span></section>`,
    metadataLocale: "en",
    sourceRef: "contributor capture, 2026-09, en UI locale; sanitized per protocol.md §2",
    sanitization: "Replaced all human text with placeholders.",
  };
  assert.equal(validateSanitizedCase(good).ok, true);

  assert.equal(validateSanitizedCase({ ...good, markup: "<p>Jane Doe</p>" }).ok, false);
  assert.equal(validateSanitizedCase({ ...good, sourceRef: "" }).ok, false);
  assert.equal(validateSanitizedCase({ ...good, metadataLocale: "" }).ok, false);
  assert.equal(validateSanitizedCase({ ...good, sanitization: "done" }).ok, false);
  assert.equal(validateSanitizedCase(null).ok, false);
});

/* ── live corpus gate (vacuous now, load-bearing on the first donation) ── */

test("071 corpus: every committed real entry passes the leak verifier", () => {
  const cases = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "071", "cases-real.json"), "utf8")
  );
  assert.ok(Array.isArray(cases));
  for (const c of cases) {
    const leaks = findLeaks(c.markup || "", { keepLabels: KEEP });
    assert.deepEqual(leaks, [], `${c.id}: ${JSON.stringify(leaks)}`);
  }
  /* Recorded so the vacuous state is visible rather than implied. */
  assert.ok(cases.length >= 0);
});

/* ── unit-level helpers ───────────────────────────────────────────────── */

test("sanitizeUrl: strips query/fragment, rewrites slugs, keeps relative paths", () => {
  assert.equal(sanitizeUrl("/in/jane-doe-9b3f?trk=x", "71").value, "/in/Placeholder");
  assert.equal(sanitizeUrl("https://media.example/x.jpg?a=1#f", "71").value, "https://media.example/x.jpg");
  assert.equal(sanitizeUrl("urn:li:activity:900", "71").value, "urn:li:activity:71");
  assert.equal(sanitizeUrl("#", "71").value, "#");
  assert.equal(sanitizeUrl("https://example.com/path", "71").value, "https://example.com/path");
});

test("tokenize: reports unterminated constructs instead of guessing", () => {
  assert.ok(tokenize("<!-- open").error);
  assert.ok(tokenize('<p class="x').error);
  assert.equal(tokenize("<p>ok</p>").error, undefined);
});
