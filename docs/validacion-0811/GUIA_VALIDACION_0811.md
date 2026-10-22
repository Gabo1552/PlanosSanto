# Planos Santo 0.8.11 — guía única de validación nativa (Hitos 1 a 7)

**Estado: PENDIENTE DE EJECUCIÓN en SketchUp 2026 real (Windows).** Todo lo que reúne esta candidata se probó solo con dobles de la API de SketchUp, el puente de la UI y la UI compilada en Chromium. Nada se ejecutó en SketchUp. Producción **no aprobada** hasta cumplir los criterios de la §12.

Esta guía reemplaza, para la 0.8.11, a las baterías sueltas. Las fuentes siguen siendo la referencia de detalle:

| Hito | Fuente | Estado en esta candidata |
|---|---|---|
| 1 · Pintura y materiales | `docs/hito1-correcciones-0810/VALIDACION_0810.md`, `docs/hito1-correcciones-089/VALIDACION_LOCAL.md`, informe 0.8.8 en `docs/hito1-pintura-088/validacion-nativa/` | Implementado; **nunca aprobado en nativo** (0.8.8: 10 PASS / 4 FAIL / 5 PENDIENTE; 0.8.9 y 0.8.10 sin corrida) |
| 2 · Pincel diario | `docs/hito2-pincel/VALIDACION_SKETCHUP.md` §0–§4 | Implementado, solo dobles |
| 3 · Modelo → TXT | `docs/hito3/VALIDACION_SKETCHUP.md` | Implementado (propuesta de pedido, confirmación en bloque, aplicar a filas, vínculos de cantos, `edgeTotals`, código módulo·pieza), solo dobles |
| 4 · Perfil de maderera / catálogo v2 | — | **No implementado** (`catalog.json` sigue en schema 1). NO APLICA |
| 5 · A4 y etiquetas | Esta guía §9 (no hay batería propia) | Implementado parcial (CANTOS-04, DESPIECE-01 codificar, OPT-14 hoja 2, F-DESP-B referencias parciales, DESPIECE-07 etiquetas), solo dobles |
| 6 · Rendimiento y arquitectura | `docs/hito6/VALIDACION_SKETCHUP.md`, `docs/hito6/RENDIMIENTO.md` | Implementado parcial (ARQ-01 etapa S caché de malla y herrajes fuera del teselado, ARQ-02/03/06/07, F-ARQ-A). Números de `RENDIMIENTO.md` **simulados** |
| 7 · Gestión de materiales y pincel avanzado | `docs/hito7/CONTRATO_MATERIALES.md`, `docs/hito7/COORDINACION.md`, `docs/hito2-pincel/VALIDACION_SKETCHUP.md` §5, `docs/hito2-pincel/DISENO_AVANZADO.md` | Implementado parcial (MATERIALES-07/08/09/10/11/13/19; PINTURA-04/07/11/13/14/15, F-PINT-C), solo dobles |

> **Alcance:** la candidata es la integración `claude/ux-extras-0811` en `9e881dd`. El **Hito 4 no está implementado** (no hay perfil de maderera y `catalog.json` sigue en schema 1): se registra NO APLICA. Lo que no esté en ese commit no se valida con esta guía.

## 0. Preparación (obligatoria, no saltear)

