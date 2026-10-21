# Validación local de candidata 0.8.2 — Codex local y Dot

## Instalación

1. Usar una copia del BM17 ya validado. Conservar original y SHA256 `6be09dfb6a24872a28f9efe3b379644c0ee93b788272ec30e8edd146417eef22`. Mantener catálogo QA aislado, sin aprobar SKU comerciales.
2. Cerrar TODAS las ventanas de SketchUp antes de actualizar; instalar `PlanosSanto-0.8.2-candidata.rbz` desde Administrador de extensiones. Volver a cerrar y abrir SketchUp 2026. No instalar el ZIP de entrega como extensión.
3. Comprobar versión 0.8.2 en UI y `PlanosSanto::Release::VERSION`. Ver SHA del RBZ en su `.sha256`. Cargar el verificador de integridad adjunto y ejecutar `PlanosSantoValidacion082.integridad`. Este archivo solo define una comprobación de lectura, no carga ni parchea módulos del producto. Conservar resultado antes y después.
4. No usar runner histórico que carga diagnóstico 0.6.9 ni corregir la instalación en memoria. Guardar resultados fuera de Plugins. El paquete de fuentes es para reproducir pruebas en nube, no para sobreescribir la instalación local.

## Caso prioritario: guardar PDF después de 158 segundos

1. Abrir copia del bajo mesada de 17 piezas; generar guía exterior con 8 filas agrupadas y nota/flecha heredada.
2. Pulsar **Exportar PDF A4**. Una vez visible el diálogo nativo Guardar, iniciar cronómetro externo. No simular el tiempo con Ruby.sleep: bloquearía el hilo de SketchUp y no reproduce elección humana.
3. Dejar el selector abierto por **al menos 158 segundos**. Comprobar que no aparezca el aviso rojo «SketchUp no respondió». Si Windows tapa la aplicación, guardar captura inmediatamente al cerrar el selector también.
4. Elegir una ruta Windows válida nueva y Guardar. Esperar «PDF A4 guardado: …», sin error rojo. Comprobar que Exportar vuelve a estar habilitado y que solo exista el PDF elegido, válido, una página 297 × 210 mm.
5. Abrir/renderizar PDF: 17 unidades completas, ocho filas agrupadas, cotas legibles, IDs, nota con flecha. Usar la misma guía/cámara del caso 0.8.1 para comparar, sin atribuirle nuevas pruebas de gestos manuales.
6. Repetir con dos vistas e interior ocultando por ruta dos puertas y bisagra. Conservar originales de PDF, captura, tiempo y JSON de verificación. Repetir control rápido de exportación.

## Cancelación y error

- Abrir Guardar PDF, esperar >158 s y **Cancelar**: debe informar «Exportación cancelada», sin aviso rojo ni archivo; una nueva exportación rápida debe funcionar.
- Cancelar un diálogo de SKP nuevo y comprobar que la guía queda en memoria y la ventana sigue abierta, sin atribuirle guardado a disco.
- Si se puede producir un error real de escritura usando una carpeta QA controlada, comprobar que el error se informa y permite reintentar; no usar carpetas del sistema ni modificar permisos de carpetas reales. Si el propio diálogo Windows rechaza la ruta, registrarlo como validación del selector, no como error de escritura del producto.
- Biblioteca JSON, SKM real, informe de materiales y carpeta de pedido usan el mismo envoltorio de espera. Verificar al menos abrir/esperar/cancelar >120 s para un selector adicional. No enviar pedidos comerciales por esta prueba.

## Regresiones

- Preferencias: elección A/B se mantiene al cerrar/reabrir paleta; conservar aceptación nativa 0.8.1, verificar autorización compartida desmarcada. Si se repite reinicio completo, registrar cuál configuración se probó. Puede usarse `verificar_preferencias_sketchup.rb` adaptado exclusivamente a comprobar 0.8.2, sin escrituras.
- Clic y lote Enter/Undo, materiales/UUID/UV, nombres izquierdo/derecho y atributos/OCL; snapshot antes/después/Undo. No contar como ejecutados todos los tests 0.8.0 si solo se hace este subconjunto.
- Guardar/cerrar/reabrir: guía exacta, cámaras/ocultas/notas persistentes; geometría y visibilidad del modelo intactas.
- A4 17 filas sin agrupar continúa bloqueado por legibilidad. No crear hojas extra ni reducir fuente para evitar el bloqueo.
- TXT conserva nueve columnas por lote compatible, sin envío ni aprobación de proveedor.

## Contrato técnico y evidencia a devolver

La petición comienza con 120 s de límite técnico. Justo antes de cada selector nativo, Ruby emite `{version:1,id,phase:'waiting_user'}`. JS conserva la solicitud sin reloj durante elección humana. Al volver, incluso por Cancelar o excepción, Ruby emite `phase:'working'`; JS habilita 120 s nuevos para procesamiento. Luego llega la respuesta final `result/error` original. IDs ajenos/fases desconocidas no finalizan solicitudes; acciones no incluidas no suspenden límites. No se guardan estas fases en preferencias ni SKP.

**Pendiente nativo:** confirmar que `execute_script` entrega estas notificaciones al HtmlDialog durante el selector modal de Windows. La nube lo verifica con reloj virtual y dobles, sin afirmar ejecución en SketchUp. Si la elección lenta falla, devolver consola, tiempos, capturas e identidad; no parchear el producto para obtener PASS.

La página sigue siendo A4 horizontal 297 × 210, una hoja por mueble con una/dos vistas. Persistencia `PlanosSanto/guide_v1`, preferencias `smart_paint_settings_v2` con `ps2:`/schema2. No se cambian contratos de nombres, pintado o catálogo.

Devolver informe con versión/hash, instalación íntegra antes/después, duración de cada espera, guardar/cancelar/control rápido, PDF y análisis de página/texto/render, snapshots y alcance exacto de regresiones. No declarar producción global: faltan aceptación comercial, veta industrial y proveedor, además de los casos nativos no ejecutados. Excluir SKM comerciales de una transferencia no autorizada. Si el ZIP excede 32 MiB, separar evidencias e informes en paquetes menores conservando manifiestos.
