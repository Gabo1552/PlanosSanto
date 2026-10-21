# 02 — Mapa de código: Planos Santo 0.8.7 vs OpenCutList 7.1.0

**Referencias**
- **PS**: rutas Ruby relativas a `sketchup_offline/` en `main@2bf694f` (idénticas al RBZ 0.8.7, SHA-256 `6503d53c…`); UI en `sketchup_offline/ui/*.tsx`.
- **OCL**: rutas relativas a `src/ladb_opencutlist/ruby/` en el commit [`1ef3e14c`](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/tree/1ef3e14c896171eed8cd77ede440c7f5563e943e).
- Las referencias de UI apuntan al fuente TSX (el bundle se reproduce bit a bit con `scripts/build-offline.mjs`).

**Clasificación usada:** salvo que se indique otra cosa, todo es `VERIFICADO_EN_CODIGO`, es decir, existe la implementación (no prueba que funcione). Las inferencias se marcan **[inferido]**.

---

## 0. Tamaño y forma

| | Planos Santo 0.8.7 | OpenCutList 7.1.0 |
|---|---|---|
| Ruby propio | 25 archivos, ≈ 4.900 líneas | 168 archivos, 47.247 líneas (+ 9.686 en libs propias) |
| UI | React + TSX (`sketchup_offline/ui/`), bundle con esbuild (4,3 MB minificado) | jQuery + Twig + LESS: 20.608 líneas JS propias, 141 plantillas |
| Nativo | No | C++ vía Fiddle: Packy (optimizador), Clippy (polígonos), Imagy (imágenes). DLL para Windows y dylib para macOS |
| Pruebas | Ruby: 32 archivos Minitest con dobles (422 runs / 3.053 aserciones, 1 falla ambiental); UI: 17 specs Playwright con puente simulado. **Nada corre en SketchUp real** | 4 archivos TestUp (835 líneas): utilidades de geometría, fórmulas y dimensiones. **Sin pruebas** de cutlist, packing, herramientas ni UI |
| Plataforma | SketchUp 2026 Windows (declarado) | SketchUp 2017+, Windows x64 y macOS |
| Licencia | Propia + terceros MIT (`THIRD_PARTY_LICENSES.txt`) | **GPLv3** (`LICENSE`); rchardet LGPL; Clipper2 BSL; stb dominio público |

## 1. Inicialización, comandos, menú, toolbar y ciclo de vida

| Aspecto | PS | OCL |
|---|---|---|
| Registro | `planos_santo.rb:8-20`; `bootstrap.rb:7-25` verifica la lista de archivos y muestra un menú de recuperación si falla | `src/ladb_opencutlist.rb:10,21-25,68`; exige SU ≥ 2017 |
| Arranque | `offline.rb:831-836`: crea el controlador, el `AppObserver` y la barra al cargar | `main.rb:7,12`: `PLUGIN.setup` solo arma la UI; `start` es perezoso (`plugin.rb:935-1049`) y crea 5 controladores |
| Menú | `quick_toolbar.rb:158,168,185,189-193`: submenú con comando principal, 8 acciones, mostrar barra, diagnóstico y "abrir .skp" | `plugin.rb:805-859`: un ítem por pestaña y por acción de cada herramienta + menú contextual (`:846-861`) |
| Toolbar | `quick_toolbar.rb:169,188`: **una** barra con 5 comandos (Pintar, Muebles, Maderera, Planos, Materiales). **Pintar canto, Quitar canto y Cuentagotas solo están en el menú** | `plugin.rb:870-908`: barra principal (diálogo) + barra **Tools** con una herramienta por botón (draw, handle, paint, axes, export), con estado CHECKED |
| Validación de comandos | `quick_toolbar.rb:176-184` → `offline.rb:56-74`: deshabilita **todos** los botones si hay cambios sin guardar en la guía o la biblioteca, una vista previa de importación activa o el modelo cambió | `set_validation_proc` solo para el estado de la herramienta activa |
| Atajos | No define atajos. Teclas dentro del Tool: Esc, Enter, Tab, flechas (`smart_paint_tool.rb:524-540`) | No define atajos globales. Teclas en herramientas: Tab, Ctrl+Tab, Alt (cuentagotas), ←/→, ↑/↓ (`smart_paint_tool.rb:726-745`, `smart_tool.rb:1326-1451`) |
| Observers | `offline.rb:23-30`: `AppObserver` invalida el contexto al cambiar de modelo | AppObserver, ModelObserver, SelectionObserver, MaterialsObserver, PagesObserver, etc. (`observer/*`) |
| Preferencias | `offline.rb:694-725`: preferencias de pintura en `read/write_default` (Base64) | Presets globales (`read_default('core.presets')`) y de modelo (`ladb_opencutlist/core.presets`), con política por clave (`plugin.rb:43,53-55,380-420,485-490,613-623`) |

