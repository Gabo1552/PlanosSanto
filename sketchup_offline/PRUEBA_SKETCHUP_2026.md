# Prueba actual — 0.6.9

Seguir [reconocimiento, cantos y pedido](../docs/loop-reconocimiento-069.md) y [validación del paquete](../planos-santo-loop-068/VALIDACION_SKETCHUP.md). Instalar 0.6.9 sin descomprimir y reiniciar todas las ventanas. No se ejecutó esta versión dentro de SketchUp en la nube. La documentación anterior se conserva como historial.

# Validación conjunta actual — Planos Santo 0.6.8

Seguir [docs/loop-ocl-068.md](../docs/loop-ocl-068.md) para instalación y prueba final en SketchUp 2026 Windows/proveedor. El usuario pidió hacerla al final de los ciclos de implementación. La guía 0.6.7 siguiente queda como historial.

# Instalar y probar Planos Santo 0.6.7 en SketchUp 2026 Windows

El usuario confirmó que la extensión ya funciona y que Guardar guía guarda el SKP. **Se recibieron diagnósticos completos de SketchUp 26.2.243 y OpenCutList 7.1.0. Los cambios nuevos de la 0.6.6 y el lector OCL 0.6.7 siguen pendientes de ejecución en Windows.** Las pruebas Linux usan un doble de API.

## Instalación

1. Descargá `PlanosSanto-0.6.7.rbz`. No lo descomprimas ni instales el ZIP de desarrollo.
2. En SketchUp 2026 abrí **Administrador de extensiones → Instalar extensión** y elegí ese RBZ.
3. Verificá que Planos Santo 0.6.7 figure habilitada en el Administrador. Cerrá todas las ventanas de SketchUp y volvé a abrirlo después de instalar o actualizar. Se usa el mismo nombre de extensión; no instales dos copias con nombres diferentes. La web y el instalador 0.3 permanecen disponibles para volver atrás.
4. Abrí **Extensiones → Planos Santo → Planos Santo**. También hay un botón en la barra Planos Santo.

El RBZ no está firmado por Trimble. Si una política administrada de SketchUp impide cargarlo, registrá el mensaje para que se resuelva la distribución; no hace falta cambiar la política del equipo para informar el problema.

## Si no figura en el Administrador

El RBZ 0.5.2 enviado por el usuario se verificó íntegro, idéntico al generado y con CRC/manifiesto correctos. El registro también funciona con el doble de API. **La causa del fallo en Windows no se reprodujo y sigue pendiente.** La 0.5.3 agrega carpetas explícitas y atributos DOS al ZIP, un arranque con avisos ante archivos faltantes/errores y conserva un menú de error cuando alcanza a ejecutar ese arranque. Eso no detecta un bloqueo previo a ejecutar Ruby.

1. Instalá `PlanosSanto-0.5.3.rbz` usando el Administrador, sin descomprimir. Cerrá todas las ventanas de SketchUp y abrilo de nuevo.
2. Verificá primero el Administrador: nombre Planos Santo, versión 0.5.3 y estado habilitado. Después buscá el menú Extensiones. Anotá cualquier aviso nuevo.
3. Si sigue sin figurar, abrí **Ventana → Consola Ruby** y pegá esta consulta de solo lectura:

```ruby
p({sketchup: Sketchup.version, ruby: RUBY_VERSION, archivo_presente: !!Sketchup.find_support_file('planos_santo.rb', 'Plugins'), registrada: Sketchup.extensions.any? { |e| e.name == 'Planos Santo' }})
```

Copiá la salida. No abre ni modifica el modelo, no instala archivos ni cambia políticas de seguridad. Permite distinguir archivos no encontrados de un registro ausente. Si SketchUp informa bloqueo de firma/carga, copiá también ese motivo. El RBZ sigue sin firma de Trimble.

La descarga principal ya no ofrece 0.3 por error. El exportador ZIP para la web sigue identificado en `/instalar/web`; ambos usan el mismo loader y no se deben alternar sin reiniciar.

## Prueba con tu modelo

