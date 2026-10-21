# Resultados de pruebas — candidata 0.8.8 (Hito 1)

**Fecha:** 2026-10-21 · **Entorno:** contenedor Linux en la nube (Ruby 3.3.6, Node 22, Chromium 1194 de Playwright). **No es SketchUp.**
**Candidata:** `dist/PlanosSanto-0.8.8-candidata.rbz`, SHA-256 `2a66f19d510a70a90d8bc074e92c0de2bd5dd7452c7861722267890fef805a20`, 1.830.222 bytes, 55 archivos (54 con hash en el manifiesto + `manifest.json`). **Build reproducible**: dos ejecuciones de `node scripts/build-offline.mjs` dan el mismo SHA-256.

## 1. Resumen

| Suite | Comando | Resultado | Tipo |
|---|---|---|---|
| Ruby (extensión) | `node scripts/test-offline-ruby.mjs` (sin `LANG`, entorno limpio) | **455 pruebas, 3.344 aserciones, 0 fallas, 0 errores** en 35 archivos | Dobles de la API de SketchUp |
| UI offline | `npx playwright test --config playwright.offline.config.ts` | **106/106** | Bundle real + puente simulado; algunas specs usan el controlador Ruby real con dobles |
| Unitarias TS | `npx vitest run` | **140/140** | Node |
| Tipos | `npx tsc --noEmit` | OK | — |
| Lint | `npx eslint .` | 0 errores, 2 advertencias preexistentes (`exhaustive-deps`, antes 3) | — |
| Integridad del RBZ | manifiesto vs. contenido | 54/54 hashes correctos; sin `.skp`, `.skm` ni `.jpg` | — |

**Línea base 0.8.7, en el mismo entorno:** Ruby 422 pruebas con 1 falla (faltaba `PlanosSanto-0.3.0.rbz`; en realidad cortaba en el primer archivo fallido), Playwright 102/102 (con UTF-8), vitest 140/140.

No se ejecutaron las pruebas e2e de la app web Next.js (`tests/e2e`): no cubren la extensión.

## 2. Pruebas obligatorias del encargo y dónde se cubren

| # | Prueba | Automatizada en | Estado |
|---|---|---|---|
| 1 | Crear material desde JPG/PNG | `paint_ready_test` (JPG), `photo_material_test`, `hito1-paint.spec` | PROBADO_AUTOMATICAMENTE |
| 2 | Textura real de SketchUp | `paint_ready_test#…installed_automatically…` verifica que la textura del material contenga los bytes del JPG | PROBADO_AUTOMATICAMENTE (doble) |
| 3 | Guardar en la biblioteca | Ídem + índice, SKM y miniatura | PROBADO_AUTOMATICAMENTE |
| 4–5 | Segundo modelo + instalación automática | `paint_ready_test` (servicio), `quick_install_controller_test` (controlador: instalación + pincel en una solicitud), `hito1-paint.spec` (UI: "Se instala al elegir", sin llamadas manuales de instalación) | PROBADO_AUTOMATICAMENTE |
| 6 | Pintar directo un componente | `paint_ready_test`, `hito1-paint.spec` (`__photo_paint`) | PROBADO_AUTOMATICAMENTE |
| 7 | Cinco piezas seguidas | `paint_ready_test#test_tool_paints_five_pieces…` (herramienta real) | PROBADO_AUTOMATICAMENTE |
| 8 | Cambiar de material sin reiniciar | Ídem (`update_options`, herramienta activa) | PROBADO_AUTOMATICAMENTE |
| 9 | SKU y proveedor no bloquean | `paint_ready_test#test_commercial_changes_never_block…`, `material_policy_test`, `native_paint_test` | PROBADO_AUTOMATICAMENTE |
| 10 | Componentes compartidos | `paint_ready_test#test_shared_definition_only_changes_the_clicked_piece`, `immediate_piece_test` | PROBADO_AUTOMATICAMENTE |
| 11 | No desaparecen los cantos | `assert_board` en todas las pinturas de `paint_ready_test` | PROBADO_AUTOMATICAMENTE |
| 12 | Ctrl+Z y persistencia | Undo: un paso por clic (`paint_ready_test`, `hito1-paint.spec`). **Persistencia tras guardar y reabrir: NO VERIFICADO** (requiere SketchUp: V12) | PARCIAL |
| 13 | SKM importados | `paint_ready_test#test_imported_skm_is_installed_on_selection_and_paints` | PROBADO_AUTOMATICAMENTE |
| 14 | Nombres, PDF A4, TXT maderera | Suites existentes completas en verde (`names_*`, `a4*.spec`, `workshop_test`, `supplier`) | PROBADO_AUTOMATICAMENTE (regresión) |
| C1–C5 | Causas de la auditoría | `paint_ready_test`: C1 `needs_visual`; C2 instalación entre modelos; C3 cambios comerciales; C4 archivos faltante/alterado; C5 escala editada | PROBADO_AUTOMATICAMENTE |
| — | Prueba histórica `PlanosSanto-0.3.0.rbz` | El runner regenera el paquete desde `sketchup/` con su empaquetador versionado (`scripts/package-rbz.py`). No se commitea un binario ni se marca ningún resultado como aprobado | PROBADO_AUTOMATICAMENTE |

## 3. Pruebas nuevas

- `sketchup_offline/test/paint_ready_test.rb`: 17 pruebas y 147 aserciones (servicio, motor y herramienta real con dobles).
- `sketchup_offline/test/quick_install_controller_test.rb`: 4 pruebas (controlador completo).
- `tests/offline/hito1-paint.spec.ts`: 4 escenarios de UI con el controlador Ruby real. Estables en `--repeat-each=3` (12/12).

## 4. Defectos encontrados por la verificación y corregidos antes de entregar

1. `install('k'=>v)` sin llaves: Ruby 3 lo trataba como argumentos de palabra clave (lo detectó `paint_ready_test`).
2. La instalación desde un `.skm` elegido por el usuario quedaba bloqueada (lo detectó `material_library_test`).
3. Se habían aflojado los controles de procedencia de SKM importados y del SKM original de una foto (lo detectó `material_policy_test`).
4. Hallazgos de los revisores ECC (ver `INFORME_HITO1.md` §6).
5. **Lista de versiones permitidas del exportador** (`lib/model.ts`): sin `0.8.8`, la UI rechazaba el documento y fallaban las 10 pruebas A4 y de nombres. Se detectó al bisectar en un *worktree* y se agregó `0.8.8`, como en cada versión anterior.

## 5. Qué NO prueban estas suites

- Render y texturas reales de SketchUp, `Materials#load` real, `make_unique` nativo, persistencia en un SKP, tiempos de clic en Windows ni comportamiento del HtmlDialog real.
- Todo eso está en `VALIDACION_SKETCHUP_088.md` (V1–V19). Hasta ejecutarlo, la candidata está **pendiente de validación real**.