## 2. Arquitectura Ruby ↔ JS ↔ Tool

| Aspecto | PS | OCL |
|---|---|---|
| Diálogos | **Dos** HtmlDialog: principal 1440×920 (`offline.rb:138-166`) y paleta de pintura 680×320/760 (`offline.rb:183-202`) | **Uno** con pestañas que se minimiza a una tira (`plugin.rb:1053-1099`) + diálogo modal para opciones de herramientas (`:1241-1312`) |
| Puente | `add_action_callback('request')` → `UI.start_timer(0)` → `handle` → `dispatch` (≈ 60 acciones en un `case`, `offline.rb:342-684`). Hay un único `@busy` global: una acción por vez | Registro de comandos `register_command` por controlador; `execute_command` con lookup en un hash (`plugin.rb:718-731`). Cola serializada en JS (`js/dialog.js:33-43`) |
| Eventos Ruby → JS | `emit_to(window, event, data)` (`offline.rb:204-206`) | `trigger_event` (`plugin.rb:758-768`) |
| Estado de herramienta | `@smart_state` + `@tool_generation` + guardias lambda por herramienta (`offline.rb:686-789`) | El Tool tiene su propio estado. La UI web no participa en el gesto de pintar |
| **Diferencia clave** | El gesto de pintar **depende de la paleta web**: el material se elige en HTML y se valida en JS y luego en Ruby | El gesto de pintar ocurre **entero en el viewport**: el material se elige en el HUD Kuix dentro del Tool |

## 3. Materiales

### 3.1 Modelo de datos

| Aspecto | PS | OCL |
|---|---|---|
| Fuente de verdad | **Catálogo local** `%LOCALAPPDATA%\PlanosSanto\catalog.json` (`catalog_store.rb:214-217`) + índice `material-assets.json` + carpetas de activos por hash (`photo-assets/`, `material-assets/`, `skm-import-assets/`) | **`model.materials`**. Los atributos OCL se guardan en el propio material, diccionario `ladb_opencutlist` (`model/attributes/material_attributes.rb:488-560`) |
| Identidad | Vínculo `PlanosSantoMaterial/binding_v1` = {uuid, catalogId, kind, catalogFingerprint} (`material_resolver.rb:120-149`) | `ladb_opencutlist/uuid` (`material_attributes.rb:495`), cacheado en memoria y persistido al guardar el modelo (`observer/model_observer.rb:20-22`) **[inferido: puede faltar hasta guardar]** |
| Tipos | `sheet`, `edge`, `solid_wood`, `dimensional`, `veneer`, `unknown` (`catalog_store.rb:212`) | 0 desconocido, 1 madera maciza, 2 placa, 3 dimensional, 4 canto, 5 herraje, 6 enchapado (`material_attributes.rb:12-18`) |
| Reutilizar en otro modelo | Requiere **instalar** el SKM guardado en cada modelo (`material_library.rb:247-284`), con confirmación (`offline.rb:463-471, 501-508`) | Exportar e importar SKM manualmente. La biblioteca nativa de SketchUp y la carpeta `Materials/OpenCutList` sirven de catálogo |
| Validación | Por **hash SHA-256 de archivos** y fingerprint comercial en cada uso (`material_policy.rb:33-101`) | Ninguna validación de archivos. El material del modelo es válido por existir |

### 3.2 Crear desde foto JPG/PNG

| Paso | PS (`photo_material.rb`) | OCL |
|---|---|---|
| Elegir archivo | `offline.rb:448-456` `UI.openpanel` → `pick` valida el encabezado PNG/JPG, tamaño ≤ 12 MiB y ≤ 16 MP, genera la vista previa y detecta duplicados por hash o nombre (`:87-108`) | `worker/materials/materials_load_texture_worker.rb:20-54`: openpanel, copia a temporal y mide con Imagy |
| Crear | `create` (`:164-256`): operación SU + `materials.add` + `texture=` (con escala verificada opcional) + miniatura + vínculo + prueba de foto + `save_as` SKM + índice + catálogo, **todo transaccional con rollback de archivos** | `materials_create_worker.rb:75-160`: `materials.add`, color, `texture=` (rotación opcional), `texture.size=[w,h]`, atributos OCL, una operación |
| Escala | Opcional: `textureWidthMm/HeightMm` + bandera `verified` | Ancho y alto con relación de aspecto bloqueable en JS |
| Resultado | Material **en el modelo activo** + ficha en el catálogo global | Material en el modelo activo. Si la herramienta está abierta, queda seleccionado (`smart_paint_tool.rb:792-796`) |

