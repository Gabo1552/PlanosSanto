# Pintura en vista: pintar sin abrir ventanas

**Estado: PENDIENTE de ejecución en SketchUp 2026 nativo.** Todo lo de este documento se probó sólo con dobles de la API de SketchUp (Linux, sin SketchUp): `pintura_en_vista_controller_test.rb`, `PinturaEnVistaToolTest` (en `pincel_avanzado_tool_test.rb`) y `quick_toolbar_test.rb`. Nada de esto cuenta como aprobado hasta correrlo en SketchUp.

**0.8.17** (rama `claude/pintura-ocl-0817`) responde a la prueba de Gabriel con la 0.8.16 y cambia la interfaz en la vista. Ver la sección «0.8.17» al final: casos **W1–W16**. Los casos V de abajo siguen valiendo, con la barra y la tira nuevas.

## Qué cambia

Pedido de Gabriel: «que no se abra una ventana al querer pintar un material sino que se integre a la interfaz de SketchUp», como el Smart Paint de OpenCutList. Se replicó el **comportamiento**, escrito de cero: no se copió código, íconos ni recursos de OpenCutList (GPLv3).

| Antes | Ahora |
|---|---|
| «Pintar» abría la paleta separada (una ventana) y había que elegir el material ahí | **«Pintar»** y **«Pintar canto»** (los dos en la barra) activan el pincel directamente en la vista. No se abre ninguna ventana |
| El material se elegía en la paleta | El material se elige **en la vista**, con una tira de muestras abajo a la izquierda (recientes primero, después la biblioteca del modo), o en la **bandeja Materiales** de SketchUp |
| Pieza/Canto y 1/2/4 cantos se elegían en la paleta | **Barra de modo** dibujada arriba a la izquierda: `Pieza` · `Canto` y, en canto, `1` · `2` · `4`. Tab y Ctrl+Tab siguen funcionando |
| Pintar exigía haber analizado y tener la guía guardada | El pincel de la barra **no exige análisis ni guía guardada**: usa su propio inventario liviano por clic. Sólo bloquea si hay cambios sin guardar de biblioteca o pedido |
| Los errores del atajo salían en un cuadro de mensaje | Los errores del pincel de la barra van a la **barra de estado** de SketchUp |

Sigue igual:
- La paleta completa sigue disponible en **Extensiones › Planos Santo › Paleta de pintura…**.
- La ventana principal no cambió. Desde ella, «Pintar» se rige por `App.tsx`, que se trabaja en otra rama.
- El cuentagotas (Alt o Mayús), la profundidad (↑/↓), el menú contextual, «Revisar lo que falta» y la transparencia funcionan igual que antes.

## Preparación

| Paso | Detalle |
|---|---|
| Equipo | Windows 10/11 con SketchUp 2026. Anotá `Sketchup.version`, el escalado de pantalla (probá 100 % y 150 %) y la resolución |
| Instalación | El RBZ construido desde la rama `claude/pintura-en-vista` (`node scripts/build-offline.mjs`) |
| Datos | Copia de un modelo real y una biblioteca QA (`PLANOS_SANTO_DATA_DIR`) con, al menos: 2 placas y 1 canto ya instalados en el modelo, y 1 placa de la biblioteca que **no** esté instalada en el modelo |
| Estado inicial | Cerrá la ventana principal y la paleta de Planos Santo. No analices el modelo |

## Casos

