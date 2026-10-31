# Candidata 0.8.30 — tope de muebles por guía: de 100 a 500

Base: 0.8.29 (`5a12a45`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Qué había

Un tope fijo de **100 muebles** (grupos o componentes marcados como mueble), repetido en cinco lugares:

- la exportación del modelo: «Elegí entre 1 y 100 muebles.»;
- el guardado de la guía: «La guía supera 100 muebles guardados.»;
- tres esquemas de datos compartidos (`lib/model.ts`): muebles exportados, selección y ediciones.

El número era arbitrario. Los límites que protegen de verdad son otros dos, y no cambian:

- **200.000 vértices o triángulos** en total de la geometría escaneada;
- **5 MB** para la guía guardada.

## Cambio

- Una sola constante `MAX_FURNITURE = 500` en Ruby (`GuideStore`, exportador) y en TypeScript (`lib/model.ts`). Los mensajes de error la usan.
- 500 coincide con el tope de piezas por mueble que ya existía.
- Con muchos muebles grandes se puede llegar antes al límite de geometría o de tamaño. En ese caso la extensión avisa con su mensaje; no falla en silencio.

## Pruebas nuevas

- Una guía con 150 muebles se guarda (`guide_store_coverage_test.rb`).
- La exportación acepta 101 muebles y rechaza 501 con el mensaje nuevo (`sketchup/test/exporter_test.rb`).
- Los esquemas aceptan 150 y 500 muebles, y rechazan 501 (`tests/furniture-limit.test.ts`).

## Se conserva

- Todo lo de 0.8.29: A4 agrupado, «Notas del armador», frente oculto en nombres, Maderera sin guardar, vetas, Dibujar pieza y preparación para SketchUp 2022.
- El formato de la guía no cambia: una guía de 0.8.29 abre igual.

## Límites

- **Compatibilidad hacia atrás:** una guía con más de 100 muebles guardada con 0.8.30 **no abre en 0.8.29 o anteriores**, que rechazan la guía entera.
- **Rendimiento:** no se midió en SketchUp real con más de 100 muebles. El escaneo, la vista 3D y el A4 por lote pueden tardar más.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
