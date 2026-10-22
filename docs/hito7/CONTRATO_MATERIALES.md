# Hito 7 · Gestión de materiales — contrato de acciones del puente

Rama `claude/noche-hito7-materiales`. Todas las acciones nuevas viven en un bloque
aislado de `OfflineController#dispatch_action` (`material_management`). No cambian el
esquema de `catalog.json` (schema 1); los datos nuevos van en índices propios.

## Datos nuevos fuera del catálogo

| Dato | Dónde | Formato |
|---|---|---|
| Fichas archivadas (MATERIALES-09) | `<datos>/material-states.json` | `{schema:1, revision:int, records:[{catalogId, archived:true, archivedAt}]}` |
| Claves OCL escritas por PS (MATERIALES-13) | atributo del material nativo `PlanosSantoMaterial/ocl_written_v1` | JSON `{clave: valorEscrito}` |

## Acciones

Todas devuelven errores como `ExportError` (mensaje en español). `dryRun:true` nunca escribe
y responde con `noChanges:true`.

1. `material_extras` → `{archivedIds:string[], statesRevision:number}`. Si falla, la UI asume `[]` sin mostrar error.
2. `material_duplicate` `{catalogId, revision, name?, confirmed:true}` →
   `{catalog, catalogId, duplicatedFrom, name, warnings:string[]}`. La copia queda `approved:false`, `favorite:false`,
   conserva visual (foto/SKM) y datos comerciales.
3. `material_archive` `{catalogIds:string[], archived:boolean, revision, dryRun?, confirmed:true}` →
   `{archivedIds, changed, rows:[{catalogId,name,inModel:number,compatibleWith:number,warnings:string[]}], noChanges?}`.
   Archivar no borra la ficha, ni sus archivos, ni `compatibleIds`.
4. Paquete .zip (MATERIALES-07)
   - `material_package_export` `{catalogIds?:string[], includeArchived?:boolean}` → diálogo nativo →
     `{cancelled:true}` | `{fileName, items, files, bytes, sha256}`.
   - `material_package_preview` → diálogo nativo → `{cancelled:true}` |
     `{token, revision, package:{items,files,bytes,createdAt}, rows:[{id,name,kind,status:'new'|'duplicate'|'conflict',thumbnail:string|null,files:number,warnings:string[]}]}`.
   - `material_package_commit` `{token, revision, selectedIds:string[], renames:Record<id,string>, confirmed:true}` →
     `{catalog, imported, skipped}`.
   - `material_package_cancel` → `{cancelled:true}`.
   Contenido del ZIP: `manifest.json` + `photo-assets/<sha256>.(png|jpg|jpeg)`, `material-assets/<sha256>.skm`,
   `skm-import-assets/<sha256>.skm`. Cualquier otra ruta rechaza el paquete completo. Cada archivo se verifica
   contra su nombre y contra el manifiesto (sha256 y bytes). Las fichas importadas entran sin aprobar, con ids nuevos.
5. Textura (MATERIALES-10/11), solo fichas desde foto:
   - `material_texture_preview` `{catalogId, widthMm, heightMm, rotation:0|90|180|270}` →
     `{catalogId, current:{widthMm,heightMm,verified}, proposed:{widthMm,heightMm,rotation}, pixels:{widthPx,heightPx},
       thumbnail:string|null, affected:[{materialId,name}], repeats:{alongLength,alongWidth}|null, warnings:string[], noChanges:true}`.
     `rotation` es el giro horario adicional sobre la imagen actual; con 90/270 el ancho y alto propuestos ya vienen intercambiados por la UI.
   - `material_texture_apply` = preview + `{revision, assetRevision, confirmed:true}` →
     `{catalogId, applied:[{materialId,name,widthMm,heightMm}], textureScale, rotation, verification:{ok:true,checked:number}, warnings, scan?}`.
     Una sola operación (un Ctrl+Z). Si la verificación de la textura nativa falla, se aborta y se restauran los archivos.
6. `material_ocl_sync` `{catalogId?, dryRun:boolean, confirmed?:true}` →
   `{dryRun, changed, materials:[{materialId,name,catalogId,status:'written'|'updated'|'unchanged'|'conflict'|'kept',
     changes:[{key,from,to,action:'write'|'update'|'remove'}], kept:[{key,current,proposed}]}]}`.
   Regla: se escribe lo que falta; se actualiza solo lo que PS escribió antes y nadie tocó (`ocl_written_v1`);
   lo que cambió el usuario se conserva y se informa en `kept`.
7. `viewport_focus` → `{focused:boolean, method:'Sketchup.focus'|'unsupported'}`. Best effort: nunca falla la pintura.
