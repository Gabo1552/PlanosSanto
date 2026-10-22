# Auditoría consolidada: OpenCutList vs Planos Santo 0.8.10

**Fecha:** 2026-10-21 · **PS:** `/home/user/PlanosSanto` (rama 0.8.10) · **OCL:** commit 1ef3e14 (GPLv3), leído solo para entender cómo se comporta.
**Convenciones de rutas:** `so/` = `sketchup_offline/` de PS; `so/ui/` = su interfaz React; `ocl/` = `ocl/src/ladb_opencutlist/`. Las referencias son `archivo:línea`. Cuando una línea del análisis original resultó equivocada, uso la que corrigió la verificación.
**Veredictos aplicados:** ninguna brecha quedó refutada. Las corregidas se integraron con su `prioridad_final`, y las faltantes que encontró la verificación figuran como `F-<ÁREA>-x`.

---

## 1. Resumen ejecutivo

- PS 0.8.10 es más seguro que OCL en casi todo lo que toca dinero y producción. Pinta de forma atómica, protege los cantos, acepta grupos, tiene una biblioteca permanente del taller y genera el TXT para la maderera con lotes, manifiesto y sha256. Además arma una guía A4 por mueble que OCL no tiene.
- OCL le gana en **fluidez**. Pinta con todo dentro del viewport (1/2/4 cantos, todas las copias, tooltip, cursores, Tab), deduce orientación y cantos de todas las piezas de una vez y entrega etiquetas, consumo y presupuesto con placas enteras.
- La brecha más cara para el taller no es de pintura. Está **entre el modelo pintado y el TXT**: cada pieza pide ejes, cara, cantos, veta, regla de medidas, una nota de 8 caracteres o más y 5 casillas (`so/supplier_order.rb:28-31,70-79,91`; `so/ui/WorkshopPanel.tsx:41,91`). Hoy pintar cantos en 3D casi no ahorra trabajo a la hora de armar el pedido.
- **Conviene imitar:** cantos 1/2/4 y alcance "todas las iguales" en el pincel rápido, feedback en el cursor, propuesta y confirmación en lote del pedido, metros de canto por SKU, marcas de canto legibles en la A4, etiquetas con el código de pieza y presupuesto con desperdicio y servicios.
- **No conviene copiar:** el motor de nesting (la maderera optimiza), el make_unique automático, ignorar grupos, la permisividad general ("generar y advertir"), el lenguaje de fórmulas libres, i18n, la red y cualquier recurso de OCL (GPLv3).
- **Riesgo técnico principal:** el análisis tesela todas las instancias y vuelve a escanear después de pintar, guardar o exportar (`sketchup/planos_santo/exporter.rb:68-100,138-185`; `so/offline.rb:842-873`). Hay que medirlo antes de rediseñar.
- El Hito 1 (pintura y materiales) **sigue pendiente de validación nativa**. El Hito 2 en adelante queda solo planificado.

---

## 2. Matriz de paridad por área

Estados: **aus** = ausente · **par** = parcial · **eq** = equivalente · **mejor** = mejor en PS. Esfuerzo: S / M / L.

### 2.1 Pintura

| ID · Función | OCL | PS (estado · evidencia) | Brecha | Prio | Esf |
|---|---|---|---|---|---|
| PINTURA-01 Cantos 1 / 2 opuestos / 4 en el pincel rápido (fusiona CANTOS-05/06) | Submodos por barra y Ctrl+Tab; preview de todos los lados (`ocl/ruby/tool/smart_paint_tool.rb:872-905`) | par · el motor soporta 1/2/4 (`so/native_paint.rb:171-185`), pero el modo rápido fuerza `edgeCount=1` a propósito (`so/offline.rb:230-235`); solo la paleta avanzada tiene el selector (`so/ui/SmartPaintPalette.tsx:242`) | 2 a 4 clics por pieza; riesgo de saltear un lado | **P0** | S |
| PINTURA-02 Alcance "solo esta / todas las iguales" | Toggle 1/todas; cantos sobre la definición con aviso (`smart_paint_tool.rb:840-861,915-935`) | par · `scope='unique'` fijo (`so/offline.rb:226`; `so/smart_paint.rb:120`), make_unique en cada clic (`so/smart_paint.rb:261-268`) | No se pintan N puertas de una vez; las definiciones se fragmentan | **P0** | M |
| F-PINT-A No-op real en piezas compartidas | Hace commit aunque no cambie nada | defecto · `isolation=true` saltea el chequeo de "sin cambios" (`so/smart_paint.rb:253-256`) | Repasar puertas ya pintadas crea definiciones y entradas de Undo vacías | P1 | S |
| PINTURA-03 Tooltip junto al cursor | Número, nombre y material, en verde o rojo (`smart_paint_tool.rb:836,866-869`) | aus · el hover va solo a la paleta, por push y polling de respaldo (`so/ui/SmartPaintPalette.tsx:127-128`) | Hay que mirar otra ventana | P1 | S |
| PINTURA-04 Barra de materiales en el viewport | Panel inferior con filtros (`smart_paint_tool.rb:121-175`) | par · solo HtmlDialog (`SmartPaintPalette.tsx:228-237`); las flechas rotan a ciegas (`so/smart_paint_tool.rb:271-274`) | Cambiar de material saca el foco del modelo | P1 | L |
| PINTURA-05 Preview con el color real | Color del material, más opaco al presionar (`smart_paint_tool.rb:832-834`) | par · siempre naranja (`so/smart_paint_tool.rb:321-333`) | No se ve cómo va a quedar | P1 | S |
| PINTURA-06 Tab / Ctrl+Tab en el pincel | Rota modo y submodo (`ocl/ruby/tool/smart_tool.rb:1314-1383`) | par · en modo inmediato Tab solo muestra un mensaje y borra el hover (`so/smart_paint_tool.rb:232-236`) | Pasar de placa a canto obliga a ir a la paleta | P1 | S |
| PINTURA-07 Cuentagotas temporal | Tecla sostenida y vuelve al pincel (`smart_paint_tool.rb:738-757`) | par · herramienta aparte, sin retorno (`so/material_sample_tool.rb`; confidence media en líneas) | 3 o 4 pasos en lugar de 1 | P2 | S |
| PINTURA-08 Aptitud en el hover | Error en tooltip y cursor (`smart_paint_tool.rb:866-869,909-911`) | par · no valida en el hover (`so/smart_paint_tool.rb:125-127`), valida recién al clic (`so/native_paint.rb:112-160`) | El rechazo llega después del clic y en otra ventana | P1 | M |
| PINTURA-09 Costo por clic | Asigna lo resuelto en el hover | par · inventario liviano (`so/names.rb:66-71`), pero lee y hashea el catálogo en cada clic (`so/native_paint.rb:80-81`; `so/smart_paint.rb:199`) | Sin medir | P2 (medir) | M |
| PINTURA-10 Modelo de datos de "pintar pieza" | Material en la instancia; el dominante sale de los hijos (`ocl/ruby/worker/cutlist/cutlist_generate_worker.rb:1176-1225`) | par · pinta las caras anchas y nunca la instancia (`so/smart_paint.rb:120-121`) | Caras angostas sin pintar; en OCL el canto puede quedar como material dominante (inferencia, sin probar) | P1 | M |
| PINTURA-11 Pick en profundidad | ↑/↓ recorren las piezas bajo el cursor (`smart_tool.rb:1385-1387`) | aus · solo `path_at(0)` (`so/smart_paint_tool.rb:75-78`) | No se llega a piezas tapadas | P2 | S |
| PINTURA-12 Cursores por modo | Uno por modo, más uno de error (`smart_paint_tool.rb:408-438`) | aus · no hay `onSetCursor` | El modo no se ve en el cursor | P2 | S |
| PINTURA-13 Menú contextual en la herramienta | `getMenu` (`smart_tool.rb:1099-1186`) | aus · no hay `getMenu` | Ocultar o renombrar obliga a salir del pincel | P2 | M |
| PINTURA-14 Alternar transparencia | Mini botón (`smart_tool.rb:469-480`) | aus | Hay que ir a los estilos | P3 | S |
| PINTURA-15 Varias caras por lado | Agrupa las caras por lado (`smart_paint_tool.rb:874-905`) | par · pide una cara por lado (`so/native_paint.rb:177-178`) | Geometría sucia sin 2/4 cantos | P2 | M |
| PINTURA-16 Restablecer pieza | "Limpiar" recursivo y destructivo | aus · solo existe "quitar canto" (`so/smart_paint.rb:136-144`) | No hay reset rápido | P3 | S |
| PINTURA-17 Cara única rápida | Modo caras | par · solo en la paleta avanzada (`SmartPaintPalette.tsx:241`) | — | P3 | S |
| PINTURA-18 Seguridad de la operación | Commit sin validar | **mejor**, con la salvedad de F-PINT-A (`so/smart_paint.rb:249-282`) | Falta observer de Undo/Redo | P2 | S |
| PINTURA-19 Grupos como piezas | Solo ComponentInstance (`ocl/ruby/helper/part_helper.rb:7-13`) | **mejor** (`so/smart_paint_tool.rb:46-51`) | — | P2 | S |
| PINTURA-20 Biblioteca en la paleta | Solo los materiales del modelo | **mejor** · búsqueda, favoritos, recientes, instalación automática (`SmartPaintPalette.tsx:231-234`; `so/offline.rb:243-252`) | Solo cambia la ubicación (ver -04) | P2 | S |
| F-PINT-B Canto sobre pieza sin placa | Bloquea el canto si no hay placa (`smart_paint_tool.rb:864-868`) | aus (confidence media) | Canto sin placa en el TXT | P2 | S |
| F-PINT-C Resaltar "qué falta terminar" | Tooltip con cantos y lados | aus | No hay revisión visual antes del TXT | P2 | S |

