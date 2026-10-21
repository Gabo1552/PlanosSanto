# Integración de la biblioteca OpenCutList del usuario (35 SKM)

## Lo que hay de verdad
`referencias_privadas/OpenCutList.zip` trae **35 archivos `.skm`**, no un catálogo completo listo para producir. Doce archivos tienen `Canto` (o el typo `Catno`) en el nombre; ese prefijo es una pista, NO una validación de tipo. Ejemplos: Caju 18mm, Camellia 18mm, Blanco 18mm, Fondo Caju 5,5mm, Canto Gris Ceniza 29x0,45mm, Roble Halifax y Tirador.

Cada SKM es un ZIP válido con `document.xml` y, en muchos casos, miniatura y textura internas. Hay referencias absolutas a carpetas temporales de otras computadoras DENTRO de los metadatos de SKM; **no depender de ellas, no mostrarlas ni copiarlas a la biblioteca**. Usar la API `Sketchup::Materials#load(path)` sobre copia segura en SketchUp cuando corresponda y/o extraer miniaturas embebidas de manera acotada.

Ver `inventario_materiales.json` y `inventario_materiales.csv` (sha256 individual, presencia de textura, propuestas de espesor por nombre). No se obtuvieron de estos archivos SKU, proveedor, precios verificables ni la correspondencia canto principal/secundario. Exigir revisión del usuario.

## Flujo del asistente de importación (imprescindible)
1. **Seleccionar** archivo ZIP con SKM, carpeta, o materiales individuales `.skm`. Si el formato o API no lo permite, ofrecer importación gradual con progreso y resumen.
2. **Analizar** entradas en modo de solo lectura con límite de bytes/contenido, sin extracción de paths maliciosos, sin ejecutar código ni usar rutas absolutas internas.
3. **Previsualizar** tarjetas con nombre real, textura/minifoto si disponible, nombre archivo, tamaño, sugerencia `canto/placa/otros/desconocido`, espesor candidato, advertencias y colisiones.
4. **Resolver duplicados** por sha256 y coincidencia nombre+otras características; no renombrar, sobrescribir ni aprobar automáticamente.
5. **Importar como candidatos** utilizando `CatalogStore#import` / `CatalogStore#new_item`, adaptando al esquema `schema=1`, con registros `approved=false` y `observed` trazable, sin falsificar `kind`/campos obligatorios.
6. **Revisar**: tipo, espesor, formato, veta, ancho de canto, SKU, proveedor, compatibilidad de cantos, precios opcionales con fecha/fuente.
7. **Confirmar**: la aprobación solo si el esquema real `CatalogStore#validate` la admite, persistiendo con bloqueo/transacción y backup.
8. **Usar**: materiales del taller disponibles en proyectos nuevos; diferenciarlos de materiales cargados en el modelo activo. `Sketchup::Materials#load` debe ejecutarse solo en el modelo con intención del usuario y no altera automáticamente originales.

### Pruebas obligatorias
- Carga de 35 candidatos sin duplicar al volver a importar el mismo ZIP.
- Mantener textura y nombre para SKM con imagen, fallback claro para los que no traen textura.
- Archivo malformado se rechaza sin dañar catálogo previo.
- Caso `Catno Gris Grafito.skm` se sugiere como posible canto pero se deja sin aprobar.
- Dos SKM con nombre parecido pero bytes diferentes requieren resolución, no overwrite.
- Repetir importación con un elemento modificado registra conflicto, no duplica silenciosamente.
- CatalogStore revisionado, backups y aprobación no bypass.
- Ver materiales en colección del taller después de reiniciar SketchUp y abrir otro proyecto.
- Si no hay un dato necesario (ancho del canto, veta, espesor, precio) mostrar «Pendiente de completar», no inventar.

## Privacidad
NO publicar ni commitear `referencias_privadas/`, SKM ni texturas sin permiso del usuario. La nueva extensión debe permitir que el usuario mantenga su biblioteca en carpeta local. Los hashes/inventario solo son herramientas de diagnóstico.
