# 07 — Backlog priorizado y plan por hitos

**Supuesto:** se adopta la **Opción 1** de `06_DECISION_ARQUITECTURA.md`. Ninguno de estos ítems está implementado. Todo espera la aprobación del dueño.

Talles: S ≤ 2 días · M ≤ 2 semanas · L > 2 semanas.

## P0 — Bloqueantes de operación

| ID | Ítem | Dependencia | Riesgo | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| ~~P0-0~~ | ~~Recuperar el código fuente~~ — **HECHO** durante la auditoría: `main@2bf694f`, build reproducible bit a bit (`01` §2). Pendiente menor: commitear `artifacts/PlanosSanto-0.3.0.rbz` (o adaptar `installation_test.rb`) y forzar UTF-8 en `test-offline-ruby.mjs` | — | — | S | `test-offline-ruby.mjs` en verde en una máquina limpia |
| **P0-1** | **Hotfix de pintado** (ver `05_CAUSA_PINTADO.md` §6.1): (a) auto-instalar al elegir una ficha con activo verificado; (b) ocultar o deshabilitar en la paleta las fichas sin activo; (c) `designFingerprint` separado del comercial; (d) mensajes con la causa real; (e) `ia()` alineada con `gt()` | — | Bajo: reutiliza `MaterialLibrary#install` | S | Casos R1–R5 de `05` pasan: en R1–R4 el pincel se activa sin error, o el mensaje dice la causa exacta; en todos hay Undo; ninguna instancia ajena cambia |
| P0-2 | **Validación cacheada y clic O(pieza)**: validar el material al seleccionarlo; plan local sin `NameManager#inventory` global; una sola planificación por clic | P0-1 | Medio: tocar el motor de pintura | M | T-PERF: latencia por clic ≤ 150 ms en el modelo grande de prueba y sin crecer con el tamaño del modelo; cero hashes de archivos por clic |
| P0-3 | **Decisión de licencia firmada** (Opción 1 + *clean-room*) y regla de escritura de `ladb_opencutlist/type` | — | Legal | S | Documento firmado por el dueño |

## P1 — Pincel nuevo y consistencia

| ID | Ítem | Dependencia | Riesgo | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|---|
| P1-1 | **HUD de materiales en el viewport** (código propio con `view.draw2d`/Overlay): miniaturas o colores, modos placa/canto/quitar, ←/→, Tab, Ctrl+Tab 1/2/4, Alt cuentagotas, "+" que abre la creación desde foto y vuelve con el material seleccionado | P0-1, P0-2 | Medio (API de dibujo 2D en SU 2026) | M | Recorrido B en ≤ 8 clics y 0 ventanas; cambio de material sin salir |
| P1-2 | **Pintar pieza = material de instancia** (+ limpieza de caras amplias solo en definiciones únicas; cantos preservados) | P1-1 | Alto: cambia la semántica | M | T-PAINT-1..4: placa visible al instante; cantos intactos; otras instancias intactas; Undo de 1 paso; el cutlist de OCL lista el material correcto |
| P1-3 | **Cantos 1/2/4 en modo inmediato** con selección en el HUD y política de compartidas visible ("esta / todas las iguales") | P1-1 | Medio | S | 4 cantos en 1 clic; lado correcto en piezas rotadas o espejadas (T-EDGE) |
| P1-4 | **Material libre**: pintar con cualquier material del modelo sin vínculo PS; el vínculo solo hace falta para la maderera | P0-1 | Bajo | S | Un material de color de SketchUp se puede pintar; en Maderera aparece "sin ficha" |
| P1-5 | **Compatibilidad OCL por rango de versión** (≥ 7.1 con detección de capacidades) en lugar de versión y build exactos | — | Bajo | S | Con OCL 7.2 simulado: lectura de tipo y apertura del diálogo siguen funcionando, o se degradan con aviso |
| P1-6 | Escribir `ladb_opencutlist/type` y `thickness` en los materiales creados por PS (si P0-3 lo aprueba) | P0-3 | Bajo | S | El cutlist de OCL agrupa las placas PS como "placa" con su espesor |
| P1-7 | **Validación de la barra**: no deshabilitar todo por cambios sin guardar; deshabilitar solo lo que entra en conflicto y mostrar el motivo en un tooltip | — | Bajo | S | Con la guía sucia, Pintar sigue disponible o explica por qué no |
| P1-8 | **Maderera con pre-completado y confirmación en bloque**: ejes, material y cantos deducidos; confirmar individualmente solo las filas ambiguas | P1-2 | Medio | M | Mueble de 20 piezas sin ambigüedad: ≤ 5 clics hasta el TXT; las ambiguas quedan marcadas |
| P1-9 | **Pruebas**: (a) agregar los casos C1–C5 a los dobles Ruby y Playwright (hoy toda ficha visible tiene material: `tests/offline/immediate-palette.spec.ts:12,24`); (b) que `test-offline-ruby.mjs` corra todos los archivos y reporte un resumen; (c) suite TestUp mínima dentro de SketchUp para pintado y nombres; (d) CI que ejecute `npm run verify` sin la parte de SketchUp | P0-1 | — | M | CI verde; casos C1–C5 cubiertos |
| P1-10 | Nombres: edición directa en la lista + resaltado al hover | — | Bajo | S | Recorrido D en ≤ 4 clics |

