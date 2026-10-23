# Centro cultural — App de información (MVP)

## Contexto
Centro cultural del O. donde se realizan meditaciones, cursos de retiro, cursos de doctrina y formación espiritual y humana. El centro no depende de esta app para su identidad institucional (esa ya la cubren los canales oficiales del O. a nivel internacional); esta app cubre la capa **local y específica** de este centro en particular.

No es un objetivo de este proyecto viralizar o hacer crecer la audiencia del centro. El objetivo es eliminar la fricción para quienes **ya sienten curiosidad**, por la razón que sea (un amigo lo menciona, cercanía física, etc.).

## Problema a resolver
Hoy no contamos con una plataforma digital (o un medio) que permita difundir localmente las actividades del centro para quienes las organizamos — ya sea formación espiritual o humana, o actividades de índole espiritual como retiros, convivencias y misas.

Esto no es un problema de informalidad: la forma en que se hacen las cosas en el O. es a través del trato personal 1:1, y eso no es informal, es el estilo propio del apostolado. Esta plataforma no busca reemplazar ese trato, sino facilitarlo — da un lugar donde coordinar y ordenar el contenido de las actividades, y suma una app simpática, con un guiño moderado a la era digital, sin que eso sea el centro de la propuesta. El foco sigue siendo el apostolado del trato personal; la app es un facilitador, no el protagonista.

Como consecuencia, cuando una persona externa siente curiosidad por el centro, tampoco existe hoy ningún espacio donde pueda auto-informarse — ni de qué es el centro (su rol dentro de la espiritualidad católica del O.), ni de sus actividades concretas (qué hay, cuándo, con qué frecuencia). Esa curiosidad se pierde si no hay alguien cerca que la resuelva en el trato personal.

## Usuario objetivo del MVP
Persona que **nunca ha ido** al centro pero tiene curiosidad — es el "gancho" de entrada. (Fuera de scope del MVP, pero relevantes a futuro: asistente ocasional y asistente habitual.)

## Problem statement (síntesis final)
> No contamos con una plataforma digital que permita difundir localmente las actividades de formación espiritual y humana del centro. El trato personal 1:1, propio del estilo del apostolado del O., sigue siendo el corazón de cómo se coordina todo — pero hoy no tiene ningún soporte digital que lo facilite, por lo que quien organiza no tiene dónde centralizar el contenido, y quien siente curiosidad por el centro no tiene dónde auto-informarse ni de su identidad ni de sus actividades concretas.

## Journey (to-be) — ver `journey-centro-cultural.svg`

1. **Trigger social** — un amigo lo menciona, cercanía física, invitación puntual. (No se diseña ni se fuerza; ocurre orgánicamente.)
2. **Aterrizaje** — el punto que hoy no existe: un lugar propio del centro donde consultar. Este es el gap central que resuelve el MVP.
3. **Autoinformarse** (navegación 100% *pull*, sin notificaciones ni push de contenido):
   - **Capa identidad** — qué es el centro, su lugar dentro del O., propósito.
   - **Capa actividades** — meditaciones, cursos de retiro, cursos de doctrina, formación espiritual y humana: qué hay, cuándo.
4. **Contacto simple** — único componente "push" del MVP: un bubble chat que lleva directo a un grupo de WhatsApp. Sin formularios, sin fricción.

## Scope del MVP

**Dentro de scope:**
- Web app informativa, navegación libre (pull).
- Capa de identidad del centro.
- Capa de actividades (contenido variado: misas, charlas, retiros, talleres), con categorías **no excluyentes** (una actividad puede tener varios tags a la vez: formación/espiritual, trabajo/laboral, familia). Filtro por defecto: "todas".
- Sincronización automática con publicaciones oficiales de O. (opusdei.org) vía scraper/bot, para mantener la app viva diariamente sin depender de que el centro publique contenido propio cada día.
- Bubble chat de contacto → redirige a grupo de WhatsApp.
- Registro mínimo de clics en el bubble chat (ver sección de tracking).

