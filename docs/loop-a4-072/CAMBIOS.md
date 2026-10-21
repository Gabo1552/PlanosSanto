# Planos Santo0.7.2 — candidata visual

Protege el texto de las cotas frente a líneas de IDs y flechas: en PDF y SVG se pintan primero los trazos y después los fondos y textos. El visor separa las capas de líneas/texto manteniendo selección y movimiento de cotas.

No mueve cotas ni reduce fuentes; conserva geometría, cámaras, medidas, anclas y persistencia. Mantiene la corrección de nombres aceptada nativamente en0.7.1 y los módulos existentes.

Se reprodujo un cruce en un modelo sintético de17piezas y se agregaron regresiones de orden de pintura. Falta recibir/comparar el PDF real del BM17 y repetir la validación visual local. Esta versión no equivale a aceptación del plano doble.
