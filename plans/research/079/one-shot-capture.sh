#!/usr/bin/env bash
#
# Plan 079 — one-shot capture admission. DEV TOOL, NOT SHIPPED.
#
# Collapses the terminal half of a Suggested-post donation to a single command:
# discover the capture -> sanitise -> verify zero leaks -> build the ten-key
# entry -> append to a staging file -> report progress against protocol §3.
#
# It does NOT touch LinkedIn and it cannot reach your browser. Two things stay
# manual, by design:
#   1. getting the post's outerHTML into a file (see plans/research/079/
#      contributor-guide.md, Routes A and B), and
#   2. typing your LinkedIn password, which no tool here ever handles.
#
# ── Usage ─────────────────────────────────────────────────────────────────
#   # after the console helper saved a capture to ~/Downloads:
#   plans/research/079/one-shot-capture.sh --id suggested-01 --label "Suggested for you"
#
#   # a negative control (a post that merely MENTIONS the word; must stay visible)
#   plans/research/079/one-shot-capture.sh --id neg-body-01 --label "Suggested" --negative
#
#   # a non-English label, after switching your LinkedIn UI locale
#   plans/research/079/one-shot-capture.sh --id suggested-es-01 --label "Sugerido" --locale es
#
#   # explicit file instead of auto-discovering the newest ~/Downloads capture
#   plans/research/079/one-shot-capture.sh --id suggested-02 --label Suggested --file ~/cap.html
#
#   # merge everything staged so far into the real corpus and run the gate
#   plans/research/079/one-shot-capture.sh --admit
#
# Default is SAFE: entries land in staged-entries.json, never in
# cases-real.json, until you explicitly pass --admit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SANITIZER="$SCRIPT_DIR/sanitize.cjs"
STAGING="$SCRIPT_DIR/staged-entries.json"
CASES071="$REPO_ROOT/plans/research/071/cases-real.json"
GATE="$REPO_ROOT/plans/research/071/probe-extensions.test.cjs"

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
die() { printf '%s\n' "${RED}error:${OFF} $*" >&2; exit 1; }
ok()  { printf '%s\n' "${GRN}ok${OFF} $*"; }
warn(){ printf '%s\n' "${YEL}note:${OFF} $*" >&2; }

print_guide() {
  cat <<'GUIDE'

HOW TO GET A CAPTURE FILE  (once per post, about a minute)

You are already logged into LinkedIn in Chrome. The script cannot do this part:
it has no access to your browser, and protocol §1a permits only a session you
started yourself.

  1. Open your LinkedIn feed in Chrome.
  2. Press F12, then click the "Console" tab.
  3. Paste the capture helper into the Console. Show it with:

         cat plans/research/079/capture-helper.js

     Select the printed text with the mouse and copy it (Ctrl+Shift+C), or open
     it in an editor instead:

         code plans/research/079/capture-helper.js

     Then paste into the Console and press Enter.
  4. The Console prints a table of posts. Find the row marked "suggested: YES"
     and run, using that row's index:

         SS_capture.download(3, "suggested-01")

     Chrome saves it to  ~/Downloads/capture-suggested-01.html
  5. Back here, re-run this script with the same --id:

         plans/research/079/one-shot-capture.sh --id suggested-01 --label "Suggested for you"

Notes
  · If Chrome asks where to save, choose the Downloads folder.
  · If no row shows "suggested: YES", scroll the feed so more posts render,
    then paste the helper again.
  · Prefer doing it by hand? DevTools → Elements → right-click the post
    container → Copy → Copy outerHTML, then:

        nano ~/capture-01.html      # Ctrl+Shift+V to paste, Ctrl+O Enter, Ctrl+X

    and pass it explicitly with  --file ~/capture-01.html
  · A "post container" is the element carrying data-id="urn:li:activity:…" or
    class="feed-shared-update-v2".
  · Run  plans/research/079/one-shot-capture.sh --guide  to see this again.

GUIDE
}

# ── arguments ─────────────────────────────────────────────────────────────
ID=""; LABEL=""; FILE=""; LOCALE="en"; NEGATIVE=0; ADMIT=0; DRY=0; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --id)       ID="${2:-}"; shift 2 ;;
    --label)    LABEL="${2:-}"; shift 2 ;;
    --file)     FILE="${2:-}"; shift 2 ;;
    --locale)   LOCALE="${2:-}"; shift 2 ;;
    --negative) NEGATIVE=1; shift ;;
    --admit)    ADMIT=1; shift ;;
    --dry-run)  DRY=1; shift ;;
    --guide)    print_guide; exit 0 ;;
    --force)    FORCE=1; shift ;;
    -h|--help)  sed -n '2,44p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

