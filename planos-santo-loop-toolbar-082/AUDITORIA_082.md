# Auditoría estática de Planos Santo 0.8.2 candidata

Archivo analizado: `referencia/PlanosSanto-0.8.2-candidata.rbz`. Ninguna prueba se hizo dentro de SketchUp.

## Integridad de paquete

- `manifest.json` versión `0.8.2`, validación declarada **PENDIENTE de ejecución y aceptación del operador en SketchUp 2026**.
- 24 rutas con hashes SHA-256 en el manifiesto; las 24 coincidieron.
- 27 entradas ZIP, incluyendo directorios; 25 archivos regulares (uno es el manifiesto sin hash propio).
- 18 archivos Ruby (17 en carpeta + cargador raíz) pasaron `ruby -c` en entorno Linux. JS incluido pasó `node --check` (esto no prueba ejecución en WebDialog ni Ruby API).
- PDF declarado: `pdf-lib` local, sin servidor obligatorio.

## Implementado en código / piezas reutilizables

- `planos_santo/offline.rb`: crea **una sola barra** `UI::Toolbar.new('Planos Santo')` con un único `UI::Command` que abre la ventana principal. Añade dos acciones de menú auxiliares, pero ninguna barra independiente de herramientas rápidas.
- `planos_santo/smart_paint_tool.rb`: herramienta `Sketchup::Tool` de selección por `pick_helper`, cara/instancia, resaltado, selección acumulada con Shift, Enter para aplicar y Esc para cancelar. Emite eventos al controlador. **No hay que reescribirla**.
- `planos_santo/offline.rb`: dispone de acciones `smart_palette_load`, `smart_tool_start`, `smart_tool_stop`, `smart_tool_status`, `smart_palette_compact`; guarda ajustes `smart_paint_settings_v2`.
- `planos_santo/smart_paint.rb` y `native_paint.rb`: preparación/validación y mutación reversible sobre caras. `validate_smart_options` acepta `sheet`, `edge`, `remove_edge`, `replace` y exige configuración explícita (`confirmed`, `axes`, `side`, `scope`). Reaprovechar el servicio y los guardarraíles actuales.
- `catalog_store.rb` y `material_library.rb`: catálogo local permanente, materiales nativos/SKM, estados de aprobación y validación.
- `workshop.rb` y `supplier_order.rb`: pedidos con validaciones, TXT de nueve columnas; no hay que simplificarlas ni omitir preflight.
- `guide_store.rb`, `names.rb`, `session.rb`, UI: conservar guías A4, vistas, notas/flechas y renombrado.
- `ocl_reader.rb`: compatibilidad de lectura de materiales/cantos OpenCutList, no dependencia obligatoria para pintar nativamente.

## Ausencias o límites encontrados

- No hay `UI::Toolbar` adicional con comandos nativos para pintar placa, pintar canto, quitar canto, tomar material, nombres, pedido o guías A4.
- No se encontró herramienta de cuentagotas independiente activable desde una barra: incluir implementación segura de muestreo, NO fingir que existe.
- El botón «Ejes Inteligentes»/«Exportación Inteligente» equivalente a OpenCutList no existe como herramienta nativa autónoma: no crear botones vacíos. Dejar en backlog posterior.
- El controlador depende de estado de sesión y de cambios sin guardar. Los accesos rápidos deben respetar esas validaciones; **no deben forzar `confirmed:true` ni pintar sin selección explícita de material y superficie**.
- Se requiere prueba de sincronización de barra con herramientas activas y cancelación (`deactivate`, `onCancel`, cambio de modelo, cierre de ventana).
- No se evaluó precisión geométrica, compatibilidad real del catálogo, ni instalación en SketchUp. Sin validación final de producción.

## Código para orientar a Codex (no parches preaplicados)

- `offline.rb`: líneas ~414–429 registran `UI::Command`, menú y toolbar actual.
- `offline.rb`: líneas ~145–180 exponen smart palette, herramienta y modo compacto.
- `offline.rb`: líneas ~282–331 administran opciones y preferencias persistidas.
- `smart_paint_tool.rb`: manejo de clic, resaltado y selección por instancia.

Documentación externa revisada:
- https://ruby.sketchup.com/UI/Toolbar.html
- https://ruby.sketchup.com/UI/Command.html
- https://docs.opencutlist.org/getting-started/installing/toolbar
- https://docs.opencutlist.org/features/smart-paint-tool
