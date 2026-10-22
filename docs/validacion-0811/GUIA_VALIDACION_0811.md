# Planos Santo 0.8.11 — guía única de validación nativa (Hitos 1 a 7)

**Estado: PENDIENTE DE EJECUCIÓN en SketchUp 2026 real (Windows).** Todo lo que reúne esta candidata se probó solo con dobles de la API de SketchUp, el puente de la UI y la UI compilada en Chromium. Nada se ejecutó en SketchUp. Producción **no aprobada** hasta cumplir los criterios de la §9.

Esta guía reemplaza, para la 0.8.11, a las baterías sueltas. Las fuentes siguen siendo la referencia de detalle:

| Hito | Fuente | Estado en esta candidata |
|---|---|---|
| 1 · Pintura y materiales | `docs/hito1-correcciones-0810/VALIDACION_0810.md`, `docs/hito1-correcciones-089/VALIDACION_LOCAL.md`, informe 0.8.8 en `docs/hito1-pintura-088/validacion-nativa/` | Implementado; **nunca aprobado en nativo** (0.8.8: 10 PASS / 4 FAIL / 5 PENDIENTE; 0.8.9 y 0.8.10 sin corrida) |
| 2 · Pincel diario | `docs/hito2-pincel/VALIDACION_SKETCHUP.md` | Implementado, solo dobles |
| 3 · Modelo → TXT | — | **No implementado** (no hay commits ni docs). NO APLICA |
| 4 · Perfil de maderera / catálogo v2 | — | **No implementado** (`catalog.json` sigue en schema 1). NO APLICA |
| 5 · A4 y etiquetas | — | **No implementado**. NO APLICA (solo regresión de la A4 existente) |
| 6 · Rendimiento y arquitectura | `docs/hito6/VALIDACION_SKETCHUP.md` | Implementado parcial (ARQ-02/03/06/07, F-ARQ-A), solo dobles |
| 7 · Gestión de materiales | `docs/hito7/CONTRATO_MATERIALES.md`, `docs/hito7/COORDINACION.md` | Implementado parcial (MATERIALES-07/08/09/10/11/13/19), solo dobles |

> **Supuesto a confirmar antes de empezar:** el pedido habla de «Hitos 1 a 7», pero en el historial solo hay entregas de los Hitos 1, 2, 6 y 7. Si alguien tiene ramas de los Hitos 3–5 sin integrar, esta candidata no las contiene y no se pueden validar acá.

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

**Aceptación:** R1, R4 y R5 dentro de objetivo, o FAIL documentado con los números y el perfil (`docs/hito1-correcciones-089/perfilar_sketchup.rb`). R3 sin cuelgues es obligatorio.

## 7. Riesgo medio — resto de los Hitos 6 y 7

### 7.1 Ventanas (Hito 6, ARQ-06)
Pasos 4.1–4.9 de `docs/hito6/VALIDACION_SKETCHUP.md`: primera apertura al 80 % en 1366×768, recuerda tamaño, **Plegar** (420×120, foco al modelo), **Desplegar**, **Restablecer ventanas**, monitor secundario y 4K al 150 % (anotar si el tamaño sale al 150 % o al 66 %: ticket `UI.scale_factor`).

### 7.2 Materiales (Hito 7)

| # | Paso | Esperado |
|---|---|---|
| M1 | **Duplicar ficha** de una foto con SKU | Copia sin aprobar, sin favorito, con textura y datos comerciales. |
| M2 | **Archivar ficha** vinculada en el modelo; `V.estados` | Desaparece de la biblioteca activa; el material del modelo se sigue viendo y pintando. **Conocido:** la ficha archivada sigue apareciendo en la paleta de pintura (`COORDINACION.md`): anotarlo como observación, no como regresión. `V.estados` la marca `archivada: true`. |
| M3 | **Restaurar** | Vuelve con sus datos y archivos. |
| M4 | Escala y giro de una ficha desde foto (MATERIALES-10/11): cambiar mm y rotar 90° | Vista previa → aplicar en **un** Ctrl+Z; la textura en el modelo cambia de escala y orientación; al reabrir la copia, persiste. |
| M5 | **Sincronizar con OpenCutList** (MATERIALES-13): con una clave cargada a mano en OCL | Solo escribe lo vacío o lo que escribió Planos Santo; lo del usuario aparece como «se conserva». `V.atributos_ocl` muestra `escritasPorPlanosSanto`. OCL › Partes › Generar agrupa bien. |
| M6 | Pintar desde la biblioteca (MATERIALES-19) | Después de iniciar el pincel, el foco queda en el viewport (una tecla de herramienta funciona sin clic). Anotar si `Sketchup.focus` existe en 2026. |