Usá una copia de `CA AmSurrbac (1).skp`. El despiece no transforma objetos; **Guardar guía** sí guarda los atributos de la guía y los cambios que ya tenga el modelo abierto.

1. Abrí el modelo y luego Planos Santo. En **Todos**, revisá los grupos propuestos; expandí la jerarquía para seleccionar los padres que son muebles. No deduzcas la cantidad de muebles de los nombres de escenas.
2. Probá también **Seleccionados**, eligiendo grupos en SketchUp; si estás editando dentro de un grupo, se debe conservar su ruta completa.
3. Seleccioná el grupo del caso anterior de ocho piezas y pulsá **Generar guías**. Compará piezas e identificadores. Esa cantidad solo corresponde a la exportación previa de ese mueble.
4. Contrastá al menos cinco medidas con SketchUp, incluyendo una pieza rotada y otro espesor si existen. Las medidas están en milímetros y no se pueden editar en la guía. Deben verse largo y ancho solo en una pieza por tamaño dentro de cada mueble. El mismo tamaño exige largo, ancho y espesor iguales. En el caso recibido son diez cotas en P01, P02, P04, P05 y P06; P03 comparte con P02, y P07/P08 con P05. Las ocho piezas y filas deben conservarse. El espesor se conserva en la tabla, sin cota sobre el dibujo. Cambiá zoom/despiece: los valores deben seguir iguales. Una dirección que apunta a la cámara se identifica con una llamada de profundidad.
5. Cambiá el nombre de uso de una pieza. Agregá una nota, hacé clic en su pieza de destino y editá el texto. Mové la tarjeta; cambiá zoom/despiece y verificá que la flecha siga en la misma pieza. Probá reanclar y eliminar otra nota.
6. Elegí **Guardar guía**. Si cancelás Guardar como, la guía queda en el modelo abierto pero falta guardar el archivo. El mensaje de la ventana lo indica.
7. Cerrá SketchUp, reabrí ese archivo y generá las guías otra vez. Deben volver los nombres, notas, códigos y ajustes. Esta es la prueba de persistencia física que no se pudo ejecutar en Linux.
8. Alterná **Delantera / Trasera**. Confirmá que la delantera corresponde al frente real del mueble; usa la misma orientación que la versión anterior. La trasera debe mostrar las caras opuestas mediante un giro de cámara de 180°, sin cambiar piezas ni códigos. Probá seleccionar una cara desde atrás y anclar una nota.
9. Elegí **Exportar PDF A3** y guardá el PDF. Comprobá una hoja de 420 × 297 mm por mueble, todas las filas y etiquetas, dos axonometrías (delantera y trasera) con los mismos códigos, un par de cotas por tamaño solo en la delantera, y referencias numeradas de notas con flechas en ambas. El texto de cada nota se imprime una vez al pie. Imprimí una hoja a tamaño real para comprobar lectura.
10. Repetí con varios muebles y con internet desconectado. La extensión no necesita la web, Node, Ruby instalado aparte ni LayOut para generar su PDF.

La leyenda de notas/advertencias admite cuatro líneas a 9 pt en el motor offline. Si no cabe, se informa para acortar el texto.

Si no caben todas las cotas legibles, no cabe el listado o hay notas fuera de la vista, la exportación se bloquea con una explicación. No se recortan filas ni se agregan hojas para forzar el resultado. Las notas cuyo destino se borró deben reanclarse o eliminarse antes de exportar.

## Si aparece un problema

Anotá la versión de SketchUp, la acción que falló y el texto completo del error. En la ventana, **Comprobar instalación → Ver diagnóstico** muestra las versiones y si responde el puente. Si no abre la ventana, copiá el error del Administrador de extensiones o de la consola Ruby.

Devolvé el resultado junto con las cinco medidas comparadas, cantidad de muebles/piezas esperadas y observadas, y el resultado de guardar/reabrir/PDF. El diagnóstico no envía modelos ni archivos automáticamente.

## Volver a la versión anterior

Instalá `PlanosSanto-0.3.0.rbz` y reiniciá SketchUp. La web sigue admitiendo las exportaciones anteriores. Conservá una copia del `.skp` con sus guías antes de actualizar o volver atrás.

