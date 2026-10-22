# Pintura en vista: pintar sin abrir ventanas

**Estado: PENDIENTE de ejecución en SketchUp 2026 nativo.** Todo lo de este documento se probó sólo con dobles de la API de SketchUp (Linux, sin SketchUp): `pintura_en_vista_controller_test.rb`, `PinturaEnVistaToolTest` (en `pincel_avanzado_tool_test.rb`) y `quick_toolbar_test.rb`. Nada de esto cuenta como aprobado hasta correrlo en SketchUp.

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
| V1 **(bloquea)** | Con el modelo recién abierto y sin analizar, clic en **Pintar** de la barra | No se abre **ninguna** ventana. El cursor pasa a ser el del pincel. Arriba a la izquierda aparece la barra `Pieza` (activa) · `Canto`. Abajo a la izquierda aparece la tira de muestras con el texto «Materiales · clic para elegir (1–6 recientes)». La barra de estado dice qué hacer |
| V2 **(bloquea)** | Sin material elegido (primer uso), clic en una pieza | No pinta nada y no crea entrada en Edición › Deshacer. El mensaje pide elegir un material en la tira o en la bandeja Materiales |
| V3 **(bloquea)** | Clic en una muestra de una placa **instalada** y después clic en una pieza | La muestra queda marcada con borde negro. La pieza se pinta. Un Ctrl+Z la deshace |
| V4 **(bloquea)** | Pasá el mouse sobre la muestra de la placa **no instalada** (tiene una diagonal) y hacé clic | El tooltip dice «se instala al elegirlo». Al hacer clic el material se instala solo, sin abrir ventanas, aparece en la bandeja Materiales del modelo y queda activo. El clic en la tira no pinta nada |
| V5 | Clic en `Canto` de la barra | Cambia a modo canto, aparecen `1` · `2` · `4` y la tira muestra cantos. Si nunca se usó un canto, pide elegirlo |
| V6 | Clic en `4` y después en el canto de una pieza | Se pintan los 4 cantos de esa pieza. Volver a abrir el pincel recuerda 4 cantos |
| V7 **(bloquea)** | Con el pincel activo, abrí la **bandeja Materiales** de SketchUp y elegí un material vinculado a la biblioteca (por ejemplo, la placa de V3) | Ese material pasa a ser el del pincel. Si es un canto, el pincel pasa a modo canto. El mensaje dice «(bandeja Materiales)». **Anotá si SketchUp cambia de herramienta al Bote de pintura**: es el riesgo principal de este caso (ver «Riesgos») |
| V8 | En la bandeja Materiales elegí un material que **no** es de la biblioteca (un color nativo de SketchUp) | No cambia el material del pincel. La barra de estado explica que no está en la biblioteca de Planos Santo |
| V9 | Clic de nuevo en **Pintar** de la barra | El pincel se detiene y la barra de estado dice «Pintura terminada.» |
| V10 | Abrí la ventana principal, editá un nombre sin guardar (guía con cambios) y, sin guardar, usá **Pintar** desde la barra | Pinta igual. Anotá qué muestra después la ventana principal: el análisis queda desactualizado por el pintado y la guía conserva los cambios sin guardar |
| V11 | Con cambios **sin guardar en la biblioteca** (Materiales) o en el pedido, usá **Pintar** | No arranca. La barra de estado dice «Guardá los cambios de biblioteca o pedido antes de pintar.» y el botón se ve gris |
| V12 | Abrí otro modelo (Archivo › Abrir) y usá **Pintar** | El pincel trabaja sobre el modelo nuevo, sin pedir análisis |
| V13 | Escalado de Windows al 100 % y al 150 %, con la ventana chica y maximizada | La barra y la tira se ven nítidas, no se superponen y no tapan la barra de estado. Si hay muchas muestras, la tira se corta al ancho de la vista sin desbordar |
| V14 | **Extensiones › Planos Santo › Paleta de pintura…** | Abre la paleta de siempre (es la única forma de abrirla desde la barra) |
| V15 | Con el pincel activo, Alt + clic en una cara pintada (cuentagotas), ↑/↓ y clic derecho | Funcionan igual que en la 0.8.14 (regresión) |

## Qué se probó sólo con dobles

- **Dibujo de la barra y la tira** (`view.draw2d`, `draw_text`): con dobles se validaron posiciones, colores, la diagonal de «se instala» y que el mouse sobre la barra o la tira no elija piezas. Falta ver en SketchUp el tamaño real del texto, la nitidez y el escalado de Windows.
- **Bandeja Materiales** (`MaterialsObserver#onMaterialSetCurrent`): con dobles, elegir un material vinculado lo activa y uno no vinculado se explica. Falta confirmar que SketchUp 2026 llame a `onMaterialSetCurrent` cuando se elige en la bandeja **con el pincel de Planos Santo activo**, y que no active el Bote de pintura nativo.
- **Sin ventanas:** con dobles se contó que no se crea ningún `UI::HtmlDialog` ni `UI.messagebox`. Falta verlo en SketchUp.
- **Instalación desde la tira:** usa el mismo flujo de instalación automática del Hito 1 (`PaintMaterials#prepare`), que ya tiene su propia validación nativa pendiente.

## Riesgos

1. **Bandeja Materiales:** en algunas versiones, elegir un material en la bandeja activa el Bote de pintura de SketchUp y saca al pincel de Planos Santo. Si pasa (V7), el material igual queda elegido para la próxima vez que se active Pintar, pero el operador tiene que volver a tocar **Pintar**. Hay que anotarlo; la alternativa es elegir siempre desde la tira.
2. **Guía con cambios sin guardar (V10):** el pincel de la barra ya no espera a que se guarde la guía. El pintado marca el análisis como desactualizado. El análisis automático que se está agregando en `App.tsx` (otra rama) tiene que conservar las ediciones sin guardar.
3. **Cambio de modelo (V12):** si el modelo activo cambió, el pincel se pasa al modelo nuevo y avisa a la ventana principal que su análisis quedó desactualizado. Si la guía del modelo anterior tiene cambios sin guardar, el pincel no arranca y lo explica.