### 2.2 Materiales

| ID · Función | OCL | PS | Brecha | Prio | Esf |
|---|---|---|---|---|---|
| MATERIALES-01 Tipo herraje | 7 tipos, herraje = 5 (`ocl/ruby/model/attributes/material_attributes.rb:12-18`) | par · `KINDS` sin hardware (`so/catalog_store.rb:13`); se descarta al importar (`:111`) | Herrajes fuera del presupuesto | P2 | M |
| MATERIALES-02 Presets por tipo | JSON de valores por defecto, formatos europeos | aus · las fichas nacen vacías (`so/catalog_store.rb:70-76`) | Hay que tipear 18 mm y el formato en cada alta | P1 | S |
| MATERIALES-03 Varios espesores y variantes | Listas std_* (confidence media en append_*) | par · un valor por ficha (`so/catalog_store.rb:14,47`); si no coincide, error | El pedido se frena sin ofrecer cómo resolverlo | P1 | M |
| MATERIALES-04 / CANTOS-03 / OPT-06 Descuento de canto en la medida de corte | `edge_decremented` por material (`cutlist_generate_worker.rb:301-308`) | par · "terminadas" o corte explícito a mano (`so/supplier_order.rb:79-82,104-107`) | No se calcula a partir del `thicknessMm` del canto | P2¹ | M |
| MATERIALES-05 Servicios y precios en bloque | std_prices, std_cut_prices | par · un precio con fecha y fuente (`so/catalog_store.rb:58-62`); `includesLabor=false` | Faltan corte y pegado de canto | P2 | M |
| MATERIALES-06 SKM importado con tipo | Uno por vez, pregunta si reemplaza | par · lote robusto pero queda `kind 'unknown'` (`so/skm_import.rb:197`) | Hay que clasificar 30 fichas a mano | P1 | S |
| MATERIALES-07 Exportar | .skm suelto | par · exporta solo `catalog.json` (`so/ui/WorkshopPanel.tsx:48`) | Falta el paquete con SKM y fotos | P2 | S |
| MATERIALES-08 Duplicar ficha | Por SKM temporal | aus | Cada variante se recarga | P2 | S |
| MATERIALES-09 Archivar / quitar no usados | Purga global sin vista previa | aus · requiere limpiar `compatibleIds` en cascada | La biblioteca y el .skp acumulan basura | P2 | S |
| MATERIALES-10 Ajustar escala en el mismo material | Candado de proporción | par · "Reemplazar textura" crea una versión nueva (`so/photo_material.rb:161-163`) | No se propaga a lo ya pintado | P2 | M |
| MATERIALES-11 Girar textura 90° | Botones de giro (confidence media) | aus (`so/photo_material.rb:244`) | Solo afecta lo visual; la veta de corte se confirma por pieza | P2 | M |
| MATERIALES-12 Refresco en vivo | MaterialsObserver | aus · `prepare` relee al elegir (`so/paint_materials.rb:41-68`) | Cambios desde el navegador nativo | P2 | S |
| MATERIALES-13 Sincronizar atributos OCL | Reescribe al editar | par · `write_missing` nunca pisa (`so/ocl_attributes.rb:37-55`) | Valores viejos en OCL | P2 | S |
| MATERIALES-14 Material desde foto | Solo en el modelo | **mejor** (`so/photo_material.rb:26-280`) | Recorte opcional | P3 | S |
| MATERIALES-15 Biblioteca entre modelos | No tiene | **mejor** (`so/catalog_store.rb:15-18,80-100`) | Contador de uso | P3 | S |
| MATERIALES-16 Placa ↔ cantos compatibles | No tiene | **mejor** (`so/catalog_store.rb:50-57`) | Sugerir el canto al pintar | P2 | S |
| MATERIALES-17 Peso | Masa volumétrica | aus | Poco relevante | P3 | S |
| MATERIALES-18 Notas y URL | description, url | par · requiere migrar el esquema (claves exactas en `validate`) | — | P3 | S |
| MATERIALES-19 Pintar desde la lista | Botón que activa el pincel | eq (`so/ui/MaterialLibraryPanel.tsx:15,45`) | Foco al viewport sin verificar | P3 | S |
| F-MAT-A Precargar medidas OCL al traer materiales del modelo | — | aus · OclReader solo usa el tipo (`so/ocl_reader.rb:61`) | Un taller que viene de OCL tiene que retipear todo | P1 | S |
| F-MAT-B Edición masiva de fichas | — | aus (`WorkshopPanel.tsx:52-64`) | Una ficha por vez | P2 | M |
| F-MAT-C Filtrar cantos compatibles por medida | — | aus | El error aparece recién en el pedido | P3 | S |
| F-MAT-D Esquema 2 del catálogo | — | **requisito** · claves exactas, solo existe la migración 0→1 (`so/catalog_store.rb`) | Bloquea las propuestas que suman campos | P2 (prerrequisito) | S |

