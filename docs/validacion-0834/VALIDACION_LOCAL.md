# Comprobación local de 0.8.34

1. Respaldá `%LOCALAPPDATA%\PlanosSanto\` antes de instalar: la primera vez que se guarda la biblioteca, se completan los SKU vacíos.
2. Instalá `dist/PlanosSanto-0.8.34-candidata.rbz` y reiniciá SketchUp.
3. Trabajá sobre copias de los modelos.

## SKU automático

1. **Ficha nueva.** En Materiales creá una placa «Melamina Gris» y dejá solo el espesor 18: el SKU dice `MELAMINA-GRIS-18MM` mientras escribís.
2. **Cambios.** Cambiá el espesor a 15 y el nombre a «Melamina Gris Humo»: el SKU queda `MELAMINA-GRIS-HUMO-15MM`.
3. **A mano.** Escribí un SKU propio y guardá. Después cambiá el nombre: el SKU propio no cambia.
4. **Fichas viejas.** Las fichas que no tenían SKU lo muestran al guardar cualquier cambio en la biblioteca, y dejan de figurar como «Incompleta» por falta de SKU.
5. **Vínculos.** En un modelo ya pintado con esas fichas, los materiales siguen listos para pintar, sin «revisar vínculo».
6. **Maderera.** El TXT y el pedido muestran el SKU nuevo.
