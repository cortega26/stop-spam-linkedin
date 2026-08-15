# LinkedIn Spam Blocker — Store Assets

## Short Description (≤132 chars)

Blocks LinkedIn engagement-bait spam that asks you to "Comment X and I will send..."

---

## Detailed Description

LinkedIn's feed is flooded with low-effort engagement-bait posts. The pattern is always the same: post a generic "career hack" or "AI secret," then ask readers to comment a specific word (CLAUDE, SKILL, PROMPTS, etc.) in exchange for a file, PDF, template, or "access." It clogs your feed and adds zero value.

Why this exists: LinkedIn's reporting flow often leaves engagement-bait spam untouched, while reach-based incentives reward posts that generate empty comments. LinkedIn Spam Blocker gives you a local, private way to clean up your own feed without waiting for platform enforcement.

**LinkedIn Spam Blocker automatically detects and removes these posts — no manual reporting required.**

### How it works

The extension scans supported LinkedIn pages for engagement-bait patterns across 5 languages (English, Spanish, French, Portuguese, German). When a match is found, the post is hidden from view and replaced with a subtle placeholder. You can click "Show" to restore any post temporarily or "Not spam" if it was incorrectly blocked.

Everything happens locally in your browser. The extension does not report posts, contact LinkedIn, use AI, call external APIs, collect analytics, or send your browsing data anywhere.

### Features

- **Automatic detection** — 10 built-in patterns covering the most common spam structures across 5 languages
- **Custom phrases** — Add your own trigger words or phrases via the settings page. Choose between "Exact" (whole word) or "Contains" (substring) matching
- **Right-click to add** — Select any text on any page, right-click, and choose "Add to LinkedIn Spam Blocker" to instantly add it as a blocking phrase
- **Import / Export** — Full settings backup: phrases, author whitelist, exclusions, and language toggles travel with the export (old phrase-only exports still import)
- **Snooze** — Temporarily pause blocking for 30 minutes without disabling the extension
- **Undo and false-positive controls** — Restore a post temporarily, mark it as not spam, or review/remove past "Not spam" exclusions from the settings page
- **Author whitelist** — Avoid blocking selected profile, company, school, or showcase authors
- **Author blocklist** — Right-click any LinkedIn profile, company, school, or showcase link and choose "Block this author" to always hide their posts, regardless of text
- **Per-phrase toggles** — Disable individual phrases without deleting them
- **Per-pattern toggles** — Disable a single built-in detection pattern (not just a whole language)
- **"Show all"** — Restore every hidden post for the session from the popup with one click
- **"Report missed spam"** — Placeholders copy the post text to your clipboard and open a pre-filled GitHub issue; nothing is sent automatically
- **Match attribution** — The popup shows which pattern or custom phrase triggered each block
- **Hide promoted & featured** — Optional toggles to hide "Promoted" posts in the feed and the "Featured" section on profiles (off by default)
- **Incremental & robust** — Uses DOM-structure heuristics instead of fragile CSS selectors, so LinkedIn layout changes won't break detection
- **Low overhead** — Only scans newly loaded posts (not the entire page) via MutationObserver. Initial scan runs during idle time
- **Works across LinkedIn** — Feed, profiles, posts, company pages, groups, search, My Network, notifications, jobs, newsletters, and articles
- **Privacy-first** — Zero data collection. No analytics, no tracking, no external requests. Everything runs locally in your browser
- **Chrome & Firefox** — Fully compatible with both browsers (Manifest V3)

### How to use

1. Install the extension
2. Scroll your LinkedIn feed — spam posts are automatically removed
3. Click the extension icon to view your blocked count, toggle blocking, snooze, or restore all hidden posts
4. Click "Manage matching phrases" to add custom keywords or import a phrase list
5. Use "Show", "Not spam", or "Report missed spam" if a post is incorrectly blocked or a spam post slipped through
6. Right-click any suspicious text you see anywhere on the web and add it instantly, or right-click a LinkedIn profile link to block that author

### What it does not do

- Does not report posts to LinkedIn
- Does not remove posts for anyone else
- Does not block accounts globally
- Does not use AI, external APIs, or remote blocklists
- Does not collect analytics, telemetry, browsing history, or LinkedIn account data

### Use cases

- **Recruiters** — Keep your feed focused on real professional content
- **Job seekers** — Avoid fake "get hired fast" engagement traps
- **Daily LinkedIn users** — Reclaim your feed from spam without manual reporting

### Support

For bugs, false positives, or missed spam patterns, report the phrase and LinkedIn page type where it happened.

---

## Español — Texto para la ficha de la tienda

### Short Description (≤132 chars)

Oculta el spam de engagement de LinkedIn ("Comenta X y te envío..."), publicaciones promocionadas y más — de forma privada, en tu navegador.

### Detailed Description

El feed de LinkedIn está inundado de publicaciones de engagement bait de bajo esfuerzo. El patrón es siempre el mismo: publicar un "truco de carrera" o "secreto de IA" genérico y pedir a los lectores que comenten una palabra concreta (CLAUDE, SKILL, PROMPTS, etc.) a cambio de un archivo, PDF, plantilla o "acceso". Satura tu feed y aporta cero valor.

Por qué existe: el flujo de reportes de LinkedIn a menudo deja intacto el spam de engagement, mientras que los incentivos por alcance premian las publicaciones que generan comentarios vacíos. LinkedIn Spam Blocker te da una forma local y privada de limpiar tu propio feed sin esperar a la intervención de la plataforma.

