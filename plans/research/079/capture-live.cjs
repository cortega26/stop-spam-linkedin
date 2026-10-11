#!/usr/bin/env node

/* Plan 079 — live capture over CDP. DEV TOOL, NOT SHIPPED.
 *
 * Reuses YOUR existing Chrome profile, so your logged-in LinkedIn session is
 * already there. It scrolls the feed itself to load posts — you do not have to
 * scroll and re-run.
 *
 * LANGUAGE: nothing here assumes English. The UI locale comes from the page, and
 * the label marking a "Suggested" post comes from the page too — passed,
 * remembered per locale, or picked from a list. Never guessed, never translated.
 *
 * Protocol position: single-shot, human-invoked, own-session, bounded to the
 * plan-071 §3 minimum set — the form permitted by 071/protocol.md §1a.
 *
 * Usage:
 *   node plans/research/079/capture-live.cjs
 *       Reuses your Chrome profile. Chrome must be closed; the script offers to
 *       close and relaunch it for you (logins are preserved — same profile).
 *   node plans/research/079/capture-live.cjs --suggested-label "Sugerido para ti"
 *   node plans/research/079/capture-live.cjs --dedicated-profile   # throwaway profile instead
 *   node plans/research/079/capture-live.cjs --attach             # use an existing debug port
 *   node plans/research/079/capture-live.cjs --dry-run
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const { sanitizeMarkup, findLeaks } = require("./sanitize.cjs");

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const STAGING = path.join(SCRIPT_DIR, "staged-entries.json");

const { matchesLabel } = require(path.join(REPO_ROOT, "shared", "pattern-data.js"));

/* Learned label phrases, keyed by UI locale. Local, outside the repo.
   Populated only by an explicit user choice — nothing is ever guessed. */
const LABEL_MAP_PATH = path.join(os.homedir(), ".cache", "ss-capture-labels.json");

function defaultChromeProfileDir() {
  for (const p of ["~/.config/google-chrome", "~/.config/chromium", "~/.config/google-chrome-beta"]) {
    const abs = path.join(os.homedir(), p.replace("~/", ""));
    if (fs.existsSync(abs)) return abs;
  }
  return path.join(os.homedir(), ".config", "google-chrome");
}

const DEFAULTS = {
  port: 9222,
  feedUrl: "https://www.linkedin.com/feed/",
  maxPositives: 3,
  maxNegatives: 2,
  maxScrolls: 12,
  prefix: "live",
  urlMatch: "linkedin\\.com",
  chromeProfile: defaultChromeProfileDir(),
  profileDirectory: "Default",
  dedicatedProfile: false,
  dedicatedPath: path.join(os.homedir(), ".cache", "ss-capture-profile"),
  closeChrome: false,
  diagnose: false,
  quitWhenDone: false,
  withExtensions: false,
};

const POST_SELECTOR = [
  '[data-id*="urn:li:activity:"]',
  '.feed-shared-update-v2',
  '[data-testid="mainFeed"] [role="listitem"]',
].join(", ");
const META_SELECTOR = [
  ".feed-shared-actor__sub-description",
  ".update-components-actor__sub-description",
].join(", ");

/* Posts from your network show a connection degree in the header ("• 2º",
   "• 2nd", "2e", "3ᵉʳ"). Recommendation labels replace it. Used only to group the
   label candidates so the pick is short.
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
  const out = { ...DEFAULTS, attach: false, dry: false, suggestedLabel: null, useLanguage: null, forgetLabels: false, help: false, yes: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--attach") out.attach = true;
    else if (a === "--diagnose") out.diagnose = true;
    else if (a === "--dry-run") out.dry = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--close-chrome") out.closeChrome = true;
    else if (a === "--quit-when-done") out.quitWhenDone = true;
    else if (a === "--with-extensions") out.withExtensions = true;
    else if (a === "--dedicated-profile") out.dedicatedProfile = true;
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--prefix") out.prefix = argv[++i];
    else if (a === "--max-positives") out.maxPositives = Number(argv[++i]);
    else if (a === "--max-negatives") out.maxNegatives = Number(argv[++i]);
    else if (a === "--max-scrolls") out.maxScrolls = Number(argv[++i]);
    else if (a === "--suggested-label") out.suggestedLabel = argv[++i];
    else if (a === "--use-language") out.useLanguage = argv[++i];
    else if (a === "--forget-labels") out.forgetLabels = true;
    else if (a === "--chrome-profile") out.chromeProfile = argv[++i];
    else if (a === "--profile-directory") out.profileDirectory = argv[++i];
    else if (a === "--url-match") out.urlMatch = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
    else die(`unknown option: ${a}  (try --help)`);
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
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

/* ── Chrome lifecycle ───────────────────────────────────────────────────── */

