# Candidata 0.8.27 — Maderera sin exigir guardar la guía

Base: 0.8.26 (`283500f`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Cambio

Maderera ya no frena con «Guardá los cambios de la guía antes de preparar el pedido.».

- **La optimización por placa se genera siempre.** Las placas, la distribución y el aprovechamiento salen de la geometría, los materiales y la veta, no de la guía.
- **El TXT se exporta igual.** Los nombres y códigos de las piezas salen de la última guía guardada. Si la guía tiene cambios sin guardar:
  - la pantalla lo avisa: «La guía tiene cambios sin guardar. La optimización no depende de ellos…»;
  - el mensaje de la exportación también, para no mandar nombres viejos sin saberlo.
- **El pedido viejo sigue frenando** con una guía sin guardar. Son las acciones `order_*`, que escriben su borrador en el modelo.

Archivos: `sketchup_offline/offline.rb` (acciones `maderera_boards` y `maderera_txt`) y `sketchup_offline/ui/WorkshopPanel.tsx`.

## Prueba nueva

`tests/offline/maderera-placas.spec.ts`, «con la guía sin guardar, Maderera optimiza igual y el TXT avisa que usa los nombres guardados». Corre sobre el controlador Ruby real con dobles.

Recorrido:
1. Genera las guías sin guardar.
2. Entra a Maderera y ve las placas con el aviso.
3. Exporta un TXT y lo valida con los dos validadores.
4. Pasa axe.
5. Confirma que `order_plan` sigue frenando.

Se comprobó que falla con el `offline.rb` de 0.8.26 y pasa con el cambio.

Se conserva todo lo de 0.8.26. Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
