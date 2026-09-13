# Plan 062: Refresh the store listing copy (1.5.0 features, EN + ES)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c0e2e28..HEAD -- STORE_ASSETS.md tests/verify-amo-listing.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW for the repo change; the live AMO PATCH is a reviewer/operator step (Step 4), credential-gated, after the copy is approved
- **Depends on**: none. The copy targets the 1.5.0 feature set (all merged).
- **Category**: direction (store copy refresh — the source of truth in `STORE_ASSETS.md`; Chrome paste + AMO PATCH per `RELEASE_CHECKLIST.md`)
- **Planned at**: commit `c0e2e28`, 2026-09-13, on `main` (post-release-1.5.0)

## Why this matters

The listing copy in `STORE_ASSETS.md` describes the 1.4.0 feature set:
never-hide phrases, the match tester, per-pattern stats, comment-level
blocking, school/showcase coverage, persistent suggestions, and the
first-run walkthrough are all missing — yet they are the product's most
differentiating features. The stores are the only marketing surface this
extension has, and the AMO listing is API-verifiable (the 050-era
verification tool asserts the live copy contains distinctive markers).
This plan rewrites the copy (EN + ES) around the 1.5.0 product, updates
the verification markers, and hands off the publish steps (AMO PATCH +
Chrome dashboard paste).

## Decisions already made — implement these, do not re-derive

**Decision 1 — keep the winning structure and anchors.** The hook
("Your feed, reclaimed." / "Tu feed, recuperado."), the "Why you'll want
it" section, the feature list, "What it does not do", and the closer
("Install it once. Forget it's there. Enjoy your feed again.") all stay —
they test well and the verification tool's extraction anchors depend on
them (`### Your feed, reclaimed.` → `## Español`; `### Tu feed,
recuperado.` → `## Screenshots`). The rewrite sharpens the copy and adds
the 1.5.0 features; it does not restructure.

**Decision 2 — the copy below is the deliverable, verbatim.** The
executor copies the new EN and ES detailed-description sections from this
plan into `STORE_ASSETS.md`, replacing the old sections between the
`## Detailed Description` / `## Español — Texto para la ficha de la
tienda` headings and their `---` separators. The short descriptions,
Screenshots, Promo Art, CWS/Firefox sections, and the section headings
themselves stay untouched.

**Decision 3 — the AMO plain-text constraint shapes the copy.** AMO's
serializer strips `###` and `**` markers (050-era verified). The copy
therefore reads correctly in both forms: headings are plain lines that
work as text, bullets carry their bold-word as the plain first word
(e.g. `- **Match tester** — paste...` → plain `Match tester — paste...`).
The verification markers (Step 3) are chosen as plain-text substrings so
the same list validates both the source and the stored AMO text.

**Decision 4 — publish is a reviewer/operator step, not the
executor's.** The executor has no `.env` credentials in the worktree.
Step 4 (AMO PATCH + Chrome paste text) is performed by the reviewer with
the main checkout's `.env`, after the copy is reviewed — mirroring the
release-notes PATCH precedent. The AMO PATCH payload is the plain-text
derivation (markers stripped) built from the merged `STORE_ASSETS.md`.

## Current state

The facts the executor needs, inlined (verified at `c0e2e28`):

- **`STORE_ASSETS.md` structure** (189 lines): `## Short Description
  (≤132 chars)`; `## Detailed Description` containing the EN copy
  (sections `### Your feed, reclaimed.` … `### Install it once. Forget
  it's there. Enjoy your feed again.`); `## Español — Texto para la
  ficha de la tienda` containing the ES copy (same shape); then
  `## Screenshots`, `## Chrome Web Store Specific`, `## Firefox Add-ons
  Specific`.
- **The verification tool** (`tests/verify-amo-listing.js`) extracts the
  EN body from `### Your feed, reclaimed.` to `## Español`, and the ES
  body from `### Tu feed, recuperado.` to `## Screenshots`, then asserts
  the STORED AMO description (and the source) contains a hardcoded
  `enMarkers`/`esMarkers` list (lines ~66-91). That list is updated by
  Step 3 to the new copy's distinctive phrases.
