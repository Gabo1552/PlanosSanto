# Planos Santo 0.8.16 — menos pasos: pedido sin tildes, guía sin diálogos y vista de piezas

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

Aplica la decisión de Gabriel sobre `docs/simplificacion/AUDITORIA_FRICCION.md`: quitar los tildes de revisión, automatizar los botones intermedios, conservar sólo los controles físicos o los que evitan perder datos, y sumar una vista de piezas al estilo OpenCutList (replicando el comportamiento, sin copiar código).

## Qué cambia para el taller

| Antes | Ahora |
|---|---|
| Pedido: «Proponer», cinco tildes por pieza, «Confirmar en bloque», notas de 8 letras, origen de cantos con motivo, «Revisar pedido» y después «Exportar» | El pedido se propone solo desde lo pintado al abrirlo y se guarda solo. «Problemas del pedido» y el costo se actualizan en vivo. Hay un solo «Exportar TXT…» |
| El borrador se descartaba si cambiaba el modelo, la biblioteca o el perfil | Se cruza por pieza: lo editado a mano se conserva, las piezas nuevas se proponen y las que se borraron se quitan |
| Fichas «aprobadas» con casilla, que se desmarcaba al editar | «Ficha completa», calculada: placa con SKU, espesor, formato y veta; canto con ancho |
| Biblioteca: confirmaciones para cargar SKM, archivar, crear variante y sincronizar con OCL | Un clic |
| «Aplicar renombrado» con vista previa | Se renombra al «Guardar guía». Las filas que no se pueden renombrar (instancia compartida, rol mixto…) lo avisan en la fila |
| «Confirmé frente y vertical», obra y módulo obligatorios, notas huérfanas que bloqueaban | Frente y vertical por defecto. Módulos M01, M02… automáticos. Las notas huérfanas son aviso |
| Con el análisis desactualizado no se podía guardar ni exportar | Guardar y exportar reanalizan y regeneran solos, conservando lo editado |
| Perfil de maderera: aprobar la versión y después «Usar» | «Usar en pedidos» alcanza |
| Pintura avanzada: «Confirmo vínculo», «Autorizar reemplazo», «Verifiqué», «Autorizo ocurrencias compartidas» | Sin casillas: todo se deshace con Ctrl+Z |
| Foto: «Conozco el tamaño físico» | Las medidas son opcionales |
| A4: «Permitir hoja 2» | La hoja 2 se agrega sola si el listado no entra |
| No había vista de piezas por material | **Pestaña «Piezas»**: secciones por material y espesor con Código, Nombre, Cant., Largo, Ancho, Esp., cantos por lado (chips) y Veta. Pie con m² y metros de canto, filtro por mueble y buscador. Clic en una fila resalta la pieza en SketchUp. Al abrirla, genera las guías si faltan |

**Se mantienen**, porque evitan un pedido imposible o la pérdida de datos:
- canto más angosto que el espesor;
- espesor distinto del eje;
- la pieza no entra en la placa;
- girar con veta o con cantos asimétricos;
- pieza no rectangular;
- más de 2 cantos;
- detalle de más de 80 caracteres o código repetido;
- reemplazar la textura de una foto;
- aviso de renumerar códigos;
- aviso al cerrar con cambios sin guardar;
- «Descartar cambios» antes de un «Generar guías» explícito con ediciones.

## Cómo validarla

Igual que la 0.8.15 (`docs/validacion-0815/ANEXO_0815.md`), instalando `dist/PlanosSanto-0.8.16-candidata.rbz`. Se agrega:
1. **Pedido de punta a punta sin tildes:**
   - pintar placas y cantos en una copia del modelo;
   - abrir Pedido: tiene que venir propuesto;
   - corregir una pieza a mano;
   - repintar otra en SketchUp y volver: la corrección manual sigue y la repintada se actualizó;
   - «Exportar TXT…» y comparar el TXT con uno armado a mano.
2. **Bloqueos físicos:** un canto de 15 mm en placa de 18 tiene que frenar la exportación con el motivo en la fila.
3. **Biblioteca:** una ficha sin SKU aparece como incompleta y no se ofrece en el pedido; al completarla, aparece.
4. **Guardar guía con renombrado:** una pieza compartida que no se puede renombrar avisa en su fila, y el resto se renombra en una sola operación que Ctrl+Z deshace.
5. **Piezas:**
   - abrir la pestaña sin haber generado las guías;
   - verificar secciones, medidas, cantos y totales contra OpenCutList en el mismo modelo;
   - hacer clic en una fila y comprobar que la pieza se resalta en SketchUp.
6. **Hoja 2 automática:** un mueble con más filas de las que entran en la hoja 1.
