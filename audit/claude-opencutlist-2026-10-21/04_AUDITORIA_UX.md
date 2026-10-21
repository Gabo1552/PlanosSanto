# 04 — Auditoría UX: recorridos A–F

**Limitación principal:** esta auditoría se hizo **sin SketchUp**. Por eso, ningún tiempo ni conteo de clics es medido: los conteos de abajo son **mínimos teóricos deducidos del código** (cada paso cita su origen). Todo valor real queda `NO VERIFICADO` hasta ejecutar `08_PLAN_PRUEBAS_SKETCHUP.md`. Tampoco hay capturas comparativas: la única evidencia visual es `fallo_pintado_087.png`.

**Convención:** "clic" = acción del usuario (incluye elegir en un diálogo del sistema operativo). "Ventana" = HtmlDialog o diálogo del sistema que se abre.

## Resumen

| Recorrido | PS 0.8.7: clics mín. / ventanas | OCL 7.1.0: clics mín. / ventanas | Pasos bloqueantes en PS | Estado PS |
|---|---|---|---|---|
| A. Material desde JPG o SKM | 6–8 / 2–3 (+5–7 / 2 por cada modelo nuevo) | 5–6 / 2 | Instalar en cada modelo; SKM entra como "desconocido" | PARCIAL |
| B. Pintar 5 piezas y cambiar material | 2 + 5 + 1 (si el material está instalado) / 1 paleta | 1 + 1 + 5 + 1 / 0 | Error de textura si no está instalado | **BLOQUEADO** en la captura |
| C. Pintar canto | 2–3 + clics / 1 paleta | 1 + Tab + clics / 0 | Mismo cerrojo de material; ejes deducidos | NO VERIFICADO |
| D. Nombres | 4–6 / 1 grande | 3–5 / 1 (otro objetivo: definiciones) | Guardar la guía antes de renombrar | NO VERIFICADO |
| E. Planos A4 | 6–10 / 1 grande + guardar PDF | No equivalente (LayOut) | Regenerar la guía antes del PDF | NO VERIFICADO |
| F. TXT maderera | 4 + 4 confirmaciones × fila / 1 grande + carpeta | 3–4 (con columnas personalizadas) | Ficha aprobada completa + 4 confirmaciones por fila | NO VERIFICADO |

## A. Material nuevo desde JPG/PNG o SKM

**PS, desde foto (modelo actual)**
1. Barra → **Pintar** → se abre la paleta (`quick_toolbar.rb:171`, `offline.rb:183-202`) — 1 clic, 1 ventana.
2. **+ Material** → la paleta crece a 680×760 (`palette.js` `onCreateMaterial`, `offline.rb:578-584`) — 1 clic.
3. Elegir foto → diálogo del sistema (`offline.rb:451`) — 2 clics, 1 ventana.
4. Completar nombre, placa o canto, espesor y escala opcional → **Crear** (`photo_material.rb:142-156`) — 2–3 clics más tipeo.
5. Volver a la paleta con el material listo para usar (`palette.js` `s(g,b)` → `autoStart` si `designReady`).

**Total ≈ 6–8 clics, 2–3 ventanas.** Valor positivo: miniatura real y SKM archivado por hash.

**PS, reutilizar en otro modelo:** Pintar → mosaico → **error** → "…" → Administrar (abre la ventana de 1440×920 y cierra la paleta, `offline.rb:356-362`) → buscar la ficha → Instalar → confirmar → reabrir Pintar → mosaico. **≈ 7 clics más y 2 ventanas** cada vez. **Esta es la fricción principal.**

**PS, desde SKM:** biblioteca → Importar ZIP/carpeta/SKM → vista previa → seleccionar y renombrar si hay conflicto → confirmar (`skm_import.rb:185-212`) → clasificar como placa o canto (`kind='unknown'`) → instalar con confirmación (`offline.rb:501-508`) → Pintar. **≈ 8–10 clics.**

**OCL:** pestaña Materiales → **+** (o **+** en el HUD de la herramienta, `smart_paint_tool.rb:152-169`) → elegir textura (`materials_load_texture_worker.rb`) → nombre, tipo y tamaño → Crear (`materials_create_worker.rb`) → el material queda seleccionado en el pincel (`smart_paint_tool.rb:792-796`). **≈ 5–6 clics.** Para otro modelo: exportar SKM e importarlo, o usar el panel de materiales nativo de SketchUp.

## B. Pintar pieza: 5 piezas y cambio de material

**PS, material ya instalado y válido**
1. Barra → **Pintar**: abre la paleta; si hay un material recordado, intenta activar la herramienta (`offline.rb:103-109`).
2. Clic en el mosaico (si no se reanudó solo) → `smart_quick_start`.
3. 5 clics sobre las piezas (`smart_paint_tool.rb:470-480`). Cada clic es una operación con Undo propio, y hace `make_unique` automático si la pieza está compartida.
4. Cambiar material: clic en otro mosaico de la paleta (`update_options`, sin salir de la herramienta) o ←/→ en el viewport.

**Total: 2 + 5 + 1 clics, 1 ventana flotante** que tapa el modelo (la captura lo muestra). **Latencia por clic: NO VERIFICADA, riesgo alto según el código.**

**PS, material no instalado:** **BLOQUEADO** (captura). Ver `05_CAUSA_PINTADO.md`.

**Fricciones adicionales encontradas en el código**
- Todos los botones de la barra se deshabilitan si la guía o la biblioteca tienen cambios sin guardar (`offline.rb:61-62`), y el pintado se niega por la misma razón (`clean_for_paint!`, `:791-794`). El usuario ve un botón gris sin motivo visible: el motivo aparece solo en la barra de estado.
- Al pintar, la guía queda invalidada y se pide volver a analizar (`offline.rb:743-753`).

