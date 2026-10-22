# Hito 6 — Validación nativa en SketchUp 2026

**Estado: PENDIENTE de ejecutar.** Este hito se probó solamente en Linux, con dobles de la API de SketchUp (Ruby/minitest), el puente real de la UI (vitest) y la UI compilada con el controlador Ruby sintético (Playwright). Nada de lo que sigue se ejecutó en SketchUp. Este documento es la lista de comprobación para hacerlo.

Rama: `claude/noche-hito6-arquitectura` · Entregables: ARQ-02, ARQ-03, ARQ-06, ARQ-07 y F-ARQ-A del plan `audit/opencutlist-paridad-2026-10-21/PLAN_PARIDAD_OCL.md` (sección 5, Hito 6).

## Preparación

1. Instalar el RBZ de la rama (`artifacts/PlanosSanto-<versión>.rbz`) en SketchUp 2026 para Windows.
2. Abrir la Consola Ruby (Extensiones › Developer › Consola Ruby) para ver los avisos `Planos Santo: …`.
3. Modelos:
   - **Chico**: un bajo mesada de 10 a 20 piezas.
   - **Grande**: la obra de referencia de unas 1500 piezas, con al menos 20 herrajes curvos de Warehouse.
4. Pantallas: una notebook de 1366x768 y un monitor 4K con escalado al 150 %.

## 1. ARQ-02: franja «Análisis desactualizado · Reanalizar»

| # | Paso | Resultado esperado | OK |
|---|---|---|---|
| 1.1 | Analizar el modelo chico y generar las guías. Pintar una placa con Pintar y detener la herramienta. | Aparece la franja **Análisis desactualizado** con el motivo «Pintaste desde Planos Santo.». En la consola **no** hay un nuevo análisis y SketchUp no se congela al detener la herramienta. | |
| 1.2 | Con la franja visible, intentar Guardar guía o Exportar PDF. | Se bloquea con «El análisis está desactualizado; volvé a analizar…». | |
| 1.3 | Pulsar **Reanalizar**. | Se analiza una sola vez y la franja desaparece. | |
| 1.4 | Vincular o instalar un material desde Materiales, y crear un material con foto usando «Guardar y pintar». | Aparece la franja (motivo de material). En el caso de la foto, la paleta abre igual para pintar. | |
| 1.5 | Guardar la guía con «Sincronizar nombres» activado. | **No** aparece la franja, porque es un cambio propio que mantiene el análisis válido. | |
| 1.6 | Con el modelo grande, pintar 10 piezas seguidas. | Ningún clic dispara un análisis completo. Anotar la latencia por clic (objetivo del plan: menos de 150 ms). | |

## 2. ARQ-03: ModelWatch (observers con debounce de 300 ms)

| # | Paso | Resultado esperado | OK |
|---|---|---|---|
| 2.1 | Analizar. Mover una pieza con la herramienta Mover de SketchUp. | La franja aparece en menos de 1 s (criterio de aceptación del plan). | |
| 2.2 | Ctrl+Z sobre ese movimiento. | La franja desaparece sola, porque se volvió al estado analizado. | |
| 2.3 | Pintar una cara con el Bote de pintura nativo (no con Planos Santo). | Aparece la franja. La huella incluye el material de cada cara, front y back. | |
| 2.4 | Cambiar el color de un material **en uso** desde el navegador de materiales nativo. | Aparece la franja y las paletas de Planos Santo se refrescan (MATERIALES-12). | |
| 2.5 | Agregar al modelo un material que **no** se usa en ninguna cara. | La paleta se refresca y **no** aparece la franja. | |
| 2.6 | Pintar con Planos Santo y luego Ctrl+Z (PINTURA-18). | La franja sigue visible: la sesión analizada se invalidó con la escritura propia y hay que reanalizar. | |
| 2.7 | Seleccionar y deseleccionar muchas piezas rápido, y orbitar. | SketchUp no se pone lento. La selección no recorre el modelo ni muestra la franja. | |
| 2.8 | Con el modelo grande, hacer 20 commits seguidos (por ejemplo, mover con flechas). | Hay un solo cálculo de la huella por ráfaga, gracias al debounce. Medir cuánto tarda la huella; si pasa de unos 200 ms, abrir un ticket para cachearla por definición. | |
| 2.9 | Cerrar Planos Santo y la paleta. Editar el modelo. | No queda ningún observer activo y no aparecen avisos en la consola. | |
| 2.10 | Abrir otro modelo (Archivo › Abrir) con Planos Santo abierto. | El observer se suelta del modelo anterior y no hay avisos cruzados. | |

## 3. F-ARQ-A: tope y medición de respuestas, y mallas por mueble

