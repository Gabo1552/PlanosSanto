# 0.8.26 · Cabecera compacta y sugerencias agrupadas (SINTÉTICO)

Capturas tomadas en Chromium con el controlador Ruby de nombres (`names_bridge_driver.rb`), no en SketchUp.
`antes` es la base `e4f1479` (WIP 0.8.26); `despues`, esta rama. Anchos: 1500, 1000 y 650 px.

- `cabecera-{antes|despues}-{ancho}-SINTETICO.png`: Materiales sin guía (exportar bloqueado).
- `cabecera-{antes|despues}-{ancho}-guia-SINTETICO.png`: Muebles con la guía generada y un nombre editado.
- `cabecera-despues-{ancho}-opciones-SINTETICO.png`: menú «Opciones» abierto.

## Cabecera
Una fila desde ~820 px: logo · módulo (miga compacta) · chip del proyecto (modelo, versión, estado con color y
motivo de bloqueo) · Guardar guía + estado (`sin guardar` / `guardado` / `falta SKP`) · Exportar PDF A4 · «⋯ Opciones».
A 650 px las acciones pasan a una segunda fila. El motivo de bloqueo queda visible en el chip y describe a los dos
botones (`aria-describedby`, además del `title`). «Opciones» reúne las opciones de guardado, Guardar y cerrar,
Plegar, el último aviso y la ayuda (atajos y diagnóstico, Guardar guía, PDF); `?` abre el menú y la ayuda.

## Sugerencias agrupadas
- Equivalencia física (`physicalGroups`): medidas ordenadas ±0,5 mm, material de la pieza y de sus caras, largo en
  el sentido de la veta (`grainAxis`), espejo y forma (relleno y superficie respecto de su caja). `mesh` no se
  compara entre definiciones: guarda vértices locales y sólo coincide dentro de una misma definición.
- Una fila por clasificación: piezas iguales con funciones distintas (Lateral/Divisor, Piso/Tapa) van en filas
  separadas. También se separan por corrección guardada o nombre propio distintos.
- Con «Agrupar componentes iguales» activo en la guía, sus grupos no se parten (comparten nombre en la guía): si sus
  piezas tienen funciones distintas, la fila queda como «Panel» a revisar y el motivo lo explica.
- Ediciones: se guardan por pieza. Desagrupar copia la edición de la fila a cada pieza; al agrupar, piezas iguales
  con ediciones distintas (o sólo una editada) quedan en filas separadas y se avisa cuántas.
