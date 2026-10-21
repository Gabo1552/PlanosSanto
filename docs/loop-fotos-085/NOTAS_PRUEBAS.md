# Comparativas y pruebas de fotos — nube

Se ejecuta la interfaz HTML real con OfflineController, PhotoMaterial y SmartPaint reales. SketchUp/ImageRep/Material/SKM/modelo son dobles explícitos de API. No se ejecutó SketchUp ni un decodificador nativo. Los archivos SKM del fixture son documentos JSON sintéticos; las imágenes son PNG generados y un JPG de ensayo propio. No se usaron materiales privados.

Línea base 0.8.4: extraída intacta de PlanosSanto-0.8.4.rbz, SHA256 68f3417ff77eae10f5f78c374de1c1729c48040b32bfc391aa722787d889935b. Su UI y controlador Ruby reales generaron las tres capturas anteriores. La nueva prueba conserva la forma L sintética; usa definiciones independientes para el ensayo de alcance seguro y no simula make_unique compartido.

Correcciones del harness durante el ciclo:

- Chromium necesita la ejecución autorizada fuera del sandbox; el primer intento no inició navegador.
- El snapshot consultaba CatalogStore sin el directorio temporal explícito y veía catálogo vacío. Se corrigió el driver.
- Las caras sintéticas carecían de texture_positioned?/texture_projected?; SmartPaint bloqueó correctamente. El driver declara mapeo no posicionado, sin afirmar cobertura UV.
- Se conserva el diagnóstico de un intento de reutilización con ArgumentError; la repetición con el estado actualizado pasó. No se atribuye causa sin traza.

Hallazgos enviados al desarrollo durante el ciclo: el guardado y pintado desde biblioteca podía abrirse antes de limpiar el estado de cambios pendientes; la biblioteca no recibía miniaturas de las fotos nuevas; faltaba cargar el archivo visual de una foto en otro modelo. Las pruebas añadidas mantienen esos recorridos explícitos y se vuelven a ejecutar sobre la candidata final.

Las decisiones de usabilidad parten de Materiales: + Material, elegir foto mediante selector doble, indicar espesor, Guardar y pintar, clic sobre cara mediante API doble. Cinco decisiones; la entrada a Materiales se informa separadamente. No se mide el explorador de Windows ni tiempo humano. La autorización de instancias compartidas no se concede automáticamente: alcance unique.

Pendiente fuera de la nube: decodificación real, textura nativa/miniatura/SKM, guardado/reapertura/Undo reales, picker y rendimiento, dibujo de herramienta y aplicación por cara/pieza/cantos, lectura de veta y materiales del taller; debe validarse en SketchUp 2026 por Codex local/Dot.

## Resultado final sobre la candidata compilada

- `npx playwright test --config playwright.offline.config.ts --output test-results/photo-after-085-final tests/offline/photo-experience.spec.ts`: **4/4 aprobadas**, 8.0 segundos.
- Biblioteca y modal con foto PNG, inicio de paleta con alcance único, pintar y Undo por motor real sobre dobles API; igualdad exacta de src entre vista previa y miniatura de paleta.
- Reutilizar existente, variante editable, bloqueo de reemplazo sin confirmación; Cancelar/Escape y foco modal.
- Otro modelo sintético, imagen original borrada, carga explícita del archivo visual privado y pintado/Undo.
- Selector cancelado, imagen inválida rechazada y JPG con nombre Unicode; modal a 440 px sin desbordamiento horizontal.
- Capturas finales inspeccionadas: trama visible en modal/paleta/tarjetas, etiquetas de diseño y maderera diferenciadas; captura compacta incluye controles de guardar/cancelar. La captura es de página completa; las zonas del modal que no caben usan desplazamiento.

Artefactos: `fotos-085-comparacion-SINTETICA.html`, `fotos-085-comparacion-SINTETICA.png`, `fotos-085-capturas-manifiesto.json`, `fotos-085-usabilidad.json`, `fotos-085-after.log`, `fotos-085-recorrido-local.md`.
