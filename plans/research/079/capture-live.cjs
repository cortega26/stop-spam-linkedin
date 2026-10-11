#!/usr/bin/env node

/* Plan 079 — live capture over CDP. DEV TOOL, NOT SHIPPED.
 *
 * Reads the posts already rendered in YOUR feed via a Chrome that exposes a
 * loopback debugging port, and writes only SANITISED entries. The raw markup
 * never touches disk.
 *
 * LANGUAGE: nothing here assumes English. The UI locale is read from the page,
 * and the label that marks a "Suggested" post is taken from the page too. It is
 * never guessed and never translated — either you pass it, or it is remembered
 * from a previous run in that locale, or the script shows you the label strings
 * it found and asks you to pick one. See --suggested-label.
 *
 * What it does NOT do, by design: click, scroll, navigate, log in for you, or
 * send anything off the machine. It reads the DOM and stops.
 *
 * Protocol position: single-shot, human-invoked, own-session, bounded to the
 * plan-071 §3 minimum set — the form permitted by 071/protocol.md §1a.
 *
 * Usage:
 *   node plans/research/079/capture-live.cjs                  # launch a dedicated Chrome
 *   node plans/research/079/capture-live.cjs --attach         # use an existing debug port
 *   node plans/research/079/capture-live.cjs --suggested-label "Sugerido para ti"
 *   node plans/research/079/capture-live.cjs --use-language es
 *   node plans/research/079/capture-live.cjs --dry-run
 *
 * First run: a dedicated Chrome opens. Log into LinkedIn there ONCE — the
 * profile persists. Your normal Chrome is not touched or closed.
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const { sanitizeMarkup, findLeaks } = require("./sanitize.cjs");

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const STAGING = path.join(SCRIPT_DIR, "staged-entries.json");

/* The production matcher, used only to decide whether the CURRENT detector
   would accept a label. Never used to derive the label itself. */
const { matchesLabel } = require(path.join(REPO_ROOT, "shared", "pattern-data.js"));

/* Learned label phrases, keyed by UI locale. Local, outside the repo.
   Populated only by an explicit user choice — nothing is ever guessed. */
const LABEL_MAP_PATH = path.join(os.homedir(), ".cache", "ss-capture-labels.json");

const DEFAULTS = {
  port: 9222,
  profile: path.join(os.homedir(), ".cache", "ss-capture-profile"),
  feedUrl: "https://www.linkedin.com/feed/",
  maxPositives: 3,
  maxNegatives: 2,
  prefix: "live",
  urlMatch: "linkedin\\.com",
};

const POST_SELECTOR = [
  '[data-id*="urn:li:activity:"]',
  ".feed-shared-update-v2",
  '[data-testid="mainFeed"] [role="listitem"]',
].join(", ");
const META_SELECTOR = [
  ".feed-shared-actor__sub-description",
  ".update-components-actor__sub-description",
].join(", ");

/* Posts from your network show a connection degree in the header ("• 2º",
   "• 2nd", "2e", "3ᵉʳ"). Recommendation labels replace it. Used only to group the
   label candidates so the list you pick from is short — a miss here costs an
   extra table row, never a wrong capture.
   Anchored on purpose: a Unicode ordinal such as "º" is NOT a word character to
   JavaScript's \b, so a trailing boundary silently fails to match it. */
const DEGREE_RE = /^\s*[•·]?\s*\d+\s*(?:º|°|ᵒ|ᵉʳ|ʳᵉ|ᵈ|ⁿᵈ|ʳᵈ|ᵗʰ|ˢᵗ|st|nd|rd|th|er|ème|eme|e)\s*[•·]?\s*$/i;

const RED = "\u001b[31m";
const GRN = "\u001b[32m";
const YEL = "\u001b[33m";
const DIM = "\u001b[2m";
const OFF = "\u001b[0m";

const ok = (m) => console.log(`${GRN}ok${OFF} ${m}`);
const warn = (m) => console.error(`${YEL}note:${OFF} ${m}`);
const die = (m) => {
  console.error(`${RED}error:${OFF} ${m}`);
  process.exit(1);
};

