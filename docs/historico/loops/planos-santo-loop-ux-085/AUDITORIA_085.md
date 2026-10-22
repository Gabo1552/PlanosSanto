# Auditoría estática 0.8.5 (comparada con 0.8.4)

Fuente directa: RBZ originales facilitados por el usuario. **No son resultados de ejecución de SketchUp.**

## Avances nuevos confirmados por el código

- Se agregaron `photo_material.rb` y `material_policy.rb`: carga local de foto JPG/PNG, lectura de dimensiones, verificación de imagen, persistencia/miniatura, vínculo a material nativo y distinción entre listo para diseñar y aprobado para maderera.
- `offline.rb` ahora reconoce `material_photo_pick`, `material_photo_create`, `material_photo_install`, y combina miniaturas de los `.skm` con los materiales fotográficos.
- `native_paint.rb` y `smart_paint.rb` ampliaron `paintScope` (cara/pieza), `edgeCount` (1, 2 o 4) y vista previa de caras afectadas.
- `smart_paint_tool.rb` permite recorrer materiales con flechas y cambiar submodo con Tab. Hay salvaguardas explícitas para piezas compartidas, vista previa y deshacer.
- `material_library.rb` y `material_resolver.rb` validan vínculos visuales; las fichas de diseño pueden pintarse aun sin ficha comercial aprobada.
- UI (`ui/app.js`, `ui/app.css`) modificada para materiales fotográficos y pintura.

## Brechas que motivan el loop siguiente

- **`quick_toolbar.rb` no cambió** entre las dos versiones. Ya expone comandos, pero `OfflineController#quick_action` llama a `show`: abrir una herramienta rápida lleva a la ventana general (1440 × 920) y requiere pasos de preparación.
- `OfflineController#validate_smart_options` exige explícitamente opciones `confirmed`, lado, alcance y ejes. Hay que proporcionar valores seguros sin repetir formularios, **sin saltar los guardas ni pintar en masa silenciosamente**.
- La UI de pintura contiene un gran `paint-panel`; en uso nativo necesitamos una paleta pequeña y persistente que deje accesible el modelo 3D.
- **`names.rb` no cambió** entre versiones. Tiene identificación por ruta de instancia y previsualización/aplicación; falta reducir la navegación del encargado y editar/resaltar en un mismo panel. No atribuir reconocimiento inteligente perfecto a la implementación actual.
- **`guide_store.rb`, `session.rb`, `supplier_order.rb` y `quick_toolbar.rb` no cambiaron**. El flujo A4 y sus controles existen, pero necesitan edición directa y pruebas de legibilidad.
- Falta evidencia de prueba nativa de la 0.8.5 completa, clics medidos, capturas comparativas y archivos A4/TXT aceptados.

## Puntos de integración concretos

| Tarea | Archivos a inspeccionar primero |
|---|---|
| Atajos y entrada directa | `quick_toolbar.rb`, `offline.rb`, `ui/app.js` |
| Herramienta nativa/paleta | `smart_paint_tool.rb`, `smart_paint.rb`, `native_paint.rb`, `ui/app.css` |
| Fotos y selección | `photo_material.rb`, `material_policy.rb`, `material_library.rb`, `skm_import.rb` |
| Nombres | `names.rb`, `piece_highlight_tool.rb`, `ui/app.js` |
| A4 | `guide_store.rb`, `session.rb`, `ui/app.js`, `ui/app.css` |
| Menús/iconografía | `quick_toolbar.rb`, `icons/*.png`, fuentes de diseño propias |

No dar por superadas pruebas en SketchUp porque el archivo abre o tiene sintaxis correcta.
