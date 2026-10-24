# Respuesta a los ensayos A/B/C — 24/10/2026

Se recibieron los tres PDF del proveedor. Se extrajeron sus textos con Poppler y se inspeccionó visualmente la primera página de cada uno. No se recibieron JSON del portal. No se ejecutó ni confirmó ningún pedido desde la nube.

## Resultado comprobado

| Ensayo | Formato que figura en PDF | Piezas | Proveedor / motor 0.8.23 | Aprovechamiento proveedor | Desplazamientos / metros |
|---|---|---:|---:|---:|---:|
| A | 2750 × 1830 | 5 | 1 / 2 placas | 79,48 % | 8 / 19,9 m |
| B | 2750 × 1830 | 3 | 1 / 2 placas | 83,46 % | 8 / 19,1 m |
| C | **2750 × 1830** | 4 | 1 / 2 placas | 80,28 % | 8 / 19,2 m |

En los tres PDF: sierra 4,4 mm y refilado 10 mm total por eje; útil 2740 × 1820. Las cantidades, dimensiones y descripciones coinciden exactamente con los TXT sintéticos enviados. Los valores de aprovechamiento coinciden con área de piezas / área bruta, no útil.

**C no se ejecutó con el formato solicitado de 2600 × 1830.** La comparación usa 2750 × 1830, tal como figura tanto en el encabezado como en la cota del dibujo y los sobrantes. No se atribuye ese cambio de formato al motor. El caso sigue distinguiendo decisiones de partición: con 2750, nuestro primer encaje y la variante siempre horizontal usan 2 placas; un testigo vertical válido usa 1.

El giro solicitado proviene de los TXT: A permitido, B/C bloqueado. Los dibujos muestran A girado y B/C sin giro; sin los JSON no se certifican los flags internos del portal. El espesor nominal de ensayo era 18 mm, pero no figura en estos PDF; no se toma como verificado por el proveedor.

## Qué queda confirmado por los dibujos

- **A:** las cinco piezas de 1600 × 500 se colocan como columnas de 500 × 1600; queda una franja inferior continua y un sobrante lateral. Nuestro motor intenta primero la orientación original y solo gira si no cabe. Esa preferencia no reproduce el dibujo observado. Debe evaluar ambas orientaciones permitidas antes de comprometer una distribución.
- **B:** las alturas 1000, 600 y 100 ocupan franjas horizontales; la pieza de 2600 conserva el ancho completo que necesita. El primer encaje actual divide prematuramente ese espacio y pierde la opción.
- **C:** tres piezas 2000 × 580 apiladas ocupan una columna; la pieza 400 × 1400 utiliza otra columna a la derecha. Un corte horizontal que atraviese todo el ancho al principio impediría esta distribución.

Así, una política fija horizontal o vertical no reproduce ambos dibujos. La comparación de sobrantes del primer rectángulo, aislada de las piezas pendientes, es insuficiente para estos casos.

## Qué todavía NO puede deducirse

No conocemos el algoritmo privado, su función de puntuación, desempates, búsqueda ni apilado. Hay distribuciones distintas de una sola placa para A: igualar la cantidad no prueba equivalencia geométrica. Tampoco basta resolver estos tres casos para igualar los cuatro pedidos grandes que siguen discrepando.

Los testigos reconstruidos conservan todas las piezas, dimensiones, permisos solicitados, separación de sierra y límites. Usando la convención existente del laboratorio (dos pasos de refilado y seis cortes de partición, con kerf terminal), dan:

| Testigo | Metros calculados | PDF a un decimal |
|---|---:|---:|
| A | 19,8864 | 19,9 |
| B | 19,0664 | 19,1 |
| C | 19,1864 | 19,2 |

Es una **compatibilidad del agregado redondeado**, no una prueba del contador industrial interno. No se deducen movimientos, tiempos o tandas comerciales de esos tres valores. Las coordenadas de los testigos se reconstruyen por medidas y sierra; no se extraen como coordenadas exactas del PDF. El sobrante «0 × 0» de B se trata como salida del portal, no como pieza fabricable.

## Cambio de motor que debe investigarse a continuación

1. Generar alternativas de orientación respetando permisos y veta, incluso si la primera orientación cabe.
2. Construir/evaluar grupos de piezas en franjas y columnas antes de partir el espacio restante, conservando regiones continuas para las piezas pendientes.
3. Comparar planes completos con una puntuación explícita: placas, factibilidad de corte, recorrido y desperdicio. No elegir una regla ad hoc por el nombre del ensayo o por su cantidad de piezas.
4. Volver a ejecutar los cuatro pedidos grandes y estos tres ensayos; medir invariantes, resultados, geometría y tiempo. Una mejora estimativa debe identificarse como tal hasta probar equivalencia con el proveedor.

Esta entrega agrega evidencia y pruebas; **no modifica el motor de la extensión ni genera un RBZ nuevo**. La candidata de materiales 0.8.23 permanece intacta.

## Archivos y reproducción

- `RESULTADOS-PDF.json`: comparación del motor real TS con los datos sintéticos reconstruidos y los textos de los PDF; hashes de origen, sin publicar los originales.
- `tests/fixtures/experto/supplier-probes.json`: observaciones y testigos sintéticos.
- `tests/experto-supplier-probes.test.ts`: 7 pruebas; incluyen la discrepancia conocida del motor, no se presenta como aceptación del proveedor. Al modificar el motor se actualizarán estas expectativas de auditoría.

```sh
npx vitest run tests/experto-supplier-probes.test.ts tests/experto-audit.test.ts tests/experto-optimizer.test.ts
python3 scripts/test_calibrate_experto.py
npx eslint tests/experto-supplier-probes.test.ts
npm run typecheck
```

Resultado: 51 pruebas TS y 6 Python aprobadas, lint y tipos aprobados. No se afirma validación nativa de SketchUp ni aceptación comercial.
