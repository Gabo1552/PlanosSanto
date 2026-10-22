# Planos Santo 0.8.15 — pintar sin ventanas y sin pasos previos

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

Responde a lo que Gabriel reportó usando la 0.8.14 en SketchUp 2026.

| Pedido | Qué cambió | Prueba automática (dobles, no SketchUp) |
|---|---|---|
| «Que no se abra una ventana al querer pintar; que se integre a SketchUp, como OpenCutList» | «Pintar», «Pintar canto» y «Quitar canto» de la barra activan el pincel directamente, sin abrir ninguna ventana. Dentro de la vista 3D se dibujan: arriba, la barra de modo (`Pieza` · `Canto` y, en canto, `1` · `2` · `4`); abajo, la tira de muestras (recientes y luego biblioteca). Un clic en una muestra elige el material y lo instala solo si hace falta. Al elegir un material vinculado en la bandeja Materiales de SketchUp, pasa a ser el del pincel. Los errores salen en la barra de estado. La paleta sigue disponible en el menú «Paleta de pintura…». Escrito de cero, replicando el comportamiento de OpenCutList, sin copiar su código | `pintura_en_vista_controller_test` (11 casos), `pincel_avanzado_tool_test` (+7) y `quick_toolbar_test`. Se verifica que no se cree ningún `UI::HtmlDialog` ni `messagebox` |
| «No se pudo verificar la copia de seguridad; la biblioteca no se modificó» al modificar una placa | Bug de Windows: las copias se escribían en modo texto, Windows convierte `\n` en `\r\n` y el hash nunca coincidía. Ahora se escribe en binario en la biblioteca, sus copias, los activos y estados de materiales, el perfil de maderera y el manifiesto del pedido | `windows_io_test.rb` revisa el código fuente, porque Linux no reproduce la conversión. Falla con el código anterior |
| «No se puede pintar. El análisis está desactualizado…» | Pintar no depende del análisis ni de la guía guardada. La herramienta crea su sesión en silencio y usa su propio inventario por clic. Sólo bloquean los cambios sin guardar de la biblioteca o del pedido | Pruebas offline y Ruby actualizadas |
| «Hay que tocar Analizar a cada rato» | Cuando el modelo cambia, el análisis se rehace solo a los 1,2 s y regenera las guías abiertas. Si se editó la guía a mano desde la última generación, espera y deja el aviso con el botón, para no descartar esas ediciones | `ux-shell.spec.ts` |
| «Sacar la vinculación excluyente del canto con la placa» | El pedido acepta cualquier canto aprobado que cubra el espesor. Ya no exige que el canto figure como compatible con la placa. Una pieza sin lados con canto no pide canto | `supplier_order_coverage_test`, `workshop.test.ts` y `ux2-taller.spec.ts` |

Sigue en la 0.8.15 la corrección de la 0.8.14: la foto se decodifica con la copia temporal cerrada.

## Cómo validarla

1. **Primero F0–F3 de la guía 0.8.11** (fotos), como pide el encargo 0.8.14.
2. **Pintura en la vista:** casos V1–V15 de `docs/pintura-en-vista/VALIDACION_SKETCHUP.md`. Los críticos:
   - tocar «Pintar» en la barra no abre ninguna ventana;
   - las barras se ven nítidas al 100 % y al 150 % de escalado;
   - elegir un material en la bandeja Materiales lo pasa al pincel (V7), sin que SketchUp salte a su propio Bote de pintura.
3. **Biblioteca:** modificar una placa y guardar no da error. En `%LOCALAPPDATA%\PlanosSanto\` (biblioteca QA) aparece la copia de seguridad.
4. **Sin pasos previos:** abrir un modelo y, sin analizar, tocar «Pintar» y pintar. Después, con la ventana principal abierta, el análisis y las guías se actualizan solos.
5. **Canto libre:** en el pedido, elegir un canto aprobado que no esté marcado como compatible con la placa. No bloquea si cubre el espesor.

## Próximo, pendiente de decisión de Gabriel
- Vista de piezas y materiales al estilo OpenCutList.
- Eliminar las confirmaciones innecesarias. Hay una auditoría en curso con la propuesta de qué eliminar, qué automatizar y qué mantener.