- AMO stored description lengths today: en-US 3107 chars, es-ES 3471 —
  the new copy should stay in the same ballpark (≈3000-3500 each).
- Repo conventions: `STORE_ASSETS.md` is the store copy source of truth
  (AGENTS.md); commits conventional-ish (`docs(store): refresh listing
  copy for the 1.5.0 feature set`). Do NOT push.

## Commands you will need

| Purpose | Command | Provenance | Expected on success |
|---------|---------|------------|---------------------|
| Smoke | `npm run smoke` | executed | exit 0 |
| Lint | `npm run lint` | executed | exit 0 |
| Typecheck | `npm run typecheck` | executed | exit 0 |
| Unit | `npm run test:unit` | executed | exit 0, 81 tests |
| Marker-source check | `node -e '<Step 3 snippet>'` | executed | prints 0 |

## Scope

**In scope**:
- `STORE_ASSETS.md` — the EN + ES detailed-description sections (the
  copy below, verbatim)
- `tests/verify-amo-listing.js` — the `enMarkers`/`esMarkers` arrays
- `plans/README.md` — your status row

**Out of scope** (do NOT touch):
- The short descriptions, Screenshots/Promo sections, CWS/Firefox
  sections, and the section headings in `STORE_ASSETS.md`.
- Any runtime code, locales, READMEs, `RELEASE_CHECKLIST.md`.
- The AMO PATCH and Chrome paste (reviewer/operator steps — Step 4).

## Git workflow

- Branch: `advisor/062-store-copy`
- One commit, message: `docs(store): refresh listing copy for the 1.5.0 feature set`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 81 tests.

### Step 1: Replace the EN detailed description

In `STORE_ASSETS.md`, replace everything between `## Detailed
Description` and the `---` that precedes `## Español — Texto para la
ficha de la tienda` with (verbatim):

```markdown
### Your feed, reclaimed.

LinkedIn's feed is full of "comment CLAUDE and I'll send you the
framework" posts — low-effort engagement bait that clogs your feed,
wastes your time, and adds nothing. Reporting them barely helps: empty
comments are exactly what the algorithm rewards.

LinkedIn Spam Blocker removes them for you — automatically, locally,
and with zero effort on your part. Install it, open LinkedIn, and the
spam disappears while real professional content stays.

### Why you'll want it

- **It does the work for you** — 10 built-in detection patterns across
  5 languages (English, Spanish, French, Portuguese, German) catch the
  most common spam structures as you scroll, including school and
  showcase feeds. No setup, no lists to maintain.
- **It learns and adapts** — add your own phrases, block authors you
  don't want to see, whitelist the ones you do, and teach it what's
  spam in your feed.
- **It makes mistakes easy to fix** — every hidden post leaves a subtle
  placeholder: restore it, mark it "Not spam", block its author, or
  report it to the developer. Bait in a comment hides just the comment,
  never the innocent post underneath.
- **It shows its work** — see which patterns actually block for you,
  test any post text against your rules before you rely on them, and
  tune every pattern individually.
- **It respects you** — zero analytics, zero telemetry, zero network
  requests. Everything runs in your browser. Nothing leaves your
  machine, ever.
- **It just works** — Manifest V3 for Chrome and Firefox, across feed,
  profiles, posts, company, school, and showcase pages.

### Features

- **Automatic detection** — 10 built-in patterns across 5 languages
- **"Never-hide phrases"** — name text once and no post containing it
  is ever hidden, even when a pattern matches
- **Match tester** — paste a post and see exactly which pattern or
  phrase would block it
- **Per-pattern stats** — see how often each pattern earns its keep
- **Comment-level blocking** — bait in a comment hides the comment,
  not the post
- **"Block this author"** — hide every post from that author, from any
  placeholder or profile-link right-click
- **Author whitelist** — never block the people you actually want to see
- **Custom phrases** — exact or contains matching; right-click any text
  to add it instantly
- **Persistent suggestions** — one-click "add as exact" or "add as
  contains" for suggested trigger words; dismissals are remembered
- **Full settings backup** — export and import phrases, whitelist,
  blocklist, disabled patterns, and hide toggles
- **"Report missed spam"** — placeholders copy the post text to your
  clipboard and open a pre-filled GitHub issue (reports include which
  language matched); nothing is sent automatically
- **First-run walkthrough** — new installs get a guided tour of what
  the extension does and how to tune it
- **Snooze, "Show all", hide Promoted & Featured** — pause, restore,
  and tune your feed
- **Privacy-first** — local-only, zero data collection
- **Chrome & Firefox** — fully compatible (Manifest V3)

### What it does not do

- Does not report posts to LinkedIn or interact with LinkedIn servers
- Does not remove posts for anyone else
- Does not block accounts globally
- Does not use AI, external APIs, or remote blocklists
- Does not collect analytics, telemetry, browsing history, or LinkedIn
  account data

### Install it once. Forget it's there. Enjoy your feed again.
```