| # | Qué hacer | Qué se espera |
|---|---|---|
| V1 **(bloquea)** | Con el modelo recién abierto y sin analizar, clic en **Pintar** de la barra | No se abre **ninguna** ventana. El cursor pasa a ser el del pincel. Arriba aparece la barra oscura de pestañas con «Pintar piezas» en naranja. Abajo aparece la tira oscura de materiales con «Ningún material» y una celda por placa. La barra de estado dice qué hacer |
| V2 **(bloquea)** | Sin material elegido (primer uso), clic en una pieza | No pinta nada y no crea entrada en Edición › Deshacer. El mensaje pide elegir un material en la tira o en la bandeja Materiales |
| V3 **(bloquea)** | Clic en la celda de una placa **instalada** y después clic en una pieza | La celda queda con borde naranja. La pieza se pinta. Un Ctrl+Z la deshace |
| V4 **(bloquea)** | Pasá el mouse sobre la celda de la placa **no instalada** (tiene un triángulo blanco en la esquina superior derecha) y hacé clic | El tooltip dice «se instala al elegirlo». Al hacer clic el material se instala solo, sin abrir ventanas, aparece en la bandeja Materiales del modelo y queda activo. El clic en la tira no pinta nada |
| V5 | Clic en la pestaña «Pintar cantos» | Cambia a modo canto. Debajo de las pestañas aparece la franja clara «Cantos por clic 1 2 4» y la tira muestra cantos. Si no hay un canto listo, pide elegirlo (ver W1) |
| V6 | Clic en `4` y después en el canto de una pieza | Se pintan los 4 cantos de esa pieza. Volver a abrir el pincel recuerda 4 cantos |
| V7 **(bloquea)** | Con el pincel activo, abrí la **bandeja Materiales** de SketchUp y elegí un material vinculado a la biblioteca (por ejemplo, la placa de V3) | Ese material pasa a ser el del pincel. Si es un canto, el pincel pasa a modo canto. El mensaje dice «(bandeja Materiales)». **Anotá si SketchUp cambia de herramienta al Bote de pintura**: es el riesgo principal de este caso (ver «Riesgos») |
| V8 | En la bandeja Materiales elegí un material que **no** es de la biblioteca (un color nativo de SketchUp) | No cambia el material del pincel. La barra de estado explica que no está en la biblioteca de Planos Santo |
| V9 | Clic de nuevo en **Pintar** de la barra | El pincel se detiene y la barra de estado dice «Pintura terminada.» |
| V10 | Abrí la ventana principal, editá un nombre sin guardar (guía con cambios) y, sin guardar, usá **Pintar** desde la barra | Pinta igual. Anotá qué muestra después la ventana principal: el análisis queda desactualizado por el pintado y la guía conserva los cambios sin guardar |
| V11 | Con cambios **sin guardar en la biblioteca** (Materiales) o en el pedido, usá **Pintar** | No arranca. La barra de estado dice «Guardá los cambios de biblioteca o pedido antes de pintar.» y el botón se ve gris |
| V12 | Abrí otro modelo (Archivo › Abrir) y usá **Pintar** | El pincel trabaja sobre el modelo nuevo, sin pedir análisis |
| V13 | Escalado de Windows al 100 % y al 150 %, con la ventana chica y maximizada | La barra y la tira se ven nítidas, no se superponen y no tapan la barra de estado. Si hay muchos materiales, aparecen las flechas ‹ › a la derecha de la tira (ver W10) |
| V14 | **Extensiones › Planos Santo › Paleta de pintura…** | Abre la paleta de siempre (es la única forma de abrirla desde la barra) |
| V15 | Con el pincel activo, Alt + clic en una cara pintada (cuentagotas), ↑/↓ y clic derecho | Funcionan igual que en la 0.8.14 (regresión) |

## Qué se probó sólo con dobles

- **Dibujo de la barra y la tira** (`view.draw2d`, `draw_text`): con dobles se validaron posiciones, colores, la diagonal de «se instala» y que el mouse sobre la barra o la tira no elija piezas. Falta ver en SketchUp el tamaño real del texto, la nitidez y el escalado de Windows.
- **Bandeja Materiales** (`MaterialsObserver#onMaterialSetCurrent`): con dobles, elegir un material vinculado lo activa y uno no vinculado se explica. Falta confirmar que SketchUp 2026 llame a `onMaterialSetCurrent` cuando se elige en la bandeja **con el pincel de Planos Santo activo**, y que no active el Bote de pintura nativo.
- **Sin ventanas:** con dobles se contó que no se crea ningún `UI::HtmlDialog` ni `UI.messagebox`. Falta verlo en SketchUp.
- **Instalación desde la tira:** usa el mismo flujo de instalación automática del Hito 1 (`PaintMaterials#prepare`), que ya tiene su propia validación nativa pendiente.

## Riesgos

1. **Bandeja Materiales:** en algunas versiones, elegir un material en la bandeja activa el Bote de pintura de SketchUp y saca al pincel de Planos Santo. Si pasa (V7), el material igual queda elegido para la próxima vez que se active Pintar, pero el operador tiene que volver a tocar **Pintar**. Hay que anotarlo; la alternativa es elegir siempre desde la tira. Desde la 0.8.17 el pincel intenta volver a seleccionarse solo (ver W9).
2. **Guía con cambios sin guardar (V10):** el pincel de la barra ya no espera a que se guarde la guía. El pintado marca el análisis como desactualizado. El análisis automático que se está agregando en `App.tsx` (otra rama) tiene que conservar las ediciones sin guardar.
3. **Cambio de modelo (V12):** si el modelo activo cambió, el pincel se pasa al modelo nuevo y avisa a la ventana principal que su análisis quedó desactualizado. Si la guía del modelo anterior tiene cambios sin guardar, el pincel no arranca y lo explica.

## 0.8.17: lo que reportó Gabriel con la 0.8.16

