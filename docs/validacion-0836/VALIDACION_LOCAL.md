# Comprobación local de 0.8.36

1. Instalá `dist/PlanosSanto-0.8.36-candidata.rbz` y reiniciá SketchUp.
2. Trabajá sobre copias.
3. Siguen vigentes los pasos de 0.8.35: paquete de obra.

## Herrajes calculados

1. **Puertas.** En un modelo con un mueble de puertas, nombrá las puertas «Puerta» (Sugerencias de nombres), generá en Muebles y abrí Piezas. Debajo del resumen aparece «Herrajes según el nombre de las piezas».
   - Una puerta de 700 mm de alto: 2 bisagras. De 1800 mm: 4. De 2100 mm: 5.
   - Un tirador por puerta.
2. **Cajones.** Nombrá los frentes «Frente cajón» o «Fte». Un bajo mesada de 580 mm de profundidad tiene que dar un par de correderas de 500 mm por cajón y un tirador por cajón. Uno de 450 mm, correderas de 400.
3. **Del Caj.** Si el cajón tiene «Fte» y «Del Caj», solo cuenta el «Fte» (no se duplican las correderas).
4. **Fichas.** Creá en Materiales una ficha de tipo Herraje llamada, por ejemplo, «Bisagra cazoleta codo 0», y otra «Corredera telescópica 500». Volvé a Piezas y tocá Generar: las filas toman el nombre y el SKU de la ficha, y el lápiz abre la ficha. Con dos fichas de tirador, marcá una como favorita.
5. **Filtro.** Elegí un mueble sin puertas ni cajones: la sección desaparece.
6. **CSV.** Exportá: al final aparecen las filas «Herraje» con la ficha, la pieza, el mueble y la cantidad.
7. **Paquete de obra.** Exportalo: cada mueble trae `herrajes` con las mismas cantidades que Piezas.
8. **Avisos.** Una puerta de alacena rebatible (más ancha que alta) muestra el aviso de revisar las bisagras.
9. **Reglas.** Anotá cualquier cantidad o largo que no coincida con lo que usa el taller: se ajusta en `HARDWARE_RULES`.

## Regresión

- Piezas: resumen, secciones, CSV, ver en SketchUp, veta y paquete de obra sin cambios en placas y cantos.
- Maderera y optimización: sin cambios (los herrajes no entran en el pedido).
