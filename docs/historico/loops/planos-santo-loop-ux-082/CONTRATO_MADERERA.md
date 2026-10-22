# Contrato TXT proveedor — NO cambiar con el rediseño

Archivo de texto separado por `\t`, 9 columnas, orden EXACTO:
```
cant\tbase\taltura\tdetalle\trota\tcanto_arr\tcanto_aba\tcanto_izq\tcanto_der
```
Valores: cantidad entero positivo; base/altura mm (admiten décimas); rota 0 ó 1; cuatro cantos 0 = ninguno, 1 = principal, 2 = secundario. El proveedor solicita seleccionar por separado material/melamina, espesor, canto principal y secundario. NO agregar estas columnas al TXT. Separar lotes compatibles.

La UI puede renombrar estas etiquetas de manera más humana, pero la exportación NO cambia y se valida por tests. No inferir cantos por color o posición de cámara; usar ejes locales y verificación. Si hay orientaciones ambiguas, bloquear el lote y explicar la causa al encargado. No subir pedidos reales sin autorización.
