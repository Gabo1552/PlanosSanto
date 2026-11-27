# Candidata 0.8.39 — herrajes por la forma: sugerencias y elección por pieza

Base: 0.8.38 (`3807bf7`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API. Escribe un atributo en el modelo (no geometría ni nombres): probar sobre copias.

## Qué había

Los herrajes salían solo del nombre de la pieza («Puerta», «Frente cajón», «Fte», «Del Caj»). Una puerta sin ese nombre no sumaba bisagras, y una pieza mal nombrada no se podía sacar.

## Cambio

- **Sugeridos por la forma:** en la sección de herrajes de Piezas aparecen las piezas que, por su forma y posición, parecen puertas o frentes de cajón aunque su nombre no lo diga.
  - Usa la misma clasificación de Sugerencias de nombres: panel paralelo al frente, puerta si ocupa más de la mitad del alto del mueble y frente de cajón si es más bajo o está en un conjunto anidado.
  - Necesita el frente del mueble confirmado. Si falta, se avisa qué mueble confirmar.
  - Cada sugerencia muestra la pieza, sus medidas, la función que sugiere y el motivo.
- **Elegir por pieza:** cada sugerencia tiene tres botones:
  - «Sumar como puerta» o «Sumar como frente de cajón»;
  - «Es puerta» o «Es frente de cajón», para cambiar la función;
  - «No lleva herrajes», que la descarta y no la vuelve a sugerir.
- **Elegidos en Piezas:** lista lo elegido en el mueble que se ve, con «Quitar la elección» para volver a decidir por el nombre.
- **Se guarda en el modelo:** lo elegido queda por pieza física en el atributo `PlanosSantoHerrajes/roles_v1`, en una operación de Deshacer. No cambia la geometría, los nombres ni el análisis. Deshacer o Rehacer en SketchUp actualiza Piezas.
- **Lo elegido manda sobre el nombre:**
  - se suma a la lista de herrajes, el CSV, el paquete de obra (`herrajes.piezas`) y los herrajes en 3D;
  - «No lleva herrajes» también saca una pieza que se llama Puerta;
  - una «Del Caj» elegida como frente de cajón cuenta aunque el mueble tenga «Fte».

## Pruebas nuevas

- `tests/hardware-shape.test.ts` (6):
  - pieza elegida como puerta sin nombre de puerta;
  - «ninguno» saca una puerta por nombre;
  - elección por pieza física dentro de una fila, y «Del Caj» elegida;
  - herrajes en 3D y paquete de obra con lo elegido;
  - sugerencias por forma (puerta y frente de cajón);
  - sin sugerencias para lo ya nombrado o elegido;
  - mueble sin frente confirmado.
- `sketchup_offline/test/hardware_model_test.rb` (3):
  - lo elegido se guarda en una operación y solo si cambia;
  - validación antes de escribir;
  - un fallo aborta y conserva lo anterior;
  - datos dañados se ignoran.
- `sketchup_offline/test/hardware_controller_test.rb` (1): la acción `hardware_role` guarda, el estado lo devuelve y Deshacer lo avisa a la ventana.
- `tests/offline/piezas.spec.ts` (1): una pieza elegida como puerta suma herrajes, aparece en «Elegidos en Piezas» y «Quitar la elección» manda lo correcto; axe.
- Revisado además en una página de prueba (no versionada) con los muebles sintéticos y el frente confirmado: el bloque de sugerencias, «Sumar como puerta» y axe sin problemas.

## Qué se conserva

- La detección por nombre sigue igual. Sin elecciones, los herrajes son los de la 0.8.38.
- Los nombres en instancia y definición (0.8.38) y los herrajes en 3D (0.8.37), sin cambios.

## Límites

- **Sugerencia, no decisión:** la forma no distingue puerta de revestimiento o panel fijo. Por eso nada se suma sin confirmarlo.
- **Necesita el frente confirmado:** sin él no hay sugerencias.
- **El bloque de sugerencias no tiene prueba de interfaz versionada:** el doble de Piezas no trae un mueble con frente confirmado. Lo cubren las pruebas de la lógica y la revisión en la página de prueba.
- **Simulado:** falta probar en SketchUp real con un modelo del taller.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
