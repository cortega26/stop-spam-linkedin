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

/* Chrome 136+ does NOT respect --remote-debugging-port when the user-data-dir is
 * the platform's DEFAULT Chrome directory; the flag is silently ignored. A
 * non-standard directory also uses a different encryption key, so a copy of a
 * real profile will not decrypt either. Reusing a real Chrome profile for
 * debugging is therefore impossible by design, not a matter of the right flag.
 * Verified against developer.chrome.com/blog/remote-debugging-port (2025-03-17).
 * We name the default directories only to REFUSE them with an explanation. */
const DEFAULT_PROFILE_DIRS = Object.freeze([
  path.join(os.homedir(), ".config", "google-chrome"),
  path.join(os.homedir(), ".config", "google-chrome-beta"),
  path.join(os.homedir(), ".config", "google-chrome-unstable"),
  path.join(os.homedir(), ".config", "chromium"),
]);

function isDefaultProfileDir(dir) {
  const resolved = path.resolve(dir);
  return DEFAULT_PROFILE_DIRS.some((d) => path.resolve(d) === resolved);
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
  dedicatedProfile: true,
  dedicatedPath: path.join(os.homedir(), ".cache", "ss-capture-profile"),
  dedicatedPathSet: false,
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

/* Label FAMILIES per UI language, used ONLY to find candidate posts. A family is
 * a stem: "Sugerido" matches "Sugerido", "Sugerido para ti", "Sugerido · Acme".
 *
 * This is not the "guessed translation" that 071/protocol.md §4 forbids: that
 * rule governs the DETECTOR's accepted labels, which must be established by
 * capture. Here the list is a finder. If a family is wrong the tool simply finds
 * nothing and says so; it never asserts what LinkedIn renders. The capture is
 * still what establishes the label, and the exact string found is what gets
 * recorded and preserved.
 */
const LABEL_FAMILIES = Object.freeze({
  en: ["Suggested", "Promoted"],
  es: ["Sugerido", "Sugerencias", "Recomendado", "Promocionado", "Patrocinado"],
  fr: ["Suggéré", "Suggestion", "Recommandé", "Sponsorisé"],
  pt: ["Sugerido", "Sugestão", "Sugestões", "Recomendado", "Patrocinado"],
  de: ["Vorgeschlagen", "Empfohlen", "Gesponsert", "Anzeige"],
});

/* Short strings that are never a recommendation label: reaction/comment counts,
   timestamps, and common UI verbs. Keeps the pick list readable. */
const SHORT_NOISE_RE = /^[\d.,\s]+$|^\d+\s*\p{L}{1,4}$|\b(reacciones?|comentarios?|recompartir|compartir|comentar|me gusta|seguir|reactions?|comments?|reposts?|like|share|comment|follow|followers?|seguidores?)\b/iu;

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
    else if (a === "--meta-selector") out.metaSelector = argv[++i];
    else if (a === "--dry-run") out.dry = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--close-chrome") out.closeChrome = true;
    else if (a === "--quit-when-done") out.quitWhenDone = true;
    else if (a === "--with-extensions") out.withExtensions = true;
    else if (a === "--dedicated-profile") out.dedicatedProfile = true;
    else if (a === "--dedicated-path") { out.dedicatedPath = argv[++i]; out.dedicatedProfile = true; out.dedicatedPathSet = true; }
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--prefix") out.prefix = argv[++i];
    else if (a === "--max-positives") out.maxPositives = Number(argv[++i]);
    else if (a === "--max-negatives") out.maxNegatives = Number(argv[++i]);
    else if (a === "--max-scrolls") out.maxScrolls = Number(argv[++i]);
    else if (a === "--suggested-label") out.suggestedLabel = argv[++i];
    else if (a === "--use-language") out.useLanguage = argv[++i];
    else if (a === "--forget-labels") out.forgetLabels = true;
    else if (a === "--chrome-profile") { out.chromeProfile = argv[++i]; out.dedicatedProfile = false; }
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

  /* Refuse the default profile immediately and explain, rather than burning the
     45s timeout on a flag Chrome has already decided to ignore. */
  if (!opts.dedicatedProfile && isDefaultProfileDir(opts.chromeProfile)) {
    die(
      `${opts.chromeProfile} is Chrome's DEFAULT profile directory.\n` +
        "  Chrome 136+ ignores --remote-debugging-port there, so this cannot work — the flag\n" +
        "  is silently dropped on purpose (developer.chrome.com/blog/remote-debugging-port).\n" +
        "  A non-standard directory also uses a different encryption key, so copying your\n" +
        "  profile would not decrypt either. A separate profile is the only option:\n\n" +
        `    node plans/research/079/capture-live.cjs --dedicated-profile\n\n` +
        "  That profile persists, so you log into LinkedIn there once and never again."
    );
  }

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
    warn("using the persistent capture profile (a separate profile is required — see below)");
  }

  const { args, userDataDir } = launchArgs(opts);
  console.error(`${DIM}    launching: ${args[0]} ${args[1]}${OFF}`);
  console.error(`${DIM}    profile:   ${userDataDir}${OFF}`);
  /* Keep Chrome's own diagnostics. An earlier version used stdio:"ignore" and so
     discarded the very message that explains why the port never opened. */
  const logPath = path.join(os.tmpdir(), `ss-capture-chrome-${process.pid}.log`);
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(exe, args, { detached: true, stdio: ["ignore", logFd, logFd] });
  child.unref();
  fs.closeSync(logFd);

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await endpointUp(opts.port)) return { launched: true, logPath };
    await new Promise((r) => setTimeout(r, 900));
  }

  let tail = "";
  try {
    tail = fs.readFileSync(logPath, "utf8").trim().split("\n").slice(-8).join("\n");
  } catch {
    /* nothing captured */
  }
  console.error(`${YEL}Chrome did not expose port ${opts.port} in 45s.${OFF}`);
  console.error(`  profile: ${userDataDir}`);
  if (tail) console.error(`  Chrome said:\n${tail}`);
  else console.error(`  (Chrome produced no output; log: ${logPath})`);
  die("see the message above");
}