| # | Paso | Detalle |
|---|---|---|
| 0.1 | Equipo | Windows 10/11, SketchUp 2026. Anotar `Sketchup.version`, `RUBY_VERSION`, resolución y escalado (probar 100 % y 150 %). |
| 0.2 | Respaldo de la biblioteca | Copiar **completo** `%LOCALAPPDATA%\PlanosSanto\` a una carpeta de respaldo y anotar el SHA-256 de cada archivo (antes y al final deben coincidir). |
| 0.3 | Biblioteca QA | Copiar ese respaldo a `<local>\qa-library\` y lanzar SketchUp con `PLANOS_SANTO_DATA_DIR=<local>\qa-library`. **Nunca** validar contra la biblioteca de producción. |
| 0.4 | Modelos | Respaldar originales (SHA-256) y trabajar **solo con copias**: M-S (banco chico), BM17 (17 piezas, puertas repetidas), **A** bajo mesada de 6 módulos con 4 puertas copia del mismo componente, **B** casos raros (rebaje, lado partido, pieza sin placa, pieza bloqueada, grupo dentro de componente compartido), **M-L** (≥ 1.500 piezas, con ≥ 20 herrajes curvos). |
| 0.5 | OpenCutList | OCL 7.1.0 **instalado y activo**. No desinstalarlo ni actualizarlo durante la corrida. |
| 0.6 | Instalador | Construir con `LANG=C.UTF-8 node scripts/build-offline.mjs` → `artifacts/PlanosSanto-<versión>.rbz`. Anotar el SHA-256 del RBZ. **Ver 0.9.** |
| 0.7 | Instalación | Cerrar **todas** las ventanas de SketchUp (pedir confirmación humana si hay trabajo ajeno abierto), instalar desde el Administrador de extensiones y reiniciar. Conservar el RBZ 0.8.10 para volver atrás. |
| 0.8 | Consola y logs | Ventana › Consola Ruby abierta durante toda la corrida (líneas `Planos Santo:` y `Planos Santo pincel:`). Log del pincel: `<qa-library>\diagnostico\pincel-tiempos.jsonl`. |
| 0.9 | **Versión** | Al escribir esta guía `sketchup_offline/version.json` dice **0.8.10**: la subida a 0.8.11 todavía no se hizo. Si sigue así, el RBZ sale como `PlanosSanto-0.8.10.rbz` y se confunde con la candidata 0.8.10 anterior. **Identificarlo por SHA-256**, correr `integridad(version: '0.8.10')` y registrar «versión sin subir» como observación (no es FAIL funcional, pero bloquea la publicación). No editar el producto para corregirlo. |
| 0.10 | Fotos de prueba | JPG 1200×1200 que falló en 0.8.8 (SHA `4af47551…`), textura de madera, PNG RGB, PNG con transparencia, JPG de 24 MP, `.txt` renombrado a `.jpg`, JPG truncado. No subirlos a la nube. |

Verificador (solo lectura; no escribe modelo, atributos ni archivos):

```ruby
load 'C:/<repo>/docs/validacion-0811/verificar_0811_sketchup.rb'
V = PlanosSantoValidacion0811
V.resumen          # integridad + ModelWatch + cursores + perfil de maderera + tiempos del pincel
V.integridad       # versión, hashes, sobrantes y módulos nuevos: passed: true
V.cursores         # 4 PNG válidos y API de cursores: ok: true
V.perfil_maderera  # se espera disponible: false (Hito 4 no implementado)
V.ajustes_pincel   # recientes por modo (máximo 6), tecla del cuentagotas, cantos por clic
```

Regla de registro: cada caso lleva **PASS / FAIL / PENDIENTE**, la variante exacta probada, captura local y, si falla, el mensaje literal y el texto completo de la consola. Un PASS confirma solo la variante anotada.

## 1. Riesgo crítico 1 — Fotos e `ImageRep` (Hito 1: V1, V15, A3)

Es lo que bloqueó la 0.8.8 y la causa raíz (`ImageRep#resize` inexistente, `load_file` que devuelve `nil`) se corrigió **sin** pasar nunca por SketchUp. Si falla, **detener la corrida**: todo lo de foto depende de esto.

| # | Paso | Esperado |
|---|---|---|
| F0 | `p Sketchup::ImageRep.method_defined?(:resize)` y `V.foto('C:/<local>/jpg-1200.jpg')` | `false`. `producto.aceptada: true`, `vistaPrevia: true`. Guardar el bloque `imageRep` completo (`loadReturn`, `bitsPerPixel`, `rowPadding`, `size`, `dataBytes`). |
| F1 (V1) | Copia de M-S → Pintar → **+ Material** → JPG 1200×1200 → placa 18 → **Guardar y pintar** → clic en una pieza | Vista previa visible; la pieza toma la **textura real** (no un color plano). |
| F2 (V15) | Ficha con SKU sin visual → **Asignar foto** con el mismo JPG | Pinta con la foto y **conserva SKU y proveedor**. |
| F3 | Repetir F0/F1 con PNG RGB, PNG con alfa y la textura de madera | Aceptadas; anotar `bitsPerPixel` (24/32) de cada una. Un formato no soportado se informa con mensaje claro, sin falso éxito. |
| F4 (A3) | JPG de 24 MP, `.txt` renombrado a `.jpg`, JPG truncado | Los tres rechazados con mensaje; `model.modified?` igual que antes; **cero** archivos nuevos en `qa-library` (comparar listado). |
| F5 (Hito 6 · 1.4) | Crear foto con «Guardar y pintar» con la ventana principal analizada | Aparece la franja **Análisis desactualizado** y la paleta abre igual para pintar. |

**Aceptación:** F0–F2 PASS obligatorios. F3–F5 PASS o FAIL documentado con plan acotado.

## 2. Riesgo crítico 2 — SKM con nombre repetido (Hito 1: V6)

