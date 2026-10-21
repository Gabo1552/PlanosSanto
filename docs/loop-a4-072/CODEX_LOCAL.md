# Validación visual pendiente — candidata0.7.2

## Estado

La corrección de nombres de0.7.1 quedó verificada en BM17 por Codex local. Se conserva esa corrección. Falta aceptar visualmente el PDF doble: en0.7.1 se informó texto vertical parcialmente tapado cerca800mm/debajo35mm en exterior. No se recibió todavía el PDF/recorte en este entorno de nube.

0.7.2 corrige un defecto reproducido de manera independiente: los líderes de ID podían dibujarse sobre cotas ya impresas. Ahora todos los trazos quedan antes de las máscaras y textos de cotas, en PDF y SVG. No cambia tamaño, posición ni selección de cotas. **No se afirma que resuelva el recorte real hasta compararlo.**

## Instalación y prueba

1. Preservar0.7.1, sus PDF y `dos-vistas-detalle-cotas.png`. Trabajar con copia del SKP restaurado/intacto usado en la validación anterior. Instalar RBZ0.7.2 y cerrar/reabrir todas las ventanas de SketchUp. Verificar versión y hashes. No cargar runners que parcheen fuentes antiguas.
2. Usar el BM17 real:17piezas,20instancias,8filas agrupadas; cámara compartida, yaw-2°,pitch10°,zoom0.7, `hiddenDimensions=[]`, mismas tres rutas ocultas y nota que en0.7.1. Conservar guía exactamente equivalente para que la comparación visual sea válida.
3. Exportar doble A4. Verificar una página297×210mm,17unidades, todas las cotas activas. Renderizar con Poppler a240dpi, usando el mismo comando/fuente/zoom de la captura anterior. Comparar la zona izquierda de EXTERIOR junto a800mm y debajo35mm. Verificar todos los dígitos/letras completos y que no se hayan ocultado medidas. Revisar también las restantes cotas y ambas vistas al100%.
4. Revisar continuidad/comprensión de flechas y líderes: el fondo de una cota puede interrumpir un trazo que pasa por debajo, como en dibujo técnico, pero las notas/IDs y sus destinos deben seguir claros. No aprobar si una punta o información necesaria queda oculta.
5. Abrir visor, modo Mover cotas: seleccionar, arrastrar y mover con teclado sigue funcionando. Ocultar/restaurar una cota conserva el comportamiento. PDF/visor deben coincidir en prioridad de texto.
6. Repetir exterior rotada, guardar/reabrir y la prueba corta de nombres de0.7.1: agrupar/guardar/desagrupar sin editar conserva nombres; edición explícita de P01 afecta sólo sus dos miembros y Undo restaura guía y nombres.
7. Mantener controles de geometría/visibilidad, originalSHA, materiales/cantos y TXT. Un bloqueo de composición continúa siendo un bloqueo: no forzar exportación incompleta ni aprobar páginas extra implícitamente.

## Evidencia necesaria

Adjuntar el paquete `validation-071/PLANOS-SANTO-071-RESULTADOS-LOCALES.zip`, o como mínimo el PDF doble0.7.1 y `dos-vistas-detalle-cotas.png`, además del PDF0.7.2 y su recorte240dpi. La ruta `C:/Users/gabyh/...` no es accesible desde nube. Indicar hash instalado, ajustes, resultado por punto y cualquier diferencia. No atribuir la causa del BM17 al líder de ID sin examinar los archivos.

Se incluye helper Ruby de sólo lectura para manifest/guía/nombres/geometría: `validar_instalacion.rb`, versión0.7.2. No es un parche del producto. Su ejecución nativa y la comparación visual quedan pendientes.
