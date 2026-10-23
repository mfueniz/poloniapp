# Centro cultural — Brief de diseño visual (MVP)

Este documento asume que la estructura, el contenido y la navegación ya están cerrados (ver `PROJECT_BRIEF.md` para el detalle completo del problema y el scope). Acá se resume todo lo necesario para pasar directo a exploración visual, sin volver a discutir arquitectura.

## Problem statement
No contamos con una plataforma digital que permita difundir localmente las actividades de formación espiritual y humana del centro. El trato personal 1:1, propio del estilo del apostolado de O., sigue siendo el corazón de cómo se coordina todo — pero hoy no tiene ningún soporte digital que lo facilite. La app no reemplaza ese trato, lo facilita.

## Tono y sensación buscada
- **Jovial pero no infantil** — apunta a jóvenes profesionales, no a niños ni a un tono institucional pesado.
- **Guiño moderado a lo digital/IA**, sin que sea el protagonista — el foco es el apostolado del trato personal, la app es un facilitador.
- **Sobrio en "Quiénes somos"** — ahí el tono baja un cambio, prosa editorial, sin necesidad de imágenes grandes ni elementos "marketineros".
- Referencia de partida (no copiar, solo tomar como base de paleta y patrón de tarjeta): opusdei.org/es-cl — usa tarjetas cuadradas foto-primero con tag de categoría y fecha. Nuestra versión debe sentirse más feed-social/joven, no boletín institucional.

## Usuario objetivo del MVP
Persona que nunca ha ido al centro pero siente curiosidad (por un amigo, cercanía física, etc.). Es el "gancho" de entrada — asistente ocasional y habitual quedan para fases posteriores.

## Arquitectura de información — 4 pantallas

### 1. Home
- Header: símbolo oficial (sin función de navegación).
- Hero corto de identidad (una frase, no un párrafo).
- Filtros de interés — chips multi-selección: **todas** (default) · formación/espiritual · trabajo/laboral · familia.
- Feed principal: grid de tarjetas de actividades (foto + tag de categoría + título + fecha), foco visual n°1.
- Link "ver todas →" hacia Actividades.
- Sección secundaria, claramente distinta y ubicada debajo: tira horizontal scrolleable de publicaciones de O. (formato compacto tipo stories, sin filtros propios, label "sync diario").
- Teaser sobrio de "Quiénes somos" con link.
- Bubble chat flotante (esquina inferior).
- Tab bar persistente abajo: Inicio · Actividades · Quiénes somos.

### 2. Actividades (listado completo)
- Mismos filtros multi-selección que el Home.
- Lista agrupada por fecha (ej. "esta semana" / "próximo mes"), tarjeta horizontal (imagen chica + texto) en vez de grid — más fácil de escanear en lista larga.
- Una actividad puede mostrar más de un tag a la vez.
- Bubble chat flotante.
- Tab bar persistente.

### 3. Detalle de actividad (drill-down, sin tab bar)
- Header: solo "volver" + símbolo oficial (sin tab bar — a propósito, para no distraer del paso de conversión).
- Imagen de portada (campo estructurado).
- Tags + título + fecha/hora (campos estructurados).
- Cuerpo: **formato libre**, sin plantilla rígida — quien publica escribe la descripción como quiera.
- Campos opcionales (se muestran solo si se completan): quién organiza/dicta, lugar/dirección con link a mapa.
- Bubble chat como botón fijo al final del contenido (no flotante) — CTA de cierre.

### 4. Quiénes somos (destino de primer nivel)
- Header: símbolo oficial, sin foto de portada grande.
- 100% editorial: qué es el centro (párrafo breve), su lugar dentro de O. (párrafo breve, sin explicar O. desde cero), qué se hace acá (lista breve: meditaciones, retiros, doctrina, formación espiritual y humana).
- Dirección/cómo llegar, si aplica.
- Bubble chat como botón fijo al final (igual que en detalle de actividad).
- Tab bar persistente (es destino de primer nivel).

## Reglas de navegación
- 3 destinos de primer nivel (Inicio, Actividades, Quiénes somos) → tab bar persistente, siempre visible.
- Detalle de actividad es la única excepción: drill-down puro, solo "volver", sin tab bar.
- Bubble chat: flotante en pantallas de exploración (Home, Actividades), fijo en el flujo en pantallas de decisión (Detalle, Quiénes somos).

## Fuentes de contenido (relevante para cómo se ve, no cómo se construye)
- Actividades del centro: contenido propio, foco visual n°1.
- Publicaciones de O.: sync automático, se abren en la URL original de opusdei.org (no hay vista de detalle propia en la app) — por eso el tratamiento visual es deliberadamente secundario/compacto.

## Paleta de color (punto de partida, extraída de opusdei.org)
- Acento dorado/ámbar cálido: `#C88A3D`
- Crema (fondo de tags): `#EFE9DD`
- Tinta / texto principal: `#2C2C2A`
- Coral opcional (segundo acento, ej. para diferenciar categorías): `#D85A30`
- Fondo base: blanco / near-white

## Logo
No hay logo definitivo. Se usará el **símbolo oficial de O.** (no un mark inventado) — pendiente de que el equipo del centro entregue el asset correcto. Diseñar el header dejando espacio flexible para ese símbolo, sin depender de sus proporciones exactas todavía.

## Fuera de scope para esta fase de diseño
- Inscripción o confirmación de asistencia.
- Notificaciones push o cualquier retorno activo del centro hacia el usuario.
- Vista de detalle propia para publicaciones de O. (redirige afuera).
- Segmentación visual para asistente ocasional/habitual.
