# Validación local — 0.8.23

Usar una copia del modelo y una biblioteca QA aislada. No modificar la biblioteca de producción para estas pruebas. Cerrar todas las ventanas de SketchUp, instalar el RBZ candidato y reiniciar. Verificar versión y manifiesto con `docs/validacion-0811/verificar_0811_sketchup.rb`.

1. Abrir un modelo con melamina y canto configurados previamente con OpenCutList. Materiales → En este modelo → Crear ficha desde material. Debe abrir la ficha, nunca Pintar ni pedir seleccionar componentes.
2. Verificar nombre, miniatura, tipo, espesores, ancho de canto, formato de placa y veta frente a los atributos reales. Comprobar un material con múltiples espesores y otro con múltiples formatos: no debe inventarse un formato único.
3. Repetir con OpenCutList deshabilitado, reiniciando SketchUp. Los atributos almacenados deben poder leerse sin cargar el plugin.
4. Con un material texturado sin atributos OCL, crear ficha: elegir Placa, nombre, espesor y largo/ancho de placa. Repetir con Canto y su espesor/ancho. La textura debe provenir del material del modelo, sin solicitar el archivo original.
5. Cancelar una ficha. No debe cambiar el catálogo ni el modelo. Reabrirla y guardar. Confirmar ficha vinculada, miniatura y ausencia de herramienta Pintar.
6. Comparar antes/después materiales de frente/reverso, UV, instancias compartidas, nombres, geometría y atributos OCL. Solo se agrega la vinculación de Planos Santo. Ctrl+Z deshace esa vinculación; la ficha permanente permanece reutilizable.
7. Guardar/reabrir SKP y reiniciar SketchUp: ficha, enlace y miniatura conservados. En otro modelo instalar la ficha y comprobar textura real del SKM archivado.
8. Desde Piezas, Crear ficha debe abrir el material correcto. Una pieza sin material no debe romper la vista; una sección ambigua no debe elegir un material por nombre. Editar una ficha existente abre sus propiedades en Materiales.
9. Cambiar material/modelo mientras la ficha está abierta: al guardar debe pedir volver a abrirla. Nunca debe escribir en el modelo equivocado.
10. Regresiones: pintar placa/canto + Undo, nombres agrupados, A4 de una/dos vistas con notas y flechas, pedido TXT por material y optimización. Las aprobaciones comerciales no se inventan al crear fichas.

Registrar PASS/FAIL por caso, versión/hash, datos OCL originales, capturas y errores de consola. No publicar modelos, SKM ni texturas privados. Pendiente ejecución real: no hay aceptación de producción desde la nube.