/* ── reading and scrolling ──────────────────────────────────────────────── */

/**
 * Per-selector census, so a selector mismatch is a fact rather than a guess.
 * Read-only. Reports counts and short header strings only.
 */
async function selectorCensus(page, metaSelector) {
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
        "article",
        '[data-testid="expandable-text-box"]',
      ],
      metaSelector: metaSelector || META_SELECTOR,
      skeletonLimit: 28,
    }
  );
}

/**
 * Element skeleton (tag + class only, never text) for the first couple of
 * candidates. Class names are structural, not personal data, and they are
 * exactly what is needed to fix a selector that no longer matches.
 */
async function headerSkeleton(page) {
  return page.evaluate(
    ({ postSelector, limit }) => {
      const posts = Array.from(document.querySelectorAll(postSelector)).slice(0, 2);
      return posts.map((post) => {
        const lines = [];
        const walk = (el, depth) => {
          if (lines.length >= limit) return;
          const cls = (el.getAttribute("class") || "").trim();
          const testid = el.getAttribute("data-testid");
          const parts = [`${"  ".repeat(depth)}<${el.tagName.toLowerCase()}`];
          if (cls) parts.push(` class="${cls}"`);
          if (testid) parts.push(` data-testid="${testid}"`);
          parts.push(">");
          lines.push(parts.join(""));
          for (const child of el.children) walk(child, depth + 1);
        };
        walk(post, 0);
        return lines.join("\n");
      });
    },
    { postSelector: POST_SELECTOR, limit: 28 }
  );
}

/**
 * Asks the browser whether each selector is even valid. A typo'd
 * --meta-selector should name the CSS error, not silently match nothing.
 * (A bare class name such as `actor__subtitle` is valid CSS meaning a TAG, so it
 * parses and matches nothing — which is why the zero-match check below also
 * exists.)
 */
async function checkSelectors(page, selectors) {
  return page.evaluate((sels) => {
    const bad = [];
    for (const sel of sels) {
      if (!sel) continue;
      try {
        document.querySelectorAll(sel);
      } catch (err) {
        bad.push({ sel, message: err.message });
      }
    }
    return bad;
  }, selectors);
}

