# Ficha permanente desde material nativo

`ModelMaterialCatalog` permite revisar un material presente en SketchUp y crear su ficha sin pintar ninguna superficie. No cambia su nombre nativo, textura, escala, color, caras, UV ni atributos de OpenCutList. El nuevo nombre pertenece solamente a la ficha de Planos Santo.

## Contrato

```ruby
service = PlanosSanto::ModelMaterialCatalog.new(model,
  catalog: store, directory: local_library_directory,
  guard: -> { model_is_still_active_and_no_pending_edits })
preview = service.preview(native_material_entity_id.to_s)
service.commit(preview.slice('token', 'revision', 'assetRevision', 'item'))
service.cancel(preview['token'])
service.thumbnails # {catalog_id => bounded_data_uri}
```

Preview devuelve `token`, `revision`, `assetRevision`, `materialId`, `item`, `thumbnail`, `color`, `hasTexture` y `warnings`. Una asociación válida existente devuelve `existingCatalogId` para abrir su ficha y evitar otra creación.

La vista previa no modifica el modelo ni la biblioteca. Lee atributos reconocidos `ladb_opencutlist` sin requerir OpenCutList instalado: placas tipo 2, cantos tipo 4, espesores, formatos, anchos y veta. Solo interpreta medidas métricas explícitas; números sin unidad, formatos múltiples y datos ambiguos quedan vacíos. Si no conoce el tipo, devuelve `unknown` y exige elegir placa/canto antes de guardar. La escala de textura no se utiliza como medida comercial de placa.

`commit` admite edición de nombre, tipo, SKU, proveedor, medidas/listas, veta y notas. Identidad, procedencia y atributos internos se generan en Ruby. Comprueba revisiones de catálogo y activos, token de diez minutos, identidad del objeto nativo y su estado desde la vista previa. Cuando hubo miniatura válida, regenera y compara su SHA-256 antes de escribir, para detectar cambios visuales con el mismo nombre/ruta/escala. Si no puede verificarla, solicita volver a abrir la ficha. Reutiliza los locks, archivado SKM, operación nativa y publicación del catálogo existentes.

El guard del controlador debe comprobar identidad/generación del modelo activo y cambios pendientes. Se invoca antes de previsualizar, antes de guardar, dentro de los locks y después de publicar antes del commit nativo.

## Persistencia y Deshacer

El mismo material recibe únicamente su vínculo Planos Santo. Su SKM se archiva y verifica por hash para reutilizarlo en otros proyectos. No se carga un material sustituto, no se reasignan caras y no se escribe OpenCutList. Deshacer revierte el vínculo del modelo; la ficha y el SKM permanecen en la biblioteca permanente. En caso de fallo durante la operación se restauran catálogo/índice/vínculo y se eliminan los activos nuevos de esa operación solo después de comprobar la restauración. Si falla también la recuperación de catálogo/índice/modelo, se conservan los SKM y se informa explícitamente que hace falta recuperar la biblioteca; no se oculta como un guardado correcto.

Las miniaturas se recuperan del SKM archivado con el lector ZIP acotado existente, hash verificado, caché y presupuesto de datos. Nunca se comunica al navegador la ruta de la textura original. Un fallo de miniatura no impide archivar la apariencia nativa; se informa en la revisión.

## Evidencia automatizada

`LANG=C.UTF-8 /workspace/.tools/ruby/bin/ruby sketchup_offline/test/model_material_catalog_test.rb`

Resultado: **19 pruebas, 124 aserciones, cero fallos**. Dobles de API, no SketchUp real. Cobertura: lectura OCL sin plugin, unidades ambiguas, edición de faltantes, mismo objeto/textura, geometría y atributos conservados, Undo, cantos, asociación existente, token y revisiones obsoletas, cambio/remoción de material, guard, fallos de SKM/commit/índice, campos protegidos, cancelación y miniatura después de recrear el servicio.

Pendiente nativo Windows: material OCL real, formato con unidades de la instalación, miniatura/SKM nativos, mapeos UV de caras, guardar/reabrir, Undo y reutilización en un segundo modelo.

Integración `controller_model_material_test.rb`: **5 pruebas / 50 aserciones**, contra el build de la candidata, con servicio real y dobles de API. Regresión `material_library_test.rb`: **33 pruebas / 283 aserciones**. La integración se repitió en el build final con las correcciones de huella visual y recuperación secundaria.
