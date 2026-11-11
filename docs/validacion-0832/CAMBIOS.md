# Candidata 0.8.32 — decisiones del taller: veta de frentes de cajón y cotas en dos vistas

Base: 0.8.31 (`a672cec`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Decisiones confirmadas por el taller

1. **Frentes de cajón: veta vertical.** Desde 0.8.26 ya salían verticales, pero con el aviso «Pieza vertical más ancha que alta… revisar». **Se saca ese aviso:** toda pieza vertical sigue la altura del mueble sin pedir confirmación, aunque sea más ancha que alta.
   - **Siguen los avisos de:** pieza horizontal cuadrada, pieza inclinada y mueble acostado.
2. **A4 de dos vistas: la interior no lleva cotas.** Las totales van solo en la vista exterior, como ya hacía 0.8.31. Sin cambios de código.
3. **Frente mal propuesto:** se corrige marcando el frente en Proponer nombres, como ya está. Sin cambios.

## Cambio

- **Código:** en `sketchup_offline/grain.rb` se elimina el aviso `WIDE`. Una pieza vertical da `review = nil`.
- **Pruebas:**
  - `piece_grain_test.rb` ahora exige que el frente de cajón no tenga aviso.
  - `grain_order_test.rb` sigue probando que los avisos de veta llegan a Piezas y a las notas del pedido, ahora con el aviso de pieza cuadrada.

## Efecto en el taller

- **Piezas y pedido:** en Piezas, los frentes de cajón (y los zócalos u otras piezas verticales más anchas que altas) ya no muestran «revisar», y en el pedido ya no sale la nota de veta.
- **Zócalo:** también queda vertical sin aviso. Si lo querés horizontal, se gira en Piezas con «Girar veta 90°».

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