| # | Paso | Esperado |
|---|---|---|
| S0 | En la copia de M-S que tiene «Melamina petiribi18mm»: `V.colisiones` | Lista Caju 18mm con `nombreEnSkm: Melamina petiribi18mm`. Guardar el JSON. |
| S1 | Snapshot previo de materiales (nombre, textura, color/alpha, diccionarios `ladb_opencutlist` y `PlanosSantoMaterial`): `V.atributos_ocl` | JSON guardado. |
| S2 (V6) | Pintar → elegir Caju 18mm («Se instala al elegir») → clic en una pieza | Caju se instala como **material propio** y pinta con **su** textura. «Melamina petiribi18mm» queda **idéntica** (comparar con S1). Nunca se vincula por nombre. |
| S3 | Ctrl+Z | Deshace la pintura; un segundo Ctrl+Z deshace la instalación y el modelo vuelve a S1. |
| S4 | Repetir S2 con el pincel ya activo con otra placa, y en un segundo proceso de SketchUp sobre otra copia | Mismo resultado; ningún «vinculalo explícitamente». |
| S5 | Plywood (caso que ya andaba) y dos fichas distintas con el mismo nombre de SKM | Plywood sigue pintando; las dos fichas quedan como materiales distintos. SHA del SKM original sin cambios. |

**Aceptación:** S2 y S3 PASS obligatorios.

## 3. Riesgo crítico 3 — Pincel 1/2/4 cantos y «Todas las iguales» (Hito 2)

Modelo **A**. Paleta inmediata desde la barra. Criterio (a)–(f) del plan: **una sola falla bloquea el Hito 2**.

| # | Paso | Esperado |
|---|---|---|
| P-a | Pintar canto → elegir canto → selector **4** → pasar el cursor por un estante sin clic | Antes del clic se resaltan **los 4 lados** con el color del canto; tooltip «… · 4 cantos · Solo esta (de N)». Un clic pinta los 4; **un** Ctrl+Z los deshace juntos. |
| P-a2 | Selector **2** sobre un lado largo y luego sobre uno corto | Se resaltan y pintan los dos lados opuestos correspondientes. |
| P-a1 | Selector **1** sobre un canto; en modo canto, clic justo en el borde de una cara angosta y en una arista de esquina (A6/A6c) | Pinta solo esa cara de esa pieza; la esquina no pinta nada. |
| P-b | Pintar pieza → placa B → «**Todas las iguales (4)**» → clic en una puerta | Las 4 puertas pintadas; **un** Undo las revierte. Ventana › Componentes › En el modelo: **misma cantidad de definiciones** antes y después. |
| P-c | «**Solo esta**» → apuntar una puerta → clic | Tooltip «Solo esta (de 4)» antes del clic; cambia solo esa y aparece **una** definición nueva; Undo la revierte y la definición desaparece. |
| P-d | Modelo B, canto con «2» o «4», apuntar la pieza con rebaje | Cursor **prohibido** y motivo en rojo **antes** del clic. Si se hace clic: sin cambios y sin Undo nuevo. Nunca pinta a medias. |
| P-e | Repasar las 4 puertas ya en placa B, en «Todas» y en «Solo esta» (A6b / F-PINT-A) | «ya tiene este material»; Edición › Deshacer muestra la operación anterior; sin definiciones nuevas. |
| P-f | Con la herramienta activa: Tab, Tab, Ctrl+Tab ×3, Mayús+Ctrl+Tab | Tab alterna Pieza ↔ Canto con el último material de cada modo; Ctrl+Tab cicla 1→2→4→1 y la paleta acompaña; la herramienta **nunca** se desactiva. |
| P-g | Pieza rotada, espejada (escala negativa) y dentro de grupo anidado, con 2 y 4 cantos | El resaltado coincide con los lados reales; lo pintado coincide con lo resaltado. |
| P-h | «Todas» sobre una definición con una copia bloqueada | Se rechaza con motivo; no pinta ninguna. |
| P-i | Cambiar material, modo, cerrar la paleta | El conmutador vuelve a «Solo esta». |
| P-j | Canto sobre pieza **sin placa** (F-PINT-B) | Prohibido + «Canto sin placa: pintá primero la placa de esta pieza.» |
| P-k | `V.cursores`; mirar los cursores sobre fondo claro y oscuro, a 100 % y 150 % | `ok: true`. Pieza, canto, quitar y prohibido se distinguen; punto activo en la cruz. Tooltip legible y sin cortes a 150 %. |
| P-l | Paleta avanzada (ventana principal › Pintar) con dos paletas (A7) | Queda una sola paleta; un material nuevo aparece sin reabrir; abrir la separada con Pintar ya abierto en la principal no la cierra sola. |

