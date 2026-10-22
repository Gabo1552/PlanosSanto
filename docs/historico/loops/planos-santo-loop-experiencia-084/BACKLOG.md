# Backlog priorizado — 6 ciclos sugeridos

## Ciclo 1 — Auditar y diseñar sin romper nada
- [x] Comparar código del proyecto nube con referencia RBZ 0.8.4; identificar diferencias posteriores.
- [x] Inventario de rutas materiales (SKM/JSON) y pintado (preview/apply), puntos de clic y barreras.
- [x] Crear tokens UI Planos Santo y maquetación en fuentes, sin cambiar lógica.
- [x] Tests baseline de catálogo, pintura, PDF A4, nombres, TXT.

## Ciclo 2 — FOTO REAL A MATERIAL REAL (P0)
- [x] Seleccionar JPG/PNG nativo; validación de bytes/decodificación y tamaño.
- [x] Crear material nativo real con textura de foto; escala configurable y advertencia veta.
- [x] Generar miniatura derivada del material; mismo contenido que pinta.
- [x] Guardar SKM en biblioteca privada para proyectos futuros y evitar pérdida al borrar JPG.
- [x] Probar guardado/reapertura, Undo, fallo, duplicados, conflictos.

## Ciclo 3 — Material rápido para diseñar (P0)
- [x] Simplificar alta (`+ Material` -> foto, nombre, tipo, espesor; guardar y pintar).
- [x] Estados claros: `Listo para diseño` / `Pendiente para maderera` / `Validado para maderera`.
- [x] Preservar fichas antiguas y aprobación comercial sin relajación del TXT.
- [x] Usar material nuevo sin ir a otras 3 pantallas; añadir favoritos/recientes.

## Ciclo 4 — PINTADO INTELIGENTE (P0)
- [x] Abrir herramienta y último material desde barra sin diálogo principal.
- [x] Herramientas Pieza / Canto / Cara / Tomar / Limpiar + submodos de canto 1/2/4.
- [x] Galería persistente con miniaturas, filtros y scroll.
- [x] Hover con preview, clic para aplicar, Undo por acción.
- [x] Piezas compartidas, orientación dudosa y limpieza destructiva mantienen guardas.
- [x] Atajos razonables: Tab, Shift+Tab, Ctrl+Tab, flechas, ESC (solo en contexto).

## Ciclo 5 — IDENTIDAD E ICONOS (P1)
- [x] Navegación comprensible y simplificada para taller; acciones de primera línea.
- [x] Rehacer iconos originales propios con consistencia 24/32px, tooltip y estado activo.
- [x] Ajustar alto contraste, foco, DPI Windows y CSS legacy.
- [x] Mantener `+ Material` y miniaturas útiles también en paleta compacta.
- [x] Fotos grandes y materiales abundantes sin congelar la UI.

## Ciclo 6 — REGRESIÓN Y CANDIDATA (P0)
- [x] Tests unidad/integral del flujo completo con JPG/PNG y biblioteca de 35 SKM.
- [x] No regresión: nombrar muebles, cantos, pedido TXT exacto, guías A4 con 1/2 vistas, flechas.
- [x] Comparativa de clics y capturas de UI; manual de 1 página para encargado.
- [x] Build RBZ candidata, manifest correcto, Ruby/JS y reporte reproducible.
- [x] Estado `NECESITA_SKETCHUP` / `CANDIDATA_PARA_VALIDAR`; jamás `PRODUCCIÓN_APROBADA` sin tests reales.

**No incluir todavía:** optimizador de cortes nuevo, herrajes, rediseño de datos de pedidos, scraping del catálogo de proveedor.


Checks registran implementación/pruebas nube, no aceptación nativa. DPI real, instalación, decodificación, render/SKM, persistencia/Undo y proveedor siguen PENDIENTES en ACEPTACION.md. Cuentagotas de nativos no vinculados informa sin fabricar un vínculo; las fotos nuevas sí están vinculadas para diseñar. No hay limpieza destructiva genérica: Quitar cantos restaura caras estrechas verificadas. Git sin historial: no se hizo commit masivo; fuentes y pruebas reproducibles entregadas en ZIP.