async function readPage(page, metaSelector) {
  return page.evaluate(
    ({ postSelector, extraSelector }) => {
      const uiLocale = (document.documentElement.getAttribute("lang") || "").trim();
      const all = Array.from(document.querySelectorAll(postSelector));
      const outermost = all.filter((el) => !(el.parentElement && el.parentElement.closest(postSelector)));

      const candidates = outermost.map((el) => {
        /* Collect SHORT text strings from every element in the post. This is
           deliberately class-independent: LinkedIn's current feed uses hashed
           atomic class names (gflkzy, gflkxr, ...) that change every deploy, so
           any class-based selector for the header slot is worthless. Text is the
           only stable signal. Degrees like "• 2º" are filtered out later. */
        const shortTexts = new Set();
        for (const node of el.querySelectorAll("*")) {
          const t = (node.textContent || "").trim();
          if (t && t.length <= 60) shortTexts.add(t);
        }
        if (extraSelector) {
          for (const node of el.querySelectorAll(extraSelector)) {
            const t = (node.textContent || "").trim();
            if (t) shortTexts.add(t);
          }
        }
        const fullText = el.textContent || "";
        return {
          shortTexts: [...shortTexts],
          bodyMentionsSuggest: /suggest|suger|vorgeschlagen|suggér|sugest/i.test(fullText),
          shape: el.getAttribute("data-id") ? "legacy" : el.matches('[role="listitem"]') ? "modern" : "other",
          enumerable: !!el.getAttribute("data-id") || el.classList.contains("feed-shared-update-v2"),
          html: el.outerHTML,
        };
      });
      return { uiLocale, candidates };
    },
    { postSelector: POST_SELECTOR, extraSelector: metaSelector || null }
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
  let stepsRun = 0;
  let stoppedReason = "target-reached";
  const key = (c) => `${c.html.length}:${c.html.slice(0, 160)}`;

  for (let step = 0; step <= budget; step += 1) {
    stepsRun = step;
    const data = await readPage(page, opts.metaSelector);
    if (data.uiLocale) locale = data.uiLocale;
    let added = 0;
    for (const c of data.candidates) {
      if (!seen.has(key(c))) { seen.set(key(c), c); added += 1; }
    }
    const list = [...seen.values()].map((c, i) => ({ ...c, index: i }));

    if (added > 0) {
      console.error(`${DIM}    ${list.length} post(s) collected (scroll ${step}/${budget})${OFF}`);
    }
    if (accept && accept(list)) { stoppedReason = "target-reached"; break; }
    if (!accept && target && list.length >= target) { stoppedReason = "target-reached"; break; }
    if (step === budget) { stoppedReason = "budget"; break; }
    if (quiet >= 3) { stoppedReason = "feed-stopped-growing"; break; }

    /* Scroll the LAST POST into view rather than window.scrollBy: LinkedIn may
       scroll the window or an inner container, and scrollIntoView works either
       way. Growth is detected by the identity of the tail post changing, because
       LinkedIn unmounts posts as it mounts others, so a raw count can stay flat
       while new content loads. (An earlier version compared the deduped count
       against the raw DOM count, which was simply incomparable.) */
    const grew = await page.evaluate(
      async ({ postSelector, beforeKey, timeoutMs }) => {
        const tailKey = () => {
          const all = document.querySelectorAll(postSelector);
          const tail = all[all.length - 1];
          return tail ? `${all.length}:${tail.outerHTML.slice(0, 160)}` : "0:";
        };
        const before = tailKey();
        const all = document.querySelectorAll(postSelector);
        const tail = all[all.length - 1];
        if (tail) tail.scrollIntoView({ block: "end" });
        else window.scrollBy(0, window.innerHeight);
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (tailKey() !== before) return true;
          await new Promise((r) => setTimeout(r, 150));
        }
        return false;
      },
      { postSelector: POST_SELECTOR, timeoutMs: 2500 }
    );
    if (!grew) quiet += 1; else quiet = 0;
  }
  return {
    uiLocale: locale,
    candidates: [...seen.values()].map((c, i) => ({ ...c, index: i })),
    stepsRun,
    stoppedReason,
  };
}

/* ── label resolution (never guessed) ───────────────────────────────────── */

function labelClusters(candidates) {
  const counts = new Map();
  for (const c of candidates) {
    for (const text of c.shortTexts || []) {
      if (DEGREE_RE.test(text)) continue; /* organic: from your network */
      if (SHORT_NOISE_RE.test(text)) continue; /* counts, timestamps, UI verbs */
      counts.set(text, (counts.get(text) || 0) + 1);
    }
  }
  /* Label-like strings first: short, no terminal period, no digits. A post body
     that happens to be short would otherwise sit above the real label. */
  const labelLike = (t) => /^\S+(?:\s+\S+){0,3}$/.test(t) && !/[.。!?]$/.test(t) && !/\d/.test(t);
  return [...counts.entries()]
    .map(([text, count]) => ({ text, count, labelLike: labelLike(text) }))
    .sort((a, b) => (a.labelLike === b.labelLike ? b.count - a.count : a.labelLike ? -1 : 1))
    .slice(0, 15);
}

