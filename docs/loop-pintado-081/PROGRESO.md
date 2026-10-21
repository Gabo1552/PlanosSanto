# Loop0.8.1 — preferencias

## Ciclo0 — Hallazgo local recibido

Informe textual delegado del20/10/2026:53PASS/1FAIL en54 controles, P2 de preferencias reproducido al menos6veces, y6 comprobaciones UI adicionales PASS/1inconclusa. El defecto NO se atribuye al harness. A4/UV/Undo/persistenciaSKP informados como aprobados en su alcance. No se recibieron aquí los binarios del ZIP080 de94archivos; las rutas Windows no se presuponen accesibles.

Respaldo fuente puntual080: artifacts/respaldo-080-antes-preferencias.tar.gz, SHA256ba64d822056a94e73694a469bdfad2d36d3654edf47155b68b6cd5fb1c2b6388. RBZ080 se conserva.

## Ciclo1 — Reproducción y corrección

Se agregó doble de read_default que evalúa las cadenas como en el fallo informado. Antes del arreglo, test produce SyntaxError sobre la cadena JSON (log artifacts/preferencias-081-reproduccion.log). No es ejecución nativa.

Registro nuevo v2, prefijo ps2: y Base64 estricto evitan comillas internas; sobre JSON schema2. Lectura v1 válida sin escrituras; SyntaxError se maneja explícitamente porque no deriva de StandardError. Dato ilegible no se reescribe al abrir.

Controlador10pruebas/74aserciones aprobadas después del arreglo: recuperación en instancia nueva, Unicode/comillas sin evaluación, datos inválidos y exclusión de permisos/UUID. No se alteran modelos ni catálogos. Verificación completa en curso; prueba nativa081 pendiente.

## Ciclo2 — Regresiones y entrega

- Verify completo final exit0:Ruby267/1778,TS119,web16,offline50. Auditoría RBZ19Ruby/JS sin omitir, CRC/hashes e inventario correctos.
- Carrera ajena al parche en prueba web de cotas: faltaba esperar respuesta PUT antes de GET; espera corregida y suite repetida completa. Log inicial conservado. Producto de cotas sin cambios.
- Runner verificar_preferencias_sketchup.rb de solo lectura entregado con sintaxis aprobada, ejecución nativa pendiente. Se corrigió un espacio de sintaxis en su preparación; no se ejecutó en SketchUp.
- RBZ081SHA256:5e24eba55002870cda2a4d5d2b2c794f76886ade18a74a439c8cd3e0443f4b3e. Baseline080 preservada. No se recibieron binarios del reporte local080; solo se usan los resultados textuales con su alcance.
- Estado ready_for_sketchup; no aprobación de producción ni confirmación nativa del arreglo.

## Recepción posterior del informe080

Archivo de texto leído y archivado privadamente (10637bytes,SHA2562c2f402ae3b8e2ebc320549deb8c412dbcf634f660da770805e2e1029c2966b4). Confirma53PASS/1FAIL y6UI PASS/1inconclusa. ZIPadjunto no transferible con download_file por límite32MiB: binarios/inventario/hashes aún no verificados. No scripts ejecutados ni cambios de código/RBZ. Ver RECEPCION-INFORME-080.md para alcance y transferencia alternativa.

## Recepción de PROGRESO.zip

ZIP274720bytes/SHA25683a039492a49bcdc4242bcf975e5b1f495d6feba1f6d133c748b2c8e5e70656f;CRCválido,18archivos. Sus18entradas son idénticas al paquete de nube080 ya entregado;16hashes del manifiesto corresponden a archivos presentes y pasan. Los PDF/captura son sintéticos y el JSON declara nativeSketchupExecuted:false. No contiene nuevas evidencias Windows ni la regresión de preferencias; no cambia estado de validación. Copia privada preservada, scripts no ejecutados, código/RBZ intactos.

## Recepción posterior de validation-080.zip

Ahora sí se transfirió el subconjunto real080(31400443bytes,81entradas). CRCválido y75hashes presentes correctos;18referencias externas no incluidas. Informe idéntico al recibido;41casos detallados PASS inspeccionados y resumen53PASS/1FAIL. PDFnativos recibidos abiertos(1páginaA4cadauno); comparación de snapshots confirma cola/Undo/cierre sin alteraciones y clic limitado a2caras. Preferencias080fallidas confirmadas en JSON/consola. No se ejecutaron scripts ni SketchUp;081siguependiente de validaciónnativa. Código/RBZsin cambios; evidencia y modelos conservados privados. Ver RECEPCION-VALIDACION-LOCAL-080.md.

## Validación nativa posterior recibida — 20/10/2026

Codex local confirmó preferencias 0.8.1 tras cierre completo y reinicio con configuración A; B tras cierre/reapertura de paleta, sin segundo reinicio completo. Cuatro verificaciones PASS, permisos/UUID excluidos y modelo intacto. 12 regresiones nativas, clic/lote/Undo, A4 exterior/doble y persistencia aprobados en su alcance; no se repitieron las 53 pruebas 0.8.0. `validation-081.zip` recibido y revisado: 74 hashes correctos, 17 referencias externas ausentes. Se detectó P2 independiente de espera de diálogo Guardar PDF >120 s, con archivo válido y aviso falso; continúa en loop 0.8.2. Ver `docs/loop-pintado-082/RECEPCION-VALIDACION-LOCAL-081.md`. No aprobación global de producción.
