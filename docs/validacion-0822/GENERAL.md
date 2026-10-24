# General: referencia y límites de la integración

## Referencia consultada

- Repositorio público: https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension
- Commit consultado: `1ef3e14c896171eed8cd77ede440c7f5563e943e`.
- Módulo: `src/ladb_opencutlist/ruby/lib/bin_packing_2d`.
- Licencia de ese repositorio: GNU GPL versión 3.

Se revisaron el contrato de entrada, las opciones y las familias de heurísticas. El motor público admite refilado simétrico por lado, pérdida de sierra, permiso global e individual de giro y formatos configurables. Prueba combinaciones de ordenamiento, puntuación de ajuste y partición de rectángulos; también contiene agrupación interna de piezas y selección de soluciones por placa. Por ello, llamar al optimizador previo de Planos Santo «el motor OpenCutList» no sería correcto.

La implementación previa de Planos Santo (`sheetOptimizer.ts`) ya utiliza cortes de guillotina, varios órdenes de piezas, ajuste por área y franjas. Es código propio y no reproduce todas las estrategias ni garantiza el mismo número de placas de OpenCutList. El README del proyecto documenta que no se copian su código ni sus recursos.

## Pruebas añadidas

`npx vitest run tests/general-optimizer-invariants.test.ts`: **9 pruebas aprobadas**, sobre el motor propio existente. Datos completamente sintéticos:

- Identidad y dimensiones de todas las ocurrencias; giro solo de piezas autorizadas; entrada inmutable y área coherente.
- Separabilidad recursiva de los diagramas mediante cortes completos de guillotina, respetando el ancho de sierra.
- Formato no estándar de la ficha, pieza de medida útil exacta, pieza fuera de formato y pedido vacío.
- Pedido de 1560 piezas sin pérdidas ni IDs duplicados.

La suite completa de nueve pruebas duró aproximadamente 398 ms en Linux (323 ms para el caso de 1560 piezas más comprobación recursiva de guillotina). No representa una medición dentro de SketchUp ni una comparación de optimalidad contra OpenCutList.

## Decisión adoptada

El usuario eligió **implementación propia basada en los criterios generales**, independiente de OpenCutList. Se conserva el motor existente de Planos Santo: ya evalúa 25 candidatas (5 ordenamientos por 4 particiones y una pasada de franjas), respeta formato de ficha, giro individual, refilado y disco. El corpus no justificó reemplazarlo ni multiplicar el coste de búsqueda. No se agregó código GPL ni dependencia de OpenCutList al RBZ.

Trazabilidad de criterios:

| Criterio general | Implementación propia | Límite |
| --- | --- | --- |
| Formato de placa | Largo y ancho de la ficha | No se asume marca |
| Refilado | Cada uno de los cuatro lados | Diferente de Experto, que descuenta una vez por eje |
| Pérdida de sierra | Separación entre piezas, sin pérdida extra en el borde | No estima tiempos industriales |
| Orientación | Permiso por pieza, sujeto a veta/cantos validados antes de optimizar | No cambia medidas ni atributos del modelo |
| Cortes de guillotina | Particiones de rectángulos libres y franjas | Sin mecanizados ni nesting de formas curvas |
| Búsqueda | Ordenamientos y particiones múltiples; mejor resultado por cantidad y último retazo | No garantiza óptimo global ni mismos diagramas que OCL |

## Comparación reproducible con motor público externo

Los scripts `scripts/compare-general-ocl.ts` y `scripts/compare-general-ocl.rb` son adaptadores propios de desarrollo: invocan el checkout público que el desarrollador provea como argumento. **No descargan ni incorporan el motor al producto.** No se usan durante el funcionamiento de la extensión ni forman parte de sus dependencias.

```sh
RUBY_BIN=/ruta/ruby node --import tsx scripts/compare-general-ocl.ts /ruta/checkout-opencutlist
```

La corrida registrada en `GENERAL_COMPARACION_SINTETICA.json` usa el commit indicado arriba, perfil `MEDIUM`, sin agrupación interna (`STACKING_NONE`), permiso global de giro y permiso individual según pieza. Las medidas se convierten a pulgadas únicamente al entrar al motor de referencia. Los datos de `tests/fixtures/general-reference-cases.ts` son sintéticos.

| Caso | Piezas | Placas General | Placas referencia | Ocurrencias coinciden |
| --- | ---: | ---: | ---: | --- |
| Tres piezas 1500 × 1500 | 3 | 3 | 3 | Sí |
| Mezcla de 764 × 580 y 720 × 580 | 12 | 2 | 2 | Sí |
| Encaje exacto sin disco | 4 | 1 | 1 | Sí |
| Una pieza bloqueada por veta y otra girable | 2 | 1 | 1 | Sí; una queda fuera |
| Formato personalizado 1734 × 932 | 1 | 1 | 1 | Sí |
| Mezcla de 60 piezas | 60 | 4 | 4 | Sí |

Coincidieron cantidad de placas e identidades colocadas/no colocadas en estos seis casos. **No se verificó igualdad de diagramas ni paridad general de algoritmos.** Las mediciones son una corrida de Linux, con lenguajes distintos y sin aislar carga del sistema: se conservan como diagnóstico, no como promesa de rendimiento ni benchmark comercial. La suite de regresión común no necesita el checkout de OpenCutList: comprueba los resultados observados de este corpus y las invariantes físicas.

Incidencias del harness: la primera ejecución mediante `tsx` fue bloqueada por IPC del sandbox; con `node --import tsx` la creación del hijo Ruby requirió ejecución fuera de ese sandbox. El motor público emitió una línea diagnóstica en stdout; el adaptador la redirige a stderr durante `runall` para conservar el protocolo JSON. No se modificó el motor público ni se atribuyen estas incidencias a Planos Santo.

Texto de interfaz recomendado: **General · optimización independiente por cortes de guillotina**. Ayuda: «Basada en los mismos criterios generales de corte de OpenCutList; los diagramas y cantidades pueden diferir».
