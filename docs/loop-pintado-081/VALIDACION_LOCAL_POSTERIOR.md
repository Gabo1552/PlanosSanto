# Validación local focalizada — 0.8.1

Pendiente en SketchUp2026. Esta candidata atiende el P2 de preferencias, sin ampliar el alcance comercial. No cargar parches temporales en memoria ni runners que reemplacen el producto.

1. Cerrar todas las ventanas, instalar RBZ0.8.1, reiniciar. Confirmar versión y hash instalados. Trabajar sobre copia y catálogo QA.
2. Abrir Pintado directo con el registro viejo que fallaba. Debe abrir sin bloquearse. Si el v1 no es recuperable, elegir ajustes una vez; no afirmar que se recuperaron los valores históricos por devolver {}.
3. Elegir un material real asociado, modo Placas, frente, alcance todas, ejes[1,2], modo lote=true y activar desde UI. Registrar exactamente los valores esperados. No hace falta pintar para guardar preferencias.
4. Detener/cerrar y abrir la paleta; deben recuperarse material/mode/side/scope/axes/batch. Cerrar SketchUp COMPLETAMENTE y reabrir el mismo proyecto; repetir la comparación y comprobar consola sin SyntaxError al leer v2.
5. Confirmación de aplicación y autorización de compartidos deben estar desmarcadas de nuevo. UUID nativo/de origen no debe haberse persistido como ajuste global ni aplicarse uno de otro proyecto.
6. En consola se puede observar el formato sin ejecutar eval ni alterar preferencias:

```ruby
controller = PlanosSanto::OfflineController.new
p controller.smart_settings
raw = Sketchup.read_default('PlanosSanto', 'smart_paint_settings_v2', '')
raise 'Formato incorrecto' unless raw.is_a?(String) && raw.start_with?('ps2:')
data = JSON.parse(Base64.strict_decode64(raw.delete_prefix('ps2:')))
raise 'Esquema' unless data['schema'] == 2
raise 'Permisos persistidos' unless (data['settings'].keys & %w[confirmed allowShared materialUuid sourceMaterialUuid]).empty?
p data['settings']
```

7. Comparar expectedSubset con controller.smart_settings y los campos visibles de UI; el mero formato codificado no acredita recuperación. Repetir con otro material real y otro ajuste de ejes/lote.
8. Recorrer un clic, lote/Enter y Undo; reabrir guía y exportar A4 breve para descartar regresiones. No sustituye los casos pendientes de Mayús, cambio de modelo con cola, rendimiento grande, perfil sinOCL, veta industrial y proveedor.

Entregar versión/SHA, expected/actual antes y después de reiniciar, salida de consola y capturas. El JSON escrito en el nuevo registro solo contiene preferencias filtradas. No adjuntar catálogo comercial ni originales sin necesidad.

La simulación en nube reproduce el comportamiento evaluador de cadenas informado, pero no ejecutó read_default de SketchUp real. La confirmación de esta corrección requiere repetir preference_regression.rb adaptado al nuevo formato y la UI instalada, sin parchear producto.

Se incluye verificar_preferencias_sketchup.rb: cargarlo no ejecuta pruebas ni guarda datos. Después de elegir/Activar desde UI y después de reiniciar, cargarlo por su ruta real y ejecutar:

```ruby
result = PlanosSantoPreferencias081.check({
  'mode'=>'sheet', 'catalogId'=>'UUID_COMERCIAL_REAL_ELEGIDO',
  'side'=>'front', 'scope'=>'all', 'axes'=>[1,2], 'batch'=>true
})
p result
raise 'Preferencias no recuperadas' unless result['passed']
```

No inventar catalogId ni copiar uno de otro modelo. Este runner compara un subconjunto esperado real y examina los campos guardados, sin escribir preferencias/modelo ni parchear producto. En nube solo se comprobó su sintaxis Ruby; no se ejecutó dentro de SketchUp.
