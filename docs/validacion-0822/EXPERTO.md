# Motor Experto: implementación y alcance

**Auditoría real posterior:** se detectó falta de paridad (57 placas locales frente a56 del proveedor). Ver [revisión del caso real](../auditoria-experto-0822/REVISION.md). Las pruebas contra el Python no constituyen aceptación comercial.

Implementación del 24/10/2026. `sketchup_offline/ui/expertoOptimizer.ts` reproduce la colocación y el cálculo de metros de sierra del Python entregado por el usuario. No consulta el servidor del proveedor y no acredita equivalencia comercial fuera de los casos que el documento original identifica como verificados.

La última instrucción del usuario prevalece sobre la tabla de formatos del documento: **el largo y el ancho salen de la ficha de la placa**, incluso para formatos distintos de Faplac/Egger. No se infiere la marca, no se inventa un color y no se aplica un formato por defecto en este motor.

## Contrato

`packExperto(pieces, spec, thicknessMm = 18)` recibe piezas físicas ya expandidas y orientadas en los ejes de corte del pedido. Devuelve `sheets`, `oversize`, `errors`, `warnings`, `partitionCutsMm`, `sawMetres`, `estimatedSawSteps` y `theoreticalMinimum`.

- Sierra fija de 4,4 mm, refilado de 10 mm **total por eje**, mínimo de 50 mm por lado. Una configuración diferente se rechaza expresamente.
- Las coordenadas del diagrama corresponden a la placa completa: comienzan en `(10,10)`. El borde útil final coincide con el borde final de la placa. Para comparar con el Python, restar 10 a x/y.
- Orden estable por área y lado mayor descendentes; primer nodo disponible de **todas** las placas abiertas. Los nodos nuevos se agregan al final, principal y luego residual.
- Raíz a profundidad 0, nodo principal mantiene profundidad, residual suma 1. Un nodo de profundidad 2 acepta una pieza pero no genera nuevos nodos. Esta interpretación procede de la referencia y todavía requiere calibración con el proveedor.
- Un error invalida toda la corrida: no se muestran placas parciales como cantidad para comprar. `errors` identifica la causa; `oversize` contiene las piezas rechazadas por medida, mínimo o encaje.
- El motor no cambia medidas, no descuenta espesor de canto, no decide caras canteadas, no mezcla materiales/espesores ni determina permisos comerciales. El adaptador mantiene esas responsabilidades.
- Se respeta `rotate` por pieza. No se normalizan ejes automáticamente: eso alteraría veta y correspondencia de los cuatro cantos. La resolución de veta y rotación de cantos pertenece al contrato del pedido.
- Metros y pasos de sierra son **estimaciones**. No hay precios ni presupuesto en esta implementación.

## Diferencias deliberadas respecto del Python

1. Entrada vacía devuelve ceros finitos; la referencia divide por cero al calcular aprovechamiento.
2. Medidas no finitas/no positivas, formato inválido y espesor inválido se bloquean antes de ubicar piezas.
3. Un patrón apilable usa ambas dimensiones, posiciones, orientación y secuencia de cortes. La referencia incluye ID, x, y y ancho, pero omite altura: podría juntar patrones distintos o separar patrones físicamente iguales por sus nombres. El cálculo nuevo conserva 4 pasos estimados para tres placas idénticas del caso A, aunque tengan identificadores de instancia diferentes.
4. Los avisos de rendimiento menor al esperado no ejecutan otro algoritmo para entregar menos placas bajo el nombre Experto. Se conserva el resultado de la heurística y se pide contrastarlo con el proveedor.
5. Las dimensiones de placa provienen del catálogo por instrucción expresa del usuario, no del diccionario de marcas de la referencia.

## Pruebas ejecutadas

`npx vitest run tests/experto-optimizer.test.ts`: **37/37 aprobadas**. `npx eslint sketchup_offline/ui/expertoOptimizer.ts tests/experto-optimizer.test.ts`: sin errores.

Nueve fixtures sintéticos se generaron ejecutando el Python original sin modificar: caso A, borde útil exacto, doce piezas, empates estables, giro obligatorio, decimales, profundidad con piezas pequeñas, visita a todas las placas y veta bloqueada. Se comparan número de placas, cada colocación, orientación, cada corte y metros de sierra, además de límites de placa, separación por sierra y conservación de todas las piezas.

Origen de la referencia: `nesting_experto405.py` adjunto por el usuario. SHA256: `28114a6a3c54092611fc30fe1a6bab6e34effb6d2eabbe56b32d2071f9d07e1f`.

Regeneración reproducible:

```sh
python3 scripts/generate-experto-reference.py /ruta/a/nesting_experto405.py
npx vitest run tests/experto-optimizer.test.ts
```

El script verifica ese hash antes de ejecutar el archivo. Los fixtures contienen exclusivamente piezas sintéticas; no incluyen modelos, materiales ni geometría privada del taller.

Resultados de referencia:

| Caso | Resultado |
|---|---|
| 3 piezas 1500 × 1500, placa 2750 × 1830 | 3 placas; 37,3464 m de sierra; 4 pasos estimados apilando |
| 1 pieza 2740 × 600, placa 2750 × 1830 | 1 placa; 3 pasos estimados |
| 8 piezas 764 × 580 y 4 piezas 720 × 580, placa 2600 × 1830 | 2 placas; coincide con el Python |
| Pieza 2745 × 600 en 2750 × 1830 | Corrida bloqueada |
| Pieza 40 × 30 | Corrida bloqueada por mínimo de 50 mm |
| Formato personalizado 3010 × 1210 y pieza 3000 × 1200 | 1 placa, sin cortes de partición |

Benchmark aislado en Node 24/Linux, después de calentamiento: 1560 piezas sintéticas, 105 placas, diez corridas de 7,045 a 8,795 ms, mediana 7,801 ms. Es rendimiento del motor puro en esta máquina, **no** de SketchUp, generación del pedido, renderizado ni clics Windows. La prueba automatizada usa un margen de 2 s para detectar crecimiento accidental del trabajo sin depender de tiempos finos de CI. Un primer intento con el CLI `tsx` fue impedido por permisos de IPC; se ejecutó correctamente con `node --import tsx`.

## Pendientes

- Comparación con otros dos o tres despieces completos y resultados del proveedor; el caso B del documento no trae piezas y no es reproducible.
- Confirmar interpretación de profundidad máxima, cortes con sobrantes pequeños y apilado/metros de sierra.
- Validación integrada del pedido, cantos y rotación por el desarrollador principal, y validación nativa en SketchUp 2026 por Codex local.
- La biblioteca visual, agrupación por material, selector Experto/General y entrega RBZ se integran fuera de este módulo.

No se declara aprobación comercial ni validación nativa de SketchUp.