**Aceptación:** P-a, P-b, P-c, P-d, P-e y P-f PASS obligatorios. P-g obligatorio para espejadas (pendiente desde 0.8.8). El resto PASS o FAIL documentado.

## 4. Riesgo crítico 4 — ModelWatch (Hito 6, ARQ-02/03)

Observers en SketchUp real: si fallan, ponen lento a SketchUp o generan avisos cruzados entre modelos.

| # | Paso | Esperado |
|---|---|---|
| W0 | Sin análisis abierto: `V.model_watch` | `registrado: false`, `ok: true`. |
| W1 | Analizar el modelo chico: `V.model_watch` | `registrado: true`, `adjunto: true`, `modeloActivo: true`, 3 observadores, `demoraSegundos: 0.3`, `ok: true`. |
| W2 | Mover una pieza con la herramienta Mover nativa | Franja **Análisis desactualizado** en **< 1 s**. |
| W3 | Ctrl+Z del movimiento | La franja desaparece sola. |
| W4 | Bote de pintura **nativo** sobre una cara | Aparece la franja. |
| W5 | Cambiar el color de un material en uso desde el navegador nativo | Franja + las paletas de Planos Santo se refrescan (MATERIALES-12). |
| W6 | Agregar un material **sin uso** | La paleta se refresca; **no** aparece la franja. |
| W7 | Pintar con Planos Santo, detener la herramienta y Ctrl+Z (PINTURA-18) | Franja visible con el motivo «Pintaste desde Planos Santo.»; **ningún** análisis automático; SketchUp no se congela. |
| W8 | Seleccionar/deseleccionar rápido y orbitar en M-L | Sin lentitud; la selección no muestra la franja. |
| W9 | 20 movimientos seguidos con flechas en M-L; después `V.huella` | Un solo cálculo de huella por ráfaga. Anotar `mediana` de `huella` y `estable: true`. Si pasa de ~200 ms: ticket de caché por definición (no bloquea). |
| W10 | Cerrar Planos Santo y la paleta; editar | `V.model_watch` → `registrado: false`; sin avisos en consola. |
| W11 | Archivo › Abrir otro modelo con Planos Santo abierto | El observer se suelta del anterior: `V.model_watch` → `ok: true` (o `registrado: false` si se cerró el análisis); sin avisos cruzados. |
| W12 | Con la franja visible: Guardar guía / Exportar PDF; luego **Reanalizar** | Se bloquea con «El análisis está desactualizado…»; Reanalizar analiza una vez y la franja desaparece. |

**Aceptación:** W1–W4, W7, W10 y W11 PASS obligatorios.

## 5. Riesgo crítico 5 — Paquete .zip de materiales (Hito 7, MATERIALES-07)

Diálogos nativos de archivo, ZIP real escrito por Ruby y lectura en otra biblioteca: nada de eso se ejecutó en Windows.

| # | Paso | Esperado |
|---|---|---|
| Z1 | Materiales → **Exportar paquete .zip** con 3 fichas (foto, SKM y color) a `<local>\paquete-qa.zip` | Resultado con fichas, archivos, bytes y SHA-256. Las archivadas **no** se incluyen. |
| Z2 | `V.paquete('C:/<local>/paquete-qa.zip')` | `valido: true`, mismas cantidades que Z1, `nombresRepetidos` = las 3 (misma biblioteca). |
| Z3 | Abrir el ZIP con el Explorador de Windows | Solo `manifest.json`, `photo-assets/`, `material-assets/`, `skm-import-assets/`. |
| Z4 | En **otra** biblioteca QA vacía (`PLANOS_SANTO_DATA_DIR` distinto, reiniciar SketchUp): **Importar paquete .zip** | Vista previa con miniaturas; 3 «Nueva · pendiente». Importar → fichas sin aprobar, ids nuevos. Elegir una en Pintar y pintar: textura real. |
| Z5 | Importar el mismo paquete otra vez | «Ya está en la biblioteca»; no se duplican. Con un nombre igual y contenido distinto: «Nombre en conflicto», exige renombrar o desmarcar; nunca sobrescribe. |
| Z6 | Paquetes adulterados (copias): un archivo agregado fuera de las carpetas, un byte cambiado en un SKM, `manifest.json` borrado | `V.paquete` → `valido: false` con el motivo; la UI rechaza **todo** el paquete; la biblioteca no cambia (comparar listado). |
| Z7 | Cancelar en el diálogo de archivo y en la vista previa | `cancelled`; la biblioteca no cambia. |

**Aceptación:** Z1, Z2, Z4 y Z6 PASS obligatorios.

