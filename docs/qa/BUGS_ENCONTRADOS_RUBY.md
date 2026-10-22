# Bugs encontrados en pruebas Ruby (cobertura nocturna)

Alcance: `sketchup_offline/guide_store.rb`, `names.rb`, `workshop.rb`, `supplier_order.rb`.
Todo lo de este documento se detectó con **dobles de la API** (`fake_api.rb`, `fake_model.rb`,
`names_double.rb`, `ocl_read_double.rb`). **No se probó en SketchUp.** No se modificó código de producto.

## BUG-RB-01 — Mensaje "Elegí una placa aprobado de la biblioteca."

| Campo | Detalle |
|---|---|
| Archivo | `sketchup_offline/supplier_order.rb:68` (`SupplierOrder#material`) |
| Severidad | Baja (texto visible al operador; no afecta datos, lotes ni TXT) |
| Prueba | `SupplierOrderCoverageTest#test_missing_sheet_message_agrees_in_gender` (marcada con `skip`) |

**Causa.** El mensaje se arma como `"Elegí #{kind=='sheet' ? 'una placa' : 'un canto'} aprobado de la biblioteca."`.
El adjetivo queda fijo en masculino, así que para placas sale "una placa aprobado".

**Escenario reproducible.**
1. Preparar un pedido con una fila incluida cuyo `materialId` no corresponde a una placa aprobada
   (por ejemplo, el id de un canto o un id inexistente).
2. Ejecutar «Revisar» o «Exportar» (`SupplierOrder#validate`).
3. Resultado: `… (1/11): Elegí una placa aprobado de la biblioteca.`
   Esperado: `… (1/11): Elegí una placa aprobada de la biblioteca.`

**Corrección sugerida (no aplicada):** concordar el adjetivo con el sustantivo, por ejemplo
`kind=='sheet' ? 'una placa aprobada' : 'un canto aprobado'`. Al corregirlo, quitar el `skip`
de la prueba. Hoy ninguna prueba TS/E2E compara ese texto literal (se buscó "placa aprobado";
el único otro resultado es "formato de placa aprobado", que está bien porque concuerda con "formato").

## Observación (no confirmada como bug) — TAB/LF/CR en nombres de pieza de la guía

- `sketchup_offline/guide_store.rb:154` (`GuideStore#text!`) rechaza caracteres de control **excepto**
  TAB (`\x09`), LF (`\x0a`) y CR (`\x0d`). Se aplica igual a notas (200 caracteres, donde el salto de
  línea tiene sentido) y a nombres de pieza (80 caracteres).
- `NameManager.clean` (`names.rb:18`) sí rechaza esos caracteres. Resultado: un nombre de pieza
  `"Lateral\tizq"` se guarda en la guía si no se sincroniza con SketchUp, pero falla al sincronizar.
- No llega al TXT de la maderera (el detalle sale de la fila del pedido, que valida
  `CatalogStore#text`). Falta decidir si es intencional; no se escribió prueba con `skip` porque no
  hay un contrato documentado que diga cuál es el comportamiento correcto.
