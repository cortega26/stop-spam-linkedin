# Donating a real Suggested-post capture — contributor guide

This is the short operational path for the one input the Suggested-post filter
has never had: **a sanitised, real capture from a logged-in feed.** Plans 068 and
071 both closed `insufficient-data` with zero real samples, so the filter stays
unbuilt. This guide plus `sanitize.cjs` is the whole ask — about five minutes.

**Rules first.** `plans/research/071/protocol.md` §1 (manual capture) and §2
(sanitisation) remain the authority on how a capture is made and cleaned. This
guide only adds the tooling step. The hard rules, unchanged for contributors:
**manual copy-paste only** — no scrapers, no extensions, no automation against
LinkedIn, no test accounts, no guessed translations. If you cannot obtain a
capture class, that is recorded as an attempt, never fabricated.

> **Note for the repository owner.** `071/protocol.md` §1a defines a narrowly
> bounded **authorized collector** (owner-only, own logged-in feed, single-shot
> and human-invoked, bounded scale, raw capture never committed, only sanitised
> output admitted). If you use it, everything from §2 onward in this guide is
> unchanged, and the provenance class stays `user-contributed`. See
> `plans/research/080/amendment.md` for the bounds and the reversal conditions.

---

## Fast path — one command per capture

Once you have a capture file (Route A or B below), the script does the rest —
sanitise, verify zero leaks, build the ten-key entry, stage it, and show progress
against the §3 minimums:

```bash
cd /path/to/stop-spam-linkedin

# positive (a real Suggested post)
plans/research/079/one-shot-capture.sh --id suggested-01 --label "Suggested for you"

# negative (a post that merely MENTIONS the word; must stay visible)
plans/research/079/one-shot-capture.sh --id neg-body-01 --label "Suggested" --negative

# non-English label, after switching your LinkedIn UI locale
plans/research/079/one-shot-capture.sh --id suggested-es-01 --label "Sugerido" --locale es
```

It auto-discovers the newest `~/Downloads/capture-*.html`; pass `--file PATH` to
be explicit. Add `--dry-run` to see the entry without writing anything.

Entries land in a **staging** file — `cases-real.json` is never touched until you
say so:

```bash
plans/research/079/one-shot-capture.sh --admit
```

`--admit` merges the staged entries and runs the unmodified plan-071 gate. If the
gate fails, that is a **finding**, not a bug to paper over — see §5 of
`071/protocol.md`. Revert with
`git checkout -- plans/research/071/cases-real.json`.

Two things the script will not do, by design: reach your browser, and handle your
credentials. You still capture the post yourself.

---

## 1. Capture — getting the markup onto disk

