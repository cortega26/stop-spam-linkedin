# LinkedIn Feed Control

## LinkedIn, sin el feed que nunca pediste

Usa LinkedIn para tu trabajo, tus contactos y nuevas oportunidades. **Oculta publicaciones irrelevantes, silencia autores repetitivos y filtra promociones**, todo desde tu navegador y con controles reversibles.

**[Chrome Web Store](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc) · [Firefox Add-ons](https://addons.mozilla.org/addon/linkedin-spam-blocker/) · [Código más reciente](https://github.com/cortega26/stop-spam-linkedin)**

> **Disponibilidad:** las tiendas aún publican la versión **1.6.0**, centrada en el spam del tipo «comenta X y te envío Y». Feed Control 2.0 está en el repositorio y los cambios más recientes de interfaz siguen en revisión. Las funciones nuevas todavía no forman parte de las versiones publicadas.

![Ilustración conceptual de Feed Control, no captura del navegador](../assets/feed-control-promo.svg)

*Ilustración original. Las capturas del próximo paquete se actualizarán después de las pruebas reales de Chrome y Firefox.*

### Recupera el control en menos de un minuto

| El problema | Tu solución |
| --- | --- |
| Una publicación que no quieres ver | **Opciones del feed → Ocultar esta publicación**. Puedes pulsar **Mostrar** para recuperarla. |
| Un autor repetitivo | **Opciones del feed → Silenciar a este autor**, si el autor se puede identificar. |
| Contenido promocionado | Activa **Ocultar publicaciones promocionadas** cuando quieras; es reversible. |
| El clásico «comenta y te regalo...» | Los patrones integrados lo detectan automáticamente en cinco idiomas. |
| Una coincidencia equivocada | Usa **Mostrar**, **No es spam**, autores permitidos y frases protegidas. |

**Sin cuenta adicional, sin telemetría, sin servicios de IA externos.** Las reglas se ejecutan dentro de tu navegador. Las preferencias que guardes (frases y autores) quedan almacenadas localmente y pueden sincronizarse si tu navegador tiene esa opción activada.

### Primeros pasos

1. Instala la extensión y abre LinkedIn; los patrones de spam integrados ya funcionan sin que tengas que configurar nada.
2. Abre el icono de la extensión y, si te interesa, activa el filtro de publicaciones promocionadas.
3. En una publicación reconocida, abre **Opciones del feed** para ocultar esa publicación o silenciar a su autor.
4. Para ajustar los filtros, entra en **Configuración** y administra reglas, excepciones, autores permitidos o copias de seguridad.

### Qué no hace

No puede obligar a LinkedIn a mostrar mejores recomendaciones ni recuperar publicaciones que la plataforma no haya entregado. El filtrado automático de publicaciones **Sugeridas** o de contenidos difundidos porque tus contactos interactuaron con ellos sigue **en investigación**; no es una funcionalidad disponible. Si LinkedIn cambia la estructura de sus páginas, la detección puede necesitar ajustes.

### Privacidad, permisos y compatibilidad

- Funciona en Chrome y Firefox (Manifest V3).
- Permisos: almacenamiento y menús contextuales, sin acceso generalizado a otros sitios.
- La interfaz está en inglés y español; los filtros incorporados reconocen cinco idiomas.
- Sin peticiones de red en el funcionamiento normal. Lee la [política de privacidad](../PRIVACY_POLICY.md).
- «Mostrar», las excepciones y la opción de desactivar la extensión te permiten recuperar el contenido oculto.

### Capturas de una versión anterior

Estas imágenes son referencias históricas. Las capturas de la nueva versión deben tomarse directamente de la extensión verificada.

![Vista anterior del filtrado](../screenshots/screenshot-1-feed.png)

![Vista anterior de configuración](../screenshots/screenshot-2-settings.png)

### Desarrollo, soporte y licencia

El proyecto está hecho con JavaScript, sin dependencias durante la ejecución. En Chrome puedes cargar el repositorio con «Cargar descomprimida» desde `chrome://extensions`. En Firefox puedes cargar `manifest.json` desde `about:debugging#/runtime/this-firefox`.

Reporta errores, coincidencias equivocadas y casos no detectados en [GitHub Issues](https://github.com/cortega26/stop-spam-linkedin/issues). Evita compartir información privada de LinkedIn.

[Documentación técnica en inglés](../README.md) · [Licencia](../LICENSE) · [Tooltician](https://tooltician.com)
