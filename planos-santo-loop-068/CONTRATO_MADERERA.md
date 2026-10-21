# Contrato de exportación a la maderera — verificado con formato proporcionado por el usuario

**Texto separado por tabuladores** (no CSV con comas), con exactamente **9 campos por fila** y en este orden:

`cant` · `base` · `altura` · `detalle` · `rota` · `canto_arr` · `canto_aba` · `canto_izq` · `canto_der`

- `cant`: entero positivo, cantidad física agrupada sólo si las piezas son equivalentes en material, veta, dimensiones, cantos y orientación de fabricación.
- `base`, `altura`: medidas de fabricación en **mm**, positivas, hasta tres decimales según el exportador 0.6.8. No equiparar medidas geométricas con medidas de corte sin una regla validada.
- `detalle`: nombre legible de la pieza; sin TAB, CR ni LF.
- `rota`: **0** cuando no puede rotarse; **1** cuando se permite rotación libre. El estado de veta requiere confirmación explícita.
- `canto_arr`, `canto_aba`, `canto_izq`, `canto_der`: **0** sin canto; **1** canto principal; **2** canto secundario.
- El proveedor requiere elegir **por separado** el material, el espesor, el canto principal y el secundario. Exportar lotes separados por esa combinación y un manifiesto que indique cuál elegir al cargar cada TXT.
- Tomar el **orden del encabezado de la captura** como referencia para los lados (`izq` antes de `der`), dado que la explicación de la captura contiene una inconsistencia de orden. Comprobar en el sitio de la maderera con un archivo de prueba antes de aprobarlo.
- No presuponer que el proveedor acepta encabezados, BOM, LF vs CRLF ni una codificación determinada: salida inicial sin encabezado, registrar las opciones y **verificar con una importación de prueba**. Ajustar sólo basado en evidencia.
- Nunca mezclar espesores o materiales en un mismo TXT. Si el lote necesita más de dos tipos de canto, separarlo o pedir intervención: no inventar equivalencias.

## Bloqueo obligatorio de exportación

No generar un TXT **listo para enviar** si faltan identidad/cantidad, material y espesor, medidas de corte, orientación de pieza, veta, mapeo de cantos, selección de roles principal/secundario o revisión de todas las piezas incluidas. No eliminar silenciosamente una pieza con error: debe verse como bloqueada o excluida con razón explícita y aceptación humana.

## Fixture ilustrativo (NO es un archivo aceptado por la maderera)

```text
1<TAB>700<TAB>450<TAB>M01 - Lateral izquierdo<TAB>0<TAB>1<TAB>0<TAB>0<TAB>0
2<TAB>764<TAB>450<TAB>M01 - Estante<TAB>1<TAB>1<TAB>0<TAB>0<TAB>0
```

La validación sintáctica del TXT no sustituye el control de piezas ni el ensayo en el sistema de la maderera.
