#!/usr/bin/env node

/* Plan 079 — live capture over CDP. DEV TOOL, NOT SHIPPED.
 *
 * Removes the console-paste dance entirely. It talks to a Chrome that has a
 * loopback debugging port, reads the posts already rendered in YOUR feed, and
 * writes only SANITISED entries — the raw markup never touches disk at all.
 *
 * What it does NOT do, by design: click, scroll, navigate, log in for you, or
 * send anything off the machine. It reads the DOM and stops.
 *
 * Protocol position: this is the single-shot, human-invoked, own-session,
 * bounded form permitted by plans/research/071/protocol.md §1a. One run,
 * capped at the §3 minimum set, owner's own feed only.
 *
 * Usage:
 *   node plans/research/079/capture-live.cjs            # launch a dedicated Chrome
 *   node plans/research/079/capture-live.cjs --attach   # use an already-running debug port
 *   node plans/research/079/capture-live.cjs --dry-run  # show what it would stage
 *
 * First run: a dedicated Chrome window opens. Log into LinkedIn there ONCE —
 * the profile persists, so later runs need no login. Your normal Chrome is not
 * touched or closed.
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const { sanitizeMarkup, findLeaks } = require("./sanitize.cjs");

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const STAGING = path.join(SCRIPT_DIR, "staged-entries.json");

const DEFAULTS = {
  port: 9222,
  profile: path.join(os.homedir(), ".cache", "ss-capture-profile"),
  feedUrl: "https://www.linkedin.com/feed/",
  maxPositives: 3,
  maxNegatives: 2,
  prefix: "live",
  /* Which tab to read. Overridable so the script can be exercised against a
     local fixture instead of a live session — the only reason it is a flag. */
  urlMatch: "linkedin\\.com",
};

