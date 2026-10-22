# Hito 7 · Coordinación entre sesiones (materiales)

Rama: `claude/noche-hito7-materiales` (desde `claude/ux-extras-0811`). Contrato del puente: `CONTRATO_MATERIALES.md`.

## Para la sesión que migra `catalog_store.rb` a schema 2

Esta rama **no cambia** `catalog_store.rb` ni las claves de `catalog.json`. Todo dato nuevo vive fuera:

| Dato | Ubicación actual | Propuesta para schema 2 |
|---|---|---|
| Ficha archivada (MATERIALES-09) | `<datos>/material-states.json` `{schema:1, revision, records:[{catalogId, archived:true, archivedAt}]}` | Campo `archivedAt: string|null` en la ficha. La migración debe leer este índice, copiar `archivedAt` y conservar el archivo como respaldo. |
| Origen de una copia (MATERIALES-08) | `observed.duplicatedFrom` (catalogId de la ficha original; `observed` ya es libre) | Puede quedar en `observed`. |
| Claves OCL escritas por PS (MATERIALES-13) | Atributo del material nativo `PlanosSantoMaterial/ocl_written_v1` (JSON `{clave: valor}`) | No es del catálogo; no requiere migración. |
| Escala/giro de foto (MATERIALES-10/11) | Reutiliza `observed.photo` (`textureScale`, `imageAsset`, `sourceHash`, `widthPx/heightPx`) sin claves nuevas | Sin cambios. |

Puntos de contacto con el schema que la migración no debe romper:
- `MaterialPackage#read_package` valida las fichas del paquete con `CatalogStore#validate` sobre `{'schema'=>1,...}`. Con schema 2, importar paquetes v1 debe pasar por la migración (o aceptar v1 explícitamente) y el `manifest.json` debería subir a `schema: 2`.
- `MaterialLibrary#duplicate` copia la ficha entera y reemplaza `id/name/approved/favorite/updatedAt/sourceHash`: si schema 2 agrega claves con identidad (p. ej. `code`), hay que decidir si se copian.

## Pendientes fuera del alcance de esta rama (archivos que no toqué)

- Paleta de pintura: resuelto en la UI (`SmartPaintPalette.tsx`), que pide `material_extras` y oculta las fichas archivadas de la lista, los recientes y "requiere atención", salvo la que esté elegida. `paint_materials.rb` y `smart_palette_load` no cambiaron; si otra sesión mueve el filtrado a Ruby, puede quitar el de la UI.
- `smart_paint*.rb`: sin cambios. MATERIALES-19 se resolvió con la acción aislada `viewport_focus` que la UI llama después de iniciar la herramienta desde la biblioteca (único cambio en `SmartPaintPalette.tsx`: esa llamada best effort).
- `Sketchup.focus` existe solo en APIs recientes: la acción devuelve `method:'unsupported'` si no está. **Falta verificar en SketchUp 2026 real** que el foco pase al viewport.
