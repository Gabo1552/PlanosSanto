# Loop OpenCutList / maderera — ciclos P0 y P1, 0.6.7

Fecha: 17/10/2026. Trabajo ejecutado en esta sesión según `planos-santo-ocl-066/LOOP_PROMPT.md`, con informes de ciclo, sin lanzar otra instancia de Codex ni publicar. El wrapper Linux se verificó realmente con `./planos-santo-ocl-066/codex-loop.sh --check`: 27 pruebas y preflight correctos. PowerShell/SketchUp no están disponibles aquí. Los documentos del ZIP describen el objetivo; las marcas de avance se basan en los fuentes y pruebas del proyecto real.

## P0 — Base preservada y módulos

La copia del ZIP y `artifacts/PlanosSanto-0.6.6.rbz` son idénticas: SHA256 `2b8d57bf8abf9623002e27ca2b93dc284ad78633cda2d83520a6b9a88da36eab`. Se conservan ambas. Checkpoint de fuentes antes de cambiar código: `artifacts/respaldo-066-antes-loop-ocl.tar.gz`, 164 archivos, SHA256 `fd22c8311f6eba3b0836e5f7fc40e7857f2132236e8a24592bb7b040d95a63c3`. Git sigue sin commit base; no se fingió una rama ni se usó reset/push. Corpus de nueve SKP, baseline y runs ignorados antes de extraer, hashes verificados. No se incluyen datos privados ni diagnósticos en el RBZ.

La regresión de referencia 0.6.6 ya ejecutada se conserva en `artifacts/verify-compartidas-despiece-066.log`: 103 Ruby / 677 assertions, 68 TS y 38 E2E. Se preservan shared IDs, alias coherentes, Undo, despiece por capas, cámaras frente/atrás, cotas movibles/ocultables, notas físicas y PDF local. **El A3 denso de 23/164 piezas sigue con avisos de legibilidad; no se considera resuelto por este loop de materiales.**

| Módulo | Estado en esta entrega |
|---|---|
| `sketchup_offline/release.rb` | Lee versión única de manifiesto instalado o version.json de fuentes. El build de la copia offline de exporter.rb usa esta versión tanto en documentos como informes; el exportador legado 0.3 original permanece intacto. |
| `sketchup_offline/ocl_reader.rb` | Adaptador de observación, API Ruby pública, tipos/atributos y caras; no requiere clases OCL ni genera UUID. |
| `sketchup_offline/ui/MaterialReview.tsx` | Pantalla de revisión con filtros, material aplicado/sin aplicar, piezas y caras, refresco y JSON local nuevo. |
| Catálogo global P2 | Pendiente. No se importaron/aprobaron los 111 candidatos ni precios. Debe almacenarse en datos de usuario fuera del RBZ/SKP, con conciliación/guardado atómico/migraciones. |
| Sugerencias P3 | Árbol, renombrado y resaltado existentes conservados. Motor de propuestas geométricas/vocabulario pendiente; no se presentan nombres actuales como sugerencias nuevas. |
| Pedidos P4 | Pendientes: vista 2D confirmada, corte/terminado, veta, lotes y nueve TAB. No existe botón de pedido productivo en esta entrega. El validador del ZIP solo prueba sintaxis. |
| Optimización/presupuesto P5 | OpenCutList original separado, sin modificar. Integración de motores/paridad/costos pendientes; no se simulan. Decisión aditiva y licencia upstream en `docs/opencutlist-integracion-p0.md`. |

## P1 — Semántica de lectura sin fabricación automática

Referencia auditada: OpenCutList 7.1.0/build 202511301621, commit `d03f4548e161ed25615b2ea828214a79e0f3e07a`. Se leen atributos existentes del diccionario `ladb_opencutlist` mediante `Material#get_attribute`. Códigos de tipo observados: 1 madera maciza, 2 placa, 3 listón/perfil, 4 canto, 5 herraje, 6 lámina, 0 sin resolver. Solo se interpretan cuando coinciden **versión y build**; desconocidos/tipos incorrectos/versiones distintas quedan sin resolver, conservando la observación. No se deduce un tipo del nombre/color, ni se toman valores por defecto del plugin como datos confirmados.

