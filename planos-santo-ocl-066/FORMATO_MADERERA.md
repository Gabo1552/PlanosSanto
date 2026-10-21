# Archivo que recibe la maderera

**Contrato según captura del usuario** (por validar mediante importación real): TXT sin encabezado; una pieza/tipo por fila; campos separados por `TAB` real, en este orden exacto:

| Nº | Campo | Reglas |
|---|---|---|
| 1 | `cant` | entero positivo |
| 2 | `base` | milímetros positivos; posible decimal |
| 3 | `altura` | milímetros positivos; posible decimal |
| 4 | `detalle` | nombre de pieza; sin tabs, saltos de línea ni controles |
| 5 | `rota` | `0` no rota / `1` rotación permitida por veta, canto y condiciones de corte |
| 6 | `canto_arr` | `0` sin / `1` principal / `2` secundario |
| 7 | `canto_aba` | idem |
| 8 | `canto_izq` | idem |
| 9 | `canto_der` | idem |

**No agregar material, espesor, código de canto ni costo como columnas.** El usuario selecciona en el portal del proveedor material, espesor, canto principal y canto secundario. Exportar un TXT **por combinación seleccionable** y un manifiesto fuera de los TXT con esos parámetros y la correspondencia a los archivos.

Ejemplo de dos filas reales de tabulación (solo ejemplo de formato, NO derivado de SKP):

```text
1\t700\t450\tM01 - Lateral izquierdo\t0\t1\t0\t0\t0
2\t764.5\t450\tM01 - Estante\t0\t1\t0\t0\t0
```

## Seguridad de fabricación

- No deducir `base` y `altura` simplemente ordenando las tres dimensiones. Verificar ejes, espesor, cara principal, sentido de veta y cotas *de corte* frente a cotas terminadas.
- Los cuatro cantos se definen respecto del plano 2D que el proveedor importará, no de la cámara 3D. Permitir vista previa 2D y ajuste con confirmación.
- No agrupar filas que difieran en orientación, veta, canto, material, espesor o nombre necesario para trazabilidad.
- No exportar piezas ambiguas, deformadas o sin correspondencia validada de material/canto como si estuvieran listas.
- Evitar sobrescribir exports por accidente; escribir archivos atómicamente y guardar manifiesto auditable.

## Hipótesis provisionales, NO confirmadas por proveedor

Sin encabezado, UTF-8 sin BOM, punto decimal y CRLF en Windows. Probar con un pedido pequeño aceptado por la maderera antes de usar el TXT en producción. Si el proveedor pide otra codificación, cambiar mediante perfil configurable sin alterar el orden de columnas. El script `scripts/validar_pedido_txt.py` solo revisa la sintaxis.