¹ La verificación de materiales lo dejó en P1, mientras que las de cantos y optimización lo bajaron a P2 porque en Argentina lo habitual es mandar la medida terminada. Lo consolido en **P2, apagado por defecto y definido en el perfil de la maderera**.

### 2.3 Cantos

| ID · Función | OCL | PS | Brecha | Prio | Esf |
|---|---|---|---|---|---|
| **F-CAN-A Propuesta masiva del mapa de cantos** (fusiona DESP-04/16 y OPT-15) | Deduce los cantos de todas las piezas al generar (`cutlist_generate_worker.rb:262-279`) | aus · cada fila nace con `axes=nil` y `edgeMap=[0,0,0,0]` (`so/supplier_order.rb:28-31`); `native_proposal` solo completa material y bindings (`so/workshop.rb:48-58`) | Pintar en 3D no ahorra trabajo al armar el TXT | **P0** | M |
| CANTOS-01 Metros de canto por SKU | Grupos de canto con largo total (`cutlist_generate_worker.rb:648-670`) | par · ya se calcula y queda oculto (`so/supplier_order.rb:126-130`); la UI solo muestra importes (`WorkshopPanel.tsx:95`) | No se controla lo que factura la maderera | P1 | S |
| F-CAN-C `edgeTotals` por lote en el manifiesto | — | aus (`so/supplier_order.rb:166-169`) | No hay un dato firmado contra el cual reclamar | P1 | S |
| CANTOS-02 Sobrante de punta | `length_increase` | aus | Pesa si el taller cantea por su cuenta | P2 | S |
| CANTOS-04 Cantos legibles en la A4 | Franjas y leyenda en el diagrama | par · texto "Arr:SKU…" en la tabla si hay pedido validado (`so/workshop.rb:141-149`; `so/ui/pdf.ts:109-115`) | Texto largo; se omite sin avisar | P1 | S-M |
| CANTOS-07 Aplicar el mapa del pedido al modelo | Modal de pieza por lado | par · `edgeMap` solo vive en el borrador (`WorkshopPanel.tsx:84`) | Hay que volver al 3D | P2 | M |
| CANTOS-08 Ancho de canto vs espesor | Busca el estándar más cercano | **mejor** (`so/supplier_order.rb:87-89`) | — | P3 | S |
| CANTOS-09 Robustez de la detección | Toma el `.first` sin avisar | **mejor** (`so/ocl_reader.rb:127-160`) | Causa concreta del "unresolved" | P3 | S |
| CANTOS-10 Canto en una sola copia | Pinta la definición | **mejor** (`so/smart_paint.rb:254-269`) | Mostrar N en el hover | P3 | S |
| CANTOS-11 Quitar canto | Modal / limpiar todo | **mejor** · ya está en la barra rápida (`so/quick_toolbar.rb:12`) | Botón en la paleta inmediata | P3 | S |
| CANTOS-12 Proteger cantos al repintar la placa | Por precedencia | eq (`so/smart_paint.rb:163`) | Test de regresión | P3 | S |
| CANTOS-13 Piezas no rectangulares | Planos del bounding box | aus (`so/native_paint.rb:116,134,153`) | Zócalos con calado, muescas | P2 | L |
| CANTOS-14 Patrón de cantos en la agrupación | edge_pattern | eq (`so/supplier_order.rb:150,157`) | Mini esquema por fila | P3 | S |
| CANTOS-15 Rollos | 1D por rollo | par | Solo si el taller cantea | P3 | S |
| CANTOS-16 Chapa (veneer) | Tipo 6 | aus | No priorizar | P3 | L |
| CANTOS-17 Atributos de canto hacia OCL | length_increase, edge_decremented | par (`so/ocl_attributes.rb:29-30`) | — | P3 | S |
| CANTOS-18 Filtro por canto | Al generar | aus | — | P3 | S |
| F-CAN-B Color real del canto en la vista 2D | Color del material | par · 3 colores fijos (`WorkshopPanel.tsx:105`) | Cantos de tono parecido | P3 | S |

### 2.4 Despiece y nombres

| ID · Función | OCL | PS | Brecha | Prio | Esf |
|---|---|---|---|---|---|
| DESPIECE-01 Numeración ordenada | Por tipo y grupo, persistente (`cutlist_generate_worker.rb:470-506`) | par · P01… por mueble según el orden del árbol (`lib/model.ts:117`); regex fija `P\d{2,4}` (`so/guide_store.rb:32,192`) | Sin orden lógico | P1 | M |
| F-DESP-C Código compuesto módulo·pieza | — | aus · seis "P01" en una obra; el TXT no lleva código (`so/supplier_order.rb:29`) | Piezas mezcladas sin identificar | P1 | S |
| DESPIECE-02 Agrupar por medidas | Part folding (`cutlist_generate_worker.rb:772-800`) | par · misma definición y malla (`lib/pieceGroups.ts:7-21`); la A4 falla si no entra (`so/ui/pdf.ts:124-126`) | Con grupos casi nunca se agrupa, y no imprime | P1 | M |
| DESPIECE-03 Orden configurable | Estrategias | aus (`pieceGroups.ts:4,9`) | — | P2 | S |
| DESPIECE-04 Orientación automática en el pedido | Ordena las medidas (`ocl/ruby/model/geom/size3d.rb:31-42`) | par · ejes a mano + nota ≥8 + regla + veta por fila (`so/supplier_order.rb:69-79`; reseteo en `WorkshopPanel.tsx:41`) | Cientos de clics | P1 → se integra en F-CAN-A (P0) | M |
| F-DESP-A Edición por filas equivalentes o en lote | Edita por tipo de pieza | aus (`WorkshopPanel.tsx:68`) | 4 laterales iguales = 4 cargas | P1 | M |
| DESPIECE-05 CSV "Excel AR" y copiar tabla | CSV `;`/BOM, XLSX (`cutlist_export_worker.rb:113-129`) | aus en offline (el CSV fijo existe solo en el plugin heredado, `sketchup/planos_santo/exporter.rb:215-237`) | — | P2 | S |
| DESPIECE-06 Consumo antes de validar | Resumen | par · `estimate` exige el pedido validado (`so/supplier_order.rb:107-108`) | — | P2 | S |
| DESPIECE-07 / OPT-10 Etiquetas | Hojas configurables (`cutlist_labels_worker.rb:38-107`) | par · delegado a OCL, sin el código PS ni los grupos (`WorkshopPanel.tsx:97-98`) | Identificar las piezas que llegan cortadas | P1² | M |
| DESPIECE-08 Ficha de pieza | Muchos campos | par · la guía guarda solo id, name y code (`so/guide_store.rb:31,190`) | Notas de mecanizado | P2 | M |
| DESPIECE-09 Destino (Maderera / Propio / Comprado) | Tags ± | par · exclusión pieza por pieza (`so/supplier_order.rb:45-49`) | — | P2 | S |
| DESPIECE-10 Nombre que verá OCL | Nombre de la definición | par (`so/names.rb:9`) | Solo informativo | P3 | S |
| DESPIECE-11 Renombrado masivo | Fórmula + make_unique | **mejor** (`so/names.rb:143-264`) | Plantillas cerradas | P3 | S |
| DESPIECE-12 Sugerencia de nombres | No tiene | **mejor** (`lib/nameSuggestions.ts:18-69`) | Zócalo, Trasera cajón | P3 | S |
| DESPIECE-13 Árbol navegable | Outliner | par · select plano (`so/ui/NamePanel.tsx:51`) | — | P2 | M |
| DESPIECE-14 Despiece de la selección | Selección / contexto | par (confidence media) | — | P2 | S |
| DESPIECE-15 Doble encolada | thickness_layer_count | aus · se bloquea si el espesor ≠ placa (`so/supplier_order.rb:76-77`) | Tapas de 36 mm | P2 | S |
| DESPIECE-16 Cantos por lado en lote | Automático | par · la propuesta existe pero fila por fila (`so/ui/EdgeReview.tsx:12-21`) | → F-CAN-A | P1 | M |
| F-DESP-D Vínculo material → canto a nivel pedido | — | aus · `edgeBindings` por fila | — | P2 | S |
| DESPIECE-17 TXT a la maderera | No tiene | **mejor** (`so/supplier_order.rb:11,133-168`) | Perfiles + código en el detalle | P1 | S |
| F-DESP-B Referencias A4 sin exigir el pedido completo | Siempre visibles | aus · `validate` corta todo (`so/workshop.rb:141-149`) | — | P2 | S |
| DESPIECE-18 Grupos como piezas | No | **mejor** | Avisar qué piezas no verá OCL | P3 | S |
| DESPIECE-19 Resaltar varias piezas | Sí | eq (`so/piece_highlight_tool.rb`) | — | P3 | S |

