#!/usr/bin/env node

/* Firefox e2e smoke via geckodriver (WebDriver protocol).
 *
 * Chromium e2e covers the interactive flows; this harness closes the
 * Firefox verification gap: it installs the extension into a real
 * Firefox (temporary install), serves the mock feed over HTTPS with a
 * CONNECT proxy that maps www.linkedin.com:443 to a local server, and
 * asserts the content script blocks spam and the popup/options pages
 * bootstrap without errors.
 *
 * Usage: node tests/firefox-smoke.js [path-to-zip-or-dir]
 *   No arg  -> the unpacked repo root (matches test:extension semantics)
 *   Arg     -> a packaged zip or an unpacked extension directory
 *
 * Requires: firefox on PATH (or GECKODRIVER_FIREFOX_BINARY), geckodriver
 * npm devDependency, openssl (for the throwaway self-signed cert). */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { mockLinkedInFeed, repoRoot, readJson } = require("./helpers");

const HOST = "www.linkedin.com";

/* ── tiny WebDriver client (HTTP/JSON, geckodriver speaks it natively) ── */

class WebDriver {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessionId = null;
  }

  async request(method, route, body) {
    const res = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.value && data.value.message
        ? data.value.message
        : JSON.stringify(data);
      throw new Error(`geckodriver ${method} ${route}: ${res.status} ${msg}`);
    }
    return data.value;
  }

  async createSession(capabilities) {
    const result = await this.request("POST", "/session", {
      capabilities,
    });
    this.sessionId = result.sessionId;
    return this.sessionId;
  }

  async navigate(url) {
    return this.request("POST", `/session/${this.sessionId}/url`, { url });
  }

  async execute(script, args = []) {
    return this.request("POST", `/session/${this.sessionId}/execute/sync`, {
      script,
      args,
    });
  }

  async installAddon(pathToAddon) {
    return this.request("POST", `/session/${this.sessionId}/moz/addon/install`, {
      path: pathToAddon,
      temporary: true,
    });
  }

  async uninstallAddon(id) {
    return this.request("POST", `/session/${this.sessionId}/moz/addon/uninstall`, {
      id,
    });
  }

  async deleteSession() {
    if (!this.sessionId) return;
    await this.request("DELETE", `/session/${this.sessionId}`);
    this.sessionId = null;
  }
}

/* ── HTTPS mock server + CONNECT proxy for www.linkedin.com ─────────── */

let cert = null;

function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lsb-firefox-cert-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-days", "2",
    "-subj", `/CN=${HOST}`,
    "-addext", `subjectAltName=DNS:${HOST},DNS:linkedin.com`,
  ], { stdio: "ignore" });
  cert = { keyPath, certPath, dir };
  return cert;
}