## 6. Riesgo crítico 6 — Rendimiento con más de 1.500 piezas (Hitos 2 y 6)

Línea base 0.8.8 en M-L (1.560 piezas): **544,9 ms** por plan. Objetivos del plan: scan < 10 s, clic < 150 ms, ningún «SketchUp no respondió».

| # | Paso | Esperado |
|---|---|---|
| R1 | Abrir M-L (copia). Abrir Planos Santo y analizar; cronometrar | < 10 s, sin «SketchUp no respondió». Árbol sin mallas (`deferred`). |
| R2 | Ayuda › Ver diagnóstico | Copiar `replyStats` (acción, bytes, ms, partes) de `scan` y `generate`. |
| R3 | Generar 1 mueble y después 10 juntos | Mallas solo de los elegidos; respuestas > 1 MB llegan en partes; > 8 MB dejan aviso en consola; > 48 MB → error claro, nunca cuelgue. |
| R4 | Seleccionar una pieza, `V.tiempo_clic('<catalogId ready>')` | Medianas de `clic` y `vistaPrevia`; `cumple` = clic < 150 ms. |
| R5 | 20 clics reales de placa y 20 de canto con 4 lados que **cambien** material; luego `V.tiempos_pincel` | Anotar `total.p50/p95/max`, `porModo`, `cambios`. Objetivo p95 < 150 ms. Si p95 > 200 ms, es FAIL del criterio del Hito 6. |
| R6 | `V.huella` (ver W9) | Mediana de la huella. |
| R7 | Pintar 10 piezas seguidas (Hito 6 · 1.6) | Ningún clic dispara un análisis completo. |
| R8 | Materiales y Maderera desde la barra con Planos Santo cerrado (ARQ-07) | Abren de inmediato, sin scan. Ir a Muebles muestra «Modelo sin analizar · Analizar». |
| R9 (ARQ-01) | `V.analisis` en M-L | `equivalente: true` (con y sin caché, el árbol es idéntico). Anotar las dos medianas: la de `conCache` tiene que ser menor. `avisosHerraje` ≈ cantidad de herrajes con material OCL tipo herraje. |
| R10 (ARQ-01) | Generar el mueble que tiene bisagras/tiradores de Warehouse con material OCL de herraje; comparar el despiece y la A4 con los de la 0.8.10 en la misma copia | Los herrajes **no** aparecen en el despiece ni en la A4 y llevan el aviso «Herraje…». **Todas las demás piezas** quedan iguales (cantidad, medidas, material). Una placa pintada dentro de un contenedor de herraje sigue apareciendo. |
| R11 (ARQ-01) | Mismo componente con dos materiales heredados distintos (dos copias pintadas a nivel instancia); generar | Cada copia sale con su material: la caché por `(definición, material heredado)` no los mezcla. |

**Aceptación:** R1, R4 y R5 dentro de objetivo, o FAIL documentado con los números y el perfil (`docs/hito1-correcciones-089/perfilar_sketchup.rb`). R3 sin cuelgues, R9 `equivalente: true`, R10 y R11 son obligatorios: una caché que cambie el despiece es un FAIL bloqueante aunque sea más rápida.

## 7. Riesgo alto — Pincel avanzado (Hito 7: PINTURA-04/07/11/13/14/15, F-PINT-C)

Detalle completo y filas marcadas **(bloquea)** en `docs/hito2-pincel/VALIDACION_SKETCHUP.md` §5. Lo que más puede fallar en Windows real: Alt (abre el menú de SketchUp), el orden real de `PickHelper` en profundidad y `draw2d` con escalado. Modelos A y B.

