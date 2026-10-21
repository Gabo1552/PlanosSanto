# Progreso — OpenCutList + Planos Santo desde 0.6.6

## Estado inicial

- Fecha inicio: 2026-10-17.
- Fuente entregada: `baseline/PlanosSanto-0.6.6.rbz` con versión declarada 0.6.6, PDF por pdf-lib, editor de nombres, notas y diagnóstico OCL (consulta solamente).
- 9 SKP aportados; su jerarquía/materiales/piezas reales requieren pruebas Ruby dentro de SketchUp 2026.
- **Estado actual 0.6.8:** el usuario autorizó continuar P2–P6 y reunir la validación nativa al final. Software implementado y pruebas automáticas; falta aceptación conjunta en Windows y proveedor. Ver `../docs/loop-ocl-068.md`.

## Registro de Codex

> Agregar por ciclo fecha, fase, archivos modificados, prueba ejecutada/resultado, bloqueos y próximo paso. No marcar como probada una función que solo se empaquetó.

| Ciclo | Fase | Resultado | Evidencia / siguiente paso |
|---|---|---|---|
| 1 | P0 | Baseline y nueve SKP íntegros; checkpoint de fuentes, inventario y versión única | docs/loop-ocl-067.md; baseline sin modificar |
| 2 | P1 lector | Tipos OCL por atributos/versiones, materiales/herencia/caras y capacidades; sin escritura | ocl_reader.rb; 10 pruebas nuevas/68 assertions; replay previo 11 materiales/453 piezas |
| 3 | P1 UI / QA | Revisión y JSON local nuevo, cancelación, no sobrescritura, foco; nueva RBZ | npm run verify: 115 Ruby/771 assertions, 68 TS, 40 E2E; 27 Python; PDF previo real OK |
| 4 | P1 nativo | needs_user: contrastar material/caras en SketchUp 2026 con la nueva versión | Instalar/reiniciar 0.6.7; Materiales y cantos; guardar informe y comparar con OCL original |

## Ciclo 27 — Nuevo loop OCL/maderera: P0/P1 de lectura, 0.6.7 (17/10/2026)

**Alcance y ejecución:** se incorporó `PlanosSanto_0.6.6_Loop_OpenCutList_Maderera.zip` en `planos-santo-ocl-066/`, siguiendo sus ciclos en esta sesión y el orden P0→P6. No se lanzó otro Codex anidado ni se usaron agentes paralelos. El wrapper Linux se ejecutó realmente con `./planos-santo-ocl-066/codex-loop.sh --check`: integridad y 27 pruebas Python OK; PowerShell no ejecutado. No se escribió la aceptación manual del operador.

**P0:** baseline del ZIP idéntico a la entrega previa 0.6.6, SHA256 `2b8d57bf8abf9623002e27ca2b93dc284ad78633cda2d83520a6b9a88da36eab`. Checkpoint de 164 fuentes antes de editar, `artifacts/respaldo-066-antes-loop-ocl.tar.gz`, SHA256 `fd22c8311f6eba3b0836e5f7fc40e7857f2132236e8a24592bb7b040d95a63c3`; archivo legible con version.json 0.6.6 y sin SKP. No hay commit base, por eso se usa copia de resguardo, sin fingir rama ni alterar Git. Ignore de corpus/baseline/runs antes de extraer; nueve SKP y baseline comprobados. La regresión 0.6.6 existente se reutilizó como referencia, no se repitieron tareas ya completas para aparentar avance.

**Versión única:** `release.rb` toma manifest instalado (prioritario frente a version.json sobrante) o version.json de fuentes. Loader/controlador/sesión/informe OCL y la copia offline de exporter.rb reportan 0.6.7. El build adapta nuestra copia del exportador legado; las fuentes y RBZ 0.3 originales siguen intactos. Prueba de instalación verifica versión coincidente en constante, documento e informe, incluso con un version.json viejo; faltar release.rb ahora muestra error visible antes del registro.

**P1 lector real implementado:** `OclReader` usa únicamente APIs públicas Ruby y atributos existentes `ladb_opencutlist`. Enumera biblioteca completa y materiales aplicados/sin aplicar; observa placa, canto, madera, perfil, lámina, herraje o sin resolver por type y compatibilidad exacta 7.1.0/build 202511301621. No clasifica por nombre/color. Conserva ruta física, matrices/orientación, frente/dorso e información pintada/heredada/sin pintura; enumera candidatos de placa y múltiples cantos sin asignar falsos lados 2D. No requiere helpers internos OCL, no genera UUID, no escribe atributos/operaciones ni modifica geometría, precios o catálogos. `confidence/capabilities`, confirmado falso y producción falsa explícitos. Dimensiones/reducciones de OCL son observaciones brutas, no cotas de corte inferidas.

