# Loop A4 — candidata 0.7.0

Estado: EN DESARROLLO. No aceptada en SketchUp 2026.

## Ciclo 1 — base y diagnóstico
- Revisada base 0.6.9 y preservados materiales, cantos, nombres y pedidos.
- Integrado exclusivamente el parche recibido desde Windows: `counts.transform_keys(&:to_s)`.
- Evidencia externa recibida: 16 comprobaciones nativas en SketchUp 26.2.243/Ruby 3.2.2/OCL 7.1.0; no constituye validación A4. No se ejecutaron aquí.
- Nuevas regresiones Ruby: contadores String, conteo real, mismo payload JSON. Persistencia A4 estricta, IDs físicos únicos, guardar/reabrir/Undo y no mutación de geometría/visibilidad mediante dobles.
- Ejecutado por agente: ajustes 20 pruebas/179 aserciones; diagnóstico 12/86; suite Ruby completa aprobada. Repetición final pendiente.

## Ciclo 2 — visor y composición
- Visor ensamblado exterior/interior, cámara ortográfica configurable, cámara compartida, ocultamiento individual por ruta física y lista completa conservada.
- Interfaz con previsualización sin aplicar, aplicar/cancelar/restaurar, modo una/dos vistas y observaciones.
- PDF vectorial A4 297×210, tabla lateral, notas, mínimo 7 pt en etiquetas/cotas y 8 pt en tabla. Desbordes bloquean sin páginas extra.
- Nuevo motor PDF compartido por extensión y endpoint web.
- Pruebas iniciales: seis unitarias de escena y seis PDF aprobadas por agentes. Pruebas integrales y revisión visual en curso.

## Pendientes externos
- El binario BM17 y el ZIP de validación mencionados están en una ruta Windows inaccesible aquí. SHA informado del SKP: 6be09dfb6a24872a28f9efe3b379644c0ee93b788272ec30e8edd146417eef22. No fue abierto ni probado en la nube. Se prepara demo sintética de 17 piezas, identificada como tal.
- Instalación candidata, BM17 real, persistencia SKP, Undo nativo, impresión y regresiones reales se ejecutarán con Codex local sin cargar parches temporales.

## Ciclo 3 — integración y revisión visual
- Regresiones adaptadas al cambio explícito A4, conservando verificaciones de nombres, Undo, guardado/exportación, OCL, cantos y TXT. 31 pruebas de regresión Vitest y 29 E2E editor/nombres aprobadas en ejecuciones específicas.
- Cinco E2E nuevos aprobados: exterior/interior/doble, cámara/zoom/guardado/reapertura, rutas anidadas compartidas, no modificación de modelo, Undo, notas ocultas y desborde sin archivo. Son dobles de API nativa.
- Corregido enum de versión importada 0.7.0 y saneamiento de rutas ocultas de piezas eliminadas al regenerar.
- Una etiqueta impresa por tipo intercambiable cuando está activada la agrupación; × indica instancias visibles. El editor conserva selección física y la tabla la cantidad total. DEMO17 dual ya cabe con zoom 1, giro -30°/inclinación45° y cotas completas.
- Zoom mínimo ampliado de .75 a .35 para permitir más ajustes; regresión Ruby de guardar/releer .5 y rechazar .34: 21 pruebas/183 aserciones en ajustes, PASS.
- Corregida cámara interior independiente: parte del mismo sistema exterior, sin giro implícito de 180°.
- Inspección visual detectó conversión de color HSL moderna a PDF; corrección y nueva verificación en curso.
- Primer verify completo pasó lint, Ruby transporte, 104 pruebas TS y build/typecheck, pero E2E web no arrancó por puerto3000 ocupado por servidor anterior. Detenido solamente ese servidor propio; repetición en curso. No se registra esa ejecución como suite completa aprobada.

## Ciclo 4 — correcciones y pruebas completas
- Corregidos rellenos de caras en PDF: Three.Color requería comas en HSL/RGB; antes podía convertir caras a blanco. Regresión inspecciona color y contenido PDF real. Nuevos renders conservan sólidos y oclusión.
- PDF DEMO17 exterior/interior/doble reproducibles con `npx tsx scripts/demo-a4.ts`, cámara -30°/45°, zoom1. Todos son sintéticos, 17 piezas físicas y una hoja exacta A4; medidas/IDs completos.
- Primera suite web:14/16 aprobadas; dos fallos de pruebas por cambio de contrato (etiqueta agrupada por tipo y nota de más de200 caracteres inválida). Corregidos sin debilitar conservación física; 4 pruebas web dirigidas aprobadas y siguiente suite completa16/16 aprobada.
- Ejecución completa siguiente:107 pruebas TS y16web aprobadas; Ruby aprobado; offline36/37. Falló prueba que seleccionaba zoom mediante Home+Right y asumía mínimo.75. Se corrigió la interacción para elegir explícitamente.8 y mantener comprobación de persistencia.
- Aviso del panel corregido para no afirmar que esta candidata ya fue instalada por el usuario.
- Ejecución limpia final de `npm run verify` en curso. Historial de fallos conservado en artifacts; no se confunde con resultado final.

## Ciclo 5 — verificación limpia y candidata
- `npm run verify` terminó con código0:153 pruebas Ruby/994 aserciones,107 TypeScript,16 E2E web y37 E2E offline. Lint, build, tipos, sintaxis y empaquetado aprobados. Log: `artifacts/verify-a4-070-clean.log`.
- `python3 -m unittest discover -s planos-santo-loop-068/tests`:9 pruebas aprobadas. Integridad del RBZ0.6.8 y nueve SKP aprobada. RBZ0.6.9 preservado SHA3f4a70f2164d7c15383b77a3678c209becd00687a40797075eadff47502759b5.
- `npx tsx scripts/demo-a4.ts`:tres PDF sintéticos de17piezas, una hojaA4 exacta cada uno. Inspección visual de vista doble y del editor realizada. Helper Python de inspección PDF ejecutado sobre demostración doble:PASS. Helper Ruby local: sintaxis aprobada; ejecución nativa pendiente.
- RBZ0.7.0:CRC y hashes de los19 archivos del manifest aprobados,22 entradas totales, sin SKP privados. Hash y tamaño exactos en `artifacts/validacion-a4-070.json`.
- Se entrega paquete local con RBZ, fuentes/pruebas, PDF, instrucciones, contrato, hashes y evidencia automática. No se ejecutó SketchUp aquí ni se probaron los binarios del modelo BM17 real.

Estado final: **NEEDS_USER — candidata para validación local, no extensión aceptada**. Tareas independientes de nube completadas; pendientes instalación, BM17 real, reapertura/Undo nativos, impresión y regresiones reales según CODEX_LOCAL.md. Si aparece un fallo local, conservar evidencia y continuar desde esta candidata, sin cargar fuentes viejas sobre ella.
