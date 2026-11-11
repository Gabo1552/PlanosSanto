# Candidata 0.8.33 — pintura solo con los materiales elegidos y giro del dibujo al marcar el frente

Base: 0.8.32 (`449d243`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Lo que encontró el taller en 0.8.32

1. **Materiales.** Al marcar materiales para el SKP en Materiales, la herramienta de pintura seguía mostrando todos los del taller. Había dos motivos:
   - **Pintura en vista** (la barra, sin ventanas) solo ponía primero los del proyecto, pero listaba toda la biblioteca.
   - Lo ya cargado en el modelo se sumaba siempre al proyecto. Si el modelo tenía muchos materiales de la biblioteca cargados, aparecían todos.
2. **Frente.** En «Confirmá el frente» no se podía girar el mueble para marcar un frente que quedaba atrás.

## Cambios

1. **La lista elegida manda sola.**
   - **Pintura en vista:** si el SKP tiene materiales elegidos, la tira muestra solo esos y saca los recientes que no están. Si no eligió ninguno, o ninguno de ese modo (placa o canto), sigue mostrando la biblioteca, porque la tira es el único selector.
   - **Paleta y Materiales:** el proyecto es la lista elegida. Lo ya cargado en el modelo cuenta como del proyecto **solo mientras no se eligió nada**, como respaldo para SKP viejos.
   - **Quitar del proyecto:** ahora se puede quitar un material aunque esté cargado en el modelo. Si se quita uno del respaldo, el resto queda guardado como lista elegida.
2. **Girar el dibujo al confirmar el frente.** En Sugerencias de nombres hay tres botones nuevos:
   - «Girar 90°»;
   - «Rotar con el mouse», que se arrastra sobre el dibujo y apaga «Marcar frente»;
   - «Vista inicial».

   El giro cambia solo el dibujo del diálogo: no toca la cámara de los planos ni el frente. Después de girar se marca el frente como siempre.

## Pruebas nuevas

- `pintura_en_vista_controller_test.rb`: muestra solo la elegida aunque haya otra cargada en el modelo; sin cantos elegidos sigue la biblioteca; ignora ids que ya no están en la biblioteca.
- `pincel_avanzado_tool_test.rb`: con lista elegida, un reciente que no está en ella sale de la tira.
- `project-materials-model.test.ts`: la lista elegida manda sola, el respaldo funciona, y con toda la biblioteca cargada la paleta muestra solo lo elegido.
- `tests/offline/nombres-frente.spec.ts`:
  - girar 90° cambia el dibujo y no el frente;
  - arrastrar gira y apaga «Marcar frente»;
  - «Vista inicial» devuelve el dibujo exacto;
  - sin fallas de accesibilidad.

## Límites

- **Sin selector fuera del proyecto en la tira:** con lista elegida, la tira no ofrece los demás materiales. Para usar otro, se suma en Materiales o se elige en «Otros de la biblioteca» de la paleta.
- **Simulado:** todo se probó con dobles. Falta validar en SketchUp el dibujo de la tira y el giro con modelos reales.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
