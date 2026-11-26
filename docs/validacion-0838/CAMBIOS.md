# Candidata 0.8.38 — nombres en el campo «Definición» de los componentes

Base: 0.8.37 (`d7fc685`, sin mergear todavía). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API. **Escribe en el modelo:** probar sobre copias.

## Qué había

Al guardar con «Sincronizar nombres de grupos y piezas en SketchUp», la extensión escribía solo el nombre de la **instancia** (campo «Instancia» de Info. de entidad). La definición del componente quedaba con su nombre de siempre, y OpenCutList, que lista las piezas por definición, no veía los nombres del taller.

## Cambio

El nombre de cada pieza que es **componente** va en los **dos campos** de Info. de entidad: «Instancia», como antes, y **«Definición»** (por ejemplo «HS M2 Reg tapa B»), que es el que lista OpenCutList. Se escribe en la misma operación de guardado, que se deshace con un Ctrl+Z. Las piezas nombradas antes solo en la instancia toman también la definición la próxima vez que se guarda sincronizando nombres.

La definición se escribe solo cuando es seguro; si no, la pieza queda nombrada en la instancia, como antes, y su fila muestra una nota gris («Nombre en la instancia, no en la definición: …»). No es un error, porque la pieza sí se nombró:

- **Definición compartida:** si todas las copias del componente en el modelo llevan el mismo nombre (por ejemplo, dos laterales iguales), la definición se nombra una vez. Si las copias tienen nombres distintos («Reg tapa A» y «Reg tapa B» de un mismo componente), la definición no cambia.
- **Nombre repetido:** SketchUp no permite dos definiciones con el mismo nombre. Si otra definición ya se llama así, o dos definiciones distintas tomarían el mismo nombre, esas definiciones no cambian.
- **Grupos y muebles:** un grupo no tiene campo «Definición»: se nombra en su campo «Nombre», como antes. El nombre del mueble también sigue en la instancia.

## Pruebas nuevas y ajustadas

- `sketchup_offline/test/definition_names_test.rb` (5): componente nombrado en instancia y definición, grupo nombrado en su campo, copias con el mismo nombre, copias con nombres distintos (solo instancia, con nota), nombre que ya tiene otra definición, dos definiciones con el mismo nombre, pieza nombrada antes solo en la instancia que toma también la definición, guardar sin cambios no escribe y Deshacer.
- El doble de nombres (`names_double.rb`) restaura también los nombres de definición al deshacer, como SketchUp.
- Ajustadas: `shared_occurrences_test.rb` (la definición del tablero compartido ahora se nombra; Deshacer la vuelve), `names_controller_test.rb`, `names_coverage_test.rb`, `grouped_pieces_test.rb` y `adjustments_test.rb` (nota aparte en la pieza que comparte definición con otro mueble).

## Qué se conserva

- El nombre de la instancia se escribe como antes: Muebles, Piezas, CSV, A4, paquete de obra y Sugerencias de nombres no cambian. La guía y el resto de la 0.8.37, tampoco.
- Sin «Sincronizar nombres» no se escribe nada en el modelo.

## Límites

- **Copias con nombres distintos:** la definición queda como estaba. Para OpenCutList hay que hacer única la definición en SketchUp, o usar el mismo nombre en las copias.
- **Renombrar desde el pincel:** el renombrado rápido del pincel avanzado sigue escribiendo solo en la instancia.
- **Laterales dibujados por separado:** si dos piezas iguales no son copias del mismo componente, son definiciones distintas y no pueden tener el mismo nombre. Queda la nota y el nombre va solo en la instancia.
- **Simulado:** falta confirmar en SketchUp real cómo responde al renombrar una definición.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
