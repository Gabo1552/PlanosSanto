# Hito 3 «Del modelo al TXT sin fricción»: validación pendiente en SketchUp 2026

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Todo lo de este hito se probó con **dobles de la API** (diagnóstico P1 sintético, `fake_api`, controlador Ruby real por la tubería de Playwright offline). **Nada se probó en SketchUp ni en el portal de la maderera.** El TXT sigue marcado `production_ready=false`.

Plan de referencia: `audit/opencutlist-paridad-2026-10-21/PLAN_PARIDAD_OCL.md`, sección 5, Hito 3.

## Qué entra

| # | Entregable | Dónde | Prueba automática (dobles) |
|---|---|---|---|
| 1 | **Proponer pedido desde el modelo** (F-CAN-A, OPT-15, DESP-04, DESP-16). Para las filas incluidas **sin ninguna verificación hecha**: ejes (U el más largo, V el segundo, espesor = el eje que mide lo que la placa del catálogo; con veta, U a lo largo de la veta), placa y cantos desde los vínculos nativos (máximo 2 SKU de canto por pieza; con 3 o más la fila queda sin cantos y con el motivo), `edgeMap` desde `projected_edges` con `edgeResolution='observed'`, regla «terminadas aceptadas» y nota automática de lote. Todo queda sin confirmar. | `sketchup_offline/order_proposal.rb` (`propose`), acción `order_propose` | `order_proposal_test.rb`: ejes con largo en Z y espesor en Y, espesor tomado de la placa y no del lado más chico, veta, 3 SKU, tabla de vínculos, nativo que manda, roles consistentes en todo el pedido, filas con verificaciones que se conservan, no rectangular que se abstiene |
| 2 | **Confirmar en bloque** solo filas sin ambigüedad: rectangulares, no espejadas, largo ≠ ancho, sin lados «sin resolver», espesor coincidente, y que además pasan la validación completa de exportación (incluidas las relecturas de caras). | `confirm_bulk`, acción `order_confirm_bulk` | Seis piezas: solo la inequívoca se confirma; las otras cinco quedan con su motivo |
| 3 | **Aplicar a filas equivalentes o seleccionadas** (F-DESP-A): invalida solo las verificaciones del grupo cuyo valor cambió en cada destino. | `apply`, acción `order_apply` | Mismos valores → no invalida nada; cambio de canto → solo `edgesConfirmed`; cambio de placa → `materialConfirmed` y `grainConfirmed`; corte explícito solo a equivalentes, con base y altura cruzadas si los ejes están cruzados |
| 4 | **Vínculos material observado → canto a nivel borrador** (F-DESP-D): `plan.edgeLinks`. El vínculo nativo siempre manda; la tabla solo cubre materiales de canto sin vínculo nativo. | `order_proposal.rb`, `workshop.rb` (`save_plan`) | Material sin vínculo → motivo; con vínculo en la tabla → se propone; vínculo nativo gana sobre la tabla |
| 5 | **`lots[].edgeTotals`** en el manifiesto (CANTOS-01 + F-CAN-C): metros, lados y piezas por SKU y rol. | `supplier_order.rb` (`export`) | 2 piezas de 700 × 450 con `[1,1,0,0]` → 2,8 m, 4 lados, 2 piezas |
| 6 | **Código compuesto en el detalle** (F-DESP-C), opcional (`plan.detailCode='module_piece'`): `M03·P07 Lateral`. Módulo de la guía (o del nombre del mueble, `M\d{1,3}`) y código de pieza de la guía guardada. Si falta el código o el detalle con código supera 80 caracteres, la fila se bloquea con el motivo. | `order_proposal.rb` (`codes`, `detail_text`), `supplier_order.rb` | TXT en UTF-8 y Windows-1252 con `·`; dos laterales iguales pasan de un renglón a dos; 80 caracteres justos pasa, 81 bloquea |

