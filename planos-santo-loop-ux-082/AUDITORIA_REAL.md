# Auditoría estática del RBZ 0.8.2 proporcionado

Inspección del ZIP interno, **sin ejecutar SketchUp**:
- `planos_santo/offline.rb`: expone `UI::HtmlDialog`, un `UI::Toolbar.new('Planos Santo')` con **un solo `UI::Command`** al final del archivo (`command = UI::Command.new('Planos Santo')`).
- `planos_santo/smart_paint.rb`, `smart_paint_tool.rb`, `native_paint.rb`: backend existente de pintado de placas y cantos con herramienta interactiva.
- `planos_santo/catalog_store.rb`: catálogo persistente por usuario (`%LOCALAPPDATA%/PlanosSanto/catalog.json` en Windows), esquema estricto 1, control de revisiones, backup al guardar y requisitos para aprobar fichas.
- `planos_santo/material_library.rb`: assets y vinculación de materiales del modelo y fichas del catálogo; conservar.
- `planos_santo/ocl_reader.rb`, `material_resolver.rb`: detección OCL/lectura; no forzar dependencia.
- `planos_santo/names.rb`, `workshop.rb`: nombres y operaciones del encargado.
- `planos_santo/supplier_order.rb`: exportación/propuesta de pedido de proveedor; NO cambiar el contrato sin prueba.
- `planos_santo/guide_store.rb`, `exporter.rb`: guías A4 y notas; preservarlas.
- `planos_santo/ui/app.css` (CSS extenso) y `ui/app.js` (bundle grande): identificar las fuentes originales antes de editar el bundle generado; preferir componentes, estilos/tokens coherentes y build reproducible.
- `planos_santo/ui/index.html`: CSP local; conservar capacidad offline y recursos locales.
- `planos_santo/icon-24.png`, `icon-32.png`: iconos del comando general; falta colección para herramientas independientes.

## Referencias visuales del usuario
1. `image(20261020-194154).png`: barra SketchUp. Tomar **los iconos lineales uniformes de la derecha** como estilo deseado; evitar mezcla de pictogramas en perspectiva/color y botones distintos.
2. `image(20261020-194201).png`: Smart Paint OCL, modos horizontales arriba, material activo abajo, foco en modelo; usar flujo equivalente con `Sketchup::Tool` + paleta compacta HTML (no tapar el viewport).
3. `image(20261020-194227).png`: catálogo OCL, barra lateral oscura, botón activo destacado, tarjetas con muestras y controles visibles.

## Brechas que aborda este loop
- Acumulación de pantallas/diálogos; carga cognitiva y acciones sin prioridad visual.
- Falta de consistencia visual entre accesos rápidos y ventana principal.
- Acceso de Pintura Inteligente mediante menús internos en lugar de acciones nativas inmediatas.
- Biblioteca de 35 `.skm` no incorporada aún como experiencia de importación por lote con imágenes, revisión y asociaciones.
- Feedback escaso de selección, guardado, deshacer, hover de pieza, materiales no aprobados y pedidos bloqueados.

No afirmar que estas funciones estén ausentes si el repositorio en nube ya avanzó más allá de la 0.8.2: **auditar el código actual antes de implementar**.