## Ayudas y diseño 0.5.0

Los botones «?» explican la selección de muebles, despiece, zoom, medidas protegidas, cotas, notas, cambio de destino, guardado e impresión. Abrilos con clic o Enter; cerralos con Escape, la cruz o un clic afuera. No guardan ni cambian datos.

Comprobá que las ayudas queden dentro de la ventana y que no dificulten el trabajo. Si cambiás los muebles elegidos después de generar, la aplicación pide regenerar antes de habilitar el PDF. Una guía nueva indica «Guía sin guardar»; si falta escribir el SKP, lo informa por separado.

El PDF lleva la identidad de Santo Carpintero, secciones y tabla de piezas. Conserva todas las notas, medidas y la única A3 por mueble. El Word aportado solo se usa como referencia visual; sus observaciones o medidas de otro trabajo no se aplican a tu modelo.

## Orientación y notas en las dos vistas

La etiqueta Delantera toma como referencia la cámara de las versiones previas; no infiere el frente de cada grupo a partir de su nombre ni de escenas. Confirmá esa orientación en el modelo de trabajo. La axonometría trasera observa la geometría desde el lado opuesto, manteniendo el eje vertical.

Cambiar la cámara es una consulta y no marca la guía como modificada. Las notas editadas desde cualquiera de las cámaras mantienen la misma pieza y ancla local guardada. En el PDF sus referencias 1, 2, etc. aparecen en ambos dibujos y remiten al texto del pie. Si una cara queda oculta, contrastá ambas vistas y la tabla antes de fabricar.

## Agregado de nombres 0.5.1

El panel **Nombres de grupos y piezas** se prueba por separado siguiendo [INSTALACION_RBZ.md](../planos-santo-loop-nombres/INSTALACION_RBZ.md). Renombra instancias y filas de nombres de guías, con una operación deshacible y sin alterar códigos/notas/anclas. No cambió el diseño PDF ni las cámaras de la 0.5.0. Los padres/interiores compartidos se bloquean. La validación humana específica permanece PENDIENTE en `planos-santo-loop-nombres/VALIDACION_SKETCHUP.md`.

## Cotas visibles u ocultas — prueba 0.5.3

1. Generá la guía. Hacé clic en una medida del dibujo para ocultar esa cota. También podés usar Enter o Espacio al enfocarla con el teclado. Los códigos y todas las medidas de la tabla deben seguir iguales.
2. Abrí **Mostrar u ocultar cotas** y comprobá que esa opción está desmarcada. El listado indica con qué otras piezas comparte tamaño. Marcala para restaurar o elegí **Mostrar todas las cotas**.
3. Ocultá una cota, elegí **Guardar guía**, guardá físicamente el SKP y cerrá/reabrí SketchUp. Al generar otra vez debe conservarse la selección. Repetí cambiando la cámara y el nombre del mueble: las medidas originales no cambian.
4. Exportá la A3: el largo/ancho oculto no debe dibujarse; su valor debe seguir en la tabla. El pie de la vista delantera indica el número de cotas ocultas. La trasera conserva sus códigos. Restaurá y exportá de nuevo para comprobar que vuelve la cota.

Las pruebas Linux verificaron JSON/atributos y reapertura del diálogo con dobles de SketchUp. La persistencia física en Windows sigue pendiente. La 0.5.3 abre guías anteriores; para volver a una versión antigua, conservá una copia previa del SKP porque esas versiones no conocen el nuevo campo opcional.


## Ajustes 0.6.0 — comprobar en una copia del modelo

