# Pintura Inteligente — candidata0.8.0

Estado: **ready_for_sketchup**; código funcional y automatización aprobados. **Pendiente de validación nativa en SketchUp2026; no aprobada para producción.**

## Uso e implementación

Abrir Pintado directo desde el editor, elegir material del catálogo y activar una vez. La paleta compacta queda disponible junto al modelo. Clic pinta; Mayús acumula superficies, Enter aplica el lote y Escape cancela pendientes. Cambiar material/modo detiene la herramienta anterior; no hay formulario por cada clic.

- `smart_paint.rb`: placas, cantos, quitar cantos restaurando placa aprobada y reemplazo por UUID exacto del mismo tipo. Valida todos los destinos antes de escribir, deduplica caras compartidas y realiza UNA operación Undo por aplicación/lote, con rollback íntegro. No-op no consume Undo anterior.
- `native_paint.rb`: helpers de preparación/aislamiento reutilizados por SmartPaint; el flujo anterior se conserva.
- `smart_paint_tool.rb`: PickHelper con ruta física completa, contexto de edición, caras persistentes, overlay transformado, normales por inversa transpuesta y selección pendiente cyan. Solo aplica tras activación explícita y autorización del alcance; hacer única conserva restricciones de ancestros.
- `SmartPaintPalette.tsx`/CSS/App: paleta reutilizable, favoritos, búsqueda, muestras de materiales reales, cuatro modos, restauración automática o placa explícita, origen exacto, lados/ejes/alcance y compacto. Muestra pieza/cara/rutas antes de hacer clic. No inventa texturas cuando falta un visual.
- `offline.rb`: activar/detener/estado, notificaciones de tool y compactación real del HtmlDialog. Cada cambio invalida el documento anterior; al detener se relee conservando guía guardada. Cerrar ventana detiene herramienta. Un fallo de notificación no convierte una modificación ya terminada en fracaso.
- Se recuerdan ajustes por Sketchup.write_default solo al activar; permisos compartidos y UUID de origen/proyecto no se persisten como autorizaciones.

## Materiales, orientación y compatibilidad

Usa catálogo y MaterialLibrary existentes, con asociaciones propias verificadas, sin OpenCutList instalado para materiales propios. Lectura OCL heredada conserva su verificación de versión/conflictos y es solo lectura. No se copió código upstream SmartPaint.

La geometría y la cámara no se rotan. Ejes de corte explícitos, caras físicas y alcance compartido se validan antes del lote. UV afines existentes se capturan con API pública y se restauran comprobando coordenadas y escala real. UV proyectadas/distorsionadas, API insuficiente o placa de restauración ambigua bloquean antes de modificar. La comprobación visual de veta/UV queda pendiente; no se afirma certificación industrial.

## Pruebas ejecutadas

`npm run verify`: **exit0**, log `artifacts/verify-pintado-080.log`.

- Ruby: **264 pruebas / 1752 aserciones**, 24 suites, sin fallos/errores/omisiones. SmartPaint26/114, Tool16/96, controlador7/48, regresión NativePaint17/87.
- Vitest119, web16 y editor offline50 pruebas aprobadas, incluidas3 E2E nuevas de paleta. Estas últimas prueban React con bridge de pintura explícitamente simulado y sesión sintética Ruby; no equivalen a mover el ratón en SketchUp.
- Lint, typecheck, build web y offline aprobados. Auditoría RBZ conserva inventario0.7.5, CRC/SHA correctos y19 Ruby/JS sintácticamente verificados sin omisiones.
- `node --import tsx scripts/demo-a4.ts`: tres PDFs sintéticos, una página297x210mm,17piezas, exterior/interior/doble; no son PDF nativos nuevos.
- UI revisada a420px: corregida herencia grid que solapaba elementos y disposición compacta2x2. Captura incluida marcada SINTETICA. Mocks cubren cola/overlay, espejos, cancelación, modo único, ambigüedad, bloqueo, UUID exacto, restauración, revalidación y UV/abort.

## Entrega y conservación

RBZ interno0.8.0, 1641900bytes, SHA256 `07b0e3de1244efbe2bcae6937a47946c31e4b66fb8d3e158975c820b2443aaab`. Contiene25archivos incluyendo manifiesto y2carpetas. Bootstrap exige los módulos nuevos y se prueban archivos faltantes/CRC/inventario.

Se entregan RBZ candidata y ZIP local con fuentes, pruebas, logs, demos e instrucciones. No contiene SKP/SKM ni catálogos privados. Baselines0.7.4 y0.7.5 intactas. Respaldo075 de199archivos SHA256 `79f4c9e81b6fb2fe64cb6cb222ea8b85e88c583de2d92c38066153c62b12c492`.

Se preservan catálogo/guías schema1, PDF A4, vistas, cotas, nombres, anotaciones y TXT. No se incorpora optimizador ni presupuestos nuevos. Validación específica nativa y benchmark en modelos grandes se describen en VALIDACION_LOCAL_POSTERIOR.md. La evidencia nativa0.7.4 permanece separada y no valida esta versión.
