# Backlog del loop 0.8.5 → siguiente candidata

| Orden | Prioridad | Entrega verificable | Dependencias |
|---|---|---|---|
| 0 | P0 | Auditar branch actual vs RBZ 0.8.5; trazar botones→controlador→herramienta, y conservar pruebas existentes | ninguna |
| 1 | P0 | **Botón Pintar directo** sin abrir ventana 1440×920, paleta modeless compacta y estado visible | 0 |
| 2 | P0 | Materiales/fotos seleccionables con un clic, último material seguro, cambio de modo rápido, Esc/Tab/flechas, sin duplicar guardas | 1 |
| 3 | P0 | Regression tests: Undo, shared definitions, caras ambiguas, contexto modelo, pedidos y bloqueo de materiales no aprobados | 1–2 |
| 4 | P1 | **Muebles** contextual: resaltar componente y editar nombre inline, vista previa de renombrado por lote y prefijos seguros | 0 |
| 5 | P1 | **Planos A4**: 1/2 vistas, cámara y ocultar por clic, edición directa de flechas/notas, preview real | 0 |
| 6 | P1 | Barra principal limpia de 5 acciones + secundarios en paleta/menú; iconos de marca originales 24/32 px; estados y atajos | 1,4,5 |
| 7 | P0 | Integración/regresiones: PDF A4, TXT maderera, catálogo `.skm`, fotos 0.8.5, persistencia y rendimiento | todos |
| 8 | P0 | RBZ candidata, evidencia, métricas de clics y paquete para Dot/Codex local | 7 |

**Secuencia sugerida de seis ciclos:** C1 auditoría + botón directo, C2 paleta/materiales, C3 nombres, C4 guías, C5 iconografía+flujo, C6 regresiones+paquete. Es una organización orientativa, NO una excusa para declarar terminado a los seis ciclos sin pruebas.

## Resultado de implementación en nube

Órdenes0–8 implementadas y verificadas automáticamente; candidata0.8.6. Trazabilidad/pruebas/limitaciones en docs/loop-flujos-086. Aceptación nativa NO otorgada; iframePDF, DPI, Tool/Undo/contexto y BM17 se verifican con Dot.
