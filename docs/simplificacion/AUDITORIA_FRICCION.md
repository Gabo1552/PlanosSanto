# Auditoría de fricción (0.8.15) y decisión de Gabriel

**Decisión (22/10, Gabriel: «Haga»):** se aplican los puntos 1 a 4 de la propuesta:
1. Eliminar los tildes de revisión.
2. Automatizar lo que hoy es un botón.
3. Mantener sólo los controles que evitan un pedido imposible o la pérdida de datos.
4. Vista de piezas al estilo OpenCutList, replicando el comportamiento sin copiar código.

## Inventario (de mayor a menor ahorro de pasos)

| # | Fricción | Dónde | Decisión |
|---|---|---|---|
| 1 | Cinco tildes por pieza: `orientationConfirmed`, `materialConfirmed`, `dimensionsConfirmed`, `edgesConfirmed`, `grainConfirmed` | WorkshopPanel.tsx:29,32,206-208,229; supplier_order.rb:109-110 | ELIMINAR (quedan las reglas físicas) |
| 2 | Cambiar ejes, placa o cantos borra esos tildes | WorkshopPanel.tsx:76,216-227; EdgeReview.tsx:34,41-46 | ELIMINAR |
| 3 | «Proponer pedido desde el modelo» es un paso manual | WorkshopPanel.tsx:92,186; order_proposal.rb:89-114 | AUTOMÁTICO al abrir el pedido |
| 4 | «Confirmar en bloque» y los motivos por los que no se pudo | WorkshopPanel.tsx:93,186-195; order_proposal.rb:121-133,259-285 | ELIMINAR |
| 5 | `edgeResolution` observado/manual, con motivo de 8 caracteres o más | EdgeReview.tsx:45-46; supplier_order.rb:113-116 | ELIMINAR |
| 6 | «Leer cantos de las caras» y «Usar propuesta de los 4 lados» | EdgeReview.tsx:39,44 | AUTOMÁTICO |
| 7 | `reviewNote` de 8 caracteres o más y `dimensionRule` obligatoria | supplier_order.rb:125-126 | ELIMINAR la nota; `dimensionRule` por defecto «terminadas» |
| 8 | Veta: `grainConfirmed` y `grainAxis` tienen que coincidir con la placa | supplier_order.rb:155; WorkshopPanel.tsx:224 | AUTOMÁTICO desde `board.grain` |
| 9 | Motivo obligatorio para excluir una pieza | supplier_order.rb:56; WorkshopPanel.tsx:214 | OPCIONAL |
| 10 | El borrador se descarta si cambian la huella del modelo, la revisión de la biblioteca o el perfil | workshop.rb:147,164-165; supplier_order.rb:51-53 | CORREGIR: cruzar las filas por id y revalidar |
| 11 | «Guardar borrador» manual y `window.confirm` para descartar | WorkshopPanel.tsx:30,56-61,65,81,90; App.tsx:356 | AUTOMÁTICO: autoguardado |
| 12 | Paso 1 «Revisar pedido» y paso 2 «Exportar» | WorkshopPanel.tsx:82,85,184-185 | AUTOMÁTICO: validación en vivo y un solo «Exportar TXT» |
| 13 | Vínculos de cantos del borrador | WorkshopPanel.tsx:196-202; order_proposal.rb:212 | AUTOMÁTICO con el vínculo nativo; selector sólo si no se resuelve |
| 14 | `approved` de las fichas («Datos revisados y aprobados») | WorkshopPanel.tsx:70,173; catalog_store.rb:82-87; supplier_order.rb:78-79,143; MaterialLibraryPanel.tsx:229-231; material_policy.rb:177 | ELIMINAR la casilla y pasar a «ficha completa» calculada: placa con SKU, espesor, formato y veta definida; canto con ancho |
| 15 | Campos `suggested` que bloquean la aprobación | catalog_store.rb:113; CatalogV2Tools.tsx:37 | ELIMINAR |
| 16 | «Cantos compatibles revisados» | WorkshopPanel.tsx:172 | ELIMINAR |
| 17 | El A4 y las etiquetas sólo toman materiales de filas que pasan los tildes | order_references.rb:14,26; workshop.rb:218; App.tsx:435 | AUTOMÁTICO desde lo pintado y la propuesta |
| 18 | Con ediciones, el análisis desactualizado bloquea guardar y exportar | App.tsx:186,241,256,402 | CORREGIR: permitir guardar (la guía va por id) y regenerar al exportar |
| 19 | «Descartar cambios y volver a analizar» | App.tsx:164-169,229 | MANTENER hasta que haya autoguardado |
| 20 | Diálogo «Aplicar renombrado» | App.tsx:277-279; NameBatchPreview.tsx; names.rb:290-293 | ELIMINAR el diálogo; los bloqueos pasan a avisos en la fila |
| 21 | «Confirmé frente y vertical» | NameSuggestions.tsx:19,49,54 | AUTOMÁTICO |
| 22 | Obra y módulo obligatorios; notas huérfanas bloquean | lib/naming.ts:39-41; guide.ts:90; App.tsx:248,261 | AUTOMÁTICO (M01, M02…); notas huérfanas como aviso |
| 23 | «Cambiaste los muebles; pulsá Generar guías» | App.tsx:262 | AUTOMÁTICO |
| 24 | Perfil de maderera: aprobar versión y después «Usar» | maderera_profile.rb:198,203-221; MaderaProfilePanel.tsx:35,55; supplier_order.rb:20 | ELIMINAR la aprobación; alcanza con «Usar» |
| 25 | Pintura avanzada: «Confirmo vínculo», «Autorizar reemplazo», «Verifiqué» | PaintPanel.tsx:73,77; native_paint.rb:305 | ELIMINAR (se deshace con Ctrl+Z) |
| 26 | «Autorizar todas las ocurrencias compartidas» | SmartPaintPalette.tsx:289; offline.rb:380 | ELIMINAR |
| 27 | Confirmaciones de la biblioteca: SKM, archivado, variante, sincronización con OCL | MaterialLibraryPanel.tsx:176,234,237; CatalogV2Tools.tsx:50; material_library.rb:606 | ELIMINAR |
| 28 | «Conozco el tamaño físico de la textura» | PhotoMaterialPanel.tsx:69 | ELIMINAR (los campos quedan opcionales) |
| 29 | «Permitir hoja 2: despiece completo» | GuideViews.tsx:56; pdf.ts:360 | AUTOMÁTICO |

