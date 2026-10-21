# Implementación de pintado autónomo — candidata 0.7.4

Estado: **ready_for_sketchup**. **CANDIDATA SIN APROBACIÓN DE PRODUCCIÓN**. No se ejecutó SketchUp en la nube.

## Cambios implementados

- `sketchup_offline/material_resolver.rb`: contrato propio de asociación material/comercial con UUID, tipo y fingerprint; lectura compatible de OCL heredado; desacuerdos se informan, sin adivinar por nombre/color.
- `sketchup_offline/material_library.rb`: biblioteca permanente de SKM reales; catálogo comercial schema 1 intacto; índice visual separado, SHA256, revisión, backups y bloqueo concurrente. Asociación explícita, detección de UUID duplicados, instalación desde biblioteca o SKM elegido, sin duplicación silenciosa. Índice activo y metadatos se revierten si no se confirma la operación nativa. Activos huérfanos inactivos tras un fallo no se presentan como utilizables.
- `sketchup_offline/native_paint.rb`: selección por ruta física y cara persistente, previsualización sin mutaciones, comprobación de geometría/material/catálogo vigente, aplicación frontal/posterior o ambas, alcance compartido explícito e aislamiento cuando es seguro; una operación con Undo. No escribe atributos OCL.
- `sketchup_offline/offline.rb`: puente de biblioteca/selección/previsualización/pintado, selector SKM nativo y actualización de la sesión tras cambios. No se reemplaza el guardado de guías.
- `sketchup_offline/ui/PaintPanel.tsx` y estilos: selector de caras, biblioteca por SKU, favoritos, filtros, explicaciones y confirmación del alcance. El dibujo de selección no equivale a validación visual de la textura nativa.
- Integración en lector/materiales/pedido: reconoce metadatos propios, conserva revisión de ejes/frente y roles exactos del proveedor; no convierte cámara en orientación de corte.
- Build, bootstrap y runner incluyen los tres módulos nuevos. La candidata distribuye **23 archivos + 2 carpetas**, con allowlist exacta y SHA256 de cada payload. Conserva instaladores previos.

## Evidencia final ejecutada

- `npm run verify`: **exit 0**, log `artifacts/verify-pintado-074.log`. Incluye lint, sintaxis, build Next/offline, typecheck y suites integrales.
- Ruby: **207 pruebas / 1398 aserciones**, 21 suites, cero fallos/errores/omisiones. Incluye transporte anterior y editor offline; biblioteca 14/80, resolvedor ampliado 12/79, pintado 17/87, controlador de pintado 9/120.
- Vitest: **119 pruebas**, 23 archivos, aprobados. PDF A4, cotas, cámaras, notas, agrupación, catálogo y pedido conservados.
- Playwright web: **16 pruebas**; editor offline **44 pruebas**, incluidas cinco nuevas de pintado. Todas aprobadas. API de pintura en estas cinco pruebas de navegador es un doble JS explícito; controlador/session de análisis usa Ruby sintético. Los setters nativos se prueban aparte con dobles Ruby.
- `python3 -m unittest discover -s planos-santo-loop-pintado-073/tests -v`: **22 pruebas aprobadas**; contratos TXT/RBZ/runner simulado. No se ejecutó Codex CLI anidado ni SketchUp.
- `node --import tsx scripts/demo-a4.ts`: tres PDFs sintéticos, exterior/interior/doble, exactamente una página 297 × 210 mm por archivo y 17 piezas físicas. No representan una exportación nativa del BM17 privado.
- `env PATH="/workspace/.tools/ruby/bin:$PATH" python3 planos-santo-loop-pintado-073/scripts/verify_rbz.py artifacts/PlanosSanto-0.7.4.rbz --candidate --baseline artifacts/PlanosSanto-0.7.3.rbz`: aprobado, 22 payloads de manifiesto más manifiesto, 17 archivos Ruby/JS comprobados, sin sintaxis omitida. CRC, SHA256 y conservación del inventario base aprobados.
- Instalación simulada prueba que quitar cualquiera de los tres módulos nuevos impide cargar parcialmente la extensión y muestra recuperación.

