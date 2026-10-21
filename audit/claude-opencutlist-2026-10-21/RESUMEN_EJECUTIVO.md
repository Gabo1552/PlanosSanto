# Resumen ejecutivo — Planos Santo vs OpenCutList

**Para:** dueño del taller · **Fecha:** 2026-10-21 · **Base auditada:** Planos Santo 0.8.7 (RBZ verificado) y OpenCutList 7.1.0 (commit `1ef3e14c`)
**Importante:** la auditoría se hizo sobre el código fuente de `main` (idéntico al RBZ 0.8.7: el build lo reproduce bit a bit), corriendo las 422 pruebas del proyecto, **sin abrir SketchUp**. Lo que dice "confirmado" está confirmado en el código o en las pruebas; los tiempos y los clics reales todavía hay que medirlos.

## 1. ¿Por qué falla el pintado?
**Causa confirmada en el código.** La ventana de pintura muestra las **fichas de la biblioteca** (las que viven en la PC), pero para pintar exige que ese material ya esté **cargado dentro del modelo abierto**, con su vínculo intacto. Ninguna parte del flujo lo carga sola. Entonces:
- **"Caju 18mm"**: casi seguro se creó desde foto **en otro modelo**. Aparece en la lista, pero en este modelo no existe.
- **"Camellia"**: ficha aprobada para la maderera, **sin material cargado** en el modelo.
- Además, **completar datos comerciales** (SKU, proveedor, formato) **rompe el vínculo** y vuelve a bloquear la pintura.
- Reproduje las dos primeras situaciones (ficha aprobada sin material y cambio de SKU) con las pruebas automáticas del proyecto: **las dos dan exactamente el bloqueo de la captura**. Ninguna prueba existente cubría este caso.
- El mensaje dice "textura no válida", pero **el problema real es "no está cargado en este modelo"**. El error se genera en la ventana web, antes de llegar al motor.

## 2. ¿Por qué OpenCutList es tan directo?
No es magia de código, son **decisiones de diseño**:
1. Usa **solo los materiales del modelo**: lo que ves es lo que podés pintar.
2. La **barra de materiales está dentro de la vista 3D**: no hay ventanas aparte.
3. Pinta **la pieza entera** (el material del grupo o componente) con un clic.
4. **No revalida nada pesado en cada clic.**

Planos Santo, en cambio, recorre **todo el modelo ≈ 7 veces y relee y verifica los archivos de la foto ≈ 6 veces por cada clic** (deducido del código). En modelos grandes, esto va a sentirse lento.

## 3. ¿Qué hace mejor Planos Santo? (hay que conservarlo)
- **Nombres por mueble** con prefijo de módulo, sincronizados con la guía.
- **Guía A4 de armado** con vista exterior e interior, piezas ocultas solo en la vista y notas.
- **TXT para la maderera** con las 9 columnas exactas, por lotes y con manifiesto.
- **Seguridad**: no pisa cantos, protege los componentes compartidos y cada acción se deshace con un Ctrl+Z.

OpenCutList **no tiene** nada de esto. A cambio, tiene **optimización de placas, costos con desperdicio y etiquetas**, que Planos Santo no tiene.

## 4. ¿Seguimos con lo nuestro, copiamos o hacemos un fork?

| Opción | Veredicto |
|---|---|
| **1. Seguir con Planos Santo y copiar las *ideas* de OCL (no su código)** | **Recomendada.** Rápida, sin obligaciones de licencia y conserva lo propio |
| 2. Incorporar partes del código de OCL | Posible, pero obliga a publicar Planos Santo como GPLv3 si se entrega a terceros. Plan B solo para optimización |
| 3. Fork de OCL con nuestra marca | **No conviene hoy:** son ≈ 80.000 líneas ajenas, binarios y licencia GPLv3, y habría que rehacer lo que ya hacemos mejor |

**Sobre la licencia GPLv3 de OCL:** se puede estudiar y aprender de su código libremente. Si **copiamos** código suyo y **entregamos** el programa a otros, hay que publicar todo nuestro código bajo GPLv3. Para uso **solo interno** en el taller no hay esa obligación. *No es asesoramiento legal; si se piensa vender, consultarlo.*

**OpenCutList sigue instalado** al lado, como motor de optimización y costos.

## 5. Plan (sin programar hasta que lo apruebes)

| Hito | Qué | Resultado para el taller |
|---|---|---|
| 0 | Firmar la decisión (el **código fuente ya está en `main`** y es idéntico al RBZ 0.8.7) | Base para trabajar |
| 1 (≈ 1 semana) | **Hotfix**: si un material no está en el modelo, se carga solo al elegirlo; los datos comerciales dejan de bloquear la pintura; mensajes claros | **Se termina el error de la captura** |
| 2 (≈ 2 semanas) | Pintado rápido: sin recorrer todo el modelo en cada clic | Clic instantáneo en modelos grandes |
| 3 (≈ 3 semanas) | **Barra de materiales dentro de la vista 3D**; pintar la pieza entera; 4 cantos en un clic; cuentagotas con Alt | Pintar como en OpenCutList, sin ventanas |
| 4 (≈ 2 semanas) | Maderera con datos pre-completados y confirmación en bloque; pruebas automáticas | Pedido de un mueble en pocos clics |
| 5 | Botón "Optimizar en OpenCutList"; presupuesto con desperdicio | Costos reales |

Cada hito se prueba **sobre copias** de modelos reales, con el plan `08_PLAN_PRUEBAS_SKETCHUP.md`.

## 6. Lo que necesito de vos
1. ~~El código fuente~~: **recibido** en `main`. Verifiqué que es exactamente la 0.8.7 y que las pruebas del proyecto pasan (422; 1 falla por un archivo que falta).
2. **Aprobar la opción 1** y la regla de *clean-room* (no copiar código de OCL).
3. Decidir si Planos Santo puede **escribir el tipo OCL** (placa/canto) en sus propios materiales, para que OpenCutList los reconozca solo.
4. Decidir qué hacer al pintar el **canto de piezas gemelas** (componentes iguales): ¿"solo esta" o "todas las iguales" por defecto?
5. 3–4 **copias** de modelos reales para las pruebas.

**Documentos de detalle:** `01_ESTADO_ACTUAL` · `02_MAPA_CODIGO` · `03_MATRIZ_GAPS.csv` · `04_AUDITORIA_UX` · `05_CAUSA_PINTADO` · `06_DECISION_ARQUITECTURA` · `07_BACKLOG_PRIORIZADO` · `08_PLAN_PRUEBAS_SKETCHUP`.
