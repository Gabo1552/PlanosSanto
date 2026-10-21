# Candidata0.7.2 — protección visual de cotas

## Evidencia local recibida:0.7.1

SketchUp26.2.243/Ruby3.2.2, hashRBZ136da6591b33a5318cb31b0bc11d3330aac1918cf66262ad067b190a5befa90a. Operador/Codex local confirmó la corrección de nombres: agrupar/guardar+SKP/reabrir/desagrupar conserva20nombres y bases; editar P01 cambia sólo22/50 y22/51; Undo restaura nombres y guía completa. Doce comprobaciones base/regresión aprobadas más estas verificaciones. A4 real exterior/doble,1página297×210,17unidades, nota/flecha y3ocultas interiores por ruta. Guía/geom/visibilidad/originalSHA conservados.

La corrección de nombres está validada nativamente en0.7.1. **No se recibió aceptación visual del doble**: texto vertical parcialmente tapado a la izquierda de exterior, cerca800mm/bajo35mm, confirmado en renderPoppler240dpi. Ajustes reales:yaw-2,pitch10,zoom.7,8filas agrupadas, cámara compartida, ninguna cota oculta.

El PDF/recorte y ZIP están en ruta Windows inaccesible en nube. No se inspeccionaron estos binarios; hace falta adjuntarlos para reproducir exactamente BM17.

## Ciclo1 — análisis y reproducción independiente

Encontrado un defecto compatible, sin atribuir todavía causa al archivo real: PDF y SVG dibujan máscaras/texto de cotas antes de flechas y líderes de ID. Aunque sus rectángulos no se superpongan, un líder puede cruzar el texto y pintarse encima.

Reproducción sintética:createA4Demo(), yaw-2,pitch10,zoom1, escena exterior de impresión sin advertencias. El líder P06 intersecta el rectángulo del texto «760mm» de P07. Los parámetros nativos zoom.7 no reproducen ese mismo cruce en el modelo sintético. No se simula que sea BM17.

Corrección en curso: capas de cotas protegidas por encima de líderes, sin mover cotas, ocultar medidas ni modificar geometría. Pruebas de regresión y nueva candidata pendientes. El caso real sigue abierto hasta inspeccionar/repetir su PDF.

## Ciclo2 — implementación y pruebas dirigidas

PDF: textos y máscaras de cotas se pintan después de todas las flechas y líderes de ID. SVG: separadas fases de líneas y etiquetas en DimensionLayer; líneas antes de anotaciones, máscaras/texto después. Se mantiene interacción y no se modifica layout ni geometría.

Tres pruebas nuevas unitarias verifican cruce geométrico y orden real de llamadas al generar PDF vectorial doble (17piezas y nota/flecha). Las llamadas observadas delegan al motor real, no reemplazan la exportación. Once pruebas PDF dirigidas aprobaron junto con las regresiones existentes. Agregada prueba integral SVG sobre orden de capas y movimiento con teclado.

El sandbox devolvió EPERM al capturar salida de Poppler mediante Node; el binario directo sí funcionaba. Se ejecutaron pruebas locales con la elevación de sandbox autorizada por revisión automática, sin publicar ni enviar modelos. Los primeros fallos de entorno se conservan en logs; la verificación completa habilitada está en curso.

## Ciclo3 — verificación completa y entrega

`npm run verify` terminó con código0:154pruebas Ruby/1005aserciones,111TypeScript,16integralesweb y39integralesoffline. Lint, tipos, build y paquetes aprobados. Nueva prueba SVG confirma capas y movimiento de cota con teclado. Log:artifacts/verify-a4-072.log. Nueve pruebas Python/contrato también aprobadas; baseline0.6.8 y nueveSKP intactos.

PDF de demostración sintético regenerado con0.7.2 e inspeccionado visualmente. No es el recorte real. RBZ0.7.2 CRC/manifiesto aprobados,22entradas, sin SKP privados; hash y tamaño exactos en validacion-a4-072.json. RBZ0.7.1 preservado.

Estado:**NEEDS_USER/EVIDENCE**. Corrección genérica de pintura implementada y probada; defecto visual real BM17 sigue abierto hasta recibir PDF/recorte0.7.1 y comparar0.7.2 en las mismas condiciones. Se entrega paquete reproducible e instructivo; no se declara resuelto el caso exacto.
