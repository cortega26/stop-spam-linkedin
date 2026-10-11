# Plan 078 — REA pilot evaluation (research spike, read-only)

> Status: research spike. **No production file is touched by this plan.**
> Everything here is evaluation documentation. `plans/` is excluded from the
> packaged zip by `scripts/package-extension.js` (fixed file list), so nothing
> in this directory ships.
>
> Base: `main` @ `2fb25e3e9f893d34a4b2a3df85b415cd8b80a669` (2026-10-11).
> Branch: `research/078-rea-pilot-evaluation` (local only, not pushed).

## 1. Question this spike answers

Does **Reverse Engineer Anything (REA)** (`rea-agents`) produce *incremental,
reproducible, actionable* evidence that improves the reliability of LinkedIn
Feed Control — specifically its LinkedIn feed-post container detection and its
unfinished *suggested-post* / *connection-activity* support — beyond what this
repo already gets from jsdom, Playwright, CodeGraph, ESLint and tsc?

Two sub-questions:

- **Q-A (live):** Can REA observe real LinkedIn feed structure, including the
  Suggested-post marker and connection-activity provenance?
- **Q-B (offline):** Where a live target is unavailable, does REA's passive
  browser capture or static JavaScript analysis recover anything the existing
  toolchain does not?

## 2. Scope boundary

In scope: read-only observation of (a) a dedicated, loopback-bound, fresh-profile
Chrome started by this spike, and (b) an isolated copy of the shipped extension
JS tree under `/tmp`.

Out of scope, and **not performed**: any authenticated LinkedIn session, any
automated collection from `linkedin.com`, any modification to product or release
logic, permissions, dependencies, CI, or store metadata.

The repo's own research governance already forbids automated LinkedIn collection
for Suggested-label work — `plans/research/071/protocol.md` §1.3: *"Manual
copy-paste only. Scripts, extensions, scrapers, and bulk extraction are
forbidden."* This spike inherits that prohibition unchanged.

## 3. What was executed

### 3.1 Existing baseline (all exit 0)

```
npm ci && npm run smoke && npm run lint && npm run typecheck && npm run test:unit
npm run test:extension      # smoke + interactions, both pass
```

### 3.2 REA readiness

```
npx -y rea-agents@latest --version    # 6.4.0
npx -y rea-agents@latest doctor --json
```

`doctor` reports `healthy: false`. Only the `node` check passes (24.19.0).
Failing checks are `host: unsupported_host` (detected `linuxmint 22.3`),
`hopper`/`ghidra`/`ida-registration: missing_analysis_engine`, and
`skill:identity` + all nine client `registration:*` checks as `config_drift`.
The missing engines are irrelevant to this pilot (no native analysis required).
The missing registrations mean **REA is not available as an MCP server in the
agent session** — `doctor` alone does not prove that, so it was verified
separately: the session's tool catalog contains no `rea_*` tools, and
`~/.config/opencode/opencode.jsonc` has no REA registration. REA was therefore
exercised through its **CLI only**.

`doctor`'s unsupported-host verdict is a *soft* gate for the surfaces used here:
all four REA operations below ran to completion and returned Evidence.

### 3.3 Live path — attempted, then blocked

A dedicated CDP browser was started (this is the sanctioned procedure in REA's
own `docs/browser-observation.md`):

```
node /tmp/opencode/rea-pilot/serve.cjs /tmp/opencode/rea-pilot 8788
xvfb-run -a /opt/google/chrome/chrome --remote-debugging-port=9222 \
  --user-data-dir=/tmp/opencode/rea-pilot/chrome-profile --password-store=basic \
  --no-first-run --no-default-browser-check --disable-extensions \
  --disable-component-update --disable-background-networking \
  http://127.0.0.1:8788/
```

The browser was pointed at a **synthetic fixture**
(`/tmp/opencode/rea-pilot/fixture/feed.html`, sha256
`f5c3417eaf2822776c7e7f20ed99528a491c56aa36db04e3fb5e0ef9c0929b0a`), never at a
real feed. No LinkedIn target was ever attached.

REA operations run against it:

```
npx -y rea-agents@latest list-browser-targets http://127.0.0.1:9222 --format json
npx -y rea-agents@latest inspect-web-page <TARGET_ID> --format json
npx -y rea-agents@latest analyze-web-bundle <TARGET_ID> --format json
npx -y rea-agents@latest analyze-javascript-application /tmp/opencode/rea-pilot/ext-tree \
    --artifact-format directory --format json
```

`<TARGET_ID>` was discovered at runtime from the first command. It is
browser-instance-specific and must be re-discovered on every reproduction; it is
never fabricated.

### 3.4 Same-case baseline comparison

A Playwright probe (`/tmp/opencode/rea-pilot/baseline-probe.cjs`) attached to the
**same** CDP browser and the **same** page and read the same structural facts,
so REA and the standard tooling are compared on one case, not two.

## 4. Result

**Live LinkedIn observation is blocked**, by three independent checks:

1. No loopback CDP listener existed before this spike (`ss -ltn`; `curl` to
   9222/9223/9229 all failed). The user's main Chrome runs **without**
   `--remote-debugging-port`.
2. The `chrome-devtools` MCP browser uses `--remote-debugging-pipe`, which
   `list-browser-targets` cannot consume (it requires a literal loopback CDP
   **HTTP** endpoint), and it holds only `about:blank`.
3. REA's CDP surfaces are attach-only by design and never launch a browser.
   Without an already-running, authorized, logged-in Chrome, REA cannot reach a
   real feed.

REA adds **no** capability that unblocks the decisive cases. The offline
comparison therefore carries the whole evaluation, and its outcome is:

- REA's passive capture is **strictly less informative** than the Playwright
  baseline on the same case, by explicit data-minimisation design (no attribute
  values, no DOM text).
- REA's static JS analysis of the extension is **redundant with** and far
  costlier than CodeGraph, which is already indexed for this repo.
- One genuinely non-redundant property remains (privacy-preserving,
  content-addressed shape/role snapshots), and it is recorded as a hypothesis
  for a future phase, not as a demonstrated win.

Full reasoning, evidence and cost/benefit are in `REA_PILOT_REPORT.md`,
`REA_EVIDENCE_LEDGER.md` and `REA_NEXT_ACTIONS.md` in this directory.

## 5. Verdict

`INCONCLUSIVE — LIVE EVIDENCE UNAVAILABLE`. The decisive LinkedIn behaviours were
inaccessible and no credible comparison can establish REA's advantage. **Do not
integrate REA** as a mandatory or default provider. The offline comparison did
not demonstrate incremental value and does not by itself justify a NO-GO, because
it was run on this repo's own fixture and source, where no external tool can
outperform having the source.
