# Brief — Símbolo oficial de poloniapp (para Claude Design)

Pegar este brief directo en la sesión de claude.ai/design donde se trabajó el mockup v0.

## Objetivo
Reemplazar el placeholder de "símbolo oficial de O." del header (pendiente en el `DESIGN_BRIEF.md` original) por un símbolo propio: **los anillos concéntricos**, tomados del material de misión/visión del centro. Necesitamos el mark final + validar si la tipografía actual sigue siendo coherente con él.

## Qué representa el símbolo (para que la exploración no pierda el sentido)
Los "3 anillos" de San Josemaría: que busques a Cristo, que encuentres a Cristo, que ames a Cristo. En el material de referencia se ven como 3 anillos concéntricos incompletos (con una apertura, como un trazo que gira), cada uno de un color distinto, con un ícono/marca al centro. Cierre conceptual: "los anillos los completas tú... con Dios".

Referencia visual entregada por el centro (ver adjuntos de la sesión — capturas de Instagram stories, y `rings-reference.png` en esta misma carpeta): fondo navy oscuro, anillos en verde-menta / amarillo-lima / magenta, trazo grueso con terminación tipo "coma" (no un círculo perfecto cerrado), ícono "+" al centro.

**Nota de calidad de la referencia:** `rings-reference.png` es de baja resolución (265×248px, screenshot de screenshot). Usarla solo como referencia conceptual de forma/color/proporciones — el símbolo final debe generarse limpio (vectorial o alta resolución), no como upscale de ese archivo.

**Importante:** esa paleta (navy + menta/lima/magenta) es la del material original de O., **no** la paleta de poloniapp. Hay que adaptar el símbolo a la paleta propia (ver abajo), no calcarlo tal cual.

## Uso del símbolo en la app
Por `DESIGN_BRIEF.md`, el símbolo va en el header de 3 de las 4 pantallas (Home, Detalle de actividad, Quiénes somos) **sin función de navegación** — solo identidad. Necesita funcionar chico (tamaño de ícono de header, no de hero) y también, idealmente, como favicon/mark standalone.

## Restricciones de coherencia con el v0 ya validado
- **Paleta actual de poloniapp** (extraída de opusdei.org, ya validada con feedback positivo):
  - Acento dorado/ámbar: `#C88A3D`
  - Crema (fondo de tags): `#EFE9DD`
  - Tinta/texto: `#2C2C2A`
  - Coral (segundo acento): `#D85A30`
  - Fondo base: blanco/near-white
  - El símbolo tiene que convivir con esta paleta — no traer el navy/menta/lima/magenta del material original tal cual.
- **Tipografía actual:** `Caprasimo` (headings, display) + `Figtree` (body). Estas ya se usan en todo el mockup v0. Objetivo: **validar** si funcionan bien al lado del símbolo de anillos, no reemplazarlas de entrada — solo cambiar si al probarlas con el símbolo se ve una fricción real.
- **Tono:** jovial pero no infantil, apunta a jóvenes profesionales — evitar que el símbolo lea "infantil" o "corporativo pesado".

## Qué se necesita como resultado
1. El mark de anillos concéntricos adaptado a la paleta de poloniapp, en versión simple (funciona en tamaño chico de header).
2. Confirmación (o ajuste puntual) de que `Caprasimo`/`Figtree` siguen funcionando junto al símbolo.
3. Exportable para reemplazar el placeholder de símbolo en `docs/index.html` cuando se haga el próximo export bundlado.

## Fuera de scope de esta pieza
- No es una feature interactiva (el concepto de "completar los anillos" es solo storytelling en la sección Quiénes somos, no un tracker).
- No hace falta resolver el logo del centro en general — es específicamente el símbolo de header/identidad.
