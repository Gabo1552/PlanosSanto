# Informe Hito 1 — Pintura Inteligente funcional (candidata 0.8.8)

**Rama:** `claude/hito1-pintura-088` (desde `main@2bf694f`, 0.8.7) · **Estado:** `PENDIENTE DE VALIDACIÓN REAL` en SketchUp 2026.
**Base de decisión:** auditoría `audit/claude-opencutlist-2026-10-21/` y decisiones 1 a 4 aprobadas por el dueño.

## 1. Resultado para el taller

**Flujo nuevo:** abrir SketchUp → **Pintar** → clic en una melamina de la paleta → clic en las piezas.

- Si la melamina no estaba en ese modelo, **se instala sola en el mismo clic** desde su archivo verificado de la biblioteca. No hay pantallas, confirmaciones ni validaciones comerciales intermedias.
- El pincel queda activo para seguir pintando. Cambiar de melamina no lo apaga. Ctrl+Z deshace un clic por vez y Escape termina.
- Los cantos existentes se conservan. Una pieza repetida (componente compartido) cambia **solo** la elegida, tanto al pintar la placa como el canto (decisión 3).
- Cargar SKU, proveedor, formato o aprobación **ya no bloquea la pintura**.
- Si una ficha no se puede pintar, la paleta dice **por qué** y ofrece la acción para resolverlo.

| Estado de la ficha | Qué ve el encargado | Acción |
|---|---|---|
| Lista | Mosaico normal | Clic y pintar |
| Instalable | Mosaico con "Se instala al elegir" | Clic: se instala y pinta |
| Sin imagen ni color | "Necesitan atención": «X» no tiene imagen, textura ni color | **Asignar foto** / **Asignar color** |
| Archivo faltante | "Falta el archivo de textura de «X»…" | Restaurar el backup o volver a cargar la foto |
| Archivo alterado | "…fue alterado o está dañado (no coincide su huella)" | Ídem |
| Textura distinta | "La textura de «X» en este modelo no coincide con su foto…" | Reparar desde la biblioteca |
| Problema de vinculación | "Problema de vinculación de «X»: …" | Revisar en la biblioteca |
| Error de SketchUp al instalar | "SketchUp no pudo instalar «X»… No se modificó el modelo." | Reintentar o revisar la consola |

El mensaje genérico "Este material no tiene una textura válida en el modelo" **ya no existe en el código**.

## 2. Cambios técnicos (archivo por archivo)

| Archivo | Cambio |
|---|---|
| `sketchup_offline/paint_materials.rb` (**nuevo**) | Fuente única de "¿esta ficha puede pintar en este modelo?". Expone `#states`, `#prepare(catalogId, mode)`, que instala si hace falta, y `#assign_color` (color sólido reutilizable en otros modelos). Si hay copias equivalentes del mismo material, elige una de forma determinística en lugar de bloquear |
| `sketchup_offline/ocl_attributes.rb` (**nuevo**) | Decisión 2. Escribe atributos compatibles con OpenCutList **solo si faltan**. Placa (`type` 2): `std_thicknesses`, `std_sizes` (largo x ancho) y `grained`. Canto (`type` 4): `thickness` y `std_widths`. Si el material ya tiene otro tipo OCL, no se toca y se informa `conflict`. El tipo 0 ("desconocido") se completa |
| `material_policy.rb` | Lo que habilita el diseño es solo la parte visual: foto, SKM o visual archivado (`design_asset` lo clasifica como `ok` / `missing` / `corrupt` / `none`). La aprobación comercial ya no cuenta como visual (C1). `native_valid?(require_source:)` verifica los archivos al instalar o vincular, no al pintar |
| `material_library.rb` | `binding_issues` devuelve solo problemas de diseño (bloquean). `commercial_issues` devuelve las diferencias comerciales (informan a maderera y no bloquean). Volver a vincular la misma ficha conserva el UUID y refresca los datos comerciales. Se puede asociar un visual a cualquier placa o canto, aprobado o no. La instalación resuelve el visual con `design_asset` y escribe los atributos OCL |
| `native_paint.rb` | `material_for` pasa a ser de **diseño solamente** y barato: sin hashes de archivos, sin SKU ni aprobación. Mensajes específicos |
| `smart_paint.rb` | El modo inmediato planifica **una sola vez** y confirma ese plan, reutilizando el recorrido del modelo. Antes: 2 planes y un recorrido extra por clic |
| `photo_material.rb` | Al crear un material escribe los atributos OCL. Reemplazar o asignar una foto **conserva** SKU, proveedor, formato, veta, cantos compatibles, precio, favorito y aprobación (antes los borraba) |
| `offline.rb` | `smart_palette_load` incluye `paintStates`. `smart_quick_start` acepta solo `catalogId`, prepara o instala el material y arma la herramienta **en una sola solicitud**. Retomar desde la barra **nunca instala**: explica por qué no arrancó. Acciones nuevas: `smart_material_prepare` (paleta avanzada) y `smart_assign_color` |
| `ui/SmartPaintPalette.tsx` | Usa los estados de Ruby. Muestra "Se instala al elegir", la sección "Necesitan atención" con "Asignar foto" y "Asignar color", y el texto "Instalando «X» en este modelo…". La paleta avanzada también instala al elegir |
| `ui/StandalonePaintApp.tsx`, `ui/App.tsx`, `ui/PhotoMaterialPanel.tsx` | "Asignar foto" abre el panel de fotos sobre la ficha existente ("Asignar foto al material"), sin la confirmación de reemplazo innecesaria |
| `bootstrap.rb`, `scripts/build-offline.mjs`, `scripts/package-offline-rbz.py` | Empaquetan los 2 módulos nuevos (55 archivos en el RBZ) |
| `scripts/test-offline-ruby.mjs`, `playwright.offline.config.ts` | Suite reproducible en un entorno limpio: fuerza UTF-8, regenera el paquete histórico 0.3.0 desde `sketchup/` con su empaquetador, construye si falta, corre **todos** los archivos y resume |
| `.claude/` | Instalación selectiva de ECC (ver `.claude/ECC_PROVENANCE.md`) |

