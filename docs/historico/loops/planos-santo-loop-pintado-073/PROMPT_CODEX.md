# PROMPT MAESTRO — PLANOS SANTO 0.7.3 → PINTADO AUTÓNOMO

Sos el desarrollador principal de Planos Santo, una extensión **local** para SketchUp 2026 Windows. Trabajá sobre la fuente real del repositorio (si existe código más nuevo que 0.7.3, preservalo). El RBZ adjunto 0.7.3 es referencia estática y respaldo, no debe reemplazar indiscriminadamente el workspace.

## Meta de este loop

Que el encargado pueda, **dentro de Planos Santo**:

1. Abrir una biblioteca **permanente** de melaminas, placas y cantos, con SKU, proveedor, formatos, espesor, dirección de veta y precios (los precios son ingresados por el usuario, no inferidos).
2. Reutilizar esa biblioteca en cualquier proyecto nuevo, asociando materiales del catálogo a materiales SketchUp existentes o importados sin duplicados silenciosos.
3. Pintar melamina y cantos sobre un mueble seleccionado utilizando herramientas de la propia extensión, con **vista previa, selección inequívoca y confirmación**. Los cantos deben asignarse a las caras físicas correspondientes, no a una etiqueta gráfica ficticia.
4. Recuperar los materiales y cantos pintados al guardar, cerrar y reabrir el SKP, usando exclusivamente API pública de SketchUp y metadatos propios de Planos Santo.
5. Mostrar lo pintado tanto en la revisión de piezas como en el pedido a maderera, conservando el perfil de nueve columnas; **el pedido seguirá bloqueado** ante clasificación/orientación incierta.
6. Funcionar sin OpenCutList instalado; **sin romper la lectura de materiales antiguos OCL** y sin modificar sus diccionarios de atributos.

## Alcance de este loop

**Sí:** ampliación segura del catálogo ya existente, vinculaciones catálogo-material del SKP, selección de pieza/cara, pintado nativo de melamina/cantos, puente de lectura del resultado para la revisión y exportación de maderera, UI sencilla en el HtmlDialog, migración/compatibilidad de datos previos, pruebas unitarias y regresión, empaquetado RBZ candidato.

**No:** motor de optimización de corte, herrajes, presupuestos completos, reemplazo masivo de OpenCutList, cambios de diseño PDF A4 o reescritura completa de la UI. No enviar TXT a proveedores, ni cambiar originales ni desinstalar OpenCutList.

## Principios técnicos no negociables

- **Prevención de cambios involuntarios:** abrir, explorar, seleccionar o previsualizar no cambia materiales, geometría, jerarquía ni el estado `modified` del modelo. Pintar requiere acción explícita y confirmación.
- **Compartición de definiciones:** pintar `Face#material` afecta TODAS las instancias que comparten `ComponentDefinition`. Detectar ese alcance, advertir y permitir elección explícita: aplicar a todas o crear definición única (si es seguro). NUNCA hacer `make_unique` de forma silenciosa.
- **Ruta de instancia:** distinguir instancias idénticas mediante `persistent_id` y la ruta completa; no confiar solo en `definition.name` ni `entityID`.
- **Cantos geométricos:** tomar la cara estrecha elegida como fuente de verdad y calcular su relación con los cuatro lados de la pieza de modo estable ante rotaciones y espejado; bloquear si no se puede resolver o si se observa más de una interpretación.
- **Veta, orientación y medidas:** no ordenar dimensiones y asumir que eso define base/altura. El referencial de maderera debe mantenerse estable e independiente de la cámara del PDF A4. Preservar orientación incluso tras girar la vista.
- **Catálogo:** preservar `CatalogStore` existente (`catalog.json`, `schema=1`, `revision`, `items`, `compatibleIds`, `approved`). Si es necesario ampliar esquema para activos visuales, crear migración reversible con copias, sin romper versiones previas ni perder metadatos. La biblioteca global NO debe depender de un solo SKP.
- **Imágenes/texturas:** no sustituir silenciosamente una textura comercial real por un color genérico. Permitir vincular a `Sketchup::Material` ya existente o a recurso `.skm`/textura disponible; si faltan recursos, mostrar estado pendiente y solicitar una decisión explícita.
- **Atributos:** usar diccionarios propios de Planos Santo. El `ladb_opencutlist` de materiales antiguos es solo lectura; no modificar, eliminar, copiar ni reinterpretar como propio sin confirmación.
- **Atomicidad:** operaciones de pintado dentro de `model.start_operation`, `commit_operation` / `abort_operation`, compatibles con `Ctrl+Z` de SketchUp. Proteger ante errores a mitad de operación.
- **Integración:** actualizar la lectura de `SupplierOrder` / `OclReader` o introducir un resolvedor común para materiales nativos PS y heredados OCL. El pintado propio debe poder exportar sin que el gateway `OclGateway` esté cargado.
- **Superficies visibles:** la asignación debe reflejarse realmente en los materiales de SketchUp (`Face#material`, o el alcance explícito que corresponda), además de los metadatos necesarios. Pintar solo etiquetas no cumple el objetivo.
- **Protección de producción:** ninguna pieza se considera lista para TXT mientras la relación material/canto/lado/orientación no esté validada.
- **Respeto de código previo:** no eliminar las funcionalidades A4 (1/2 vistas, ocultar componentes solo en la guía, rotar cámara, notas/flechas), nombres, PDF, pedidos actuales ni modos de compatibilidad.
- **Licencias:** usar API pública de SketchUp. Si se incorpora código de OpenCutList (GPLv3), conservar licencia/avisos y revisar obligaciones; preferible implementación nueva sin copiar upstream innecesariamente.
- **Sin conectividad obligatoria:** los flujos cotidianos deben funcionar localmente/offline; no telemetría ni carga de SKP/planos a servicios externos.

## Forma de trabajo

0. Inspeccionar la rama fuente actual, comprobar alcance real frente a `ARQUITECTURA_073.md`, preparar respaldo y plan incremental.
1. Ejecutar una **prueba de contrato** que reproduzca el comportamiento existente antes de modificar: catálogo, nombres, PDF A4, TXT de maderera.
2. Implementar cada tarea del `TAREAS.md` con pruebas automatizadas para casos normales y bordes críticos. Preferir cambios pequeños. No inventar resultados de pruebas manuales.
3. Anotar por ciclo `PROGRESO.md` (código modificado, tests reales, resultados, riesgos y próxima tarea).
4. No modificar SDK/SketchUp instalado en el equipo del usuario desde la nube; preparar pruebas Ruby de integración para cuando el Codex local tome la candidata.
5. Entregar nueva versión candidata instalable **posterior a 0.7.3**, `planos-santo-loop-pintado-073/reports/IMPLEMENTACION_LISTA.md`, notas de migración/rollback y guía reproducible para Dot/Codex local.

## Condición de salida

`LISTO PARA VALIDAR EN SKETCHUP`: compilación/sintaxis, pruebas automáticas del código y RBZ íntegro aprobados, evidencias y limitaciones explícitas. **NO** significa aprobado para producción. Si depende de una confirmación no disponible, describir el bloqueo concreto. No posponer pruebas automatizables bajo el argumento de que la validación visual será posterior.

Al reportar cada ciclo mediante `SCHEMA_RESPONSE.json`, emitir uno de: `working`, `needs_input`, `blocked`, `ready_for_sketchup`.
