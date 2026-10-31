# 0.8.29 · Hoja A4: listado agrupado, «Notas del armador» y encabezado bajo (SINTÉTICO)

Capturas del PDF real del exportador (`composeA4` / `createOfflinePdfPages`), generadas en Node con
`node docs/validacion-0829/capturas-a4.mjs`. No es SketchUp. Mueble: `createA4Demo()` (bajo mesada de 17 piezas,
sintético) **sin** «Agrupar componentes iguales», para que se vea la diferencia del listado.
`antes` compila el exportador de `d9533aa` (0.8.28); `despues`, esta rama.

- `A4-{antes|despues}-{1-vista|2-vistas}-SINTETICO.png`: página 1 a 110 ppp.
- `A4-despues-*-SINTETICO.pdf`: los PDF de `despues` (para `pdftotext`).
- `MEDIDAS-A4.json`: cajas de las vistas, ancho y alto del mueble dibujado, filas, suma de Cant. y recuadro de notas, en mm.

## Medidas (mm, desde el borde superior de la hoja)
| | antes (0.8.28) | después (0.8.29) |
|---|---|---|
| Línea bajo el encabezado | 33 | 18 |
| Banda «VISTA …» (primer texto) | 38,2 | 21,4 |
| Caja 1 vista | 177 × 124,7 desde 44 | 189 × 158,1 desde 25 |
| Mueble dibujado, 1 vista | 100,9 × 89,8 | 127,9 × 113,8 (+27 %) |
| Caja 2 vistas | 86 × 125 desde 44 | 92,5 × 155,2 desde 25 |
| Mueble dibujado, 2 vistas | 60,2 × 53,6 | 64,7 × 57,6 (+7 %) |
| Filas del listado / suma de Cant. | 17 / 17 | 8 / 17 |
| «Notas del armador» | — | desde 78,2, 116,8 de alto |

Con dos vistas el dibujo queda limitado por el ancho de cada caja (la escena usa el 70 % del ancho): el alto ganado
sólo agranda el mueble con una vista. Los textos de IDs y cotas siguen en 9,9 pt.

## Criterio
- **Listado siempre agrupado** (`sheetGroups` en `lib/pieceGroups.ts`): mismo nombre impreso, misma equivalencia física
  que `physicalGroups` (medidas ±0,5 mm, material de la pieza y de sus caras, largo en la veta, forma) y, si la hoja
  imprime el pedido, la misma placa, cantos por lado, corte, veta y lote (o el mismo estado pendiente). Un tablero liso
  y su copia espejada son la misma fila; una pieza con forma conserva su mano. Las sugerencias de nombres no cambian.
- **ID**: la fila lleva el código de su primera pieza. Con los IDs a la vista, el dibujo marca ese código una sola vez
  con «×N» (piezas visibles), como «Agrupar componentes iguales», y las notas de la leyenda nombran el mismo código.
  «Copiar tabla» lista los demás códigos de la fila en «También».
- **«Notas del armador»**: recuadro con renglones cada 7 mm debajo del listado, hasta 195 mm; nunca menos de 35 mm
  (el listado tiene 127 mm; si no entra, sigue en la hoja 2 y el recuadro ocupa la columna bajo el aviso).
- **Observaciones**: la línea manuscrita «Observaciones:» se reemplazó por el recuadro. Las notas automáticas
  («Notas y observaciones de armado», incluidas las observaciones escritas en la guía) quedan bajo las vistas, a 7 pt.
