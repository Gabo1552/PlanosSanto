# Comprobación local de 0.8.37

1. Instalá `dist/PlanosSanto-0.8.37-candidata.rbz` y reiniciá SketchUp.
2. **Trabajá sobre copias:** esta versión dibuja en el modelo.
3. Siguen vigentes los pasos de 0.8.36: herrajes calculados.

## Herrajes en 3D

1. **Colocar.** En una copia con un bajo mesada de cajones y una alacena o placard con puertas:
   - nombrá «Puerta» y «Fte» (o «Frente cajón»), confirmá el frente y generá;
   - en Piezas, bajo «Herrajes en el modelo», tocá «Colocar en el modelo»;
   - aparece un grupo «Herrajes · <mueble>» por mueble, con la etiqueta «Planos Santo · Herrajes».
2. **Bisagras.**
   - Mirá una puerta desde adentro: las bisagras están en el canto del lado marcado, a 100 mm de arriba y de abajo.
   - La cazoleta está a 22 mm del canto, metida en la puerta.
   - La cantidad sigue la tabla (2100 mm: 5).
3. **Lado.**
   - Cambiá una puerta a «Derecha» y tocá «Volver a colocar en el modelo»: las bisagras pasan al otro canto.
   - Ctrl+Z vuelve al estado anterior.
4. **Correderas.**
   - En cada cajón hay dos rieles pegados a las caras interiores de los laterales, desde detrás del frente hacia el fondo.
   - El largo es el de la lista (bajo mesada de 580 mm: 500).
5. **No toca nada más.** Después de colocar:
   - Piezas, Muebles y el pedido siguen iguales, sin pedir volver a analizar;
   - las piezas no cambiaron de material, nombre ni posición.
6. **Quitar.** «Quitar del modelo» borra los grupos de esos muebles; un Ctrl+Z los vuelve.
   - Después de Ctrl+Z o Ctrl+Y en SketchUp, la línea «Colocados: …» de Piezas se actualiza sola.
   - Muebles no avisa «análisis desactualizado» por colocar, quitar, deshacer o rehacer herrajes.
   - Renombrá la única puerta a otra cosa y generá: la sección sigue y deja quitar los herrajes que quedaron.
7. **Ocultar.** Apagá la etiqueta «Planos Santo · Herrajes»: los herrajes desaparecen y el mueble queda igual.
8. **Mover un mueble.** Movelo, generá y volvé a colocar: los herrajes pasan a la posición nueva y los viejos se borran.
9. **Avisos.** Un cajón con un lateral solo de un lado no lleva correderas y muestra el aviso.

Anotá si las formas o las distancias (22 mm, 100 mm, 30 mm) no se parecen a lo que usa el taller.

## Regresión

- Piezas: lista de herrajes, CSV y paquete de obra como en 0.8.36.
- Análisis y Generar: un modelo con herrajes colocados genera los mismos muebles y piezas que antes.
