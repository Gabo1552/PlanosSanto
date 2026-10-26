# Comprobación local de 0.8.25

Instalar `dist/PlanosSanto-0.8.25-candidata.rbz` desde el Gestor de extensiones y reiniciar SketchUp completamente. Verificar 0.8.25 en la cabecera y en el diagnóstico. Usar primero una copia del modelo y de la biblioteca.

1. Confirmar que Guardar guía y Exportar PDF A4 aparecen arriba, sin la antigua fila de botones. Guardar y cerrar se encuentra en Opciones de guardado.
2. En Materiales, comprobar las cuatro herramientas secundarias, su cierre y la vuelta del foco. Crear una ficha de tipo Herraje sin dimensiones de placa. Crear otra desde un material del modelo de tipo OCL 5: debe conservar la textura y no pintar caras.
3. En Muebles, abrir Sugerencias de nombres. Buscar una pieza, ajustar el frente si corresponde y guardar. Comprobar nombres, posiciones de las piezas y Undo de SketchUp.
4. En Piezas, abrir la optimización de una placa y espesor. Verificar que Maderera muestra exactamente esa combinación. Cambiar distribución, ampliar al 150/200 %, volver a Ajustar y localizar una pieza en el modelo. Exportar TXT y comparar con el material seleccionado.
5. Activar Pintar desde la interfaz y desde el balde de la barra rápida: ambos deben usar la misma herramienta en la vista 3D. Cambiar entre placa y canto desde su tira. Verificar pintura y Undo con instancias compartidas.
6. Seleccionar geometría y pulsar Crear componente. Debe abrirse el diálogo nativo; cancelar no crea nada. Confirmar una segunda vez debe crear el componente con el nombre indicado. Sin selección, la barra nativa debe deshabilitar el comando.
7. Exportar A4 con una y dos vistas: orientación horizontal, nombres y medidas legibles, sin cambios en la maquetación respecto de 0.8.24.

Registrar versión de SketchUp, escala de pantalla y resultado. `RESULTADOS.json` separa las comprobaciones automatizadas de esta revisión nativa pendiente.
