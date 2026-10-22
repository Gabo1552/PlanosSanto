# Estado de la app web (Next.js) — auditoría 22/10/2026

Rama `claude/noche-webapp` (desde `claude/ux-extras-0811`). Alcance: `app/`, `components/`, pruebas en `tests/`. No se tocaron `sketchup_offline/`, `sketchup/`, `dist/` ni archivos `.rb`.

## 1. Para qué sirve

Hechos (README, `PLAN_DESARROLLO_EXTENSION.md`, código):

- **Origen:** la web fue el primer producto. El encargado exportaba desde SketchUp con la extensión 0.2/0.3 (`sketchup/`), subía un ZIP/JSON y en el navegador revisaba piezas, anotaba y exportaba el PDF de la guía de armado.
- **Hoy:** el producto principal es la extensión offline (`sketchup_offline/`, candidata 0.8.x), que hace todo dentro de SketchUp sin servidor. El README marca las secciones de la web como «Información histórica».
- **La web sigue viva en dos funciones:**
  1. **Canal de distribución:** `/instalar` y `/api/extension/offline` entregan el RBZ actual (lee `sketchup_offline/version.json`, hoy 0.8.10). `/instalar/web` y `/api/extension` mantienen el exportador 0.3.
  2. **Editor web heredado:** carga del ZIP 0.3/JSON, edición de nombres y notas, cotas, vistas y PDF A4 en el servidor. Funciona y tiene e2e, pero no recibe funciones nuevas.

**Opinión:** la web es **secundaria pero no obsoleta**. Como editor está congelada, porque el último commit propio en `app/` y `components/` es la importación de la 0.8.7. Como página de instalación y descarga sí está en uso. Antes de invertir en funciones nuevas para el editor web conviene decidir si se mantiene. Mi recomendación: dejarla como página de instalación y visor de respaldo, y no sumarle funciones.

## 2. Flujos

| Flujo | Pantalla / API | Estado |
| --- | --- | --- |
| Instalar extensión actual | `/instalar` → `/api/extension/offline` | OK (e2e `upload.spec`) |
| Instalar exportador 0.3 | `/instalar/web` → `/api/extension` | OK (e2e) |
| Subir ZIP/JSON/SKP | `/` → `POST /api/import/file` | OK. Un ZIP que solo trae `.skp` pide convertirlo en SketchUp. |
| Proyecto DEMO | `POST /api/projects` | OK |
| Editar (nombres, notas, cotas, vistas, agrupar) | `PUT /api/projects/[id]` con autoguardado a los 700 ms | OK (e2e `workshop`, `presentation`, `dimension-visibility`, `piece-groups`) |
| Reabrir por enlace `?proyecto=` | `GET /api/projects/[id]` | OK. Mejorado en esta pasada. |
| Exportar PDF A4 | `GET /api/pdf/[id]`, que usa `sketchup_offline/ui/pdf` | OK |
| Envío directo desde SketchUp | `/api/sketchup/pair` y `/receive` (requiere `PLANOS_BRIDGE_KEY`) | OK (e2e `ruby-send`) |
| Vista de impresión | `/print/[id]` | OK |

Persistencia: JSON en `data/` (`PROJECT_DATA_DIR`). No hay autenticación: está pensada para una red de taller confiable.

## 3. Relación con la extensión — código compartido

**lib/ SÍ se comparte.** `scripts/build-offline.mjs` compila `sketchup_offline/ui/*.tsx` con esbuild, y esos archivos importan:

`lib/dimensions`, `lib/model`, `lib/nameSuggestions`, `lib/naming`, `lib/orderPreview`, `lib/pieceGroups`, `lib/presentation`, `lib/scene`, `lib/sheet`.

Cambiar el comportamiento de cualquiera de ellos cambia el RBZ. En esta pasada **no se modificó `lib/`**. Solo se agregaron pruebas de caracterización (`tests/shared-lib.test.ts`) para `orderPreview` y `sheet`, que antes tenían cobertura solo indirecta.