**UI funcional:** botón Materiales y cantos en el editor local; pantalla Solo lectura con filtros/búsqueda, biblioteca sin aplicar, selección de pieza y revisión de caras/herencia, refresco e informe JSON local nuevo sin red. Cancelación y colisión de archivo verificadas; error claro sin sobrescritura. Foco de teclado contenido, Escape y regreso al botón, sin desbordamiento a 1000 px. La inspección de captura descubrió un mensaje viejo de éxito tras una colisión: se limpió al iniciar el segundo intento y se agregó aserción; regresión completa repetida tras esa corrección. Las acciones no cambian guía/nombres/geometría/Undo. Las capturas inspeccionadas usan fixture SINTÉTICA, no acreditan ejecución Windows.

**Resultados finales:** `npm run verify` exit 0: **115 Ruby / 771 assertions, 68 TypeScript, 16 E2E web + 24 offline**, lint/build/tipos OK. Incluye siete pruebas semánticas OCL/52 assertions, tres de captura pública sin mutación/16 assertions y dos nuevas pruebas de instalación, además de UI/archivo/cancelación. `./planos-santo-ocl-066/codex-loop.sh --check`: **27 Python OK**. `npm run verify:offline:real` mantiene PDF A3 del caso previo de ocho piezas, ambos frentes, diez cotas correctas, notas y ocultar/restaurar. Los modelos densos anteriores todavía tienen avisos; no se dieron por resueltos.

**Replay del diagnóstico nativo previo:** `scripts/review-ocl-diagnostic.rb` interpretó atributos observados de once materiales: cuatro placas, cinco cantos y dos herrajes; 453 instancias con caras, 439 con un candidato único de placa. Un candidato no equivale a material confirmado. El diagnóstico previo no enumeraba materiales sin aplicar, por lo que `whole_library_enumerated:false` permanece explícito; no se lo presenta como prueba de la nueva enumeración en SketchUp.

**Entrega y evidencia:** `artifacts/PlanosSanto-0.6.7.rbz`, 1.577.349 bytes, 17 archivos + 2 directorios DOS, SHA256 `fa457ee4303dfa2c4489c062bc67cb6b8d393622bb23623f345b96e33b45e88f`. CRC/manifiesto y descarga binaria idéntica por /instalar comprobados; sin corpus, diagnóstico ni código del motor OCL empaquetados. Baseline 0.6.6 intacto. Reporte `artifacts/validacion-loop-ocl-067.json`; logs verify-loop-ocl-067.log, loop-ocl-066-check-final.log, ocl-067-regresion-exportacion-real.log; capturas materiales-067-interfaz-SINTETICA*.png. Fuente de detalle/manual: `docs/loop-ocl-067.md`. No hubo deploy/publicación, cambios de configuración de nube ni aceptación manual ficticia.

**Detención del loop — needs_user, P1:** no hay SketchUp 2026 Windows en esta nube. Instalar/reiniciar 0.6.7 y contrastar tres materiales y tres piezas con OCL original (incluyendo herencia/frente/dorso/rotación cuando exista), guardar informe local nuevo y devolver discrepancias; pasos completos en docs/loop-ocl-067.md. El orden del loop y la validación nativa de este lector impiden aceptar P1 como terminado. P2 catálogo global/111 candidatos, P3 propuestas geométricas, P4 orientación/veta/corte/lotes/TXT productivo, P5 motores/costos y P6 aceptación completa siguen pendientes. No se habilita un pedido productivo ni un optimizador simulado. También siguen pendientes cinco medidas manuales y el A3 denso de 23/164 piezas.

## Continuación 0.6.8 — validación conjunta al final

Por instrucción del usuario se completó el desarrollo independiente de P2–P6: biblioteca global, propuestas revisables de nombres, pedido 2D/TXT por lote, estimación neta, acceso original OCL y PDF compacto optativo. Hay 58 candidatos reales sin aprobar/precio, no 111; no se inventaron los faltantes. Referencias de materiales en PDF solo desde pedido revisado vigente.

Verificación: 129 Ruby/853 assertions, 75 TS, 16 E2E web + 28 offline; tras pulir cierre/encabezado y vista 2D fijos se repitieron lint/tipos/build y 28 E2E offline, más dos aserciones de visibilidad. 27 Python/preflight, caso real previo de ocho piezas y replay de diagnóstico de 23/164 piezas (dos A3) correctos. No se ejecutó SketchUp aquí.

RBZ 0.6.8: 1.598.616 bytes, SHA256 `c1f435cdae7e55c54b7ebb12c6edc1657eb1c7521a8fb3b3e36bad0f4a0960f3`, 20 archivos + 2 directorios; CRC/manifiesto/descarga correctos, versiones anteriores intactas. Estado needs_user únicamente para aceptación conjunta Windows/OCL/proveedor. Desarrollo y correcciones detallados en `../PROGRESS.md`; pasos/alcance en `../docs/loop-ocl-068.md`, evidencia `../artifacts/validacion-loop-ocl-068.json`. No se declara producción aprobada.
