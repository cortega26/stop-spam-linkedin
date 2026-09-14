/* Plan 069 research assertions — NOT shipped. Runs with plain Node:
 *   node --test plans/research/069/prototype.test.cjs
 * Assertion style modeled on tests/unit/post-container.test.js. Fixture
 * shapes reuse that suite's proven post/comment/footer DOM so resolution
 * behavior is characterized, not assumed. Every cases.json row maps to at
 * least one test below (see the case id in each test name).
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const manual = require("./prototype.cjs");
const cases = require("./cases.json");

const LONG_BODY = "y".repeat(320); /* > CONTENT_LENGTH_THRESHOLD (300) */
const COMMENT_TEXT = "comment CLAUDE and I'll send you the framework";

function buildDoc() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><main><div id="feed"></div>' +
      "<footer><p>About this extension</p></footer></main></body></html>"
  );
  return dom.window.document;
}

function postSection(id, body) {
  return `<section data-id="urn:li:activity:${id}">
      <div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>
      <p class="post-body">${body}</p>
      <span>Promoted</span>
    </section>`;
}

/* Unit-suite shape (tests/unit/post-container.test.js:postWithComments):
 * single-shape comment; commentClass swaps ".comment" for LinkedIn's real
 * ".comments-comment-item" to prove both comment selectors. */
function postWithComments(id, body, commentTexts, commentClass) {
  const cls = commentClass || "comment";
  const comments = commentTexts
    .map((c) => `<div class="${cls}"><p class="comment-body">${c}</p></div>`)
    .join("\n");
  return `<section data-id="urn:li:activity:${id}">
      <div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>
      <p class="post-body">${body}</p>
      <div class="comments">
        <div class="comments-list">
          ${comments}
        </div>
      </div>
    </section>`;
}

function addDraftBox(doc) {
  doc.querySelector("main").insertAdjacentHTML(
    "beforeend",
    '<div id="draft" contenteditable="true"><p>draft reply <span id="draft-anchor">text</span></p></div>'
  );
}

function placeholderCount(doc) {
  return doc.querySelectorAll("[data-ss-ph]").length;
}

function snapshot(doc) {
  return doc.querySelector("#feed").innerHTML;
}

test("cases.json gate conformance (plan step 1)", () => {
  assert.ok(cases.length >= 8, `need >= 8 cases, have ${cases.length}`);
  for (const c of cases) {
    assert.ok(c.id, "case needs an id");
    assert.ok(c.expected, `case ${c.id} needs an expected outcome`);
  }
});

test("[visible-post-hide] selection resolves to the post; hide affects exactly that post", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML =
    postSection("1", LONG_BODY) + postSection("2", LONG_BODY);
  const state = manual.createResearchState();
  const sections = doc.querySelectorAll("section[data-id]");
  const anchor = sections[0].querySelector(".post-body").firstChild;

  const target = manual.resolveManualTarget(doc, anchor);
  assert.equal(target, sections[0]);

  const out = manual.manualHide(doc, target, state);
  assert.equal(out.ok, true);
  assert.equal(out.reason, "hidden");
  assert.equal(out.comment, false);
  assert.equal(sections[0].style.display, "none");
  /* Exact target only: sibling post untouched. */
  assert.notEqual(sections[1].style.display, "none");
  assert.equal(placeholderCount(doc), 1);
  /* One adjacent recoverable placeholder with the post copy + Show. */
  const ph = sections[0].nextElementSibling;
  assert.ok(ph && ph.dataset.ssPh === "1");
  assert.equal(ph.dataset.ssManual, manual.MANUAL_REASON);
  assert.match(ph.querySelector("span").textContent, /post/);
  assert.equal(ph.querySelector("button").textContent, "Show");
});

test("[visible-comment-hide] bait comment hides the comment, never the parent post", () => {
  for (const cls of ["comment", "comments-comment-item"]) {
    const doc = buildDoc();
    doc.querySelector("#feed").innerHTML = postWithComments("1", LONG_BODY, [COMMENT_TEXT], cls);
    const state = manual.createResearchState();
    const section = doc.querySelector("section");
    const comment = doc.querySelector(`.${cls}`);
    const anchor = doc.querySelector(".comment-body").firstChild;

    const target = manual.resolveManualTarget(doc, anchor);
    assert.equal(target, comment, `resolved comment for .${cls}`);

    const out = manual.manualHide(doc, target, state);
    assert.equal(out.ok, true);
    assert.equal(out.comment, true);
    assert.equal(comment.style.display, "none");
    assert.notEqual(section.style.display, "none");
    const afterSection = section.nextElementSibling;
    assert.ok(!afterSection || !afterSection.dataset.ssPh, "no placeholder after the parent post");
    const ph = comment.nextElementSibling;
    assert.ok(ph && ph.dataset.ssPh === "1");
    assert.match(ph.querySelector("span").textContent, /comment/);
    assert.equal(placeholderCount(doc), 1);
  }
});

