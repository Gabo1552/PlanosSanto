# Validación P0 en SketchUp 2026 — candidata 0.8.7

Cerrar TODAS las ventanas de SketchUp antes de instalar el RBZ. Conservar la 0.8.6 y probar en COPIA del modelo. Instalar desde Administrador de extensiones; reiniciar. Registrar versión Windows/SketchUp/Ruby, presencia de OpenCutList y SHA256 del RBZ. No cargar parches de runners históricos.

La nube ejecuta API doubles; NO comprueba render nativo, gestos Windows ni persistencia SKP real. No aceptar esta candidata para producción hasta devolver resultados de este recorrido.

1. Preparar una copia con cinco placas rectangulares en diferentes orientaciones; dos deben compartir definición. Asignar previamente un material explícito a ambas superficies principales. Agregar cantos reconocidos y otro acabado estrecho no catalogado. Conservar nombres, medidas, atributos, transformaciones y un snapshot de materiales por ruta/cara/lado. Incluir una placa anidada bajo ancestro compartido como caso inseguro separado.
2. Barra → Pintar. Debe abrir solo la paleta pequeña modeless, aproximadamente 680×320. Se puede orbitar el modelo. No aparece la ventana general ni formularios de caras/ejes/alcance/autorización. Si hay material válido recordado, queda activo.
3. +Material → Foto JPG. Elegir una foto propia reconocible, clasificar como placa y guardar/pintar. Las opciones de escala pertenecen a la creación del material y son opcionales; no deben reaparecer al pintar. La misma foto debe verse en la miniatura y como textura REAL de SketchUp. Registrar dimensiones físicas de textura si se verificaron.
4. Seleccionar la miniatura y Pintar pieza si no está activo; salir de toda edición de componentes. Hacer clic en la cara de cualquiera de las cinco placas. Sus dos caras principales deben cambiar aunque antes tuvieran materiales explícitos. No debe aparecer una confirmación ni seleccionar caras. La Tool sigue activa.
5. Pintar las cinco placas consecutivamente, sin reconfigurar. Mantener el cursor en movimiento y probar modelos con muchas piezas: no debe iniciar un análisis recursivo por cada hover. Registrar cualquier demora al clic por separado.
6. Elegir otro material mientras sigue activa y repintar una placa. No debe volver a la herramienta Selección ni requerir Activar. Escape termina el pintado. Volver a Pintar debe recuperar el material válido del modelo actual, nunca un UUID de otro modelo.
7. Verificar todos los cantos y acabados estrechos sin cambios. Pintar pieza conserva estas superficies; no sustituye un canto por melamina. Pintar canto usa el lado estrecho señalado, con ejes inferidos; no exige XY ni tocar la cara amplia. Probar quitar canto desde herramienta secundaria sin modificar melamina principal.
8. Pintar una instancia compartida segura: solo cambia esa ocurrencia. Verificar su instancia hermana por ruta. `make_unique` no debe alterar geometría, posición, nombres ni acabados no seleccionados. Ancestro compartido o geometría ambigua/insegura: una advertencia clara y cero modificaciones, sin solicitar formularios.
9. Ctrl+Z debe restaurar exactamente una aplicación y su aislamiento. Repetir para los cinco clics. No-op sobre material ya aplicado no debe consumir un Undo anterior. Probar Undo/Redo con textura, cantos y material diferente.
10. Guardar COPIA del SKP, cerrar, reiniciar y reabrir: verificar textura, miniatura, UUID, escala/veta, cantos, aislamiento y preferencias. Volver a pintar. Si la fuente JPG fue movida, debe servir el material de biblioteca archivado.
11. Repetir desde un .skm importado real: clasificar tipo una vez, sin aprobar ficha comercial. Cargar original verificado al modelo y usarlo desde paleta. Pintar cinco piezas/cambiar material/Undo/guardar/reabrir. El TXT de la maderera debe seguir bloqueado para material sin aprobación comercial. Un SKM desconocido, alterado o con vínculo ambiguo no debe pintar.
12. Regresión sobre copia BM17: 17 unidades, nombres izquierdo/derecho intactos, A4 exterior/doble de una hoja 297×210, notas/flechas/ocultas por ruta, cantos, catálogo y TXT de nueve campos. No afirmar probados los gestos que se siembren desde una API. Repetir en perfil sin OCL.

## Devolución a Dot

Informar PASS/FAIL/PENDIENTE para cada paso; errores completos de consola, capturas de la ventana completa (ausencia de general/formularios), vista nativa con foto reconocible, snapshots antes/después/Undo y SKP de ensayo autorizado. Separar datos privados. No modificar el producto durante la validación. Si hay defecto, conservar reproducción y hash instalado antes/después. La 0.8.6 permite volver atrás cerrando SketchUp y reinstalando su RBZ.

## APIs disponibles para Codex local

Los verificadores adjuntos son de solo lectura; cargarlos no los ejecuta automáticamente. Ejecutar `PlanosSantoValidacion087.integridad` para la instalación; revisar las entradas readonly del verificador de preferencias y registrar sus JSON. No cambiar el producto ni cargar un diagnóstico de otra versión.

- `PlanosSanto::SmartPaint#apply_immediate(data)`: modo sheet/edge/remove_edge, catalogId/materialUuid y targets con pieceId por ruta y faceIds persistentes. Ejes, alcance único y ambos lados se infieren. Muta únicamente dentro de una operación Undo; usar solo copia de ensayo.
- `PlanosSanto::SmartPaintTool#status`: active, mode, options, hover y queuedCount; la herramienta inmediata no necesita cola ni Enter.
- `PlanosSanto.instance_variable_get(:@offline_controller).smart_state`: estado real del controlador instalado, sin parches. Usar para observar, no reemplazar Tool ni modelar gestos como si fueran manuales.
- `MaterialLibrary#status`: designReady separado de supplierReady; un material de ensayo sin aprobar debe pintar pero no autorizar maderera.

`npm ci && npm run verify` ejecuta regresiones de nube; Node24, Ruby3.2+, Python3, Chromium y Poppler. El runner histórico de diagnósticos no debe inyectarse en la candidata.