function findChrome() {
  return [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => fs.existsSync(p)) || null;
}

function chromePids(exe) {
  try {
    const out = execFileSync("pgrep", ["-f", `^${exe}`], { encoding: "utf8" }).trim();
    return out ? out.split("\n").map(Number) : [];
  } catch {
    return [];
  }
}

async function waitGone(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = pids.filter((p) => { try { process.kill(p, 0); return true; } catch { return false; } });
    if (alive.length === 0) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function endpointUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function launchArgs(opts) {
  const userDataDir = opts.dedicatedProfile ? opts.dedicatedPath : opts.chromeProfile;
  const args = [
    `--remote-debugging-port=${opts.port}`,
    `--user-data-dir=${userDataDir}`,
    "--password-store=basic",
    "--no-first-run",
    "--no-default-browser-check",
  ];
  if (!opts.dedicatedProfile) args.push(`--profile-directory=${opts.profileDirectory}`);
  /* Extensions off by default: a content script that rewrites the DOM (including
     this repo's own extension, which hides promoted posts) makes the capture
     worse evidence about what LinkedIn actually rendered. */
  if (!opts.withExtensions) args.push("--disable-extensions");
  args.push(opts.feedUrl);
  return { args, userDataDir };
}

async function ensureBrowser(opts) {
  if (await endpointUp(opts.port)) return { launched: false };

  const exe = findChrome();
  if (!exe) die("no Chrome/Chromium binary found; start one with --remote-debugging-port and use --attach");

  if (!opts.dedicatedProfile) {
    const running = chromePids(exe);
    if (running.length > 0) {
      warn("Chrome is running. Your session lives in that profile, so Chrome must be");
      warn("restarted to attach to it. Logins are preserved — it is the same profile.");
      let proceed = opts.closeChrome || opts.yes;
      if (!proceed) {
        if (!process.stdin.isTTY) {
          die("Chrome is running. Re-run with --close-chrome, or close Chrome yourself and re-run.");
        }
        const answer = await ask("Close and relaunch Chrome now? [y/N] ");
        proceed = /^y(es)?$/i.test(answer);
      }
      if (!proceed) die("aborted — Chrome was left running");
      console.error(`${DIM}    closing Chrome (${running.length} process(es))...${OFF}`);
      for (const pid of running) { try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ } }
      const gone = await waitGone(running, 20000);
      if (!gone) die("Chrome did not exit within 20s. Close it yourself, then re-run.");
      ok("Chrome closed");
    }
  } else {
    fs.mkdirSync(opts.dedicatedPath, { recursive: true });
    warn("using a dedicated throwaway profile — you will need to log into LinkedIn there once");
  }

  const { args, userDataDir } = launchArgs(opts);
  console.error(`${DIM}    launching: ${args[0]} ${args[1]}${OFF}`);
  console.error(`${DIM}    profile:   ${userDataDir}${OFF}`);
  const child = spawn(exe, args, { detached: true, stdio: "ignore" });
  child.unref();

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await endpointUp(opts.port)) return { launched: true };
    await new Promise((r) => setTimeout(r, 900));
  }
  die(`Chrome did not expose port ${opts.port} in time. Re-run to retry.`);
}

/* ── reading and scrolling ──────────────────────────────────────────────── */

/**
 * Per-selector census, so a selector mismatch is a fact rather than a guess.
 * Read-only. Reports counts and short header strings only.
 */
