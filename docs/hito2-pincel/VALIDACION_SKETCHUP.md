# Hito 2 · Pincel diario completo — batería de aceptación en SketchUp 2026

**Estado: PENDIENTE de ejecución en SketchUp 2026 nativo.** Todo lo implementado en la rama `claude/noche-hito2-pincel` se probó solo con dobles de la API de SketchUp (Linux, sin SketchUp) y con la paleta en Chromium con un doble de transporte. Ninguna prueba de esta rama ejecutó SketchUp. Esta batería es la puerta de salida del Hito 2 (`audit/opencutlist-paridad-2026-10-21/PLAN_PARIDAD_OCL.md` §5).

**Prerrequisito del plan:** el Hito 1 sigue pendiente de validación nativa. Si algún punto del checklist del Hito 1 falla, se corrige antes de dar por cerrado este hito.

## 0. Preparación

| Paso | Detalle |
|---|---|
| Equipo | Windows 10/11 con SketchUp 2026. Anotar versión exacta (`Sketchup.version`), escalado de pantalla (100 % y 150 %) y resolución. |
| Instalación | `artifacts/PlanosSanto-0.8.10.rbz` construido desde esta rama (`node scripts/build-offline.mjs`); verificar que el RBZ trae `planos_santo/cursors/paint-*.png` (59 archivos). |
| Biblioteca | Una placa (p. ej. «Melamina Blanca 18») y un canto («Canto Blanco 22x0,45») listos para diseño. Otra placa de color distinto para ver el preview. |
| Modelo A · bajo mesada | 6 módulos; **4 puertas que son copias del mismo componente**; laterales, fondos y estantes como grupos y componentes. Guardar una copia limpia `A0.skp`. |
| Modelo B · casos raros | Una pieza con **rebaje** en un canto (cara partida en dos), una pieza con un lado partido por una arista, una pieza **sin placa pintada**, una pieza bloqueada, un grupo dentro de un componente compartido. |
| Modelo C · 500 piezas | Para latencia. Puede ser el de referencia del Hito 1. |
| Consola | Ventana › Consola Ruby abierta para ver las líneas `Planos Santo pincel:` y errores. |
| Log | Carpeta de datos de Planos Santo › `diagnostico/pincel-tiempos.jsonl` (se crea con el primer clic). |

Regla de registro: para cada caso anotar **resultado (OK / FALLA)**, captura y, si falla, el mensaje exacto. Una sola falla en (a)–(f) de §1 bloquea el cierre del hito.

## 1. Criterio de aceptación del plan (bajo mesada, modelo A)