El formato del TXT (9 columnas, TAB, CRLF) y sus bloqueos comerciales no cambian. Con `detailCode` ausente o `'none'` el TXT es idéntico al anterior.

## Decisiones y supuestos (validar)

- **Hecho:** «Confirmar en bloque» deja en revisión individual, además de lo pedido, las piezas de **placa con veta** y las de **cantos con revisión manual**. **Motivo:** la dirección de veta en frentes es justo el riesgo que nombra el plan; la regla «U a lo largo de la veta» es una propuesta, no una certeza. Si el taller lo acepta, se relaja en `OrderProposal#bulk_reasons`.
- **Supuesto:** la cara mostrada (`frontSign`) se elige para que la vista 2D no quede espejada. Para la maderera un rectángulo visto de atrás es la misma pieza con izquierda/derecha intercambiadas, así que no cambia el pedido físico; igual hay que confirmarlo con el proveedor (mismo pendiente que F-OPT-A).
- **Supuesto:** el canto principal es, en todo el pedido, el SKU con más metros; así las piezas no se reparten en lotes distintos por roles invertidos.
- **Limitación conocida:** los ids de material observados (`material:<entityID>`) los da SketchUp por sesión. La tabla `edgeLinks` (igual que `edgeBindings` de cada fila, que ya existía) puede quedar vieja al reabrir el SKP: el material aparece de nuevo «sin vínculo» y hay que volver a vincularlo. Validar en SketchUp si el `entityID` se conserva entre sesiones del mismo archivo.
- **Pendiente con la maderera:** que el TXT con `M03·P07` en el detalle se siga importando en su sistema (envío de prueba).

## Cómo validarlo en SketchUp 2026

Usar un modelo **de prueba** (copia), nunca el original.

1. **Placard de unas 30 piezas pintado** con placa y cantos de la biblioteca (Hito 2, vínculos nativos).
2. Abrir «Biblioteca y pedidos» → «Pedido maderera» → **«Proponer pedido desde el modelo»**. Anotar el resumen: propuestas, en revisión, conservadas.
   - Criterio: 3 clics de lote (proponer, confirmar en bloque, exportar) + revisión individual de las ambiguas, que **no deberían pasar del 20 %**.
3. Revisar en la vista 2D, una por una, al menos: un frente (puerta), un lateral, un estante, una pieza cuadrada y una espejada. Verificar que arriba/abajo/izquierda/derecha coinciden con las caras pintadas.
4. **«Confirmar en bloque las filas sin ambigüedad»**. Anotar cuántas quedaron en revisión y por qué. Ninguna pieza con veta, espejada, cuadrada o con lados sin resolver debe confirmarse.
5. Completar las de revisión individual. Probar «Aplicar a…» con 4 laterales iguales y con una pieza no equivalente seleccionada: solo deben perderse las verificaciones del dato que cambió.
6. Si hay un canto pintado con un material de canto sin vínculo Planos Santo (por ejemplo, tipado solo en OpenCutList), vincularlo en «Vínculos de cantos del borrador» y volver a proponer.
7. Activar «código módulo·pieza» (requiere la guía guardada con módulo M01… y códigos P01…). Exportar.
8. **Comparar el TXT línea por línea con uno armado a mano** para el mismo mueble. Abrir `manifest.json` y verificar `lots[].edgeTotals` contra los metros de canto calculados a mano (control: 2 piezas de 700 × 450 con canto arriba y abajo = 2,8 m).
9. Guardar el borrador, cerrar y reabrir el SKP: verificar si la tabla de vínculos sigue vigente (ver limitación).
10. Ctrl+Z después de «Guardar borrador»: debe deshacer solo el borrador. Proponer, confirmar en bloque y aplicar **no** crean operaciones de deshacer (no escriben el modelo).

Registrar para cada paso: versión de SketchUp, cantidad de piezas, tiempos aproximados de «Proponer» y «Confirmar en bloque», capturas de la vista 2D de las piezas dudosas y el TXT/manifiesto resultantes.