1. Instalá el nuevo RBZ y reiniciá todas las ventanas de SketchUp. El listado arranca con el contenido compactado. **Mostrar en el listado** filtra Todos / Seleccionados para generar / No seleccionados para generar; no cambia las casillas. **Usar selección de SketchUp** vuelve a analizar y toma la selección del modelo.
2. Poné `M01 Estantería izq. Util.` al grupo padre en SketchUp. En la extensión completá **Abreviatura de la obra** con `VF` y generá las guías. El campo Módulo debe mostrar `M01`. También podés completar ese campo cuando el grupo todavía no tiene número; no renombra al grupo padre.
3. En la tabla escribí solamente `Lateral`. Debajo aparece **VF M01 Lateral**. Al guardar con **Sincronizar nombres de piezas en SketchUp** activado se escribe ese nombre en la instancia. No cambia el nombre de la definición, las medidas ni la geometría. Revisá otra pieza y otro mueble con M02.
4. Si renombrás el grupo a M03 por fuera de la extensión, usá **Volver a analizar → Generar guías → Guardar guía**: debe pasar a VF M03 Lateral, sin acumular VF M01. Cambiar el grupo no dispara escrituras mediante un observador. La propuesta es automática y se aplica al guardar. Nombres genéricos como Estantería izq. Util. no permiten inferir un número M01: completalo en el grupo o en su campo.
5. **Guardar guía + SKP** conserva tanto la guía como los demás cambios del modelo abierto. En **Opciones de guardado** podés desmarcar **Guardar también el archivo SKP**; entonces solo se actualiza el modelo abierto, y queda pendiente Ctrl+S. Si cancelás Guardar como, también queda pendiente guardar el SKP. Probá ambas variantes.
6. Un contenedor compartido o una pieza bloqueada impide el renombrado: debe informar el motivo antes de guardar cualquier nombre. No hace make_unique. Si necesitás conservar solo los nombres del plano, desmarcá **Sincronizar nombres**; los nombres de instancias se conservan.
7. Abrí **Rotar vista, mover cotas y mostrar IDs**. Alterná Delantera/Trasera; cada una mantiene su propia cámara. Usá los controles de giro/inclinación o **Rotar con el mouse** y arrastrá sobre el dibujo. Guardá y reabrí para verificar ambas rotaciones. Restablecer rotación afecta solo esa vista.
8. Desmarcá **Mostrar IDs en el dibujo**: desaparecen las etiquetas P01… de ambas vistas del mueble. La tabla mantiene sus códigos para identificar las filas. Guardá/reabrí y comprobá el PDF.
9. Elegí **Mover cotas** en Delantera. Se muestra el encuadre de impresión de la A3. Arrastrá una medida o enfocala y usá las flechas del teclado. La medida no cambia; las líneas siguen conectadas a la pieza. Restablecer cotas recupera la posición automática de esa vista. La trasera sigue sin repetir las cotas.
10. Exportá e imprimí el PDF: una A3 horizontal por mueble, dos vistas con sus rotaciones, IDs según elección, cotas desplazadas y tabla completa. Una cota fuera de la vista o superpuesta debe bloquear la exportación con una explicación.
11. Confirmá una operación deshacible para guía y nombres en el modelo abierto. Ctrl+Z no reescribe el SKP ya guardado: para conservar el resultado de Deshacer en disco, guardá nuevamente. Probá guardar físicamente, cerrar SketchUp y reabrir: nombres, bases, obra, módulos, cámaras, cotas y notas deben recuperarse.

En la 0.6.1 la configuración de **Grupos y piezas** está integrada junto al dibujo. Se eliminó el botón que abría el panel aparte. Los campos existentes de obra y módulo componen el nombre de la tabla.

La 0.6.0 lee las guías anteriores. Sus campos nuevos de presentación/nombres no son reconocidos por lectores antiguos estrictos: conservá una copia del SKP previa a guardar con la nueva versión si necesitás volver atrás.

Prueba nativa de estos pasos: **PENDIENTE**. No se completan casillas de aceptación del operador desde Linux.


## 0.6.1 — Configuración junto al dibujo y cierre después de guardar

