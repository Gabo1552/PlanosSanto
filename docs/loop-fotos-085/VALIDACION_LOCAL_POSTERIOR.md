# Validación de candidata 0.8.5 — Dot y Codex local

La nube no ejecutó SketchUp. Sus pruebas utilizan los controladores/servicios reales con dobles explícitos de la API. No equivalen a ImageRep, Material#texture=, Material#write_thumbnail o Material#save_as nativos. Preservar los informes anteriores, sin atribuirles cobertura nueva.

## Preparación

- Respaldar RBZ0.8.4, SKP y `%LOCALAPPDATA%/PlanosSanto` completo, incluido catálogo, backups, material-assets y photo-assets. Ensayar en copias y catálogo QA aislado, conservando OpenCutList en el perfil habitual.
- Cerrar TODAS las ventanas de SketchUp; instalar únicamente `PlanosSanto-0.8.5-candidata.rbz`, no el ZIP de entrega ni la referencia. Reiniciar completamente. Registrar versión, SHA256, archivos del manifiesto, SketchUp/Ruby/Windows/OCL y DPI. No cargar parches de runners históricos.
- Verificar carga sin red y comandos existentes; no duplicaciones de barras al reiniciar. Originales/modelo BM17 intactos antes/después. Usar las fotos privadas originales solo en la PC del usuario; no reenviarlas en evidencia pública.

## Fotos y biblioteca real

1. Crear una placa desde JPG válido y otra desde PNG válido con nombre Unicode. Usar foto QA reconocible con patrón asimétrico. Probar también canto. SKU/proveedor/precios vacíos: guardar permitido para diseño, approved comercial siguefalse.
2. Antes de guardar: picker/cancelación/preview no alteran materiales, caras, geometría, selección ni historial Undo. Intentar imagen dañada, extensión incorrecta, exceso12MiB/16MP, symlink y cancelación. Debe explicar el error y conservar biblioteca/modelo.
3. Guardar y pintar: comprobar nuevo objeto en `model.materials`, `material.texture` presente, misma fotografía en miniatura nativa y superficie pintada; no colorización posterior. Comparar patrón, no solo color. Elegir ancho/alto de textura conocidos y probar ejes0/90, frente/dorso, componentes rotados/espejados. Sin escala confirmada debe avisar, no inferirla por píxeles.
4. Medir decisiones reales desde +Material hasta primer pintado (meta<=5; explorador aparte). Comprobar inicio desde paleta compacta, teclado y vuelta al visor sin pantalla principal obligatoria.
5. Guardar SKP/cerrar SketchUp/reabrir: textura, UUID y guía se conservan. Borrar o mover el JPG original en COPIA QA y abrir modelo NUEVO: cargar el SKM de biblioteca y pintar sin requerir la foto original. Inspeccionar archivo SKM real con API nativa, no el formato simulado de los tests cloud.
6. Reimportar foto igual: usar existente/variante con nombre nuevo/reemplazo explícito. No duplicados silenciosos. Nueva versión cambia miniatura y SKM; las caras previamente pintadas conservan la versión anterior hasta repintar. El vínculo antiguo debe señalar revisión, nunca fingir que la cara antigua usa la imagen nueva. No sustituir materiales de otras piezas.
7. Probar Undo/Redo de creación nativa y de pintado. La biblioteca global permanece reutilizable después de deshacer cambios del modelo. Simular error de guardado con carpeta QA sin permiso; sin catálogo apuntando a SKM fallido ni nuevos materiales parciales. Restaurar permisos/copias.
8. Cerrar/abrir extensión y SketchUp, cambiar SKP, comparar catálogo antes/después. Importar los35SKM originales en QA y reimportar:35duplicados,0nuevos; conservar miniaturas y estados pendientes. No aprobar por nombre.

## Pintura y seguridad