| # | Paso | Esperado |
|---|---|---|
| AV1 (PINTURA-07) | Pintar pieza activo → **sostener Alt** → clic en un canto ya pintado de otra pieza → soltar Alt | Cursor de cuentagotas mientras se sostiene; el clic **no pinta**, toma el canto y pasa a Pintar canto con ese material; sin Undo nuevo. |
| AV2 (PINTURA-07) | Sostener y soltar Alt solo; luego Alt+Tab a otra ventana y volver | **No** se abre el menú de SketchUp ni se pierde el foco; el pincel no queda trabado en cuentagotas. Si el menú se abre: anotarlo, cambiar a Mayús en la paleta y repetir AV1. `V.ajustes_pincel` → `teclaCuentagotas`. |
| AV3 (PINTURA-11) | Apuntar una puerta que tapa un estante → ↓ → clic sin mover el mouse | El resaltado pasa a la pieza de atrás («2 de N»); se pinta **el estante**, no la puerta; un Ctrl+Z lo deshace. Al mover el mouse y volver, la profundidad se reinicia. |
| AV4 (PINTURA-15) | Modelo B, lado partido por una arista (dos caras coplanares): canto con 1, 2 y 4 | El preview resalta **el lado entero** y el clic pinta las dos caras en **un** Undo. |
| AV5 (PINTURA-15) | Pieza con **rebaje**, canto con 2 y 4 | Bloqueado antes del clic con «Un lado no está cubierto por caras planas completas…»; sin pintura ni Undo. |
| AV6 (PINTURA-04) | Elegir 3 placas y 2 cantos; clic en un cuadrado de la tira; teclas 1–6; cerrar y reabrir SketchUp | La tira muestra los del modo actual; elegir **no pinta** ni crea Undo; las teclas no disparan atajos de SketchUp (anotar si alguno lo hace). Tras reabrir: `V.ajustes_pincel` → `recientes` con 6 o menos por modo; un material borrado de la biblioteca no aparece. Tira nítida y dentro de la vista a 100 % y 150 %. |
| AV7 (PINTURA-13) | Clic derecho → «Ocultar esta pieza» → Ctrl+Z; «Renombrar pieza…» en una copia de componente compartido; ambos en una pieza bloqueada | Ocultar y renombrar en **un** Undo cada uno; renombrar cambia solo esa instancia; en la bloqueada se rechazan con motivo. El pincel sigue activo. |
| AV8 (F-PINT-C) | Modelo B → «Resaltar lo que falta» → pintar la placa de una pieza marcada → Ctrl+Z | Rojo translúcido en las piezas sin placa, «Sin placa: N» igual al conteo manual; pintar la saca en el mismo clic; Ctrl+Z la vuelve a marcar. En M-L con el resaltado activo, orbitar 10 s no traba SketchUp. |
| AV9 (PINTURA-14) | «Transparencia» desde la paleta y desde el menú | Alterna rayos X; **sin** Undo, sin detener el pincel y sin franja de análisis desactualizado. |

**Aceptación:** AV1, AV3, AV4, AV5, AV7 (ocultar y renombrar) y AV8 PASS obligatorios. AV2 es obligatorio en su forma «sin menú con Alt **o** con Mayús»: si Alt abre el menú y Mayús funciona, es PASS con observación.

## 8. Riesgo alto — Del modelo al TXT (Hito 3)

Es el de mayor impacto económico: un canto mal deducido se compra y se corta mal. Detalle en `docs/hito3/VALIDACION_SKETCHUP.md`. Placard de unas 30 piezas pintado con el pincel (copia), guía guardada con módulos `M01…` y códigos `P01…`.

| # | Paso | Esperado |
|---|---|---|
| T1 | Analizar → Biblioteca y pedidos → Pedido maderera → `V.pedido` (antes de tocar la UI) | `porcentajeRevision` ≤ 20 y `cumple: true`; anotar `msProponer`, `msConfirmarEnBloque` y `motivosRevision`. El modelo no cambia y no se guarda nada. |
| T2 | **Proponer pedido desde el modelo** en la UI | Mismo resumen que `V.pedido.propuesta` (propuestas, en revisión, conservadas). Ninguna fila queda confirmada sola. |
| T3 | Vista 2D de: una puerta, un lateral, un estante, una pieza **cuadrada** y una **espejada** | Arriba/abajo/izquierda/derecha coinciden con las caras pintadas en el modelo; U = largo; espesor = el de la placa. |
| T4 | **Confirmar en bloque las filas sin ambigüedad** | Ninguna pieza con veta, espejada, cuadrada, con lados sin resolver o con cantos que dependen de la cara vista se confirma; cada una muestra su motivo. Igual a `V.pedido.confirmables`. |
| T5 | «Aplicar a…» desde un lateral a 3 laterales iguales y a una pieza no equivalente, cambiando solo el canto | En los destinos se pierde **solo** la verificación de cantos; placa, corte y veta siguen confirmados. |
| T6 | Canto pintado con un material sin vínculo de Planos Santo → vincularlo en «Vínculos de cantos del borrador» → volver a proponer | La fila toma ese canto; un vínculo nativo, si existe, manda sobre la tabla. |
| T7 | Activar «código módulo·pieza» → exportar TXT + manifiesto a `<local>` | Detalle `M03·P07 Lateral`, 80 caracteres como máximo; un código repetido entre muebles bloquea la fila con motivo. 9 columnas, TAB y CRLF iguales a la 0.8.10. |
| T8 | Comparar el TXT **línea por línea** con uno armado a mano para el mismo mueble; `lots[].edgeTotals` del manifiesto contra metros calculados a mano | Coinciden. Control: 2 piezas de 700 × 450 con canto arriba y abajo = **2,8 m**, 4 lados, 2 piezas. |
| T9 | Guardar borrador → Ctrl+Z; cerrar y reabrir el SKP | Ctrl+Z deshace solo el borrador; proponer, confirmar en bloque y aplicar **no** dejan Undo. Al reabrir, anotar si la tabla de vínculos sigue vigente (limitación conocida del `entityID`). |