test("[unknown-container-noop] footer text — even identical to post text — resolves to nothing", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  /* Same string as nothing in particular: proves there is no string
     fallback that would hunt body text for a node to hide. */
  doc.querySelector("footer p").textContent = LONG_BODY;
  const state = manual.createResearchState();
  const before = snapshot(doc);

  const target = manual.resolveManualTarget(
    doc,
    doc.querySelector("footer p").firstChild
  );
  assert.equal(target, null);
  const out = manual.manualHide(doc, target, state);
  assert.equal(out.ok, false);
  assert.equal(out.reason, "no-target");
  assert.equal(snapshot(doc), before);
  assert.equal(placeholderCount(doc), 0);
});

test("[no-selection-noop] null anchor resolves to nothing and hides nothing", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  const state = manual.createResearchState();
  const before = snapshot(doc);

  assert.equal(manual.resolveManualTarget(doc, null), null);
  assert.equal(manual.resolveManualTarget(doc, undefined), null);
  assert.deepEqual(manual.manualHide(doc, null, state), { ok: false, reason: "no-target" });
  assert.equal(snapshot(doc), before);
});

test("[editable-selection-noop] draft-box and form-control selections are rejected", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  addDraftBox(doc);
  doc.querySelector("main").insertAdjacentHTML(
    "beforeend",
    '<input id="q" type="text" value="query text">'
  );

  assert.equal(
    manual.resolveManualTarget(doc, doc.querySelector("#draft-anchor").firstChild),
    null,
    "contenteditable draft rejected"
  );
  assert.equal(manual.isEditableNode(doc.querySelector("#q")), true, "input rejected");
  assert.equal(
    manual.isEditableNode(doc.querySelector(".post-body").firstChild),
    false,
    "post body is not editable"
  );
  assert.equal(placeholderCount(doc), 0);
});

test("[allowed-text-override] explicit action hides an allowlisted post; auto rules still pardon it", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML =
    `<section data-id="urn:li:activity:9" data-allowed="good news">` +
    `<div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>` +
    `<p class="post-body">${LONG_BODY} good news</p><span>Promoted</span></section>`;
  const state = manual.createResearchState();
  const section = doc.querySelector("section");
  const anchor = section.querySelector(".post-body").firstChild;

  /* Automatic side still pardons: flagged but skipped for "allowed". */
  const scan = manual.autoRescan(doc, [section], state);
  assert.deepEqual(scan.wouldHide, []);
  assert.equal(scan.skipped[0].reason, "allowed");

  /* Explicit side wins for this element without touching any rule. */
  const target = manual.resolveManualTarget(doc, anchor);
  assert.equal(target, section);
  const out = manual.manualHide(doc, target, state);
  assert.equal(out.ok, true);
  assert.equal(out.reason, "hidden");
  assert.equal(section.style.display, "none");
  assert.ok(!section.hasAttribute("data-allowed") === false, "allow marker untouched");
});

test("[duplicate-action-idempotent] repeat hide adds no second placeholder", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  const state = manual.createResearchState();
  const section = doc.querySelector("section");

  assert.equal(manual.manualHide(doc, section, state).ok, true);
  const dup = manual.manualHide(doc, section, state);
  assert.equal(dup.ok, false);
  assert.equal(dup.reason, "already-hidden");
  assert.equal(placeholderCount(doc), 1);
});

test("[duplicate-action-idempotent] stale-DOM auto-hidden target keeps its attribution", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  const state = manual.createResearchState();
  const section = doc.querySelector("section");
  /* Simulate a production automatic block reached through stale DOM. */
  section.style.display = "none";
  const spamPh = doc.createElement("div");
  spamPh.dataset.ssPh = "1";
  const spamLabel = doc.createElement("span");
  spamLabel.textContent = "Spam placeholder";
  spamPh.appendChild(spamLabel);
  section.parentNode.insertBefore(spamPh, section.nextSibling);

  const out = manual.manualHide(doc, section, state);
  assert.equal(out.ok, false);
  assert.equal(out.reason, "already-hidden");
  assert.equal(placeholderCount(doc), 1);
  assert.equal(section.nextElementSibling.querySelector("span").textContent, "Spam placeholder");
  assert.equal(state.manuallyHidden.size, 0);
});

