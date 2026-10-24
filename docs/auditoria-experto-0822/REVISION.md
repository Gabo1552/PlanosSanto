# Auditoría de pedido real · Experto · 24/10/2026

**Resultado: NO hay equivalencia con el proveedor en este caso.** La candidata 0.8.22 y el Python original entregado dan 57 placas; el PDF del proveedor da56. El motor productivo no se alteró para forzar esa cifra.

## Entrada contrastada

Se leyeron localmente el JSON exportado del proveedor y las23 páginas del PDF adjunto. Las368 filas coinciden exactamente en cantidad, base, altura y descripción:1244 piezas físicas. Placa2750×1830mm, espesor18mm, con veta, todos los giros deshabilitados. Sierra4,4mm y refilado10mm; el dibujo del PDF confirma útil2740×1820. No hay stock sobrante ni mecanizados en el JSON.

No se publican documentos, nombres de cliente, descripciones ni listas de corte privadas. `RESULTADO-AGREGADO.json` guarda únicamente métricas e identificadores SHA256 de las fuentes para reproducir la comparación local.

| Métrica | PDF proveedor | Motor 0.8.22 |
|---|---:|---:|
| Placas |56|57|
| Superficie neta |256,5m² (redondeada)|256,507817m²|
| Aprovechamiento |91,02%|89,4215%|
| Metros de canto a comprar |1032|1032|
| Recorrido de sierra |1953m|1981,5376m|
| Desplazamientos/pasos |2100|2420|

La diferencia es una placa (+1,79%),28,5376m de recorrido y320 pasos estimados. No se detectan piezas perdidas, dimensiones distintas ni giros indebidos como explicación de la diferencia.

## Evidencia de causa y límites

1. El Python original (SHA256 `28114a6a3c54092611fc30fe1a6bab6e34effb6d2eabbe56b32d2071f9d07e1f`) también devuelve57 placas,1981,5376m y2420pasos con este pedido. La implementación TS sigue la referencia; esa referencia no describe completamente el algoritmo real del proveedor.
2. Comparación visual de la primera placa: los dos empiezan con la pieza de2570×1084 y otra de2448×600, pero el proveedor ubica una tira de2627×100 debajo de ambas; la referencia deja un rectángulo inferior limitado al ancho de la segunda pieza y ubica otra tira de2400×100. Hay una diferencia concreta en la elección de partición, antes de cualquier redondeo de totales.
3. Se exploraron en memoria56 combinaciones de orden, partición y límite de profundidad. Varias alcanzan56 placas, algunas55, pero no reproducen simultáneamente la distribución observada y los metros/pasos. No se cambió el motor por una variante elegida solamente por coincidir en cantidad. Obtener menos placas tampoco demuestra paridad con el proveedor.
4. General también entrega56 en esta entrada, pero usa20mm de descuento total por eje y otro criterio: esa coincidencia no valida Experto ni justifica intercambiar motores.
5. Cantos: los pares de bits4/8 sobre base y1/2 sobre altura dan897,362m netos; con15% =1031,9663m, compra1032m. Coincide con el PDF. Este control agregado no acredita cuál bit corresponde a cada cara física.
6. Los2100 desplazamientos del PDF pueden tener una definición operativa diferente de los pasos estimados. No se equiparan sin confirmar apilado, reutilización de cortes y secuencia industrial.

## Reproducción y pruebas

```sh
node --import tsx scripts/audit-experto-case.ts /ruta/pedido.json /ruta/resultado.pdf
npx vitest run tests/experto-audit.test.ts tests/experto-optimizer.test.ts
npx eslint scripts/audit-experto-case.ts tests/experto-audit.test.ts
```

Requiere `pdftotext` de Poppler. Comparación real ejecutada en Linux; ningún documento se envió al proveedor ni a otro servicio. El intento inicial desde Node dentro del sandbox recibióEPERM al ejecutar pdftotext; la ejecución local autorizada terminó correctamente.

43 pruebas focales PASS (6 auditoría con datos sintéticos +37 motor). La auditoría diferencia datos no comparables, resultados discordantes, parámetros faltantes, veto por veta, cantidades inválidas y códigos de canto desconocidos. Lint focal PASS. No es una prueba nativa de SketchUp.

## Pendiente para aceptar el modo Experto

- Calibrar las decisiones de partición y reutilización de rectángulos con las distribuciones reales, conservando las pruebas pequeñas ya existentes.
- Confirmar el criterio de profundidad/etapas y cómo se cuentan movimientos/metros industriales.
- Validar la regla resultante en más pedidos independientes, sin usar este único caso como objetivo de ajuste.
- Exigir coincidencia de todas las piezas, orientación, formato y separación de sierra, además del número de placas. La aprobación de paridad comercial queda expresamente fallida en esta auditoría.

No se genera una nueva RBZ porque no hay un arreglo del motor demostrado por esta evidencia. Se conserva la candidata y se registra este defecto de calibración antes de una nueva entrega.