async function selectorCensus(page) {
  return page.evaluate(
    ({ families, metaSelector }) => {
      const counts = {};
      for (const f of families) counts[f] = document.querySelectorAll(f).length;
      const metaTexts = Array.from(document.querySelectorAll(metaSelector)).map((n) => (n.textContent || "").trim());
      return {
        url: location.href,
        uiLocale: document.documentElement.getAttribute("lang") || "",
        counts,
        metaElementCount: metaTexts.length,
        metaSample: [...new Set(metaTexts.filter(Boolean))].slice(0, 25),
        title: document.title,
      };
    },
    {
      families: [
        '[data-id*="urn:li:activity:"]',
        ".feed-shared-update-v2",
        '[data-testid="mainFeed"] [role="listitem"]',
        '[role="listitem"]',
      ],
      metaSelector: META_SELECTOR,
    }
  );
}

async function readPage(page) {
  return page.evaluate(
    ({ postSelector, metaSelector }) => {
      const uiLocale = (document.documentElement.getAttribute("lang") || "").trim();
      const all = Array.from(document.querySelectorAll(postSelector));
      const outermost = all.filter((el) => !(el.parentElement && el.parentElement.closest(postSelector)));
      const candidates = outermost.map((el) => {
        const meta = Array.from(el.querySelectorAll(metaSelector))
          .map((n) => (n.textContent || "").trim()).filter(Boolean);
        const body = (el.querySelector('.feed-shared-text, .post-body, [data-testid="expandable-text-box"]') || {}).textContent || "";
        return {
          meta,
          bodyMentionsSuggest: /suggest|suger|vorgeschlagen|suggér|sugest/i.test(body),
          shape: el.getAttribute("data-id") ? "legacy" : el.matches('[role="listitem"]') ? "modern" : "other",
          enumerable: !!el.getAttribute("data-id") || el.classList.contains("feed-shared-update-v2"),
          html: el.outerHTML,
        };
      });
      return { uiLocale, candidates, atBottom: window.scrollY + window.innerHeight >= document.body.scrollHeight - 200 };
    },
    { postSelector: POST_SELECTOR, metaSelector: META_SELECTOR }
  );
}

/**
 * Scrolls and re-reads until the feed stops growing, a target is reached, or the
 * scroll budget runs out. Deduped across rounds, because LinkedIn unmounts posts
 * as they leave the viewport — without this, earlier posts would be lost.
 */
async function gather(page, opts, { target, accept, budget }) {
  const seen = new Map();
  let locale = "";
  let quiet = 0;
  const key = (c) => `${c.html.length}:${c.html.slice(0, 160)}`;

  for (let step = 0; step <= budget; step += 1) {
    const data = await readPage(page);
    if (data.uiLocale) locale = data.uiLocale;
    let added = 0;
    for (const c of data.candidates) {
      if (!seen.has(key(c))) { seen.set(key(c), c); added += 1; }
    }
    const list = [...seen.values()].map((c, i) => ({ ...c, index: i }));

    if (added > 0) {
      console.error(`${DIM}    ${list.length} post(s) collected (scroll ${step}/${budget})${OFF}`);
    }
    if (accept && accept(list)) break;
    if (!accept && target && list.length >= target) break;

    quiet = added === 0 ? quiet + 1 : 0;
    if (quiet >= 3 || data.atBottom || step === budget) break;

    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 1.4)));
    await page.waitForTimeout(900);
  }
  return { uiLocale: locale, candidates: [...seen.values()].map((c, i) => ({ ...c, index: i })) };
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
  return [...counts.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count);
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
    clusters.slice(0, 3).forEach((c) => console.error(`  --suggested-label ${JSON.stringify(c.text)}`));
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
 * Positive or fail-open negative, decided from the project's DOCUMENTED intent
 * (English-only labels; legacy-only enumeration) — not from the detector's live
 * behaviour, which would make the gate a tautology and unable to catch a bug.
 */
function expectationFor(label, container, locale) {
  if (!matchesLabel(label, ["Suggested"])) {
    return {
      negative: true,
      reason: `label ${JSON.stringify(label)} is not accepted by the current English-only label set, so the detector is DOCUMENTED to fail open (locale: ${locale}) — recorded as a negative control`,
    };
  }
  if (!container.enumerable) {
    return {
      negative: true,
      reason: `label accepted, but the "${container.shape}" container is not in the enumerable post selectors — automatic filtering is manual-control-only by decision, so fail-open is the documented intent`,
    };
  }
  return { negative: false, reason: "English label in an enumerable post container — expected to be targeted" };
}

