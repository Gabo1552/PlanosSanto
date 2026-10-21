# Planos Santo 0.7.5 — ajustes de biblioteca y pintado

- Vincular e instalar envía también la revisión de activos visuales. Un cambio desde otra ventana ya no queda oculto aunque el catálogo comercial conserve su revisión.
- «Actualizar biblioteca» vuelve a leer catálogo, materiales y caras; cancela la vista previa y reinicia las autorizaciones de reemplazo/confirmación.
- Si falla Aplicar, se elimina el token consumido y se exige nueva previsualización. Nunca se reintenta automáticamente ni se afirma que el modelo no cambió ante una respuesta incierta.
- Cancelar el selector SKM conserva la guía y muestra un aviso claro.
- Cancelar una vista previa funciona también si cambió el modelo activo; no modifica ninguno de los modelos.
- Se rechazan revisiones visuales no enteras/negativas e índices cuyo nombre SKM no corresponda al SHA256 declarado.

## Compatibilidad y rollback

Catálogo, activos y guía conservan schema1. No se migran archivos ni se cambian geometría, nombres, A4 o formato TXT. Los índices generados correctamente por0.7.4 cumplen la nueva validación. Un índice incoherente se informa; no se repara inventando datos.

La0.7.4 validada y sus evidencias permanecen intactas. Para volver, cerrar SketchUp y reinstalar su RBZ. Conservar copias del modelo y la carpeta de datos antes de actualizar. La candidata0.7.5 necesita su propia validación local; las35 pruebas anteriores corresponden exclusivamente a0.7.4.