**LinkedIn Spam Blocker detecta y elimina automáticamente estas publicaciones — sin necesidad de reportarlas manualmente.**

### Cómo funciona

La extensión analiza las páginas compatibles de LinkedIn buscando patrones de engagement bait en 5 idiomas (inglés, español, francés, portugués y alemán). Cuando encuentra una coincidencia, oculta la publicación y la sustituye por un marcador discreto. Puedes hacer clic en "Mostrar" para restaurar cualquier publicación temporalmente o en "No es spam" si se bloqueó incorrectamente.

Todo ocurre localmente en tu navegador. La extensión no reporta publicaciones, no contacta a LinkedIn, no usa IA, no llama APIs externas, no recopila analíticas ni envía tus datos de navegación a ningún sitio.

### Funciones

- **Detección automática** — 10 patrones integrados que cubren las estructuras de spam más comunes en 5 idiomas
- **Frases personalizadas** — Añade tus propias palabras o frases desde la página de ajustes, con coincidencia "Exacta" (palabra completa) o "Contiene" (subcadena)
- **Añadir con clic derecho** — Selecciona cualquier texto, haz clic derecho y elige "Añadir a LinkedIn Spam Blocker" para agregarlo al instante como frase de bloqueo
- **Importar / Exportar** — Copia de seguridad completa: frases, lista de autores permitidos, exclusiones y toggles de idioma viajan con la exportación (las exportaciones antiguas de solo frases siguen importándose)
- **Pausa (Snooze)** — Pausa temporal del bloqueo durante 30 minutos sin desactivar la extensión
- **Deshacer y controles de falsos positivos** — Restaura una publicación temporalmente, márcala como "No es spam" o revisa/elimina exclusiones pasadas desde los ajustes
- **Lista de autores permitidos** — Evita bloquear autores seleccionados de perfiles, empresas, escuelas o showcases
- **Lista de autores bloqueados** — Haz clic derecho en cualquier enlace de perfil, empresa, escuela o showcase de LinkedIn y elige "Bloquear a este autor" para ocultar siempre sus publicaciones, sin importar el texto
- **Toggles por frase** — Desactiva frases individuales sin eliminarlas
- **Toggles por patrón** — Desactiva un único patrón integrado de detección (no solo un idioma completo)
- **"Mostrar todas"** — Restaura todas las publicaciones ocultas de la sesión desde el popup con un clic
- **"Reportar spam no detectado"** — Los marcadores copian el texto de la publicación al portapapeles y abren un issue de GitHub prellenado; no se envía nada automáticamente
- **Atribución de coincidencia** — El popup muestra qué patrón o frase personalizada disparó cada bloqueo
- **Ocultar promocionadas y destacadas** — Toggles opcionales para ocultar publicaciones "Promocionadas" en el feed y la sección "Destacados" en los perfiles (desactivados por defecto)
- **Incremental y robusto** — Usa heurísticas de estructura DOM en lugar de selectores CSS frágiles, así los cambios de diseño de LinkedIn no rompen la detección
- **Bajo consumo** — Solo analiza publicaciones recién cargadas (no toda la página) mediante MutationObserver. El escaneo inicial corre en tiempo de inactividad
- **Funciona en todo LinkedIn** — Feed, perfiles, publicaciones, páginas de empresa, grupos, búsqueda, Mi red, notificaciones, empleos, newsletters y artículos
- **Privacidad primero** — Cero recopilación de datos. Sin analíticas, sin seguimiento, sin peticiones externas. Todo funciona localmente en tu navegador
- **Chrome y Firefox** — Totalmente compatible con ambos navegadores (Manifest V3)

### Cómo usarlo

1. Instala la extensión
2. Desplázate por tu feed de LinkedIn — el spam se elimina automáticamente
3. Haz clic en el icono de la extensión para ver el contador de bloqueos, activar/desactivar, pausar o restaurar todas las ocultas
4. Haz clic en "Gestionar frases de coincidencia" para añadir palabras clave o importar una lista de frases
5. Usa "Mostrar", "No es spam" o "Reportar spam no detectado" si una publicación se bloqueó incorrectamente o si un spam se coló
6. Haz clic derecho en cualquier texto sospechoso para añadirlo al instante, o en un enlace de perfil de LinkedIn para bloquear a ese autor

### Lo que no hace

- No reporta publicaciones a LinkedIn
- No elimina publicaciones para nadie más
- No bloquea cuentas globalmente
- No usa IA, APIs externas ni listas remotas
- No recopila analíticas, telemetría, historial de navegación ni datos de cuenta de LinkedIn

---

## Screenshots

### Screenshot 1 — Feed with blocked post (screenshots/screenshot-1-feed.png)
Show the LinkedIn feed with a spam post replaced by the "Blocked by LinkedIn Spam Blocker" placeholder and "Show" button. A second visible post remains untouched to show contrast.

### Screenshot 2 — Popup (screenshots/screenshot-3-popup-1280x800.png)
The extension popup showing the enabled toggle, blocked count (e.g., "17"), snooze button, and "Manage matching phrases" link.

### Screenshot 3 — Settings / Phrase CRUD (screenshots/screenshot-2-settings.png)
The options page with a mix of built-in patterns (greyed) and custom phrases with enabled/disabled states, mode badges (Exact / Cont.), and the add form.

### Promo Art

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