## P2 — Productividad

| ID | Ítem | Esfuerzo | Nota |
|---|---|---|---|
| P2-1 | "Optimizar en OCL" con un clic desde Maderera, pasando la selección del mueble | S | Usa `OclGateway`; no reimplementa |
| P2-2 | Presupuesto con desperdicio a partir del resultado de OCL (o placas enteras redondeadas) | M | Después de P1-6 |
| P2-3 | Pick más profundo (ciclar rutas bajo el cursor) | S | Patrón OCL |
| P2-4 | Rendimiento de `skm_library` (no hashear todo al listar; caché por mtime y tamaño) | S | |
| P2-5 | Instalación por lote de los materiales de un proyecto | S | |

## P3 — Futuro
- Etiquetas de piezas (QR o código) · herrajes · biblioteca compartida entre PCs del taller.
- Evaluar la opción 2 (componentes GPL) solo para optimización, si el negocio la justifica.

## Hotfix propuesto (P0-1) — detalle sin aplicar

**Archivos a tocar** (sobre el fuente; nunca sobre los bundles):
1. `sketchup_offline/ui/SmartPaintPalette.tsx:22,111-114`: si no hay `visual` válido pero la ficha tiene activo, llamar a una nueva acción `smart_quick_install_and_start` en lugar de lanzar el error; alinear `usableForPainting` con esa regla.
2. `offline.rb`: nueva acción `smart_quick_install_and_start` → `MaterialLibrary#install(confirmed: true, revision: actual)` con la intención de pintar como confirmación → `quick_paint_start`.
3. `material_resolver.rb` / `material_library.rb` / `native_paint.rb`: autorizar la pintura con `designFingerprint` (origen visual); `catalogFingerprint` sigue gobernando la maderera.
4. Mensajes: un texto distinto por cada causa C1–C5.

**Sin cambio en:** Undo, UUID único, `make_unique` en el modo rápido, regla "no pisar cantos", validaciones de la maderera.

## Secuencia del próximo loop

1. **Hito 0 (semana 0):** P0-3 + pendientes menores de P0-0. Firmar la decisión y preparar los modelos de prueba (copias).
2. **Hito 1 (semana 1):** P0-1 hotfix → RBZ 0.8.8 candidata → pruebas R1–R5 + T-PAINT en SketchUp → **aceptación del operador**.
3. **Hito 2 (semanas 2–3):** P0-2 + P1-4 + P1-5 + P1-7 → 0.9.0.
4. **Hito 3 (semanas 3–6):** P1-1 HUD + P1-2 + P1-3 + P1-6 → 0.10.0, con OCL instalado en paralelo.
5. **Hito 4 (semanas 6–8):** P1-8 maderera en bloque + P1-10 + P1-9 pruebas → 1.0 candidata.
6. **Hito 5:** P2 según la operación real.

Cada hito termina con un RBZ candidato, un manifiesto con hashes y el plan `08` ejecutado sobre **copias** de los modelos reales.
