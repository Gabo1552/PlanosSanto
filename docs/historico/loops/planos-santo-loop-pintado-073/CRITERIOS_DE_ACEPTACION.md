# Criterios de salida del loop de desarrollo

El agente solo puede marcar **`ready_for_sketchup`** (lista para pruebas, NO aprobada) si demuestra todo lo siguiente:

1. Código fuente comparado contra la rama efectiva y la referencia 0.7.3, sin sobrescrituras del trabajo del Codex en la nube.
2. Biblioteca global persistente accesible desde la UI local. Los materiales de placa y canto seleccionables se vinculan con un `Sketchup::Material` conocido o tienen una vía explícita de asociación/instalación, sin inventar texturas.
3. Interacción nativa de **previsualizar** y **aplicar** pintado de placa y canto, con selección precisa de la instancia/cara; cancelar y previsualizar son de solo lectura.
4. Se informa y confirma el efecto sobre instancias compartidas y anidadas; no se alteran otras piezas silenciosamente.
5. Se puede deshacer cada operación de pintado en SketchUp. El catálogo no pierde revisiones ni datos existentes.
6. La lectura de los nuevos cantos funciona sin carga de OpenCutList; la compatibilidad de lecturas previas OCL permanece disponible.
7. Revisión de piezas y `SupplierOrder` reconocen el pintado nuevo y mantienen bloqueo ante material/canto/orientación inciertos.
8. No se modifican las nueve columnas TXT ni su orden, y se conservan pruebas del formato.
9. Sin regresiones conocidas en nombres, materiales existentes, guías PDF A4 con una/dos vistas y notas.
10. Paquete `.rbz` candidato generado con nueva versión y hashes verificados, archivo `reports/IMPLEMENTACION_LISTA.md` (comandos, salida, fallos) y documento de validación local actualizado.

**Pruebas requeridas antes de salida:** al menos Ruby `-c` para nuevos `.rb`, JavaScript `--check` para JS fuente/bundle si está disponible, suite Ruby mock o nativa parcial, pruebas unitarias del catálogo/conversión, validador de TXT y auditoría del RBZ. Las pruebas no ejecutables deben marcarse con causa y no usarse como prueba aprobada.

**Fuera de criterio ahora:** pruebas visuales en SketchUp real, aprobación por el encargado, aceptación del TXT por la maderera, comparación completa de optimizaciones de OpenCutList. Van al siguiente hito.
