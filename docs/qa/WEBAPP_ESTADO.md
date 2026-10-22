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
| `npx vitest run` | 172/172 | 178/178 (+6 de lib compartida) |
| `npx tsc --noEmit` | OK | OK |
| `npx eslint app components lib tests` | OK | OK |
| e2e `playwright.config.ts` | **13/16**: 3 fallas de entorno | 24/24 |

Las 3 fallas iniciales no eran de la app:

- `ruby-local.spec` (2 pruebas) lee `sketchup/build/contract-fixture.json`, que genera `npm run test:ruby`.
- `upload.spec` escribía en `sketchup/build/` sin crear la carpeta. Se corrigió en el test con `mkdir`.
- `npm run test:ruby` falla con `CSV::InvalidEncodingError` si el locale no es UTF-8. En este contenedor `LANG` estaba vacío; con `LANG=C.UTF-8` pasa 5/5. Conviene fijarlo en CI o en el setup.
- Chromium no está en `/usr/bin/chromium`. Hay que usar `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

Secuencia reproducible:

```sh
LANG=C.UTF-8 npm run test:ruby   # genera los fixtures en sketchup/build/
npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test --config playwright.config.ts
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

### Segunda pasada (implementado, e2e en `webapp-ux.spec.ts`)

8. **Notas con teclado:** al crear una nota, el foco va al comentario con el texto seleccionado, así se puede escribir directamente. `Esc` cancela el modo de anclaje, y el aviso lo indica. Al eliminar una nota, el foco vuelve a «Agregar nota» y el estado anuncia «Nota eliminada».
9. **Selección anunciada:** el mueble activo y la nota activa llevan `aria-current`, y el código de pieza elegido lleva `aria-pressed`.
10. **Auditoría axe-core** (WCAG 2.1 A/AA y buenas prácticas). Se corrió puntualmente con el `axe-core` 4.14 que ya trae `eslint-plugin-jsx-a11y`, sin dependencia nueva. Encontró dos problemas, ya corregidos: las dos columnas `<aside>` no tenían nombre (ahora se llaman «Muebles del proyecto» y «Notas de armado») y el código de cada nota daba 4,47:1. **Resultado: 0 violaciones** en inicio, demo, demo con nota, panel de cotas, enlace roto, error de subida y las tres páginas de `/instalar`.
11. **Móvil (390 px):** sin scroll horizontal en ninguna pantalla.

### Pendiente (L o requiere decisión)

- `Editor.tsx` es un componente de unas 100 líneas muy largas. Partirlo (barra superior, panel de notas, tabla) facilitaría el mantenimiento. No se hizo para no mezclar refactor con UX.
- Si se quiere axe en CI, hay que declarar `@axe-core/playwright` como dependencia de desarrollo. Hoy solo existe como transitiva de ESLint.
- Decidir el futuro del editor web (ver §1).