**Se mantienen** (evitan un pedido imposible o la pérdida de datos):
- canto más angosto que el espesor;
- espesor distinto del eje;
- la pieza no entra en la placa;
- girar una placa con veta o con cantos asimétricos;
- pieza no rectangular;
- más de dos cantos por pieza;
- detalle de más de 80 caracteres o código repetido;
- reemplazar la textura de una foto;
- aviso de renumerar códigos;
- aviso al cerrar con cambios sin guardar.

## 4. Vista de piezas al estilo OpenCutList

Una pestaña «Piezas» con todos los muebles generados, agrupada en secciones plegables por **material y espesor**.

- **Columnas:** Código, Nombre, Cant., Largo, Ancho, Esp., Arr, Aba, Izq, Der, Veta e Incluir.
- **Cantos:** chips con el SKU en cada lado y un menú al hacer clic.
- **Edición en línea:** se guarda sola, sin tildes.
- **Selección:** clic en una fila resalta la pieza en SketchUp.
- **Pie de sección:** m², metros de canto por SKU y costo.
- **Filtros:** por mueble y «con problemas».
- **Acciones:** «Exportar TXT», «A4» y «Etiquetas».

**Datos existentes que la alimentan:**
- `pieceRows`, `identicalGroups` y `pieceCodeMap` (lib/pieceGroups.ts);
- `faceMaterials` y `node.material` del scan;
- `OclReader` (candidatos de placa y canto, vínculo nativo);
- `OrderProposal#stage` y `#patch`;
- la clave de lote de `OrderReferences`;
- `edgeTotals` y `estimate`.
