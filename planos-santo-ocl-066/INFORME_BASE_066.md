# Inspección estática del archivo PlanosSanto-0.6.6.rbz

Fuente: `baseline/PlanosSanto-0.6.6.rbz` facilitado en esta conversación. Comprobación de estructura sin ejecutar SketchUp.

- Contiene `planos_santo.rb`, `bootstrap.rb`, `offline.rb`, `exporter.rb`, `session.rb`, `guide_store.rb`, `names.rb`, `p1_diagnostics.rb`, `ui/index.html`, `ui/app.css`, `ui/app.js` y recursos/licencias.
- `manifest.json` declara versión `0.6.6`, Windows / SketchUp 2026 y validación manual **pendiente**.
- `OfflineController` usa `UI::HtmlDialog`; expone las acciones `scan`, `generate`, `names_catalog`, `names_preview`, `names_apply`, `save`, `pdf`, `diagnostic` (además de `dirty`).
- El PDF actual utiliza `pdf-lib` local por medio del paquete JavaScript; no obliga a abrir LayOut.
- `NameManager` gestiona nombres de instancias sin renombrar definiciones de manera global. Hay resguardos ante definiciones compartidas, edición externa y metadatos de nombres.
- `P1Diagnostics` solo observa material, geometría, caras y ciertas claves de `ladb_opencutlist`; indica explícitamente `production_ready: false` y no confirma la orientación de los cantos.
- **No hay acciones del controlador para un catálogo persistente del taller, importación de cortes desde OpenCutList, optimización de placas o exportación TXT a la maderera.**
- `exporter.rb` contiene `VERSION = '0.3.0'`; `NativeExporter#document` cambia la versión del documento a 0.6.6, pero otros reportes pueden conservar 0.3.0. Unificar la fuente de versión en la fase de infraestructura.
- UI principal empaquetada en `ui/app.js` de ~3.8 MB. Buscar en el repositorio los fuentes no minimizados/transpilados antes de modificar JS compilado.

**No son pruebas de integración.** Para validar comportamiento real se requiere el código fuente del proyecto existente, SketchUp 2026 y algunos modelos de referencia.

## Regresión obligatoria

No romper: generación de axonometrías despiezadas, etiquetas P01/P02, edición de nombres, notas con flechas reanclables, persistencia de anotaciones y exportación vectorial PDF A3 horizontal por mueble. No modificar a ciegas la geometría del usuario.
