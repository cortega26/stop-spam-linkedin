# Donating a real Suggested-post capture — contributor guide

This is the short operational path for the one input the Suggested-post filter
has never had: **a sanitised, real capture from a logged-in feed.** Plans 068 and
071 both closed `insufficient-data` with zero real samples, so the filter stays
unbuilt. This guide plus `sanitize.cjs` is the whole ask — about five minutes.

**Rules first.** `plans/research/071/protocol.md` §1 and §2 remain the authority on
how a capture is made and sanitised. This guide only adds the tooling step. The
hard rules, unchanged: **manual copy-paste only** — no scrapers, no extensions,
no automation against LinkedIn, no test accounts, no guessed translations. If you
cannot obtain a capture class, that is recorded as an attempt, never fabricated.

---

## 1. Capture (manual, in your own logged-in browser)

1. Open your LinkedIn feed and find a post carrying a **Suggested** header.
2. Open DevTools → Elements.
3. Select the **actor sub-description element that carries the label** (typically
   `.feed-shared-actor__sub-description` or
   `.update-components-actor__sub-description`).
4. Walk **up** to the smallest ancestor that is the post container, and copy the
   `outerHTML` of **that container only**. Nothing above it.
5. Paste into a local file, e.g. `~/capture-01.html`. Do not paste it into an
   issue, a chat, or version control — sanitise it first.

## 2. Sanitise (mechanical)

```bash
cd /path/to/stop-spam-linkedin
node plans/research/079/sanitize.cjs \
  --sanitize ~/capture-01.html \
  --id suggested-01 \
  --label Suggested \
  --out /tmp/suggested-01.html
```

Exit code `0` plus `leak findings: 0` means the output is clean. The tool will:

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
