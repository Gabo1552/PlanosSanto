# Contraste WCAG 2.2 AA — `ux-shell.css` y `style.css`

Fecha: 2026-10-22 · Rama: `claude/noche-shell` · Alcance: editor offline (`sketchup_offline/ui`), shell `.ux-shell` y hoja base `style.css`.

## Criterios aplicados

| Criterio | Umbral |
|---|---|
| 1.4.3 Contraste mínimo (texto normal) | 4,5:1 |
| 1.4.3 Texto grande (≥ 24 px, o ≥ 18,66 px en negrita) | 3:1 |
| 1.4.11 Contraste no textual (borde que identifica un campo, indicador de foco, estado seleccionado) | 3:1 contra el fondo adyacente |
| Excepciones de 1.4.3 | Componentes inactivos (`disabled`/`aria-disabled`), texto decorativo con `aria-hidden` |

Fórmula: luminancia relativa sRGB de WCAG, `(L1 + 0,05) / (L2 + 0,05)`. Los fondos son los efectivos (primer ancestro con fondo opaco), medidos en Chromium con el editor compilado.

## Método

1. **Estático**: extracción de cada regla con `color`, `background`, `outline` o `border` de ambos CSS y cálculo del ratio contra su fondo declarado o el del contenedor (`#FFFFFF` paneles, `#F6F5F0` lienzo del shell, `#19483D` riel y encabezado de tabla).
2. **Medido**: recorrido en Chromium de todos los nodos con texto visible en Inicio, Materiales, Maderera, Muebles (con y sin advertencias), Planos A4, aviso de error, confirmación y ayuda; color y fondo efectivos por nodo.
3. **axe-core 4.14** (reglas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) en esas mismas vistas. Queda automatizado en `tests/offline/n2-shell.spec.ts`.

## Correcciones

| Archivo | Selector | Antes | Después | Criterio |
|---|---|---|---|---|
| style.css | `h2>span` (número de sección, p. ej. «03» en Notas) | `#65809D` sobre `#F8F9F5` = **3,87** | `#536478` = **5,74** (6,07 sobre blanco) | 1.4.3, 11 px negrita |
| style.css | `.help-popover:focus` (contorno al abrir la ayuda) | `#7E9CBF` sobre blanco = **2,84** | `#1F4D78` = **8,78** | 1.4.11 foco |
| style.css | `td input` (borde) | `#D9E1EB` = **1,32** | `#6E8EAF` = **3,41** | 1.4.11 campo |
| style.css | `.note-editor textarea` (borde) | `#B9C8D8` = **1,71** | `#6E8EAF` = **3,41** | 1.4.11 campo |
| style.css | `.workshop-form input/select/textarea` (borde) | `#BBCBDC` = **1,66** | `#6E8EAF` = **3,41** | 1.4.11 campo |
| ux-shell.css | `.ux-shell .parts-config tr.selected input` (borde en fila seleccionada) | `#7E9E8F` sobre `#EAF1EC` = **2,55** | `#5A6A61` = **4,99** | 1.4.11 campo |

Nota: dentro de `.ux-shell` los bordes de campos ya los fija `.ux-shell input…{border-color:#7E8A83}`; los tres cambios de borde en `style.css` corrigen la hoja base para cualquier vista que la use sin el shell (y evitan que una regresión de especificidad reintroduzca bordes de 1,3:1).

## Pares verificados (estado final)

### Texto — shell (`ux-shell.css`)

| Uso | Texto / fondo | Ratio | Resultado |
|---|---|---|---|
| Texto base | `#263830` / `#F6F5F0` | 11,38 | ✅ |
| Botón | `#263830` / `#FFFFFF` | 12,42 | ✅ |
| Botón hover | `#263830` / `#EDF2ED` | 10,96 | ✅ |
| Primario | `#FFFFFF` / `#19483D` | 10,32 | ✅ |
| Primario hover | `#FFFFFF` / `#10382F` | 12,89 | ✅ |
| Primario inactivo (exento) | `#43534A` / `#D9DED7` | 5,97 | ✅ aun sin exención (con `opacity:.53` queda exento) |
| Riel | `#F7F5EF` / `#19483D` | 9,46 | ✅ |
| Riel hover | `#F7F5EF` / `#285B4D` | 7,15 | ✅ |
| Riel actual | `#FFFFFF` / `#2D6453` | 6,86 | ✅ |
| Marca «S» (28 px negrita) | `#DBC3A4` / `#19483D` | 6,07 | ✅ |
| Marca «PLANOS» (9 px) | `#E0E8DF` / `#19483D` | 8,24 | ✅ |
| «LOCAL / SIN NUBE» (9 px) | `#D0DCD1` / `#19483D` | 7,29 | ✅ |
| Número en encabezado de tabla | `#E3EAE0` / `#19483D` | 8,41 | ✅ |
| Miga de pan | `#5A6A61` / `#FFFFFF` | 5,72 | ✅ |
| Separador «/» de la miga (`aria-hidden`) | `#9DAAA0` / `#FFFFFF` | 2,42 | Exento (decorativo) |
| Texto secundario (`--muted`) | `#5A6A61` / `#F6F5F0` | 5,24 | ✅ |
| Secundario sobre panel seleccionado | `#5A6A61` / `#EAF1EC` | 4,99 | ✅ |
| Número de sección (panel izquierdo) | `#7B5D3C` / `#FFFFFF` | 6,05 | ✅ |
| Estado / selección | `#19483D` / `#EAF1EC` | 8,99 | ✅ |
| Motivo de bloqueo | `#795015` / `#FFFFFF` | 7,07 | ✅ |
| Aviso advertencia | `#6B4610` / `#FFF3DD` | 7,62 | ✅ |
| Advertencias de hoja | `#795015` / `#FFF3DD` | 6,43 | ✅ |
| Aviso error | `#8C3025` / `#FFF0ED` | 7,38 | ✅ |
| Aviso éxito | `#2C5238` / `#EDF5EF` | 7,97 | ✅ |
| Confirmación | `#5D2A24` / `#FFF8F6` | 10,98 | ✅ |
| Botón destructivo | `#FFFFFF` / `#983C38` | 6,91 | ✅ |
| Destructivo hover | `#FFFFFF` / `#7B2F2C` | 9,19 | ✅ |

