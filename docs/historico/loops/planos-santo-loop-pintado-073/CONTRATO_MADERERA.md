# Contrato fijo de salida a la maderera

La maderera recibe un TXT **delimitado por tabuladores** con exactamente **nueve columnas**, en este orden:

```
cant\tbase\taltura\tdetalle\trota\tcanto_arr\tcanto_aba\tcanto_izq\tcanto_der
```

`cant` positivo entero; `base` y `altura` positivas en milímetros (decimales si los acepta el proveedor); `detalle` corresponde al nombre revisado de la pieza; `rota` es 0/1; cada `canto_*` es 0 (sin), 1 (principal), 2 (secundario). Mantener el orden `izq` antes de `der` del encabezado del usuario.

El proveedor pide seleccionar **material de placa, espesor, canto principal y secundario por separado**. Se deben generar grupos/lotes homogéneos. Los tipos `1` y `2` tienen que referenciar materiales reales y confirmados del catálogo, no un color aproximado.

No agregar columnas de material o espesor al TXT. La selección/manifestación del lote va fuera de ese archivo. No mezclar orientaciones o materiales incompatibles dentro de un mismo lote. Mantener las garantías y bloqueos actuales de `SupplierOrder`.

Requisitos de prueba: orden de columnas, tabuladores reales, cantidad y dimensiones no cero, códigos 0/1/2, separación de lotes, nombres con acentos, texto sin saltos, piezas repetidas, orientación rotada/espejada y ausencia de datos inciertos. Probar un pedido artificial localmente pero **no subir un pedido real** al proveedor en este loop.

**Atención:** la aceptación final del proveedor y el separador decimal exacto requieren una importación de prueba por el encargado más adelante. No declarar ese punto validado desde la nube.