**Verify**: `grep -c "Never-hide phrases" STORE_ASSETS.md` → ≥ 1; the
`## Español` heading still follows the EN section.

### Step 2: Replace the ES detailed description

Replace everything between `## Español — Texto para la ficha de la
tienda` and the `---` that precedes `## Screenshots` with (verbatim):

```markdown
### Tu feed, recuperado.

El feed de LinkedIn está lleno de publicaciones de "comenta CLAUDE y te
enviaré el framework" — engagement bait de bajo esfuerzo que satura tu
feed, pierde tu tiempo y no aporta nada. Reportarlas apenas ayuda: los
comentarios vacíos son exactamente lo que el algoritmo recompensa.

LinkedIn Spam Blocker las elimina por ti — automáticamente, de forma
local y con cero esfuerzo de tu parte. Instálalo, abre LinkedIn y el
spam desaparece mientras el contenido profesional real se queda.

### Por qué lo vas a querer

- **Hace el trabajo por ti** — 10 patrones de detección integrados en
  5 idiomas (inglés, español, francés, portugués y alemán) detectan las
  estructuras de spam más comunes mientras te desplazas, también en
  feeds de escuelas y de showcase. Sin configuración, sin listas que
  mantener.
- **Aprende y se adapta** — agrega tus propias frases, bloquea autores
  que no quieres ver, permite a los que sí y enséñale qué es spam en tu
  feed.
- **Es fácil corregir sus errores** — cada publicación oculta deja un
  marcador sutil: restáurala, márcala como "No es spam", bloquea a su
  autor o repórtala al desarrollador. El spam en un comentario oculta
  solo el comentario, nunca la publicación inocente.
- **Muestra su trabajo** — mira qué patrones bloquean de verdad, prueba
  cualquier texto contra tus reglas antes de confiar en ellas y ajusta
  cada patrón por separado.
- **Te respeta** — cero analíticas, cero telemetría, cero solicitudes de
  red. Todo se ejecuta en tu navegador. Nada sale de tu máquina, nunca.
- **Simplemente funciona** — Manifest V3 para Chrome y Firefox, en
  feed, perfiles, publicaciones, páginas de empresa, de escuela y de
  showcase.

### Funciones

- **Detección automática** — 10 patrones integrados en 5 idiomas
- **"Frases que nunca se ocultan"** — nombra un texto una vez y ninguna
  publicación que lo contenga se ocultará jamás, aunque coincida con un
  patrón
- **Probador de coincidencias** — pega una publicación y mira
  exactamente qué patrón o frase la bloquearía
- **Estadísticas por patrón** — mira cuánto bloquea cada patrón
- **Bloqueo a nivel de comentario** — el spam en un comentario oculta
  el comentario, no la publicación
- **"Bloquear a este autor"** — oculta todas las publicaciones de un
  autor, desde cualquier marcador o clic derecho en un enlace de perfil
- **Lista de autores permitidos** — nunca bloquees a las personas que
  sí quieres ver
- **Frases personalizadas** — coincidencia exacta o "contiene"; clic
  derecho en cualquier texto para agregarla al instante
- **Sugerencias persistentes** — agrega palabras sugeridas con un clic
  como "exacta" o "contiene"; los descartes se recuerdan
- **Copia de seguridad completa** — exporta e importa frases, autores
  permitidos, autores bloqueados, patrones desactivados y toggles de
  ocultar
- **"Reportar spam no detectado"** — los marcadores copian el texto de
  la publicación al portapapeles y abren un issue de GitHub prellenado
  (los reportes incluyen qué idioma coincidió); no se envía nada
  automáticamente
- **Guía de bienvenida** — las instalaciones nuevas reciben un
  recorrido guiado por lo que hace la extensión y cómo ajustarla
- **Pausa, "Mostrar todas", ocultar promocionadas y destacadas** —
  pausa, restaura y ajusta tu feed
- **Privacidad primero** — solo local, cero recopilación de datos
- **Chrome y Firefox** — totalmente compatible (Manifest V3)

### Lo que no hace

- No reporta publicaciones a LinkedIn ni interactúa con los servidores
  de LinkedIn
- No elimina publicaciones para nadie más
- No bloquea cuentas globalmente
- No usa IA, APIs externas ni listas remotas
- No recopila analíticas, telemetría, historial de navegación ni datos
  de cuenta de LinkedIn

### Instálalo una vez. Olvídate de que está. Vuelve a disfrutar tu feed.
```