### 3.3 Importar SKM

| | PS (`skm_import.rb`, `bounded_zip.rb`) | OCL (`materials_import_from_skm_worker.rb:15-184`) |
|---|---|---|
| Origen | ZIP, carpeta o .skm; lector ZIP propio con límites (`bounded_zip.rb`) | Un .skm; lee `document.xml` con RubyZip |
| Resultado | Fichas en el catálogo con `kind='unknown'` (`:197`). **No entran al modelo** hasta clasificarlas e instalarlas | `materials.load` directo al modelo. Si el nombre ya existe, pregunta si reemplazar o copiar |

## 4. Pintar

### 4.1 Activación y selección de material

| | PS | OCL |
|---|---|---|
| Comienzo | Barra → `quick_action('sheet')` (`offline.rb:84-127`) → abre o reutiliza la paleta → si hay `catalogId` recordado, `quick_paint_start` (`:210-245`) | Barra o menú → `select_tool(SmartPaintTool.new)` (`plugin.rb:~835-897`), o desde la pestaña Materiales con un material (`materials_smart_paint_worker.rb:29-43`) |
| Lista de materiales | Mosaicos de **fichas del catálogo** filtradas por `usableForPainting` (`ui/SmartPaintPalette.tsx:22,125`) | **Botones de `model.materials`** filtrados por tipo según la acción (`smart_paint_tool.rb:549-580, 1095-1121`) |
| Elegir material | Clic en mosaico → `change()` exige un material nativo vinculado y sin issues; si no hay, **error** (`ui/SmartPaintPalette.tsx:111-114`) → `smart_quick_start` → `quick_paint_start` → `SmartPaint#material_choices` (Ruby repite el filtro) | Clic en botón del HUD → `set_current_material` (`:1187-1191`). No hay validación porque no hace falta |
| Textura obligatoria | Para fotos sí: `native_valid?` exige `material.texture` y prueba de foto (`material_policy.rb:87-101`) | No. El botón usa `material.color` (`:1123-1224`) |
| Cambiar material sin salir | Flechas ←/→ en el Tool (`smart_paint_tool.rb:511-523`), solo entre materiales ya válidos, o desde la paleta (`update_options`, `:311-313`) | Clic en otro botón del HUD, ←/→, o cuentagotas temporal con Alt |
| Persistencia del material | Preferencia global `catalogId`/`materialUuid` (`offline.rb:718-725`), que en otro modelo no coincide | `@@action_materials` en memoria por acción (`smart_paint_tool.rb:73, 491-497`) |

### 4.2 Pick sobre instancias anidadas

| | PS (`smart_paint_tool.rb:342-380`) | OCL (`smart_tool.rb:3438-3588`, `helper/part_helper.rb:7-36`) |
|---|---|---|
| Método | `pick_helper.do_pick` + `path_at(0)` + `leaf_at(0)`. Exige una Face hoja; la pieza es **la última instancia de la ruta** (grupo o componente) | Igual con `PickHelper`, pero la pieza es la **`ComponentInstance` más profunda**. **Los grupos no son piezas** |
| Abrir grupos | No hace falta | No hace falta |
| Pick más profundo | No | ↑/↓ o rueda + modificador recorren las rutas bajo el cursor |
| Costo de hover | Bajo: solo arma el overlay de las caras de la instancia (`:386-403`) | Corre un `CutlistGenerateWorker` acotado a una entidad cada vez que cambia la ruta (`part_helper.rb:15-36`) |
| **Costo del clic** | **Alto [inferido de código]**: `apply_immediate` = plan ×2, con ≈ 7 `inventory` globales del modelo y ≈ 6 `material_for` con hashes de archivos (ver `05_CAUSA_PINTADO.md` §3) | Bajo: `instance.material=` sobre las instancias ya resueltas en el hover |

### 4.3 Qué se pinta