² DESP-07 quedó en P2 y OPT-10 en P1. Consolido en **P1**: lo que se gana es atar la etiqueta física al código del A4 y del TXT, y eso OCL no lo resuelve para PS.

### 2.5 Optimización y planos

| ID · Función | OCL | PS | Brecha | Prio | Esf |
|---|---|---|---|---|---|
| OPT-01 Optimizador 2D | Packy nativo (`ocl/ruby/worker/cutlist/cutlist_packing_worker.rb:221-262`) | aus · delega en OCL 7.1.0 exacto (`so/workshop.rb:154-166`) | Solo hace falta una estimación de placas | P2 | L |
| OPT-02 Perfil de sierra (refilado, kerf, medida útil) | Preset métrico de 3 mm de kerf y 10 mm de refilado | aus · valida contra la placa bruta (`so/supplier_order.rb:102`) | Un lateral de 2600 en una placa de 2600 "pasa" | P1 | S |
| OPT-03 Veta precompletada y excepción por pieza | Orientado salvo "ignorar veta" (`cutlist_packing_worker.rb:523`) | par · confirmación por pieza, sin override (`so/supplier_order.rb:91-96`) | Clics; no se libera un fondo de cajón | P1 | S |
| F-OPT-B Veta indiferente por pieza | Sí | aus | — | P2 | S |
| F-OPT-A Rota=1 con cantos asimétricos | Rota libre sin veta | bloquea (`so/supplier_order.rb:93-95`) | Peor optimización de la maderera | P1 (validar con el proveedor) | S |
| OPT-04 Retazos | Entrada y salida | aus | — | P3 | M |
| OPT-05 Presupuesto real | Placas enteras + corte (`ocl/ruby/worker/cutlist/cutlist_estimate_worker.rb:372-448`) | par · área neta, `includesWaste=false` (`so/supplier_order.rb:116-132`) | Subestima entre 15 y 30 % | P1 | M |
| OPT-07 / 08 / 09 Diagramas, DXF, Smart Export | Sí | aus | Sin CNC; la maderera corta | P3 | M-L |
| OPT-11 Perfiles de columnas por maderera | CSV y fórmulas | par · 9 columnas fijas (`so/supplier_order.rb:11,40`) | Cambiar de proveedor | P2 | M |
| F-OPT-C Perfil de maderera unificado | — | aus · el perfil vive en cada borrador (`so/supplier_order.rb:33,40`) | Lo mismo se configura en 5 lugares | P1 | M |
| OPT-12 Pedido con lotes y trazabilidad | No tiene | **mejor** (`so/supplier_order.rb:141-170`) | `production_ready=false` | P2 | S |
| OPT-13 Guía A4 por mueble | Layout / LayOut Pro | **mejor** (`so/ui/pdf.ts:119-198`) | — | P2 | S |
| OPT-14 Hoja 2 de despiece | Pagina | par · una A4 por mueble; falla si se pasa de 139 mm (`so/ui/pdf.ts:128-131`) | Placares y cocinas | P1 | M |
| OPT-15 Confirmación en bloque | Un clic | par → **F-CAN-A** | Principal fricción del día a día | **P0** | M |
| OPT-16 Canto 1D / perfiles | Motor 1D | par | → CANTOS-02/15 | P2 | S |
| OPT-17 "Ver en el modelo" desde el pedido | Resaltar | par · la herramienta existe y no está conectada (`WorkshopPanel.tsx:70`) | — | P2 | S |
| F-OPT-D Código de etiqueta cuando el TXT agrupa piezas | — | riesgo (`so/supplier_order.rb:150-157` vs `so/ui/pdf.ts:112`) | Un renglón podría mezclar varios P## | P2 | S |

### 2.6 Arquitectura y UI

| ID · Función | OCL | PS | Brecha | Prio | Esf |
|---|---|---|---|---|---|
| ARQ-01 Análisis escalable | Bounds por definición en caché (`cutlist_generate_worker.rb:926-955`) | aus · tesela cada instancia; topes de 200.000 triángulos y 5.000 nodos (`sketchup/planos_santo/exporter.rb:68-100,138-185`) | Herrajes de Warehouse pueden reventar el límite (sin medir) | P1 (medir primero) | S→L |
| ARQ-02 Sin reanálisis automáticos | Marca "obsoleto" | par · escanea de nuevo después de pintar, nombrar o guardar (`so/offline.rb:706-709,842-873`; `so/session.rb:63-74`) | Congelamientos repetidos | P1 | M |
| ARQ-03 Observers de modelo, selección y materiales | Sí (`ocl/ruby/observer/model_observer.rb:8-37`) | par · solo AppObserver (`so/offline.rb:24-31`) | Los cambios aparecen recién al exportar | P1 | M |
| ARQ-04 Clic sin recorrer el modelo | Pick local | par (`so/smart_paint.rb:126`) | Medir | P2 | M |
| ARQ-05 Progreso y cancelación | start/advance/cancel | par · llamada única, 120 s (`so/ui/bridge.ts:9-19`) | Solo en scan | P2 | M |
| ARQ-06 Tamaño y posición de la ventana, plegado | Recuerda, minimiza, restablece (`ocl/ruby/plugin.rb:61-92,1577-1619`) | par · fuerza 1440x920 (`so/offline.rb:137,167`) | Notebook de 1366x768 | P1 | S |
| ARQ-07 Carga diferida | Pestaña a demanda | par · `scan` al montar (`so/ui/App.tsx:139-143`) | — | P2 | S |
| ARQ-08 Menú contextual nativo | Sí (`plugin.rb:851-866`) | aus | — | P2 | S |
| ARQ-09 Barra de pintura | Barra de herramientas | par · canto, quitar canto y cuentagotas fuera de la barra (`so/quick_toolbar.rb:19,61`) | — | P2 | S |
| ARQ-10 HUD o status_text | Kuix | par · sin texto en la vista | Etapa 1: status_text | P2 | S→M |
| F-ARQ-A Tamaño de respuesta Ruby → JS | — | aus · sin tope de salida (`so/offline.rb:207-209,268-271`) | Los cuelgues de "SketchUp no respondió" | P1 | S |
| F-ARQ-B `emit` en cada mousemove | — | riesgo (`so/smart_paint_tool.rb:164-170`; `so/offline.rb:810-819`) | Pincel pesado | P2 | S |
| F-ARQ-D Decisión sobre la dependencia de OCL | — | `so/workshop.rb:163-165` | Flujo partido en dos extensiones | P1 (decisión) | — |
| ARQ-11…15 Teclado, preferencias de taller, densidad, novedades, mensajes centralizados | Sí | par / aus | Comodidad | P3 | S |
| ARQ-16 Protocolo Ruby ↔ HtmlDialog | Básico | **mejor** (`so/offline.rb:291-323`) | `publish` genérico | P2 | S |
| ARQ-17…19 Barra con motivos de bloqueo, bootstrap, flujo de taller | — | **mejor** | — | P3 | S |

