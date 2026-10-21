# Backlog EXCLUSIVO del agregado de nombres

Regla: marcar [x] solo con evidencia en PROGRESO.md. NO iniciar nuevas prestaciones generales de Planos Santo.

- [x] **N01 — Auditoría de extensión:** localizar cargador Ruby, versión, ventana HtmlDialog, bridges, almacenamiento de metadatos y pruebas existentes. Identificar dónde viven grupos y piezas. Preparar una nota de compatibilidad; no reestructurar sin necesidad.
- [x] **N02 — Árbol de muebles y piezas:** servicio Ruby de enumeración de grupos/componentes padre y sus piezas anidadas. Detectar instancias compartidas, bloqueadas, vacías y apariciones repetidas. Entregar datos con identidades estables a la interfaz.
- [x] **N03 — Algoritmo de nombres puro y testeado:** abreviaturas automáticas + override editable, fallback de nombre base, prefijo idempotente y reemplazo correcto al cambiar el grupo. Metadatos separados de definiciones compartidas. Cobertura de ejemplos de CRITERIOS.md.
- [x] **N04 — Panel dentro de SketchUp:** selector de mueble y árbol/tabla de todas sus piezas, edición de nombre del padre y abreviatura, previsualización reactiva e indicadores de cambios/advertencias; confirmación y cancelar.
- [x] **N05 — Aplicación segura y deshacer:** escritura atómica a instancias, validación por revisión vigente, start/commit/abort operation, sin mutaciones en preview, guardas para nombres vacíos, elementos inválidos, bloqueados y definiciones compartidas.
- [x] **N06 — Persistencia y coherencia:** guardar/reabrir, no duplicar prefijos, poder renombrar reiteradamente, compatibilidad con selección y nombres utilizados por las guías existentes, sin alterar medidas/anotaciones/identificadores.
- [x] **N07 — Pruebas automatizadas:** algoritmo, panel y bridge Ruby→HTML si es posible; modelo simulado para casos difíciles; ejecutar suite ya existente además de nueva. Registrar salida de comandos.
- [ ] **N08 — Empaquetar versión instalable y validación manual:** producir `.rbz` con esta mejora, instrucciones para instalar sobre la anterior sin perder datos. Entregar checklist de SketchUp 2026, detener en `needs_user` hasta que el usuario pruebe y apruebe el agregado.

**No incluidos:** lectura `.skp` externa, ZIP, página web, PDF, axonometría, flechas, cotas, cambios de geometría.

N06 verificada por serialización y reapertura sintética: no certifica guardar/cerrar/reabrir físicamente en SketchUp. Esa aceptación queda en N08 / VALIDACION_SKETCHUP.md.

N08: paquete `artifacts/PlanosSanto-0.5.1.rbz`, CRC/manifiesto/descarga e instrucciones verificados. Casillero pendiente exclusivamente por la aceptación real de Windows; no repetir N01–N07 sin una regresión o corrección nueva.