## 8. Regresión del Hito 1 y lo que no cambia

- **Foto nueva entre modelos:** V2, V3, V7 y V12 de `docs/hito1-correcciones-089/VALIDACION_LOCAL.md` con una foto creada en esta candidata: textura, escala y UV al reabrir, y reutilización en otro `.skp` sin el JPG original.
- **Regresión:** V4, V5, V8, V9, V10, V11, V13, V14, V16 y V17 (OCL 7.1.0 real › Partes › Generar), con instancias **espejadas y rotadas** de un modelo real.
- **A4:** exterior y doble de BM17 (una hoja 297×210, 17 piezas, nota y flecha) idénticas a la 0.8.8.
- **TXT (V18):** bloqueo por orientación sin confirmar y 9 columnas exactas. La exportación comercial sigue PENDIENTE sin un pedido revisado por una persona. **No fabricar aprobaciones.**
- **Hitos 3, 4 y 5:** `V.perfil_maderera` debe dar `disponible: false`. Registrar los tres hitos como **NO APLICA (no incluidos en la candidata)**. Si da `disponible: true`, avisar: la candidata trae algo que esta guía no cubre.

## 9. Criterios de aceptación por hito

| Hito | Aprobado si | Si no se cumple |
|---|---|---|
| Instalación | `V.integridad` → `passed: true` (o `version: '0.8.10'` con la observación 0.9), sin `mismatches`, `extras` ni `faltantes` | Detener: no se valida una instalación distinta del RBZ |
| 1 | PASS en F0–F2, S2–S3, V2, V3, V7 y V12 con foto nueva, V4, V5, V8, V10, V11 y V14 | La candidata sigue PENDIENTE; no se publica |
| 2 | PASS en P-a…P-f y P-g (espejadas) | El hito no cierra; el resto se puede seguir validando |
| 6 | PASS en W1–W4, W7, W10, W11, R1, R3 sin cuelgues, y R4/R5 dentro de objetivo (o FAIL documentado con números) | Ticket con mediciones; no bloquea Hitos 1/2 salvo cuelgues |
| 7 | PASS en Z1, Z2, Z4, Z6 y M1–M5 | Ticket por entregable; no bloquea Hitos 1/2 |
| 3, 4, 5 | NO APLICA | — |

**Aprobación global:** solo con Instalación, Hito 1 y Hito 2 aprobados, Hitos 6 y 7 sin FAIL bloqueante, y la versión subida a 0.8.11. Mientras tanto: `productionApproved: false`.

## 10. Qué devolver

1. `docs/validacion-0811/validacion-nativa/INFORME_VALIDACION_0811.txt`: entorno, SHA-256 del RBZ, matriz PASS/FAIL/PENDIENTE/NO APLICA de cada fila de esta guía con su variante, y el texto completo de la consola ante cualquier error.
2. JSON saneados en la misma carpeta: `resumen`, `integridad`, `foto` (cada imagen), `colisiones`, `atributos_ocl` (antes/después), `model_watch` (W0/W1/W10/W11), `huella`, `tiempo_clic`, `tiempos_pincel`, `paquete` (válido y adulterados), `replyStats`.
3. **Privacidad:** no subir modelos, SKM, fotos, texturas comerciales, catálogos ni rutas personales (reemplazarlas por `<local>`). Las capturas quedan en la PC.
4. Verificar al final que los originales y la biblioteca de producción coinciden con los SHA-256 de 0.2/0.4.
