# Brief — Fotos reales de actividades (para Claude Design)

Pegar en la misma sesión de claude.ai/design donde se trabajó el símbolo de anillos. Subir el HTML actualizado de `docs/index.html` como fuente de verdad antes de tocar nada — ya tiene el wording y las actividades reales integradas.

## Problema a resolver
El binding de fotos por actividad está incompleto en el prototipo actual (`Component.renderVals()` / template):
- **Grid de Home** (`cards`): sí usa `{{ a.img }}` por actividad — funciona.
- **Lista de "Actividades"** (dentro de `groups.items`): el placeholder de foto está hardcodeado como texto literal `"foto"`, no lee ningún campo de `a`.
- **Portada del Detalle**: hardcodeado como texto literal `"foto de portada"`, tampoco lee ningún campo de `a`/`detail`.

Hay que completar el binding en los 3 lugares para que cada actividad pueda mostrar su foto real cuando la tiene, y siga con el placeholder rayado (`.ph washed`) cuando no.

## Fotos reales disponibles
En `docs/assets/activities/` (misma carpeta del repo, subidas junto con este brief):
- `catolicismo-ciclo2.jpg` → actividad `id:3` ("Catolicismo — Ciclo 2: Cristo nos salva")
- `encuentro-matrimonios-sept.jpg` → actividad `id:5` ("Encuentro de Matrimonios — Educación de hijos e hijas")
- `retiro-agosto.jpg` → actividad `id:6` ("Retiro de Agosto")

**Importante:** estas 3 son afiches de difusión reales (tienen texto propio superpuesto: título, fecha, dirección). Son la foto tal cual se usó para promocionar la actividad — no hace falta (ni conviene) que el diseño le agregue otro título encima en la tarjeta, capaz que sea mejor recortarlas o tratarlas para que no compitan visualmente con el `card-title` de la tarjeta. Usá criterio de diseño ahí.

**Sin foto real todavía:** Círculos (`id:1`, `id:2`), Optimal Work (`id:4`), Jornada Matrimonio y Familia (`id:7`) — quedan con el placeholder rayado `.ph washed` como está hoy.

## Qué se necesita como resultado
1. Los 3 lugares (`cards` del Home, `items` de Actividades, `detail` cover) leyendo un campo de foto por actividad — si existe foto real, se muestra la imagen; si no, sigue el placeholder rayado actual con su label.
2. Mantené la relación de aspecto y el `border-radius` que ya tiene cada contenedor (cuadrado 1:1 en el grid, 84×84 en la lista, 220px alto en el detalle) — solo cambia qué se renderiza adentro.
3. Guardar como HTML standalone, igual que las veces anteriores.

## Fuera de scope
- No hay que conseguir fotos nuevas para Círculos/Optimal Work/Jornada — eso queda pendiente de que el centro las pase.
- No cambies el wording que ya está en el HTML (hero, Quiénes somos, descripciones de actividades) — eso ya está resuelto en esta ronda.