**Aceptación:** T1 (≤ 20 %), T3, T4, T5 y T8 PASS obligatorios. La importación del TXT con `M03·P07` en el sistema de la maderera queda **PENDIENTE** hasta un envío de prueba real; no se da por aprobada. El TXT sigue `production_ready=false`.

## 9. Riesgo medio — Planos A4 y etiquetas (Hito 5)

Sin batería propia: estos casos salen de los commits del hito y del plan (`PLAN_PARIDAD_OCL.md` §5, Hito 5). Usar el placard de §8 con el pedido **guardado**.

| # | Paso | Esperado |
|---|---|---|
| A1 (DESPIECE-01) | Muebles → **Codificar despiece** → vista previa → aplicar → Guardar guía | Solo se codifican piezas sin código, en orden placa → espesor → largo → ancho, `P01…` únicos. «Renumerar» avisa que cambia códigos ya impresos y guarda el código anterior. Sin «Renumerar», un código guardado no cambia. |
| A2 (F-DESP-B) | Con 2 filas del pedido sin validar: `V.referencias_parciales`; exportar la A4 | Las filas validadas imprimen su referencia; las demás «pendiente de pedido», con leyenda. `pendientes` coincide con lo impreso. Con pendientes, `lotesDefinitivos: false` y la A4 no muestra número de lote. |
| A3 (CANTOS-04) | Elegir 5 piezas asimétricas al azar | El glifo de la tabla A4 (trazo lleno = principal, discontinuo = secundario) y el código `1·1·0·2` coinciden con el TXT y con la vista 2D en las 5. |
| A4 (OPT-14) | Cocina de más de 40 piezas: exportar sin y con «Permitir hoja 2: despiece completo» | Sin consentimiento: bloqueo con aviso que ofrece la opción. Con consentimiento: hoja 1a con vistas y notas, 1b… con el despiece agrupado por placa, numeración 1a/1b en encabezado y pie; **nada truncado**. |
| A5 (DESPIECE-07) | **Etiquetas de piezas** → plantilla 3×7 y 2×5 → imprimir en hoja autoadhesiva real con márgenes ajustados | Una etiqueta por pieza física (aunque el TXT agrupe), con `M03·P07`, base × altura según el pedido, esquema de cantos, flecha de veta y lote. Alineadas con la hoja; ningún texto recortado. |
| A6 | Regresión: A4 exterior y doble de BM17 | Una hoja 297 × 210, 17 piezas, nota y flecha, idénticas a la 0.8.10 salvo las marcas nuevas. |

**Aceptación:** A2, A3 y A4 (sin truncar) PASS obligatorios. A5 en papel real: PASS o PENDIENTE si no hay hojas autoadhesivas (no se simula).

## 10. Riesgo medio — resto de los Hitos 6 y 7

### 10.1 Ventanas (Hito 6, ARQ-06)
Pasos 4.1–4.9 de `docs/hito6/VALIDACION_SKETCHUP.md`: primera apertura al 80 % en 1366×768, recuerda tamaño, **Plegar** (420×120, foco al modelo), **Desplegar**, **Restablecer ventanas**, monitor secundario y 4K al 150 % (anotar si el tamaño sale al 150 % o al 66 %: ticket `UI.scale_factor`).

### 10.2 Materiales (Hito 7)

| # | Paso | Esperado |
|---|---|---|
| M1 | **Duplicar ficha** de una foto con SKU | Copia sin aprobar, sin favorito, con textura y datos comerciales. |
| M2 | **Archivar ficha** vinculada en el modelo; `V.estados` | Desaparece de la biblioteca activa; el material del modelo se sigue viendo y pintando. **Conocido:** la ficha archivada sigue apareciendo en la paleta de pintura (`COORDINACION.md`): anotarlo como observación, no como regresión. `V.estados` la marca `archivada: true`. |
| M3 | **Restaurar** | Vuelve con sus datos y archivos. |
| M4 | Escala y giro de una ficha desde foto (MATERIALES-10/11): cambiar mm y rotar 90° | Vista previa → aplicar en **un** Ctrl+Z; la textura en el modelo cambia de escala y orientación; al reabrir la copia, persiste. |
| M5 | **Sincronizar con OpenCutList** (MATERIALES-13): con una clave cargada a mano en OCL | Solo escribe lo vacío o lo que escribió Planos Santo; lo del usuario aparece como «se conserva». `V.atributos_ocl` muestra `escritasPorPlanosSanto`. OCL › Partes › Generar agrupa bien. |
| M6 | Pintar desde la biblioteca (MATERIALES-19) | Después de iniciar el pincel, el foco queda en el viewport (una tecla de herramienta funciona sin clic). Anotar si `Sketchup.focus` existe en 2026. |

