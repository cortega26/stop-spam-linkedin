# LinkedIn Spam Blocker

[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](../manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-compatible-4285F4?logo=googlechrome&logoColor=white)](#manual-unpacked-install)
[![Firefox](https://img.shields.io/badge/Firefox-compatible-FF7139?logo=firefoxbrowser&logoColor=white)](#manual-unpacked-install)
[![Local only](https://img.shields.io/badge/privacidad-solo%20local-0a7f64)](../PRIVACY_POLICY.md)
[![No telemetry](https://img.shields.io/badge/telemetria-ninguna-0a7f64)](../PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/licencia-source--available-lightgrey)](../LICENSE)

**Leer en:** [English](../README.md) | **Español** | [Français](README.fr.md) | [Português](README.pt.md) | [Deutsch](README.de.md)

Esas publicaciones de "comenta ESTRATEGIA abajo y te mando el framework" estan en todas partes. LinkedIn Spam Blocker las oculta automaticamente — todo en tu navegador, sin enviar nada a ninguna parte.

Detecta publicaciones que piden comentar una palabra clave como "CLAUDE", "SKILL" o "PROMPTS" para recibir un archivo, una plantilla, un paquete de prompts o "acceso". Funciona en Chrome y Firefox, incluye patrones para cinco idiomas de fabrica, y te permite deshacer o ajustar el bloqueo cuando se equivoca.

## Resumen

- **Privado por diseno** — sin analitica, telemetria, listas remotas, APIs de IA ni solicitudes de red de ningun tipo
- **Multilingue** — patrones integrados para ingles, espanol, frances, portugues y aleman, todos activables independientemente
- **Ajustable** — agrega frases personalizadas, permite autores de confianza e importa/exporta tu lista
- **Reversible** — muestra una publicacion oculta temporalmente o marcala como "No es spam" para que ese mismo texto nunca vuelva a bloquearse

## Por que existe

El flujo de reportes de LinkedIn suele dejar intactas publicaciones de engagement bait, incluso cuando siguen un patron obvio: "comenta X y te envio Y". Esas publicaciones estan optimizadas para alcance algoritmico, no para conversaciones utiles, y pueden desplazar el trabajo, las contrataciones y las novedades de la industria que la gente realmente queria ver.

Esta extension te da una forma local y privada de hacer que tu propio feed sea menos ruidoso sin esperar a que la plataforma actue. No reporta publicaciones, no contacta a LinkedIn y no cambia nada del lado del servidor. Solo oculta publicaciones coincidentes en tu navegador.

## Como funciona

LinkedIn Spam Blocker analiza texto en paginas compatibles de LinkedIn y lo compara con patrones integrados de engagement bait mas las frases personalizadas que agregues. Cuando una publicacion coincide, se oculta y se reemplaza por un pequeno marcador para que puedas restaurarla de inmediato.

La deteccion es heuristica, no magia. Puede pasar por alto nuevos formatos de spam y ocasionalmente ocultar una publicacion que querias ver. La extension incluye "Mostrar", "No es spam", frases personalizadas, selectores de idioma y lista de autores permitidos para que puedas ajustarla a tu feed.

## Funciones

**Privacidad**
- Cero solicitudes de red — sin analitica, telemetria, APIs externas ni listas remotas
- Todos los datos quedan en el almacenamiento del navegador; nada se transmite jamas

**Deteccion**
- Patrones integrados para ingles, espanol, frances, portugues y aleman, activables individualmente
- Analisis de texto del DOM en vez de clases CSS fragiles de LinkedIn — resiste mejor los cambios de diseno del feed
- Analisis incremental: detecta publicaciones nuevas mientras haces scroll
- Frases personalizadas con coincidencia Exacta o Contiene

**Controles**
- Deshacer cualquier publicacion bloqueada desde el popup o el marcador en el feed
- Exclusion "No es spam" para que ese mismo texto nunca vuelva a bloquearse
- Lista de autores permitidos para perfiles, empresas, escuelas y showcases
- Pausa temporal de 30 minutos con reactivacion automatica
- Clic derecho sobre texto seleccionado para agregar una frase al instante
- Ajustes en vivo — cambios de frases e idiomas sin recargar la extension
- Importar / Exportar la lista de frases como JSON

**Estadisticas y cobertura**
- Conteos de hoy, esta semana y de por vida en el popup
- Paginas compatibles: feed, perfiles, publicaciones, paginas de empresa, grupos, busqueda, Mi red, notificaciones, empleos, newsletters y articulos

## Limites

- LinkedIn puede cambiar la estructura de sus paginas, lo que puede requerir actualizaciones de deteccion.
- Nuevas formas de engagement bait pueden pasar hasta que los patrones o tus frases personalizadas se actualicen.
- Puede haber falsos positivos, especialmente en publicaciones que citan ejemplos de spam o hablan sobre spam.
- Los conteos son estadisticas locales de conveniencia, no reportes analiticos precisos.

## Lo que no hace

- No reporta publicaciones a LinkedIn ni interactua con los servidores de LinkedIn de ninguna forma
- No afecta lo que ven otras personas — los cambios son locales a tu navegador
- No lee, almacena ni transmite tus datos de cuenta de LinkedIn, historial de navegacion ni contenido de publicaciones

## Como usarlo

1. Instala la extension.
2. Abre LinkedIn y navega normalmente.
3. Las publicaciones coincidentes se ocultan automaticamente.
4. Haz clic en el icono de la extension para ver estadisticas, activar/desactivar, pausar o abrir ajustes.
5. Haz clic en "Mostrar" en una publicacion bloqueada para restaurarla temporalmente.
6. Haz clic en "No es spam" si una publicacion fue bloqueada por error.
7. Agrega frases personalizadas desde ajustes o seleccionando texto y usando el menu contextual cuando tu feed invente una nueva variante de bait.

## Instalar

### Chrome Web Store

Publicacion pendiente. Por ahora usa los pasos de instalacion manual.

### Firefox Add-ons

Publicacion pendiente. Por ahora usa los pasos de complemento temporal.

### Paquete mas reciente

El zip mas reciente esta adjunto en la [ultima release de GitHub](https://github.com/cortega26/stop-spam-linkedin/releases/latest). Para desarrollo local o revision manual, normalmente es mas facil instalarlo sin empaquetar.

<a id="manual-unpacked-install"></a>
### Instalacion manual sin empaquetar

1. Clona el repositorio: `git clone https://github.com/cortega26/stop-spam-linkedin.git`
2. Abre Chrome y ve a `chrome://extensions`
3. Activa "Modo de desarrollador"
4. Haz clic en "Cargar sin empaquetar" y selecciona la carpeta `stop-spam-linkedin`
5. En Firefox, abre `about:debugging#/runtime/this-firefox`, haz clic en "Cargar complemento temporal" y selecciona `manifest.json`

## Capturas

### Bloqueo en el feed

![Captura de bloqueo en el feed](../screenshots/screenshot-1-feed.png)

### Ajustes

![Captura de ajustes](../screenshots/screenshot-2-settings.png)

### Popup

![Captura del popup](../screenshots/screenshot-3-popup-1280x800.png)

## Desarrollo

No hay paso de build. La extension usa JavaScript vanilla y Manifest V3.

Comandos utiles:

- `npm run smoke` — valida JSON y revisa la sintaxis de JavaScript
- `npm run test:extension` — carga la extension sin empaquetar en Chromium y verifica que una publicacion simulada se oculte
- `npm run test:package` — empaqueta la extension y prueba el zip exacto de la version actual del manifest
- `npm run package` — crea `dist/linkedin-spam-blocker-{version}.zip` usando la version de `manifest.json`

## Permisos

- `storage` — guarda preferencias, frases personalizadas, idiomas, estadisticas, pausa, autores permitidos y firmas de falsos positivos en el almacenamiento del navegador
- `contextMenus` — agrega la accion de clic derecho "Add to LinkedIn Spam Blocker" para el texto seleccionado
- Rutas estaticas de content script en `https://www.linkedin.com/*` compatibles — analiza paginas de LinkedIn sin pedir un permiso de host mas amplio

No se transmite ningun dato. Consulta [PRIVACY_POLICY.md](../PRIVACY_POLICY.md).

## Soporte

Usa los formularios de issue para mantener los reportes organizados:

- **Bug** — algo dejo de funcionar o se comporta de forma inesperada
- **Falso positivo** — una publicacion fue bloqueada cuando no debia
- **Patron no detectado** — un post de spam paso sin ser bloqueado
- **Funcion solicitada** — algo que te gustaria ver agregado

Incluye la frase o fragmento relevante y el tipo de pagina de LinkedIn. Evita compartir detalles privados de cuentas o contenido completo de publicaciones salvo que sea necesario para reproducir el problema.

## Licencia

Source-available propietaria. Puedes inspeccionar el codigo fuente y usar la extension para uso personal, pero la redistribucion, el uso comercial y los productos derivados competidores no estan permitidos sin autorizacion previa por escrito. Consulta [LICENSE](../LICENSE).

