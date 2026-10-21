# Loop de Pintura Inteligente0.8.0

## Ciclo0 — Respaldo y diseño

Backup075:199archivos, artifacts/respaldo-075-antes-smart-paint.tar.gz, SHA25679f4c9e81b6fb2fe64cb6cb222ea8b85e88c583de2d92c38066153c62b12c492. Las versiones anteriores y evidencias locales permanecen intactas.

Diseño incremental: catálogo/SKM existentes; nuevo servicio SmartPaint por lote, Tool nativa y paleta React. No código upstream OCL copiado ni dependencia instalada; solo compatibilidad de lectura existente. No optimizador.

## Ciclo1 — Servicio y herramienta

SmartPaint: cuatro modos, validación previa, deduplicación compartida, una operación Undo, restauración de placa al quitar cantos y UUID exacto en reemplazo. NativePaint expone helpers reutilizados sin duplicar el antiguo flujo.

Tool: PickHelper identifica ruta/face persistent_id, dibujo transformado e inversa transpuesta para normal espejada. Hover sin mutación, lotes Mayús/Enter, resaltado de pendientes, Escape/cancelación. Autorización para todas y aislamiento explícito seguro.

Pruebas focalizadas:SmartPaint26/114, Tool16/96, regresión NativePaint17/87. Son dobles, no ejecución nativa.

## Ciclo2 — Paleta y correcciones

Paleta permanente, búsqueda/favoritos, cuatro modos, origen exacto, restauración opcional, alcance/ejes/lados y compactación real del HtmlDialog. Se muestran rutas afectadas y se detiene herramienta al cambiar configuración.

Errores detectados/corregidos: estilo global main heredaba grid y solapaba paleta; ancho mínimo del editor impedía compactar; campos vacíos de eliminación impedían inferencia; scopeunique exigía permiso de afectar todas; notificación a ventana cerrada podía convertir una operación terminada en error. Pruebas agregadas para esos casos.

UV afín conservado y comprobado; casos proyectados/ambiguos bloqueados, no reinterpretados. Permisos/UUID de proyecto no se persisten como consentimientos globales.

Controlador7/48 y3 E2E focalizados aprobados. Verificación general en curso; empaquetado080 incluye25archivos+2carpetas y comprueba módulos nuevos faltantes. Falta cerrar evidencia final y entrega; prueba nativa pendiente.

## Ciclo3 — Cierre automático y candidata

`npm run verify`:exit0; Ruby264/1752, TypeScript119, web16, offline50. Lint/build/typecheck aprobados. Auditoría RBZ19Ruby/JS sin omitir, CRC/hashes e inventario correcto. SHA2560.8.0:07b0e3de1244efbe2bcae6937a47946c31e4b66fb8d3e158975c820b2443aaab.

Tres demos A4 sintéticas y captura compacta incluidos, con fuentes/pruebas/instrucciones. Baselines074/075 comprobadas intactas. No hubo ejecución de SketchUp ni scripts privados adjuntos en nube. Estado ready_for_sketchup, pendiente de revisión nativa de herramienta/texturas/Undo/fluidez; no aprobación de producción.
