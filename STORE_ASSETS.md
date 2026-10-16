# Feed Control — Store Copy and Visual Assets (proposed for next release)

> **Publication status:** This file contains the corrected Chrome listing text after the 2026-10-11 Yellow Argon rejection; it has **not** yet been applied in the Chrome developer console. Firefox 2.0.0 is available and Chrome still serves 1.6.0 until the rejected 2.0.0 draft is edited and approved. Update actual store screenshots from the tested build, never from synthetic mocked UI.

## Store name
**LinkedIn Feed Control** — the shipped name in `manifest.json`. (The AMO listing
still shows the retired name *LinkedIn Spam Blocker*; that is a listing field, not
the package.)

## Chrome Web Store rejection remediation — 2026-10-15

The 2026-10-11 Chrome Web Store submission of **LinkedIn Feed Control** (`eolknfnafdodmaaajdiidaanpjbfolfc`) was rejected for **Yellow Argon / keyword stuffing**. The reviewer explicitly flagged the old dashboard description that enumerated LinkedIn sections: "feed, profile, post, company, group, search, My Network, notification, jobs, newsletter, and article pages". This is **listing metadata**, not a manifest defect. Do not reintroduce that coverage list in short or long descriptions.

**Ready for manual resubmission:** use the concise Store listing below, rather than the rejected dashboard copy. Make edits in **Chrome Web Store Developer Dashboard → Store listing**, review privacy/screenshots for 2.0.0, and resubmit the existing rejected draft. Do **not** create a new version, tag, package or trigger the release workflow solely for this metadata correction. A GitHub commit does **not** update the Chrome dashboard listing. The repository copy is the reviewed source text, **not proof that the dashboard has been updated or that Google has approved it**.

Official policy: https://developer.chrome.com/docs/webstore/troubleshooting/#keyword-stuffing

## English — Short description (Chrome limit: 132 chars)

Hide unwanted LinkedIn posts, mute authors, and filter engagement bait privately, with reversible controls.

## English — Full description

Take control of what you see in your LinkedIn feed. LinkedIn Feed Control helps you reduce distracting content while keeping the conversations you value.

- Hide an individual feed post and show it again when you change your mind.
- Mute an author from a recognized post.
- Filter common "comment for a template" engagement bait using editable phrase rules stored in your browser.
- Choose whether to hide promoted posts. This setting is off by default.
- Protect trusted authors or phrases, customize rules, and import or export your preferences.

Filtering happens locally in your browser. No separate account, analytics, or feed-content uploads to developer servers. The extension does not follow people, publish posts, send messages, or change LinkedIn's recommendations on its servers.

You can pause filtering, edit your rules, and restore hidden posts. Some LinkedIn layouts may not support every manual control. Automatic Suggested-post and connection-activity filtering are not included.

## Español — Descripción breve

Oculta publicaciones de LinkedIn, silencia autores y filtra contenido repetitivo desde tu navegador, con controles reversibles.

## Español — Descripción completa

Controla mejor lo que aparece en tu feed de LinkedIn. LinkedIn Feed Control reduce las distracciones sin ocultarte las conversaciones que te interesan.

- Oculta publicaciones individuales y vuelve a mostrarlas cuando quieras.
- Silencia autores desde publicaciones reconocidas.
- Filtra publicaciones que buscan comentarios a cambio de plantillas con reglas locales editables.
- Activa el filtro de publicaciones promocionadas solo si lo deseas. Viene desactivado.
- Protege autores o frases, personaliza tus reglas e importa o exporta tu configuración.

El filtrado ocurre en tu navegador. No requiere crear una cuenta adicional, no incorpora analíticas y no envía el contenido del feed a servidores del desarrollador. No sigue personas, publica mensajes ni modifica las recomendaciones en los servidores de LinkedIn.

Puedes pausar los filtros, editar tus reglas y recuperar publicaciones ocultas. Algunas interfaces de LinkedIn pueden no admitir todos los controles manuales. El filtrado automático de sugerencias y actividad de contactos no está incluido.

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