| Acción | PS | OCL |
|---|---|---|
| Pieza / placa | **Caras amplias** (2 caras, frente y dorso: `expanded_faces` con `paintScope='piece'`, `native_paint.rb:449-456`), `face.material` y `back_material` (`smart_paint.rb:250-255`). Preserva el mapeo de textura (`:72-114`). **Excluye caras con canto** (`:161`) | **Material de la instancia** (`instance.material=`, `smart_paint_tool.rb:1280-1282`). No toca caras. **[inferido]** Si las caras ya tienen material propio, el cambio no se ve |
| Instancias compartidas | El modo rápido es siempre `scope='unique'`: si la definición está compartida, hace **`make_unique` automático** dentro de la operación, con verificación de topología y acabados (`smart_paint.rb:240-249`; `native_paint.rb:501-515`) | Opción "1 instancia" o "todas las instancias" (`definition.instances`, `:840`). No necesita `make_unique` porque pinta la instancia |
| Cantos 1/2/4 | `expanded_faces` (`native_paint.rb:434-448`) con un marco local según los ejes. El modo rápido deduce los ejes por espesor mínimo (`automatic_axes`, `:414-422`). Valida pieza rectangular ortogonal (`validate_edge!`, `:375-389`) | Caras de los lados desde el cutlist (`part.def.edge_entity_ids`, `:865-955`), 1/2/4 con la orientación auto-orient. **Exige que la pieza sea placa** (`TYPE_SHEET_GOOD`) |
| Cantos en definición compartida | `make_unique` en el modo rápido | Pinta caras de la **definición** (todas las instancias) y **avisa** (`:945-948`) |
| Caras (enchapado) | No hay un modo equivalente separado (`paintScope='face'` existe en el modo avanzado) | `PAINT_FACES` zmin/zmax, 1 o 2 caras |
| Limpiar | `remove_edge` restaura la placa en caras de canto (`smart_paint.rb:134-142`) | `PAINT_CLEAN` quita material de todas las caras y de las instancias (`:1335-1416`) |
| Cuentagotas | `MaterialSampleTool` (herramienta separada, solo lectura) | Alt temporal o acción PICK; cambia también de acción según el tipo |
| Undo | 1 operación por clic; si no hay cambio, no crea Undo (`smart_paint.rb:235-238`) | 1 operación por clic (`:1277, 1301, 1322, 1343`); la herramienta sigue activa después de deshacer (`:788-790`) |
| Vista previa | Triángulos naranjas y normal azul (`smart_paint_tool.rb:583-595`) | Malla del color del material destino, alfa 200/255 + tooltip con pieza y material + aviso de compartida |

## 5. Componentes anidados y definiciones compartidas

- **PS** inventaria todas las ocurrencias, incluso ocultas, con rutas de `persistent_id` (`names.rb:69-103`), bloquea jerarquías mayores a 25 niveles o 5.000 ocurrencias y exige confirmación o aislamiento ante definiciones compartidas (`native_paint.rb:334-340, 477-485`). Es **más seguro que OCL** para cantos y caras, pero **más caro y con más pasos**.
- **OCL** asume la semántica de SketchUp: lo que se pinta en la definición afecta a todas las instancias, con un aviso visual. `make_unique` solo aparece en otras herramientas (`smart_tool.rb:2096-2109`).

## 6. Nombres

| | PS (`names.rb`) | OCL (`outliner_*`) |
|---|---|---|
| Alcance | Por **mueble** (grupo padre): lista las piezas hoja, propone `prefijo - base`, guarda metadatos `PlanosSantoNombres/piece_v1`, `furniture_v1` (`:138-190, 261-329`) | Árbol completo; edita instancia y definición (`outliner_update_worker.rb:55-117`); renombrado masivo de **definiciones** por fórmula (`outliner_deep_rename_parts_worker.rb:47-130`) |
| Seguridad | Bloquea si hay geometría mixta, definiciones compartidas que filtrarían el cambio, o más de 500 piezas (`:170-182, 242-260`). Vista previa con token. Una operación | Una operación; vista previa (dry-run) en el renombrado masivo |
| Valor diferencial | **Nombres de instancia por mueble con prefijo de módulo y sincronización con la guía.** OCL no lo tiene | Fórmulas potentes, pero nombra definiciones (genéricas) |

## 7. Planos A4

