# Backlog ordenado por ciclos

## C0 — Línea de base / arquitectura
- [x] Confirmar versión fuente realmente actual en la nube y conservar respaldo de fuentes/RBZ antes de tocar código (repositorio sin commits; no se creó commit masivo).
- [x] Localizar componentes de UI de la paleta y del enrutado, fuentes JS no minificadas y estructura de comandos Ruby.
- [x] Inspeccionar `offline.rb`, `smart_paint_tool.rb`, `smart_paint.rb`, `native_paint.rb`, `catalog_store.rb` y `workshop.rb`.
- [x] Añadir pruebas unitarias de registro de barras y comandos.

## C1 — Barra nativa y comandos
- [x] Conservar botón principal y registrar barra opcional `Planos Santo - Herramientas`.
- [x] Crear comandos de pintura, muebles, maderera y guías (cada acción debe funcionar).
- [x] Añadir iconos originales 24/32 y tooltips únicos, nombres para atajos en menú Extensiones.
- [x] Mantener estados y restauración de ubicación; no duplicar barras tras reload/restart.

## C2 — Pintado rápido y paleta
- [x] Cablear `sheet`, `edge`, `remove_edge` reutilizando `SmartPaintTool`/`SmartPaint`/`NativePaint`.
- [x] Paleta compacta enfocada en materiales/favoritos/últimos, accesible desde botones.
- [x] Evitar auto-confirmación sin selección explícita; respetar cambios sin guardar y modelos activos.
- [x] Alternar entre modos y cancelar colas previas; sincronizar estado toolbar↔modelo↔diálogo.

## C3 — Tomar material y navegación
- [x] Implementar cuentagotas de solo lectura o documentar bloqueo real; no crear botón inerte.
- [x] Abrir módulos Muebles, Maderera, Guías A4 por comando; conservar controles de producción.
- [x] Garantizar que no se exporte un pedido ni PDF desde un atajo sin validación ni solicitud del operador.

## C4 — Pruebas automatizadas
- [x] Pruebas de `UI::Toolbar/UI::Command` con dobles API sin confundirlas con ensayos nativos.
- [x] Pruebas de modo, selección compartida, Undo atómico, cierre de paleta, cancelación, modelos sin catálogo.
- [x] Regresión de nombres, materiales, cantos, TXT proveedor, 1/2 vistas PDF A4.
- [x] Verificación de paquete RBZ (manifest, iconos, dependencias, Ruby/JS).

## C5 — Handoff para pruebas nativas
- [x] Construir `.rbz` candidata sin instalarla automáticamente.
- [x] Entregar `VALIDACION_LOCAL_DOT.md` ajustado con pasos/capturas que debe registrar Dot.
- [x] Actualizar `ESTADO.json` a `CANDIDATA_PARA_VALIDAR` solo si pruebas automatizadas completadas y artefactos presentes. No afirmar validación de SketchUp.
