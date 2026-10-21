# Comparación nativa0.7.3 — BM17

La nube recibió y leyó el ZIP071. La causa exacta del fragmento no era texto cortado ni el líder de ID: dos marcas y trazos de35mm quedaban debajo de la máscara de800mm. Se reprodujo el mismo defecto con los datos exportados reales. La reproducción073 elimina el fragmento manteniendo129fragmentos de texto y26cotas:14exterior/12interior, una hojaA4. No se ejecutó SketchUp en nube.

## Verificación obligatoria

1. Instalar RBZ0.7.3 y cerrar/reabrir todas las ventanas de SketchUp. Verificar versión/hash y19archivos del manifiesto. No cargar fuentes anteriores en memoria.
2. Usar una copia del BM17 restaurado/intacto de la corrida071. Mantener17piezas/8filas agrupadas,ambas vistas,cámara compartida,yaw-2°,pitch10°,zoom0.7,hiddenDimensions=[]; mismas3rutas ocultas (dos puertas y bisagra22/255/257),misma nota sobre22/51. No editar nombres ni abreviaturas.
3. Exportar PDF y renderizar a240dpi. Comparar la zona izquierda junto800mm/bajo35mm con `dos-vistas-detalle-cotas.png` de071. Ya no debe haber remates a medio ocultar que parezcan letras. La cota35 puede quedar en otro lugar; comprobar que conserva valor, marcas completas y relación con la pieza. Revisar también45mm,613mm y el resto del plano.
4. Confirmar1página297×210mm,17unidades,tabla8filas,nota con flecha en ambas vistas,todas las cotas activas;26cotas entre exterior/interior. No aceptar valores borrados, truncados o sustituidos por omisiones silenciosas.
5. En Mover cotas, desplazar intencionalmente el texto de una cota encima de una marca de extremo de otra. Exportar debe bloquear con «tapa marcas de otra». Restablecer/reubicar y repetir. Los trazos continuos pueden pasar bajo un fondo de texto como convención técnica; ninguna marca de extremo debe quedar a medias.
6. Guardar/reabrir: cámaras,zoom,ocultas,notas,IDs y nombres individuales conservados. Repetir la prueba corta de agrupación/edición explícita/Undo ya aceptada en071. Comparar geometría/visibilidad/originalSHA.
7. Verificar exterior rotada,materiales/cantos y TXT sin nuevas regresiones. Si una composición no cabe, debe seguir bloqueando antes de recortar o añadir páginas.

## Evidencia para devolver

Versión/hash instalado,PDFnativo073,render240dpi,recorte de la zona,guía persistida y resultados por punto. La reproducción en nube es evidencia del algoritmo con datos reales; no reemplaza esta corrida de instalación/exportación en SketchUp2026.

Los SKP y datos recibidos permanecen privados. El paquete de código no incluye el corpus real. Para repetir en desarrollo de nube: `node --import tsx scripts/replay-bm17-071.ts fixtures/private/validacion-071-recibida artifacts/BM17-REPLAY-073.pdf` y `python3 scripts/verify-bm17-replay.py` (PyMuPDF requerido). El helper Ruby incluido es de sólo lectura y no parchea el producto.