/* ── main ───────────────────────────────────────────────────────────────── */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "node capture-live.cjs [options]\n\n" +
        "  --suggested-label PHRASE  the label that marks a Suggested post, in your UI language\n" +
        "  --use-language CODE       override the detected UI locale (default: read from the page)\n" +
        "  --forget-labels           clear remembered labels\n" +
        "  --max-scrolls N           scroll budget while looking for posts (default 12)\n" +
        "  --max-positives N         default 3        --max-negatives N   default 2\n" +
        "  --prefix P                entry id prefix (default live)\n" +
        "  --dedicated-profile       use a throwaway profile instead of your own\n" +
        "  --chrome-profile DIR      your Chrome user-data-dir\n" +
        "  --profile-directory NAME  Default, \"Profile 2\", ...\n" +
        "  --close-chrome            close a running Chrome without asking\n" +
        "  --quit-when-done          close the capture browser when finished\n" +
        "  --with-extensions         do not disable extensions\n" +
        "  --attach                  use an already-running debug port instead of launching\n" +
        "  --dry-run                 show what would be staged, write nothing\n" +
        "  --diagnose                report which selectors match your feed, then exit"
    );
    return 0;
  }

  opts.verbose = process.stderr.isTTY;

  const map = opts.forgetLabels ? {} : readLabelMap();
  if (opts.forgetLabels) writeLabelMap(map);

  const { launched } = await ensureBrowser(opts);
  ok(`CDP endpoint up on port ${opts.port}${launched ? "" : " (already running)"}`);

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
  if (/linkedin\.com/.test(current) && /\/login|authwall|\/checkpoint|\/uas\//.test(current)) {
    warn("that window is not logged into LinkedIn.");
    console.error("    With your own profile this usually means the profile directory is wrong:");
    console.error(`      --chrome-profile DIR --profile-directory NAME   (tried: ${opts.dedicatedProfile ? opts.dedicatedPath : opts.chromeProfile} / ${opts.profileDirectory})`);
    await browser.close();
    return 1;
  }

  if (opts.diagnose) {
    const census = await selectorCensus(page);
    console.log(`\npage        : ${census.url}`);
    console.log(`title       : ${census.title}`);
    console.log(`ui locale   : ${census.uiLocale || "(none)"}`);
    console.log(`\npost candidates per selector family:`);
    for (const [sel, n] of Object.entries(census.counts)) console.log(`  ${String(n).padStart(4)}  ${sel}`);
    console.log(`\nheader-meta elements matched by META_SELECTOR: ${census.metaElementCount}`);
    console.log(`  ${DIM}${META_SELECTOR}${OFF}`);
    if (census.metaSample.length) {
      console.log(`\ndistinct header strings I can see (${census.metaSample.length}):`);
      census.metaSample.forEach((t) => console.log(`  ${JSON.stringify(t)}`));
    } else {
      console.log(`\n${YEL}META_SELECTOR matched NOTHING — that is the bug.${OFF}`);
      console.log("A Suggested post may be visible while I cannot read its header slot.");
    }
    console.log(`\n${DIM}These are header-slot strings (connection degree or label), not post bodies.${OFF}`);
    console.log(`${DIM}If a Suggested post is on screen but its label is not listed above, send me this output.${OFF}`);
    if (opts.quitWhenDone) await browser.close();
    return 0;
  }

  const needed = opts.maxPositives + opts.maxNegatives;

  console.error(`${DIM}    reading and scrolling the feed...${OFF}`);
  let gathered = await gather(page, opts, { target: needed * 3, budget: opts.maxScrolls });

  if (gathered.candidates.length === 0) {
    warn(`no post containers found on ${current}`);
    console.error("    (If posts are clearly visible and this still says none, the feed shape is");
    console.error("     outside the known selectors — that itself is worth reporting.)");
    if (opts.quitWhenDone) await browser.close();
    return 1;
  }

  const locale = (opts.useLanguage || gathered.uiLocale.split("-")[0] || "en").toLowerCase();
  const clusters = labelClusters(gathered.candidates);
  const resolved = await resolveSuggestedLabel(opts, locale, clusters, map);
  const label = resolved.label;
  if (!label) {
    console.error(`\n${YEL}No Suggested label chosen, so nothing was staged.${OFF}`);
    if (opts.quitWhenDone) await browser.close();
    return 1;
  }
  ok(`UI locale ${JSON.stringify(gathered.uiLocale || "?")} → metadataLocale "${locale}"; label ${JSON.stringify(label)} (${resolved.source})`);

  const countWithLabel = (list) => list.filter((c) => c.meta.includes(label)).length;
  if (countWithLabel(gathered.candidates) === 0) {
    console.error(`${DIM}    none yet — scrolling further for ${JSON.stringify(label)}...${OFF}`);
    gathered = await gather(page, opts, {
      accept: (list) => countWithLabel(list) >= Math.min(needed, opts.maxPositives),
      budget: opts.maxScrolls,
    });
  }

  const { candidates } = gathered;
  const matched = candidates.filter((c) => c.meta.includes(label));
  if (matched.length === 0) {
    warn(`scrolled ${opts.maxScrolls} times and found no post carrying ${JSON.stringify(label)}.`);
    console.error("    If it exists on your feed, it may be further down. Raise the budget:");
    console.error(`      --max-scrolls ${opts.maxScrolls * 3}`);
    if (opts.quitWhenDone) await browser.close();
    return 1;
  }

  const positives = matched.filter((c) => !expectationFor(label, c, locale).negative);
  const chosen = [];
  /* Matched posts are NOT force-negatived: expectationFor decides, and its reason
     is the precise documented one ("English-only label set", "not enumerable").
     forceNegative is only for the non-matching control posts added below. */
  for (const c of (positives.length ? positives : matched).slice(0, opts.maxPositives)) chosen.push({ ...c, label });

  const others = candidates.filter((c) => !c.meta.includes(label));
  const bodyMention = others.find((c) => c.bodyMentionsSuggest);
  if (bodyMention) chosen.push({ ...bodyMention, label, forceNegative: true });
  const posShape = chosen[0] ? chosen[0].shape : "legacy";
  const variant = others.find((c) => c.shape !== posShape && c !== bodyMention);
  if (variant && chosen.filter((c) => c.forceNegative).length < opts.maxNegatives) {
    chosen.push({ ...variant, label, forceNegative: true });
  }

  if (opts.verbose) {
    console.table(candidates.slice(0, 25).map((c) => ({
      index: c.index,
      hasLabel: c.meta.includes(label) ? "YES" : "",
      shape: c.shape,
      body: c.bodyMentionsSuggest ? "mentions" : "",
      selected: chosen.some((x) => x.index === c.index) ? "yes" : "",
    })));
  }

  const entries = [];
  let seq = 0;
  for (const c of chosen) {
    seq += 1;
    const exp = c.forceNegative
      ? { negative: true, reason: "selected as a fail-open negative control" }
      : expectationFor(label, c, locale);
    const id = `${opts.prefix}-${exp.negative ? "neg" : "pos"}-${String(seq).padStart(2, "0")}`;
    const res = sanitizeMarkup(c.html, { keepLabels: [label], caseId: id, caseMarker: id });
    if (res.error) { warn(`skipping index ${c.index}: ${res.error}`); continue; }
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

  if (opts.quitWhenDone) await browser.close();
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
    try { staged = JSON.parse(fs.readFileSync(STAGING, "utf8")); } catch { staged = []; }
  }
  const ids = new Set(entries.map((e) => e.entry.id));
  staged = staged.filter((e) => !ids.has(e.id)).concat(entries.map((e) => e.entry));
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
  if (!opts.quitWhenDone) {
    console.log(`\n${YEL}A Chrome window is still open with a loopback debugging port (${opts.port}).${OFF}`);
    console.log(`${DIM}  Close that window when you are done: any local process could talk to that port${OFF}`);
    console.log(`${DIM}  while it is open${opts.dedicatedProfile ? `, and it uses a dedicated profile at ${opts.dedicatedPath}` : `, and it is your real Chrome profile with your sessions`}.${OFF}`);
  }
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

module.exports = { DEGREE_RE, labelClusters, expectationFor, LABEL_MAP_PATH };