## Fallos encontrados y corregidos

1. Preparación de baseline congelada sin dos validadores Python y carpeta artifacts: se completó la copia de prueba, sin alterar el producto. Baseline final: nombres 8/59, catálogo/pedido 19/101, cantos 10/39 y Vitest 15 aprobados.
2. Identificadores runtime de cara/material con prefijos diferentes: selector normaliza la comparación; conserva IDs persistidos y muestra el color base real.
3. Un selector controlado leía `event.target.value` después de una cancelación asíncrona y perdía la selección. Se lee antes del primer await. El primer verify fue interrumpido al reproducir el fallo; se conserva `verify-pintado-074-inicial.log`. El verify final completo pasó tras corregirlo.
4. Vincular/instalar refrescaba sesión Ruby sin actualizar la guía mostrada: ahora se invalida la vista antigua, se conserva la guía guardada y se exige regenerar antes de PDF/guardado. Cubierto por navegador.
5. Si una mutación termina pero falla el reanálisis, se informa el cambio ya aplicado y se invalida el estado anterior. Nunca se repite automáticamente el pintado.

6. Pintar un material ya presente ahora devuelve «Sin cambios» sin crear operación Undo ni invalidar la guía. Dos pruebas nativas simuladas, una del controlador y una del navegador cubren este caso.

## Entrega

- RBZ versión interna **0.7.4**, 1 627 109 bytes.
- SHA256: `6c35751c33cfdc93f551c69bffc424745906e7b19f0df078f83eedac3ec6d6b1`.
- Instalador: `artifacts/PlanosSanto-0.7.4-candidata.rbz`.
- Paquete local reproducible: `artifacts/PlanosSanto-0.7.4-Validacion-Local-Pintado.zip`; fuentes/pruebas, hashes, logs, PDFs sintéticos e instrucciones. No contiene SKP ni SKM privados.
- APIs: `MaterialLibrary#status/bind/install`; `NativePaint#status/preview/cancel/apply`; controller `paint_*`, `catalog_visuals`, `catalog_bind`, `catalog_install`. Contratos y secuencias en `VALIDACION_LOCAL_POSTERIOR.md`.
- Migración/rollback en `CHANGELOG.md`; catálogo comercial y guía conservan schema 1. Cerrar todas las ventanas de SketchUp antes de actualizar.

## Límites y pruebas pendientes

**PENDIENTE DE PRUEBA NATIVA EN SKETCHUP 2026; NO APROBADA PARA PRODUCCIÓN.**

- Instalar candidata y comprobar `Material#save_as`, `Materials#load`, texturas/veta real, pintado frontal/posterior, cancelación y Undo nativo.
- Guardar y reabrir copia SKP; confirmar UUID, rutas/caras, visibilidad, nombres y activos disponibles en otro proyecto. Undo del modelo no elimina archivos visuales ya archivados en la biblioteca global.
- No se aíslan automáticamente ancestros compartidos o instancias no enumerables. Esos casos bloquean hacer única y exigen resolver la estructura en SketchUp; aplicar a todas requiere confirmación de todas las rutas.
- El selector usa color base real, no renderiza la textura SKM. Sin activo visual real disponible queda pendiente; no inventa texturas, precios o equivalencias.
- No se pinta todo un mueble por inferencia. El operador selecciona pieza/caras; canto requiere caras estrechas y plano de corte explícito de pieza rectangular.
- Repetir A4 BM17 real y revisión visual de cotas, sin dar por aprobada la corrección anterior solo con automatización Linux.
- Importación real del TXT por proveedor sigue pendiente de prueba autorizada; no se envió ningún pedido.

El runner `validar_pintado_sketchup.rb` se entrega con sintaxis Ruby aprobada; **no se ejecutó en SketchUp**. `GUIA-RUNNER-PINTADO-SKETCHUP.md` indica preflight sin cambios y ensayo optativo con copia, confirmación y Undo.
