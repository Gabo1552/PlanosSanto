# Arquitectura y puntos de integración de 0.8.4

Antes de programar, leer el fuente ACTUAL del repositorio y comparar con RBZ de referencia.

| Componente actual | Uso propuesto |
|---|---|
| `catalog_store.rb` | Mantener IDs y schema existentes; estado `diseño` vs `maderera` sin romper migración/backups. |
| `material_library.rb` | Una fuente de verdad entre visual archivado, `Sketchup::Material`, textura, miniatura y estado. |
| `skm_import.rb` | Preservar importación de `.skm`; no abusar de él para fingir creación desde JPG. |
| `offline.rb` | Comando nuevo `material_photo_pick` invocado desde diálogo; picker Ruby local + guardas de modelo activo. |
| `smart_paint.rb`, `native_paint.rb` | Reutilizar motor y operaciones existentes; permitir material `listo para diseño` sin habilitar pedido. |
| `smart_paint_tool.rb`, `material_sample_tool.rb` | Herramienta activa sin formularios por cada clic, preview/contexto, atajos y Undo. |
| `quick_toolbar.rb` | Acción directa ya implementada: reducir ventana previa, marcar estado real; iconos propios. |
| `ui/app.js`, `ui/app.css` | Modificar fuentes React/TSX del repositorio y recompilar; no editar minificado de RBZ como fuente permanente. |
| `supplier_order.rb`, `workshop.rb` | Mantener TXT 9 campos y validación de material/espesor/cantos para maderera. |
| `guide_store.rb`, `exporter.rb` | Prueba de no regresión en A4 y flechas. |

## Protocolo entre HtmlDialog y Ruby

1. JS solicita abrir imagen a Ruby con una acción nueva. Sólo Ruby lanza `UI.openpanel` y valida archivo (y no repite acciones con un modelo distinto).
2. Ruby devuelve a JS *metadatos seguros y un preview de tamaño limitado*; nunca acepta rutas de archivo arbitrarias para crear un material desde JS.
3. JS presenta vista previa y campos básicos. Ruby crea material dentro de `model.start_operation`, registra vinculación al catálogo y copia `.skm`, y devuelve ID/model revision.
4. Si falla: deshacer operación y no dejar el catálogo apuntando a material corrupto ni archivos sobrescritos. Guardar progreso y evidencia del error.
5. Nuevo material queda como material activo en la herramienta; un clic sobre la pieza pinta mediante el motor actual.
6. Si no hay acceso al archivo original en futuros modelos, biblioteca `.skm` resuelve la reimportación.

## Modos de pintar y separación de permisos

- `Draft for design` debe funcionar aunque falten proveedor/código/precio, con una marca visual clara.
- `Supplier ready` sólo cuando ficha y orientación/cantos estén confirmados. Mantener bloqueo de exportación.
- No mutar un `Sketchup::Material` compartido en varios muebles sin advertir consecuencias. Diferenciar pintado de instancia y pintado de cara/definición.
- Ninguna foto de material debe alterar el tamaño físico de una pieza; tamaño de textura y placa son conceptos distintos.

## Rediseño incremental

Hacer cambios controlados por sección y añadir pruebas antes de sustituir rutas. El diseño final se debe sentir coherente dentro de SketchUp, evitar modales y no bloquear el viewport, aunque UI::HtmlDialog no tenga la capacidad de inyectarse literalmente en el área 3D como HTML. Donde convenga, usar `Sketchup::Tool#draw` para hover/feedback y un diálogo compacto independiente para la galería.