# print_guide is defined below but referenced by the arg loop, so declare it first.
[ -f "$SANITIZER" ] || die "sanitizer not found at $SANITIZER"
command -v node >/dev/null || die "node is required"
[ -f "$CASES071" ] || die "corpus not found at $CASES071 (wrong repo root?)"


# ── progress report against protocol section 3 ────────────────────────────
report_progress() {
  node -e '
    const fs = require("fs");
    const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return []; } };
    const all = [...read(process.argv[1]), ...read(process.argv[2])];
    const positives = all.filter((e) => e.expectedTarget !== null).length;
    const negatives = all.length - positives;
    const need = (have, want) => `${have >= want ? "met" : "need " + (want - have)}`;
    console.log(`  positives : ${positives}/3  (${need(positives, 3)})`);
    console.log(`  negatives : ${negatives}/2  (${need(negatives, 2)})`);
    console.log(`  layout variant (>=1) : not machine-detectable — confirm by eye that at least one capture differs from the 068 synthetic shapes`);
    if (positives >= 3 && negatives >= 2) console.log("\n  protocol §3 minimums met — re-run with --admit to merge and run the gate.");
  ' "$CASES071" "$([ -f "$STAGING" ] && echo "$STAGING" || echo /dev/null)"
}

# ── --admit: merge staging into the real corpus, then run the gate ────────
if [ "$ADMIT" -eq 1 ]; then
  [ -f "$STAGING" ] || die "nothing staged (no $STAGING)"
  count=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).length)' "$STAGING")
  [ "$count" -gt 0 ] || die "staging file is empty"
  if [ "$DRY" -eq 1 ]; then
    ok "dry run: would merge $count staged entr(y/ies) into cases-real.json"; exit 0
  fi
  node -e '
    const fs = require("fs");
    const [, stagingPath, casesPath, force] = process.argv;
    const staged = JSON.parse(fs.readFileSync(stagingPath, "utf8"));
    const current = JSON.parse(fs.readFileSync(casesPath, "utf8"));
    const seen = new Set(current.map((e) => e.id));
    const added = [];
    for (const e of staged) {
      if (seen.has(e.id)) { if (force === "1") continue; throw new Error(`duplicate id already in corpus: ${e.id}`); }
      seen.add(e.id); added.push(e);
    }
    fs.writeFileSync(casesPath, JSON.stringify([...current, ...added], null, 2) + "\n");
    fs.writeFileSync(stagingPath, "[]\n");
    console.log(`merged ${added.length} entr(y/ies) into cases-real.json`);
  ' "$STAGING" "$CASES071" "$FORCE"
  ok "corpus updated"
  echo
  printf '%s\n' "${DIM}running the unmodified plan-071 gate...${OFF}"
  if node --test "$GATE"; then
    ok "plan-071 gate passed"
  else
    warn "the gate FAILED. That is a finding, not a bug to paper over:"
    warn "  · if 'scan matches expectedTarget' failed on a positive, the label or container shape"
    warn "    your capture reveals is not what the detector expects — record it per protocol §5."
    warn "  · revert with: git checkout -- plans/research/071/cases-real.json"
    exit 1
  fi
  exit 0
fi