### Texto — hoja base (`style.css`)

| Uso | Texto / fondo | Ratio | Resultado |
|---|---|---|---|
| Número de sección `h2>span` | `#536478` / `#F8F9F5` | 5,74 | ✅ (corregido) |
| Texto atenuado (`.muted`, `.hint`, `small`) | `#536478` / `#FFFFFF` | 6,07 | ✅ |
| Guía sin guardar | `#805A16` / `#FFFFFF` | 6,19 | ✅ |
| Ayuda: «Escape para cerrar» (10 px) | `#64758B` / `#FFFFFF` | 4,71 | ✅ (margen bajo) |
| Ayuda: botón cerrar | `#566A82` / `#FFFFFF` | 5,56 | ✅ |
| Botón base | `#1F4D78` / `#FFFFFF` | 8,78 | ✅ |
| Botón base hover | `#1F4D78` / `#EEF3F9` | 7,87 | ✅ |
| Advertencias | `#7B561A` / `#FCF4E3` | 6,02 | ✅ |
| Error | `#8A332D` / `#FBECE9` | 7,05 | ✅ |

### No textual (1.4.11)

| Uso | Color / fondo | Ratio | Resultado |
|---|---|---|---|
| Foco general del shell | `#19483D` / `#FFFFFF` · `#F6F5F0` | 10,32 · 9,45 | ✅ |
| Foco en el riel | `#DBC3A4` / `#19483D` · `#2D6453` | 6,07 · 4,04 | ✅ |
| Foco base (`style.css`) | `#2877BB` / `#FFFFFF` | 4,72 | ✅ |
| Foco de la ayuda | `#1F4D78` / `#FFFFFF` | 8,78 | ✅ (corregido) |
| Borde de campos del shell | `#7E8A83` / `#FFFFFF` · `#F6F5F0` | 3,59 · 3,29 | ✅ |
| Borde de campo en fila seleccionada | `#5A6A61` / `#EAF1EC` | 4,99 | ✅ (corregido) |
| Borde de campos base | `#6E8EAF` / `#FFFFFF` | 3,41 | ✅ (corregido) |
| Borde de botones del shell | `#D9DED7` / `#FFFFFF` | 1,37 | No aplica: el botón se identifica por su texto, el borde no es necesario para reconocerlo |

## Resultado de axe (serious / critical)

| Vista | Antes | Después |
|---|---|---|
| Muebles, Planos A4, aviso de error, confirmación, ayuda | `color-contrast` en `.notes-panel h2>span` (3,87) | 0 |
| Inicio, Maderera, Planos A4 vacío | 0 | 0 |
| Materiales | 2 hallazgos en `MaterialLibraryPanel.tsx` (ver abajo) | Fuera de alcance, excluidos de la prueba con nombre |

### Pendientes fuera de alcance (no son de `App.tsx`, `ux-shell.css` ni `style.css`)

- `aria-prohibited-attr` (serious): `.material-library-grid` es un `div` con `aria-label` sin rol. Arreglo sugerido en `MaterialLibraryPanel.tsx`: `role="group"` (o `role="list"` con ítems `listitem`).
- `label-content-name-mismatch` (serious, WCAG 2.5.3): el botón con `aria-label="Por revisar"` muestra un texto que no está contenido en su nombre accesible. Arreglo sugerido: quitar el `aria-label` o hacer que empiece con el texto visible.

No se encontraron violaciones `critical`. No existía un informe previo `A11Y_AXE.md` en `docs/qa/`; este documento lo reemplaza para esta ronda.

## Supuestos y límites

- Las medidas no cubren estados que solo existen dentro de SketchUp (diálogos nativos) ni la paleta de pintura (`smart-paint.css`), fuera de alcance.
- El texto inactivo se midió para referencia, pero WCAG lo exime.
- axe no evalúa `:hover` ni contornos de foco: esos pares se calcularon de forma estática (tablas de arriba) y los de foco y bordes también se verifican en la prueba «bordes de campos y contornos de foco llegan a 3:1».
