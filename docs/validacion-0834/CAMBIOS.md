# Candidata 0.8.34 — SKU automático con el nombre y el espesor

Base: 0.8.33 (`c3f1a97`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Qué había

- **SKU manual:** el SKU de cada ficha se escribía a mano, y las fichas creadas desde fotos, SKM, presets, variantes o el modelo quedaban sin SKU.
- **Bloqueo:** una placa sin SKU figura como «Incompleta» y no sirve para pedir a la maderera.

## Cambio

- **Regla:** el SKU se arma solo con el nombre y el espesor, sin acentos, en mayúsculas y con guiones.

  | Ficha | SKU |
  |---|---|
  | «Melamina Blanca», 18 mm | `MELAMINA-BLANCA-18MM` |
  | «Canto PVC blanco», espesor elegido 0,45 mm | `CANTO-PVC-BLANCO-0.45MM` |
  | «Melamina Blanca» con varios espesores (la lista estándar de una placa) | `MELAMINA-BLANCA` |
  | «Bisagra cazoleta 35» (herraje) | `BISAGRA-CAZOLETA-35` |

  - **Varios espesores:** queda el nombre solo, porque cada línea del pedido y del TXT ya lleva su espesor.
  - **Nombre que ya trae el espesor:** si el nombre termina en el espesor («Melamina Blanca 18 mm»), no se repite.
- **Formulario de la ficha:**
  - El SKU sigue al nombre y al espesor mientras sea el automático.
  - Vacío, muestra el automático como sugerencia.
  - **Un SKU escrito a mano no se toca nunca.**
- **Biblioteca:**
  - Al guardar, un SKU vacío se completa solo.
  - Uno automático se actualiza si cambian el nombre o el espesor.
  - Vale para todas las fichas, también las que se crean solas.
- **Vínculos con el modelo:**
  - El SKU forma parte de la huella que vincula un material pintado con su ficha.
  - El SKU automático cuenta como vacío en esa huella, así llenarlo o renombrar la ficha no deja desactualizados los materiales ya pintados.
  - Un SKU escrito a mano sigue contando.

## Pruebas

- **Casos compartidos:** `tests/fixtures/auto-sku-cases.json`, los mismos para la interfaz (`tests/auto-sku.test.ts`) y para Ruby (`catalog_sku_test.rb`).
- **Ruby, guardado:**
  - completa los SKU vacíos y respeta los escritos;
  - sigue los renombres;
  - un SKU escrito después no se pisa;
  - la huella del vínculo no cambia.
- **Pruebas actualizadas:** las que exigían SKU vacío (SKM, presets, variantes, migración v3→v4) ahora exigen el automático. La de «ficha incompleta no sirve para pedir» ahora saca el largo en vez del SKU.

## Límites

- **Primer guardado:** la primera vez que se guarda la biblioteca, todas las fichas sin SKU reciben el automático. Es un cambio visible en Materiales, en Maderera y en el TXT.
- **Versión anterior:** una versión anterior de la extensión que abra un modelo pintado con esta biblioteca puede ver los vínculos como desactualizados, porque calcula la huella con el SKU nuevo.
- **Simulado:** todo se probó con dobles. Falta validar en SketchUp con una biblioteca real.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
