# Contrato del TXT para la maderera (aportado por el taller)

Separador: carácter TAB (tabulador, `\t`). Cada fila representa una pieza/cantidad homogénea. El orden **exacto** es:

`cant` `base` `altura` `detalle` `rota` `canto_arr` `canto_aba` `canto_izq` `canto_der`

| Nº | Campo | Regla |
|---:|---|---|
| 1 | cant | obligatorio, entero positivo |
| 2 | base | obligatorio, mm; admite fracción decimal |
| 3 | altura | obligatorio, mm; admite fracción decimal |
| 4 | detalle | etiqueta/nombre de pieza |
| 5 | rota | 0 no rota / 1 puede rotar libremente; ante incertidumbre usar 0 |
| 6 | canto_arr | 0 ninguno / 1 principal / 2 secundario |
| 7 | canto_aba | idem |
| 8 | canto_izq | idem |
| 9 | canto_der | idem |

**Material, espesor, canto principal y canto secundario se seleccionan fuera del TXT, dentro del sistema del proveedor**. Generar TXT separado por combinación de esos cuatro parámetros y un `manifest` o informe humano para elegirlos al importar. Los cantos se asocian a los lados de la VISTA 2D de la pieza, no al mundo de SketchUp ni a la cámara.

Ejemplo de dos filas tabuladas (valores ilustrativos; ver `fixtures/pedido_ejemplo.txt`):

```text
1\t700\t450\tM01 - Lateral izquierdo\t0\t1\t0\t0\t0
2\t764.5\t450\tM01 - Estante\t0\t1\t0\t0\t0
```

**A confirmar con un TXT pequeño importado en el proveedor:** ausencia/presencia de encabezado, UTF-8/Windows-1252, punto o coma decimal, salto de línea, límites en `detalle`. Hasta validar, usar **sin encabezado**, UTF-8 sin BOM, `.` decimal y fin de línea CRLF al exportar en Windows (decisiones provisionales). El validador de este paquete aplica esas hipótesis técnicas, NO reemplaza una importación exitosa.

Comandos locales:

```bash
python3 planos-santo-arranque/scripts/validar_pedido_txt.py planos-santo-arranque/fixtures/pedido_ejemplo.txt
python3 -m unittest discover -s planos-santo-arranque/tests -v
```

No confundir la optimización de placas para presupuesto propio con la rotación admitida por el sistema de la maderera: deben seguir reglas de veta, canto y montaje pertinentes.
