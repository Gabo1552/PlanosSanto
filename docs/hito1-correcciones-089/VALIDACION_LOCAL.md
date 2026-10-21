# Validación nativa de correcciones Hito 1 — 0.8.9

**No iniciar Hito 2.** Instalar el RBZ nuevo sin parches y tras cerrar TODAS las ventanas de SketchUp. Conservar 0.8.8 para volver atrás y probar solo COPIAS y biblioteca QA. Registrar versión, SHA256 y manifiesto instalado. Los resultados 0.8.8 recibidos están en EVIDENCIA_LOCAL_088.md; no se trasladan automáticamente a 0.8.9.

## P1: fotos (V1/V2/V3/V7/V12/V15)

1. Repetir el JPG privado 1200×1200 desde Pintar → +Material → Elegir foto y desde ficha con SKU → Asignar foto. Deben crear textura/miniatura reales sin rechazar un `load_file` nil válido. No enviar la foto a la nube.
2. Repetir con JPG/JPEG normal, PNG RGB, PNG con transparencia y, si existe, PNG indexado. Anotar `ImageRep` width/height/bits_per_pixel/row_padding y tamaño de data cuando el método devuelva nil. La candidata valida RGB24/RGBA32, límites y bytes exactos; cualquier contrato nativo distinto se reporta, sin forzar éxito.
3. Rechazar archivo corrupto, falsa extensión JPG↔PNG, dimensiones/cabecera inconsistentes y límites de 12 MiB/16 MP/16384 por lado. Cero materiales/índices nuevos cuando falla.
4. Crear foto nueva y pintar cinco piezas, cambiar material, verificar ambas caras y cuatro cantos intactos, escalas/veta/UV, pieza girada y espejo. Ctrl+Z/Redo y guardar COPIA, cerrar/reabrir. Reutilizar en otro modelo sin original JPG. Repetir las variantes de reemplazar foto existente y ficha con SKU/proveedor: no cambiar datos comerciales ni bloquear diseño por esos datos.

## P1: colisión SKM (V6)

1. Repetir Caju18mm con fuente Melamina petiribi18mm ya presente sin binding. Fotografiar/snapshot los materiales previos (nombres, ID, textura, color/alpha, propiedades colorize/PBR, diccionarios OCL/Planos Santo) y las piezas que los usan.
2. Elegir «Se instala al elegir». Si Materials.load devuelve el objeto previo, el primer intento se aborta; el reintento aparta su nombre SOLO dentro de una operación, importa el original nativamente y restaura el nombre antes de confirmar. No se asocia el previo por nombre ni por parecido.
3. La ficha debe quedar ready con UUID/objeto nuevo, textura real correcta; materiales/piezas previos exactos. Verificar observadores OCL, texturas colorizadas/PBR y nombres con Unicode. Ctrl+Z de la instalación restaura el estado completo; pintura y Undo siguen funcionando.
4. Repetir con Plywood (caso que ya funcionaba), con nombre de ficha igual al material nativo, y con dos fichas/activos distintos de nombres iguales. Verificar hash de SKM original intacto. Si el importador deduplica todavía por GUID, debe abortar con advertencia, sin falso éxito ni binding al previo.
5. Los fallos de rollback se cubren con dobles; NO provocar corrupción en producción. Si el motor comunica que no logró revertir, no continuar guardando: conservar evidencias y recuperar la copia de ensayo.

## P2: rendimiento y paletas

- Ejecutar `perfilar_sketchup.rb` por consola: solo define un módulo; no parchea producto ni ejecuta nada al cargar. `PlanosSantoPerf089.run(service: ..., request: ..., rounds:5)` llama preview/cancel de la instalación candidata. Registrar cinco tiempos y conteo TracePoint. El tracing tiene coste y NO se mezcla con la mediana. Debe observarse un inventario por plan; no usar los 57,32 ms sintéticos como tiempo Windows.
- Preparar diez solicitudes que realmente cambien (diez piezas sin ese material o alternancia controlada). `measure_writes(..., confirmed_copy:true)` es opcional y MUTANTE solo en copia QA; corta al primer no-op y lo marca. Registrar diez changed=true, mediana/rango y Undo. Si no, V19 sigue pendiente. Separar latencia de captura/automatización del tiempo de motor. Objetivo orientativo 300 ms, no aprobado desde nube.
- Abrir las dos paletas y crear/editar foto/color/SKM desde la otra ventana. Deben actualizarse catálogo, estados y miniaturas sin cerrar, sin resetear búsqueda/borrador ni detener Tool. Repetir mientras otro diálogo mantiene un selector abierto: al terminar debe aplicarse la invalidación pendiente, sin abrir otro panel ni guardar nada.
- Picking cerca de arista: registrar coordenada exacta, count, leaf_at/path_at de todos los registros del PickHelper y resultado. La observación anterior no es defecto confirmado; no asumir que puntos vecinos equivalen al clic original.

## Regresión y devolución

Repetir instalación/verificador, biblioteca QA/producción aisladas, originales por hash, nombres/transformaciones/cantos, A4 exterior y doble (una hoja 297×210, 17 piezas, nota/flecha), TXT con nueve columnas exactas y bloqueo comercial/orientación pendiente. V18 comercial continúa pendiente hasta prueba válida del proveedor.

Devolver matriz V1–V19 con variante y PASS/FAIL/PENDIENTE; no dar aprobación global si quedan fotos/UV/SKP/mediciones pendientes. Informe y JSON saneados pueden transferirse; archivos privados permanecen en PC. No modificar el producto ni cargar runners antiguos durante la validación.