function parseArgs(argv) {
  const out = { ...DEFAULTS, attach: false, dry: false, suggestedLabel: null, useLanguage: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--attach") out.attach = true;
    else if (a === "--dry-run") out.dry = true;
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--profile") out.profile = argv[++i];
    else if (a === "--prefix") out.prefix = argv[++i];
    else if (a === "--max-positives") out.maxPositives = Number(argv[++i]);
    else if (a === "--max-negatives") out.maxNegatives = Number(argv[++i]);
    else if (a === "--suggested-label") out.suggestedLabel = argv[++i];
    else if (a === "--use-language") out.useLanguage = argv[++i];
    else if (a === "--forget-labels") out.forgetLabels = true;
    else if (a === "--url-match") out.urlMatch = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

/* ── learned labels ─────────────────────────────────────────────────────── */

function readLabelMap() {
  try {
    return JSON.parse(fs.readFileSync(LABEL_MAP_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeLabelMap(map) {
  fs.mkdirSync(path.dirname(LABEL_MAP_PATH), { recursive: true });
  fs.writeFileSync(LABEL_MAP_PATH, JSON.stringify(map, null, 2) + "\n");
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

/* ── browser ────────────────────────────────────────────────────────────── */

function findChrome() {
  return [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => fs.existsSync(p)) || null;
}

async function endpointUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function launchChrome(opts) {
  const exe = findChrome();
  if (!exe) die("no Chrome/Chromium binary found; start one yourself with --remote-debugging-port and use --attach");
  fs.mkdirSync(opts.profile, { recursive: true });
  warn("launching a dedicated Chrome profile (your normal Chrome is untouched)");
  console.error(`${DIM}    profile: ${opts.profile}`);
  console.error(`    log into LinkedIn there ONCE — the profile persists for later runs.${OFF}`);
  const child = spawn(
    exe,
    [
      `--remote-debugging-port=${opts.port}`,
      `--user-data-dir=${opts.profile}`,
      "--password-store=basic",
      "--no-first-run",
      "--no-default-browser-check",
      opts.feedUrl,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await endpointUp(opts.port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Reads the posts currently rendered, plus the page's UI locale. Read-only. */
async function readPage(page) {
  return page.evaluate(
    ({ postSelector, metaSelector }) => {
      const uiLocale = (document.documentElement.getAttribute("lang") || "").trim();
      const all = Array.from(document.querySelectorAll(postSelector));
      const outermost = all.filter((el) => !(el.parentElement && el.parentElement.closest(postSelector)));
      const candidates = outermost.map((el, index) => {
        const meta = Array.from(el.querySelectorAll(metaSelector))
          .map((n) => (n.textContent || "").trim())
          .filter(Boolean);
        const body = (el.querySelector('.feed-shared-text, .post-body, [data-testid="expandable-text-box"]') || {})
          .textContent || "";
        return {
          index,
          meta,
          bodyMentionsSuggest: /suggest|suger|vorgeschlagen|suggér|sugest/i.test(body),
          shape: el.getAttribute("data-id") ? "legacy" : el.matches('[role="listitem"]') ? "modern" : "other",
          enumerable: !!el.getAttribute("data-id") || el.classList.contains("feed-shared-update-v2"),
          html: el.outerHTML,
        };
      });
      return { uiLocale, candidates };
    },
    { postSelector: POST_SELECTOR, metaSelector: META_SELECTOR }
  );
}

/* ── label resolution (never guessed) ───────────────────────────────────── */

function labelClusters(candidates) {
  const counts = new Map();
  for (const c of candidates) {
    for (const text of c.meta) {
      if (DEGREE_RE.test(text)) continue; /* organic: from your network */
      counts.set(text, (counts.get(text) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);
}

async function resolveSuggestedLabel(opts, locale, clusters, map) {
  if (opts.suggestedLabel) return { label: opts.suggestedLabel, source: "--suggested-label" };
  const remembered = map[locale] && map[locale].suggestedLabel;
  if (remembered) return { label: remembered, source: `remembered for "${locale}"` };
  if (clusters.length === 0) return { label: null };

  console.error(`\n${DIM}Label strings found in post headers that are NOT a connection degree:${OFF}`);
  clusters.forEach((c, i) => console.error(`  ${i + 1}. ${JSON.stringify(c.text)}  ${DIM}(${c.count} post${c.count > 1 ? "s" : ""})${OFF}`));
  console.error(`${DIM}Pick the one marking a "Suggested" post (not "Promoted"/"Sponsored").${OFF}`);

  if (!process.stdin.isTTY) {
    console.error(`\n${YEL}not a terminal, so I cannot ask.${OFF} Re-run with the phrase you want:`);
    console.error(`  node plans/research/079/capture-live.cjs --suggested-label ${JSON.stringify(clusters[0].text)}`);
    return { label: null };
  }

  const answer = await ask(`\nWhich one? [1-${clusters.length}, or Enter to abort] `);
  const pick = Number(answer);
  if (!Number.isInteger(pick) || pick < 1 || pick > clusters.length) return { label: null };
  const chosen = clusters[pick - 1].text;
  map[locale] = { ...(map[locale] || {}), suggestedLabel: chosen };
  writeLabelMap(map);
  ok(`remembered ${JSON.stringify(chosen)} for UI locale "${locale}" (at ${LABEL_MAP_PATH})`);
  return { label: chosen, source: "your choice, now remembered" };
}

/* ── expectations ───────────────────────────────────────────────────────── */

/**
 * Decides whether an entry is a positive control or a fail-open negative, from
 * the project's DOCUMENTED intent — not from whatever the detector happens to
 * do right now. If this were derived from the detector's live behaviour the
 * gate would be a tautology and could never catch a regression.
 */
function expectationFor(label, container, locale) {
  const englishOnlyLabelAccepted = matchesLabel(label, ["Suggested"]);
  if (!englishOnlyLabelAccepted) {
    return {
      negative: true,
      reason:
        `label ${JSON.stringify(label)} is not accepted by the current English-only label set, ` +
        `so the detector is DOCUMENTED to fail open (locale: ${locale}) — recorded as a negative control`,
    };
  }
  if (!container.enumerable) {
    return {
      negative: true,
      reason:
        `label accepted, but the "${container.shape}" container is not in the enumerable post ` +
        `selectors — automatic filtering is manual-control-only by decision, so fail-open is the documented intent`,
    };
  }
  return { negative: false, reason: "English label in an enumerable post container — expected to be targeted" };
}

/* ── main ───────────────────────────────────────────────────────────────── */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "node capture-live.cjs [--attach] [--dry-run] [--port 9222] [--profile DIR]\n" +
        '                     [--suggested-label "Sugerido para ti"] [--use-language es]\n' +
        "                     [--max-positives 3] [--max-negatives 2] [--prefix live]\n" +
        "                     [--forget-labels] [--url-match REGEX]"
    );
    return 0;
  }

  const map = opts.forgetLabels ? {} : readLabelMap();
  if (opts.forgetLabels) writeLabelMap(map);

  if (!(await endpointUp(opts.port))) {
    if (opts.attach) die(`nothing on http://127.0.0.1:${opts.port}. Start a browser with --remote-debugging-port=${opts.port}, or drop --attach.`);
    if (!(await launchChrome(opts))) die(`Chrome did not expose port ${opts.port} in time. Re-run to retry.`);
  }
  ok(`CDP endpoint up on port ${opts.port}`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${opts.port}`);
  let page;
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (new RegExp(opts.urlMatch).test(p.url())) page = p;
  if (!page) {
    warn("no matching tab found in that browser.");
    console.error(`    Open the feed in the window that launched: ${opts.feedUrl}`);
    await browser.close();
    return 1;
  }

  const current = page.url();
  const isLinkedIn = /linkedin\.com/.test(current);
  if (isLinkedIn && /\/login|authwall|\/checkpoint|\/uas\//.test(current)) {
    warn("that window is not logged in to LinkedIn. Log in there once, then re-run.");
    await browser.close();
    return 1;
  }

  let pageData;
  try {
    pageData = await readPage(page);
  } catch (err) {
    die(`could not read the page: ${err.message}`);
  }
  await browser.close();

  const { uiLocale, candidates } = pageData;
  const locale = (opts.useLanguage || uiLocale.split("-")[0] || "en").toLowerCase();
  if (candidates.length === 0) {
    warn(`no post containers found on ${current}`);
    console.error("    Scroll your feed so posts render, then re-run.");
    return 1;
  }

  const clusters = labelClusters(candidates);
  const resolved = await resolveSuggestedLabel(opts, locale, clusters, map);
  const label = resolved.label;
  if (!label) {
    console.error(`\n${YEL}No Suggested label chosen, so nothing was staged.${OFF}`);
    return 1;
  }
  ok(`UI locale "${uiLocale || "?"}" → metadataLocale "${locale}"; label ${JSON.stringify(label)} (${resolved.source})`);

  const matched = candidates.filter((c) => c.meta.includes(label));
  if (matched.length === 0) {
    warn(`no post in view carries ${JSON.stringify(label)}. Scroll and re-run.`);
    return 1;
  }

  /* Selection, capped at the §3 minimum set. */
  const chosen = [];
  const positives = matched.filter((c) => !expectationFor(label, c, locale).negative);
  const negatives = candidates.filter((c) => c !== undefined && !positives.includes(c));

  for (const c of (positives.length ? positives : matched).slice(0, opts.maxPositives)) {
    chosen.push({ ...c, label });
  }
  const bodyMention = negatives.find((c) => c.bodyMentionsSuggest && !c.meta.includes(label));
  if (bodyMention) chosen.push({ ...bodyMention, label, forceNegative: true });
  const posShape = chosen[0] ? chosen[0].shape : "legacy";
  const variant = negatives.find((c) => c.shape !== posShape && c !== bodyMention && !c.meta.includes(label));
  if (variant && chosen.filter((c) => c.forceNegative).length < opts.maxNegatives) {
    chosen.push({ ...variant, label, forceNegative: true });
  }

  console.table(
    candidates.map((c) => {
      const exp = expectationFor(label, c, locale);
      return {
        index: c.index,
        hasLabel: c.meta.includes(label) ? "YES" : "",
        shape: c.shape,
        expect: c.meta.includes(label) || exp.negative === false ? (exp.negative ? "negative" : "positive") : "",
        selected: chosen.includes(c) || chosen.some((x) => x.index === c.index) ? "yes" : "",
      };
    })
  );

  const entries = [];
  let seq = 0;
  for (const c of chosen) {
    seq += 1;
    const exp = c.forceNegative ? { negative: true, reason: "selected as a fail-open negative control" } : expectationFor(label, c, locale);
    const id = `${opts.prefix}-${exp.negative ? "neg" : "pos"}-${String(seq).padStart(2, "0")}`;
    const res = sanitizeMarkup(c.html, { keepLabels: [label], caseId: id, caseMarker: id });
    if (res.error) {
      warn(`skipping index ${c.index}: ${res.error}`);
      continue;
    }
    const leaks = findLeaks(res.markup, { keepLabels: [label] });
    if (leaks.length > 0) {
      warn(`skipping index ${c.index}: ${leaks.length} leak finding(s)`);
      for (const l of leaks) console.error(`      [${l.rule}] ${l.detail}`);
      continue;
    }
    entries.push({
      entry: {
        id,
        purpose: exp.negative
          ? `Donated fail-open control (${c.shape} container, locale ${locale}): ${exp.reason}`
          : `Donated positive control (${c.shape} container, locale ${locale}).`,
        markup: res.markup,
        scanRoot: "parent",
        expectedTarget: exp.negative ? null : `[data-case="${id}"]`,
        metadataLocale: locale,
        provenance: "user-contributed",
        validationStatus: "real-donated",
        sourceRef: `owner authorized-collector capture, ${new Date().toISOString().slice(0, 7)}, ${locale} UI locale; sanitized per protocol.md §2`,
        sanitization:
          "Captured over CDP and sanitised in memory by plans/research/079/capture-live.cjs; raw markup never written to disk. " +
          "Declared label phrase preserved verbatim; all other human text replaced with placeholders; element names, classes and nesting verified unchanged; " +
          "id/tracking/data-urn/srcset/script/style/comments dropped; URLs stripped of query and fragment; profile slugs and urn payloads sentinelised.",
      },
      reason: exp.reason,
    });
  }

  if (entries.length === 0) die("nothing survived sanitisation; nothing staged");

  console.log();
  for (const { entry, reason } of entries) {
    console.log(`  ${entry.id}  ${entry.expectedTarget === null ? "NEGATIVE" : "POSITIVE"}  ${DIM}${reason}${OFF}`);
  }

  if (opts.dry) {
    console.log(`\n${DIM}--- first entry (dry run) ---${OFF}`);
    console.log(JSON.stringify(entries[0].entry, null, 2));
    ok("dry run: nothing written");
    return 0;
  }

  let staged = [];
  if (fs.existsSync(STAGING)) {
    try {
      staged = JSON.parse(fs.readFileSync(STAGING, "utf8"));
    } catch {
      staged = [];
    }
  }
  const ids = new Set(entries.map((e) => e.entry.id));
  staged = staged.filter((e) => !ids.has(e.entry ? e.entry.id : e.id)).concat(entries.map((e) => e.entry));
  fs.writeFileSync(STAGING, JSON.stringify(staged, null, 2) + "\n");

  const positivesTotal = staged.filter((e) => e.expectedTarget !== null).length;
  const negativesTotal = staged.length - positivesTotal;
  const need = (have, want) => (have >= want ? "met" : `need ${want - have}`);
  const nonEnglish = new Set(staged.filter((e) => e.metadataLocale !== "en").map((e) => e.metadataLocale));

  console.log();
  ok(`staged ${entries.length} entr(y/ies); raw markup never written to disk`);
  console.log(`\n${DIM}protocol §3 progress:${OFF}`);
  console.log(`  positives          : ${positivesTotal}/3  (${need(positivesTotal, 3)})`);
  console.log(`  negatives          : ${negativesTotal}/2  (${need(negativesTotal, 2)})`);
  console.log(`  non-English locale : ${nonEnglish.size ? [...nonEnglish].join(", ") : "none yet"}  ${nonEnglish.size ? "(satisfied)" : "(need 1)"}`);
  console.log(`\n  then:  plans/research/079/one-shot-capture.sh --admit`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`${RED}error:${OFF} ${err && err.message ? err.message : err}`);
      process.exit(1);
    });
}

/* Exported for the offline tests: the language-handling logic is the part most
   likely to regress, and it needs no browser to exercise. */
module.exports = { DEGREE_RE, labelClusters, expectationFor, LABEL_MAP_PATH };