**OCL**
1. Barra Tools → **Paint** (`plugin.rb:885-908`).
2. Clic en el material del HUD (o queda el último usado, `@@action_materials`).
3. 5 clics sobre las piezas (`smart_paint_tool.rb:1269-1291`).
4. Clic en otro material del HUD, ←/→, o Alt + clic en una pieza para tomar su material.

**Total: 1 + 1 + 5 + 1 clics, 0 ventanas.** Sin confirmaciones. Aviso visual si la definición está compartida.

## C. Pintar canto

**PS:** Pintar → **Pintar canto** en la paleta (o menú Extensiones → Pintar canto: no está en la barra, `quick_toolbar.rb:146`) → elegir un canto (mismo cerrojo de instalación) → clic sobre la cara estrecha. 1/2/4 cantos con Tab en modo avanzado (`smart_paint_tool.rb:494-510`); en modo inmediato, **Tab no cambia la cantidad** (`:496-498`) y pinta 1 canto (`offline.rb:220`). Los ejes se deducen por espesor mínimo (`native_paint.rb:414-422`). La placa y las otras instancias se preservan (`make_unique`). `validate_edge!` rechaza caras amplias. **NO VERIFICADO.**

**OCL:** Paint → Tab hasta *Paint edges* (o elegir un material de tipo canto, que cambia la acción sola) → Ctrl+Tab para 1/2/4 → clic. Pinta la definición: **todas las instancias** cambian, con aviso. Requiere que la pieza esté tipada como placa.

**Brecha UX:** en modo rápido, PS solo pinta 1 canto por clic. Pintar 4 cantos en 20 piezas son 80 clics, contra 20 en OCL con la opción 4.

## D. Nombres por mueble

**PS:** Barra → **Muebles** (ventana principal 1440×920) → elegir el mueble (grupo padre) → vista previa con todas las piezas hoja, prefijo y base (`names.rb:138-190`) → editar en la lista → Aplicar (una operación, `:261-329`). Bloquea con geometría mixta, compartidas que filtrarían el cambio o más de 500 piezas. Si la guía tiene cambios sin guardar, hay que guardarla antes (`offline.rb:632`). **≈ 4–6 clics + edición. NO VERIFICADO.** Resaltar una pieza en el modelo: `PieceHighlightTool` (`offline.rb:509-524`).

**OCL:** Outliner → editar nombre de instancia o definición (modal), o renombrado masivo de **definiciones** con fórmula y dry-run. No tiene la lógica "prefijo del mueble + base de pieza" ni la sincronización con una guía.

**Valoración:** **ventaja de PS**, que hay que conservar. Mejora posible: editar el nombre directamente en la lista y resaltar al pasar el cursor.

## E. Planos A4

**PS:** Barra → **Planos** → analizar (escaneo) → elegir mueble → modo exterior, interior o ambas → cámaras (yaw/pitch) → ocultar piezas **solo en la vista** (`hiddenPieceIds`) → observaciones → mover cotas → Guardar (y opcionalmente guardar el SKP) → Exportar PDF (exige guía regenerada, `offline.rb:671-675`) → elegir el archivo. **≈ 6–10 clics. NO VERIFICADO:** legibilidad, flechas, que entre en una hoja.

**OCL:** sin guía de armado. Envía piezas a LayOut o exporta dibujos SVG/DXF.

**Valoración:** **ventaja exclusiva de PS.**

## F. Pedido TXT a la maderera

**PS:** Barra → **Maderera** → `order_plan` propone filas por pieza física (`supplier_order.rb:26-34`). Por fila: ejes U/V, cara frontal, placa **aprobada** (SKU, proveedor, espesor, formato y veta, `catalog_store.rb:250-256`), cantos principal/secundario compatibles, mapa 0/1/2, veta y rotación, regla de medida, nota de revisión ≥ 8 caracteres y **4 confirmaciones** (`supplier_order.rb:66-103`) → Guardar → Exportar → elegir carpeta → **un TXT por lote** (placa+espesor+cantos) + `manifest.json` (`:139-175`).

Formato verificado en código: 9 columnas en el orden exigido, tabulado, CRLF, cantos 0/1/2, `rota` 0/1, hasta 3 decimales. **NO VERIFICADO con el importador del proveedor.**

**Fricción:** en un mueble de 20 piezas, el mínimo es **20 × (4 confirmaciones + nota + ejes)**. Es seguro pero lento. Los valores ya deducibles del modelo (ejes por espesor, cantos observados en caras pintadas, material de la placa por vínculo) deberían venir **pre-completados y confirmarse en bloque**, dejando la confirmación individual solo para filas con ambigüedad.

**OCL:** cutlist → Exportar → TSV o CSV con columnas por fórmula. Se podría armar un formato parecido, **pero sin lotes ni validaciones del proveedor**.

## Conclusión UX

1. **El cuello de botella es el pintado (A+B):** el material visible no es el pintable, la paleta es una ventana web aparte y el clic tiene un costo alto. Esto concentra la mayor parte de la fricción diaria.
2. **D, E y F son diferenciales de PS** y se mantienen. Su mejora es de flujo (pre-completar y confirmar en bloque), no de arquitectura.
3. Lo que hay que **adoptar de OCL como patrón**: HUD en el viewport, `model.materials` como fuente de verdad del pincel, cambio de acción y material con el teclado sin salir, cuentagotas temporal con Alt, y aviso en lugar de bloqueo cuando no hay riesgo real.
