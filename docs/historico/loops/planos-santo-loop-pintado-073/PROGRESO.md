# Progreso — pintado autónomo Planos Santo

Estado: **ready_for_sketchup — PENDIENTE DE PRUEBA NATIVA EN SKETCHUP 2026**.

## Ciclo 0 — Auditoría y respaldo (2026-10-19)

- Fuente efectiva 0.7.3, rama work sin commits. No se reinicializó Git ni se sobrescribió código con la referencia.
- Paquete recibido SHA256 b9ee4b0e3f54a0d2623a72713c241cf1669863114b986fcdb77ee778c1318f88, extraído sin reemplazar archivos existentes.
- RBZ baseline SHA256 883366c79b65468fd1c64b2ca334715df0f382f2f6b1478ce02f88047b84557b. Sus 19 archivos de manifiesto coinciden con el build existente.
- Respaldo fuente: artifacts/respaldo-073-antes-pintado.tar.gz, 188 archivos, SHA256 cec8127d190b08ca2fdadc67016f29c9b4831737e23f9c3afe72d4b138119341.
- Regresión sobre copia congelada: agrupación/nombres 8 pruebas / 59 aserciones; catálogo/pedido 19 / 101; Vitest PDF, agrupación y taller 15 pruebas aprobadas.
- Primera preparación de la copia omitió dos validadores Python y carpeta artifacts: se corrigió la preparación, sin cambiar el producto. Pruebas de cantos adicionales registradas en siguiente ciclo.
- Contratos conservados: catálogo schema 1, guía schema 1, A4 horizontal y TXT nueve columnas. No se ejecutó SketchUp en nube.

## Ciclo 1 — Módulos y conexión (en curso)

- Nuevos material_resolver.rb, material_library.rb y native_paint.rb; lectura propia más OCL, biblioteca visual SKM real separada del catálogo comercial y pintado transaccional por ruta/cara.
- UI PaintPanel, selector geométrico y confirmación explícita. Controller conecta lectura, previsualización, cancelar, vincular, instalar y aplicar; bloquea cambios con guías o pedidos pendientes y refresca análisis tras mutaciones.
- Pruebas unitarias reportadas por módulos: resolvedor 8/51, biblioteca 14/80 y pintado 15/72. Son dobles de API, no pruebas nativas.
- En curso: puente UI, integración productiva con pedidos, regresiones completas, empaquetado y validación de candidata.

## Ciclo 2 — Integración y correcciones (2026-10-19)

- Workshop/SupplierOrder proponen el ID de placa y los vínculos de cantos nativos sin confirmar orientación, roles ni ejes. Validan SKU/fingerprint propio incluso con revisión manual; conflictos no se pueden omitir con una nota.
- Selector: corregida la correspondencia del ID runtime de material en biblioteca y cara para mostrar el color real. También se propaga el nuevo análisis tras vincular/instalar para no dejar una guía obsoleta en pantalla.
- Regresión de controlador: 8 pruebas / 114 aserciones contra controlador empaquetado; confirma guardas, cancelación y no repetir una mutación si falla el refresco.
- Baseline congelada adicional: cantos 10 pruebas / 39 aserciones aprobadas. El nombre correcto del archivo es edge_sides_test.rb; un intento con nombre inexistente no ejecutó pruebas.
- Paquete adjunto: 22 pruebas Python aprobadas (estructura RBZ, TXT y runner simulado). El runner simulado no ejecuta SketchUp ni acredita aceptación nativa.
- Verificación general en curso: TypeScript 119 pruebas y web 16 E2E aprobadas en la ejecución inicial; suites de interfaz de pintado requieren finalizar diagnóstico y repetir tras correcciones. No se considera cerrada la candidata todavía.

## Ciclo 3 — Verificación y candidata (2026-10-19)

