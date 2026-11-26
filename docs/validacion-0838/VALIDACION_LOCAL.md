# Comprobación local de 0.8.38

1. Instalá `dist/PlanosSanto-0.8.38-candidata.rbz` y reiniciá SketchUp.
2. **Trabajá sobre copias:** esta versión escribe nombres en el modelo.
3. Siguen vigentes los pasos de 0.8.37: herrajes en 3D.

## Nombre en el campo «Definición»

1. **Componente.**
   - En una copia, nombrá las piezas (obra y módulo, por ejemplo HS y M2) y guardá con «Sincronizar nombres de grupos y piezas en SketchUp».
   - Elegí un componente: en Info. de entidad, «Definición» dice el nombre completo («HS M2 Reg tapa B») y «Instancia» también.
2. **OpenCutList.** Generá el listado: las piezas aparecen con esos nombres.
3. **Copias iguales.** Dos copias del mismo componente con el mismo nombre comparten la definición nombrada.
4. **Copias con nombres distintos.**
   - Dos copias del mismo componente con nombres distintos: la definición no cambia y la fila muestra el aviso.
   - Hacé única una de las copias en SketchUp, analizá y guardá otra vez: ahora cada una toma su nombre.
5. **Nombre repetido.** Si otra definición ya se llama igual, la fila lo avisa y la definición no cambia.
6. **Grupos.** Una pieza que es grupo se nombra como antes (campo «Nombre»).
7. **Deshacer.** Ctrl+Z después de guardar vuelve los nombres de las instancias y de las definiciones.

## Regresión

- Nombres de mueble y de pieza en Muebles, Piezas, CSV, A4 y paquete de obra: iguales que en 0.8.37.
- Herrajes en 3D (0.8.37): sin cambios.