**Verify**: `grep -c "Frases que nunca se ocultan" STORE_ASSETS.md` → ≥ 1;
the `## Screenshots` heading still follows the ES section.

### Step 3: Update the verification markers

In `tests/verify-amo-listing.js`, replace the `enMarkers` and `esMarkers`
arrays (lines ~66-91) with:

```js
  const enMarkers = [
    "Your feed, reclaimed.",
    "comment CLAUDE and I'll send you the",
    "zero effort",
    "Never-hide phrases",
    "Match tester",
    "Per-pattern stats",
    "Comment-level blocking",
    "including school and",
    "Persistent suggestions",
    "First-run walkthrough",
    "Install it once. Forget it's there. Enjoy your feed again.",
    "zero network",
  ];
  const esMarkers = [
    "Tu feed, recuperado.",
    "comenta CLAUDE y te",
    "cero esfuerzo",
    "Frases que nunca se ocultan",
    "Probador de coincidencias",
    "Estadísticas por patrón",
    "Bloqueo a nivel de comentario",
    "feeds de escuelas y de showcase",
    "Sugerencias persistentes",
    "Guía de bienvenida",
    "Instálalo una vez. Olvídate de que está. Vuelve a disfrutar tu feed.",
  ];
```

Every marker is a plain-text substring of the new copy (no `**` or `###`
— the same list validates the source and the markdown-stripped AMO
storage). Then verify source-side parity without `.env` credentials:

```
node -e '
const fs = require("fs");
const s = fs.readFileSync("STORE_ASSETS.md", "utf8");
const en = s.slice(s.indexOf("### Your feed, reclaimed."), s.indexOf("## Español"));
const es = s.slice(s.indexOf("### Tu feed, recuperado."), s.indexOf("## Screenshots"));
const enM = ["Your feed, reclaimed.","comment CLAUDE and I\u0027ll send you the","zero effort","Never-hide phrases","Match tester","Per-pattern stats","Comment-level blocking","including school and","Persistent suggestions","First-run walkthrough","Install it once. Forget it\u0027s there. Enjoy your feed again.","zero network"];
const esM = ["Tu feed, recuperado.","comenta CLAUDE y te","cero esfuerzo","Frases que nunca se ocultan","Probador de coincidencias","Estadísticas por patrón","Bloqueo a nivel de comentario","feeds de escuelas y de showcase","Sugerencias persistentes","Guía de bienvenida","Instálalo una vez. Olvídate de que está. Vuelve a disfrutar tu feed."];
const missingEn = enM.filter(m => !en.includes(m));
const missingEs = esM.filter(m => !es.includes(m));
console.log("missing EN:", JSON.stringify(missingEn));
console.log("missing ES:", JSON.stringify(missingEs));
console.log("EN len:", en.length, "| ES len:", es.length);'
```
→ both `missing` lines print `[]`; the lengths are in the ≈3000-3500
ballpark.

