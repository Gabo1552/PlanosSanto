# Planos Santo 0.8.18 — listado de piezas y nitidez

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

Responde a lo que Gabriel pidió sobre la 0.8.17: que no se vea tan pixelado y que la vista de piezas se parezca al «Listado de partes» de OpenCutList. Replica la estética y el comportamiento escribiendo de cero, sin copiar código, íconos ni recursos de OpenCutList.

## Pestaña «Piezas»: listado de piezas

| Parte | Qué muestra |
|---|---|
| Encabezado | «Listado de piezas» con Generar, Imprimir, Exportar (CSV), Opciones y «?». Debajo, el nombre del modelo y la unidad (milímetro) |
| Resumen | Una fila por material: Tipo (placa, canto o «?»), punto de color, «Nombre / espesor» (cantos: «espesor x ancho»), Cantidad y Σ Longitud, Área y Volumen. Avisos en rojo en la fila: «Ancho no definido», «Veta no definida», «Sin ficha en la biblioteca». Si la ficha del canto no tiene ancho, se usa el espesor de la pieza y se muestra en rojo |
| Secciones de placa | No. A, B, C…; Designación con un detalle chico (códigos, mueble, L × A × E); Cant.; Finales L y A. «La fibra sigue la longitud» si la placa tiene veta |
| Secciones de canto | Una fila por tira: «Pieza – Longitud del borde 1/2» o «Ancho del borde 1/2», con Cant. y Finales L |
| Sin tipo («?») | Piezas sin material reconocido, con L, A y E |
| Interacción | Clic o Enter en una fila resalta la pieza en SketchUp. El lápiz abre la ficha en Materiales. El ojo oculta la sección; «ir a la sección» la vuelve a mostrar. Menú «⋮» por sección: CSV de la sección, editar ficha, ocultar. Se mantienen el filtro por mueble, el buscador y «Plegar/Expandir todo» |
| Exportar | CSV con «;», coma decimal y BOM UTF-8 (abre directo en Excel). Lo guarda Ruby con el diálogo nativo, entero o nada. Sólo exporta lo visible |
| Imprimir | Imprime sólo el listado visible |

**Quedan afuera** «Diagrama de corte», «Dibujar» y «Estimar» de OpenCutList.

## Nitidez

| Dónde se veía mal | Causa | Corrección |
|---|---|---|
| Miniaturas de materiales | Se armaban a 256 px por vecino más cercano y se estiraban en tarjetas de unos 314 px a 125–150 % | Promedio de área (box filter) a 512 px. Si SketchUp no acepta 512, vuelve a 256. Las fichas de foto ya creadas conservan su miniatura de 256 hasta que se reajuste la textura |
| Barra y tira de pintura en la vista 3D | Coordenadas fraccionarias a 125/150 %, bordes de 1 px repartidos en dos filas, triángulos con diagonal y texto de tamaño fijo 10/11 | Todo alineado a píxel entero, bordes en el medio del píxel, sin triángulos (la marca «se instala» es un cuadradito), texto escalado con `UI.scale_factor` y fuente Segoe UI |
| Íconos de la barra de herramientas | Sólo PNG de 24/32 px, agrandados por Windows | 9 íconos SVG en Windows, con el PNG de respaldo. El RBZ pasa de 66 a 75 archivos |

Los cursores no cambiaron.

## Cómo validarla

Igual que la 0.8.17 (`docs/validacion-0817/ANEXO_0817.md`), instalando `dist/PlanosSanto-0.8.18-candidata.rbz`. Respaldá `%LOCALAPPDATA%\PlanosSanto\` antes, como siempre. Se agrega:
1. **Listado de piezas** (con un modelo de prueba con placas, cantos y alguna pieza sin material):
   - L1: los Σ del resumen coinciden con la suma de cada sección;
   - L2: un canto sin ancho en la ficha muestra «Ancho no definido» y el ancho en rojo;
   - L3: clic en una fila y en una tira resalta la pieza correcta en SketchUp;
   - L4: el lápiz abre la ficha correcta en Materiales;
   - L5: Exportar CSV guarda el archivo y abre bien en Excel (acentos, comas decimales, sin la sección oculta);
   - L6: Imprimir muestra sólo el listado.
2. **Nitidez** al 100 %, 125 % y 150 % de escalado de Windows:
   - N1: la barra y la tira de pintura se ven nítidas, sin bordes dobles ni borrosos;
   - N2: el texto de la barra no sale ni diminuto ni el doble de grande (si sale el doble, `draw_text` ya escala por DPI: anotarlo; la corrección está en `font_px` de `smart_paint_tool.rb`);
   - N3: una foto nueva de veta fina se ve nítida en la tarjeta de Materiales; anotar el tiempo de carga de una foto de 16 MP (objetivo: menos de 2 s);
   - N4: los íconos de la barra de herramientas se ven nítidos en SVG.