## 3. Cambios de comportamiento deliberados (pruebas actualizadas)

Estas pruebas de 0.8.7 **codificaban el defecto** de la auditoría. Se reescribieron con el contrato aprobado (decisión B), explicándolo en un comentario `0.8.8` dentro de cada una:

| Prueba anterior | Contrato nuevo |
|---|---|
| `material_policy_test#test_commercial_review_stales_design_binding_until_explicit_repair…` | La revisión comercial **mantiene** la pintura; volver a vincular solo refresca los datos de maderera |
| `material_policy_test#test_legacy_approved_items_keep_permission…` | La aprobación sola **no** es un visual (C1); un visual archivado alcanza, esté aprobado o no |
| `material_policy_test#test_explicit_repair_cannot_relabel…` (aserción final) | Se verifica con `native_valid?`, que rechaza la prueba de foto ajena |
| `material_library_test#test_revision_confirmation_and_unapproved_items_block…` | La aprobación no es requisito de diseño; revisión y confirmación siguen siendo obligatorias |
| `material_library_test#test_corrupt_metadata_index_and_stale_commercial_fields…` | Un SKU cambiado aparece en `commercialIssues`, no en `issues` |
| `material_library_test#test_unapproved_or_stale_visual_record_cannot_be_installed…` | El visual sigue instalable tras una edición comercial; un archivo alterado bloquea |
| `native_paint_test#test_binding_requires_approved_catalog…` | La aprobación y el SKU no bloquean; el cambio de tipo y el UUID duplicado sí |
| `smart_edges_test#test_catalog_choices…`, `material_sample_tool_test#…unapproved_or_changed…` | Ídem: lo que bloquea es el cambio de tipo |
| `direct_paint_test` (3 casos) | La paleta resuelve el material vigente aunque reciba un UUID viejo (autorreparación). Retomar desde la barra sin el material instalado explica el motivo |
| `installation_test` | 55 archivos y 2 módulos obligatorios nuevos |
| `tests/offline/smart-paint.spec.ts`, `palette-visuals.spec.ts` | Una ficha aprobada sin visual no se ofrece como pintable. Lo que la retira de recientes es un problema de diseño, no la desaprobación |

**Dos regresiones mías que las pruebas detectaron y se corrigieron:**
1. La instalación desde un `.skm` elegido por el usuario quedaba bloqueada.
2. Se aflojaban los controles de procedencia de SKM importados (nombre de origen inseguro o enlace simbólico) y del SKM original de una foto.

## 4. Lo que **no** cambia (controles conservados)

- UUID único por material y verificación de huellas SHA-256 **al instalar o vincular**.
- Una operación de Undo por clic, sin operación vacía si no hay cambio, y rollback ante fallas.
- El modo rápido es siempre "solo esta pieza", con `make_unique` verificado: no altera geometría ni acabados.
- Nunca se pisa un canto reconocido con placa.
- Bloqueos por geometría ambigua o pieza bloqueada.
- Maderera: sigue exigiendo una ficha **aprobada** y un vínculo comercial vigente.
- No se copió código, iconos ni recursos de OpenCutList: los atributos se escriben según el formato de datos documentado en la auditoría.

## 5. Limitaciones y pendientes

| # | Pendiente | Impacto | Hito |
|---|---|---|---|
| L1 | **Sin validación en SketchUp real.** Todo se probó con dobles de la API | La candidata no es para producción | Validación local (`VALIDACION_SKETCHUP_088.md`) |
| L2 | Cada clic todavía recorre el modelo (≈ 3 inventarios, antes ≈ 7) para proteger instancias compartidas | Posible demora en modelos muy grandes; medir con V19 | Hito 2 (P0-2: plan por clic local) |
| L3 | Pintar pieza sigue pintando las **caras amplias** (no el material de la instancia, como OCL) | Coherente con 0.8.7; el cambio de semántica requiere decisión y pruebas con OCL | Hito 3 (P1-2) |
| L4 | La paleta sigue siendo una ventana HtmlDialog (no hay barra dentro del viewport) | Ventana chica y no modal | Hito 3 (P1-1) |
| L5 | La opción "aplicar a todas las piezas iguales" para cantos todavía no existe (decisión 3: más adelante) | Hoy siempre "solo esta" | Hito 3 |
| L6 | Tras editar datos comerciales, Maderera puede pedir **re-vincular** la ficha antes de exportar el pedido (vínculo comercial desactualizado) | No afecta pintar | Hito 4 (maderera en bloque) |
| L7 | El cálculo de estados hashea los activos de la biblioteca al abrir la paleta (no por clic) | Bibliotecas de cientos de SKM podrían tardar al abrir | Hito 2 (caché por mtime/tamaño, P2-4) |
| L8 | Retomar desde la barra no instala: si el último material no está en el modelo, hay que elegirlo en la paleta | Decisión conservadora (instalar solo con elección explícita) | — |
| L9 | Los atributos OCL se escriben al crear o instalar; si después se editan espesor o formato en el catálogo, no se resincronizan | OCL puede mostrar el espesor viejo | Hito 2 o 4 |
