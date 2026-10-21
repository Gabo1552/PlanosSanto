# Arquitectura verificada del RBZ de referencia 0.7.3

Se inspeccionó **el archivo real** `referencias/PlanosSanto-0.7.3.rbz` (hash SHA-256 `883366c79b65468fd1c64b2ca334715df0f382f2f6b1478ce02f88047b84557b`). El manifiesto lista 19 archivos, target SketchUp 2026 Windows, versión 0.7.3.

**Puntos de extensión actuales:**

| Archivo | Responsabilidad observada | Qué hacer |
|---|---|---|
| `planos_santo/catalog_store.rb` | Biblioteca persistente `catalog.json` bajo `%LOCALAPPDATA%/PlanosSanto`, versión `schema=1`; tipos `sheet`, `edge`, etc.; SKU, proveedor, dimensiones, veta, compatibilidades, precio y `approved`; revisión y backups | Reutilizar; añadir puente a materiales reales y migración solo si imprescindible. |
| `planos_santo/ocl_reader.rb` | Diagnóstico de materiales y caras en modo lectura; conoce `ladb_opencutlist`; métodos `capture`, `projected_edges`, `verify_edge_mapping` | Conservar compatibilidad; agregar lectura de atributos propios a través de resolvedor independiente. |
| `planos_santo/workshop.rb` | Orquesta catálogo, pedido, comprobación de cantos, `OclGateway.open` para OCL 7.1.0 | Exponer servicio nativo de pintado; no depender de `OclGateway` para nuevas funciones. |
| `planos_santo/offline.rb` | `UI::HtmlDialog` local, protocolo `request` y acciones `catalog_*`, `order_*`, `names_*`, `materials_review`, `pdf` | Agregar `paint_preview`, `paint_apply`, `paint_cancel`, `paint_status`, `catalog_bind` con validación de entradas y modelo activo; adaptar UI. |
| `planos_santo/exporter.rb` | Recorre grupos/componentes y geometría; `instancePath`, `worldTransform`, dimensiones en mm, materiales por cara | Aprovechar rutas de instancia; cuidado con definiciones compartidas y transformaciones no ortogonales. |
| `planos_santo/session.rb` | Revisión de estado del modelo y preparación de guías | Invalidar caché de lectura solo tras pintado confirmado. |
| `planos_santo/supplier_order.rb` | Pedido a proveedor y validaciones de material/canto | Integrar materiales nativos PS sin rebajar requisitos de confirmación ni cambiar las nueve columnas. |
| `planos_santo/ui/app.js` / `.css` | Editor actual, PDF A4 y UI local empaquetada | Extender sin reescribir. La JS distribuida es grande; localizar fuentes originales si están en el proyecto antes de editar el bundle a mano. |
| `planos_santo/names.rb` | Nombre por pieza/grupo | Debe continuar funcionando igual tras el pintado. |
| `planos_santo/guide_store.rb` | Conserva guías, vistas, ocultación, notas y flechas | No modificar salvo compatibilidad probada. |
| `planos_santo/manifest.json` / `release.rb` | Versión e integridad de distribución | Recalcular hashes y versión al empaquetar. |

**Limitaciones confirmadas del punto de partida:** el catálogo permite guardar datos, pero el controlador no expone herramientas nativas para aplicar materiales/cantos a caras reales. La detección del proveedor utiliza la lectura de OpenCutList. No confundir presencia del catálogo con pintado autónomo.

**Detalle a corregir al empaquetar:** `planos_santo.rb` conserva una descripción antigua que menciona PDF A3; la distribución real usa PDF A4. Corregir texto del registro sin cambiar el comportamiento de exportación.

**Importante:** si el proyecto de la nube tiene fuente nueva no incluida en 0.7.3, esa fuente tiene prioridad. Crear diff antes de implementar y adaptar módulos a su versión efectiva.
