# Comprobación local de 0.8.31

1. Instalá `dist/PlanosSanto-0.8.31-candidata.rbz` y reiniciá SketchUp.
2. Trabajá sobre **copias** de modelos y de la biblioteca (`%LOCALAPPDATA%\PlanosSanto\`).
3. Los pasos de 0.8.26 a 0.8.30 siguen vigentes.

## Cotas

1. **Totales por defecto.** Abrí un mueble con frente marcado. En Planos y en el A4 tienen que aparecer solo alto, ancho y profundidad totales, por fuera del dibujo. Medilos con la cinta de SketchUp: tienen que coincidir.
2. **Mueble rotado.** Repetí con un mueble girado en planta y con uno dentro de un grupo anidado o espejado.
3. **Cotas de pieza.** Activá una cota de pieza desde los controles: se dibuja. Con «Solo medidas totales» vuelve al default, y con «Mostrar todas las cotas» aparecen todas.
4. **Ocultar y mover.** Hacé clic sobre una total para ocultarla. Con «Mover cotas» llevala a otro lugar y guardá la guía. Cerrá y reabrí el modelo: se mantiene.
5. **Dos vistas.** Exportá el A4 con dos vistas: las totales van en la exterior. Anotá si el taller quiere cotas en la interior.
6. **Guía vieja.** Abrí una guía de 0.8.30 que tenía cotas de pieza: ahora se ven solo las totales y las de pieza se pueden volver a activar.

## Materiales del proyecto

1. **Elegir.** En Materiales, marcá «Usar en este proyecto» en dos placas y un canto. Quedan arriba, en «En este proyecto», y «Biblioteca del taller» se pliega.
2. **Pintar.** Abrí la paleta y la barra rápida: solo aparecen esos materiales. El resto está plegado en «Otros de la biblioteca».
3. **Sumar desde «Otros».** Pintá con un material de «Otros»: se suma al proyecto y avisa.
4. **Deshacer.** Ctrl+Z deshace el último cambio de la lista, y Materiales y la paleta se actualizan.
5. **Guardar y reabrir.** Guardá el SKP, cerralo y reabrilo: la lista sigue. Abrí otro SKP: tiene su propia lista.
6. **SKP viejo.** Un modelo ya pintado muestra en la paleta los materiales que ya usa, sin elegir nada.
7. **Regresión.** Gotero, reanudar la pintura, «Quitar canto» y materiales que necesitan atención funcionan como en 0.8.30.
