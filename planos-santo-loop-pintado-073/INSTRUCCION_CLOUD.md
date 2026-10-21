# Instrucción para pegar en Codex (nube)

Continuá Planos Santo sobre la fuente más reciente, usando `planos-santo-loop-pintado-073/` como especificación. La versión de referencia es **PlanosSanto 0.7.3**, pero NO sobrescribas trabajos más nuevos en la nube.

Leé, en este orden, `PROMPT_CODEX.md`, `ARQUITECTURA_073.md`, `CONTRATO_MATERIALES_CANTOS.md`, `TAREAS.md`, `SEGURIDAD.md` y `CRITERIOS_DE_ACEPTACION.md`. Compará la fuente actual con el RBZ de referencia, creá una rama de desarrollo o respaldo antes de editar e implementá lo pendiente por etapas. Registrá en `PROGRESO.md` cada ciclo: cambios, pruebas, errores y próximos pasos.

**Prioridad:** biblioteca reutilizable de melaminas/cantos, selección y pintado dentro de SketchUp sin OpenCutList, asociación fiable con el modelo y lectura de esos cantos en la exportación existente para maderera. Mantené los PDFs A4, renombrado, notas, flechas y catálogo previo. No trabajes todavía en optimización ni en presupuestos completos.

Usá pruebas Ruby/JS y dobles de SketchUp si no podés abrir la aplicación. No afirmes haber probado visualmente el pintado real desde la nube. Entregá un `PlanosSanto-0.7.X-candidata.rbz`, `planos-santo-loop-pintado-073/reports/IMPLEMENTACION_LISTA.md` y `VALIDACION_LOCAL_POSTERIOR.md` actualizado, dejando expresamente el estado **PENDIENTE DE PRUEBA NATIVA EN SKETCHUP 2026**.

No invoques una CLI Codex dentro de esta ejecución de Codex en la nube. El script `codex-loop.sh` es una alternativa para ejecución CLI local, no un requisito de la nube. Continuá trabajando hasta lograr una candidata para pruebas o encontrar un bloqueo concreto.
