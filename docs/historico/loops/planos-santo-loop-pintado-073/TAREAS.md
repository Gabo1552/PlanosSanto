# Backlog ordenado — solo este agregado

- [x] **T0. Relevamiento y respaldo.** Leer fuente efectiva; comparar con RBZ 0.7.3; resguardar estado fuente, tests y baseline A4/TXT; revisar APIs SketchUp; no revertir cambios posteriores.
- [x] **T1. Catálogo utilizable para pintar.** UI para elegir placa y canto del catálogo global, favoritos, asociación explícita SKU/ID ↔ Sketchup::Material y activos visuales existentes. No duplicación silenciosa. Persistencia entre proyectos; importación desde modelo OCL solo lectura. Pruebas de validación y migración.
- [x] **T2. Selector de mueble/pieza/cara.** Selección inequívoca desde vista o listado; identificación por ruta de instancia y cara; preview de alcance, material, orientación y conflicto de definiciones compartidas. Cancelar sin mutaciones. Alertas para caras no rectangulares o ambigüedad.
- [x] **T3. Pintado nativo.** Aplicar material de placa a superficies elegidas y material de canto a las caras estrechas seleccionadas. Transacción atómica con Undo y respaldo; sin mutaciones al previsualizar. Probar comportamiento ante instancias compartidas y opción explícita de hacer única / afectar todas.
- [x] **T4. Persistencia y resolvedor único.** Lectura de los pintados Planos Santo y OCL heredados, sin dependencia del complemento original; vínculo estable entre material, pieza y sus cuatro lados; no inventar lados. Reabrir SKP debe reconstruir el estado; cambios deben refrescar guía/pedido.
- [x] **T5. Producción y UI simplificada.** La revisión de piezas y el pedido TXT reconocen material/canto nativos. Mantener clasificación bloqueante para datos sin confirmar; no modificar formato de maderera. Respetar veta, espesor y lotes por material y roles de cantos.
- [x] **T6. Regresiones y candidata.** Ruby/JS sintaxis, mocks y pruebas de datos; comprobar que catálogo, renombrado, PDF A4 (1/2 vistas y notas), materiales OCL heredados y TXT sigan íntegros. Incrementar versión, RBZ, hashes, CHANGELOG e informe. Entregar a Codex local para validación posterior.

**No incluir en este loop:** optimizador propio, presupuestos completos, herrajes, importación SKP directa a web, cambios al esquema PDF A4, reemplazo de instalación OpenCutList.

**Estatus final permitido:** `ready_for_sketchup` / CANDIDATA SIN APROBACIÓN DE PRODUCCIÓN.

Casillas: implementación y pruebas automatizadas de la candidata en nube. No acreditan aceptación nativa/visual; sigue PENDIENTE DE PRUEBA NATIVA EN SKETCHUP 2026.
