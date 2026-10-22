# QA de integración · noche del 22/10/2026

Rama `claude/noche-qa-integracion`, creada desde `claude/ux-extras-0811` (`b613762`).
Objetivo: regresiones **entre** funciones integradas en paralelo (Hito 2 pincel diario,
Hito 6 ModelWatch/franja/ventanas/respuestas por partes, Hito 7 gestión de materiales,
UX ronda 2, axe y errores de QA). Todo se verificó con dobles de la API de SketchUp,
el controlador Ruby sintético y Chromium; **nada de esto es SketchUp nativo**.

## 1. Merges revisados

`git log --merges -20`. Merges con resolución manual (`git show --cc`):

| Merge | Archivo | Zona resuelta | Veredicto |
|---|---|---|---|
| `a5802f2` (Hito 6) | `ui/App.tsx` | `quickHandler` pasa a `useLayoutEffect`; el guardián deja de bloquear por `modelAnalysisStale` | Correcto: la franja del Hito 6 reemplaza ese bloqueo; guardar/exportar siguen bloqueados por `blockReason`. |
| `a5802f2` (Hito 6) | `ui/bridge.ts` | `USER_DIALOG_ACTIONS` del Hito 7 + `Pending.parts` del Hito 6 | Correcto. Toda acción Ruby con `with_user_dialog` está en la lista (verificado con `grep`). |
| `bdd2a7e` (Hito 2) | `offline.rb` | `diagnostic` con `replyStats` (H6) y `paintClicks` (H2) | Correcto: conserva ambos. |
| `bdd2a7e` (Hito 2) | `ui/SmartPaintPalette.tsx` | arranque automático: `edgeCount` (H2) + `viewport_focus` (H7) | Correcto: el foco se pide solo tras un arranque activo y es best effort. |
| `e9e9e2a` (Hito 7) | — | sin conflictos manuales | — |

Las resoluciones en sí no rompieron nada. Las regresiones encontradas están en las
**interacciones** que ningún merge mostraba como conflicto.

## 2. Encontrado y corregido

### QA-INT-01 · El clic del pincel se leía como cambio externo (Hito 2 × Hito 6) — corregido

- **Hecho.** La herramienta del pincel confirma su operación desde un callback nativo
  (`onLButtonDown`), fuera de `handle()`, así que `without_model_watch` no la suprime.
  ModelWatch anotaba `model`; en la revisión diferida (0,3 s) `check_analysis`
  recorría el modelo entero para la huella y marcaba la franja con el motivo
  «El modelo cambió en SketchUp (edición, Deshacer o Rehacer).». Recién al detener la
  herramienta el motivo pasaba a «Pintaste desde Planos Santo.».
- **Impacto.** Motivo equivocado durante la pintura, y un recorrido O(modelo) en el primer
  clic: contradice VALIDACION_SKETCHUP del Hito 6 §1.6 («ningún clic dispara un análisis
  completo», objetivo < 150 ms por clic) en modelos grandes. Además, al cerrar la paleta
  separada (`palette_close`, `refresh:false`) o al reclamarla desde la ventana principal
  (`smart_palette_load` con `claim`), el motivo quedaba en «modelo» para siempre.
- **Corrección mínima** (`offline.rb`, `smart_event`): al recibir `changed:true` se marca
  la escritura propia (`mark_stale('paint')`). La revisión diferida ve la sesión
  reemplazada y no recorre el modelo.
- **Pruebas.** `noche_integracion_test.rb`: clic → flush sin recorrer el modelo y con motivo
  `paint` (también en ráfaga); cierre de la paleta separada tras pintar; reclamo desde la
  ventana principal; cambio de herramienta desde la barra. Las de clic y cierre de paleta
  fallaban antes de la corrección (verificado); la de reclamo se agregó después y recorre el
  mismo camino; la de la barra ya pasaba y queda como control.

### QA-INT-02 · Editor abierto después de cerrar la paleta sola quedaba sin ModelWatch (ventanas × Hito 6) — corregido

- **Hecho.** La paleta separada abierta sola crea la sesión y observa el modelo; al cerrarse
  sin editor llama `unwatch_model!` pero conserva la sesión. Al abrir el editor después
  (ARQ-07, sin analizar), `ensure_editor_context!` salía con `return if @session` y no
  volvía a observar.
- **Impacto.** Hasta analizar, los cambios de materiales hechos en el navegador nativo no
  refrescaban la ventana (MATERIALES-12).
- **Corrección mínima** (`ensure_editor_context!`): con sesión existente, reengancha
  ModelWatch si el modelo activo sigue siendo el de la sesión y el contexto es válido
  (no interfiere con la revisión al volver al modelo analizado).
- **Prueba.** `test_editor_opened_after_the_palette_closed_observes_the_model_again`
  (fallaba antes).

### QA-INT-03 · Doble de transporte del Hito 2 desconocía `viewport_focus` (Hito 2 × Hito 7) — corregido en pruebas

