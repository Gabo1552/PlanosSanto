# Planos Santo 0.7.0 — candidata A4

- Reemplazo de la salida A3 por A4 horizontal 297×210 mm, una hoja por mueble y composición de una o dos vistas.
- Exterior ensamblado e interior con ocultamiento individual por ruta de instancia, exclusivamente en la representación. Previsualizar/aplicar/cancelar/restaurar. Tabla y cantidades completas.
- Cámaras ortográficas guardadas; giro, inclinación, zoom y opción de compartir orientación. Sin rotación del modelo.
- Observaciones de armado guardadas en la guía y PDF. Notas con flechas, cotas movibles/ocultables y opción de IDs conservadas.
- Etiquetas por tipo intercambiable en impresión al activar agrupación. Cantidad visible en dibujo y total en tabla. Selección física completa en editor.
- Composición validada antes de devolver bytes: sin truncado, reducción ilegible ni páginas adicionales. Tabla y notas: 8 pt; cotas e IDs: mínimo 7 pt.
- Mismo motor vectorial para extensión y exportación web. Corregida conversión de colores HSL/RGB al PDF.
- Integrado sólo el parche de diagnóstico recibido de Codex local: claves públicas String para contadores. Conservado payload JSON.
- Preservados renombrado/prefijos/propuestas, biblioteca de materiales, cantos por cara, correspondencia 2D y TXT por lote con nueve columnas. No se agregan presupuestos ni optimización.

Compatibilidad: lectura de guías previas; al generar se añade configuración A4 ensamblada por defecto. Guardar una copia del SKP antes de migrar. Volver al RBZ antiguo requiere reabrir la copia anterior del SKP, porque no conoce los nuevos campos.

La ejecución de nube no valida SketchUp 2026. BM17 real e instalación candidata deben comprobarse según CODEX_LOCAL.md. Los PDF de muestra de 17 piezas son sintéticos y están identificados.