**Verify**: `npm run smoke && npm run lint && npm run typecheck && npm run test:unit` → exit 0, 81 tests (the unit suite does not run the AMO script).

### Step 4: (reviewer/operator — NOT the executor) Publish

The reviewer performs, after the diff review and merge:
1. Build the plain-text AMO payload from the merged `STORE_ASSETS.md`
   (strip `### ` and `**`, keep everything else verbatim — the 050-era
   derivation).
2. `PATCH /api/v5/addons/addon/linkedin-spam-blocker@carlos/` with
   `{ description: { "en-US": <plain EN>, "es-ES": <plain ES> } }` using
   the repo's `.env` JWT (throttle-safe single write).
3. Run `tests/verify-amo-listing.js` against the live listing → must
   PASS with the new markers.
4. Deliver the Chrome dashboard paste text (the markdown version) to
   the operator.

## Test plan

- Source-parity check (Step 3's node snippet): every marker exists in
  the new `STORE_ASSETS.md` sections — runnable without credentials.
- Live verification (Step 4): `tests/verify-amo-listing.js` passes
  against the stored AMO description with the new markers.
- No runtime behavior changes; the existing gates stay green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run smoke`, `npm run lint`, `npm run typecheck`, `npm run test:unit` exit 0 (81 tests)
- [ ] `grep -c "Never-hide phrases\|Match tester\|Per-pattern stats\|Comment-level blocking\|First-run walkthrough" STORE_ASSETS.md` → ≥ 5 (one per bullet, EN section)
- [ ] `grep -c "Frases que nunca se ocultan\|Probador de coincidencias\|Estadísticas por patrón\|Bloqueo a nivel de comentario\|Guía de bienvenida" STORE_ASSETS.md` → ≥ 5 (ES section)
- [ ] The old 1.4.0-era strings are gone: `grep -c "Full settings backup" STORE_ASSETS.md` → the new copy retains that feature as "Full settings backup" (it stays — the checklist's feature survived); report the count (≥ 1 expected, unchanged feature)
- [ ] Step 3's node snippet prints `missing EN: []` and `missing ES: []`, lengths ≈3000-3500
- [ ] The `## Español` / `## Screenshots` extraction anchors still exist exactly once each
- [ ] `git diff --name-only main...HEAD` lists only the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt (STORE_ASSETS structure, verify-tool
  markers/extraction anchors) does not match the live code.
- The new copy's markers fail the source-parity snippet — the copy in
  this plan and the markers disagree; report rather than inventing a
  third version.
- The extraction anchors (`### Your feed, reclaimed.`, `## Español`,
  `### Tu feed, recuperado.`, `## Screenshots`) would appear more than
  once or not at all after the edit.
- You conclude the AMO PATCH should happen from the executor — STOP;
  the PATCH needs the main checkout's `.env` credentials, which must
  not be copied into the worktree (Step 4 is reviewer-owned).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The AMO serializer strips markdown** — every future copy refresh
  must keep the markers plain-text-safe (no `###`, no `**`) or the
  stored text degrades silently (the 050-era finding).
- **`tests/verify-amo-listing.js` is the live-copy tripwire** — a future
  refresh must update its markers in the same commit as `STORE_ASSETS.md`
  (as this plan does), or the tool fails against a copy it no longer
  knows.
- **The Chrome dashboard paste is manual** — after the AMO PATCH and
  verify, the operator pastes the markdown `STORE_ASSETS.md` version
  into the CWS dashboard (no API), and considers regenerating the
  screenshots (May-2026 assets predate the 1.5.0 UI — separate optional
  task, not this plan's scope).
- **Deferred:** FR/PT/DE store copy — unblocked by the same sourcing
  decision as the UI locales (docs/i18n-audit.md); the store listing
  currently ships EN + ES only, matching the extension UI.