| # | Paso | Resultado esperado | OK |
|---|---|---|---|
| 3.1 | Analizar el modelo grande. | El árbol no lleva mallas (`deferred`). Medir el tiempo del análisis (objetivo: menos de 10 s) y que no aparezca «SketchUp no respondió». | |
| 3.2 | Abrir Diagnóstico (ayuda › Ver diagnóstico). | `replyStats` muestra la acción, los bytes, los ms y las partes de las últimas respuestas. Anotar los valores de `scan` y `generate`. | |
| 3.3 | Generar 1 mueble, y después 10 muebles juntos. | Las mallas llegan solo para los muebles elegidos. Si una respuesta pasa de 1 MB, viaja en partes y la UI la arma bien. | |
| 3.4 | Forzar una respuesta enorme (todos los muebles con herrajes curvos). | Si supera 48 MB, aparece un error claro («supera el tope… Generá menos muebles a la vez») en lugar de un cuelgue. | |
| 3.5 | Revisar la consola. | Las respuestas de más de 8 MB dejan una línea de aviso con su tamaño y su tiempo. | |

## 4. ARQ-06: tamaño de ventana, Plegar y Restablecer

| # | Paso | Resultado esperado | OK |
|---|---|---|---|
| 4.1 | Primera apertura en la notebook de 1366x768. | La ventana ocupa alrededor del 80 % del área útil de la pantalla, centrada, y se ve entera. | |
| 4.2 | Redimensionarla, cerrarla y volver a abrir (también con el botón principal de la barra). | Conserva el tamaño y la posición del usuario. Ya no se fuerza 1440x920. | |
| 4.3 | Pulsar **Plegar**. | La ventana queda en una franja de 420x120 y el foco del teclado vuelve al modelo (`Sketchup.focus`); por ejemplo, la tecla de Orbitar funciona sin hacer clic. | |
| 4.4 | Pulsar **Desplegar**. | La ventana vuelve al tamaño anterior. | |
| 4.5 | Abrir Pintar en la ventana principal (modo compacto) y volver. | Vuelve al tamaño que tenía la ventana, no a uno fijo. | |
| 4.6 | Arrastrar la ventana fuera de la pantalla. Ir a Extensiones › Planos Santo › **Restablecer ventanas**. | La ventana vuelve centrada al 80 % y desplegada. La paleta vuelve a 680x320. | |
| 4.7 | Probar en el monitor 4K al 150 %. | Confirmar que `set_size` y `set_position` usan las mismas unidades lógicas que `screen.availWidth`. Si el tamaño sale al 150 % o al 66 %, abrir un ticket para corregir con `UI.scale_factor`. | |
| 4.8 | Plegar y cerrar la ventana plegada; volver a abrir. | Se reabre ajustada al 80 %, no como franja. Verificar si `UI::HtmlDialog#get_size` existe en 2026 (si no, se usa el tamaño `outerWidth/outerHeight` que informa la UI). | |
| 4.9 | Primera apertura con SketchUp en un monitor secundario (también a la izquierda del principal). | La ventana se centra en ese monitor (`availLeft/availTop`). | |

## 5. ARQ-07: Materiales y Maderera sin análisis

| # | Paso | Resultado esperado | OK |
|---|---|---|---|
| 5.1 | Con Planos Santo cerrado, abrir **Materiales** desde la barra con el modelo grande. | La biblioteca abre de inmediato y no se analiza el modelo (en la consola no aparece la demora del scan). | |
| 5.2 | Lo mismo con **Maderera**. | Abre sin analizar. Preparar el pedido pide primero generar las guías, como antes. | |
| 5.3 | Desde ahí, ir a Muebles. | Aparece la franja **Modelo sin analizar · Analizar**, y al pulsar Analizar se analiza una vez. | |
| 5.4 | Abrir el botón principal o Muebles con la ventana cerrada. | Se analiza al abrir, como antes. | |

## Registro de la prueba

- Fecha, versión del RBZ, versión de SketchUp y Windows:
- Tiempos medidos (scan, generate y clic de pintura, en modelos de 500 y 1500 piezas):
- `replyStats` copiado del diagnóstico:
- Desvíos encontrados y tickets abiertos:

## Límites conocidos de esta entrega

- **Los pasos 1.4 y PaintPanel.** El panel «Revisar materiales» (`PaintPanel.tsx`) todavía pide un `scan` desde la UI cuando la respuesta no lo trae (vincular, instalar o aplicar). Ese archivo quedó fuera del alcance de esta rama. La corrección propuesta es mostrar la franja en lugar de llamar a `request('scan')` en `refreshAfterWrite`.
- **La huella recorre el modelo** en el timer, fuera de los callbacks. No usa una caché por definición: queda para la etapa S de ARQ-01, si la medición del punto 2.8 lo justifica.
- **ARQ-01 (caché de mallas y exclusión de herrajes) y ARQ-04 (índice de rutas)** no forman parte de esta entrega.