---

## 3. Lo que PS ya hace mejor que OCL (mantener)

1. **Operación de pintura atómica y honesta**: arma el plan completo antes de abrir la operación, aborta el lote ante cualquier fallo, preserva el mapeo de textura y verifica bloqueos y contexto (`so/smart_paint.rb:72-114,249-282`; `so/native_paint.rb:74-76`). Falta corregir el no-op en compartidas (F-PINT-A).
2. **Grupos como piezas** en el pincel, en los nombres y en el exportador (`so/smart_paint_tool.rb:46-51`; `so/names.rb:82-87`). Cualquier diseño inspirado en OCL tiene que mantenerlo y cubrirlo con un test de regresión.
3. **Canto en una sola copia** con make_unique verificado (`so/native_paint.rb:239-253`) y **quitar canto** sin destruir la placa (`so/smart_paint.rb:136-166`).
4. **Detección estricta de cantos**: cobertura por lado, materiales desconocidos marcados como "unresolved" (`so/ocl_reader.rb:127-160`). Nunca adivina.
5. **Biblioteca permanente del taller**: lock, revisiones, backups, instalación automática al pintar, material desde foto con integridad, relación placa ↔ cantos y requisitos de aprobación (`so/catalog_store.rb:15-100`; `so/photo_material.rb:26-280`).
6. **TXT para la maderera**: lotes por placa, espesor y canto; staging atómico; manifiesto con sha256; validación de que el canto cubre el espesor y es compatible (`so/supplier_order.rb:84-89,133-170`).
7. **Guía A4 por mueble** con vistas, cotas, notas y listado, sin depender de LayOut (`so/ui/pdf.ts:119-198`).
8. **Nombres con convención de taller** (obra + módulo + base), vista previa con bloqueos, sin make_unique, y sugerencias por geometría con abreviaturas del taller (`so/names.rb:143-264`; `lib/nameSuggestions.ts`).
9. **Protocolo e instalación defensivos**: versión de protocolo, `@busy`, despacho diferido, verificación de archivos al arrancar, motivos de bloqueo visibles en la barra y protección de cambios sin guardar (`so/offline.rb:57-75,151-157,291-323`; `so/bootstrap.rb:8-27`; `so/quick_toolbar.rb:44-57`).
10. **Navegación por flujo de taller**: Inicio → Materiales → Muebles → Maderera → Planos A4 (`so/ui/App.tsx:43`).

---

## 4. Lo que NO conviene copiar de OCL, y por qué

| Comportamiento de OCL | Por qué no |
|---|---|
| Motor Packy nativo, nesting irregular, diagramas y DXF por placa | La maderera optimiza y corta con su software. El costo de mantenimiento es enorme y hay implicancias GPLv3. Alcanza con un estimador de placas propio, rotulado como estimación (OPT-01). |
| make_unique automático al renombrar o pintar caras | Rompe la relación entre copias y fragmenta el despiece. PS bloquea o pide alcance explícito. |
| Pintar cantos siempre sobre la definición, solo con un aviso | En módulos con un lateral visto se cantean piezas gemelas por error. PS tiene que ofrecer "solo esta" y "todas" de forma explícita. |
| Excluir los grupos como piezas | Sería una regresión para un taller que modela con grupos. |
| Ignorar ocultas o capas apagadas sin aviso individual, y quedarse con el primer canto cuando un lado tiene varios | Para un pedido que se paga, ocultar errores es inaceptable. |
| La permisividad general ("generar con lo que haya y advertir") | Hay que reducir clics, no garantías: placa no aprobada, canto que no cubre el espesor, catálogo cambiado. |
| `edge_decremented` como propiedad global del canto | La regla depende de la maderera. En PS va al perfil del proveedor. |
| "Limpiar" recursivo, purga global, reinicio global de precios | Destructivos y sin vista previa. PS tiene que limitarse a lo que tiene vínculo PS y mostrar la lista antes. |
| Duplicar renombrando temporalmente el original | Si falla a mitad de camino, deja nombres alterados. |
| Calcular el despiece completo de la entidad en cada movimiento del mouse | Para el hover alcanza con un veredicto de aptitud cacheado por definición. |
| Lenguaje de fórmulas libres (columnas, etiquetas, nombres) | Opaco para el operario y difícil de validar. PS usa campos y plantillas cerradas. |
| Listas de dimensiones como texto con `;` y unidades embebidas | Se tipan en mm y se convierten solo al escribir atributos OCL. |
| Presets imperiales o europeos (2800x2070, 2500x1250) | No corresponden al mercado argentino (2750x1830 o 2600x1830, a confirmar). |
| i18n multiidioma, chequeo en línea de novedades, foro, sponsor, descarga de RBZ | PS es local y offline. Alcanza con centralizar los mensajes en español. |
| Comandos sincrónicos dentro del callback del diálogo; pila jQuery/Twig/Kuix | PS es más seguro con su despacho diferido y React. Para el HUD alcanza con un `draw2d` mínimo propio. |
| Unificar todo en un único HtmlDialog | La paleta liviana separada es correcta para pintar al lado del modelo. Hay que mejorar tamaño y plegado, no unificar. |
| Numeración solo con letras | Se confunde con los códigos de módulo y obra. Es mejor un número con prefijo de módulo. |
| Alt como única tecla del cuentagotas | En Windows puede activar el menú de SketchUp. Tiene que ser configurable. |
| Copiar iconos, cursores, textos i18n, SVG o código | GPLv3. Todo lo de PS tiene que ser diseño propio (ver sección 6). |

---

## 5. Plan por hitos

Orden: primero valor para el taller y después esfuerzo. Cada hito arranca solo cuando el anterior pasó su criterio de aceptación en SketchUp 2026 real.