`OclReader.capture(model)` enumera también `model.materials`, incluidos materiales sin aplicar. Caras sueltas pintadas se consideran uso y no se rotulan erróneamente como material sin aplicar. Cada pieza conserva ruta PID física, matrices, medidas XYZ locales escaladas, banderas de espejo/sesgo y origen de pintura frente/dorso/herencia. La geometría se recorre con el diagnóstico P1 ya probado, sin simplificar agujeros ni perder apariciones compartidas. No usa área local como área mundial bajo escala.

Por pieza se enumeran candidatos observados de placa y materiales de canto, sin elegir un lado 2D. Varios materiales de placa, caras sin pintura, material desconocido, sesgo/singularidad y falta de orientación/corte/veta quedan señalados. `capabilities`, `confidence`, `confirmed:false`, `production_ready:false` y `manual_validation_pending:true` acompañan el informe. **Un candidato único no significa material principal confirmado**; cantos principal/secundario dependen del lote futuro y nunca se asignan aquí.

Se leen medidas/reducciones de OCL como atributos brutos; no se convierten cadenas con unidades desconocidas ni se calculan cotas de corte a partir de tamaños ordenados. Los precios no se leen ni se inventan. `catalog_storage`, `supplier_export` y `optimization` son capacidades falsas, no implementaciones ocultas.

## UI y archivo local

Después de analizar el modelo, pulsar **Materiales y cantos** en la cabecera. La pantalla declara «Solo lectura». Permite buscar, filtrar placas/cantos/sin resolver/sin aplicar y elegir una pieza para revisar materiales de sus caras y su herencia. No altera el editor ni marca la guía como modificada. Tiene foco de teclado dentro del diálogo, Escape/cierre y regreso al botón original; vistas comprobadas a 1550 y 1000 px.

«Guardar informe local…» crea un JSON nuevo `planos-santo.material-review.v1`, máximo 30 MiB, sin sobrescribir, sin red. Cancelar no cambia modelo/guía. Si el nombre existe lo avisa. El informe se vuelve a leer del modelo al exportar; no pretende certificar una vista anterior. Si cambió el documento activo, el puente lo rechaza. El resto de notas, guardado y PDF sigue mediante el editor existente.

La nueva RBZ actualiza **Planos Santo** usando su mismo loader, como las versiones anteriores. No instala una segunda copia paralela ni toca la carpeta/diccionario de OpenCutList. Conservar 0.6.6 para reinstalar y reiniciar si se necesita volver atrás. Nunca instalar dos copias renombradas del mismo loader.

## Prueba nativa que detiene el loop en P1

La nube no ejecuta SketchUp. Antes de avanzar por P2→P6 según el orden del loop, verificar este adaptador en SketchUp 2026 real:

1. Conservar copia del SKP y la 0.6.6, instalar la **0.6.7**, cerrar todas las ventanas de SketchUp y reiniciar. Revisar versión habilitada. OpenCutList original permanece separado.
2. Abrir la copia, abrir también OpenCutList original y anotar versión/build. En Planos Santo pulsar **Materiales y cantos**. Si la versión/build son distintos a la referencia, se espera «sin resolver»; no forzar compatibilidad.
3. Contrastar tres materiales reales (placa, canto y otro disponible) con OCL original: tipo, veta observada y atributos brutos. Revisar material sin aplicar si existe. Elegir tres piezas, incluyendo una rotada/espejada/anidada si existe; contrastar frente/dorso y herencia. No hace falta crear/modificar casos en el original.
4. Exportar informe local con nombre nuevo y compartirlo con las diferencias observadas. Repetir cancelar y mismo nombre: no debe sobrescribir ni pedir guardar el SKP. Verificar nombres, selección, geometría y pila de Undo sin cambios por leer.
5. Cerrar la revisión y repetir guardar/renombrar/Undo/cámaras/notas/PDF en el editor actual. No aceptar los A3 densos que aún tienen avisos ni inventar las cinco medidas manuales de P1.2, que siguen pendientes.

Esta validación es el siguiente paso, **no un pedido de permiso para seguir programando ni una aprobación de producción**. P2–P6 siguen en backlog. No se generó el archivo de aprobación manual del runner, y no se declara `done`.
