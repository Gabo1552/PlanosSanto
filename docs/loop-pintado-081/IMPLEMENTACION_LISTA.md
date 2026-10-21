# Candidata0.8.1 — P2 de preferencias

Corrección implementada y probada en nube; **pendiente confirmar recuperación real en SketchUp2026**. No aprobada para producción global.

## Problema y arreglo

El informe local080 identifica un defecto del producto: JSON crudo pasado a write_default causa SyntaxError al leerse en la implementación nativa observada. No se atribuye al harness.

Se reprodujo con un doble evaluador de cadenas: antes del arreglo falla con el mismo inicio de cadena y SyntaxError. Se guarda ahora smart_paint_settings_v2 como prefijo ps2: más Base64 estricto de un sobre JSON schema2. Comillas/Unicode sobreviven sin evaluación del JSON como código. El producto no agrega eval.

La lectura antigua válida es compatible y de solo lectura. Dato v1 ilegible retorna opciones vacías sin reescribirlo; elegir ajustes y Activar crea registro nuevo. No se promete recuperar datos antiguos que la API no puede leer. Datos codificados corruptos no se sobrescriben al abrir.

Solo se recuerdan modo/catalogId/replacementKind/axes/side/scope/batch. Confirmación, autorización de compartidos y UUID de proyecto/origen no se guardan. Modelos, catálogo, pintado, UV, Undo y A4 permanecen sin cambios de implementación.

## Evidencia automática

`npm run verify`:exit0; Ruby **267/1778** en24suites, TypeScript119, web16, offline50. Lint/build/typecheck aprobados. Controlador10/74 incluye read_default evaluador, reapertura con nueva instancia, Unicode/comillas, corrupción, lectura heredada y permisos excluidos.

Auditoría RBZ con baseline080: CRC/SHA/inventario y19Ruby/JS de sintaxis aprobados sin omisiones. Tres PDFs A4 sintéticos de una página297x210mm conservan regresiones. No se ejecutó SketchUp en nube.

La primera verificación general encontró una carrera de una prueba web: consultaba el proyecto antes de terminar PUT tras restaurar cotas. Se corrigió la espera de respuesta, sin modificar producto; log inicial conservado y verify completo repetido. Es independiente del P2 nativo. Reproducción de preferencias anterior al arreglo: artifacts/preferencias-081-reproduccion.log.

## Entrega

RBZ0.8.1: 1642312bytes; SHA256 `5e24eba55002870cda2a4d5d2b2c794f76886ade18a74a439c8cd3e0443f4b3e`. Archivo PlanosSanto-0.8.1-candidata.rbz. ZIP local incluye fuentes, pruebas, instrucciones y runner de preferencias de solo lectura. Su sintaxis Ruby se verificó; NO se ejecutó nativamente.

El informe080 se recibió únicamente como delegación textual:53PASS/1FAIL de54 controles y6UI PASS/1inconclusa. Su ZIP de94archivos NO se recibió ni verificó por este mensaje. El SHA comunicado2af43708ab351d8630d722968a804553f0e96bef6da08cb74c090cdc171febb7 se registra como referencia, no como verificación de recepción.

Validación081 necesaria: configurar desde UI, activar, comparar expectedSubset/actual, cerrar completamente/reabrir y repetir; verificar por separado ausencia de permisos guardados. Los controles aprobados080 no prueban este parche. Persisten los pendientes de veta industrial, perfil sinOCL, rendimiento grande, variantes UI/cola y proveedor.