| Reporte | Causa encontrada (con dobles) | Cambio |
|---|---|---|
| 1. «No funciona el cambio de pintar placa a pintar canto […] Desde placa a canto, al revés sí» | Al pasar a canto (con Tab o con un clic en la barra), el controlador busca el **último canto usado**. Si ese canto no está listo en **este** modelo, `smart_switch_mode` lanza un error y el pincel lo convertía en «No se cambió de modo». Pasa, por ejemplo, con un canto usado en otro modelo que acá sólo es «instalable». De canto a placa funcionaba porque la placa ya estaba instalada | En la vista, el modo **siempre** cambia. Queda sin material, con la tira de cantos para elegir, y el mensaje dice por qué no se usó el último canto. La paleta separada sigue igual |
| 2. «Cuando pego un material y voy al menú me aparece: "Detené Pintura Inteligente…". Que se haga solo» | Con el pincel activo, respondían con ese error: guardar la guía, generar, resaltar y los cambios de biblioteca (fichas, SKM, fotos, vincular, instalar, archivar, duplicar, paquetes y perfiles de maderera) | Esas acciones **detienen el pincel solas** y siguen. La barra de estado dice «Pintura detenida para continuar con lo que pediste». Generar guías, exportar el PDF y la vista previa de nombres sólo leen el modelo, así que **no** detienen el pincel |
| 3. «El proceso de pintar se detiene de vez en cuando» | (a) El análisis automático de la ventana principal, 1,2 s después de cada clic, pedía `scan`, y `scan` detenía el pincel. (b) Después regeneraba las guías abiertas con `generate`, que respondía «Detené…». (c) Cerrar la ventana principal o la paleta detenía el pincel de la barra. (d) Con cambios sin guardar en Materiales o en el pedido, cada movimiento del mouse fallaba con «Guardá los cambios de biblioteca…» y el pincel quedaba inutilizado. (e) Elegir en la bandeja Materiales activa el Bote de pintura de SketchUp, que saca al pincel. (f) Un error dentro de un callback de la herramienta llegaba a SketchUp | (a) y (b): el pincel sigue pintando. (c): la ventana y la paleta ya no lo detienen. (d): pintar ya no espera esos cambios; sólo los espera instalar un material nuevo desde la tira. (e): si el material de la bandeja es de la biblioteca, el pincel lo toma y **se vuelve a seleccionar solo** (con 1,5 s de margen). (f): todos los callbacks quedan protegidos: el error va a la barra de estado y la herramienta sigue activa |

Ahora el pincel se detiene sólo en estos casos:
- con **Esc**;
- al **elegir otra herramienta**, de SketchUp o de Planos Santo, incluido volver a tocar el mismo botón de pintar;
- al **cerrar o cambiar de modelo**;
- con una acción de la ventana que escribe el modelo o la biblioteca (punto 2).

### Interfaz nueva en la vista

Se replicaron el comportamiento y el aspecto general del pintado de OpenCutList, escritos de cero: no se usó código, íconos ni recursos de OpenCutList, que es GPLv3.

- **Arriba:** una barra oscura de 30 px (multiplicados por la escala de Windows) a todo el ancho.
  - A la izquierda dice «PINTAR».
  - En el centro están las pestañas «Pintar piezas», «Pintar cantos» y «Quitar canto». La activa está en naranja.
  - A la derecha dice «Tab cambia · Esc termina».
  - Si la vista es angosta, primero se oculta el texto de la derecha, después el título y, por último, se achican las pestañas.
- **En «Pintar cantos» y «Quitar canto»:** debajo de las pestañas aparece una franja clara de 26 px con «Cantos por clic» y los botones `1`, `2` y `4`. El activo tiene borde naranja.
- **Abajo:** una tira oscura de 36 px.
  - Empieza con la celda «Ningún material». Después hay una celda ancha por material, de entre 96 y 210 px.
  - Cada celda tiene el color del material (en las texturas, el color promedio que da SketchUp). El nombre va centrado, en blanco o en negro según el contraste.
  - La celda activa tiene borde naranja. Las de materiales que todavía no están en el modelo tienen un triángulo blanco en la esquina.
  - Si no entran todas, aparecen las flechas ‹ ›.
  - En «Quitar canto» no aparece, porque ese modo no usa material.
- **Clic:** las pestañas, los botones `1`, `2` y `4` y las celdas se atienden **antes** que el modelo. Un clic en una parte vacía de las barras no pinta ni elige la pieza de abajo.
- **No se agregaron** «Limpiar pieza», «Recubrir cara», el «+» ni el filtro de OpenCutList, porque Planos Santo no tiene esas acciones. «Ningún material» sólo le quita el material al pincel; no borra nada del modelo.

### Casos 0.8.17

