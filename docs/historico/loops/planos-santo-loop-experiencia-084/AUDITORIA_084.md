# Auditoría estática de 0.8.4 — 20/10/2026

Inspección del archivo `PlanosSanto-0.8.4-candidata.rbz` aportado por el usuario.

**Presente en código (no validado aquí dentro de SketchUp):**
- `planos_santo/quick_toolbar.rb`: barra propia, dos toolbars y acciones de materiales, placa, canto, quitar canto, cuentagotas, muebles, maderera y guías. El botón de cuentagotas se omite deliberadamente de la barra de herramientas visible, pero existe en menú/paleta.
- `planos_santo/smart_paint.rb`, `smart_paint_tool.rb`, `native_paint.rb`, `material_sample_tool.rb`: selección, preview y pintado seguro.
- `planos_santo/catalog_store.rb`: catálogo JSON persistente de uso del taller con validación y datos comerciales; aprobación estricta.
- `planos_santo/material_library.rb`: vincula un material REAL SketchUp con catálogo; usa `.skm` archivado y gestiona assets.
- `planos_santo/skm_import.rb`: importación `.skm` / ZIP / carpeta, miniatura embebida, candidatos pendientes de revisión.
- `planos_santo/offline.rb`: comandos `skm_preview`, `skm_install`, `catalog_add`, `catalog_save`, `smart_tool_start`, etc. La vía de importación usa `UI.openpanel` con `*.skm` y `*.zip`.
- `planos_santo/ui/app.css`, `ui/app.js`: UI compilada con biblioteca visual y paleta.

**Brecha material que motivó este loop:**
- No aparece en los comandos de interfaz Ruby 0.8.4 un flujo directo para elegir JPG/PNG, convertirlo en `Sketchup::Material` con `#texture=`, archivarlo para otros proyectos y usar exactamente la misma imagen como miniatura.
- Crear ficha comercial, vincular un SKM visual, instalar material en SketchUp y luego pintar pueden convertirse en pasos separados.
- Una ficha `approved` exige SKU, proveedor y datos de abastecimiento. Esto protege el TXT pero dificulta usar un material en fase de diseño cuando esos datos aún no existen.
- En CSS conviven estilos legacy con acentos naranja/azul y los estilos nuevos; una pasada de coherencia visual es necesaria.

**No concluir:** que el material personalizado no se pueda lograr con el motor actual. Antes de crear arquitectura nueva, reutilizar módulos existentes y mantener migración de datos.

Para reproducir verificaciones estáticas ejecutar `python3 planos-santo-loop-experiencia-084/scripts/auditar_base.py`.