/**
 * Does a header string belong to a label family? Exact match, or the family as a
 * stem followed by a space (which covers "Sugerido para ti" and
 * "Sugerido · Acme"). Class-independent on purpose.
 */
function matchLabelText(text, family) {
  if (!text || !family) return null;
  if (text === family) return text;
  if (text.startsWith(family + " ")) return text;
  return null;
}

/** The ACTUAL header string for this post, or null. Used verbatim downstream. */
function postLabelText(candidate, family) {
  for (const text of candidate.shortTexts || []) {
    const hit = matchLabelText(text, family);
    if (hit) return hit;
  }
  return null;
}

function postHasLabel(candidate, family) {
  return postLabelText(candidate, family) !== null;
}

/** Which families actually occur, and the exact strings seen for each. */
function detectFamilies(candidates, locale) {
  const families = LABEL_FAMILIES[locale] || LABEL_FAMILIES.en;
  const found = [];
  for (const family of families) {
    const seen = new Map();
    for (const c of candidates) {
      const text = postLabelText(c, family);
      if (text) seen.set(text, (seen.get(text) || 0) + 1);
    }
    if (seen.size) {
      found.push({
        family,
        posts: [...seen.values()].reduce((a, b) => a + b, 0),
        variants: [...seen.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count),
      });
    }
  }
  /* Longest family first: "Sugerido para ti" is a more specific reading than
     "Sugerido", and a family that only matches as a stem is reported as such. */
  return found.sort((a, b) => b.family.length - a.family.length);
}

/**
 * Decides which label family to look for, in this order: an explicit flag, a
 * remembered choice, an AUTOMATIC detection from the page's own language, then
 * an interactive pick. A declared or remembered family that matches nothing
 * falls through rather than aborting, because the point is to find the label.
 */
