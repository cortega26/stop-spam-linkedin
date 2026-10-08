# Feed Control — Store Copy and Visual Assets (proposed for next release)

> **Publication status:** Draft copy and source visual only. The published Chrome/Firefox listings retain the existing product until a new package passes CI, visual QA and store review. Update actual store screenshots from the tested build, never from synthetic mocked UI.

## Proposed store name
**LinkedIn Feed Control — Spam & Noise Blocker** (check platform name limits before publishing)

## English — Short description
Take control of LinkedIn. Hide unwanted posts, mute authors, filter promotions and keep your feed private.

## English — Full description

### Your feed, your rules.

LinkedIn decides what to recommend. You decide what deserves your attention.

Feed Control helps you take back the small decisions that add up: a post you don't want to read, a repetitive author, yet another promotion, or a "comment X and I'll send Y" engagement trap.

**No account. No tracking. No AI-generated guesses about what you should want.**

### Make your feed feel yours

- **Hide any post.** Choose **Feed options → Hide this post** on a recognized post, even when it isn't technically spam.
- **Mute authors directly.** Choose **Feed options → Mute this author** when an author is recognized, without hunting through settings.
- **Filter promoted content.** Turn promoted-post hiding on or off instantly, without a reload.
- **Block obvious engagement bait automatically.** Proven, editable local rules support English, Spanish, French, Portuguese and German.
- **Keep what matters.** Protect trusted authors and meaningful phrases. Every hidden item has a reversible Show action.
- **Make precise personal rules.** Add words/phrases, inspect rule matches, and manage advanced controls when you need them.
- **Trust the design.** No runtime network requests, telemetry, AI API, remote blocklist or broad web permissions.

### A calm utility, not another algorithm

This extension doesn't alter LinkedIn's servers, follow/unfollow anyone, or claim to rank the feed. It hides recognized items locally in your browser, with your decisions always reversible.

### Install it. Use LinkedIn normally. Make the feed yours.

## Español — Descripción breve
Controla tu LinkedIn. Oculta publicaciones, silencia autores, filtra promociones y protege tu privacidad.

## Español — Descripción completa

### Tu feed, tus reglas.

LinkedIn decide qué recomendarte. Tú decides a qué prestarle atención.

Feed Control te permite ocultar una publicación que no te interesa, silenciar a un autor repetitivo, filtrar promociones y bloquear los clásicos mensajes que te piden comentar algo para recibir un archivo.

**Sin cuentas adicionales. Sin seguimiento. Sin pedirle a una IA que adivine qué quieres ver.**

### Más control, menos distracciones

- **Oculta cualquier publicación desde «Opciones del feed»**, aunque no sea técnicamente spam.
- **Silencia autores desde su publicación**, sin buscar opciones escondidas.
- **Activa o desactiva el filtro de promociones** y ve el cambio de inmediato.
- **Filtra automáticamente las publicaciones de interacción forzada** mediante reglas locales en cinco idiomas.
- **Conserva lo útil** con autores permitidos y frases protegidas.
- **Recupera fácilmente lo ocultado** y corrige las coincidencias equivocadas.
- **Configura solo lo que necesitas**, con herramientas avanzadas disponibles cuando las quieras.
- **Privacidad por diseño:** sin telemetría, servidores de análisis, IA remota ni permisos amplios de navegación.

La extensión no modifica los servidores ni el algoritmo de LinkedIn. Solo controla lo que aparece en tu navegador.

### Instálala y vuelve a decidir qué merece tu tiempo.

---

## Screenshots

### Screenshot 1 — Feed with blocked post (screenshots/screenshot-1-feed.png)
Show the LinkedIn feed with a spam post replaced by the "Hidden by Feed Control" placeholder and "Show" button. A second visible post remains untouched to show contrast.

### Screenshot 2 — Popup (screenshots/screenshot-3-popup-1280x800.png)
The extension popup showing the enabled toggle, blocked count (e.g., "17"), snooze button, and "Manage matching phrases" link.

### Screenshot 3 — Settings / Phrase CRUD (screenshots/screenshot-2-settings.png)
The options page with a mix of built-in patterns (greyed) and custom phrases with enabled/disabled states, mode badges (Exact / Cont.), and the add form.

### Promo Art

Source of the new original vector visual: `assets/feed-control-promo.svg`. Its illustration is conceptual and must not replace truthful screenshots of the actual extension. Capture current popup, options and a real reversible feed hide before publishing.

- `screenshots/promo-small-440x280.png`
- `screenshots/promo-large-920x680.png`
- `screenshots/promo-marquee-1400x560.png`

### Remaining Capture

- Context-menu screenshot is still missing if you want that angle in the store listing.

---

## Chrome Web Store Specific

- **Category**: Productivity
- **Language**: English (en)
- **Homepage URL**: (optional — link to GitHub repo if public)

## Firefox Add-ons Specific

- **Tags**: linkedin, spam, productivity, feed, blocker
- **Homepage URL**: (optional)

## Screenshot and store copy gate for the next release

Browser stores still publish 1.6.0, not all merged 2.0 features or new UI. Replace screenshots with the **actual tested candidate**, not the HTML mockups or original promo SVG. Capture five consented/sanitized real screenshots: (1) native feed before/after with unrelated posts retained, (2) Feed options disclosed with Hide/Mute, (3) manual Hide → Show/Undo, (4) first-run opt-in and successful confirmation, (5) popup settings and privacy. Inspect Chrome and Firefox at relevant dimensions. The mocked feed cannot establish live DOM acceptance.

**Do not market Suggested post or connection-activity auto filters:** those remain research-only pending authentic LinkedIn DOM samples and locked negative cases. Update the version-availability statement in both READMEs at actual store release.