- Herramientas Pieza/Cara/Canto/Quitar/Tomar, último material, favoritos/recientes y +Material disponibles; estado real de toolbar. Material vigente en alcance único puede activarse desde barra sin nueva autorización. Compartidos nunca reciben autorización automática.
- Pintar10caras seguidas sin10formularios; un Undo por clic/lote. Hover, cancelación y cuentagotas son de lectura. Lote Enter/Shift, Esc/cierre y cambio de modelo con cola pendientes de prueba real.
- Cantos1/2opuestos/4: previsualizar exactamente los lados que cambiarán, probar marco rectángulo y casos ambiguos/split/mirror; bloquear dudosos. Quitar cantos conserva placa/UV y deshace en una operación. Pieza sólo dos caras amplias; Cara sólo la señalada.
- Instancias compartidas, anidadas, rotadas/espejadas: alcanceúnico probado o bloqueo de ancestro inseguro; alcanceall requiere autorización explícita. Dimensiones, geometría/nombres/atributosOCL intactos. TeclasTab/ShiftTab/CtrlTab/flechas solo en contexto Tool, no robar escritura en campos HTML; Esc cancela.
- Cuentagotas de foto vinculada lista para diseño debe seleccionar ese material sin requerir ficha comercial. Si una cara carece de vínculo verificable, no confundir una muestra de lectura con autorización para pintar o producir.

## Regresiones

- BM17:17unidades, agrupación por definición/medidas/material sin renombrado implícito; editar fila agrupada modifica solo miembros explícitos; Undo recupera nombres/guía.
- A4 exterior/interior/doble: una hoja297×210mm, ocultas por ruta, cámara/zoom, cotas, ID opcional y nota/flecha correctos; guardar/reabrir. Tabla17filas que no cabe bloquea sin recortar ni crear hojas extra. Revisar legibilidad del caso cota0.7.1.
- Selector Guardar PDF abierto158s: éxito/cancelación tardía sin timeout rojo. Este ensayo nativo sigue pendiente desde arreglo0.8.2; el reloj simulado cloud no lo aprueba.
- Materialdiseño sinaprobación bloquea TXT. Con fichas/lotes/ejes/cantos válidos, nueve columnas TAB exactas: cant/base/altura/detalle/rota/canto_arr/canto_aba/canto_izq/canto_der; sin material/espesor extra, sin envío comercial automático. No validar SKU ni equivalencias ficticias.
- Pantallas1280×720/1920×1080 y DPI real100/125/150%; paleta440×760aproximada y maximizada, teclado/foco/contraste. Cloud CSSzoom no sustituye DPI nativo. Ensayar además perfilQA sinOCL y biblioteca/modelo grande.

## Retorno y rollback

Devolver PASS/FAIL/PENDIENTE por caso, hash instalado antes/después, capturas nativas, parámetros/escala real de foto, SKM QA/JSON, snapshotsUndo, PDF/texto/tamaño/render y conteo de clics observado. Mantener fotos y modelos privados separados; transferir evidencias autorizadas en paquetes menores32MiB. No cambiar producto ni aplicar monkeypatch de diagnóstico.

Rollback: cerrar SketchUp, reinstalar0.8.4 y restaurar respaldo completo de catálogo/activos si se desea revertir biblioteca del ensayo. Los SKP se restauran desde copia, no borrando originales. No hay migración destructiva de guide_v1, preferenciasps2/schema2 ni CatalogStore schema1.

No declarar producción aprobada antes de esta validación y la aceptación de materiales/SKU/veta del taller y pedido comercial válido.


## Revisar el vínculo después de editar la ficha

Ensayar también guardado parcial y completo de SKU/proveedor/medidas. Si cambia la huella del catálogo, la pintura normal debe bloquear hasta revisar el vínculo. Abrir **Pintar placas y cantos → Biblioteca y material real**, elegir la foto, desplegar **Asociar o instalar visual real**, seleccionar el material nativo que conserva esa foto y autorizar explícitamente **reemplazar asociación** y **reemplazar activo visual guardado**; confirmar y asociar. Debe guardarse un SKM actualizado sin pintar caras y volver a permitir diseño. Cambiar approved a true no debe habilitar por sí solo el TXT; orientación/lote/cantos siguen revisándose. Una foto con origen alterado no se puede reparar con estas casillas. Registrar Undo, activos y catálogo antes/después.
