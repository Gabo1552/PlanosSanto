# Experiencia de fotos y pintura — candidata 0.8.5

Continúa las fuentes0.8.4 verificadas; el RBZ de referencia adjunto es idéntico a esa baseline y se conserva intacto. No se reemplazaron módulos por versiones anteriores ni se publicó material privado. El prototipo HTML contiene imágenes de referencia y también se excluye de los paquetes de fuentes/entrega.

## Flujo implementado

En Materiales y en la paleta compacta, **+Material → Elegir foto JPG/PNG → Guardar y pintar**. Nombre derivado del archivo editable, tipo placa/canto y espesor opcional para diseño. Escala de textura separada del formato comercial y de las medidas del tablón. SKU, proveedor y precio no bloquean el diseño. Estado comercial permanece pendiente; `approved` no se eleva automáticamente.

PhotoMaterial valida el archivo elegido únicamente por Ruby: firma, límite12MiB/16MP, dimensiones y decodificación con ImageRep nativo. Rechaza enlaces, URLs, contenido corrupto o cambios de contexto. JS recibe token/revisión y una vista previa acotada, nunca elige rutas arbitrarias. Material#texture= crea una textura real; no se aplica color posteriormente. Material#write_thumbnail produce la miniatura; Material#save_as archiva el SKM. El original y miniatura se guardan por hash en photo-assets; el SKM en material-assets, fuera del instalador.

Modelo, catálogo e índice de activos se publican bajo locks existentes con validación, backups y rollback ante error. Cancelar/analizar no cambia el modelo. Duplicados: reutilizar, variante con otro nombre o nueva versión confirmada. Reemplazar crea un material nativo nuevo sin repintar caras anteriores; las versiones antiguas piden revisión si se intenta usarlas como la nueva. Se puede cargar el SKM en otro modelo sin el JPG original, con una acción explícita de biblioteca.

MaterialPolicy separa permiso de pintar y aprobación comercial. Las fotos requieren procedencia y archivos propios verificables, índice vigente y vínculo nativo coherente. Los registros aprobados anteriores conservan su contrato. Completar la ficha comercial puede volver obsoleto el vínculo: se exige revisión explícita antes de reparar el archivo/vínculo, nunca aprobación o resincronización silenciosa. SupplierOrder y el contrato TXT siguen validando aprobación, lote, medidas, ejes y cantos.

La paleta reutiliza SmartPaint/NativePaint. Guardar y pintar usa alcance único y no concede permisos compartidos. La barra puede retomar un material vigente en alcance único; en otras condiciones muestra las opciones necesarias. Cara recubre la señalada; Pieza sólo las dos caras amplias verificadas. Cantos1/2opuestos/4 y quitar cantos usan un marco rectangular comprobado, preview de todas las caras afectadas y un Undo. Orientación ambigua, escala física incompatible o ancestro compartido inseguro se bloquean. Modos y materiales pueden cambiar con teclado en la Tool; los campos HTML conservan su teclado normal.

Identidad verde profundo/crudo/madera, iconos vectoriales originales conservados, foco y contraste revisados. Se mantienen cinco módulos, búsqueda/favoritos/recientes, cuentagotas, materiales SKM, nombres, maderera y A4/vistas/cotas/notas/flechas. No se copió código, iconos ni identidad de OpenCutList. Sin optimizador, herrajes ni presupuestos nuevos.

## Evidencia y límites

RESULTADO.json detalla las pruebas finales. Las comparativas usan el mismo mueble sintético, catálogo QA y ventanas; la UI0.8.4 anterior se ejecuta congelada. La galería HTML/PNG identifica sus capturas como sintéticas. El contador de decisiones describe automatización del browser y API doble, no tiempos de un operario ni gestos del explorador de Windows.

Los35SKM reales se probaron en catálogo QA privado:35miniaturas,35candidatos pendientes,35duplicados/0nuevos al reimportar, revisión y archivo originales intactos. Sólo se entregan conteos, no los materiales ni sus texturas. Los fixtures JPG/PNG de pruebas son originales sintéticos; ImageRep/Material/Materials de los ensayos cloud son dobles explícitos. Las pruebas cloud no aprueban decodificación, SKM, render ni Undo nativos.

Limitaciones que deben conservarse en la validación: cuentagotas de un material nativo sin vínculo permite consultar su apariencia, pero no inventa un permiso de pintura ni una ficha comercial; usar fotos creadas por este flujo o un vínculo válido. La asociación de foto comprueba archivos archivados y prueba de origen nativa; una edición externa de píxeles que conserve atributos requiere comprobación visual nativa. No se afirma comparación criptográfica de todos los píxeles embebidos en SketchUp. Grandes bibliotecas/fotos/modelos, DPI Windows, perfil sin OCL y escala/veta industrial necesitan ensayo local.

Ver GUIA_ENCARGADO.md para el recorrido corto y VALIDACION_LOCAL_POSTERIOR.md para instalar, verificar hashes, probar fotos/otro SKP/Undo/compras/A4 y hacer rollback. No hubo ejecución de SketchUp en la nube y no hay aprobación de producción.