| # | Caso | Pasos | Esperado |
|---|---|---|---|
| a | **4 cantos en 1 clic, con preview previo** | Paleta inmediata › Pintar canto › elegir canto › selector «4». Pasar el cursor sobre un canto de un estante (sin hacer clic). | Antes del clic se ven resaltados **los 4 lados** con el color del canto. Tooltip: «… · 4 cantos · Solo esta (de N)». Un clic pinta los 4. **Ctrl+Z una vez** deshace los 4 juntos. |
| b | **Todas las iguales (4)** | Pintar pieza › placa B › conmutador «Todas las iguales (4)» (el 4 aparece al apuntar una puerta). Clic en una puerta. | Las 4 puertas quedan pintadas. **Un solo Undo** las revierte a las 4. Ventana › Componentes › En el modelo: **la misma cantidad de definiciones antes y después** (sin «Puerta#1», «#2»…). |
| c | **Solo esta** | Conmutador en «Solo esta». Apuntar una puerta. Clic. | Antes del clic el tooltip muestra «Solo esta (de 4)» y solo esa puerta se resalta. Después del clic, solo esa cambia y aparece **una** definición nueva (aislada). Un Undo la revierte y desaparece la definición nueva. |
| d | **Rebaje → prohibido antes del clic** | Modelo B. Pintar canto con «2» o «4». Apuntar la pieza con rebaje. | Cursor **prohibido** y tooltip en rojo con el motivo («Un lado no está cubierto por caras planas completas…» o equivalente) **antes** de hacer clic. Si se hace clic: no cambia nada, no hay entrada de Undo, nunca pinta a medias. |
| e | **Repasar ya pintadas no agrega Undo** | Con las 4 puertas ya en placa B, en «Todas las iguales» y luego en «Solo esta», hacer clic de nuevo en una puerta. | Mensaje «ya tiene este material». Edición › Deshacer sigue mostrando la operación anterior (no hay entradas nuevas). No se crean definiciones. |
| f | **Tab y Ctrl+Tab sin salir de la herramienta** | Con la herramienta activa: Tab, Tab, Ctrl+Tab ×3, Mayús+Ctrl+Tab. | Tab alterna Pieza ↔ Canto y retoma **el último material de cada modo** (placa B / canto). Ctrl+Tab cicla 1→2→4→1 en canto (Mayús al revés) y el selector de la paleta acompaña. La herramienta **nunca** se desactiva (el ícono sigue presionado, Esc sigue terminando). |

## 2. Casos complementarios por entregable

### PINTURA-01 · cantos 1/2/4
- 2 cantos: apuntar un lado largo → se resaltan **los dos lados largos opuestos**; apuntar uno corto → los dos cortos.
- Pieza con un lado partido por una arista (dos caras coplanares): desde el pincel avanzado (PINTURA-15) se pinta el lado entero con «1», «2» y «4»; ver la sección «Pincel avanzado». Un **rebaje** (lado que no está cubierto completo) sigue **bloqueado con motivo** con «2»/«4».
- Pieza rotada, escalada (incluida escala negativa/espejo) y dentro de un grupo anidado: el resaltado coincide con los lados reales.
- Cerrar y reabrir SketchUp: el selector vuelve con el último valor elegido.
- Quitar canto con «4»: quita los 4 y restaura la placa en un Undo.

### PINTURA-02 · alcance
- La N del conmutador coincide con las copias reales (comparar con Entity Info › «N en el modelo»), incluidas copias dentro de módulos repetidos (ruta anidada).
- Cambiar de material, de modo (botón o Tab), usar ←/→, terminar o cerrar la paleta: el conmutador **vuelve a «Solo esta»**.
- «Todas» sobre una definición con alguna copia **bloqueada** o fuera de la jerarquía activa: se rechaza con motivo y no pinta ninguna.
- «Todas» con 200+ copias: el resaltado se limita y SketchUp no se traba.

### PINTURA-06 · Tab
- Sin canto elegido en la sesión: Tab desde Pieza avisa «Elegí un canto en la paleta…» y queda en Pieza.
- Tab con el material recordado borrado de la biblioteca o no instalado en este modelo: avisa y no instala nada.
- Verificar que **Tab no activa** otra herramienta de SketchUp ni mueve el foco a la paleta.

### Feedback en la vista (ARQ-10 etapa 1, PINTURA-03/05/12)
- Barra de estado inferior: modo · material · alcance · último error.
- Tooltip de 2 líneas legible a 100 % y **150 % de escalado** (riesgo del plan: `draw_text` y HiDPI). Anotar si se corta, se superpone o queda lejos del cursor.
- Preview con el **color real** del material (probar una melamina clara, una oscura y una con textura) y alpha suficiente para ver la pieza debajo; las copias con un alpha menor; bloqueado en rojo.
- Cursores: pieza, canto, quitar y prohibido se distinguen; el punto activo está en la cruz (arriba a la izquierda). Probar sobre fondo claro y oscuro.

### PINTURA-08 / F-PINT-B · aptitud en el hover
- Canto sobre una pieza **sin placa**: prohibido + «Canto sin placa: pintá primero la placa de esta pieza.»; el clic no pinta.
- Pieza bloqueada: prohibido con motivo.
- Mover una pieza con la herramienta nativa (Mover) o editar su geometría, volver al pincel: el veredicto se **recalcula** (el contador de transacciones invalida el caché). Hacer Undo/Redo de una pintura y volver a apuntar: veredicto correcto.

### F-ARQ-B · eventos a la paleta
- Con la paleta abierta, mover el mouse rápido sobre 30 piezas durante 10 s: SketchUp no se pone pesado y la paleta muestra la última pieza apuntada al detenerse (el envío pendiente llega).

### PINTURA-09 · medición
- Modelo C (500 piezas): 20 clics de placa y 20 de canto (4 lados). Abrir `pincel-tiempos.jsonl` y la acción Diagnóstico (`paintClicks`): anotar p50, p95 y máximo. **Objetivo: < 150 ms.** Si p95 > 200 ms, el plan adelanta el Hito 6.

## 3. Regresión del Hito 1 (no debe cambiar)

- Pintar placa en un grupo y en un componente compartido en «Solo esta»: un Ctrl+Z deshace exactamente un clic, la textura conserva el mapeo y los cantos quedan intactos al repintar la placa.
- Instalación automática desde la biblioteca al elegir un material; material desde foto.
- La paleta avanzada (ventana principal › Pintar) mantiene su selector 1/2/4, su alcance con autorización explícita y su Tab de submodo.

## 4. Qué se validó solo con dobles (no cuenta como aceptación)

- Lógica de opciones y validación (`edgeCount` ∈ {1,2,4}, `scope:'all'` solo con `allowShared` en la misma solicitud, reseteo de la autorización, settings).
- Expansión de caras 2/4 y rechazo de caras partidas sobre geometría sintética.
- Un Undo por clic y ausencia de make_unique con alcance «todas» sobre el doble de modelo con pila de Undo simulada.
- Caché de veredicto, contador de transacciones, limitador de eventos (reloj inyectado) y log de tiempos.
- Paleta inmediata en Chromium con un doble de transporte (capturas `artifacts/hito2-paleta-*-SINTETICA.png`).

Nada de lo anterior prueba el render de `draw_text`, el alpha de `drawing_color`, `UI.create_cursor`, el `ModelObserver` real, el foco de teclado ni la latencia en SketchUp.

## 5. Pincel avanzado (Hito 7)

**Estado: PENDIENTE de ejecución en SketchUp 2026 nativo.** Contrato: `docs/hito2-pincel/DISENO_AVANZADO.md`. Todo lo de esta sección se probó solo con dobles de la API (Ruby) y con la paleta en Chromium con un doble de transporte. Usar los modelos A y B de §0. Regla de registro igual a §0. Una falla en cualquier fila marcada **(bloquea)** impide cerrar el entregable correspondiente.

### PINTURA-04 · tira de recientes en la vista
| # | Pasos | Esperado |
|---|---|---|
| R1 **(bloquea)** | Pintar pieza con 3 placas distintas (elegirlas en la paleta), luego Pintar canto con 2 cantos. | Abajo a la izquierda de la vista aparecen los cuadrados de los materiales del modo actual, con su color; el activo con borde grueso. Al pasar a canto (Tab) la tira muestra los cantos. |
| R2 **(bloquea)** | Clic en un cuadrado de la tira. | Cambia el material activo (barra de estado, tooltip y paleta lo acompañan). **No pinta nada** y Edición › Deshacer no muestra una entrada nueva. El alcance vuelve a «Solo esta». |
| R3 | Teclas 1–6 con la herramienta activa. | Eligen el reciente N. Anotar si alguna tecla dispara un atajo de SketchUp en vez del reciente (riesgo conocido). |
| R4 | Escalado de Windows 100 % y 150 %, ventana chica y maximizada. | La tira queda dentro de la vista, no tapa la barra de estado y los cuadrados se ven nítidos (riesgo del plan: `draw2d` y `UI.scale_factor`). |
| R5 | Cerrar y reabrir SketchUp. | Los recientes se recuerdan (máximo 6 por modo). Un material borrado de la biblioteca o no instalado en el modelo **no aparece** (nunca se instala desde la tira). |

### PINTURA-07 · cuentagotas temporal
| # | Pasos | Esperado |
|---|---|---|
| C1 **(bloquea)** | Con Pintar pieza activo, **sostener Alt** y hacer clic en un canto ya pintado de otra pieza; soltar Alt. | Mientras se sostiene, el cursor cambia al cuentagotas y el tooltip muestra el material de la cara. El clic **no pinta**: toma el canto y el pincel pasa a Pintar canto con ese material. Al soltar Alt vuelve el cursor del pincel. Sin entradas nuevas de Undo. |
| C2 **(bloquea)** | Windows: sostener y soltar Alt solo, sin clic. | **No se abre el menú de SketchUp** ni se pierde el foco de la vista (riesgo del plan §7). Si se abre, anotarlo y probar la alternativa Mayús en la paleta («Tecla del cuentagotas»). |
| C3 | Alt + clic en una cara con un material sin vínculo de Planos Santo (p. ej. uno de la paleta nativa). | Mensaje con el motivo; el material activo no cambia. |
| C4 | Paleta › Tecla del cuentagotas › Mayús. Repetir C1 con Mayús. | Funciona igual; Mayús+Tab sigue alternando el modo. |
| C5 | Sostener Alt, hacer Alt+Tab a otra ventana y volver. | El pincel no queda trabado en cuentagotas (al volver, el clic pinta; si queda en muestreo, soltar y apretar Alt lo corrige). Anotar el comportamiento. |

### PINTURA-11 · pick en profundidad
| # | Pasos | Esperado |
|---|---|---|
| P1 **(bloquea)** | Apuntar una puerta cerrada que tapa un estante. Apretar ↓. | El resaltado pasa a la pieza de atrás; el tooltip muestra «(2 de N · ↑/↓)» y la paleta «Pieza 2 de N bajo el cursor». ↑ vuelve. |
| P2 **(bloquea)** | Con la pieza de atrás elegida, clic sin mover el mouse. | Se pinta **la pieza de atrás** y no la puerta. Un Ctrl+Z la deshace. |
| P3 | Elegir la de atrás con ↓, mover el mouse a otra zona y volver. | La selección vuelve a la pieza de adelante (no queda una profundidad vieja). |
| P4 | ←/→ con la herramienta activa. | Siguen rotando el material del mismo tipo. |

### PINTURA-13 · menú contextual
| # | Pasos | Esperado |
|---|---|---|
| M1 | Clic derecho sobre una pieza con el pincel activo. | Aparece el menú propio (tomar material, ocultar, renombrar, cantos por clic en modo canto, resaltar lo que falta, transparencia) y el pincel **sigue activo** al cerrarlo. Abrirlo no crea entradas de Undo. |
| M2 **(bloquea)** | «Ocultar esta pieza», luego Ctrl+Z. | La pieza se oculta en **una** entrada de Undo; Ctrl+Z la vuelve a mostrar. La paleta avisa análisis desactualizado. |
| M3 | Ocultar 2 piezas y elegir «Mostrar las piezas ocultadas desde el pincel». | Vuelven ambas en una sola entrada de Undo. |
| M4 **(bloquea)** | «Renombrar pieza…», escribir un nombre, Aceptar; repetir y Cancelar. | Aceptar renombra la instancia (Entity Info) en un Undo; Cancelar o el mismo nombre no crean entrada. En una pieza **bloqueada**, renombrar y ocultar se rechazan con motivo. |
| M5 | En una copia de un componente compartido, renombrar. | Solo cambia el nombre de esa instancia (no la definición ni las otras copias). |

### F-PINT-C · resaltar lo que falta pintar
| # | Pasos | Esperado |
|---|---|---|
| F1 **(bloquea)** | Modelo B. Paleta › «Resaltar lo que falta» (o menú contextual). | Las piezas **sin placa** se ven en rojo translúcido; la paleta muestra «Sin placa: N piezas» con N igual al conteo manual. |
| F2 | Pintar la placa de una de ellas. | Deja de verse en rojo en el mismo clic (sin reabrir) y N baja en 1. Ctrl+Z la vuelve a marcar. |
| F3 | Apuntar piezas con el resaltado activo. | 3.ª línea del tooltip: «Falta: placa · cantos k/4» o «Completa: placa · cantos 4/4», coherente con lo que se ve. |
| F4 | Modelo C (500 piezas) con el resaltado activo: orbitar y mover el mouse 10 s. | SketchUp no se traba; anotar si aparece «N+» (tope de evaluación). |

### PINTURA-14 · transparencia
| # | Pasos | Esperado |
|---|---|---|
| T1 | Paleta › «Transparencia» y luego desde el menú contextual. | Alterna rayos X (Ventana › Estilos › Rayos X acompaña). **No crea entradas de Undo**, no detiene el pincel ni marca el análisis desactualizado. |

### PINTURA-15 · varias caras por lado
| # | Pasos | Esperado |
|---|---|---|
| L1 **(bloquea)** | Modelo B, pieza con un lado partido por una arista (dos caras coplanares que cubren el lado). Pintar canto con «1», «2» y «4». | El preview resalta **el lado entero** (las dos caras) y el clic pinta todas en **un** Undo. |
| L2 **(bloquea)** | Pieza con **rebaje** (el lado no llega al borde completo). «2» y «4». | Bloqueado antes del clic con el motivo «Un lado no está cubierto por caras planas completas…»; el clic no pinta nada ni crea Undo. Con «1» se puede pintar cara por cara. |
| L3 | Pieza con una cara ancha partida por una línea. Pintar pieza. | Pinta todas las caras anchas en un Undo; los cantos quedan intactos. |
| L4 | Repetir L1 en una pieza escalada (no uniforme) y en una copia de componente con «Solo esta». | Mismo resultado; «Solo esta» aísla solo esa copia. |

### Qué se validó solo con dobles (no cuenta como aceptación)
- Cobertura de lados por área, expansión de caras y rechazos sobre geometría sintética.
- Tira de recientes (`draw2d` sobre una vista doble), cuentagotas con teclas simuladas, pila de picks simulada, menú doble, `rendering_options` como Hash y `UI.inputbox` simulado.
- Controlador con doble de herramienta y preferencias en memoria; paleta en Chromium con doble de transporte.

Nada de esto prueba el render de `draw2d`/`draw_text` en HiDPI, el comportamiento real de Alt en Windows, el orden real de `PickHelper` en profundidad, el menú contextual nativo ni el modo rayos X real.
