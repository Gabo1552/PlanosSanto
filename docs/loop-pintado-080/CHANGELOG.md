# Planos Santo0.8.0 — Pintura Inteligente

- Paleta reutilizable con búsqueda/favoritos y muestras del material real del catálogo existente. Se recuerdan modo, material comercial y ajustes; permisos y UUID de otro proyecto no se reutilizan automáticamente.
- Herramienta nativa PickHelper: señalar una cara en SketchUp la resalta; la paleta muestra pieza, cara, lado y rutas afectadas. Paleta compacta para dejar espacio al modelo.
- Cuatro modos: placas, cantos, quitar cantos y reemplazar el material exacto de origen.
- Clic aplica; Mayús agrega caras y Enter aplica todo el lote. Las caras pendientes quedan resaltadas. Cada aplicación/lote utiliza una sola operación Undo y se revierte entero ante error.
- Quitar cantos restaura una placa aprobada unívoca o elegida explícitamente; nunca borra materiales desconocidos ni pone nil para adivinar una herencia.
- Reemplazo por UUID exacto del mismo tipo; no cambia todas las superficies del modelo por similitud de nombre/color.
- Alcance compartido explícito; hacer única solo cuando se puede aislar con seguridad. Hover, selección y cancelación no modifican materiales ni geometría.
- Mapeo UV afín conservado con API pública y escala física; bloquea texturas proyectadas/distorsionadas o API que no permita comprobarlo. No adivina orientación industrial de veta.
- Se mantienen el pintado por caras anterior, biblioteca SKM, compatibilidad de lectura OCL, PDF A4, cotas, cámaras, nombres, notas y TXT. Sin optimizador ni presupuestos nuevos.

## Datos y reversión

No se cambia schema1 de catálogo/activos/guías. Preferencias ligeras se guardan en SketchUp mediante write_default solo al activar explícitamente. Pintar no guarda el SKP automáticamente.

Cerrar todas las ventanas de SketchUp para actualizar. Conservar copias del modelo y biblioteca. Las candidatas0.7.4/0.7.5 siguen intactas; para volver, cerrar SketchUp y reinstalar la anterior. Undo revierte una aplicación o lote; no es un respaldo del archivo.

La nueva0.8.0 necesita validación nativa propia. Los35 controles reales de0.7.4 no se cuentan como pruebas de esta candidata.