## 11. Regresión del Hito 1 y lo que no cambia

- **Foto nueva entre modelos:** V2, V3, V7 y V12 de `docs/hito1-correcciones-089/VALIDACION_LOCAL.md` con una foto creada en esta candidata: textura, escala y UV al reabrir, y reutilización en otro `.skp` sin el JPG original.
- **Regresión:** V4, V5, V8, V9, V10, V11, V13, V14, V16 y V17 (OCL 7.1.0 real › Partes › Generar), con instancias **espejadas y rotadas** de un modelo real.
- **TXT (V18):** con `detailCode` ausente el TXT es idéntico al de la 0.8.10; bloqueo por orientación sin confirmar y 9 columnas exactas. La exportación comercial sigue PENDIENTE sin un pedido revisado por una persona. **No fabricar aprobaciones.**
- **Hito 4:** `V.perfil_maderera` debe dar `disponible: false`. Registrarlo como **NO APLICA (no incluido en la candidata)**. Si da `disponible: true`, avisar: la candidata trae algo que esta guía no cubre.

## 12. Criterios de aceptación por hito

| Hito | Aprobado si | Si no se cumple |
|---|---|---|
| Instalación | `V.integridad` → `passed: true` (o `version: '0.8.10'` con la observación 0.9), sin `mismatches`, `extras` ni `faltantes` | Detener: no se valida una instalación distinta del RBZ |
| 1 | PASS en F0–F2, S2–S3, V2, V3, V7 y V12 con foto nueva, V4, V5, V8, V10, V11 y V14 | La candidata sigue PENDIENTE; no se publica |
| 2 | PASS en P-a…P-f y P-g (espejadas) | El hito no cierra; el resto se puede seguir validando |
| 3 | PASS en T1 (≤ 20 % en revisión), T3, T4, T5 y T8 | No se usa el TXT propuesto para pedir; ticket con las filas mal deducidas |
| 5 | PASS en A2, A3 y A4 | No se imprimen referencias parciales ni hoja 2 para el taller |
| 6 | PASS en W1–W4, W7, W10, W11, R1, R3 sin cuelgues, R9–R11, y R4/R5 dentro de objetivo (o FAIL documentado con números) | Ticket con mediciones; no bloquea Hitos 1/2 salvo cuelgues o un despiece distinto por la caché (R9–R11), que bloquea la candidata |
| 7 | PASS en Z1, Z2, Z4, Z6, M1–M5 y los obligatorios de AV (§7) | Ticket por entregable; no bloquea Hitos 1/2 |
| 4 | NO APLICA | — |

**Aprobación global:** solo con Instalación, Hito 1 y Hito 2 aprobados, Hitos 3, 5, 6 y 7 sin FAIL bloqueante, y la versión subida a 0.8.11. Mientras tanto: `productionApproved: false`.

## 13. Qué devolver

1. `docs/validacion-0811/validacion-nativa/INFORME_VALIDACION_0811.txt`: entorno, SHA-256 del RBZ, matriz PASS/FAIL/PENDIENTE/NO APLICA de cada fila de esta guía con su variante, y el texto completo de la consola ante cualquier error.
2. JSON saneados en la misma carpeta: `resumen`, `integridad`, `foto` (cada imagen), `colisiones`, `atributos_ocl` (antes/después), `model_watch` (W0/W1/W10/W11), `huella`, `tiempo_clic`, `tiempos_pincel`, `paquete` (válido y adulterados), `analisis`, `pedido`, `referencias_parciales`, `ajustes_pincel`, `replyStats`, más el TXT y el `manifest.json` de T7 **solo si** no contienen SKU ni precios reales (si los contienen, quedan en la PC).
3. **Privacidad:** no subir modelos, SKM, fotos, texturas comerciales, catálogos ni rutas personales (reemplazarlas por `<local>`). Las capturas quedan en la PC.
4. Verificar al final que los originales y la biblioteca de producción coinciden con los SHA-256 de 0.2/0.4.
