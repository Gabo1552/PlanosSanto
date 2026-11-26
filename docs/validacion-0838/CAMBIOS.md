# Candidata 0.8.38 — nombres en el campo «Definición» de los componentes

Base: 0.8.37 (`d7fc685`, sin mergear todavía). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API. **Escribe en el modelo:** probar sobre copias.

## Qué había

Al guardar con «Sincronizar nombres de grupos y piezas en SketchUp», la extensión escribía solo el nombre de la **instancia** (campo «Instancia» de Info. de entidad). La definición del componente quedaba con su nombre de siempre, y OpenCutList, que lista las piezas por definición, no veía los nombres del taller.

## Cambio

El nombre de cada **componente** va en su **definición**, el campo «Definición» de Info. de entidad (por ejemplo «HS M2 Reg tapa B»), y el campo «Instancia» queda **vacío**. Se escribe en la misma operación de guardado, que se deshace con un Ctrl+Z. Las piezas nombradas antes en la instancia pasan el nombre a la definición la próxima vez que se guarda sincronizando nombres.

Solo se escribe así cuando es seguro; si no, el nombre queda en la instancia como antes, para no perderlo:

- **Definición compartida:** si todas las copias del componente en el modelo llevan el mismo nombre (por ejemplo, dos laterales iguales), la definición se nombra una vez y todas las instancias quedan vacías. Si las copias tienen nombres distintos («Reg tapa A» y «Reg tapa B» de un mismo componente), la definición no cambia, cada instancia lleva su nombre y la fila avisa.
- **Nombre repetido:** SketchUp no permite dos definiciones con el mismo nombre. Si otra definición ya se llama así, o dos definiciones distintas tomarían el mismo nombre, esas piezas quedan nombradas en la instancia y la fila lo avisa.
- **Grupos y muebles:** un grupo no tiene campo «Definición»: se nombra en su campo «Nombre», como antes. El nombre del mueble (grupo o componente padre) también sigue en la instancia.

La extensión reconoce como nombrada una pieza con la instancia vacía cuando su definición tiene el nombre que ella escribió (lo guarda en los metadatos de nombres de la pieza). Así, Sugerencias de nombres no la vuelve a proponer y conserva su nombre base.

## Pruebas nuevas y ajustadas

- `sketchup_offline/test/definition_names_test.rb` (6): componente con su definición nombrada e instancia vacía, grupo nombrado en su campo, copias con el mismo nombre, copias con nombres distintos (quedan en la instancia), nombre que ya tiene otra definición, dos definiciones con el mismo nombre, pieza nombrada antes en la instancia que pasa a la definición, guardar sin cambios no escribe, Deshacer, y la pieza reconocida como nombrada con su nombre base.
- El doble de nombres (`names_double.rb`) restaura también los nombres de definición al deshacer, como SketchUp.
- Ajustadas: `shared_occurrences_test.rb` y `names_test.rb` (el nombre va a la definición y la instancia queda vacía; Deshacer lo vuelve), `names_controller_test.rb`, `names_coverage_test.rb`, `grouped_pieces_test.rb` y `adjustments_test.rb` (aviso nuevo en la pieza que comparte definición con otro mueble).

## Qué se conserva

- Los nombres de pieza en Muebles, Piezas, CSV, A4 y paquete de obra son los mismos: la extensión lee el de la definición cuando la instancia está vacía. La guía y el resto de la 0.8.37 no cambian.
- Sin «Sincronizar nombres» no se escribe nada en el modelo.

## Límites

- **Copias con nombres distintos:** la definición queda como estaba y el nombre en la instancia. Para OpenCutList hay que hacer única la definición en SketchUp, o usar el mismo nombre en las copias.
- **Renombrar desde el pincel:** el renombrado rápido del pincel avanzado sigue escribiendo en la instancia.
- **Laterales dibujados por separado:** si dos piezas iguales no son copias del mismo componente, son definiciones distintas y no pueden tener el mismo nombre. Queda el aviso y el nombre va en la instancia.
- **Simulado:** falta confirmar en SketchUp real cómo responde al renombrar una definición.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
