#!/usr/bin/env node

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const {
  findBySiblingHeuristic,
  findByKnownSelectors,
  findPostContainer,
} = require(path.join(__dirname, "..", "..", "shared", "post-container.js"));

/* Must stay in sync with the CONFIG block in content.js (the shared
   functions are pure — they take the config as a parameter, and the
   content script passes its live CONFIG at the call site). */
const CONFIG = {
  MIN_TEXT_LENGTH: 30,
  SIBLING_CONTENT_THRESHOLD: 100,
  SIBLING_COUNT_THRESHOLD: 2,
  FEED_SIBLING_FALLBACK: 6,
  DEPTH_LIMIT: 20,
  CONTENT_LENGTH_THRESHOLD: 300,
};

const POST_SELECTORS = [
  '[data-id*="urn:li:activity:"]',
  ".feed-shared-update-v2",
  "article",
];

const LONG = "x".repeat(120); /* > SIBLING_CONTENT_THRESHOLD (100) */
const SHORT = "z".repeat(10); /* < MIN_TEXT_LENGTH (30) */
const MEDIUM = "w".repeat(40); /* between MIN_TEXT_LENGTH and CONTENT_LENGTH_THRESHOLD */
const LEAF = "v".repeat(150); /* < CONTENT_LENGTH_THRESHOLD (300) */

function buildDom(html) {
  const dom = new JSDOM(html);
  return { dom, doc: dom.window.document };
}

function postSection(id, body) {
  return `<section data-id="urn:li:activity:${id}">
      <div class="actor"><a href="/in/jane"><span>Jane Doe</span></a></div>
      <p class="post-body">${body}</p>
      <span>Promoted</span>
    </section>`;
}

test("findPostContainer returns the post section (data-id), not an inner element or body", () => {
  const { doc } = buildDom(`<main>
      <div id="feed">
        ${postSection("1", "y".repeat(200))}
        ${postSection("2", "y".repeat(200))}
        ${postSection("3", "y".repeat(200))}
      </div>
      <footer><p>About this extension</p></footer>
    </main>`);
  const sections = doc.querySelectorAll("section[data-id]");
  const textNode = sections[0].querySelector(".post-body").firstChild;
  const bodyP = sections[0].querySelector(".post-body");

  const result = findPostContainer(textNode, CONFIG, POST_SELECTORS, doc);
  assert.equal(result, sections[0]);
  assert.notEqual(result, bodyP);
  assert.notEqual(result, doc.body);

  /* Negative control: a text node outside the feed gets no container. */
  const footerText = doc.querySelector("footer p").firstChild;
  assert.equal(findPostContainer(footerText, CONFIG, POST_SELECTORS, doc), null);
});

test("findBySiblingHeuristic returns the comment element when ≥2 heavy siblings exist", () => {
  /* Comment thread: the first <p>'s parent (.comment-thread) has two
     other children >100 chars, so heavySiblings >= 2; the grandparent
     (section) has no other heavy children, so the heuristic returns the
     first <p> itself. */
  const { doc } = buildDom(`<main>
      <div id="feed">
        <section data-id="urn:li:activity:2">
          <div class="comment-thread">
            <p>${LONG}</p>
            <p>${LONG}</p>
            <p>${LONG}</p>
          </div>
        </section>
      </div>
    </main>`);
  const comments = doc.querySelectorAll(".comment-thread p");
  const textNode = comments[0].firstChild;

  const result = findBySiblingHeuristic(textNode, CONFIG, doc);
  assert.equal(result, comments[0]);
  assert.notEqual(result, comments[1]);
});

test("findBySiblingHeuristic is bounded by DEPTH_LIMIT on deep single-child chains", () => {
  /* Verified behavior: with a leaf text of 150 chars (<
     CONTENT_LENGTH_THRESHOLD 300), a single-child chain (no heavy
     siblings, no 6-sibling fallback), and the text node 26 levels deep,
     the walk never fires an early return and the depth counter exits
     the loop at DEPTH_LIMIT = 20 — 6 levels short of reaching
     document.body — so the result is null. */
  let html = "<main><div id='root'>";
  for (let i = 0; i < 25; i++) html += "<div>";
  html += `<p>${LEAF}</p>`;
  for (let i = 0; i < 25; i++) html += "</div>";
  html += "</div></main>";

  const { doc } = buildDom(html);
  const textNode = doc.querySelector("p").firstChild;

  assert.equal(findBySiblingHeuristic(textNode, CONFIG, doc), null);
});

