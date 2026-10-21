# Planos Santo0.7.5 — candidata de ajustes

Estado: **ready_for_sketchup**, verificación automática aprobada; validación nativa propia pendiente. El usuario difirió las pruebas comerciales. No se modificó la0.7.4 validada.

## Cambios

- `material_library.rb`: assetRevision opcional conserva compatibilidad, pero si se envía debe ser entero no negativo. Revisión obsoleta bloquea antes de cualquier operación. Índice visual exige correspondencia exacta assetName/assetHash.
- `PaintPanel.tsx`/estilos: envía revisión visual al vincular e instalar; Actualizar biblioteca cancela preview y reinicia consentimientos; fallos al aplicar descartan token consumido y permiten revisar uno nuevo sin reintento automático; cancelar selección SKM conserva guía/PDF.
- `offline.rb`: cancelar preview ya no depende de tener el modelo original activo, ni requiere un análisis previo. Todos los accesos que leen/modifican el modelo conservan las guardas correspondientes.
- `version.json`/`lib/model.ts`: versión0.7.5; build y recepción web compatibles. Empaquetado de validación generalizado por versión, sin incluir datos privados.
- No cambian formatos de catálogo/guía/TXT ni dibujo A4, nombres, agrupación, cotas o anotaciones.

## Pruebas ejecutadas

`npm run verify`: **exit0**, log `artifacts/verify-pintado-075.log`.

- Ruby: **214 pruebas/1475 aserciones**, 21 suites, sin fallos/errores/omisiones. Biblioteca19/148 y controlador de pintado11/129.
- Vitest:119 pruebas aprobadas; incluye PDF A4 y notas, agrupación, cotas, importación y pedido.
- Playwright:16 pruebas web y47 offline, incluidas8 de pintado. API de pintura del navegador es un doble explícito; los setters se verifican con dobles Ruby, no con SketchUp nativo.
- Lint, typecheck, build Next/offline aprobados.
- `node --import tsx scripts/demo-a4.ts`:3 PDF sintéticos A4, exactamente1página297x210mm cada uno,17piezas. No exportaciones Windows.
- Auditoría `verify_rbz.py --candidate --baseline artifacts/PlanosSanto-0.7.4.rbz`: CRC, hashes, inventario conservado y17 Ruby/JS de sintaxis aprobados, sin omisiones.

## Correcciones y trazabilidad

Los dos defectos de revisión/hash se reprodujeron antes de corregir. Se agregaron5 pruebas de biblioteca,2 de controlador y3 recorridos UI. Incluyen UUID duplicados y reparación explícita, revisión visual obsoleta con catálogo comercial sin cambios, activos desactualizados, recuperación de error y selector cancelado.

Respaldo previo: `artifacts/respaldo-074-antes-ajustes.tar.gz`,199archivos, SHA256 `b454efc69f5adf855b4380890a0e2a8986a355264994a425c564380e683784d1`. Las35 comprobaciones nativas de0.7.4 siguen documentadas por separado y no se contabilizan como prueba de0.7.5.

## Entrega

- `PlanosSanto-0.7.5-candidata.rbz`: 1627561bytes; SHA256 `8902ff7405ab92fbe72411a5c389ee710f3a6af195b3b3d035e6e9a4bcef59ff`.
- ZIP local incluye código/pruebas, logs, hashes, demos e instrucciones; no SKP/SKM ni catálogos privados.
- Cambios/migración/rollback: CHANGELOG.md. Secuencia pendiente: VALIDACION_LOCAL_POSTERIOR.md. Cerrar SketchUp completamente antes de actualizar.

No se ejecutó0.7.5 en SketchUp2026 ni se envió ningún pedido. La candidata no tiene aprobación global de producción; se entrega para usar cuando se retome la validación local.