### Hito 1 (en curso, pendiente de validación nativa): Pintura y materiales 0.8.10

**Estado:** implementado y probado con dobles. **Falta validarlo en SketchUp 2026 nativo.** No se arranca el Hito 2 hasta cerrarlo.
**Puerta de salida (checklist en SketchUp real):**
- Pintar placa y canto en un grupo y en un componente compartido: un Ctrl+Z deshace exactamente un clic, la textura conserva su mapeo y los cantos quedan intactos al repintar la placa.
- Instalación automática desde la biblioteca, material desde foto y reutilización en otro .skp.
- Latencia de clic en un modelo de unas 500 piezas, anotada en el log de diagnóstico (es la línea base para PINTURA-09 y ARQ-04).
- Foco al viewport después de "Pintar" desde la biblioteca (MATERIALES-19).
- Comprobar en vivo F-PINT-A (repasar puertas ya pintadas): si confirma, se registra como defecto del Hito 1 y se resuelve antes de cerrarlo.

### Hito 2 (planificado, no iniciado): Pincel diario completo

**Objetivo:** pintar un mueble de melamina completo (placa y cantos) sin salir del viewport y sin efectos laterales.
**Entregables:**
1. F-PINT-A: no-op real en compartidas, con test de 2 instancias ya pintadas → `changed:false`, sin make_unique.
2. PINTURA-01 (incluye CANTOS-05/06): `edgeCount` 1/2/4 en `quick_paint_start`, validado contra [1,2,4]. Selector segmentado en la paleta inmediata que se guarda en settings, Ctrl+Tab cicla, y el hover reusa la ruta de preview expandida (`so/smart_paint_tool.rb:141-162`) con caché por definición.
3. PINTURA-02: conmutador "Solo esta / Todas las iguales (N)". La autorización la da el propio toggle, que se resetea al cambiar de material, y el preview resalta todas las copias.
4. PINTURA-06: Tab alterna Pieza ↔ Canto y recuerda el último material de cada modo.
5. Feedback en la vista (etapa 1 de ARQ-10): `Sketchup.status_text` con modo, material y último error; PINTURA-03 (tooltip `draw_text` de 2 líneas); PINTURA-05 (color real con alpha propio); PINTURA-12 (cursores propios: pieza, canto, quitar, prohibido).
6. PINTURA-08: veredicto de aptitud cacheado por `definition.guid` + contador de transacciones, que también avisa "canto sin placa" (F-PINT-B).
7. F-ARQ-B: `emit` solo cuando cambia el mensaje o el objetivo, con un mínimo de 100 ms entre envíos.
8. Medición: tiempo por clic en el log (PINTURA-09), con objetivo menor a 150 ms con 500 piezas.

**Criterio de aceptación en SketchUp:** sobre un bajo mesada de 6 módulos con 4 puertas iguales: (a) 4 cantos en 1 clic, con preview de los 4 lados antes de hacer clic; (b) "Todas las iguales (4)" pinta las 4 puertas con un solo Undo y sin crear definiciones nuevas; (c) "Solo esta" aísla una sola y muestra la N antes; (d) una pieza con rebaje muestra el cursor prohibido y el motivo antes del clic, y nunca pinta a medias; (e) repasar puertas ya pintadas no agrega entradas de Undo; (f) Tab y Ctrl+Tab funcionan sin desactivar la herramienta.
**Riesgos:** levantar el `edgeCount=1` es revertir una política de seguridad deliberada (`so/offline.rb:230-235`), así que hacen falta pruebas con caras partidas (`so/native_paint.rb:177-179`). `draw_text` puede variar con HiDPI en SU 2026. Riesgo de pintar piezas que solo parecen iguales: se mitiga mostrando N y resaltando todas las copias.

### Hito 3: Del modelo al TXT sin fricción (el de mayor valor para el taller)

**Objetivo:** que un mueble pintado llegue al TXT con revisión por excepción y no por pieza.
**Entregables:**
1. **F-CAN-A / OPT-15 / DESP-04 / DESP-16, "Proponer pedido desde el modelo"**: para todas las filas incluidas, (a) ejes con U = el más largo, V = el segundo y espesor = el de la placa del catálogo, y si la placa tiene veta, U a lo largo de la veta (OPT-03); (b) placa, principal y secundario desde los vínculos nativos (como máximo 2 SKU de canto por pieza; si hay más, la fila se bloquea con el motivo); (c) `projected_edges` → `edgeMap` con `edgeResolution='observed'`; (d) regla de medidas "terminadas aceptadas" y una nota automática de lote que cumple `reviewNote` (`so/supplier_order.rb:78`). Todo queda como propuesta sin confirmar.
2. "Confirmar en bloque" solo para las filas sin ambigüedad: rectangulares, no espejadas, largo distinto del ancho, sin lados "unresolved" y con espesor coincidente. Las demás quedan en revisión individual.
3. F-DESP-A: "Aplicar a filas equivalentes o seleccionadas", que invalida solo las confirmaciones afectadas por el campo que cambió.
4. F-DESP-D: tabla de vínculos material observado → canto a nivel borrador.
5. CANTOS-01 + F-CAN-C: bloque "Cantos del pedido" (metros, lados y piezas por SKU, con o sin precio) y `lots[].edgeTotals` en el manifiesto firmado.
6. F-DESP-C: código compuesto (por ejemplo `M03·P07`) en el detalle del TXT, opcional según el perfil y respetando el límite de largo del detalle.
7. OPT-17: "Ver en el modelo" en las filas bloqueadas.
8. Medición del tiempo de `scan` y `generate` y del tamaño en bytes de la respuesta (F-ARQ-A), como insumo para el Hito 6.

**Criterio de aceptación en SketchUp:** un placard de unas 30 piezas pintado en el Hito 2 llega al TXT con 3 clics de lote más la revisión individual de las filas ambiguas, que no deberían pasar del 20 %. El TXT generado coincide línea por línea con uno armado a mano para el mismo mueble. La prueba de 2 piezas de 700x450 con `edgeMap [1,1,0,0]` da 2,8 m. El manifiesto lleva los totales de canto.
**Riesgos:** ejes mal deducidos en frentes, con lo que se piden mal los cantos. Por eso la deducción se abstiene ante cualquier ambigüedad y la vista 2D sigue siendo obligatoria para esas filas. Otro riesgo es que una pintura incompleta se lea como "sin canto"; hoy ya se exige cobertura completa (`so/ocl_reader.rb:148`).

### Hito 4: Perfil de maderera y catálogo v2

