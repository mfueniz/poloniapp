# STATUS — poloniapp

## Links rápidos
| Link | Para qué sirve |
|---|---|
| https://poloniapp.cl/ | Sitio en producción (hosting Spaceship, cPanel) |
| https://poloniapp.cl/admin/ | Panel admin — login con email + contraseña (tabla `admins` en MySQL) |
| https://poloniapp.cl/manual/ | Guía paso a paso para los admins (con capturas reales) |
| https://github.com/mfueniz/poloniapp | Repo del código |
| https://poloniasub35.setmore.com | Sistema de reservas de confesiones (externo al proyecto, solo enlazado) |

**Fase:** iteración-v1 → backend/data-driven — **swap a producción hecho (2026-09-05)**: Fases 1, 2 (a+b+c), 3 y 5 en la raíz; pendiente Fase 4 (inscripciones, bloqueada por feedback de otros admins, reunión ~2026-09-13)
**Madurez:** 4/5

## Qué es
Web app informativa (MVP) para un centro cultural del O. en Las Condes (Polonia 306) — capa de identidad, feed de actividades propias por categoría (con detalle propio) + sección secundaria de publicaciones de O. (redirige afuera) + sección "Texto diario" (redirige afuera) + tarjeta de reserva de Confesiones (redirige a Setmore) + bubble chat de contacto a WhatsApp. Ver `PROJECT_BRIEF.md` para el scope original y `DESIGN_BRIEF.md` para la arquitectura de información y paleta visual del v0. **`DECISIONS.md` es la fuente de verdad de todo lo que cambió sobre esos dos documentos durante la iteración v1** — leerlo siempre antes de asumir el estado del contenido/UX.

## Deploy
- **Producción:** https://poloniapp.cl/ — hosting Spaceship (cPanel + LiteSpeed + PHP + MySQL).
- **Deploy automático:** `.github/workflows/deploy-spaceship.yml`. Cada push a `main` que toque `docs/` sube `docs/` por FTPS a `/home/zwkosuazxt/poloniapp.cl/` (también se lanza a mano desde Actions → Deploy a Spaceship → Run workflow).
  - Secrets: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `DB_NAME`, `DB_USER`, `DB_PASS` (`DB_HOST` opcional, por defecto `localhost`).
  - Variables: `FTP_SERVER_DIR`, `FTP_SECURITY` (`loose` si se conecta por IP), `FTP_PROTOCOL`.
- **Backend (desde 2026-10-24):** MySQL en el mismo hosting + API propia en PHP, `docs/api/index.php`. Reemplaza a Supabase (el proyecto de Ignacio dejó de responder y se decidió tener todos los datos en el servidor propio).
  - `docs/api/config.php` (credenciales MySQL) lo genera el workflow desde los secrets; nunca está en el repo.
  - Schema y contenido inicial: `docs/api/_lib/schema.sql` y `seed.sql` (traducción a MySQL de `supabase/`). Se corren solos la primera vez que se entra a `/admin/` y se crea el primer administrador.
  - Imágenes subidas desde el panel: `docs/uploads/` en el servidor (no están en el repo; respaldarlas desde cPanel).
  - Administradores: se agregan/quitan y se cambia la contraseña desde la pestaña Administradores del panel. Reset manual sin acceso al panel: borrar la fila en `admins` desde phpMyAdmin; si la tabla queda vacía, `/admin/` vuelve a ofrecer crear el primer admin.
- `supabase/`: schema original de Postgres, solo como referencia histórica.
- **Bundle viejo (respaldo):** `docs/legacy/index.html`.

