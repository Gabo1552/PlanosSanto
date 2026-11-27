# Comprobación local de 0.8.39

1. Instalá `dist/PlanosSanto-0.8.39-candidata.rbz` y reiniciá SketchUp.
2. Trabajá sobre copias.
3. Siguen vigentes los pasos de 0.8.37 y 0.8.38.

## Herrajes por la forma

1. **Sugerencias.**
   - En una copia, dejá una puerta y un frente de cajón con nombres que no digan Puerta ni Fte (por ejemplo «Pieza 7»).
   - Confirmá el frente del mueble en Sugerencias de nombres y generá.
   - En Piezas, «Sugeridos por la forma» las muestra con sus medidas y lo que parecen.
2. **Sumar.** «Sumar como puerta»: aparecen sus bisagras y su tirador en la lista, y la pieza pasa a «Elegidos en Piezas».
3. **Cambiar.** Para una pieza sugerida como frente de cajón que en realidad es una puerta, usá «Es puerta».
4. **Descartar.** «No lleva herrajes» en un revestimiento: deja de sugerirse.
5. **Quitar la elección.** En «Elegidos en Piezas», «Quitar la elección» la devuelve a lo que diga su nombre.
6. **Deshacer.** Ctrl+Z en SketchUp después de elegir: Piezas vuelve a mostrar la sugerencia.
7. **Se guarda.** Guardá el SKP, cerralo y abrilo: lo elegido sigue.
8. **En todo lo demás.** Lo elegido aparece en el CSV, en el paquete de obra y al colocar herrajes en 3D (bisagras en la pieza elegida).
9. **Sin frente confirmado.** En un mueble sin frente confirmado no hay sugerencias y se avisa qué confirmar.

## Regresión

- Herrajes por nombre, CSV, paquete de obra y herrajes en 3D, iguales que en 0.8.38 cuando no se elige nada.
- Muebles no avisa «análisis desactualizado» por elegir herrajes.
