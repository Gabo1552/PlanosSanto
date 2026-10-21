# Recepción de validación local real — 0.7.4

Estado: **35/35 controles locales aprobados en el alcance ejecutado; aceptación comercial pendiente**.

Se recibieron el ZIP de 72 archivos y el informe independiente. ZIP SHA256 `1ecceee41b01761b727d9a26bd59cdd7304ba864cfac4772672c235d22987bd3`, coincidente con el anunciado. CRC correcto y 71 hashes del manifiesto verificados. El informe independiente es idéntico al incluido. El RBZ corresponde exactamente a la candidata entregada: `6c35751c33cfdc93f551c69bffc424745906e7b19f0df078f83eedac3ec6d6b1`.

## Evidencia revisada

- Resultados locales Windows SketchUp26.2.243/Ruby3.2.2: 5 BM17/diagnóstico, 15 pintado, 8 biblioteca y 7 regresiones, todos PASS en sus JSON.
- La validación local informa pintado manual desde PaintPanel, textura real SKM, alcance compartido, Undo, make_unique seguro y persistencia. Se revisaron los resultados, sin ejecutar sus scripts en nube.
- Ambos PDF recibidos se abrieron en nube: una página, 297 × 210 mm. Se revisó el recorte visual de cotas; el texto antes parcialmente tapado se lee completo en ese caso.
- Informe de persistencia: guía idéntica y diagnóstico físico conservado tras reabrir. Los nombres izquierdo/derecho se conservan al desagrupar; 17 filas bloquean la exportación que no cabe.
- Hash del baseline SKP recibido comprobado: `6be09dfb6a24872a28f9efe3b379644c0ee93b788272ec30e8edd146417eef22`. El informe local también certifica el original del usuario y los 22 payloads instalados antes/después.

La configuración de rotación/ocultas A4 se aplicó con NativeSession real: esta corrida no repitió esos gestos manuales. Los materiales eran QA aislados; el SKM texturado era un recurso nativo de SketchUp. No acredita equivalencias ni catálogo comercial del taller.

## Pendientes

Materiales/SKU del taller, orientación industrial de veta, otro perfil sin OpenCutList y pedido comercial válido/importación al proveedor. No se agotaron todas las cancelaciones de archivo, conflictos UUID o tokens obsoletos. No hay aprobación global de producción.

## Trazabilidad y privacidad

Evidencia extraída sin sobrescribir en `fixtures/private/validacion-074-recibida`, cubierta por la exclusión existente de Git. No se publicaron los modelos ni se incluyeron en paquetes redistribuibles. No se modificó código ni RBZ, ni se ejecutaron scripts adjuntos o SketchUp en nube. Los informes históricos y los errores iniciales del harness local se conservan sin reescribirlos.

Resumen verificable: `artifacts/recepcion-validacion-local-074.json`. El informe de implementación original describe la entrega previa; este registro actualiza su estado con la evidencia posterior.