test("manual hides count nothing, persist nothing, suggest nothing, queue no undo", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML =
    postSection("1", LONG_BODY) +
    postWithComments("2", LONG_BODY, [COMMENT_TEXT]);
  const state = manual.createResearchState();

  manual.manualHide(doc, doc.querySelector('[data-id="urn:li:activity:1"]'), state);
  manual.manualHide(doc, doc.querySelector(".comment"), state);

  assert.equal(state.counters.blockedCount, 0);
  assert.deepEqual(state.counters.patternCounts, {});
  assert.deepEqual(state.counters.suggestions, []);
  assert.deepEqual(state.counters.undo, []);
  assert.deepEqual(state.counters.badgeCalls, []);
  assert.deepEqual(state.storageWrites, []);
});

test("[already-shown-override + rescan-respects-show] only an explicit click overrides Show", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY) + postSection("2", LONG_BODY);
  const state = manual.createResearchState();
  const [first, second] = doc.querySelectorAll("section");

  manual.manualHide(doc, first, state);
  /* Adjacent Show restores with forceShow + cooldown protection. */
  first.nextElementSibling.querySelector("button").click();
  assert.notEqual(first.style.display, "none");
  assert.equal(placeholderCount(doc), 0);
  assert.ok(state.forceShow.has(first));

  /* Automatic rescan flags it but must leave it visible. */
  const scan = manual.autoRescan(doc, [first, second], state);
  assert.deepEqual(scan.wouldHide, [second]);
  assert.ok(scan.skipped.some((s) => s.target === first));
  assert.notEqual(first.style.display, "none");

  /* Only a new explicit manual click re-hides it. */
  const again = manual.manualHide(doc, first, state);
  assert.equal(again.ok, true);
  assert.equal(first.style.display, "none");
  assert.equal(placeholderCount(doc), 1);
});

test("Show-all restores the whole manual set", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY) + postSection("2", LONG_BODY);
  const state = manual.createResearchState();
  const sections = doc.querySelectorAll("section");

  manual.manualHide(doc, sections[0], state);
  manual.manualHide(doc, sections[1], state);
  assert.equal(placeholderCount(doc), 2);

  const out = manual.manualShowAll(doc, state);
  assert.equal(out.restored, 2);
  assert.notEqual(sections[0].style.display, "none");
  assert.notEqual(sections[1].style.display, "none");
  assert.equal(placeholderCount(doc), 0);
  assert.equal(state.manuallyHidden.size, 0);
});

test("snooze/disable restores without Show protection; rule-less nodes stay visible", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  const state = manual.createResearchState();
  const section = doc.querySelector("section");

  manual.manualHide(doc, section, state);
  const out = manual.snoozeOrDisable(doc, state);
  assert.equal(out.restored, 1);
  assert.notEqual(section.style.display, "none");
  assert.equal(placeholderCount(doc), 0);
  /* restoreBlocked semantics: no forceShow, no cooldown — unlike Show. */
  assert.ok(!state.forceShow.has(section));
  assert.equal(state.cooldown.size, 0);
  /* No rule matches it, so the next automatic pass leaves it visible. */
  const scan = manual.autoRescan(doc, [], state);
  assert.deepEqual(scan.wouldHide, []);
  assert.notEqual(section.style.display, "none");
});

test("[detached-recreated-policy] detached anchor is a no-op; recreated node reappears by design", () => {
  const doc = buildDoc();
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  const state = manual.createResearchState();
  const section = doc.querySelector("section");
  const anchor = section.querySelector(".post-body").firstChild;

  manual.manualHide(doc, section, state);
  assert.equal(section.style.display, "none");

  /* Detached anchor: selection in a removed node resolves to nothing. */
  section.remove();
  assert.equal(manual.resolveManualTarget(doc, anchor), null);
  assert.deepEqual(manual.manualHide(doc, section, state), {
    ok: false,
    reason: "detached",
  });

  /* Recreated node (same data-id, new identity — the SPA re-render shape,
     which replaces the subtree, orphan placeholders included) is visible
     again: manual state is identity-keyed, never persisted. */
  doc.querySelector("#feed").innerHTML = postSection("1", LONG_BODY);
  const recreated = doc.querySelector("section");
  assert.notEqual(recreated, section);
  assert.notEqual(recreated.style.display, "none");
  assert.equal(placeholderCount(doc), 0);
  assert.ok(!state.manuallyHidden.has(recreated));
  assert.deepEqual(state.storageWrites, []);
});