- **Hecho.** Tras el merge, el arranque automático de la paleta inmediata pide
  `viewport_focus`. El doble de `hito2-pincel.spec.ts` lanzaba «Unexpected action» y la
  petición quedaba colgada 120 s sin que la prueba lo notara.
- **Corrección.** El doble responde `viewport_focus` y la prueba verifica que se pide una vez,
  después de `smart_quick_start`. No hubo cambio de producto.

### QA-INT-04 · axe del shell fallaba en Materiales (UX ronda 2 / axe × Hito 7) — corregido

- **Hecho.** `n2-shell.spec.ts › axe no encuentra violaciones serious…` fallaba de forma
  determinista ya en la base `b613762`: `label-content-name-mismatch` (WCAG 2.5.3, serious)
  en los filtros «Todos», «Placas», «Cantos», «Otros» y «Archivados» de la biblioteca.
  La ronda 2 había excluido solo «Por revisar» (docs/qa/CONTRASTE.md); el Hito 7 sumó el
  contador visible a todos los filtros con `aria-label` fijo.
- **Corrección mínima** (`MaterialLibraryPanel.tsx`): sin `aria-label`; el contador ya es
  `aria-hidden`, así que el nombre accesible sigue siendo «Todos», «Placas», etc. y las
  pruebas que buscan esos nombres no cambian.
- **Prueba.** La propia de axe del shell, más `a11y-axe`, `material-hito7`, `material-library`
  y `library-sync` en verde.

## 3. Verificado sin regresión (con prueba nueva)

| Cruce | Resultado | Prueba |
|---|---|---|
| Respuestas por partes × paquete .zip (H6 × H7) | Fase `waiting_user` sin plazo, luego `working` y la vista previa grande llega por partes a la ventana que preguntó. | `noche_integracion_test.rb`, `tests/noche-integracion.test.ts` |
| Acción de materiales sin selector × fase espuria | Conserva el plazo de 120 s. | `tests/noche-integracion.test.ts` |
| Dos ventanas a la vez × partes | Las partes de una respuesta no resuelven otra (`viewport_focus` en medio). | `tests/noche-integracion.test.ts` |
| Acciones del Hito 7 × ModelWatch | Corren dentro de `handle()`: sus transacciones no se anotan; la biblioteca se avisa una vez por la propia acción. | `noche_integracion_test.rb` |
| Vista previa OpenCutList × franja | `dryRun` no marca la franja ni avisa a las paletas. | `noche_integracion_test.rb` |
| Pincel activo × gestión de materiales | Las mutaciones se rechazan («Detené Pintura Inteligente…»); `viewport_focus` responde. | `noche_integracion_test.rb` |
| Atajos del shell × Tab/Ctrl+Tab del pincel | `shortcutFor` nunca toma Tab, Mayús+Tab, Ctrl+Tab ni Escape; con Pintar abierta ningún atajo actúa. | `tests/noche-integracion.test.ts`, `noche-integracion.spec.ts` |
| Foco al viewport × paleta | Solo tras un arranque automático activo; elegir material o navegar con Tab dentro de la paleta no pide foco ni inicia pintura. | `noche-integracion.spec.ts`, `hito2-pincel.spec.ts` |
| Franja × paleta Pintar en la ventana principal | Al cerrar la paleta la franja «Pintaste…» queda visible, bloquea Ctrl+S y Reanalizar la quita. | `noche-integracion.spec.ts` |

## 4. Queda pendiente (no corregido esta noche)

1. **Fichas archivadas visibles en la paleta del pincel** (H7 × H2). Ya anotado por el
   Hito 7 en `docs/hito7/COORDINACION.md`. El Tab del pincel también puede volver al último
   material recordado aunque esté archivado. Requiere decidir la regla («ocultar salvo que
   esté en el modelo»); no es un cambio mínimo. **Recomendación:** filtrar en
   `smart_palette_load` con `MaterialLibrary#extras['archivedIds']` y dejar las que estén en uso.
2. **Supuesto a validar en SketchUp real:** si aplicar un material a una cara dispara
   `MaterialsObserver#onMaterialChange`, cada ráfaga de clics del pincel provocaría un aviso
   `material-library-changed` y una recarga de la paleta (`smart_palette_load`, con miniaturas).
   Con dobles no se puede afirmar. Medirlo en el caso 1.6 de `docs/hito6/VALIDACION_SKETCHUP.md`;
   si ocurre, ignorar el tipo `materials` mientras la herramienta pinta.
3. Con la corrección QA-INT-01 la franja aparece **en el primer clic**, no al detener la
   herramienta. Es coherente con el aviso «documento invalidado» que ya se emitía en ese
   clic, pero conviene confirmarlo visualmente en SketchUp (casos 1.1 y 2.6).

## 5. Batería

`LANG=C.UTF-8`, Chromium de `/opt/pw-browsers`. Orden: `tsc --noEmit`, `eslint
sketchup_offline/ui tests`, `vitest run`, `build-offline.mjs`, `test-offline-ruby.mjs`,
`playwright --config playwright.offline.config.ts`.

<!-- RESULTADOS -->