1. Después de instalar, **cerrá todas las ventanas de SketchUp y volvé a abrirlo**. Cerrar solamente el complemento no descarga Ruby de la memoria. Si todavía tenés indicaciones nuevas sin guardar en una ventana anterior, copiá ese texto antes de reiniciar.
2. Generá las guías y elegí un mueble. Donde estaba Revisá las piezas ahora aparece **Grupos y piezas**, junto a la axonometría. No hay una ventana de configuración aparte. Los campos de **Abreviatura de la obra** y **Módulo** siguen en sus ubicaciones anteriores y alimentan los nombres completos.
3. Tocá una pieza o su etiqueta: se resalta en el dibujo y se enfoca su nombre en la tabla. El listado se desplaza para mostrar su fila. Elegir una fila también resalta la pieza. Probá en una ventana de 1000 px de ancho: dibujo y campo deben seguir visibles.
4. En **Nombre del grupo**, escribí M01 Estantería izq. Util. El módulo debe tomar M01. Completá VF como obra y Lateral como base de pieza: la vista previa debe mostrar VF M01 Lateral. No se escriben nombres en el modelo mientras tipeás.
5. Con **Sincronizar nombres de grupos y piezas en SketchUp** activado, guardar aplica grupo y piezas en la misma operación de guía. No cambia definiciones ni geometría. Probar Ctrl+Z, falla de una pieza bloqueada y reapertura física. El nombre del grupo se vuelve a leer del modelo; la guía no reimpone un nombre anterior sobre cambios externos. Desactivar sincronización permite alias de piezas en la guía; para cambiar el grupo hay que activarla.
6. **Guardar guía** deja la ventana abierta para continuar trabajando. **Guardar y cerrar** solicita cerrarla después del guardado. Si falla o cancelás el guardado del archivo SKP, la ventana permanece abierta. Si desactivaste Guardar también el archivo SKP, puede cerrar después de guardar solo en el modelo abierto: seguirá pendiente Ctrl+S en SketchUp.
7. Si aparece **Actualización pendiente**, la ventana está usando una versión diferente del código Ruby que SketchUp tiene cargado. Se muestran ambas versiones y se bloquea la edición antes de analizar/generar. Reiniciá todas las ventanas de SketchUp. El diagnóstico y la consulta son locales; no se envían modelos.

Se reprodujo exactamente el error La edición contiene campos no permitidos al cargar Ruby 0.5.3 y reemplazar el RBZ por 0.6.0 sin reiniciar; no hubo operaciones ni atributos escritos. El usuario confirmó que había actualizado con SketchUp abierto. La 0.6.1 detecta esta mezcla. Si un dato realmente tiene campos desconocidos o faltantes, el mensaje nuevo indica el campo y su contexto, manteniendo la validación estricta.

Pruebas Linux: archivos RBZ reales con reemplazo en caliente y dobles de la API, y bundle empaquetado en navegador sin red. **Pendiente en SketchUp 2026 Windows:** selección/edición integrada, guardado físico, Ctrl+Z y cierre real del HtmlDialog. Los tests automatizados no equivalen a esa aceptación.


Los nombres importados que ya siguen el formato de taller (por ejemplo VF M9 Piso) se separan para usar Piso como base al completar los campos de obra y módulo. No se agrega dos veces el prefijo. Se conserva una base explícita reconocida por los metadatos propios y no se recortan prefijos arbitrarios como AS - Lateral. Comprobar este caso también si se copia un mueble desde otro SKP.


## 0.6.2 — Exportar después de guardar sin regenerar

1. Conservá cualquier texto de indicaciones que todavía no hayas guardado. Instalá PlanosSanto-0.6.2.rbz desde el Administrador de extensiones, cerrá todas las ventanas de SketchUp y volvé a abrir tu modelo. Generá sus guías.
2. Cambiá un nombre desde Grupos y piezas y agregá una nota. Usá Guardar guía con Guardar también el archivo SKP activado. Sin cerrar la ventana ni volver a analizar/generar, exportá PDF A3. Debe conservar nombres, cotas, notas y ambas vistas.
3. Editá otro nombre, volvé a guardar y exportá otra vez sin regenerar. Revisá que el segundo PDF tenga los cambios. Repetí guardando solamente en el modelo abierto y luego usando Ctrl+S.
4. Modificá realmente una pieza en SketchUp después de generar (por ejemplo movela). La exportación debe bloquearse para evitar un plano viejo. En ese caso sí corresponde volver a analizar/generar con las medidas nuevas; copiá primero cualquier indicación no guardada.
5. Probá Guardar y cerrar, y reabrí el SKP para verificar persistencia. Verificá las cinco medidas contra SketchUp e imprimí una A3 para confirmar legibilidad.