## Qué ya está integrado y en producción (raíz — bundle viejo)
- Responsivo mobile (2026-08-16).
- Símbolo propio de anillos concéntricos, reemplaza el símbolo de O. (`SYMBOL_BRIEF.md`, ya ejecutado).
- Wording real en hero, Quiénes somos y actividades — cita textual del material de la O. donde existe, ver `DECISIONS.md`.
- 7 actividades reales cargadas con fotos propias (5 de 7 tienen foto; Círculos ×2 quedan con placeholder — se resuelve con símbolo en la ronda en curso).
- Binding de fotos completo en grid Home / lista Actividades / detalle (`PHOTOS_BRIEF.md`, ya ejecutado).
- 3 publicaciones de O. reales (título e imagen extraídos de opusdei.org por fetch directo), con link a la URL real del artículo.
- **Navegación por categoría (2026-08-29, `NAVIGATION_BRIEF.md`, ya ejecutado):** Actividades es grilla de 7 categorías con drill-down (ya no agrupa por fecha). Home con chips progresivos, prefiltrado en "formación/espiritual" al abrir. Visitas a los pobres/Colectas ocultas (texto listo en `DECISIONS.md` para reactivar). Círculos con placeholder de símbolo; las otras 6 actividades reales ya tienen foto propia (incluye Optimal Work y Jornada Matrimonio y Familia).

## Wording — qué falta todavía (auditoría 2026-08-29, resuelto 2026-08-30)
- **"Todo te recarga"** — frase de cierre de las stories, sigue sin lugar asignado. Único pendiente real de esta lista.
- ~~Descripciones de categoría sin cablear~~ — resuelto: son editables desde el admin (tab Categorías), se muestran en la página de cada categoría cuando existen.
- ~~Sección "Textos diarios" nunca implementada~~ — resuelto (carga manual desde el admin, ver sección de abajo).
- ~~"Qué se hace acá" con bullets fijos del template viejo~~ — resuelto: ahora se genera en vivo listando `categories.name`, nunca queda desincronizado de la grilla real.
- ~~Confesiones sin contenido~~ — resuelto: tarjeta "Reservar hora de confesión" que redirige a `poloniasub35.setmore.com` (booking real del centro), editable vía `site_content.confesiones.booking_url`.

## Backend / panel admin / scraper — en ejecución (2026-08-30)
Ronda 7 de `DECISIONS.md`. Plan: `/Users/ignacio_aranguiz/.claude/plans/estuve-pensando-en-como-transient-bee.md`.
- **✅ Fase 1 — Supabase:** proyecto `poloniapp` creado (São Paulo), schema completo + RLS corrido (`supabase/schema.sql`), admin cargado, contenido real migrado (`supabase/seed.sql`).
- **✅ Fase 2a — Home data-driven:** `docs/index.html` dejó de ser el export bundlado de Claude Design — reescrito a mano (HTML/CSS/JS simple, sin runtime bundler) con fetch client-side a Supabase.
- **✅ Fase 2b — Navegación real:** router hash-based (Home → grilla de 7 categorías → lista por categoría → detalle de actividad). Categorías sin actividades muestran "próximamente". Detalle usa `locations_public` (solo nombre, nunca dirección) y CTA de inscripción deshabilitado (llega en Fase 4).
- **✅ Fase 2c — Bubble chat:** flotante en todas las vistas, número general en `site_content.contact.whatsapp` (+56953719944), con override por actividad vía `activities.contact_name/contact_phone` (ej. persona a cargo de un Círculo) cuando esté cargado.
- **Fase 2 completa**, viendo en `/preview/` (no en la raíz todavía, ver nota de deploy abajo).
- **✅ Fase 3 — Panel admin completo:** `docs/admin/`, Supabase Auth (email+password) + allowlist `admins`. 7 pestañas: Contenido fijo, Categorías, Actividades (con sesiones anidadas), Ubicaciones, Publicaciones, Texto diario (solo lectura), Inscripciones (solo lectura). Upload real de imágenes a Supabase Storage (bucket `site-images`) en los 3 campos de foto (Quiénes somos, actividades, publicaciones).
- **Manual para admins:** `docs/manual/` (endpoint público, con capturas reales), explica cómo entrar, editar texto, subir imagen, ver el resultado.
- **Pendiente Fase 4:** flujo público de inscripción + RPC `register_and_reveal_address` (ya está en el schema, falta cablear en el frontend) — a la espera de feedback de los otros admins (reunión en ~2 semanas, 2026-09-13).
- **✅ Fase 5 (pivot):** el scraper automático no es viable — opusdei.org corre atrás de Cloudflare con challenge JS en todas las rutas (sitio, /feed, /rss.xml). "Texto diario" pasa a carga manual desde el admin (mismo patrón que Publicaciones), con su sección ya viva en la Home pública.
- **✅ Swap a producción (2026-09-05):** `docs/preview/index.html` pasó a ser `docs/index.html` (rutas relativas `../assets/` → `assets/`, se sacó el `<meta robots noindex>` y el "(preview)" del `<title>`). El bundle viejo quedó en `docs/legacy/index.html` como respaldo rápido.

