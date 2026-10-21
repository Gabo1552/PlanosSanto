# Candidata 0.8.2 — diálogo de exportación sin falso timeout

El tiempo que tarda el encargado en elegir dónde guardar un PDF deja de consumirse como falta de respuesta de SketchUp. El controlador identifica entrada y salida del selector nativo; el bridge conserva la petición durante esa elección. La cancelación y el error real siguen teniendo respuestas finales. Fuera de la elección humana se mantiene un límite técnico de 120 segundos.

Se aplica al PDF y a los otros seis selectores del mismo controlador: guardar SKP nuevo, importar/exportar biblioteca JSON, instalar SKM desde archivo, informe de materiales y carpeta de pedidos. No cambia la estructura de PDF, preferencias, guía, nombres, materiales, cantos o TXT. El reloj solo se suspende cuando Ruby notifica un selector para un ID y acción permitidos; ni progreso repetido ni otra solicitud extienden el límite de trabajo.

## Pruebas

- 14 pruebas nuevas de bridge con reloj virtual: PDF guardado tras 158 s, otros selectores, cancelación/reintento, error tardío, falta de respuesta inicial, límite de procesamiento posterior, IDs/acciones ajenas y excepción de transporte.
- Controlador Ruby: 13 pruebas/57 aserciones, cinco casos añadidos. Comprueban fases exactas antes/durante/después de selección, archivo escrito, cancelación, ensure tras excepción, reentrada sin robar ID y ausencia de suspensión para guardar un modelo con ruta existente o una petición inválida.
- Interfaz A4: reloj virtual avanza 158 s mientras el transporte de prueba retiene respuesta. Luego aparece éxito, no aviso rojo, Exportar vuelve a habilitarse y el PDF sintético tiene una página A4; geometría/visibilidad sin cambios. El controlador es Ruby real con dobles de SketchUp, no aplicación Windows.
- Integridad RBZ: inventario y hashes, CRC y sintaxis Ruby/JS frente a baseline 0.8.1. Se conserva el RBZ anterior intacto.
- Tres PDF de demostración de 17 piezas: exterior, interior y doble, una página 297 × 210 mm. Son sintéticos; no son BM17 real ni salida nativa 0.8.2.

Resultado completo y SHA final: `RESULTADO.json` y `validacion-pintado-082.json` del paquete. Logs incluidos. Ver `PROGRESO.md` para ciclos y correcciones de preparación.

## Estado nativo y conservación

La evidencia recibida de 0.8.1 confirma el arreglo de preferencias tras reinicio, doce regresiones, pintado/Undo y A4 dentro del alcance del informe local. Se revisaron sus archivos; no se ejecutó SketchUp en nube. La prueba nativa que descubre el defecto de espera no aprueba este nuevo arreglo.

**Falta validar 0.8.2 en SketchUp 2026**, especialmente entrega de notificaciones del HtmlDialog mientras el diálogo de Windows permanece abierto más de 158 s. Seguir `VALIDACION_LOCAL_POSTERIOR.md`; no usar parches temporales del runner histórico. El verificador de integridad y el de preferencias adjuntos son de solo lectura, con sintaxis comprobada; no ejecutados en SketchUp desde nube.

No incluye optimizador ni nuevas funciones de presupuesto. Siguen pendientes materiales/SKU comerciales, veta industrial, proveedor, perfil sin OCL y otros casos no ejecutados. No hay aprobación de producción global.