**Objetivo:** configurar una sola vez cómo trabaja cada proveedor y tener altas de material rápidas y correctas.
**Entregables:**
1. F-MAT-D: esquema 2 del catálogo con migración explícita y backup (prerrequisito de todo lo que sigue).
2. F-OPT-C: entidad versionada "Perfil de maderera" con aprobación y registrada en el manifiesto: refilado, kerf, medida útil (OPT-02, que avisa sin bloquear), regla "terminadas / descontar canto" (MATERIALES-04 / CANTOS-03 / OPT-06, **apagada por defecto**, usando el `thicknessMm` del canto que ya existe), % de desperdicio, tarifas de corte y canteado (MATERIALES-05), rota con cantos asimétricos (F-OPT-A, solo si el proveedor lo confirma) y codificación y decimal.
3. OPT-05: presupuesto en tres columnas (neto, con desperdicio, placas a comprar) más servicios en una línea aparte.
4. MATERIALES-02: `presets-taller.json` con valores sugeridos y no aprobados (18 mm, formatos a confirmar, canto 22x0,45 / 22x2).
5. MATERIALES-03: "Crear variante de espesor" y las tres opciones cuando el espesor no coincide.
6. MATERIALES-06 + F-MAT-A: tipo editable en lote al importar SKM, y precarga de las medidas OCL como sugerencia.
7. PINTURA-10: decisión y spike sobre el modelo de datos de la pieza (instancia vs caras), con un lector de los dos esquemas y un test del "material dominante". Se implementa solo si el spike demuestra que no rompe el lector del despiece.

**Criterio de aceptación en SketchUp:** dar de alta 10 colores de melamina con preset lleva menos de 2 minutos. Un lateral de 2600 sobre una placa de 2600 con 10 mm de refilado muestra un aviso. El presupuesto de un mueble de referencia queda dentro de ±10 % de la cotización real de la maderera. Una biblioteca v1 migra sin perder fichas y el backup queda escrito.
**Riesgos:** descontar dos veces el canto si la maderera ya descuenta (de ahí apagado por defecto y validación con el proveedor). Valores del perfil mal cargados (requiere aprobación). La migración del esquema puede invalidar JSON exportados viejos.

### Hito 5 (implementado, pendiente de validación nativa): Planos A4 y etiquetas atadas al pedido

**Estado (2026-10-22, rama `claude/noche-hito5-a4`):** los 7 entregables están implementados y probados con dobles (vitest, Ruby y Playwright). **Falta el criterio de aceptación en SketchUp 2026 real.**
- CANTOS-04: glifo y código `1·1·0·2` ya existían; ahora una prueba con 5 piezas asimétricas (fixture `tests/offline/fixtures/cantos-asimetricos.json`) verifica que el TXT, las referencias, el glifo dibujado en el PDF y la vista 2D marcan los mismos lados. El aviso de hoja sin materiales queda para pedido sin guardar o desactualizado.
- F-DESP-B: acción `order_references_partial` (`so/order_references.rb`); las filas que validan imprimen placa y cantos y las demás «pendiente de pedido». Con filas pendientes no se imprime el lote, porque todavía puede renumerarse.
- DESPIECE-02: «Agrupar por medidas» ya existía con clave de placa, mapa de cantos y referencia del pedido; ahora también separa las filas pendientes.
- DESPIECE-01: «Codificar despiece» (`CodePlanDialog.tsx`) con orden placa → espesor → largo → ancho; «Renumerar» explícito, que `guide_store.rb` acepta solo con `renumber:true` y deja el código anterior en `previousCode`.
- OPT-14: «Permitir hoja 2: despiece completo» (preferencia local por mueble); hojas 1a/1b… agrupadas por placa, sin recortar nada.
- DESPIECE-07 / OPT-10 + F-OPT-D: `ui/labels.ts`, plantillas 3 × 7 y 2 × 5 con márgenes ajustables. **Decisión F-OPT-D:** cada etiqueta lleva el código de su pieza física y el lote, aunque el TXT agrupe varias piezas en un renglón. Con pedido, el código es el módulo·pieza que calcula Ruby (`OrderProposal.codes`, el mismo del detalle del TXT del Hito 3); sin pedido, `compositeCode`.
- DESPIECE-05 (parcial): «Copiar tabla» en TSV ya existía; ahora marca las filas pendientes.

**Pendiente:** validar en SketchUp con una cocina de más de 40 piezas (hoja 1 + hoja 2), imprimir las etiquetas en una hoja autoadhesiva real y cotejar las 5 piezas asimétricas a mano. Un perfil de TXT sin terminar o un pedido sin piezas incluidas ya no impiden imprimir la A4 ni las etiquetas.


**Objetivo:** que el armador y el que recibe la entrega identifiquen cada pieza y sus cantos en papel.
**Entregables:**
1. CANTOS-04: un glifo propio en la tabla A4 (rectángulo con trazo lleno para el principal y discontinuo para el secundario) más el código `1·1·0·2`, y aviso en la hoja si el pedido no está guardado.
2. F-DESP-B: imprimir las referencias de las filas que ya validaron y marcar las demás como "pendiente de pedido".
3. DESPIECE-02: "Agrupar por medidas", cuya clave incluye placa, mapa de cantos y referencia del pedido (para no chocar con `so/ui/pdf.ts:111-112`).
4. DESPIECE-01: "Codificar despiece" con vista previa, orden placa → espesor → largo → ancho, solo para piezas sin código o con "Renumerar" explícito.
5. OPT-14: "Hoja 2: despiece completo" agrupada por placa, con consentimiento explícito y numeración 1a/1b.
6. DESPIECE-07 / OPT-10 + F-OPT-D: PDF de etiquetas con plantillas A4 fijas (3x7, 2x5), código compuesto, medidas según la orientación del pedido, mini esquema de cantos y flecha de veta, ordenadas por lote. Hay que definir qué código lleva cada etiqueta cuando el TXT agrupa piezas.
7. DESPIECE-05 (parcial): "Copiar tabla" en TSV.

**Criterio de aceptación en SketchUp:** una cocina de más de 40 piezas exporta la A4 (hoja 1 + hoja 2 aprobada) sin truncar nada. Las marcas de canto de la A4, del TXT y de la vista 2D coinciden en 5 piezas asimétricas elegidas al azar. Las etiquetas impresas en una hoja autoadhesiva real quedan alineadas, con márgenes ajustables.
**Riesgos:** si la A4 y el pedido no usan la misma proyección, las marcas quedan en lados equivocados (hay que reusar `orderProjection`). Renumerar cambia códigos ya impresos (vista previa y código anterior guardado en metadatos).

### Hito 6: Rendimiento y arquitectura de base

**Objetivo:** que una obra de más de 1500 piezas se analice, pinte y exporte sin congelarse. **Se puede adelantar** si la medición de los Hitos 2 y 3 supera unos 200 ms por clic o unos 10 s de scan.
**Entregables:**
1. ARQ-01, etapa S: caché de la malla local por definición (con el material heredado en la clave) y exclusión de herrajes del teselado. La etapa L (árbol liviano con malla a demanda) va solo si lo justifica la medición con `so/test/fake_model.rb` (1500 placas + 20 herrajes curvos).
2. ARQ-02: aviso "Análisis desactualizado · Reanalizar" en lugar de reanálisis automáticos, y una huella liviana que **incluya el material de cada cara**.
3. ARQ-03: `ModelWatch` propio (commit/undo, selección, materiales) con debounce de 300 ms, que no recorre el modelo dentro del callback e ignora las transacciones abiertas por PS. Cubre también PINTURA-18 y MATERIALES-12.
4. F-ARQ-A: medir y poner tope a las respuestas salientes, y mandar las mallas por mueble.
5. ARQ-06: quitar los `set_size` fijos, primera apertura al 80 % de la pantalla, botón "Plegar" con `Sketchup.focus` y "Restablecer ventanas".
6. ARQ-07: no hacer `scan` al abrir Materiales o Maderera.
7. PINTURA-09 / ARQ-04: índice de rutas invalidado por `ModelWatch`, solo si la medición lo pide.

