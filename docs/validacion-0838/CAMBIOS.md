# Candidata 0.8.38 — nombres en el campo «Definición» de los componentes

Base: 0.8.37 (`d7fc685`, sin mergear todavía). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API. **Escribe en el modelo:** probar sobre copias.

## Qué había

Al guardar con «Sincronizar nombres de grupos y piezas en SketchUp», la extensión escribía solo el nombre de la **instancia** (campo «Instancia» de Info. de entidad). La definición del componente quedaba con su nombre de siempre, y OpenCutList, que lista las piezas por definición, no veía los nombres del taller.

## Cambio

Además del nombre de la instancia, un **componente** lleva el nombre en su **definición**: el campo «Definición» de Info. de entidad, por ejemplo «HS M2 Reg tapa B». Se escribe en la misma operación de guardado, que se deshace con un Ctrl+Z.

Solo se escribe cuando es seguro:

- **Definición compartida:** si todas las copias del componente en el modelo llevan el mismo nombre (por ejemplo, dos laterales iguales), la definición se nombra una vez. Si las copias tienen nombres distintos («Reg tapa A» y «Reg tapa B» de un mismo componente), la definición no cambia y la fila avisa: se nombró la pieza, no la definición.
- **Nombre repetido:** SketchUp no permite dos definiciones con el mismo nombre. Si otra definición ya se llama así, o dos definiciones distintas tomarían el mismo nombre, esas definiciones no cambian y la fila lo avisa.
- **Grupos:** no tienen campo «Definición»; se nombra el grupo como antes.

## Pruebas nuevas y ajustadas

- `sketchup_offline/test/definition_names_test.rb` (5): componente con su definición nombrada, grupo sin tocar, copias con el mismo nombre, copias con nombres distintos, nombre que ya tiene otra definición, dos definiciones con el mismo nombre, definición ya nombrada y Deshacer.
- El doble de nombres (`names_double.rb`) restaura también los nombres de definición al deshacer, como SketchUp.
- Ajustadas: `shared_occurrences_test.rb` (la definición del tablero compartido ahora se nombra; Deshacer la vuelve), `names_controller_test.rb`, `names_coverage_test.rb` y `grouped_pieces_test.rb` (aviso nuevo en la pieza que comparte definición con otro mueble).

## Qué se conserva

- El nombre de la instancia se sigue escribiendo como antes. Los metadatos de nombres, la guía y el resto de la 0.8.37 no cambian.
- Sin «Sincronizar nombres» no se escribe nada en el modelo.

## Límites

- **Copias con nombres distintos:** la definición queda como estaba. Para OpenCutList hay que hacer única la definición en SketchUp, o usar el mismo nombre en las copias.
- **Laterales dibujados por separado:** si dos piezas iguales no son copias del mismo componente, son definiciones distintas y no pueden tener el mismo nombre. Queda el aviso y se nombra solo la instancia.
- **Simulado:** falta confirmar en SketchUp real cómo responde al renombrar una definición.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