| # | Qué hacer | Qué se espera |
|---|---|---|
| W1 **(bloquea, punto 1)** | En un modelo nuevo donde **nunca** se instaló el canto que usaste la última vez en otro modelo: Pintar → clic en la pestaña «Pintar cantos» | Cambia a «Pintar cantos». La barra de estado dice «Elegí un material…» y que el último canto no está listo en este modelo. La tira muestra los cantos. Clic en uno (se instala si hace falta) y clic en un canto de una pieza: lo pinta |
| W2 **(bloquea, punto 1)** | Igual que W1, pero con **Tab** desde «Pintar piezas» | Igual que W1. Otro Tab vuelve a «Pintar piezas» |
| W3 | Clic en «Quitar canto» y después en un canto pintado | Restaura la placa en ese canto, sin pedir material. Aparece la franja 1/2/4 y no aparece la tira |
| W4 **(bloquea, punto 2)** | Con el pincel activo, pegá un material en la bandeja. Después, desde Extensiones › Planos Santo, abrí Materiales y guardá un cambio de la biblioteca | No aparece «Detené Pintura Inteligente…». El pincel se detiene solo, la barra de estado lo dice y el cambio se guarda |
| W5 **(punto 2)** | Con el pincel activo, en la ventana principal: «Guardar guía» | Guarda. El pincel se detiene solo |
| W6 **(punto 2)** | Con el pincel activo, en la ventana principal: «Resaltar en SketchUp» de una pieza | Resalta. El pincel se detiene solo. No pide «actualizá el análisis» |
| W7 **(bloquea, punto 3)** | Con la ventana principal abierta y un mueble analizado con guías generadas, pintá **20 piezas seguidas**, con algunos segundos entre clic y clic | El pincel **no** se desactiva en ningún momento. La ventana se reanaliza y regenera sola. Anotá si titila o si se pierde algún clic |
| W8 **(punto 3)** | Con el pincel activo, cerrá la ventana principal y después la paleta (si estaba abierta) | El pincel sigue activo y pintando |
| W9 **(punto 3, riesgo principal)** | Con el pincel activo, elegí en la **bandeja Materiales** un canto de la biblioteca | Anotá exactamente qué pasa. Se espera que el pincel pase a «Pintar cantos» con ese canto. Si SketchUp activa el Bote de pintura, en menos de un segundo tiene que volver el cursor del pincel. Al hacer clic en un canto, lo tiene que pintar el pincel de Planos Santo, no el Bote de SketchUp |
| W10 | Con 15 o más placas en la biblioteca, achicá la ventana de SketchUp | Aparecen las flechas ‹ › en la tira y cambian de página. Las pestañas no se salen de la vista |
| W11 | Escalado de Windows al 100 %, 125 % y 150 % | Las barras crecen con la escala (30, 26 y 36 px por la escala). El texto se lee y queda centrado en pestañas y celdas. **Anotá si el texto queda corrido**: el centrado usa `TextAlignCenter` (SketchUp 2020 o posterior) y, si no está disponible, una estimación |
| W12 | Poné en la tira una placa muy clara (blanca) y un canto oscuro (wengué) | El nombre se lee en los dos: en negro sobre la clara y en blanco sobre la oscura |
| W13 | Clic en «Ningún material» y después en una pieza | No pinta y pide elegir un material. «Ningún material» queda con borde naranja |
| W14 | Pasá el mouse por la barra superior, sobre una pieza del modelo, y hacé clic en una parte vacía de la barra | No resalta ni pinta la pieza de abajo |
| W15 | Activá el pincel. Después editá la biblioteca en Materiales sin guardar y volvé a pintar | Pintar con un material ya instalado funciona. Instalar uno nuevo desde la tira pide guardar los cambios de biblioteca |
| W16 | Dejá abierta la Ruby Console durante W1–W15 | No aparecen errores de Planos Santo. Si aparece «Planos Santo pincel: … falló …», copialo: la herramienta tiene que haber seguido activa igual |

### Qué se probó sólo con dobles (0.8.17)

- **Placa → canto:** se probó con dobles del controlador y con la herramienta real (`test_with_the_real_brush_tab_from_sheet_reaches_edge_and_shows_the_edges`). Tab y la pestaña llegan a canto aunque el último canto sea «instalable». Con el `switch_mode` de la 0.8.16, la prueba falla porque queda en placa.
- **Parada automática:** guardar, resaltar y los cambios de biblioteca detienen el doble del pincel y siguen. Se probó con `catalog_save`, `catalog_variant`, `material_archive`, `material_duplicate` y `material_photo_pick`. `generate`, y `scan` sobre el mismo modelo, no lo detienen.
- **Bandeja → Bote de pintura:** se simularon los dos órdenes posibles de los callbacks: primero la bandeja o primero la desactivación. **No se sabe** cuál usa SketchUp 2026, ni si un `select_tool` desde `UI.start_timer(0)` le gana al Bote de pintura. Eso se verifica en W9.
- **Dibujo:** se validaron con dobles de `draw2d` y `draw_text` las posiciones, los colores, el borde naranja, el contraste y la escala. Falta ver en SketchUp el tamaño real del texto y su centrado.
