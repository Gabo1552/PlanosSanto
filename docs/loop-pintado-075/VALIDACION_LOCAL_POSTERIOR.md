# Validación local focalizada — candidata 0.7.5

Pendiente de ejecutar en Windows/SketchUp2026. La validación local0.7.4 se conserva y no acredita automáticamente esta versión. Los temas comerciales y la aceptación por el proveedor se dejan para el siguiente hito, según indicación del usuario.

Cerrar todas las ventanas de SketchUp antes de instalar el RBZ0.7.5. Reiniciar, abrir una copia guardada y confirmar versión en Diagnóstico. No cargar fuentes sueltas ni parchear la instalación. Conservar0.7.4 como respaldo.

1. Abrir Pintar placas y cantos. Actualizar biblioteca; comprobar que no cambian geometría, materiales ni estado modificado del modelo.
2. Crear una vista previa y pulsar Actualizar biblioteca: desaparece la confirmación anterior; volver a previsualizar requiere revisión y consentimiento nuevos.
3. En dos procesos/sesiones con carpeta de datos QA común, cambiar una asociación/activo desde la segunda sesión sin modificar la revisión comercial. En la primera, intentar asociar con la revisión visual anterior: debe bloquear sin cambiar modelo/índice. Actualizar biblioteca y volver a confirmar permite continuar.
4. Crear preview y cambiar externamente el material o modelo. Aplicar debe fallar, desaparecer la confirmación vieja y permitir otra previsualización. Nunca se debe repetir el pintado automáticamente. Si la respuesta es incierta, revisar/analizar el modelo antes de cualquier nuevo intento.
5. Crear preview, cambiar a otro modelo y cancelar/cerrar el panel. Debe cerrar sin modificar ninguno. Al volver al modelo anterior, el token cancelado no sirve para aplicar.
6. Generar/guardar una guía. Desde el pintado, abrir Instalar archivo SKM y cancelar el selector: aviso de cancelación, cero materiales añadidos, PDF/guía siguen vigentes. No debe requerir regeneración por cancelar.
7. Comprobar pintado/Undo normales y aplicación idéntica sin cambios; reabrir una copia y revisar asociaciones. Recorrer UUID duplicados/reparación solo con copia de catálogo QA y confirmación explícita.
8. Repetir regresión breve A4 exterior/doble, nombre de piezas agrupadas, notas y medidas. La hoja sigue siendo297x210mm, una por mueble; no confundir un bloqueo preventivo de composición con un PDF exportado.

Guardar versión/hash, resultados y capturas de cada caso. Los conflictos preparados artificialmente se ensayan sobre copias QA; nunca alterar la biblioteca real del taller para probar un error. Un índice SKM/hash incoherente debe bloquearse sin sobrescribirlo.

El paquete incluye fuentes y pruebas automatizadas. En desarrollo: npm ci y npm run verify (Node24, Ruby3.2+, Python3, Chromium y Poppler). Las pruebas Ruby de biblioteca/controlador y las E2E de pintado usan dobles explícitos; no sustituyen la verificación nativa. No se solicita enviar un pedido ni probar un catálogo comercial en este ciclo.