**Criterio de aceptación en SketchUp:** modelo de prueba de 1500 piezas: scan menor a 10 s, clic de pintura menor a 150 ms, ningún "SketchUp no respondió". Mover una pieza con la herramienta nativa muestra la franja de aviso en menos de 1 s. En una notebook de 1366x768 la ventana se abre entera y recuerda su tamaño.
**Riesgos:** cachés inválidos que pinten la cara equivocada (se conserva la verificación final por `persistent_id`). Observers mal escritos que hagan lento a SketchUp. La huella liviana tiene que cubrir todo lo que imprime la A4.

### Hito 7: Pincel avanzado y gestión de materiales (P2/P3)

**Entregables, en orden sugerido:** PINTURA-04 (tira de recientes con `draw2d`), PINTURA-07 (cuentagotas con tecla configurable), PINTURA-11 (pick en profundidad), PINTURA-13 / ARQ-08 (menús contextuales), ARQ-09 (barra de pintura), F-PINT-C (resaltar lo que falta), PINTURA-15 y CANTOS-13 (varias caras por lado, "placa con contorno"), MATERIALES-07/08/09 (paquete .zip, duplicar, archivar), MATERIALES-10/11 (escala y giro), MATERIALES-13 (sincronizar con OCL usando `oclWritten`), MATERIALES-01 (herrajes como atributo del componente), DESPIECE-09/13/15 (destino, árbol, doble encolada), CANTOS-07 (aplicar el mapa al modelo).
**Criterio de aceptación:** cada entregable tiene su propia prueba en SketchUp. Ninguno puede degradar las métricas del Hito 6.
**Riesgos:** dispersión. Conviene priorizar según lo que pida el taller después de usar los Hitos 2 a 5.

**Fuera de plan, a revisar más adelante:** OPT-01 (estimador de placas, P2 L), OPT-04 (retazos), OPT-11 (perfiles de columnas, que se activa si se cotiza con una segunda maderera), CANTOS-16, OPT-07/08/09, ARQ-11 a 15. **Decisión de arquitectura pendiente (F-ARQ-D):** seguir delegando optimización y etiquetas en OCL 7.1.0 o reemplazarlas con funciones propias. Con los Hitos 4 y 5, la dependencia queda reducida a la optimización.

---

## 6. Restricciones legales y técnicas

**Legales (GPLv3 y clean-room)**
- OCL es GPLv3. En PS (o en cualquier distribución del RBZ) no puede entrar código, estructura de clases copiada, iconos, cursores, SVG, textos i18n, JSON de presets ni nombres de recursos de OCL. Este documento describe comportamientos; las propuestas son diseño propio.
- Hay que separar los roles: quien lee OCL redacta especificaciones de comportamiento, y la implementación en PS se hace a partir de esas especificaciones y del código de PS, sin tener OCL abierto.
- Los cursores, iconos y la tira de materiales se diseñan desde cero. No hay que usar "Kuix" ni su estructura como referencia de implementación.
- Escribir atributos en el diccionario `ladb_opencutlist` para interoperar es leer y escribir datos de formato, no copiar código. Hay que mantener la política actual de escribir solo lo que falta y registrar qué claves escribió PS (`so/ocl_attributes.rb:37-55`).
- No hay que integrar binarios de OCL (Packy) ni enlazarse a ellos.

**Técnicas**
- La API de SketchUp 2026 es mono-hilo. Las tareas largas se hacen por tandas con `UI.start_timer` y los observers no pueden recorrer el modelo.
- HtmlDialog/CEF: la entrada está acotada a 45 MB (`so/offline.rb:295`) y la salida todavía no tiene tope (F-ARQ-A).
- `draw_text` y `draw2d` cambian entre versiones y con el escalado (`UI.scale_factor`).
- En Windows, Alt puede activar el menú de SketchUp.
- Hay que respetar las invariantes de PS: no make_unique silencioso, una operación con un Undo, nunca adivinar (ante la duda, bloquear con un motivo), flujo offline sin red y una A4 por mueble salvo aprobación explícita.
- El esquema del catálogo valida claves exactas: cualquier campo nuevo pasa por el esquema 2 con migración (F-MAT-D).
- `GuideStore` impone la regex `P\d{2,4}` para los códigos: un código compuesto se **muestra**, no se guarda, salvo que se haga una versión nueva del esquema con migración.

---

## 7. Supuestos y qué falta validar en SketchUp real

| Supuesto / pendiente | Cómo validarlo | Afecta |
|---|---|---|
| Todo el Hito 1 funciona en SU 2026 nativo (Undo, texturas, grupos, instalación automática, foco) | Checklist del Hito 1 | Arranque del Hito 2 |
| F-PINT-A ocurre en vivo (make_unique y Undo al repasar piezas ya pintadas) | Repasar 4 puertas ya pintadas | Hito 1/2 |
| Latencia real por clic y por scan (nada está medido) | Log de diagnóstico, modelos de 500 y 1500 piezas | PINTURA-09, ARQ-01/02/04, orden de los hitos |
| `boundary_frame` con caras partidas al habilitar 2/4 cantos en el modo rápido | Piezas con aristas partidas y rebajes | PINTURA-01 |
| `draw_text` / `draw2d` y HiDPI en SU 2026 | Monitor 4K con escalado al 150 % | PINTURA-03/04, ARQ-10 |
| Alt en Windows para el cuentagotas | Prueba manual | PINTURA-07 |
| Efecto en OCL del "material dominante" con caras de canto (es inferencia) | Abrir en OCL un modelo pintado por PS | PINTURA-10 |
| La maderera recibe medida terminada y descuenta el canto | Consultar al proveedor real | MATERIALES-04 / CANTOS-03 / OPT-06 |
| Al rotar, la maderera reinterpreta canto_arr/aba/izq/der | Consultar y hacer una prueba de corte | F-OPT-A |
| Formatos de placa del mercado (2750x1830 / 2600x1830), refilado y kerf reales | Ficha técnica del proveedor | MATERIALES-02, OPT-02 |
| Formato de hojas autoadhesivas disponibles en el taller | Comprar e imprimir una prueba | Etiquetas (Hito 5) |
| Que el TXT con el código en el detalle siga importándose en el sistema de la maderera | Envío de prueba | F-DESP-C, OPT-10 |
| Foco al viewport después de "Pintar" desde la biblioteca | Prueba manual | MATERIALES-19 |
| Detalles no verificados línea por línea: `so/material_sample_tool.rb:83-97`, el precargado de selección en `so/session.rb` y `so/offline.rb`, los append_* de OCL, los controles de giro de OCL, el menú de recuperación del bootstrap y los tests de `so/test/workshop_test.rb` | Lectura dirigida antes de implementar cada ítem | Confidence media en PINTURA-07, DESP-14, MAT-03/11, ARQ-18 |
| Si el exportador del TXT ya detecta "canto sin placa" | Leer `so/supplier_order.rb` validate_row | F-PINT-B |
| Valor real de "Todas las iguales" frente al riesgo de pintar piezas que solo parecen iguales | Observar al operario en una obra real | PINTURA-02 |