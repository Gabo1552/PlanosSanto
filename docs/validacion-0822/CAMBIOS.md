# Candidata 0.8.22 · Optimización y marca Santo Carpintero

Maderera abre ahora un resumen de los materiales y espesores del proyecto. Al elegir una tarjeta se ven solamente sus placas, piezas, cantos y TXT; se puede volver al resumen con el foco conservado.

- **Experto:** implementación de la referencia 405 proporcionada. Sierra de 4,4 mm, refilado de 10 mm total por eje, mínimo 50 mm, orden por área y primer encaje con profundidad limitada. Las medidas de placa vienen de su ficha, sin asumir Faplac/Egger. Informa recorrido y pasos estimados de sierra, y cantos con 15% de margen de compra. El TXT conserva las nueve columnas y medidas nominales. No se afirma paridad general con el proveedor.
- **General:** motor propio independiente, basado en criterios generales de guillotina de OpenCutList. Se conserva el motor existente, con ajustes de sierra/refilado/giro. No requiere OpenCutList ni incorpora su código GPL. Se contrastaron seis casos sintéticos con el motor público externo; no se garantiza igualdad de diagramas.
- **Consistencia:** el método se recuerda en esta computadora; cambiarlo exige nueva validación Ruby antes de exportar. Experto permite giro automático de placas sin veta, conserva los lados físicos de canto y bloquea piezas fuera del mínimo o del formato útil. General conserva la restricción previa para cantos asimétricos.
- **Interfaz:** logo original y azul noche #000028/blanco de la empresa, foco visible, estados legibles, aviso de cantidades parciales y piezas fuera del cálculo. Se mantiene el logo anterior del PDF para no cambiar su composición.

## Conservado

Pintura, biblioteca, medidas originales, cantos, nombres, guías A4, cámaras, notas y flechas. No se agregan precios, presupuestos ni optimización de formas no rectangulares. No se incluyeron modelos, SKM ni texturas privadas.

## Límites y pendientes

- Instalación, apariencia y operación reales en SketchUp 2026 pendientes de Codex local/Dot.
- Importación comercial del TXT Experto y comparación de varios pedidos reales pendientes, en especial giro con cantos asimétricos y orientación industrial.
- La veta está determinada por la ficha del material. No hay una excepción nueva de veta forzada individual para una pieza de material liso; marcar material con veta mantiene todas sus piezas sin girar. No se declara soportada esa variante del documento de referencia.
- General puede mostrar un cálculo parcial cuando hay piezas fuera de formato, comportamiento anterior conservado y señalado en el resumen. Experto bloquea el cálculo completo del material ante un rechazo.
- No se añaden ni alteran geometría, nombres o medidas para optimizar. Los diagramas son una estimación de compra/corte, no una orden CNC.

Ver `RESULTADOS.json`, `PROGRESO.md`, `EXPERTO.md`, `GENERAL.md`, `CONTRATO_EXPERTO_TXT.md` y `ux/REVISION-UX.md`.