- Corregido selector controlado: leer el valor antes de esperar la cancelación evita perder la elección. Se conserva log fallido inicial; no se ocultó ni deshabilitó la prueba.
- `npm run verify` final: exit 0; lint/build/typecheck aprobados; Ruby 204 pruebas / 1377 aserciones, Vitest 119, web 16 y offline 43. Paquete Python: 22 pruebas aprobadas aparte.
- `node --import tsx scripts/demo-a4.ts`: tres PDFs sintéticos A4 exactos, una página cada uno, 17 piezas; exterior, interior y doble.
- Auditoría RBZ contra baseline: CRC/hashes/inventario/sintaxis aprobados; 23 archivos + 2 carpetas, 17 Ruby/JS chequeados sin omisiones.
- Instalador 0.7.4 SHA256 c8319cdb9a8bbbf6b5b47726fad4ef78fc7acf78d40bdc7af1e87da719798058. Baseline 0.7.3 intacta.
- Fuentes principales: tres módulos Ruby nuevos; offline.rb, workshop.rb, supplier_order.rb, ocl_reader.rb, p1_diagnostics.rb; PaintPanel/App/MaterialReview/EdgeReview; build/bootstrap/packager/runners y lib/model.ts. Pruebas nuevas de resolvedor, biblioteca, pintado, controlador y cuatro recorridos UI. Informe y rollback documentados.
- Entrega en artifacts/PlanosSanto-0.7.4-Validacion-Local-Pintado.zip, con fuentes, pruebas, informes, logs y demos. Excluye corpus SKP/SKM privados.
- Pendiente externo: instalación, pintado/texturas y Undo nativos, persistencia real, A4 BM17 y aceptación visual con Codex local/Dot; importación real de TXT al proveedor. Ninguna de esas pruebas se afirma ejecutada en nube.

## Ciclo 4 — Protección Undo y cierre definitivo (2026-10-19)

- Aplicar un material idéntico no crea una operación vacía ni invalida la guía; se informa Sin cambios. Aislar una definición compartida sigue siendo una modificación explícita.
- Archivos: native_paint.rb, offline.rb, PaintPanel.tsx, native_paint_test.rb, paint_controller_test.rb, paint.spec.ts. Nuevos ensayos con instrucción local y runner Ruby de solo carga; requiere confirmación para pintar copia y restaurar con Undo.
- `npm run verify` repetido completo tras esa corrección: exit 0; 207 pruebas Ruby / 1398 aserciones, 119 TypeScript, 16 web y 44 offline. Lint/build/typecheck aprobados. No hay fallos automatizados conocidos en el alcance ejecutado.
- RBZ final: 1627109 bytes, SHA256 6c35751c33cfdc93f551c69bffc424745906e7b19f0df078f83eedac3ec6d6b1; auditoría CRC/inventario/sintaxis completa y módulos empaquetados iguales a fuente probada. Baseline0.7.3 intacta.
- Runner nativo: solo Ruby -c aprobado en nube, ejecución nativa NO realizada. Estado final ready_for_sketchup; no aprobación de producción.

## Recepción posterior — validación nativa 0.7.4

- ZIP recibido de Codex local y SHA256 coincidente;72 archivos,71 hashes de manifiesto y CRC correctos. Informe independiente idéntico al incluido. Evidencia privada preservada en fixtures/private/validacion-074-recibida.
- Cuatro suites documentan35/35 controles nativos PASS. Pintado manual y Undo adicionales informados; SKM texturado real y persistencia probados localmente.
- Comprobación nube de los dos PDF recibidos:1página297x210mm; revisión del detalle de cota completo. No se ejecutó SketchUp ni scripts adjuntos en nube.
- No cambió código ni RBZ. Estado actualizado en CODEX_STATUS.json y reports/RECEPCION-VALIDACION-LOCAL-074.md. Entrega original y registros históricos conservados.
- Pendiente: aceptación comercial de materiales/SKU, orientación industrial de veta, otro perfil sinOCL y pedido comercial/importación al proveedor. Gestos manuales de cámara/ocultas no repetidos en esta corrida. No aprobación global de producción.