/* Same selector families the shipped extension and the 068 prototype key on. */
const POST_SELECTOR = [
  '[data-id*="urn:li:activity:"]',
  ".feed-shared-update-v2",
  '[data-testid="mainFeed"] [role="listitem"]',
].join(", ");
const META_SELECTOR = [
  ".feed-shared-actor__sub-description",
  ".update-components-actor__sub-description",
].join(", ");

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
  const out = { ...DEFAULTS, attach: false, dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--attach") out.attach = true;
    else if (a === "--dry-run") out.dry = true;
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--profile") out.profile = argv[++i];
    else if (a === "--prefix") out.prefix = argv[++i];
    else if (a === "--url-match") out.urlMatch = argv[++i];
    else if (a === "--max-positives") out.maxPositives = Number(argv[++i]);
    else if (a === "--max-negatives") out.maxNegatives = Number(argv[++i]);
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function findChrome() {
  const candidates = [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function endpointUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function launchChrome(opts) {
  const exe = findChrome();
  if (!exe) die("no Chrome/Chromium binary found; start one yourself with --remote-debugging-port and use --attach");
  fs.mkdirSync(opts.profile, { recursive: true });
  warn(`launching a dedicated Chrome profile (your normal Chrome is untouched)`);
  console.error(`${DIM}    profile: ${opts.profile}`);
  console.error(`    when it opens, log into LinkedIn ONCE — the profile persists for later runs.${OFF}`);
  const child = spawn(
    exe,
    [
      `--remote-debugging-port=${opts.port}`,
      `--user-data-dir=${opts.profile}`,
      "--password-store=basic", /* avoids a locked-keyring stall on Linux */
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

/** Reads the posts currently rendered in the LinkedIn page. Read-only. */
async function readCandidates(page) {
  return page.evaluate(
    ({ postSelector, metaSelector }) => {
      const all = Array.from(document.querySelectorAll(postSelector));
      const outermost = all.filter((el) => {
        const parent = el.parentElement && el.parentElement.closest(postSelector);
        return !parent;
      });
      return outermost.map((el, index) => {
        const meta = Array.from(el.querySelectorAll(metaSelector))
          .map((n) => (n.textContent || "").trim())
          .filter(Boolean);
        const body = (el.querySelector(".feed-shared-text, .post-body, [data-testid=\"expandable-text-box\"]") || {})
          .textContent || "";
        const legacy = !!el.getAttribute("data-id");
        const modern = el.matches('[data-testid="mainFeed"] [role="listitem"], [role="listitem"]');
        return {
          index,
          meta,
          bodyMentionsSuggested: /suggest/i.test(body),
          shape: legacy ? "legacy" : modern ? "modern" : "other",
          html: el.outerHTML,
        };
      });
    },
    { postSelector: POST_SELECTOR, metaSelector: META_SELECTOR }
  );
}

/**
 * The label phrase to preserve for one capture. Real metadata is either the
 * label alone, the label plus a "· <sponsor>" tail, or a fuller phrase such as
 * "Suggested for you". Take everything up to the separator so the exact string
 * the detector keys on survives sanitisation.
 */
function labelFromMeta(meta) {
  const line = (meta || []).find((t) => /^suggest/i.test(t));
  if (!line) return null;
  const cut = line.split(/\s+·\s+/)[0];
  return cut.trim();
}

function buildEntry(id, markup, label, shape, isNegative, locale) {
  return {
    id,
    purpose: isNegative
      ? `Donated negative control (${shape} container): must fail open.`
      : `Donated positive control (${shape} container): real label in recognized post-header metadata must target the post.`,
    markup,
    scanRoot: "parent",
    expectedTarget: isNegative ? null : `[data-case="${id}"]`,
    metadataLocale: locale,
    provenance: "user-contributed",
    validationStatus: "real-donated",
    sourceRef: `owner authorized-collector capture, ${new Date().toISOString().slice(0, 7)}, ${locale} UI locale; sanitized per protocol.md §2`,
    sanitization:
      "Captured over CDP and sanitised in memory by plans/research/079/capture-live.cjs; raw markup never written to disk. " +
      "Declared label phrase preserved verbatim; all other human text replaced with placeholders; element names, classes and nesting verified unchanged; " +
      "id/tracking/data-urn/srcset/script/style/comments dropped; URLs stripped of query and fragment; profile slugs and urn payloads sentinelised.",
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "node capture-live.cjs [--attach] [--dry-run] [--port 9222] [--profile DIR]\n" +
        "                     [--max-positives 3] [--max-negatives 2] [--prefix live]\n" +
        "                     [--url-match REGEX]"
    );
    return 0;
  }

  if (!(await endpointUp(opts.port))) {
    if (opts.attach) die(`nothing is listening on http://127.0.0.1:${opts.port}. Start a browser with --remote-debugging-port=${opts.port}, or drop --attach.`);
    if (!(await launchChrome(opts))) die(`Chrome did not expose http://127.0.0.1:${opts.port} in time. Re-run to retry.`);
  }
  ok(`CDP endpoint up on port ${opts.port}`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${opts.port}`);
  let page;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (new RegExp(opts.urlMatch).test(p.url())) page = p;
    }
  }
  if (!page) {
    warn("no linkedin.com tab found in that browser.");
    console.error(`    Open the feed in the window that just launched: ${opts.feedUrl}`);
    console.error("    Log in once, then re-run this command.");
    await browser.close();
    return 1;
  }

  const current = page.url();
  const isLinkedIn = /linkedin\.com/.test(current);
  if (isLinkedIn && /\/login|authwall|\/checkpoint|\/uas\//.test(current)) {
    warn("that window is not logged in to LinkedIn.");
    console.error(`    Log in there once (the dedicated profile persists), then re-run this command.`);
    await browser.close();
    return 1;
  }

  let candidates = [];
  try {
    candidates = await readCandidates(page);
  } catch (err) {
    die(`could not read the page: ${err.message}`);
  }

  if (candidates.length === 0) {
    warn(`no post containers found on ${current}`);
    console.error("    Scroll your feed so posts render, then re-run this command.");
    console.error("    (If posts are visible and this still says none, the feed shape is");
    console.error("     outside the known selectors — that itself is worth reporting.)");
    await browser.close();
    return 1;
  }

  const positives = candidates.filter((c) => labelFromMeta(c.meta));
  const negatives = candidates.filter((c) => !labelFromMeta(c.meta));

  console.table(
    candidates.map((c) => ({
      index: c.index,
      suggested: labelFromMeta(c.meta) ? "YES" : "",
      shape: c.shape,
      mentions: c.bodyMentionsSuggested ? "body" : "",
      selected: positives.includes(c) ? "positive" : "",
    }))
  );

  if (positives.length === 0) {
    warn("no post in view carries a Suggested label.");
    console.error("    Scroll until one appears, then re-run. Nothing was staged.");
    await browser.close();
    return 1;
  }

  /* Selection, capped at the protocol §3 minimum set. */
  const chosen = [];
  for (const c of positives.slice(0, opts.maxPositives)) chosen.push({ ...c, negative: false });
  if (negatives.length > 0) {
    /* Prefer a body-mention negative (the class §3 asks for). */
    const bodyMention = negatives.find((c) => c.bodyMentionsSuggested);
    if (bodyMention) chosen.push({ ...bodyMention, negative: true });
    /* Prefer a layout variant: a negative of a different container shape. */
    const posShape = positives[0].shape;
    const variant = negatives.find((c) => c.shape !== posShape && c !== bodyMention);
    if (variant && chosen.filter((c) => c.negative).length < opts.maxNegatives) {
      chosen.push({ ...variant, negative: true });
    } else {
      for (const c of negatives) {
        if (chosen.filter((x) => x.negative).length >= opts.maxNegatives) break;
        if (!chosen.includes(c)) chosen.push({ ...c, negative: true });
      }
    }
  }

  /* Sanitise in memory and build entries. */
  const locale = "en"; /* change if your LinkedIn UI is not English */
  const entries = [];
  let seq = 0;
  for (const c of chosen) {
    seq += 1;
    const id = c.negative
      ? `${opts.prefix}-neg-${String(seq).padStart(2, "0")}`
      : `${opts.prefix}-pos-${String(seq).padStart(2, "0")}`;
    const label = labelFromMeta(c.meta) || "Suggested";
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
    entries.push({ entry: buildEntry(id, res.markup, label, c.shape, c.negative, locale), label });
  }

  await browser.close();

  if (entries.length === 0) die("nothing survived sanitisation; nothing staged");

  console.log();
  for (const { entry, label } of entries) {
    console.log(`  ${entry.id}  ${entry.expectedTarget === null ? "negative" : "positive"}  label=${JSON.stringify(label)}  ${entry.markup.length} bytes`);
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
  staged = staged.filter((e) => !ids.has(e.id)).concat(entries.map((e) => e.entry));
  fs.writeFileSync(STAGING, JSON.stringify(staged, null, 2) + "\n");

  const positivesTotal = staged.filter((e) => e.expectedTarget !== null).length;
  const negativesTotal = staged.length - positivesTotal;
  const need = (have, want) => (have >= want ? "met" : `need ${want - have}`);

  console.log();
  ok(`staged ${entries.length} entr(y/ies); raw markup never written to disk`);
  console.log(`\n${DIM}protocol §3 progress:${OFF}`);
  console.log(`  positives : ${positivesTotal}/${opts.maxPositives}  (${need(positivesTotal, 3)})`);
  console.log(`  negatives : ${negativesTotal}/${opts.maxNegatives}  (${need(negativesTotal, 2)})`);
  if (positivesTotal >= 3 && negativesTotal >= 2) {
    console.log(`\n  §3 minimums met — run:  plans/research/079/one-shot-capture.sh --admit`);
  } else {
    console.log(`\n  scroll the feed for more posts and run this again, then:  one-shot-capture.sh --admit`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${RED}error:${OFF} ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