Causa reproducida con dobles: el GUID de una definición representa una revisión y puede cambiar al cerrar una operación o guardar el modelo. La 0.6.1 incluía ese valor en la huella que comparaba al exportar. La 0.6.2 conserva ese GUID en la exportación, pero lo excluye de la comparación de vigencia. Sigue comparando IDs de instancias, nombres, jerarquía, transformaciones, mallas, medidas y materiales, además de la revisión de la guía. No se deshabilita la comprobación de cambios reales.

Prueba automatizada: guardar/exportar, editar/guardar/exportar de nuevo sin recargar ni regenerar, revisión de PDF y bloqueo tras mover una pieza. La API de guardado y sus cambios de GUID se simulan; **no se abrió ni se escribió un SKP real en Linux**. Verificar esta secuencia dentro de SketchUp 2026 Windows sigue **PENDIENTE**.


## 0.6.3 — Piezas y visor del despiece

1. Instalá PlanosSanto-0.6.3.rbz y reiniciá todas las ventanas de SketchUp, conservando primero cualquier texto sin guardar. Abrí una copia del SKP y generá las guías.
2. El dibujo y **Grupos y piezas** quedan juntos. Tocá una tabla o su ID: se resalta y se enfoca su nombre en el listado. Los botones de ID del listado también permiten encontrarla. Probá seleccionar desde Delantera y Trasera, con y sin IDs visibles.
3. Cada fila muestra el nombre editable y **Largo, Ancho y Espesor en mm**, junto con la cantidad. Las medidas no se editan. El módulo está junto al nombre del grupo; la abreviatura de obra sigue en Elegí los muebles. Completá VF y M01 y escribí Lateral: debe mostrarse VF M01 Lateral.
4. **Buscar piezas** encuentra ID o nombre sin distinguir mayúsculas/acentos. **Seleccionada** muestra solo la pieza elegida. Las flechas anterior/siguiente recorren todas las piezas. Seleccionar desde el dibujo despeja la búsqueda para mostrar esa pieza. Si no hay resultados, Mostrar todas las piezas recupera el listado.
5. **Resaltar pieza** atenúa las demás tablas para reconocerla conservando el contexto. **Ocultar muebles** da más espacio al visor y **Mostrar muebles** recupera las casillas. Buscar, filtrar y resaltar no cambian el modelo ni excluyen piezas del PDF. Comprobá exportar con el listado filtrado: deben aparecer todas.
6. **Seleccionar, Rotar y Mover cotas** están siempre junto al dibujo. Con Rotar, arrastrá también sobre una etiqueta: debe girar sin editar nombres. Con Mover cotas se ve el encuadre de impresión; usá las flechas del teclado o arrastrá una medida. Los ajustes detallados de ángulos/IDs y las cotas ocultas están debajo del visor.
7. Despiece y Zoom quedan al pie del dibujo con sus valores visibles. El visor aprovecha el espacio alrededor del mueble. Al agregar notas reserva espacio para las tarjetas y mantiene el encuadre estable mientras se arrastran. Las indicaciones se editan debajo del listado; el dibujo acompaña el desplazamiento de la página.
8. Probá una ventana de 1000 × 760 y otra más grande: el nombre enfocado y el dibujo deben verse al mismo tiempo; ninguna medida debe requerir desplazamiento horizontal. Abrí los botones ? con clic/Enter y cerralos con Escape.
9. Guardá, exportá sin regenerar, volvé a editar y guardá/exportá otra vez. Verificá nombres, todas las piezas, notas/anclas, cámaras y medidas en la A3. Cerrá/reabrí físicamente el SKP y probá Ctrl+Z.

Validación nativa de esta interfaz y estos pasos en SketchUp 2026 Windows: **PENDIENTE**. Las capturas del modelo recibido se reproducen desde su JSON; los guardados automatizados usan dobles de la API y no escriben un SKP real.