**Decisión de diseño — protagonismo de las actividades vs. noticias de O.:**
Las actividades del centro son el foco n°1 y deben mantener protagonismo visual. Las publicaciones de O. se muestran en una sección secundaria, visualmente distinta (formato compacto, sin los filtros de interés que sí aplican a las actividades), ubicada debajo del feed principal de actividades — nunca mezclada dentro del mismo grid ni compitiendo por el primer scroll.

**Fuera de scope (para después):**
- Inscripción o confirmación de asistencia a actividades específicas.
- Segmentación para asistente ocasional / habitual.
- Cualquier tipo de notificación push, newsletter, o retorno activo del centro hacia el usuario.
- Todo lo que ocurra *después* del clic en el bubble chat (flujo dentro del grupo de WhatsApp).

## Tracking de clics en el bubble chat
Objetivo: saber cuánta gente hace clic, sin overengineering.

Opciones evaluadas, de más simple a más completa:
1. **Google Sheets vía Apps Script Web App** — un endpoint POST gratuito que escribe una fila (timestamp, opcionalmente user-agent/página de origen) cada vez que se hace clic. Cero infraestructura, cero costo, editable a mano.
2. **Parámetro UTM en el link de WhatsApp + Google Analytics/Plausible** — si ya se va a instrumentar analítica general del sitio, se puede leer el evento de clic ahí sin sistema aparte.
3. **Contador simple tipo counter.dev o Plausible Events** — si se quiere algo visual sin abrir una hoja de cálculo.

Recomendación inicial: opción 1 (Google Sheets + Apps Script) por ser la más simple y no requerir cuentas de terceros nuevas. Se puede migrar después si el volumen lo justifica.

## Fuentes de contenido
- **Actividades del centro** — gestión manual por parte del equipo organizador (dueños del contenido). Tienen vista de detalle propia dentro de la app.
  - **Campos estructurados (necesarios para tarjetas y filtros)**: título, imagen, categoría(s) — no excluyentes —, fecha/hora.
  - **Cuerpo**: formato libre — quien publica escribe la descripción sin plantilla rígida.
  - **Campos sugeridos (opcionales, se muestran solo si se completan)**: quién organiza/dicta, lugar o dirección (con link a mapa), cualquier otro detalle relevante a criterio de quien publica.
  - El bubble chat de contacto está siempre presente en la vista de detalle.
- **Publicaciones de O.** — sincronización automática desde opusdei.org (es-cl) mediante scraper/bot. La app **no duplica el contenido completo**: al hacer clic en una publicación, redirige directo a la URL original en opusdei.org. Esto simplifica lo que el scraper necesita extraer (título, categoría, imagen, extracto corto, y la URL) y evita mantener contenido desactualizado si O. edita o retira algo.
- Pendiente definir en implementación: frecuencia de sync, y validar que el scraping respete los términos de uso del sitio de O.

## Patrones de navegación
- **3 destinos de primer nivel** — Inicio, Actividades, Quiénes somos — accesibles siempre vía un tab bar persistente (no menú hamburguesa; con solo 3 destinos, exponerlos directo es más simple).
- **Detalle de actividad es un drill-down**, no un destino de primer nivel: no lleva tab bar, solo botón "volver" hacia el listado de Actividades. Se deja así a propósito — menos opciones visibles en el momento en que la persona está evaluando si contactar, evita distraer del paso de conversión.
- **Símbolo oficial**: presente en el header de todas las pantallas, sin función de navegación (no es clickeable como atajo a Inicio).
- **Bubble chat**: flotante en pantallas de exploración (Home, Actividades); se vuelve botón fijo dentro del flujo (no flotante) en pantallas de decisión (Detalle de actividad, Quiénes somos), como cierre natural del contenido.

## Preguntas abiertas para más adelante
- ¿Cómo se prioriza/organiza el contenido dentro de la capa de actividades (por tipo, por fecha, por frecuencia)?
- ¿Qué pasa después del clic en el bubble chat — hay un flujo definido dentro del grupo de WhatsApp?
- ¿Cómo evoluciona el journey para asistente ocasional y habitual (siguientes fases post-MVP)?
