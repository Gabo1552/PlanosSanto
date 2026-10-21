# Auditoría de referencia — paquete 0.6.8

Inspección **estática** del `.rbz` original entregado por el usuario (ZIP verificable). No demuestra que la funcionalidad se haya probado en SketchUp.

- `planos_santo/release.rb`, `manifest.json`: manifiesto versión **0.6.8**; declara validación de operador **pendiente**.
- `planos_santo/names.rb` (`NameManager`): inventario y vista previa/aplicación de cambios por mueble y pieza, metadatos y seguridad para definiciones compartidas; **no equivale** a clasificar correctamente todas las piezas sin nombre.
- `planos_santo/p1_diagnostics.rb`: recolección de jerarquía, instancias, transformaciones, caras, materiales y parte de atributos de OpenCutList.
- `planos_santo/ocl_reader.rb` (`OclReader`): lector en **solo lectura**; su interpretación de tipo de material está condicionada a la versión/build concreta de OCL declarada en el código. Los lados 2D aún no quedan confirmados.
- `planos_santo/catalog_store.rb` (`CatalogStore`): catálogo local persistente, validación de registros, compatibilidades, revisión y precios. **Aprovechar**, no recrear.
- `planos_santo/supplier_order.rb` (`SupplierOrder`): propuesta de pedido, validación de confirmaciones, lotes agrupados, TXT tabulado y manifiesto. **Aprovechar**, confirmar mapeo de cantos y coincidencia con el proveedor.
- `planos_santo/workshop.rb`: coordina catálogo y pedidos; `OclGateway` abre herramientas del OpenCutList original (todavía hay dependencia funcional para optimización).
- `planos_santo/exporter.rb`: exportación de mallas y dimensiones; varias medidas se ordenan de mayor a menor; **no adoptar ese orden como orientación final de fabricación**.
- `planos_santo/ui/app.js`, `app.css`, `index.html`: UI local distribuida. `app.js` es grande y probablemente empaquetado; si existe código fuente de la UI en el repositorio, modificar la fuente y recompilar en lugar de parchear ciegamente el bundle.
- El paquete incluye generación PDF y editor local, pero sus pruebas reales son externas a este corpus.

## Criterio de adopción

Hacer primero inventario de código fuente real bajo `/workspace/PlanosSanto`. Si existe una fuente más nueva y comprobada, comparar sin sobrescribir. Si sólo existe el `.rbz`, extraer **a una carpeta de trabajo nueva** y documentar la procedencia. Guardar una copia intacta y documentar cualquier migración.

## Riesgos técnicos explícitos

1. Los nombres `Componente#...` y `Grupo#...` no son semánticos.
2. Las definiciones de componentes pueden compartir geometría entre instancias: modificar el nombre de definición puede renombrar otros muebles.
3. Materiales de caras en SketchUp **no prueban** por sí solos a qué lado del rectángulo 2D corresponden los cantos.
4. Lateral izquierdo/derecho depende de un **frente de referencia** del mueble, que debe poder marcar el encargado.
5. La detección por geometría no debe asumir que todas las piezas son prismas rectangulares ni que las dimensiones ordenadas corresponden a base y altura.
6. Mantener catálogo y atributos de OCL sin tomar decisiones sobre tipos, veta, espesores o precios desconocidos.
7. No hay garantía de que TXT de prueba haya sido aceptado por el portal de la maderera; se precisa validación real.
