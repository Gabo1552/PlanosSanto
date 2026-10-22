# Revisión de OpenCutList — hallazgos de diseño concretos

Fuentes verificadas (20/10/2026):

- Repositorio oficial: https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension
- Implementación Ruby del menú y barra: https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/blob/master/src/ladb_opencutlist/ruby/plugin.rb
- Smart Paint: https://docs.opencutlist.org/features/smart-paint-tool
- Materiales y texturas: https://docs.opencutlist.org/features/applying-materials
- Barra y herramientas: https://docs.opencutlist.org/getting-started/installing/toolbar
- Cambios 7.0 (mejoras de interfaz): https://docs.opencutlist.org/whats-new/in-version-7.0
- API Ruby: https://ruby.sketchup.com/Sketchup/Material.html

## Ideas a tomar (NO copiar interfaz literal)

1. **Acción en contexto**: `SmartPaint` se activa desde la barra sin navegar menús del plugin. OpenCutList construye `UI::Command` por herramienta en `plugin.rb` y usa estado marcado `MF_CHECKED/MF_UNCHECKED`.
2. **Mismo espacio de trabajo**: en pintado, modos arriba (pieza, cantos, caras, muestra, limpia); modelo en centro; selector de material abajo con `+` y filtro.
3. **Pintado rápido de cantos**: 1 canto, 2 opuestos y 4 cantos; accesible sin abrir diálogos de propiedades por cara.
4. **Sin fricción de teclado**: Tab/Shift+Tab cambian herramienta; Ctrl+Tab cambia submodo; flechas eligen materiales; ESC sale de la herramienta.
5. **Textura real**: desde OpenCutList 5.0 se puede elegir imagen de textura, rotar y configurar dimensiones. No es sólo foto decorativa. La API de SketchUp permite `Material#texture = ruta` y `Material#write_thumbnail`.
6. **Materiales reutilizables**: el material `.skm` puede conservar atributos. OpenCutList permite importar/reemplazar materiales y duplicarlos.
7. **Interfaz graduada**: atributos comerciales avanzados opcionales mientras se diseña; hay funciones de menú contextual, orden por tipo y exportaciones cercanas al listado.

## Diferenciación Planos Santo

- Branding verde bosque / crudo / madera suave, logo y tipografías originales; no usar naranja ni copiar símbolos exactos de OpenCutList.
- Flujo por trabajos del taller: Pintar, Muebles, Maderera, Guías A4 (y panel Inicio discreto). Proveedor TXT de 9 columnas como acción propia.
- Menor cantidad de configuraciones visibles; modo avanzado sólo cuando hace falta.
- Preferencia por **fotografía → textura real + miniatura de la misma fuente → pintura inmediata**.
- Mantener el nombre/código de pieza y los cantos por orientación que ya implementa Planos Santo.

## Aspectos no estudiados / para confirmar
- No se ejecutó código de OpenCutList ni SketchUp desde este análisis, y no se comprobó su rendimiento en Windows a distintas escalas DPI.
- Consultar la licencia GPLv3 antes de incorporar código o artefactos, conservando obligaciones de atribución/código fuente. Preferible implementar diseño original inspirado en patrones UX.