**La dependencia también va en sentido inverso:** la web importa de la extensión.

- `components/Editor.tsx` usa `sketchup_offline/ui/GuideViews`.
- `app/api/pdf/[id]` usa `sketchup_offline/ui/pdf` y `sketchup_offline/assets`, así que el PDF web y el offline son el mismo motor.
- `/instalar` lee `sketchup_offline/version.json`.

Exclusivos de la web (no compartidos): `lib/archive`, `browser`, `http`, `pairing`, `pdf`, `reader`, `ruby-import`, `store`, `demo`, `a4Demo`, `diagramViewport`, `explosion`.

`app/globals.css` es solo de la web; la extensión tiene su propio `app.css`.

## 4. Verificación

| Paso | Resultado inicial | Resultado final |
| --- | --- | --- |
| `npm run build` | OK | OK |
| `npx vitest run` | 172/172 | 178/178 (+6 de lib compartida); en la segunda pasada, 261 pasan y 4 omitidas |
| `npx tsc --noEmit` | OK | OK |
| `npx eslint app components lib tests` | OK | OK |
| e2e `playwright.config.ts` | **13/16**: 3 fallas de entorno | 23/23 → 34/34 en la segunda pasada (+10 de axe, +1 de foco) |

Las 3 fallas iniciales de la primera pasada no eran de la app. Las causas de entorno quedaron resueltas en la segunda pasada (`claude/noche-webapp-2`):

- `ruby-local.spec` leía `sketchup/build/contract-fixture.json` y fallaba si no se había corrido `npm run test:ruby`. Ahora `tests/e2e/global-setup.ts` lo genera si falta (requiere Ruby).
- `npm run test:ruby` fallaba con `CSV::InvalidEncodingError` si el locale no era UTF-8. Ahora `scripts/test-ruby.mjs` fuerza `C.UTF-8`, igual que la config offline.
- Chromium: si no hay `CHROMIUM_PATH` ni `/usr/bin/chromium`, y el navegador de la versión instalada de Playwright no está descargado, `tests/chromium.ts` usa el Chromium más nuevo de `PLAYWRIGHT_BROWSERS_PATH` (por ejemplo, `/opt/pw-browsers`). Lo usan las dos configs.

Secuencia reproducible:

```sh
npm run build
npx playwright test --config playwright.config.ts
```

## 5. Pasada de UX y accesibilidad

### Implementado (con e2e en `tests/e2e/webapp-ux.spec.ts`)