# ── capture path ──────────────────────────────────────────────────────────
if [ -n "$ID" ]; then
  [ -n "$LABEL" ] || die "--label is required (the EXACT header text you saw, e.g. 'Suggested' or 'Suggested for you')"
  printf '%s\n' "${DIM}declared label:${OFF} $LABEL"
  printf '%s\n' "${DIM}--label is a declaration of trust: it is preserved verbatim AND accepted by the leak"
  printf '%s\n' "verifier. Declare ONLY the structural label — never a name, headline or post text.${OFF}"

  if [ -z "$FILE" ]; then
    # newest capture from the console helper, or the documented manual name
    FILE="$(ls -t "$HOME"/Downloads/capture-*.html 2>/dev/null | head -n1 || true)"
    [ -n "$FILE" ] || FILE="$(ls -t "$HOME"/capture-*.html 2>/dev/null | head -n1 || true)"
    if [ -z "$FILE" ]; then
      printf '%s\n' "${RED}No capture file found yet.${OFF}" >&2
      printf '%s\n' "This script only does the terminal half; the browser step has not happened." >&2
      print_guide >&2
      exit 1
    fi
    warn "auto-discovered newest capture: $FILE"
  fi
  [ -f "$FILE" ] || die "capture file not found: $FILE"

  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  # ── sanitise + verify (leak check is enforced by the sanitizer's exit code)
  printf '%s\n' "${DIM}sanitising...${OFF}"
  if ! node "$SANITIZER" --sanitize "$FILE" --id "$ID" --label "$LABEL" --case-marker "$ID" --json >"$TMP/sanitised.json" 2>"$TMP/san.log"; then
    echo
    printf '%s\n' "${RED}sanitisation refused or left leaks. Output:${OFF}"
    cat "$TMP/san.log" >&2
    if [ -s "$TMP/sanitised.json" ]; then
      node -e 'for (const l of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).leaks) console.error(`  [${l.rule}] ${l.detail}`)' "$TMP/sanitised.json" >&2 || true
    fi
    echo
    warn "Nothing was written. Do NOT hand-patch the markup — report the shape instead."
    exit 1
  fi
  leaks=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).leaks.length)' "$TMP/sanitised.json")
  [ "$leaks" = "0" ] || die "leak check reported $leaks finding(s); refusing to stage"
  ok "sanitised, leak findings: 0"

  # ── build the ten-key entry
  ENTRY_TARGET='[data-case="'"$ID"'"]'
  [ "$NEGATIVE" -eq 1 ] && ENTRY_TARGET='null'
  export SS_ID="$ID" SS_LOCALE="$LOCALE" SS_TARGET="$ENTRY_TARGET" SS_NEG="$NEGATIVE"
  node -e '
    const fs = require("fs");
    const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const id = process.env.SS_ID;
    const neg = process.env.SS_NEG === "1";
    const entry = {
      id,
      purpose: neg
        ? "Donated negative control: must fail open (no target)."
        : "Donated positive control: real label in recognized post-header metadata must target the post.",
      markup: s.markup,
      scanRoot: "parent",
      expectedTarget: neg ? null : process.env.SS_TARGET,
      metadataLocale: process.env.SS_LOCALE,
      provenance: "user-contributed",
      validationStatus: "real-donated",
      sourceRef: `owner authorized-collector capture, ${new Date().toISOString().slice(0, 7)}, ${process.env.SS_LOCALE} UI locale; sanitized per protocol.md §2`,
      sanitization: "All human text replaced with placeholders via plans/research/079/sanitize.cjs; element names, classes and nesting verified unchanged; id/tracking/data-urn/srcset/script/style/comments dropped; URLs stripped of query and fragment; profile slugs and urn payloads sentinelised."
    };
    fs.writeFileSync(process.argv[2], JSON.stringify(entry, null, 2));
  ' "$TMP/sanitised.json" "$TMP/entry.json"

  # ── sanity: the entry must satisfy the plan-071 ten-key schema
  node -e '
    const e = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const keys = ["id","purpose","markup","scanRoot","expectedTarget","metadataLocale","provenance","validationStatus","sourceRef","sanitization"];
    const missing = keys.filter((k) => !(k in e));
    if (missing.length) { console.error("missing keys: " + missing.join(", ")); process.exit(1); }
    if (!["parent","post"].includes(e.scanRoot)) { console.error("bad scanRoot"); process.exit(1); }
    if (e.provenance !== "user-contributed" || e.validationStatus !== "real-donated") { console.error("bad provenance/status"); process.exit(1); }
    if (!/UI locale/.test(e.sourceRef)) { console.error("sourceRef must name the UI locale"); process.exit(1); }
  ' "$TMP/entry.json" || die "entry failed the ten-key schema preflight"
  ok "entry built and schema-checked"

  if [ "$DRY" -eq 1 ]; then
    echo; printf '%s\n' "${DIM}--- entry (dry run) ---${OFF}"; cat "$TMP/entry.json"
    echo; ok "dry run: nothing written"; exit 0
  fi

  # ── stage (never the real corpus, until --admit)
  node -e '
    const fs = require("fs");
    /* node -e exposes the first script argument at argv[1], not argv[2] */
    const [stagingPath, entryPath] = process.argv.slice(1);
    let staged = [];
    if (fs.existsSync(stagingPath)) { try { staged = JSON.parse(fs.readFileSync(stagingPath, "utf8")); } catch { staged = []; } }
    const entry = JSON.parse(fs.readFileSync(entryPath, "utf8"));
    staged = staged.filter((e) => e.id !== entry.id);
    staged.push(entry);
    fs.writeFileSync(stagingPath, JSON.stringify(staged, null, 2) + "\n");
  ' "$STAGING" "$TMP/entry.json"
  ok "staged as '$ID' in $(basename "$STAGING") (cases-real.json untouched)"

  echo
  printf '%s\n' "${DIM}protocol §3 progress:${OFF}"
  report_progress
  echo
  printf '%s\n' "${DIM}next: keep capturing, then run${OFF} $0 --admit"
  printf '%s\n' "${YEL}delete the raw capture now:${OFF} rm -f \"$FILE\""
  exit 0
fi

# ── no --id and no --admit: just report status ────────────────────────────
echo "protocol §3 progress:"
report_progress
echo
printf '%s\n' "${DIM}capture one post (see contributor-guide.md), then:${OFF}"
printf '%s\n' "  $0 --id <case-id> --label \"<exact header text>\" [--negative] [--locale en]"
