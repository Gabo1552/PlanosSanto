# Contrato de materiales, caras y pintado

## Catálogo permanente

- Reusar el `CatalogStore` local existente: ítems aprobados con nombre, SKU, proveedor, `kind`, espesor, formato y veta, cantos compatibles, precio (si el encargado lo registra), favoritos y revisiones.
- Distinguir **material comercial** del catálogo de **material nativo** `Sketchup::Material`; asociarlos mediante ID interno estable y mapeo verificable. Si se cambia la visual de un material, no pisar uno que ya usan otros componentes sin confirmar alcance.
- Material no registrado o con información incompleta → estado **PENDIENTE**, no reemplazarlo por un material supuestamente equivalente.
- Bibliotecas `.skm` o texturas del taller pueden incorporarse si están disponibles legalmente. No inventar texturas ni precios; no copiar recursos privados a servidores.

## Selección y pintado

1. Seleccionar mueble o pieza concreta. Identificar ruta de instancia completa y `persistent_id`.
2. Mostrar caras candidatas y la selección real del operador. La geometría de la cara debe cumplir el alcance de clasificación; si no se puede identificar de manera fiable, exigir selección manual de `Sketchup::Face`.
3. Vista previa: nombre/código del material, caras objetivo resaltadas, número de instancias afectadas y advertencias por definición compartida.
4. Aplicar solo tras confirmación; operación única reversible por Undo; escribir material real en SketchUp y metadatos propios solo para resolver catálogo y lado.
5. Si una misma definición se usa en dos muebles, jamás modificar ambas sin explicitarlo. `make_unique` únicamente con consentimiento y prueba de conservación geométrica.
6. Cancelar/abrir preview no modifica el SKP ni el catálogo. Guardado/cierre/reapertura deben restituir vinculación y colores de cara.

## Geometría y orientación

- Los cuatro lados `arr`, `aba`, `izq`, `der` están en un **plano de referencia de corte** que debe ser explícito. No dependen de la rotación de cámara en la guía A4.
- `base`, `altura`, `espesor` y cara estrecha no deben deducirse siempre ordenando medidas. Considerar transformaciones del componente, espejados y veta.
- Canto aplicado a una cara específica tiene que aparecer al revisar la pieza y sobrevivir a una eventual conversión a TXT.
- Si la orientación no puede resolverse sin asumir, marcar **requiere revisión**; nunca asignar automáticamente códigos 1/2.
- Los cantos principales y secundarios corresponden a materiales escogidos en el lote del proveedor; relación con tipo de canto del catálogo revisada explícitamente.
- Pintado nuevo Planos Santo y cantos OpenCutList antiguos deben coexistir. Los atributos `ladb_opencutlist` son solo de lectura. Si los dos sistemas discrepan para una cara, no elegir silenciosamente: informar conflicto y bloquear exportación hasta resolver.

## Matriz mínima automatizable (antes de SketchUp real)

- Catálogo vacío, poblado, conflictos de SKU/nombre, compatibilidades invalidas, migración y precio ausente.
- Caras con material frontal y posterior diferentes, piezas repetidas, agrupación anidada, 90° de rotación, transformaciones espejadas, piezas con 1/2/4 cantos.
- Una definición compartida en dos muebles: vista previa correcta y sin efecto lateral; prueba de operación abortada; prueba de Undo si hay entorno nativo disponible.
- Cambiar cámara A4: mismo mapa de cantos y mismas medidas de proveedor.
- Un canto OCL heredado + un canto nativo PS: coexistencia sin borrar ni inventar prioridad.