## Primera ronda de feedback de los admins (2026-09-06, resuelta)
Tras el swap se compartió el link a los otros admins del centro para prueba. Feedback recibido y ya en producción:
- Marca "poloniapp" → "Poloniapp" (mayúscula inicial) en toda la web, admin y manual.
- `hero.title` cambiado a "Formación para profesionales jóvenes" — hecho por el admin directamente desde el panel (Contenido fijo → Hero), sin deploy.
- Chips de foco simplificados a "espiritual" / "trabajo" / "familia" (el label de "familia" faltaba en el código, aunque el bucket ya existía — quedó habilitado).
- Quiénes somos: el párrafo de la misión (el que cita a san Josemaría) ahora va primero.
- Fotos de tarjetas de actividad y de detalle: `background-size: contain` en vez de `cover`, para que se vean completas sin recorte.
- Clasificación de actividades por foco (espiritual/trabajo/familia): el usuario no tiene claro si está bien hecha hoy, pero decidió dejarla así por ahora — no se tocó.
- **Deuda anotada:** nombre de marca, orden de párrafos de Quiénes somos y labels de chips están hardcodeados en `docs/assets/js/app.js`, no en `site_content` — cualquier cambio futuro similar requiere una sesión de código, no es autoservicio desde el admin. Evaluar si vale la pena hacerlos editables cuando se retome Fase 4.

## Próximos pasos (no wording)
- Fase 4 (inscripciones) — retomar después de la reunión con los otros admins (~2026-09-13).
- Implementar tracking de clics en bubble chat (recomendación del brief original: Google Sheets vía Apps Script Web App).
- Reactivar Visitas a los pobres / Colectas cuando haya decisión — el texto ya está listo en `DECISIONS.md`, no reinventar.

## Blockers
- **Fase 4 (inscripciones):** bloqueada a propósito — el usuario quiere feedback de los otros admins del centro antes de definir el flujo, se juntan ~2026-09-13.
- Nada más bloqueante — el link de WhatsApp ya se cargó (+56953719944).

## Documentos del proyecto — qué es cada uno
- `PROJECT_BRIEF.md` — brief de producto original (v0).
- `DESIGN_BRIEF.md` — arquitectura de información y paleta visual original (v0) — **algunas decisiones ahí quedaron obsoletas por la iteración v1** (ej. filtro default `todas`, símbolo de O.); `DECISIONS.md` manda cuando difieren.
- `DECISIONS.md` — **fuente de verdad viva** de toda decisión de diseño/UX/contenido tomada durante la iteración v1, ronda por ronda. Leer siempre primero.
- `SYMBOL_BRIEF.md` — brief del símbolo de anillos (ya ejecutado).
- `PHOTOS_BRIEF.md` — brief del binding de fotos de actividades (ya ejecutado).
- `NAVIGATION_BRIEF.md` — brief de navegación por categoría + chips progresivos + fotos/placeholder (ya ejecutado, integrado también en el frontend nuevo data-driven).
- `journey-centro-cultural.svg` — journey to-be original.
- `rings-reference.png` — referencia visual del símbolo (baja resolución, solo conceptual).
- `docs/assets/` — assets reales del sitio: `activities/` (fotos de actividades), `posts/` (fotos de publicaciones de O.), `poloniapp-symbol.svg` (símbolo standalone), `css/`+`js/` (frontend data-driven nuevo).
- `supabase/schema.sql` — schema completo (tablas, RLS, RPC) del backend, fuente de verdad del modelo de datos.
- `supabase/seed.sql` — contenido inicial migrado a Supabase (no re-correr entero: los inserts de actividades/sesiones no tienen `on conflict`, duplicarían datos).
- `docs/admin/`, `docs/preview/`, `docs/manual/` — panel admin, build nuevo del sitio, y manual para admins (ver sección Deploy).