test("findByKnownSelectors finds the data-id section from a deeply nested text node", () => {
  /* The selector walk is unbounded by design — unlike the sibling
     heuristic it ascends all the way to document.body, so it finds the
     post section 26 levels above the text node. */
  let html = `<main><section data-id="urn:li:activity:4">`;
  for (let i = 0; i < 25; i++) html += "<div>";
  html += `<p>${MEDIUM}</p>`;
  for (let i = 0; i < 25; i++) html += "</div>";
  html += "</section></main>";

  const { doc } = buildDom(html);
  const textNode = doc.querySelector("p").firstChild;
  const section = doc.querySelector("section[data-id]");

  const result = findByKnownSelectors(textNode, POST_SELECTORS, doc);
  assert.equal(result, section);
});

test("findByKnownSelectors honors the article selector when passed explicitly", () => {
  const { doc } = buildDom(`<main>
      <article><p>${MEDIUM}</p></article>
    </main>`);
  const textNode = doc.querySelector("p").firstChild;
  const article = doc.querySelector("article");

  assert.equal(findByKnownSelectors(textNode, ["article"], doc), article);
  /* The same text node is NOT matched by the data-id selector alone —
     selectors come from the parameter, not from module state. */
  assert.equal(
    findByKnownSelectors(textNode, ['[data-id*="urn:li:activity:"]'], doc),
    null
  );
});

test("findPostContainer prefers the sibling heuristic over known selectors", () => {
  /* Both strategies succeed on this DOM: the sibling heuristic returns
     the comment <p> (its own return element), while the selectors walk
     would return the data-id section. The strategy chain runs the
     sibling heuristic first, so the returned container is the <p>. */
  const { doc } = buildDom(`<main>
      <div id="feed">
        <section data-id="urn:li:activity:6">
          <div class="comment-thread">
            <p>${LONG}</p>
            <p>${LONG}</p>
            <p>${LONG}</p>
          </div>
        </section>
      </div>
    </main>`);
  const comments = doc.querySelectorAll(".comment-thread p");
  const section = doc.querySelector("section[data-id]");
  const textNode = comments[0].firstChild;

  assert.equal(
    findBySiblingHeuristic(textNode, CONFIG, doc),
    comments[0],
    "precondition: sibling heuristic succeeds"
  );
  assert.equal(
    findByKnownSelectors(textNode, POST_SELECTORS, doc),
    section,
    "precondition: selectors walk succeeds too"
  );

  const result = findPostContainer(textNode, CONFIG, POST_SELECTORS, doc);
  assert.equal(result, comments[0]);
  assert.notEqual(result, section);
});

test("findBySiblingHeuristic gates the feed-sibling fallback on MIN_TEXT_LENGTH", () => {
  /* makeTextFilter (the content.js pre-filter that skips short texts
     before scanning) lives in content.js and is out of scope here; the
     shared heuristic has its own MIN_TEXT_LENGTH gate on the
     FEED_SIBLING_FALLBACK return (6+ siblings), which is what this
     test pins down. */
  const heavyFeed = buildDom(`<main>
      <div id="feed">${"<p>" + MEDIUM + "</p>".repeat(6)}</div>
    </main>`);
  const mediumText = heavyFeed.doc.querySelector("p").firstChild;
  assert.equal(
    findBySiblingHeuristic(mediumText, CONFIG, heavyFeed.doc),
    heavyFeed.doc.querySelector("p")
  );

  const lightFeed = buildDom(`<main>
      <div id="feed">${"<p>" + SHORT + "</p>".repeat(6)}</div>
    </main>`);
  const shortText = lightFeed.doc.querySelector("p").firstChild;
  assert.equal(findBySiblingHeuristic(shortText, CONFIG, lightFeed.doc), null);
});

test("findPostContainer survives throwing strategies", () => {
  const { doc } = buildDom(`<main>
      <section data-id="urn:li:activity:8"><p>${MEDIUM}</p></section>
    </main>`);
  const textNode = doc.querySelector("p").firstChild;
  const section = doc.querySelector("section[data-id]");

  /* (a) A broken config makes the sibling heuristic throw on its very
     first read; findPostContainer catches it and falls through to the
     selectors strategy, which still finds the section. */
  const brokenConfig = {
    get DEPTH_LIMIT() {
      throw new Error("simulated config failure");
    },
  };
  assert.equal(
    findPostContainer(textNode, brokenConfig, POST_SELECTORS, doc),
    section
  );

  /* (b) A textNode whose parentElement access always throws makes BOTH
     strategies throw; findPostContainer catches each and returns null
     without crashing. */
  const throwingTextNode = {
    get parentElement() {
      throw new Error("simulated DOM failure");
    },
  };
  assert.equal(
    findPostContainer(throwingTextNode, CONFIG, POST_SELECTORS, doc),
    null
  );
});
