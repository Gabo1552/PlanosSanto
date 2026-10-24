# Fichas desde materiales nativos · UI

Materiales del taller muestra una entrada a «Materiales del modelo» si hay materiales sin ficha. En ese listado, «Crear ficha desde material» lee el material exacto mediante preview. Reutiliza el editor General/Textura, sus listas de espesores/anchos y validaciones; no abre Pintar ni duplica el formulario.

La vista previa conserva nombre, color y miniatura nativa, y permite completar el formato. Los datos faltantes quedan vacíos, incluidas las listas estándar. Si OpenCutList no define un tipo compatible, se exige elegir Placa o Canto. El guardado envía token y revisiones; la identificación y el archivado de la textura los valida el backend. Un vínculo existente abre su ficha directamente, sin duplicarla.

El editor provisional oculta pintar, exportar, archivar, reemplazar textura y vínculos a herramientas de fichas ya creadas. Cancelar descarta el preview. Tras guardar, la ficha vuelve a la biblioteca normal.

Contrato de navegación para App: `initialModelMaterialId`, `initialCatalogId`, `navigationRequestKey`. Esta última permite reabrir el mismo material en una nueva solicitud. Endpoints: `material_model_preview`, `material_model_commit`, `material_model_cancel`.

Pruebas UI con bridge sintético, sin afirmar ejecución en SketchUp:
- 3 casos nuevos PASS: preview/textura/guardar sin Pintar; tipo desconocido sin medidas inventadas; vínculo existente sin duplicado.
- 1 caso adicional PASS: canto manual con0,8mm y ancho22mm, sin Pintar.
- 7 regresiones de `materiales-ficha.spec.ts` PASS: edición, listas, cancelación/foco, precio, exportación y textura existentes.
- ESLint focal PASS. Los fallos iniciales del nuevo harness (resolución de React desde /tmp y HTML sincharset UTF-8) se corrigieron; no eran fallos de producto.

Captura `ficha-material-modelo-SINTETICO.png`: datos QA inventados, revisada visualmente. El harness aislado carga solo estilos de la biblioteca, no el tema del contenedor principal. Posteriormente se ocultó el vínculo deshabilitado «abrir en Taller» en el editor provisional.

Pendientes: controlador nativo integrado, lectura OCL real, textura archivada tras reiniciar SketchUp y Undo del vínculo. No se declara validación nativa.

Correcciones de revisión: cancelar devuelve el foco al botón nativo que abrió la ficha (o a Buscar si se abrió desde otra sección); una solicitud de ficha por catálogo refresca la biblioteca si el ID todavía no está en la caché. Cinco pruebas focales PASS, incluida restauración de foco; sexto caso de biblioteca desactualizada ejecutado por separado: PASS (6/6 casos focales aprobados). Captura reemplazada por la versión sin vínculo provisional «abrir en Taller».
