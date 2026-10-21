# Contrato: foto propia -> material nativo -> miniatura idéntica -> pintura

## Experiencia mínima

- En Biblioteca o paleta se pulsa **+ Material** → **Elegir foto** con `UI.openpanel` local para JPG/JPEG/PNG.
- Tras elegir foto: preview, nombre editable y tipo placa/canto; espesor para placa/canto según uso. Presentar tamaño de textura y sentido de veta de manera comprensible (puede quedar la textura en tamaño por defecto con indicador `escala sin verificar` para diseño, no inferir la escala por los píxeles).
- Crear `Sketchup::Material` en `Sketchup.active_model.materials` con `Material#texture = ruta` o `[ruta, width, height]` cuando tamaño real haya sido confirmado. Evitar `material.color=` después, pues puede colorizar y alterar la textura. Comprobar `material.texture` no nulo.
- Miniatura debe generarse **del material real** (preferir `Material#write_thumbnail` en SketchUp 2026 o del archivo fuente validado con equivalencia comprobable). Si el usuario reemplaza textura, la tarjeta se actualiza inmediatamente; nunca se muestran dos imágenes no sincronizadas.
- Guardar copia local privada del material como `.skm` mediante `Material#save_as` y almacenar índice por hash para instalarlo en otros SKP. Embebido en el modelo y reutilización global son operaciones distintas: probar ambas.
- `Guardar y pintar` deja la herramienta de dibujo activa y selecciona este material. `Guardar` sólo agrega biblioteca/modelo.

## Doble estado, manteniendo seguridad

1. **Listo para diseño**: nombre + tipo válido + material nativo/archivo visual correcto; permite pintar en SketchUp aun sin SKU o proveedor, registrando que falta verificar abastecimiento.
2. **Validado para maderera**: además proveedor, SKU, espesor, formato, veta, compatibilidad de cantos, orientación y equivalencia física verificados. Recién entonces participa en TXT de producción.

La 0.8.4 exige `approved: true` para resolver materiales en pintura; implementar una separación de permisos sin bajar controles del TXT y manteniendo compatibilidad con registros existentes. No cambiar silenciosamente `approved` de materiales anteriores; migraciones versionadas con backup y tests.

## Manejo seguro de archivos

- Selección del archivo mediante diálogo nativo Ruby, no aceptar rutas arbitrarias de JS ni URL remotas. Imagen local regular JPG/PNG con firma y decodificación válidas, sin enlaces simbólicos; límites de tamaño y píxeles razonables (p. ej. 12 MiB y 16 MP, configurables).
- Sanitizar nombre, procesar errores sin perder material/catálogo existente, escritura transaccional y backups. No guardar base64 grandes en JSON. Hashear/custodiar originales en carpeta privada.
- Duplicado por hash y nombre: ofrecer `usar existente`, `crear variante` o `reemplazar` (cambio explícito, revisar instancias pintadas).
- No cambiar materiales de otras piezas por modificar una definición compartida sin avisar. Guardar undo nativo por operación; restaurar ante excepción.
- Evitar pixelados y repetición engañosa: mostrar aviso si se trata de foto no repetible / sin escala real. Veta rotada sólo en representación deseada, con pruebas 0/90 grados.
- La importación masiva `.skm` de los 35 archivos sigue disponible. Cargar imágenes *nuevas* no requiere convertirlas manualmente a SKM.

## Comprobaciones de aceptación

- JPG y PNG de prueba (incluyendo Unicode en el nombre): material nuevo existe en `model.materials`, tiene `material.texture`, se visualiza pintado, miniatura presenta la misma textura, persiste tras guardar/reabrir `.skp`.
- Guarda `.skm` reutilizable: abrir modelo nuevo, cargar material del catálogo y pintar sin necesitar el JPG original en Descargas.
- Probar editar/reemplazar textura y que se actualicen preview y `.skm` sin confundir material de otro proyecto.
- Probar imagen dañada, archivo demasiado grande, duplicado, cancelación, prueba Undo/Redo, archivo eliminado en disco y catalogo antiguo v1.
- La maderera continúa bloqueando `Listo para diseño` que no se haya validado comercial y geométricamente.

## APIs verificadas
- `Sketchup::Materials#add`: https://ruby.sketchup.com/Sketchup/Materials.html
- `Sketchup::Material#texture=`, `#write_thumbnail`, `#save_as`: https://ruby.sketchup.com/Sketchup/Material.html
- `Sketchup::Texture`: https://ruby.sketchup.com/Sketchup/Texture
