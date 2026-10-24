# Experto: validación Ruby y TXT

El método se recibe en el puente como `method: "general" | "experto"`. Si falta, se mantiene General. Otros valores se rechazan. No se guarda el método en las filas del modelo ni se admite como campo nuevo de una pieza.

## Reglas

- `maderera_boards` y `maderera_txt` usan el mismo método; la caché del listado separa método y opción de giro.
- Experto toma largo y ancho de la ficha de placa. No deduce marca ni reemplaza el formato del taller.
- El área útil descuenta 10 mm totales de cada eje. Ambos lados de cada pieza deben medir al menos 50 mm. Una pieza que no entra bloquea el TXT completo de ese material/espesor.
- En Experto, una placa sin veta permite giro automáticamente, incluso con cantos asimétricos. Las cuatro columnas de canto siguen referidas a base/altura nominales de la pieza; no se permutan según su posición en el diagrama.
- Una placa con veta nunca permite giro. Una ficha sin dato de veta sigue incompleta y bloqueada.
- General conserva la regla anterior: se permite giro si el usuario lo solicita, la placa no tiene veta y sus cantos son simétricos.
- La ruta `Workshop#current_board_plan` ya trabaja sin perfil comercial heredado ni descuentos de canto. El servicio rechaza intentar usar Experto sobre un perfil de descuentos activo en lugar de producir medidas incompatibles.
- La exportación revalida geometría, mapa de cantos, ancho suficiente del canto, biblioteca, huella y filas físicas. No confía en el éxito previo del cálculo del navegador.
- Se conservan nueve columnas TAB, UTF-8 sin BOM, punto decimal y CRLF. No se agregan columnas de optimización al TXT.

## APIs de prueba

```ruby
workshop.boards(method: 'experto')
workshop.board_export(material_key, false, method: 'experto')
workshop.export_boards(false, destination_directory, method: 'experto')
```

El segundo argumento booleano se conserva por compatibilidad con General; Experto decide giro a partir de la veta.

## Pruebas automatizadas ejecutadas

Con Ruby de nube y dobles sintéticos, **sin SketchUp real**:

- `maderera_placas_test.rb`: 16 pruebas / 140 aserciones.
- `maderera_order_test.rb`: 9 pruebas / 54 aserciones.
- `supplier_order_coverage_test.rb`: 21 pruebas / 144 aserciones.
- Sintaxis de `supplier_order.rb`, `workshop.rb`, `offline.rb`: correcta.

Los siete casos nuevos verifican giro y cantos asimétricos, nueve columnas mediante los dos validadores Python del repositorio, formato personalizado y límite de refilado exacto, mínimo de 50 mm y bloqueo por material, veta y dato ausente, ancho/mapa de cantos, aislamiento de caché y exportación según método, allowlist y conservación del borrador.

Pendiente: importar TXT en el portal real de Experto para confirmar su interpretación de `rota=1` con cantos asimétricos; comparar cantidades con pedidos reales adicionales al caso A de la referencia. No se afirma aceptación comercial.