async function resolveSuggestedLabel(opts, locale, candidates, clusters, map) {
  const detected = detectFamilies(candidates, locale);

  const describe = (d) =>
    d.variants.map((v) => `${JSON.stringify(v.text)} x${v.count}`).join(", ");

  if (opts.suggestedLabel) {
    const hit = detected.find((d) => d.family.toLowerCase() === opts.suggestedLabel.toLowerCase());
    if (hit) return { family: hit.family, source: "--suggested-label" };
    /* The declared string may be a full variant rather than a stem. */
    const asVariant = detected.find((d) => d.variants.some((v) => v.text === opts.suggestedLabel));
    if (asVariant) return { family: asVariant.family, source: "--suggested-label" };
    warn(`--suggested-label ${JSON.stringify(opts.suggestedLabel)} matched nothing on this page.`);
    if (detected.length) {
      warn(`but these ${locale} label families DID match: ${detected.map((d) => `${d.family} (${describe(d)})`).join("; ")}`);
    }
    /* fall through: auto-detection may still succeed */
  }

  const remembered = map[locale] && map[locale].suggestedLabel;
  if (remembered) {
    const hit = detected.find((d) => d.family.toLowerCase() === remembered.toLowerCase());
    if (hit) return { family: hit.family, source: `remembered for "${locale}"` };
  }

  /* AUTO-DETECTION. Families are ordered longest-first, so "Sugerido para ti"
     wins over "Sugerido" when both could match. */
  const suggested = detected.filter((d) => !/promocionad|patrocinad|promoted|gesponsert|anzeige|sponsoris/i.test(d.family));
  if (suggested.length === 1) {
    return { family: suggested[0].family, source: `auto-detected for "${locale}" (${describe(suggested[0])})` };
  }
  if (suggested.length > 1) {
    return {
      family: suggested[0].family,
      source: `auto-detected for "${locale}"; candidates were ${suggested.map((d) => d.family).join(", ")} — took the most specific`,
    };
  }
  if (detected.length === 1 && !suggested.length) {
    /* Only a Promoted/Sponsored family matched: that is not what we want, but
       say so plainly rather than silently finding nothing. */
    warn(`the only label family present is ${JSON.stringify(detected[0].family)} (promoted/sponsored), not a Suggested label.`);
  }

  if (clusters.length === 0) return { family: null };

  console.error(`\n${DIM}No ${locale} label family matched automatically. Header strings that are NOT a connection degree:${OFF}`);
  clusters.forEach((c, i) =>
    console.error(
      `  ${i + 1}. ${JSON.stringify(c.text)}  ${DIM}(${c.count} post${c.count > 1 ? "s" : ""})${c.labelLike ? " " + GRN + "<- label-like" + OFF + DIM : ""}${OFF}`
    )
  );

  if (!process.stdin.isTTY) {
    console.error(`\n${YEL}not a terminal, so I cannot ask.${OFF} Re-run with the stem you want:`);
    clusters.slice(0, 3).forEach((c) => console.error(`  --suggested-label ${JSON.stringify(c.text.split(" ")[0])}`));
    console.error(`${DIM}(pass just the leading word: it is treated as a stem, so "Sugerido" matches "Sugerido para ti".)${OFF}`);
    return { family: null };
  }
  const answer = await ask(`\nWhich one is the Suggested label? [1-${clusters.length}, or Enter to abort] `);
  const pick = Number(answer);
  if (!Number.isInteger(pick) || pick < 1 || pick > clusters.length) return { family: null };
  const chosen = clusters[pick - 1].text.split(" ")[0];
  map[locale] = { ...(map[locale] || {}), suggestedLabel: chosen };
  writeLabelMap(map);
  ok(`remembered stem ${JSON.stringify(chosen)} for UI locale "${locale}" (at ${LABEL_MAP_PATH})`);
  return { family: chosen, source: "your choice, now remembered" };
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
        "  --dedicated-profile       (DEFAULT) persistent capture profile - required, because\n" +
        "                            Chrome 136+ blocks debugging on the default dir\n" +
        "  --dedicated-path DIR      where that persistent profile lives\n" +
        "  --chrome-profile DIR      your Chrome user-data-dir\n" +
        "  --profile-directory NAME  Default, \"Profile 2\", ...\n" +
        "  --close-chrome            close a running Chrome without asking\n" +
        "  --quit-when-done          close the capture browser when finished\n" +
        "  --with-extensions         do not disable extensions\n" +
        "  --attach                  use an already-running debug port instead of launching\n" +
        "  --dry-run                 show what would be staged, write nothing\n" +
        "  --diagnose                report which selectors match your feed, then exit" +
        "  --meta-selector SEL       override the header-metadata selector"
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
    const census = await selectorCensus(page, opts.metaSelector);
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
    const skeletons = await headerSkeleton(page);
    if (skeletons.length) {
      console.log(`\n${DIM}element skeleton of the first post(s) — tag + class only, no text:${OFF}`);
      console.log(skeletons[0]);
    }
    console.log(`\n${DIM}These are header-slot strings (connection degree or label), not post bodies.${OFF}`);
    console.log(`${DIM}If a Suggested post is on screen but its label is not listed above, send me this output.${OFF}`);
    if (opts.quitWhenDone) await browser.close();
    return 0;
  }

  const metaSel = opts.metaSelector || META_SELECTOR;
  const badSelectors = await checkSelectors(page, [POST_SELECTOR, metaSel]);
  if (badSelectors.length) {
    for (const b of badSelectors) warn(`invalid CSS selector ${JSON.stringify(b.sel)}: ${b.message}`);
    if (opts.metaSelector) {
      console.error("    A bare class name is valid CSS but means a TAG. Use a dot: --meta-selector \".my-class\"");
    }
    await browser.close();
    return 1;
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

  const metaElementsSeen = gathered.candidates.reduce((n, c) => n + (c.shortTexts || []).length, 0);
  if (metaElementsSeen === 0 && opts.metaSelector) {
    warn(`--meta-selector ${JSON.stringify(opts.metaSelector)} matched no header elements on this page.`);
    console.error("    Run --diagnose to see the real element skeleton and pick the right class.");
    if (opts.quitWhenDone) await browser.close();
    return 1;
  }

  const locale = (opts.useLanguage || gathered.uiLocale.split("-")[0] || "en").toLowerCase();
  const clusters = labelClusters(gathered.candidates);
  const resolved = await resolveSuggestedLabel(opts, locale, gathered.candidates, clusters, map);
  const family = resolved.family;
  if (!family) {
    console.error(`\n${YEL}No Suggested label chosen, so nothing was staged.${OFF}`);
    if (opts.quitWhenDone) await browser.close();
    return 1;
  }
  ok(`UI locale ${JSON.stringify(gathered.uiLocale || "?")} → metadataLocale "${locale}"; label family ${JSON.stringify(family)} (${resolved.source})`);

  const countWithLabel = (list) => list.filter((c) => postHasLabel(c, family)).length;
  if (countWithLabel(gathered.candidates) === 0) {
    console.error(`${DIM}    none yet — scrolling further for ${JSON.stringify(family)}...${OFF}`);
    gathered = await gather(page, opts, {
      accept: (list) => countWithLabel(list) >= Math.min(needed, opts.maxPositives),
      budget: opts.maxScrolls,
    });
  }

  const { candidates } = gathered;
  const matched = candidates.filter((c) => postHasLabel(c, family));
  if (matched.length === 0) {
    if (gathered.stoppedReason === "feed-stopped-growing") {
      warn(`no post carries ${JSON.stringify(family)}, and the feed stopped yielding new posts after ${gathered.stepsRun} scroll(s).`);
      console.error("    The scroll budget was NOT the limit, so raising --max-scrolls will not help.");
    } else {
      warn(`no post carries ${JSON.stringify(family)} after ${gathered.stepsRun} scroll(s) (budget exhausted).`);
      console.error(`    Worth retrying with a bigger budget:  --max-scrolls ${opts.maxScrolls * 3}`);
    }
    console.error("");
    console.error("    These are the header strings I did find on this page — the real label should be among them:");
    const seen = labelClusters(candidates).filter((c) => c.labelLike).slice(0, 12);
    if (seen.length) seen.forEach((c) => console.error(`      ${JSON.stringify(c.text)}  (${c.count} post${c.count > 1 ? "s" : ""})`));
    else console.error("      (none that look label-like)");
    console.error("");
    console.error("    Re-run naming the leading word of the right one; it is treated as a stem:");
    if (seen.length) console.error(`      --suggested-label ${JSON.stringify(seen[0].text.split(" ")[0])}`);
    if (opts.quitWhenDone) await browser.close();
    return 1;
  }

  const positives = matched.filter((c) => !expectationFor(postLabelText(c, family) || family, c, locale).negative);
  const chosen = [];
  /* Matched posts are NOT force-negatived: expectationFor decides, and its reason
     is the precise documented one ("English-only label set", "not enumerable").
     forceNegative is only for the non-matching control posts added below. */
  for (const c of (positives.length ? positives : matched).slice(0, opts.maxPositives)) chosen.push({ ...c });

  const others = candidates.filter((c) => !postHasLabel(c, family));
  const bodyMention = others.find((c) => c.bodyMentionsSuggest);
  if (bodyMention) chosen.push({ ...bodyMention, forceNegative: true });
  const posShape = chosen[0] ? chosen[0].shape : "legacy";
  const variant = others.find((c) => c.shape !== posShape && c !== bodyMention);
  if (variant && chosen.filter((c) => c.forceNegative).length < opts.maxNegatives) {
    chosen.push({ ...variant, forceNegative: true });
  }

  if (opts.verbose) {
    console.table(candidates.slice(0, 25).map((c) => ({
      index: c.index,
      hasLabel: postHasLabel(c, family) ? "YES" : "",
      shape: c.shape,
      body: c.bodyMentionsSuggest ? "mentions" : "",
      selected: chosen.some((x) => x.index === c.index) ? "yes" : "",
    })));
  }

  const entries = [];
  let seq = 0;
  for (const c of chosen) {
    seq += 1;
    /* The label text may vary per post ("Sugerido para ti" vs "Sugerido · Acme"),
       so each post is sanitised against the string it actually carries. */
    const actualLabel = postLabelText(c, family) || family;
    const exp = c.forceNegative
      ? { negative: true, reason: "selected as a fail-open negative control" }
      : expectationFor(actualLabel, c, locale);
    const id = `${opts.prefix}-${exp.negative ? "neg" : "pos"}-${String(seq).padStart(2, "0")}`;
    const res = sanitizeMarkup(c.html, { keepLabels: [actualLabel], caseId: id, caseMarker: id });
    if (res.error) { warn(`skipping index ${c.index}: ${res.error}`); continue; }
    const leaks = findLeaks(res.markup, { keepLabels: [actualLabel] });
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
          "Detected label phrase preserved verbatim; all other human text replaced with placeholders; element names, classes and nesting verified unchanged; " +
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

module.exports = { DEGREE_RE, SHORT_NOISE_RE, LABEL_FAMILIES, labelClusters, matchLabelText, postLabelText, postHasLabel, detectFamilies, expectationFor, LABEL_MAP_PATH };