1. **Errores legibles en español.** Antes, si se caía la red se mostraba «Failed to fetch». Una respuesta HTML (413 de un proxy) mostraba «Unexpected token '<'». Un error del servidor sin detalle dejaba el aviso **vacío**. Ahora `components/apiError.ts` centraliza los mensajes y lo usan el Editor, la subida y la vinculación. Se conservan los mensajes del servidor, incluido el de conflicto entre pestañas.
2. **Enlace a un proyecto borrado.** Muestra «No encontramos el proyecto de este enlace…» y limpia `?proyecto=` para que el error no vuelva al recargar.
3. **Estado de carga** al abrir un proyecto desde el enlace. Antes parpadeaba la pantalla de inicio con «Explorar DEMO». La rueda respeta `prefers-reduced-motion`.
4. **Estado vacío** en «Proyectos guardados»: muestra «Cargando proyectos…» y después «Todavía no hay proyectos guardados».
5. **Contraste AA.** `--muted` (#6f7c73) daba entre 3,6 y 4,4:1 sobre los fondos reales. También fallaban los encabezados de tabla, el pie, los contadores, la ayuda de instalación y los números de pasos (1,9:1). Se oscurecieron los tonos a ≥ 4,5:1 (≥ 3:1 en los números grandes) sin cambiar la paleta.
6. **Lectores de pantalla:** los iconos decorativos de las tarjetas de mueble (▤, ›) quedan con `aria-hidden`.
7. **Rioplatense:** «Tag» pasa a «Etiqueta» en el árbol de importación.

### Revisado y sin cambios

- El foco visible ya existía (`outline` de 3 px) y la e2e lo verifica.
- Hay `lang="es-AR"`, todos los controles tienen etiqueta, los avisos usan `role="alert"` y el guardado usa `role="status"`.
- La zona de arrastre tiene una alternativa por teclado (el botón «Elegir archivo»).

### Segunda pasada (`claude/noche-webapp-2`)

1. **Editor partido.** `components/Editor.tsx` queda como orquestador (~70 líneas). Las piezas están en `components/editor/`: `TopBar`, `PageHeading`, `StartGuide`, `ProjectStrip`, `FurnitureSidebar`, `ViewerPanel`, `PartsPanel` y `NotesPanel`. La persistencia (autoguardado, conflicto entre pestañas y aviso al cerrar) pasa al hook `useProjectSession`. Se mantienen el marcado y los textos, y las e2e previas pasan sin tocarlas.
2. **Foco al eliminar una nota.** Pasa a la nota siguiente (o a la anterior) y, si no queda ninguna, a «Agregar nota». Si ese botón está deshabilitado, al título del panel. Con e2e en `webapp-ux.spec`.
3. **Auditoría axe (WCAG 2.2 AA)** en `tests/e2e/a11y.spec.ts` con `@axe-core/playwright` (dependencia de desarrollo). Cubre inicio (también con aviso de error), las tres páginas de instalación, el editor (DEMO, nota abierta, moviendo cotas, visibilidad interior), la impresión y el celular. Falla con violaciones serious o critical. Se corrigieron tres:
   - Contraste del código de pieza en la lista de notas (4,48 → 5,65:1).
   - Contraste del detalle de «vista previa» de visibilidad interior (4,44 → 5,3:1). El estilo original vive en `sketchup_offline/ui/guideViews.css`, así que la web lo pisa desde `globals.css` y la extensión queda igual.
   - Nombre accesible de la tarjeta arrastrable de la nota (`label-content-name-mismatch`): ahora empieza con el texto visible. `components/Diagram.tsx` **también lo compila la extensión**, así que el cambio llega al RBZ. Es solo el `aria-label` y espacios invisibles en el SVG, sin cambio visual. Las pruebas offline dan lo mismo antes y después del cambio. Las 2 fallas de `ux2-nombres.spec` ya estaban en la línea base: la prueba buscaba «Otro mueble 1 piezas» y la interfaz dice «1 pieza». Se corrigió la prueba y offline queda en 160/160.

### Notas con teclado (rama `claude/noche-webapp`, portado sobre el Editor partido)

1. Al crear una nota, el foco va al comentario con el texto sugerido seleccionado (`NotesPanel`).
2. `Esc` cancela el modo de anclaje, y el aviso lo indica (`Editor` y `ViewerPanel`).
3. `aria-current` en el mueble y la nota activos, y `aria-pressed` en el código de pieza elegido.
4. Nombres para las dos columnas `<aside>`: «Muebles del proyecto» y «Notas de armado». Lo marca la regla `landmark-unique` (buenas prácticas de axe, fuera de las etiquetas WCAG de `a11y.spec`).

Con e2e en `webapp-ux.spec`. El foco al eliminar ya venía resuelto en la segunda pasada y se conserva esa versión.

Al integrar `claude/release-0812`, la release ya traía 2 errores de `tsc` y 2 fallas de vitest en `tests/cobertura-pedido-reglas.test.ts` (no existe `applyEquivalent` en `sketchup_offline/ui/workshopRules`) y en `tests/recognition.test.ts`. No vienen de este merge y no se tocaron.

### Pendiente

- Decidir el futuro del editor web (ver §1). No es una tarea de código.
- En la extensión, `.guide-preview-status small` (`sketchup_offline/ui/guideViews.css`) sigue en 4,44:1. La web lo corrige desde `globals.css`, pero conviene pasar el color a #5a665e en el CSS de la extensión.
