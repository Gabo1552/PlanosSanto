# Planos Santo 0.6.9 — reconocimiento, cantos y pedido

Versión preparada sobre 0.6.8. **PENDIENTE VALIDACIÓN REAL EN SKETCHUP 2026 WINDOWS Y PROVEEDOR.** El instalador anterior y los nueve SKP del paquete se conservan intactos. La implementación se probó en Linux mediante geometría sintética, el controlador Ruby con dobles de API y reproducciones de diagnósticos previos; esas pruebas no abren los SKP adjuntos.

## Instalar

1. Conservar el RBZ 0.6.8 y guardar una copia del modelo. Instalar [PlanosSanto-0.6.9.rbz](../artifacts/PlanosSanto-0.6.9.rbz) desde **Extensiones → Administrador de extensiones → Instalar extensión**, sin descomprimir.
2. Cerrar **todas** las ventanas de SketchUp y volver a abrirlo. Comprobar versión **0.6.9**. No instalar el exportador web 0.3 encima del editor. No hace falta cambiar OpenCutList ni modificar su biblioteca.
3. Si la actualización falla, conservar el mensaje de la consola Ruby. Para volver atrás, reinstalar 0.6.8 y reiniciar SketchUp; las guías nuevas agregan referencia/correcciones, por lo que conviene conservar la copia anterior del SKP al volver a una versión que no conoce esos campos.

## Nombres, sin pre-nombrar los componentes

- Seleccionar la raíz de cada mueble en el árbol existente. Puede ser un grupo anidado; las cantidades corresponden a ocurrencias físicas, incluso compartidas y ocultas. No son cantidades de definiciones.
- Cargar las dos letras de obra y el módulo del grupo, si se utilizan prefijos. Generar guías y entrar a **Grupos y piezas → Proponer nombres**.
- El panel permite mirar/resaltar la pieza y editar su propuesta. La clasificación usa el marco local del grupo y sus vecinos, no los ejes globales de un mueble rotado. Vertical y frente pueden ser positivos o negativos. Para elegir el frente con el dibujo, activar **Marcar frente en el dibujo** y tocar su cara vertical exterior; una normal invertida o una cara interior deben corregirse con los selectores.
- Confirmar que el frente/vertical representan el mueble. Ese frente clasifica piezas; **no cambia automáticamente las cámaras del PDF**, que conservan los ajustes existentes.
- Revisar nombres, posición y motivo. Piso/estante/tapa, puerta/frente y conjuntos de cajón se muestran como propuestas para revisar. PT/Banq/Ranu no se expanden como certezas. Las abreviaturas observadas se conservan solo si son compatibles con la geometría. Las correcciones de una pieza no trasladan “izquierda/derecha” a otra.
- Editar o seleccionar las propuestas y usar **Confirmar y guardar nombres** una sola vez. Esta acción guarda también la guía pendiente y conserva las notas. Actualiza los nombres en SketchUp si **Sincronizar nombres** está activado; si está desactivado, los nombres se guardan para el plano. Los nombres seleccionados vacíos bloquean la confirmación.
- Si **Guardar también SKP** está activo, el guardado físico sigue la opción existente. Si se cancela el diálogo del archivo, la guía puede quedar en memoria y se avisa que falta guardar el SKP. **Ctrl+Z** revierte la operación de guía/nombres; guardar el SKP conserva también los demás cambios del modelo.
- Frente y correcciones se guardan en la guía. Las piezas revisadas no reaparecen por defecto como pendientes; usar **Incluir piezas que ya tienen nombre o revisión guardada** para modificarlas. Cancelar/Escape no aplica nada.

## Cantos y cuatro lados

1. Guardar la guía antes de preparar el pedido. En **Biblioteca y pedidos → Pedido maderera**, elegir pieza, ejes U/V y cara. La malla 2D muestra el sentido de lectura, incluidas inversiones y paridad de espejo; no toma la cámara 3D como orientación de corte.
2. Asignar placa aprobada y cantos principal/secundario del catálogo existente. Los productos no se eligen automáticamente por nombre o color.
3. Usar **Leer cantos de las caras**. El cuadro muestra planos locales, caras fuente y pintura frontal/dorso/heredada. Para proponer un lado completo exige cobertura y material coherente; lados incompletos, mixtos, tipo desconocido o forma irregular quedan sin resolver.
4. Vincular cada material de canto observado con su producto aprobado de biblioteca. Son IDs distintos, con correspondencia humana explícita. Luego **Usar propuesta de los cuatro lados** coloca los códigos 0/1/2 en la vista. Revisar y confirmar los cuatro lados; usar la propuesta no los confirma automáticamente.
5. Si las caras no resuelven un lado o la versión de OCL es otra, elegir **Inspección manual documentada** y registrar fuente/motivo. Esto requiere mirar el modelo real; no sirve inventar un motivo para ocultar una incertidumbre. Un tercer canto distinto no cabe en los dos roles del proveedor: resolver el proceso con la maderera, sin inventar equivalencias.
6. Al cambiar ejes/cara/inversiones se invalidan confirmaciones y la evidencia visual anterior. Al validar/exportar en modo observado, el sistema relee las caras y rechaza un mapa que ya no coincide. No cambia la pintura ni atributos de OpenCutList.

