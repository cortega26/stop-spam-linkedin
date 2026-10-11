# Feed Control — Store Copy and Visual Assets (proposed for next release)

> **Publication status:** Draft copy and source visual only. The published Chrome/Firefox listings retain the existing product until a new package passes CI, visual QA and store review. Update actual store screenshots from the tested build, never from synthetic mocked UI.

## Store name
**LinkedIn Feed Control** — the shipped name in `manifest.json`. (The AMO listing
still shows the retired name *LinkedIn Spam Blocker*; that is a listing field, not
the package.)

## English — Short description (Chrome limit: 132 chars)

Take back your LinkedIn feed. Hide any post, mute authors, filter promotions — all local, zero network requests.

## English — Full description

### Stop scrolling past noise you never asked for

LinkedIn's feed decides what you see. Feed Control hands those decisions back to you — quietly, locally, and always reversible.

One click hides the post you're done with. One click mutes the author who keeps repeating. A local rule catches "comment CLAUDE and I'll send you the framework" before you ever read it.

**No account. No sign-up. No tracking. And no AI guessing at what you should want.**

### What you get

- **Hide any feed post, instantly.** *Feed options → Hide this post.* Every hide keeps a one-click **Show** to bring it back.
- **Mute an author on the spot.** *Feed options → Mute this author*, on posts where the author is recognised — no settings safari.
- **Kill engagement bait automatically.** Editable local rules catch "comment X for a template" posts in English, Spanish, French, Portuguese and German.
- **Filter promoted posts, if you want.** Off by default. One toggle, no reload.
- **Keep what matters.** Trusted authors and protected phrases are never hidden.
- **Write your own rules.** Add phrases, see which rule matched, exclude false positives, review per-rule counts.
- **Take your settings with you.** Export and import. No cloud involved.

### Why it's different: nothing leaves your browser

This extension makes **zero network requests.** No analytics, no telemetry, no remote rule list, no AI service, no CDN assets. It asks for two permissions: storage and a context menu.

Your feed, your reading habits and the authors you mute stay on your machine. We could not see them if we wanted to.

It's honest about its limits too: it changes what *your browser* shows, not LinkedIn's servers or its ranking. It never follows, unfollows, posts, messages or automates anything on your behalf.

### Free, quiet, and easy to undo

Nothing is permanent, nothing is silent, and there's no trap waiting for you later. Don't like a rule? Turn it off. Changed your mind? Press **Show**.

**Install it. Use LinkedIn normally. Take your feed back.**

## Español — Descripción breve

Recupera tu feed de LinkedIn. Oculta publicaciones, silencia autores y filtra promociones, todo local.

## Español — Descripción completa

### Deja de cruzarte con ruido que nunca pediste

El feed de LinkedIn decide qué ves. Feed Control te devuelve esas decisiones: en silencio, en local y siempre reversible.

Un clic oculta la publicación que ya no te interesa. Un clic silencia al autor que se repite. Una regla local frena los "comenta CLAUDE y te envío la plantilla" antes de que llegues a leerlos.

**Sin cuenta. Sin registro. Sin seguimiento. Y sin que una IA adivine qué deberías querer ver.**

### Lo que consigues

- **Oculta cualquier publicación del feed al instante.** *Opciones del feed → Ocultar esta publicación.* Todo lo oculto conserva un **Mostrar** a un clic.
- **Silencia a un autor en el momento.** *Opciones del feed → Silenciar a este autor*, en publicaciones donde el autor se reconoce.
- **Bloquea el bait de interacción automáticamente.** Reglas locales editables en inglés, español, francés, portugués y alemán.
- **Filtra publicaciones promocionadas, si quieres.** Desactivado por defecto. Un interruptor, sin recargar.
- **Conserva lo importante.** Autores de confianza y frases protegidas nunca se ocultan.
- **Crea tus propias reglas.** Añade frases, mira qué regla coincidió, descarta falsos positivos y revisa contadores por regla.
- **Llévate tu configuración.** Exporta e importa. Sin nube de por medio.

### La diferencia: nada sale de tu navegador

Esta extensión hace **cero peticiones de red.** Sin analíticas, sin telemetría, sin listas remotas, sin IA externa, sin recursos desde CDN. Solo pide dos permisos: almacenamiento y menú contextual.

Tu feed, tus lecturas y los autores que silencias se quedan en tu equipo. No podríamos verlos ni queriendo.

Y es honesta con sus límites: cambia lo que muestra *tu navegador*, no los servidores ni el ranking de LinkedIn. No sigue, deja de seguir, publica, envía mensajes ni automatiza nada por ti.

### Gratis, discreta y fácil de deshacer

Nada es permanente, nada es silencioso y no hay trampa esperándote después. ¿No te convence una regla? Desactívala. ¿Cambiaste de opinión? Pulsa **Mostrar**.

**Instálala. Usa LinkedIn con normalidad. Recupera tu feed.**

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

Firefox publishes 2.0.0; Chrome is still on 1.6.0 while 2.0.0 is in review. The listing assets below are therefore still 1.6.0-era on Chrome and do not show the merged 2.0 UI. Replace screenshots with the **actual tested candidate**, not the HTML mockups or original promo SVG. Capture five consented/sanitized real screenshots: (1) native feed before/after with unrelated posts retained, (2) Feed options disclosed with Hide/Mute, (3) manual Hide → Show/Undo, (4) first-run opt-in and successful confirmation, (5) popup settings and privacy. Inspect Chrome and Firefox at relevant dimensions. The mocked feed cannot establish live DOM acceptance.

**Do not market Suggested post or connection-activity auto filters:** those remain research-only pending authentic LinkedIn DOM samples and locked negative cases. Update the version-availability statement in both READMEs at actual store release.
