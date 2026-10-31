# Candidata 0.8.29 — hoja A4: listado agrupado, «Notas del armador» y encabezado compacto

Base: 0.8.28 (`761bdb1`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API y PDF reales generados con pdf-lib y leídos con Poppler.

## Cambios

1. **Listado siempre agrupado (`sheetGroups` en `lib/pieceGroups.ts`).**
   - **Qué piezas se juntan:** las iguales van en una fila con su cantidad, aunque sean de definiciones distintas. «Iguales» quiere decir:
     - mismo nombre impreso;
     - medidas ±0,5 mm;
     - material de la pieza y de sus caras;
     - largo en la veta;
     - forma;
     - si se imprime el pedido, también la misma placa, cantos por lado, corte y lote.
   - **Cant.:** suma el total de piezas del mueble.
   - **Código de la fila:** es el de la primera pieza. Con los IDs visibles, el dibujo lo marca una vez con «×N». «Copiar tabla» lista los demás códigos en la columna «También».
   - **Sin cambios:** `physicalGroups` (sugerencias de nombres) e `identicalGroups` (agrupar componentes iguales de la guía).
2. **«Notas del armador».**
   - Recuadro con renglones cada 7 mm, en la columna derecha, debajo del listado y hasta el pie. Mínimo 35 mm: la tabla de la hoja 1 pasa de 139 a 127 mm.
   - Si el listado no entra, pasa a la hoja 2 como antes, y el recuadro queda en la columna.
   - Reemplaza la línea «Observaciones:». Las notas automáticas quedan debajo de las vistas, a 7 pt, con un límite de 36 mm.
3. **Encabezado compacto.**
   - Franja de 10 mm: logo, mueble, obra y «Hoja N de M · X piezas · medidas en mm». La línea pasa de 33 a 18 mm.
   - Las vistas empiezan en 25 mm en lugar de 44, con márgenes laterales de 8 mm. El pie de cada vista va dentro de su caja.

| Medida (mueble sintético de 17 piezas) | Antes | Después |
|---|---|---|
| Caja, 1 vista | 177 × 124,7 mm | 189 × 158,1 mm |
| Mueble dibujado, 1 vista | 100,9 mm de ancho | 127,9 mm (+27 %) |
| Caja, 2 vistas | 86 × 125 mm | 92,5 × 155,2 mm |
| Mueble dibujado, 2 vistas | 60,2 mm de ancho | 64,7 mm (+7 %) |

Texto mínimo: 7 pt (6 pt sólo «AMOBLAMIENTOS» sin logo). IDs y cotas, 9,9 pt. El visor de Planos usa los mismos grupos y cajas que el PDF: la comparación píxel a píxel pasa.

## Límites

- En una fila agrupada sólo se imprime el código de la primera pieza. Los demás figuran en «Copiar tabla». Hay que revisarlo si se reactivan las etiquetas.
- Con dos vistas, la mejora es chica porque la escena usa el 70 % del ancho de cada caja (`lib/scene.ts`).

Capturas antes y después en `ux/` y medidas en `ux/MEDIDAS-A4.json`.
