# Pruebas locales — Pintura Inteligente0.8.0

PENDIENTE de ejecución real en SketchUp2026. La nube usa dobles de API y Chromium; no dispone del viewport nativo ni certifica fluidez, veta industrial o impresión real. Trabajar sobre una copia y biblioteca QA aislada. No instalar fuentes sueltas ni cargar runners que parcheen el producto.

Cerrar todas las ventanas, instalar RBZ0.8.0, reiniciar y confirmar versión. Mantener los RBZ anteriores y hashes originales. No se requiere OpenCutList para materiales propios.

1. Abrir Pintado directo y Paleta compacta. Confirmar ventana pequeña y modelo accesible; cerrar/restaurar retorna al editor completo. Abrir/hover no cambia model.modified?.
2. Elegir placa aprobada ya vinculada a material real. Autorizar alcance compartido cuando corresponda y Activar. Señalar piezas: superficie naranja y rutas correctas; clic asigna material al lado configurado. Sin formularios por cada clic.
3. Pintar dos piezas, incluyendo una rotada/espejada. Deshacer cada aplicación y comparar geometría, nombres, atributos OCL y visibilidad. El material/cámara A4 no redefine ejes de corte.
4. Mayús-clic o modo lote agrega varias caras/piezas; permanecen resaltadas cyan al mover cursor. Enter aplica en UNA operación. Undo restaura todo. Escape descarta pendientes, sin pintar.
5. Cantos: elegir canto aprobado, U/V locales distintos y caras estrechas. Caras amplias, sesgo, bloqueo y orientación ambigua deben impedir aplicar sin modificar ninguna pieza del lote.
6. Quitar cantos: modo automático restaura la única placa aprobada comprobable; si hay ambigüedad, elegir placa de restauración explícita en la paleta. Verificar caras del frente/dorso y cuatro lados en revisión de pedidos. Undo restaura el canto; no se eliminan materiales del modelo/catálogo.
7. Reemplazar: elegir tipo, UUID de origen y destino aprobado. Solo se sustituyen las superficies seleccionadas con ese origen exacto. Verificar mismo tamaño/nombre con UUID distinto NO se reemplaza; lote sin coincidencias no añade Undo vacío.
8. Dos muebles comparten definición: la paleta muestra todas las rutas. Sin autorización no se aplica a todas; autorización explícita permite operación. Hacer única afecta solo la ocurrencia elegida cuando los ancestros son seguros; otro caso bloquea con explicación.
9. Textura real con UV personalizado afín: preservar dirección y escala al cambiar. Proyectada/distorsionada debe bloquear sin cambios. Ensayar frontal/dorso, material heredado, escala y espejo. Repetir Undo y reapertura. Esta comprobación visual es obligatoria antes de aceptar el tratamiento de veta/texturas.
10. Cambiar modelo activo con herramienta/cola abierta, cancelar/cerrar: no se modifica ninguno. Cambios de guía/pedido pendientes bloquean el armado/aplicación. Cambiar material/modo detiene la herramienta anterior.
11. Aplicación exitosa invalida la guía anterior; detener/cerrar regenera análisis manteniendo ajustes guardados. Verificar A4 exterior/doble, ocultas, nombres agrupados, cotas y notas. Cerrar la ventana durante la herramienta no deja una herramienta armada en segundo plano.
12. Guardar copia, cerrar y reabrir: materiales y guías conservados; selección de paleta recordada sin reautorizar compartidos automáticamente. Abrir otro proyecto recalcula UUID del material nativo, nunca usa uno ajeno.
13. Perfil sin OCL: materiales propios funcionan; metadatos heredados no verificables quedan para revisión, sin asignar equivalencias. No se modifica ladb_opencutlist. La aceptación comercial/proveedor sigue diferida.

Registrar versión/SHA, resultados, pasos y capturas nativas. Para cada resultado distinguir gesto manual, API nativa y automatización de nube. No declarar producción global por ejecutar algunos casos. Medir también fluidez de hover/cola en un modelo grande; no hay benchmark nativo en nube.

Desarrollo: npm ci y npm run verify con Node24/Ruby3.2+/Python3/Chromium/Poppler. Pruebas específicas: smart_paint_test.rb, smart_paint_tool_test.rb, smart_controller_test.rb y tests/offline/smart-paint.spec.ts. No ejecutar estos dobles como si fueran validación nativa.