| | PS | OCL |
|---|---|---|
| Datos | `GuideStore` en el atributo de modelo `PlanosSanto/guide_v1` (≤ 5 MB) con revisión optimista (`guide_store.rb:7-73`) | — |
| Vistas | `mode: exterior | interior | both`, cámaras front/back con yaw y pitch, `hiddenPieceIds` **por vista y no por geometría**, observaciones ≤ 2.000 caracteres, offsets de cotas (`guide_store.rb:99-147`) | Layout de partes con visor three.js (`cutlist_layout_parts_worker.rb:40-49`) y envío a LayOut (`cutlist_layout_to_layout_worker.rb:93-230`); dibujos 2D SVG/DXF |
| PDF | pdf-lib local vectorial en `app.js`; validación del PDF y escritura atómica (`offline.rb:816-828`) | Depende de LayOut o de la impresión del diálogo |
| Valor diferencial | **Guía de armado A4 específica para el taller.** OCL no tiene equivalente | Diagramas de corte y dibujos técnicos de piezas |

## 8. Maderera, optimización, costos y etiquetas

| | PS | OCL |
|---|---|---|
| Pedido TXT | `SupplierOrder#export` (`supplier_order.rb:139-175`): **9 columnas exactas** `cant base altura detalle rota canto_arr canto_aba canto_izq canto_der`, lotes por placa+espesor+canto principal+secundario, CRLF, UTF-8 o Windows-1252, decimal `.` o `,`, manifiesto con hash por lote, publicación atómica | `cutlist_export_worker.rb`: tabla, TSV, CSV o XLSX con **columnas configurables por fórmula** (`:427-465`). No tiene el formato de la maderera ya armado |
| Validaciones de pedido | Por fila: rectangularidad, ejes, cara frontal, 4 confirmaciones, espesor del catálogo, cantos compatibles y que cubran el espesor, veta y rotación, que entre en la placa (`supplier_order.rb:66-103`) | Agrupa por material y espesor estándar; auto-orient; descuenta espesor de canto (`edge_decremented`) |
| Optimización 1D/2D | **No existe.** `OclGateway.open` abre el diálogo original de OCL (`workshop.rb:154-167`) | Packy nativo (`cutlist_packing_worker.rb`) + motores Ruby heredados `bin_packing_1d/2d` |
| Costos | `estimate` = consumo **neto** por m² o placa + metros de canto, con antigüedad de precios (`supplier_order.rb:108-137`). Sin desperdicio ni optimización | `cutlist_estimate_worker.rb:160-186`: por tipo, usando packing real + precios estándar y de corte |
| Etiquetas | No | `cutlist_labels_worker.rb` + editor de layout en JS |

## 9. Compatibilidad con OCL

- PS **lee** `ladb_opencutlist/type` y otros atributos (`ocl_reader.rb:16-41`, `p1_diagnostics.rb:11`) **sin escribirlos** (`smart_paint.rb:6-7`, `native_paint.rb:277`).
- PS trata un material con `type=4` de OCL como canto que no debe pisarse (`native_paint.rb:427-432`).
- PS fija la versión OCL 7.1.0/202511301621 para el acceso al diálogo (`workshop.rb:157-158`) y la lectura de tipo (`smart_paint.rb:31-33`). Esto coincide con el master actual, **pero se rompe en la próxima versión de OCL** (ver backlog P1).
- **Conflicto de semántica [inferido]:** PS pinta caras; OCL lee primero el material de la instancia y, con "smart material", el material dominante de las caras (`cutlist_generate_worker.rb:1176-1199`). Una pieza pintada por PS se lee bien en OCL. Pero si después alguien pinta la instancia con OCL, las caras de PS siguen mandando visualmente y el cutlist de OCL reportará el material de la instancia: **puede haber discrepancias entre lo que se ve y lo que se lista**. Hay que probarlo (T-OCL-2).
- Las materiales que crea PS **no tienen `ladb_opencutlist/type`**. En el cutlist de OCL aparecen como "desconocido" hasta que se los tipa en OCL.

## 10. Errores, rendimiento, actualización, recuperación

| | PS | OCL |
|---|---|---|
| Errores | `ExportError` con mensajes en español, rescate central (`offline.rb:297-299`), cartel ante fallas de carga (`bootstrap.rb:42-50`) | Notificaciones en el diálogo; tooltips y beep en las herramientas |
| Integridad de archivos | Muy alta: escritura atómica, backups, locks, hashes | Normal |
| Rendimiento | **Riesgo alto** en el pintado (recorridos globales por clic) y en `skm_library` (hashea todos los activos al listar) **[inferido]** | Riesgo en el hover con definiciones grandes **[inferido]** |
| Actualización | Manual por RBZ; el manifiesto con hashes permite verificar | Manual por RBZ + noticias en el diálogo |
