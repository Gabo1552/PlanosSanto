# Implementación — candidata P0 0.8.7

## Cambio de comportamiento

Pintar activa una Tool real con paleta independiente, horizontal de 680×320. No crea el editor general ni solicita superficie, ejes, alcance o autorización en el flujo normal. Seleccionar una miniatura válida inicia o actualiza la herramienta; cambiar de material conserva la misma instancia activa. La creación desde foto puede ampliar temporalmente la paleta y pedir los datos iniciales del material, nunca por cada clic de pintura.

`OfflineController#quick_paint_start` descarta preferencias antiguas de cara/lote/ejes/alcance. Aplica `immediate:true`, placa completa, ambos lados, alcance único y sin lote. Valida material/UUID antes de actualizar las opciones de una Tool ya activa. Un vínculo inválido no reemplaza el material activo anterior. Barra y estado reflejan el modo real.

`SmartPaintTool` usa PickHelper y rutas persistentes completas, incluido contexto abierto. El resaltado inmediato es local a la pieza: no llama preview, inventario ni clasificación de materiales mientras se mueve el cursor. Al clic valida el contexto y llama `SmartPaint#apply_immediate`. Tab no puede volver accidentalmente a pintar cara. Escape finaliza. Foto→Guardar y pintar, biblioteca y acceso Pintar del panel usan también la interfaz inmediata. La herramienta avanzada anterior conserva su contrato mediante el botón explícito Pintura avanzada. Si una nueva selección es rechazada, la interfaz vuelve al material que realmente sigue activo.

`SmartPaint` reutiliza preview/token/apply internamente para consistencia, sin confirmación visible. Infiere ejes físicos por destino al hacer clic. `NativePaint` identifica las dos superficies principales de placas rectangulares y reemplaza sus materiales explícitos, frente y reverso. Conserva los acabados estrechos y los cantos reconocidos, también si están asignados a un lado inesperado. No cambia dimensiones, nombres, atributos OCL ni geometría.

El alcance siempre es la ocurrencia señalada. Si comparte definición, usa el `make_unique` existente cuando se puede demostrar que el contenedor no es compartido de forma insegura. Verifica topología, transformación y acabados de todas las caras antes de aplicar. Un fallo aborta la operación completa. Cada clic con cambios produce una operación Undo; un no-op no consume la anterior. Ancestro compartido, sólido ambiguo, textura proyectada/distorsionada o API insuficiente se bloquean con una advertencia, sin formularios ni aplicación parcial.

## Materiales reales y diseño

PhotoMaterial conserva su implementación: JPG/PNG crea textura nativa, miniatura y SKM archivado a partir del mismo original. El hotfix utiliza directamente el vínculo y esa textura, no un color de sustitución. MaterialPolicy sigue comprobando archivos inmutables y prueba nativa de foto.

Para SKM importado, permiso de diseño separado: exige procedencia `skm-import`, tipo placa/canto explícito y archivo original íntegro por SHA256, sin enlaces simbólicos. Un material genérico pendiente o de tipo desconocido no obtiene permiso. La biblioteca puede cargar el original verificado sin pedir aprobación comercial ni elegir otra vez el archivo. Los vínculos UUID y fingerprints siguen obligatorios. Los pedidos de maderera conservan su validación comercial.

## Límites de evidencia

Pruebas en nube con Tool y servicios reales, modelos/Picker/materiales/API de SketchUp simulados y JPG generado para ensayo. Las capturas son interfaz en Chromium y datos sintéticos. No son una instalación en Windows ni renderizado de SketchUp. No se atribuye a PhotoMaterial un resultado nativo no ejecutado.

Para aceptar el P0 faltan los diez casos nativos de VALIDACION_LOCAL_POSTERIOR.md, especialmente que la foto se vea en la pieza, cinco clics reales, aislamiento, cantos, Ctrl+Z y SKP cerrado/reabierto, también con SKM importado real. Sin aprobación de producción desde nube. PDF A4, nombres, medidas, anotaciones y TXT se incluyen en regresiones, sin funcionalidades nuevas fuera del hotfix.