## 0.6.4 — Un nombre e ID para componentes iguales

1. Instalá PlanosSanto-0.6.4.rbz y reiniciá todas las ventanas de SketchUp, conservando cualquier texto no guardado. Abrí una copia del modelo y generá las guías.
2. En **Grupos y piezas**, activá **Agrupar componentes iguales** para el mueble actual. Es opcional y empieza desactivado en guías anteriores. Solo reúne instancias de la misma definición, medidas y material. También verifica geometría y escala local; los espejados de distinto sentido permanecen separados. No agrupa entre muebles.
3. Las piezas compatibles aparecen en una fila con cantidad ×2, ×3, etc. Se toma el nombre de la primera pieza del grupo. Completá obra VF/módulo M01 y escribí PT una sola vez: las dos piezas deben llamarse VF M01 PT al guardar con sincronización activada. Sin obra también podés escribir el nombre completo, por ejemplo M01 PT.
4. En el dibujo cada instancia conserva su geometría pero comparte ID: dos P01 significan piezas iguales que aparecen como P01, nombre, cantidad 2 en la tabla. El resaltado alcanza todas las del grupo. Al tocar cualquiera se enfoca el mismo campo; anterior/siguiente recorre tipos de pieza.
5. Agregá una nota a la segunda instancia del grupo. La flecha debe seguir anclada solamente a esa instancia física, en ambas vistas y después de guardar/reabrir. La agrupación de nombres no fusiona geometrías ni transfiere notas.
6. Guardá y exportá sin regenerar. El PDF debe conservar una A3 por mueble, todas las piezas dibujadas, IDs compartidos, una fila por tipo y cantidades cuya suma sea el número de piezas físicas. El pie explica el ID compartido. Si ocultás IDs, desaparecen del dibujo y se conservan los del listado. Las cotas mantienen las reglas previas.
7. Cerrá/reabrí físicamente el SKP y generá: debe conservar la casilla, nombres comunes, cantidades, cámaras/cotas y notas. Desactivá la opción para recuperar filas e IDs individuales; los nombres actuales se conservan. Guardá y repetí la reapertura. Probá Ctrl+Z para revertir toda la operación de nombres/guía.
8. Componentes de otra definición, material, medida, escala o espejado distinto deben quedar separados. Un padre compartido/bloqueado debe seguir impidiendo el renombrado con una explicación y sin aplicar solo una parte. Las definiciones no se renombrarán ni se hará make_unique.

Las instancias y sus códigos físicos internos siguen siendo únicos. La agrupación calcula un ID de fabricación compartido desde la primera instancia; al modificar realmente el modelo se vuelve a analizar y recalcula qué piezas siguen siendo iguales. No se acepta editar cantidades, medidas ni códigos físicos desde el cliente. En la web, la opción está junto al listado y se guarda automáticamente como los nombres.

Sobre la exportación recibida: ocho piezas quedan en cinco filas; P02 tiene cantidad 2 (laterales) y P05 cantidad 3 (listones). Se conserva la nota de prueba en el segundo lateral. Evidencia en artifacts/agrupacion-064-modelo-real.json y CA-AmSurrbac-AGRUPADO-064-PRUEBA-A3.pdf. Son reproducciones del JSON; **no ejecutan SketchUp ni guardan físicamente el SKP**.

Prueba de 0.6.4 en SketchUp 2026 Windows, guardado/reapertura física, Ctrl+Z e impresión A3: **PENDIENTE**. Los lectores antiguos estrictos no conocen la nueva opción; conservá una copia previa al actualizar si necesitás retroceder de versión.

## 0.6.5 — Diagnóstico de integración OpenCutList (P0/P1)

La nueva entrada **Extensiones → Planos Santo → Diagnóstico de integración (solo lectura)…** guarda un JSON local nuevo, sin renombrar ni guardar el SKP y sin transmitirlo. Instalar 0.6.5, cerrar todas las ventanas de SketchUp y reiniciar. La guía/editor conserva sus funciones; esta versión no incorpora aún catálogo de materiales/cantos ni pedidos maderera.

