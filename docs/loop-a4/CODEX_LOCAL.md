# Validación local — Planos Santo 0.7.0 candidata A4

Esta candidata no está aceptada. La nube no ejecutó SketchUp. La evidencia nativa recibida corresponde a 0.6.9 con el parche puntual de diagnóstico en memoria (16 comprobaciones), no a A4.

## Instalación sin parches temporales

1. Conservá el RBZ 0.6.9 y copias de los SKP. Trabajá sobre una COPIA de BM17 y de un modelo con notas/materiales/cantos/pedido existentes.
2. Cerrá todas las ventanas de SketchUp. Instalá `PlanosSanto-0.7.0.rbz` desde Administrador de extensiones; cerrá y abrí SketchUp otra vez. Verificá versión 0.7.0 en el administrador y el panel.
3. No ejecutes el runner histórico que carga diagnóstico 0.6.9 ni copies archivos sobre Plugins. La corrección ya está incluida en la candidata. El runner de esta entrega sólo lee la instalación real.
4. Verificá el SHA256 del RBZ contra `SHA256SUMS.txt` con `Get-FileHash .\PlanosSanto-0.7.0.rbz -Algorithm SHA256`.

## Captura reproducible de conservación (opcional, consola Ruby)

Abrí una copia del modelo, antes de editar la guía:

```ruby
load 'C:/ruta/entrega/validar_instalacion.rb'
PlanosSantoA4Validation.before('C:/ruta/evidencia/antes.json')
```

El helper verifica los hashes de todos los archivos instalados contra el manifest; usa `P1Diagnostics::Scanner` y `GuideStore` de la candidata instalada. No reemplaza constantes, métodos ni archivos del producto. Falla si no está la versión esperada, si el escaneo quedó incompleto o si el contador público difiere de las instancias.

Después de la interacción y antes de cerrar:

```ruby
PlanosSantoA4Validation.after('C:/ruta/evidencia/antes.json', 'C:/ruta/evidencia/despues.json')
```

Usá nombres nuevos: el helper no sobrescribe evidencia. Compara geometría, transformaciones, materiales y visibilidad; permite cambios de nombres/metadatos de la guía. Guardar SKP cambia el hash del archivo por diseño, por lo que no se usa ese hash para exigir igualdad del archivo guardado. Para comparar después de reabrir, cargá sólo este helper nuevamente, nunca fuentes anteriores del producto. Si los identificadores internos de materiales varían al reabrir, registrá la diferencia y verificá manualmente; no ocultes fallos del helper.

## Matriz obligatoria

- **BM17 real:** original `Bajo_mesada_1200x600x800_petiribi.skp`, SHA informado `6be09dfb6a24872a28f9efe3b379644c0ee93b788272ec30e8edd146417eef22`; 17 piezas, 20 instancias, 11 definiciones, 3 materiales. Verificá este hash antes de abrir una copia. El binario no está en esta entrega de nube. Generar guías debe conservar las 17 piezas. Registrá los ajustes elegidos y cualquier bloqueo de composición.
- **Una exterior:** elegí una vista exterior. Mueble ensamblado; girá con el mouse, cambiá inclinación/zoom; guardá. Exportá una sola hoja A4 con la vista elegida.
- **Una interior:** iniciá desde la misma cámara exterior. Editá visibilidad; ocultá puertas y otra pieza por lista y por selección. El dibujo debe previsualizar el cambio. Cancelá y comprobá restauración; repetí y aplicá. La tabla conserva todas las piezas y cantidades.
- **Instancias compartidas/anidadas:** ocultá una ruta de una pieza cuya definición tenga otra ocurrencia. Sólo esa ruta desaparece del interior. Exterior y modelo SketchUp permanecen completos. El listado de visibilidad muestra ID y ruta de cada instancia física.
- **Dos vistas:** seleccioná exterior+interior y cámara compartida. Girar desde cualquiera modifica la orientación compartida; ambas deben comparar el mismo frente, con diferencias sólo de visibilidad. Desactivar compartir conserva el frente inicial y permite giros independientes.
- **Notas/cotas:** agregá una flecha a una pieza visible, mové su marcador y una cota. Ocultá temporalmente la pieza anotada: exportar interior debe bloquear con explicación; restaurala y exportá. Cotas y notas conservan medidas y destinos. El PDF usa marcadores numerados y texto completo en la leyenda. Las posiciones del editor se adaptan al encuadre de impresión, sin modificar el ancla física.
- **Persistencia:** Guardar y cerrar; guardar SKP, cerrar todas las ventanas, reabrir copia, generar guías. Comprobá modo, cámaras, zoom, rutas ocultas, nombres, cotas y notas. Probá Undo en una copia: debe restaurar el estado previo de la guía/nombres sin alterar geometría.
- **Regresiones:** obra+módulo+nombres, agrupado misma definición/medidas/material, propuesta editable con una confirmación; biblioteca de materiales; lectura de cantos por cara y cuatro lados; borrador y TXT de maderera (nueve columnas y lotes compatibles). No se incluyeron funciones nuevas de presupuestos ni optimización.
- **Composición inviable:** probá textos/notas o listado excesivos. Debe informar el motivo, ofrecer ajustes y no escribir PDF incompleto ni páginas adicionales. Esta candidata no implementa autorización de páginas extra; requiere ajustar la composición o una decisión posterior explícita.
- **Impresión:** tamaño real 100%, papel A4 horizontal, una hoja por mueble. Revisá nombres, cantidades, medidas, flechas, IDs y notas a tamaño real. Texto mínimo: 8 pt en tabla/notas; 7 pt en cotas/identificadores.

## Inspección automática de PDF local

Con Python y `pypdf` disponibles (`python -m pip install pypdf` si hace falta):

```powershell
python inspeccionar_pdf.py guia-exterior.pdf --pages 1 --contains "VISTA EXTERIOR" --contains "297"
python inspeccionar_pdf.py guia-interior.pdf --pages 1 --contains "VISTA INTERIOR"
python inspeccionar_pdf.py guia-doble.pdf --pages 1 --contains "VISTA EXTERIOR" --contains "VISTA INTERIOR"
```

La inspección automática no demuestra legibilidad ni correspondencia de piezas. Capturá además vistas, diálogo de bloqueos e impresión/PDF abierto al 100%.

## Devolución al desarrollo en nube

Entregá versión/hash instalado, SketchUp/Ruby/OCL, modelo y hash inicial, cada caso PASS/FAIL con pasos, ajustes de cámara/zoom/ocultamiento, `antes.json`, `despues.json`, PDF generado y capturas. Los informes contienen datos privados: compartilos sólo en este contexto autorizado; no publiques los SKP.

No marcar aceptación global por instalar, obtener JSON o pasar pruebas sintéticas. A4 y el caso BM17 requieren evidencia real de esta candidata instalada.
