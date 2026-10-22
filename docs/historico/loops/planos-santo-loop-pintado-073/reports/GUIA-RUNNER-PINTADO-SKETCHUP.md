# Runner local de pintado — candidata 0.7.4

Este archivo describe una prueba **pendiente de ejecutar en SketchUp 2026**. En la nube solo se verificó la sintaxis Ruby del runner. No es un plugin, no se instala en Plugins y no cambia clases del producto. Cargarlo no ejecuta pruebas ni modifica el modelo.

## Preparación

1. Instalar el RBZ candidato 0.7.4, cerrar todas las ventanas de SketchUp y abrir SketchUp 2026 nuevamente. Abrir Planos Santo una vez para cargar sus APIs instaladas. No cargar scripts del producto de versiones anteriores.
2. Conservar el SKP original intacto. Crear una copia con **Guardar como**, en otra ruta. Trabajar exclusivamente sobre esa copia; completar los materiales aprobados y sus vínculos desde la interfaz instalada, guardar los cambios en la copia y salir del modo de edición de grupos/componentes.
3. Guardar o descartar los cambios pendientes de guía, biblioteca y pedido. Cerrar el diálogo del producto durante este ensayo para evitar acciones simultáneas. El runner no llama al controlador de la ventana; los bloqueos del controlador se validan también desde su UI en el checklist local.
4. No realizar otras acciones ni hacer Undo/Redo mientras corre `exercise`. La prueba aplica una sola operación de pintado y la deshace inmediatamente. No guarda el SKP. No prueba persistencia por reapertura.

Abrir Ventana > Consola Ruby y cargar el archivo transferido, ajustando su ruta real:

```ruby
load 'C:/RUTA/validar_pintado_sketchup.rb'
```

## Preflight sin escrituras

```ruby
v = PlanosSantoValidacionPintado074
pf = v.preflight
puts pf['extensionVersion']
puts pf['paint']['pieces'].map { |p| [p['id'], p['name']] }.inspect
puts pf['library']['materials'].map { |m| [m['id'], m['name'], m['binding'], m['issues']] }.inspect
puts pf['catalog'].map { |i| [i['id'], i['name'], i['kind'], i['approved']] }.inspect
```

Elegir una ruta **real** de pieza de la salida anterior. No copiar identificadores de ejemplos o de otro modelo:

```ruby
pf = v.preflight(piece_id: 'RUTA/REAL/DE/PIEZA')
piece = pf['paint']['piece']
puts piece['faces'].map { |f| [f['id'], f['normal'], f['frontMaterialId'], f['backMaterialId']] }.inspect
puts piece['affectedPaths'].inspect
```

Revisar visualmente las caras y todas las rutas afectadas. Una definición compartida puede alcanzar otro mueble. Los `face_ids` son los identificadores persistentes de **esas caras**, no los de sus instancias. `material_uuid` proviene de `binding['uuid']` y `catalog_id` de `binding['catalogId']` de un material aprobado sin incidencias.

`axes` son los dos ejes locales confirmados del plano de corte: 0=X, 1=Y, 2=Z. No derivarlos de la cámara A4 ni ordenar dimensiones para adivinarlos. Para `mode: 'edge'`, seleccionar solamente caras estrechas compatibles con ese plano; el producto bloquea caras amplias, ambigüedad y sólidos no ortogonales. Para placas, usar `mode: 'sheet'` y caras seleccionadas explícitamente.

## Aplicación optativa y Undo inmediato

Sustituir los textos marcadores por datos revisados. `copy_path` debe ser la copia actualmente abierta, guardada y sin cambios. `original_path` debe ser otro archivo existente que se conserva intacto. La función rechaza usar el mismo archivo para ambos.

```ruby
result = v.exercise(
  piece_id: piece['id'],
  face_ids: ['ID_REAL_CARA'],
  catalog_id: 'UUID_REAL_DEL_ITEM',
  material_uuid: 'UUID_REAL_DEL_VINCULO_NATIVO',
  axes: [0, 1],
  mode: 'sheet',
  scope: 'all',
  side: 'front',
  confirm: true,
  copy_path: 'C:/PRUEBAS/copia-074.skp',
  original_path: 'C:/MODELOS/original.skp',
  expected_paths: piece['affectedPaths']
)
puts result.inspect
```

`side` admite `'front'`, `'back'` o `'both'`. El runner solo admite alcance `'all'` y exige la lista de rutas revisada; **no** hace `make_unique`. Probar el aislamiento único por UI de manera separada y supervisada.

El ensayo exige que al menos una cara/lado vaya a cambiar de material; si todo ya coincide, se bloquea para evitar deshacer una operación anterior sin relación.

La función verifica asignación frontal/posterior en todas las ocurrencias afectadas, conservación de geometría/transformaciones/visibilidad, ausencia de cambios en atributos propios y OCL, materiales y catálogo, restauración completa tras `Sketchup.undo` y hashes intactos de los dos archivos en disco. No hay guardado automático. Si una comprobación posterior al pintado falla, intenta Undo de seguridad una sola vez y eleva el error; no continuar sin revisar el modelo y registrar la consola.

Guardar evidencia en un archivo **nuevo**, opcionalmente:

```ruby
v.write_report(result, 'C:/PRUEBAS/pintado-074-resultado-01.json')
v.write_report(pf, 'C:/PRUEBAS/pintado-074-preflight-01.json')
```

La escritura es exclusiva: no sobrescribe evidencia previa. Los informes contienen nombres, rutas y catálogo privados; mantenerlos locales y compartir únicamente por el canal autorizado.

## Evidencia que sigue siendo manual

- Comprobar colores/texturas reales por cara, frente y dorso, con 1/2/4 cantos y piezas rotadas/espejadas; comparar antes y después de Undo.
- Repetir en definición compartida entre muebles: alcance explícito y ausencia de cambios fuera del alcance. Probar la opción única permitida y sus bloqueos en anidamientos ambiguos.
- Aplicar desde UI y **guardar la copia**; cerrar/reabrir y comprobar persistencia de vínculos, colores y materiales sin volver a ejecutar el runner, que deshace su propia aplicación.
- Cambios pendientes de guía/pedido deben impedir pintado, vínculos e instalación de activos. Cancelar preview no debe modificar el modelo.
- Confirmar conservación de nombres individuales y agrupados, guías A4, cámaras, ocultamiento por ruta y anotaciones.
- Revisar los cuatro lados, conflictos PS/OCL y TXT de nueve columnas en lotes compatibles. No enviar pedidos ni efectuar compras desde este ensayo.
- Adjuntar resultados reales de instalación y comprobaciones visuales al informe local. Un resultado `passed: true` del runner **no aprueba producción**, el diseño A4 ni la aceptación del proveedor.