Seguir [prueba P1 en SketchUp 2026](../docs/prueba-p1-sketchup-2026.md), con una copia del modelo real, cinco contrastes de medidas/orientación y comprobación de coexistencia OpenCutList. Diagnóstico completo no significa medidas/cantos aprobados. Esta prueba Windows sigue PENDIENTE; no se marcaron aceptaciones manuales.

## 0.6.6 — Ocurrencias compartidas y despiece de muebles largos

1. Instalar **PlanosSanto-0.6.6.rbz**, preservar cualquier trabajo abierto y cerrar todas las ventanas de SketchUp antes de reiniciar. La versión debe figurar habilitada en el Administrador.
2. En una copia del modelo con las seis apariciones de la pieza reportada, generar la guía del mueble padre completo. Usar el mismo nombre para esas seis apariciones (se puede activar «Agrupar componentes iguales» para editar las compatibles en una fila). Mantener «Sincronizar nombres de grupos y piezas en SketchUp» y guardar.
3. Verificar que las seis apariciones muestran ese nombre, no cambia la definición ni posición/geometría, la guía se guarda y exportar después de guardar no solicita regenerar por un falso cambio. Ctrl+Z debe deshacer todo en una operación; volver a guardar y reabrir para contrastar persistencia real.
4. Intentar nombres distintos para la misma entidad compartida sin agrupar: debe explicar el conflicto sin escribir cambios parciales. Si se requieren alias distintos solo para las guías, desactivar sincronización en Opciones de guardado. Si hay otra aparición fuera de la selección, debe conservar la protección y pedir incluir todas; no se hace make_unique automáticamente.
5. Mover Despiece desde cero (ensamblado exacto) hasta 100 % en muebles altos, largos y anchos. Revisar laterales, base, tapa, estantes/divisores y fondo en ambas vistas y rotando la cámara. No deben expandirse verticalmente por el solo hecho de tener un mueble más largo. Las medidas permanecen iguales.
6. Activar «Resaltar pieza» y elegir otra pieza desde la tabla o dibujo: quedan sus rótulos/cotas y el resto atenuado; si hay componentes iguales se resaltan todos. Desactivarlo restaura los rótulos generales. Esto solo afecta la pantalla y no quita piezas ni cotas del PDF.

**Limitación conocida en los diagnósticos recibidos:** los muebles de 23 y 164 piezas todavía presentan cotas sin espacio legible; el de 164 también satura IDs. Agrupar reduce la tabla a 13/24 tipos, pero conserva cada aparición física y sus IDs. La exportación de esos planos completos sigue bloqueada por legibilidad. No se declara resuelta ni se sustituye por un PDF con información oculta. El caso anterior de ocho piezas conserva PDF A3 correcto con ambas vistas. Se necesita otro ciclo de distribución para los planos densos; se registró en backlog.

## 0.6.7 — Revisión de materiales y cantos OpenCutList (P1)

Instalar 0.6.7 y cerrar todas las ventanas de SketchUp antes de reiniciar, conservando copia del SKP y RBZ 0.6.6 para volver atrás. Esta actualización usa el mismo loader Planos Santo; no instalar dos copias renombradas. OpenCutList original no se reemplaza.

Después de analizar el modelo, abrir **Materiales y cantos**. Revisar tipos declarados por OCL, materiales aplicados/sin aplicar y una pieza con sus caras frente/dorso e información heredada. La pantalla es solo lectura; todavía no crea catálogo persistente, confirma orientación/corte ni genera pedidos. Guardar un informe local con nombre nuevo, cancelar y repetir nombre para comprobar que no sobrescribe. Comparar tres materiales/piezas con OCL original según [guía del loop P1](../docs/loop-ocl-067.md).

La versión/build de compatibilidad inicial es 7.1.0/202511301621; otros quedan explícitamente sin resolver. Los tests Linux son dobles de API y replay de diagnóstico previo: **falta validar esta lectura nueva y biblioteca completa dentro de SketchUp 2026**. Con ese informe se reanuda P2; no se marca `done` ni aprobación de proveedor. El A3 denso de 23/164 piezas sigue pendiente.
