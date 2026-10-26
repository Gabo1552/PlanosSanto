# Candidata 0.8.24 — búsqueda de distribuciones Experto

26/10/2026. Corrige los tres ensayos A/B/C y mejora tres de los cuatro pedidos reales. Mantiene los cambios de materiales de 0.8.23 y el modo General. No acredita equivalencia con el algoritmo privado del proveedor ni ejecución nativa en SketchUp.

## Cambio del motor

El primer encaje elegía la orientación normal si entraba y fijaba la partición a partir del sobrante de una sola pieza. Ahora se comparan hasta 90 planes completos (40 cuando ningún giro está permitido): cinco órdenes, preferencias de orientación, particiones horizontales/verticales y por áreas, una evaluación de las próximas 16 piezas y patrones completos de franjas/columnas. Estos últimos prueban alturas de las primeras ocho piezas pendientes y construyen cada franja antes de cortarla.

El criterio de selección es lexicográfico: menor cantidad de placas, menor recorrido de partición y menor cantidad de cortes sin apilar. Con igual cantidad de placas, el desperdicio total es igual porque el formato y el área de piezas no cambian. Los empates mantienen el primer plan. El cálculo anterior se conserva como alternativa inicial; una alternativa que ya requiere más placas se abandona. La búsqueda usa límites de trabajo fijos, sin azar ni decisiones por reloj, ID o nombre de pedido.

Se mantienen las dimensiones del catálogo, sierra de 4,4 mm, refilado de 10 mm total por eje, mínimo de 50 mm y permisos de giro por pieza. Las variantes de primer encaje conservan la profundidad de la referencia. Las franjas usan hasta tres etapas de guillotina: separar la franja, separar piezas dentro de ella y recortar la altura de cada pieza si hace falta; no se reutilizan sus recortes. Esta construcción es propia y no demuestra las restricciones industriales internas del proveedor.

`packExpertoReference` permite seguir contrastando cada colocación y corte del Python original con los nueve fixtures históricos. El producto utiliza `packExperto`. El resultado añade `search` con estrategia seleccionada, candidatos intentados y cantidad de placas del cálculo anterior; no agrega controles técnicos a la interfaz.

## Resultado comprobado

| Ensayo | Antes | 0.8.24 | Proveedor | Sierra local / proveedor |
|---|---:|---:|---:|---:|
| A | 2 | 1 | 1 | 19,8864 / 19,9 m |
| B | 2 | 1 | 1 | 18,8376 / 19,1 m |
| C | 2 | 1 | 1 | 19,1020 / 19,2 m |

A reproduce la franja con cinco columnas giradas y ocho pasos estimados. B/C tienen ocho pasos estimados, pero el orden o secuencia de corte difiere del testigo del proveedor. C se compara con el formato **2750 × 1830** que figura en su PDF, no con el 2600 solicitado originalmente.

| Pedido anonimizado | Piezas | Antes | 0.8.24 | Proveedor |
|---|---:|---:|---:|---:|
| caso-1 | 400 | 29 | 28 | 27 |
| caso-2 | 155 | 13 | 12 | 11 |
| caso-3 | 198 | 13 | 13 | 12 |
| caso-4 | 1244 | 57 | 56 | 56 |

Los originales se identifican mediante SHA256 contra la auditoría anterior. [MULTICASO.json](MULTICASO.json) contiene solo agregados, hashes, estrategia y tiempos. Los cuatro planes pasan el control independiente de cantidades, IDs, dimensiones, orientación, límites, separación de sierra, área y descomposición de guillotina. No se publican las listas privadas ni los PDF.

El caso-4 iguala las placas, pero no sus pasos ni metros comerciales: 2410 pasos locales frente a 2100, y 1935,3424 m frente a 1953. Igualar placas no equivale a reproducir el proveedor. Queda pendiente reducir una placa en cada uno de los casos 1–3 y calibrar por separado cortes y apilado.

## Reproducción

```sh
npm test -- --maxWorkers=1
npm run typecheck
npm run lint
npm run build:offline
npm run test:offline:ruby
npx playwright test --config playwright.offline.config.ts tests/offline/maderera-placas.spec.ts tests/offline/optimizer-material-navigation.spec.ts
node --import tsx scripts/verify-experto-search.ts /ruta/caso1.json /ruta/caso2.json /ruta/caso3.json /ruta/caso4.json
```

La verificación geométrica está en `tests/helpers/experto-invariants.ts`: busca corredores completos de sierra recursivamente sin utilizar los nodos libres del motor. Incluye 24 lotes sintéticos deterministas, formatos propios, bordes exactos y IDs duplicados. Se conserva la prueba de rendimiento de 1560 piezas con presupuesto de 2 segundos por corrida del motor; no mide SketchUp ni Windows.
