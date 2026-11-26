# Candidata 0.8.37 — herrajes en 3D: bisagras codo 0 y correderas en el modelo

Base: 0.8.36 (`3c7c9e2`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API. **Esta versión escribe en el modelo:** probarla sobre copias.

## Qué había

La 0.8.36 calculaba los herrajes por el nombre de las piezas (bisagras, correderas y tiradores), pero solo como lista: no se veían en el modelo.

## Cambio

Paso 2 de herrajes: en Piezas, «Colocar en el modelo» dibuja las bisagras y las correderas donde van.

- **Bisagras codo 0** (puerta que tapa el lateral entero):
  - van en el canto del lado elegido, con la cazoleta Ø35 a 22 mm del canto, en la cara interior de la puerta;
  - la primera y la última quedan a 100 mm de las puntas (menos en puertas muy bajas) y el resto se reparte parejo;
  - la cantidad es la de la tabla de la 0.8.36.
- **Lado de las bisagras:** cada puerta tiene Izquierda/Derecha mirando el frente. La extensión sugiere el lado del costado más cercano del mueble; en dos puertas, cada una hacia su costado. Al volver a colocar, se usa el lado ya colocado.
- **Correderas:**
  - un par por frente de cajón, con el largo de la 0.8.36;
  - van entre las caras interiores de los laterales (o divisores) del cuerpo que están a los costados del cajón, desde detrás del frente hacia el fondo, a 30 mm del borde inferior del frente;
  - las piezas de la caja del cajón («Lateral cajón», «Del Caj») no se toman como laterales;
  - si no hay laterales a los dos costados, ese cajón no lleva correderas y queda un aviso.
- **Dónde se dibujan:** en un grupo propio por mueble («Herrajes · <mueble>»), en la raíz del modelo y con la etiqueta «Planos Santo · Herrajes» (se puede ocultar). Nunca se escribe dentro de un mueble ni se toca una pieza.
- **Formas:** simples y propias (cazoleta, brazo y base de la bisagra; riel de la corredera), para ver y verificar. No son modelos de fabricantes.
- **Una operación:** colocar, volver a colocar (reemplaza lo de ese mueble) y quitar se deshacen con un Ctrl+Z.
- **Sin efecto en el resto:** el análisis saltea los grupos de herrajes, así que Piezas, las guías, el pedido y el paquete de obra no cambian, y no hace falta volver a generar.
- **Controles antes de escribir:** muebles generados vigentes, piezas del mueble, tipo, lado, largo y ubicación (ejes ortonormales, sin espejo). Ante cualquier error no se escribe nada; si SketchUp falla a mitad, se aborta y el modelo queda como estaba.

## Pruebas nuevas

- `tests/hardware-placement.test.ts` (6): alturas de las bisagras, lado sugerido y ubicación en el canto y en la cara interior (izquierda y derecha), lado elegido, correderas entre laterales detrás del frente, cajón sin laterales a un costado y lateral de la caja del cajón ignorado.
- `sketchup_offline/test/hardware_model_test.rb` (7): un grupo con etiqueta por mueble en la raíz y una operación, conversión de mm a pulgadas, definiciones reutilizadas y sus sólidos, volver a colocar reemplaza solo ese mueble, validación completa antes de abrir la operación, aborto que deja los herrajes anteriores, quitar uno o todos, y el exportador salteando los grupos de herrajes.
- `sketchup_offline/test/hardware_controller_test.rb` (4): acciones del controlador con dobles (estado, pieza ajena rechazada, quitar sin nada colocado), el análisis y la huella del modelo salteando un grupo de herrajes de la raíz, y el aviso a la ventana después de Deshacer o Rehacer (una vez por cambio).
- `tests/offline/piezas.spec.ts` (2): estado leído del controlador real, lado sugerido, cambio de lado, lo que la interfaz manda al colocar y al quitar, aviso al cambiar el lado después de colocar; herrajes dibujados sin piezas con nombre (se pueden quitar) y el aviso de Deshacer que actualiza la sección; axe.

## Revisión antes de entregar (Codex)

| Punto | Estado |
|---|---|
| Deshacer o Rehacer en SketchUp no actualizaba lo colocado en Piezas | Corregido: Ruby compara el estado de herrajes en cada cambio del modelo y avisa a la ventana solo si cambió |
| Si ya no quedaban piezas llamadas Puerta o Fte, los herrajes dibujados no se podían quitar desde la extensión | Corregido: el estado se lee siempre y la sección queda con «Quitar del modelo» |
| La huella del análisis contaba los grupos de herrajes: después de colocar, el cambio siguiente marcaba las guías como desactualizadas | Corregido: `ModelWatch` saltea los grupos de herrajes de la raíz, como el exportador |

Cada corrección tiene una prueba que falla sin ella.

## Qué se conserva

- La lista de herrajes, el CSV y el paquete de obra de la 0.8.36, sin cambios.
- El RBZ suma `hardware_model.rb` (94 archivos).

## Límites

- **Solo codo 0:** no hay codo 9 ni codo 18 todavía.
- **Laterales de 18 mm:** la bisagra dibujada supone un lateral de 18 mm detrás del canto de la puerta. Con otro espesor, el brazo y la base quedan corridos; la posición de la cazoleta sí es la correcta.
- **Lado sugerido:** puede fallar en puertas centradas o en muebles raros; revisar puerta por puerta antes de colocar.
- **No sigue al mueble:** si movés un mueble, sus herrajes quedan donde estaban. Volvé a generar y a colocar.
- **Simulado:** la geometría (círculo, empuje, grupos) y la ubicación en un modelo real están sin probar en SketchUp.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