You never paste DOM into the terminal. You get it into a **file**, then point the
tool at the file. Two routes; both are permitted (`071/protocol.md` §1 for manual,
§1a for the owner's one-shot helper).

### Route A — copy/paste (no extra tooling)

1. Open your LinkedIn feed and find a post carrying a **Suggested** header.
2. Open DevTools → Elements.
3. Select the **actor sub-description element that carries the label** (typically
   `.feed-shared-actor__sub-description` or
   `.update-components-actor__sub-description`).
4. Walk **up** to the smallest ancestor that is the post container, and copy the
   `outerHTML` of **that container only**. Right-click → Copy → *Copy outerHTML*.
5. Get it into a file. This machine has **no `xclip`/`xsel`/`wl-paste`**, so use
   the terminal emulator's own paste instead — it needs no clipboard tool:

   ```bash
   nano ~/capture-01.html
   #   Ctrl+Shift+V to paste the outerHTML (or middle-click on X11)
   #   Ctrl+O, Enter  to save   ·   Ctrl+X to exit
   ```

   A heredoc works too:

   ```bash
   cat > ~/capture-01.html <<'EOF'
   #   Ctrl+Shift+V, then type EOF on its own line and press Enter
   EOF
   ```

   Or paste into a GUI editor: `xed ~/capture-01.html` or `code ~/capture-01.html`.

### Route B — the console helper (removes the element hunt)

`plans/research/079/capture-helper.js` is a snippet you paste into the DevTools
**Console**. It lists the post containers it recognises, marks which carry a
`Suggested` label, and saves one to `~/Downloads` on request. It makes no network
request, does not navigate or click, and clones the node so your live page is
never mutated.

1. Open the feed, press F12 → **Console**.
2. Paste the **entire contents** of `capture-helper.js` and press Enter. You get a
   table like:

   | index | suggested | meta | chars |
   |---|---|---|---|
   | 0 |  | Promoted | 414 |
   | 3 | YES | Suggested for you | 230 |

3. Save one post per call — **one post per invocation, not a loop**:

   ```js
   SS_capture.download(3, "suggested-01")
   ```

   → writes `~/Downloads/capture-suggested-01.html` and tags it with the
   commit-time `data-case` marker for you.

4. Continue with §2, then **delete the raw file**:
   `rm ~/Downloads/capture-suggested-01.html`.

### Declare the label you actually saw

`--label` is a *declaration of trust*: whatever you declare is preserved verbatim
and will **not** be flagged as a leak. Declare **only** the structural label you
saw in the header metadata — never a person's name, headline or post text. If the
metadata rendered a fuller phrase, declare the whole phrase:

```bash
--label "Suggested for you"      # if that is literally what the header said
```

> **This is a real finding, not a formality.** The 068 prototype and the shared
> `matchesLabel` grammar currently accept only `Suggested` or
> `Suggested · <sponsor>` — verified in this repo. A header rendering as
> `Suggested for you` produces **zero** targets: a silent false negative. The
> detector is *deliberately* not widened here, because `071/protocol.md` §4
> requires labels to be established by capture and forbids guessing them. Your
> first real capture is what settles it: if the gate's `expectedTarget` fails on a
> genuine entry, that failure *is* the finding (`071/protocol.md` §5).

## 2. Sanitise (mechanical)

```bash
cd /path/to/stop-spam-linkedin
node plans/research/079/sanitize.cjs \
  --sanitize ~/capture-01.html \
  --id suggested-01 \
  --label Suggested \
  --out /tmp/suggested-01.html
```

Exit code `0` plus `leak findings: 0` means the output is clean. A JSON-quoted
capture file is unwrapped automatically. The tool will:

* replace every human text run with `Placeholder`, keeping your `--label` and
  punctuation separators (the signal the detector keys on);
* drop `id`, `data-urn`, tracking and impression attributes, `srcset`,
  `on*` handlers, `<script>`, `<style>` and HTML comments;
* strip query strings and fragments from URLs and rewrite profile / company /
  school / showcase slugs;
* rewrite `urn:li:*` payloads to `urn:li:<kind>:71XX`, **keeping the entity
  kind** so a company URN cannot become a fake activity match;
* **refuse to emit anything** if sanitisation would change element names, class
  values or nesting (protocol §2.2), or if any tag cannot be parsed.

Review the printed output. If it looks wrong, stop and report the shape — do not
hand-patch it.

## 3. Re-verify independently

```bash
node plans/research/079/sanitize.cjs --leaks /tmp/suggested-01.html
```

(For a single file, pass it through `--sanitize` again and read the leak count, or
run `--leaks` against a corpus file.) The verifier checks each class separately:
surviving text, surviving attribute text, `id` attributes, script/style,
comments, non-sentinel URNs, URL query strings, real profile slugs, e-mail
addresses and long digit runs.

## 4. Assemble the entry

The entry must carry the full **ten-key** schema that
`plans/research/071/probe-extensions.test.cjs` enforces. Copy
`cases-real.template.json` and fill it in. Two fields need care:

* `sourceRef` must name your **UI locale** (the 071 gate asserts `/UI locale/`),
  e.g. `contributor capture, 2026-10, es UI locale; sanitized per protocol.md §2`.
* `sanitization` must describe the placeholder substitution, e.g.
  `All human text replaced with placeholders via sanitize.cjs; classes and nesting kept exactly.`

`expectedTarget` is the CSS selector, **relative to the entry's own markup**, of
the element that should be hidden — or `null` for a negative control (a post
whose body merely mentions the word and must stay visible).

## 5. Check before you send

```bash
node plans/research/079/sanitize.cjs --leaks plans/research/071/cases-real.json
node --test plans/research/071/probe-extensions.test.cjs   # ten-key schema + dedupe
node --test plans/research/079/sanitize.test.cjs           # leak verifier
```

Then attach the sanitised markup and your entry in an issue. **Never attach the
raw capture.** If you set your UI locale to a non-English language to capture a
localised label, say so in `sourceRef`; do not translate anything yourself.

---

## What counts as success (protocol §3)

| Class | Needed |
|---|---|
| Suggested positives in feed context | ≥ 3 |
| Negatives — one body-mention, one non-English label | ≥ 2 |
| Layout variant differing from the 068 synthetic shapes | ≥ 1 |

Fewer than this is an honest `insufficient-data`; the minimums are never lowered
to force a build.

## Where this fits

```
capture (you, manual)  →  sanitize.cjs (mechanical)  →  --leaks (mechanical)
                       →  ten-key schema gate (071, existing)  →  cases-real.json
                       →  068 detector → proceed | insufficient-data
```

Only step 1 needs a human. Everything after it is already mechanised or is
mechanised by this guide.