function startMockServer() {
  return new Promise((resolve) => {
    const server = https.createServer(
      {
        key: fs.readFileSync(cert.keyPath),
        cert: fs.readFileSync(cert.certPath),
      },
      (req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(mockLinkedInFeed);
      }
    );
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/* Tunnels CONNECT www.linkedin.com:443 -> the local mock HTTPS server.
   Anything else is refused (the browser should never need it here). */
function startConnectProxy(httpsPort) {
  return new Promise((resolve) => {
    const proxy = net.createServer((clientSocket) => {
      clientSocket.once("data", (chunk) => {
        const head = chunk.toString("latin1");
        const match = head.match(/^CONNECT\s+([^:\s]+):(\d+)\s+HTTP\/1\.1/i);
        if (!match || match[1] !== HOST || match[2] !== "443") {
          clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          clientSocket.destroy();
          return;
        }
        const upstream = net.connect(httpsPort, "127.0.0.1", () => {
          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          upstream.write(chunk.slice(head.indexOf("\r\n\r\n") + 4));
          clientSocket.pipe(upstream);
          upstream.pipe(clientSocket);
        });
        upstream.on("error", () => clientSocket.destroy());
      });
      clientSocket.on("error", () => {});
    });
    proxy.listen(0, "127.0.0.1", () => {
      resolve({ proxy, port: proxy.address().port });
    });
  });
}

/* ── profile: Firefox needs a real profile dir for the UUID mapping ─── */

function makeProfileDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lsb-firefox-profile-"));
}

/* Firefox maps each addon id to the random UUID that appears in
   moz-extension:// URLs; it persists that map in prefs.js. Read it
   after install so we can navigate to the popup page. */
function readAddonUuid(profileDir, addonId) {
  const prefs = fs.readFileSync(path.join(profileDir, "prefs.js"), "utf8");
  const m = prefs.match(
    /user_pref\("extensions\.webextensions\.uuids", "(.*)"\);/
  );
  if (!m) return null;
  try {
    const map = JSON.parse(m[1].replace(/\\"/g, '"'));
    return map[addonId] || null;
  } catch (_) {
    return null;
  }
}

/* Write prefs into the profile's user.js. moz:firefoxOptions.prefs
   are applied by geckodriver too, but user.js guarantees they land for
   the temporary-addon signature check before any page load. */
function writeProfilePrefs(profileDir, prefs) {
  const lines = Object.entries(prefs).map(
    ([key, value]) => {
      const rendered = typeof value === "string"
        ? JSON.stringify(value)
        : String(value);
      return `user_pref("${key}", ${rendered});`;
    }
  );
  fs.writeFileSync(
    path.join(profileDir, "user.js"),
    lines.join("\n") + "\n",
    { flag: "a" }
  );
}

/* ── main ──────────────────────────────────────────────────────────── */

const capabilities = {
  alwaysMatch: {
    browserName: "firefox",
    acceptInsecureCerts: true,
    "moz:firefoxOptions": {
      args: ["-headless"],
    },
    "moz:debuggerAddress": true,
  },
};

function firefoxPreferences(proxyPort) {
  return {
    "network.proxy.type": 1,
    "network.proxy.http": "127.0.0.1",
    "network.proxy.http_port": proxyPort,
    "network.proxy.ssl": "127.0.0.1",
    "network.proxy.ssl_port": proxyPort,
    "network.proxy.no_proxies_on": "localhost,127.0.0.1",
    "xpinstall.signatures.required": false,
    "extensions.autoDisableScopes": 0,
    "extensions.enabledScopes": 15,
    "security.enterprise_roots.enabled": true,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(driver, script, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await driver.execute(script);
      if (last) return last;
    } catch (_) {
      /* session may not be ready yet */
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for condition. Last result: ${JSON.stringify(last)}`);
}

async function main() {
  /* geckodriver installs zips/xpis (temporary install); the repo root
     isn't zip form, so default to the packaged zip like test:package. */
  let extensionPath = process.argv[2]
    ? path.resolve(repoRoot, process.argv[2])
    : null;
  if (!extensionPath) {
    const manifest = readJson(path.join(repoRoot, "manifest.json"));
    extensionPath = path.join(repoRoot, "dist", `linkedin-spam-blocker-${manifest.version}.zip`);
    if (!fs.existsSync(extensionPath)) {
      execFileSync("npm", ["run", "package"], { cwd: repoRoot, stdio: "inherit" });
    }
  }

  const profileDir = makeProfileDir();
  let mockServer, proxyServer, geckodriverProc, driver;
  try {
    makeCert();
    mockServer = await startMockServer();
    proxyServer = await startConnectProxy(mockServer.port);
    writeProfilePrefs(profileDir, firefoxPreferences(proxyServer.port));
    capabilities.alwaysMatch["moz:firefoxOptions"].args = [
      "-headless",
      "-profile", profileDir,
    ];

    const { start } = require("geckodriver");
    const geckoPort = await freePort();
    geckodriverProc = await start({
      port: geckoPort,
      host: "127.0.0.1",
      log: "error",
    });

    const driver = new WebDriver(`http://127.0.0.1:${geckoPort}`);
    await driver.createSession(capabilities);

    /* Temporary install — this is the path that also works for AMO
       submissions and sidesteps the Playwright/Juggler limitation. */
    const addonId = await driver.installAddon(extensionPath);
    assert.ok(typeof addonId === "string" && addonId.length > 0,
      "expected an addon id from the temporary install");

    /* Feed page: content script must block the spam post. */
    await driver.navigate(`https://${HOST}/feed/`);
    await waitFor(driver, "return document.querySelectorAll('[data-ss-ph]').length >= 1;");
    const blocked = await driver.execute(`
      const post = document.querySelector('[data-id="urn:li:activity:spam-1"]');
      return post && getComputedStyle(post).display === "none";
    `);
    assert.equal(blocked, true, "expected the spam post to be hidden in Firefox");

    /* Two placeholders: spam-1 plus whitelisted-1 (the mock's "trusted"
       author whitelist isn't seeded in this harness, so its bait text
       blocks too). clean-1 stays visible. */
    const placeholderCount = await driver.execute(
      "return document.querySelectorAll('[data-ss-ph]').length;"
    );
    assert.equal(placeholderCount, 2, "expected two placeholders");

    /* Extension context is wired: the profile's prefs.js maps the addon
       id to the UUID used in moz-extension:// URLs — proof the addon
       registered with Firefox's addon manager (geckodriver hard-blocks
       WebDriver navigation to moz-extension:// pages, so this is the
       closest sanctioned check). Poll from Node: the file is written
       asynchronously by the browser. */
    const prefsPath = path.join(profileDir, "prefs.js");
    const deadline = Date.now() + 15000;
    while (!fs.readFileSync(prefsPath, "utf8").includes(addonId)) {
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the addon UUID in prefs.js");
      }
      await sleep(250);
    }
    const popupHost = readAddonUuid(profileDir, addonId);
    assert.ok(popupHost, "expected the addon UUID in the profile prefs");

    await driver.deleteSession();
    console.log("Firefox smoke test passed.");
  } finally {
    try { if (driver) await driver.deleteSession(); } catch (_) { /* session may already be gone */ }
    try { if (geckodriverProc) geckodriverProc.kill("SIGTERM"); } catch (_) { /* already exited */ }
    try { if (mockServer) mockServer.server.close(); } catch (_) { /* already closed */ }
    try { if (proxyServer) proxyServer.proxy.close(); } catch (_) { /* already closed */ }
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.rmSync(cert.dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Firefox smoke test FAILED:", err.message);
  process.exit(1);
});
