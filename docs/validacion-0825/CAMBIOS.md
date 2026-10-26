# Candidata 0.8.25 · interfaz del taller

Guardar guía y Exportar PDF A4 quedan en la cabecera. Se elimina la fila antigua de botones. Las herramientas específicas se encuentran en Materiales → Más herramientas de materiales:

| Acceso anterior | Dónde queda / función conservada |
|---|---|
| Biblioteca del taller | La biblioteca principal sigue en Materiales. «Compatibilidades y variantes» conserva asociaciones de cantos, variantes e importación/exportación de copias. |
| Materiales y cantos | «Informe de materiales y cantos» conserva la inspección de atributos, caras y materiales observados, y el informe local de solo lectura. Es distinto de «En este modelo», que crea/vincula fichas. |
| Pintar placas y cantos | Pintar inicia la herramienta de la barra rápida en SketchUp. «Asignar materiales por caras» conserva la vista previa y el alcance del pintado por caras. |
| Pintura avanzada | «Ajustes avanzados de pintura» conserva sus opciones. La paleta también sigue en Extensiones → Planos Santo → Paleta de pintura. |
| Guardar y cerrar | Opciones de guardado, junto a Guardar guía. |

El balde de la barra rápida reúne placas y cantos: el modo se elige en la tira de la vista 3D. Se retira el acceso independiente a canto de esa barra, pero sigue en el menú. Se incorpora «Crear componente», que abre el diálogo nativo de SketchUp con la selección actual. Los iconos son dibujos propios; no se copian recursos de OpenCutList.

Materiales admite **Herraje**: grupo y filtro propios, precio por unidad y sin exigir formato, veta o espesores de corte. También reconoce el tipo 5 de OpenCutList al crear/importar fichas. La vinculación conserva el material nativo y sus texturas. Los herrajes se identifican en Piezas y no reciben un acceso a optimización de placas. El formato del catálogo sigue en v4; una biblioteca que contenga herrajes requiere esta versión o una posterior para reconocer ese tipo.

Sugerencias de nombres separa frente y revisión, añade búsqueda por código/nombre/posición y muestra la confianza de cada propuesta. Los ejes manuales están en un desplegable; confirmar y cancelar permanecen al pie mientras se recorre la lista. Se conserva el guardado de nombres y las revisiones geométricas existentes.

Desde Piezas → resumen del material → **Ver optimización** se abre Maderera en ese material y espesor. Maderera permite buscar materiales/SKU, recorrer distribuciones de placas, ajustar o ampliar el dibujo y localizar una pieza de la leyenda en SketchUp. El modo Ajustar muestra toda la placa dentro del alto disponible. El cálculo Experto de 0.8.24 se conserva.

## Decisión sobre A4

Se mantiene la maquetación horizontal. En la composición actual hay 177 mm para una vista, o dos vistas de 86 mm, y 99 mm para el listado. El nombre dispone de 35 mm y las medidas se mantienen en 8 pt.

Se ensayó reducir 10 mm el nombre/listado y cederlos al dibujo. Cada vista doble pasa de 86 a 91 mm (+5,8 %). En el caso sintético de 16 piezas con nombres largos, el listado crece de 132,64 a 146,76 mm de alto, supera los 139 mm disponibles y necesita otra hoja. Los nombres cortos no presentan esa penalización. La ganancia depende del mueble y no justifica cambiar globalmente la hoja.

En vertical, conservar el listado lateral deja aproximadamente 90 mm para los dibujos en total, frente a los 177 mm actuales. Apilar el listado debajo recuperaría ancho, pero el alto de las vistas pasaría a depender de la cantidad y longitud de las filas. No se implementó un cambio de orientación ni una redistribución automática sin una mejora consistente. El modo existente de una sola vista sigue disponible cuando se necesita priorizar el tamaño del dibujo.

La comparación reproducible está en `comparar-a4.mjs` y `COMPARACION-A4.json`; `A4-referencia.pdf` es un ejemplo sintético. Los cambios experimentales solo se aplican a un módulo temporal en memoria/disco de trabajo: **el renderizador del producto no se modifica**.

## Alcance de la comprobación

Pruebas automatizadas con Chromium y dobles Ruby de la API de SketchUp. Las capturas de `ux/` son sintéticas. No se ejecutó SketchUp 2026 Windows: la activación visual del balde, la tira nativa y el diálogo Crear componente se deben comprobar allí. Los límites comerciales del motor 0.8.24 siguen vigentes.
