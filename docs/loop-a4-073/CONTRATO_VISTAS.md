# Contrato de guía A4 — 0.7.3

Se conserva `GuideStore` versión 1 y atributo `PlanosSanto/guide_v1`. Cada mueble incorpora `presentation.guide` opcional para leer proyectos antiguos:

```json
{"mode":"both","hiddenPieceIds":["62228/46072/44976"],"sharedCamera":true,"observations":"Verificar escuadra antes de fijar."}
```

- `mode`: `exterior`, `interior` o `both`; determina exactamente una o dos representaciones en la misma página. No cambia la cantidad de páginas por mueble.
- `hiddenPieceIds`: rutas físicas exactas del exportador, únicas y pertenecientes al mueble. Nunca se escribe `hidden=`, ni se modifica una definición de SketchUp. Sólo se filtran caras, etiquetas y cotas de la representación interior. La tabla incluye todas las instancias.
- `sharedCamera`: si está activo ambas vistas usan `presentation.cameras.front`. Si está desactivado interior usa `cameras.back`, con el mismo sistema de cámara exterior, sin giro implícito de 180 grados.
- Cámaras: yaw -180..180 y pitch 10..80 grados; proyección ortográfica. `zoom` se conserva en el mueble (0.35..1.4) y se comparte entre vistas. Orientar vistas no cambia transformaciones originales.
- `observations`: hasta 2000 caracteres; el límite de caracteres no garantiza espacio en papel. La composición valida líneas reales antes de generar bytes.
- `hideIds`, `hiddenDimensions`, `dimensionOffsets` y notas existentes se conservan. Los nombres y medidas se obtienen del listado existente. IDs agrupados cumplen mismo componente/medidas/material; en impresión `×` indica ocurrencias visibles y la tabla conserva el total.
- Generar una guía anterior añade la configuración por defecto `both`, sin piezas ocultas y cámara compartida. El mueble pasa a representarse ensamblado. Las cámaras antiguas se conservan, pero `back` sólo se usa si se desactiva compartir; una trasera antigua pasa a orientación configurable de interior. Guardá una copia del SKP para volver a 0.6.9.
- Previsualización de visibilidad es transitoria. Aplicar la incorpora a la guía editable; Guardar la persiste con la operación existente y Undo. Cancelar no la incorpora. Se bloquea guardar/exportar mientras queda una previsualización sin resolver.
- Notas sobre piezas ocultas bloquean exportar la vista interior, con opciones de restaurar pieza, cambiar ancla o elegir exterior. No se descartan anotaciones.

Salida: PDF vectorial A4 horizontal, MediaBox/CropBox exactos 297×210 mm, exactamente una página por mueble; una o dos vistas, tabla completa, notas numeradas con flechas y observaciones. Tabla/notas 8 pt, cotas/IDs al menos 7 pt. El motor común se usa desde HtmlDialog y `/api/pdf/:id`. Si no cabe, falla antes de devolver bytes. No hay reducción ilimitada, truncado ni paginado automático. Los ajustes ofrecidos son modo de vista, cámara/zoom, agrupado correcto, mover/ocultar cotas explícitamente y abreviar textos. Las medidas no son editables.

## APIs de prueba disponibles

- `PlanosSanto::Release::VERSION` identifica versión cargada.
- `PlanosSanto::GuideStore.new(Sketchup.active_model).read` lee persistencia, sin escribir.
- `PlanosSanto::P1Diagnostics::Scanner.new(Sketchup.active_model).scan` lee geometría/visibilidad y contadores String corregidos.
- `PlanosSanto::NativeSession.new(model).scan` / `generate(ids)` analizan usando el exportador instalado; no cambian geometría.
- `docs/loop-a4/validar_instalacion.rb` verifica manifiesto y compara capturas. Es un helper de sólo lectura, no un parche del producto.
- Las pruebas automatizadas de nube usan dobles de API para callbacks del HtmlDialog; no equivalen a ejecución Windows.

Corrección0.7.1: la agrupación permite nombres y bases físicos distintos. La tabla muestra el primero como referencia, sin uniformizar miembros. Una edición explícita de fila sí renombra sus miembros. Agrupar/desagrupar/normalizar/guardar/reabrir por sí solos no propagan nombres.

0.7.2 modifica únicamente la prioridad de pintura de las cotas en PDF/SVG: trazos primero; máscaras blancas y texto al final. Se conservan posiciones, medidas, fuentes, anclas y campos persistidos.

0.7.3 protege remates y extremos medidos contra máscaras de otras cotas. Si no encuentra posición inicial, amplía búsqueda de distancias/posiciones con líder. Si sigue sin caber, bloquea. Los desplazamientos manuales también se validan. No cambia medidas, anclas, fuentes, modelos ni campos de guía.
