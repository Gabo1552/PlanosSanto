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
| d | **Rebaje → prohibido antes del clic** | Modelo B. Pintar canto con «2» o «4». Apuntar la pieza con rebaje. | Cursor **prohibido** y tooltip en rojo con el motivo («Los cuatro lados no son caras físicas únicas…» o equivalente) **antes** de hacer clic. Si se hace clic: no cambia nada, no hay entrada de Undo, nunca pinta a medias. |
| e | **Repasar ya pintadas no agrega Undo** | Con las 4 puertas ya en placa B, en «Todas las iguales» y luego en «Solo esta», hacer clic de nuevo en una puerta. | Mensaje «ya tiene este material». Edición › Deshacer sigue mostrando la operación anterior (no hay entradas nuevas). No se crean definiciones. |
| f | **Tab y Ctrl+Tab sin salir de la herramienta** | Con la herramienta activa: Tab, Tab, Ctrl+Tab ×3, Mayús+Ctrl+Tab. | Tab alterna Pieza ↔ Canto y retoma **el último material de cada modo** (placa B / canto). Ctrl+Tab cicla 1→2→4→1 en canto (Mayús al revés) y el selector de la paleta acompaña. La herramienta **nunca** se desactiva (el ícono sigue presionado, Esc sigue terminando). |

## 2. Casos complementarios por entregable

### PINTURA-01 · cantos 1/2/4
- 2 cantos: apuntar un lado largo → se resaltan **los dos lados largos opuestos**; apuntar uno corto → los dos cortos.
- Pieza con un lado partido por una arista (dos caras coplanares): con «1» pinta la cara apuntada; con «2»/«4» queda **bloqueado con motivo** (no se fusionan caras; PINTURA-15 es del Hito 7).
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