Compatibilidad de interpretación inicial: OpenCutList **7.1.0/build 202511301621**. Otras versiones degradan a revisión. Los IDs de material provienen del modelo; si cambian al reabrir, hay que releer y vincular de nuevo, nunca se reasignan productos por parecido de nombre.

## Pedido, migración y comprobaciones

- **Ver piezas bloqueadas** lista cada fila con su motivo, incluso una exclusión sin justificación. Las piezas no desaparecen para hacer pasar el pedido.
- Revisar material/espesor, base/altura por ejes, veta/rotación, medidas terminadas aceptadas o corte explícito y cantos. Los espejos conservan orientación propia y no se consolidan silenciosamente con instancias de otra paridad.
- Los borradores 0.6.8 se leen sin sobreescribirlos, conservando los datos anteriores pero dejando los cantos sin confirmar para revisar el nuevo criterio. Guardar el borrador conserva el estado en el modelo; guardar el SKP lo conserva en disco.
- Los TXT predeterminados tienen **9 columnas**, TAB, UTF-8 sin BOM, sin encabezado, punto decimal hasta tres decimales y CRLF: `cant base altura detalle rota canto_arr canto_aba canto_izq canto_der`.
- Cada carpeta de exportación nueva contiene un TXT por lote de material/espesor/canto principal/secundario y un `manifest.json`. En el portal se eligen esos productos **fuera del TXT**. El manifiesto registra filas físicas, orientaciones, vínculos, evidencia de caras o inspección manual y exclusiones.
- Las salidas mantienen `production_ready:false`. Ni el validador sintáctico ni abrir OpenCutList acreditan aceptación del proveedor. Los perfiles alternativos anteriores siguen siendo de prueba; no cambiar encabezados/codificación/decimales sin contraste con el portal.

## Prueba breve necesaria en Windows

Hacer primero sobre copias de **CA AmSurrbac** y otro modelo del corpus con muebles/piezas sin nombre. Después contrastar el resto de los nueve archivos; no deducir su contenido de sus nombres.

1. Instalar/reiniciar, confirmar versión y recuentos físicos. En el ensayo anterior de CA AmSurrbac había un mueble de ocho piezas; verificar que corresponde al mismo modelo/selección, sin asumir que esa cifra describe todo archivo posible.
2. Generar propuestas sin nombrar componentes antes. Elegir frente/vertical, contrastar izquierda/derecha/fondo y un conjunto anidado. Corregir dos nombres, confirmar una vez, probar Ctrl+Z, guardar/cerrar/reabrir y verificar frente, nombres y notas. Probar una instancia compartida; no debe modificar otra ocurrencia incompatible.
3. Comparar **cinco medidas** y materiales contra SketchUp. Revisar una pieza rotada 90°, una 180°, una espejada y una compartida; confirmar qué cara se mira y qué lados son arriba/abajo/izquierda/derecha.
4. Pintar/preparar en una copia de prueba, mediante las herramientas habituales de SketchUp/OCL, un canto principal arriba y otro secundario a la izquierda; dejar abajo/derecha sin canto. Leer, vincular y comprobar la propuesta y la malla 2D. Cambiar cara: comprobar el intercambio de izquierda/derecha. Revisar también canto parcial, varias caras en un lado y pieza irregular: no deben aprobarse como una certeza automática.
5. Generar un lote pequeño con material/espesor/cantos reales, elegir los productos del manifiesto en la maderera e **importar solo como prueba**, sin enviar una orden comercial. Verificar la interpretación de los nueve campos, lados, rotación, cantidades y decimales. Registrar aceptación o rechazo y captura del resultado.
6. Crear/editar/mover/reenlazar nota, guardar/reabrir y exportar PDF después de guardar: una A3 horizontal por mueble, dos vistas, nombres/cantidades, cotas y flechas legibles. Verificar biblioteca entre modelos y coexistencia de OpenCutList.

Registrar versión de SketchUp/OCL, fecha, modelo, ruta/ID de pieza, esperado/obtenido y capturas/informe. Completar **por una persona**, solo con evidencia real, `planos-santo-loop-068/manual/validacion_usuario.json` según su ejemplo y `VALIDACION_SKETCHUP.md`. Codex no lo completó ni lo aprobó.
