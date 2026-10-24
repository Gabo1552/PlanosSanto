# Calibración con cuatro pedidos reales · 24/10/2026

**El modo Experto 0.8.22 no reproduce al proveedor en ninguno de los cuatro pedidos.** Los tres nuevos aportan ejemplos sin veta y con giro permitido. El primero analizado tenía veta y orientación bloqueada. No se generó una candidata nueva con una regla sin validar.

Se usan identificadores anónimos: casos1–3 son los archivos nuevos en el orden de comparación; caso4 es el pedido anterior. `MULTICASO.json` registra hashes para reconocer cada par localmente. No se publican PDF, JSON originales, listas privadas, nombres de proyecto ni capturas del cliente.

## Resultados

| Caso | Filas / piezas | Formato | Veta | Placas proveedor / local | Aprovechamiento proveedor / local | Sierra m proveedor / local | Pasos proveedor / local |
|---|---|---|---|---|---|---|---|
|1|72 /400|2750×1830|No|27 /29|89,51 /83,34%|739,4 /794,0838|625 /675|
|2|23 /155|2600×1830|No|11 /13|90,96 /76,96%|283,3 /331,4724|241 /292|
|3|25 /198|2750×1830|No|12 /13|92,71 /85,58%|326,4 /370,6178|294 /368|
|4|368 /1244|2750×1830|Sí|56 /57|91,02 /89,42%|1953 /1981,5376|2100 /2420|

En los cuatro, todas las filas coinciden exactamente entre JSON y PDF en cantidades, medidas y descripción. Formato, sierra4,4mm y refilado10mm coinciden. No hay rechazo de piezas en el motor. Las diferencias no se explican por una entrada distinta.

## Cantos: fórmula correcta, presentación distinta

| Caso | Neto m | Neto×1,15 m | PDF proveedor m | Compra entera local m |
|---|---:|---:|---:|---:|
|1|522,623|601,01645|601|602|
|2|190,215|218,74725|218,7|219|
|3|167,077|192,13855|192,1|193|
|4|897,362|1031,9663|1032|1032|

Los cuatro PDF coinciden con el margen15% redondeado a un decimal. La UI local redondea hacia arriba para compra entera; no es la misma cifra que presenta el portal. El comparador ahora separa `edgeDisplayMetres`, `edgeBuyMetres` y `edgeDisplayMatches`. Este control de metros no resuelve por sí solo la correspondencia física de cada bit/cara.

## Qué permiten deducir los dibujos

- En el caso1, la primera placa coloca las piezas principales giradas aunque su orientación original también cabe en la placa vacía. El motor actual toma la orientación normal si cabe y prueba giro solo si falla: esa preferencia no reproduce la decisión observada.
- En el caso2 se observan franjas horizontales en una placa y una columna lateral alta en otra. Conservar esa columna requiere una secuencia de partición diferente de cortar cada pieza aislada transversalmente. La agrupación o evaluación anticipada de piezas es una hipótesis, no un hecho confirmado sobre el código del proveedor.
- En el caso4 ya se localizó una franja inferior que nuestro corte separa prematuramente. No basta conseguir el mismo número de placas: deben verificarse las decisiones y la geometría.

## Experimentos ejecutados

`scripts/calibrate_experto.py` ensaya280 variantes:5 órdenes,7 decisiones de partición,2 límites de profundidad y4 preferencias de giro. Cada variante se ejecutó sobre los cuatro pedidos. Solo se guardan parámetros y resultados agregados en `BARRIDO-HIPOTESIS.json`.

**Ninguna variante igualó las cuatro cantidades.** La menor suma de diferencias de placas fue3:28/12/13/56 frente a27/11/12/56. Cambiar solo orden, profundidad o giro dentro de esta familia de primer encaje no alcanza. Esto no demuestra que se hayan probado todos los algoritmos posibles.

Reproducción local, archivos privados fuera del repo:

```sh
python3 scripts/calibrate_experto.py --expected 27,11,12,56 caso1.json caso2.json caso3.json caso4.json > resultado.json
python3 scripts/test_calibrate_experto.py
npx vitest run tests/experto-audit.test.ts tests/experto-optimizer.test.ts
```

El laboratorio es código de investigación; no se importa desde la extensión ni se empaqueta en el RBZ. Sus «pasos» son cortes sin agrupar tandas y no deben equipararse automáticamente al contador industrial o al cálculo apilado del producto.

## Próximos cambios que hay que investigar

1. **Evaluar ambas orientaciones aun cuando la primera cabe**, respetando veta y permisos por pieza. Ensayo A ofrece un contraejemplo sintético de2 placas frente a una distribución válida de1.
2. **Comparar ambos cortes con las piezas restantes**, o construir patrones de grupos/franjas antes de fijar una partición. Ensayos B y C requieren decisiones opuestas; una regla constante no resuelve ambos.
3. **Comparar varias distribuciones completas**, conservando trazabilidad del criterio elegido, sin identificar «menos placas» con «misma lógica del proveedor».
4. **Calibrar el conteo de sierra por separado**, después de igualar las distribuciones. El criterio industrial de agrupación de cortes/pasos sigue sin conocerse.

Se prepararon tres TXT sintéticos y un protocolo en `ensayos/LEEME.md`. No requieren subir un proyecto privado. Hace falta ejecutar esos ensayos en el portal de Experto para distinguir las hipótesis; en la nube no se ejecutó ni se confirmó ningún pedido.

## Verificación

- 44 pruebas TS focales PASS (7 comparador +37 motor existente).
- 6 pruebas Python PASS: baseline de referencia, contraejemplo de giro, particiones opuestas, veta, invariantes y rechazo de entradas inválidas.
- Los tres TXT pasan el validador de9columnas.
- Lint focal y typecheck PASS.
- Paridad real con proveedor:0/4, no aprobada. SketchUp nativo no ejecutado.
