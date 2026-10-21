# Validación nativa pendiente — Codex local y Dot

Esta es una candidata 0.8.3. Las pruebas automatizadas de nube usan dobles de la API y Chromium; no prueban barras, docking, picking o pintado dentro de SketchUp2026. No usar el runner histórico que carga diagnóstico0.6.9 ni parchear clases del producto para obtener PASS.

## Instalación e identidad

1. Conservar instalación/candidata anterior y originales. Trabajar exclusivamente sobre copias QA. Catálogo de ensayo aislado; no aprobar materiales/SKU comerciales por estas pruebas.
2. Cerrar TODAS las ventanas de SketchUp. Instalar `PlanosSanto-0.8.3-candidata.rbz` desde Administrador de extensiones. Cerrar/abrir SketchUp nuevamente para descartar clases de versiones anteriores en memoria. El ZIP de entrega no es un instalador.
3. Comprobar el SHA256 del RBZ contra `.sha256` y versión0.8.3 en UI/consola. Cargar `verificar_instalacion_sketchup.rb` y ejecutar `PlanosSantoValidacion083.integridad`:40 hashes de payload y ocho comandos, sin ejecutar herramientas ni modificar el modelo. Repetir al finalizar. Registrar SketchUp/Ruby/OCL y rutas; no contar la mera sintaxis como prueba nativa.

## Barras, menús y estados

- En `Ver > Barras de herramientas`, habilitar por separado **Planos Santo** y **Planos Santo - Herramientas**. Capturar las siete acciones con iconos distintos: placa, canto, quitar, cuentagotas, muebles/nombres, maderera, guíasA4.
- Acoplar/mover, ocultar una y dejar otra visible; cerrar/reabrir SketchUp y verificar que la oculta no reaparezca ni se pierda la posición. Repetir habilitación. Probar reload del módulo de registro solo si el validador conoce la API; no cargar fuentes de otro paquete ni alterar Plugins.
- Verificar entradas equivalentes `Extensiones > Planos Santo`; asignar y probar un atajo de SketchUp a una acción.
- Estados: pintura activa debe marcar su modo, otro modo no; Escape/desactivar/repetir icono activo elimina la marca y cancela cola. Guía/biblioteca/pedido pendientes deben deshabilitar accesos y explicar motivo en estado. Material no elegido abre paleta para elegir, sin pintado.
- Pulsar acceso inmediatamente al abrir la ventana, varias veces: una sola ventana/paleta, último intento conservado, sin duplicación cuando `ui_ready` entrega la intención pendiente. Principal abre interfaz completa conservando estado.

## Pintado mediante barra

1. Usar copia BM17 y mueble QA simple con cuatro cantos conocidos. Pulsar **Pintar placa**: paleta compacta440×760, lista aprobada/favoritos y última selección compatible. No debe escribir ni iniciar pintura sin material/cara/ejes/alcance revisados y Activar.
2. Elegir material nativo real aprobado o SKM de ensayo. Mostrar preview de ruta/cara y afectación compartida. Probar un clic, Shift+clic y lote Enter: un Undo por gesto/lote; ningún Undo de hover/cancelación/no-op.
3. Cambiar a **Pintar canto** cancela selección anterior con aviso, sin autorizar `all` automáticamente. Aplicar canto solo sobre cara estrecha validada; revisar lectura de cada lado2D. **Quitar canto** debe restaurar placa comprobada o pedir asociación explícita, sin limpiar todo el componente.
4. En compartidos/anidados/rotados/espejados: verificar rutas antes de aceptar todas o hacer única. Comparar geometría, dimensiones, nombres, materiales/UV y atributos/OCL antes/después/Undo. No escribir atributos OCL.
5. Escape, cambio de herramienta, cambio de modelo y cierre de paleta durante cola: ninguna aplicación pendiente. Volver al modelo anterior no debe reactivar una herramienta vieja ni ejecutar Enter pendiente.

## Cuentagotas

- Pulsar **Tomar material**: activa solo lectura, resaltado y ruta. Frente/dorso explícitos; configuración Ambos debe pedir elegir un lado, sin adivinar. No cambia medidas, geometría, materiales, nombres, atributos, catálogo ni la pila Undo.
- Tomar una cara con binding propio vigente/aprobado: selecciona en paleta el UUID exacto (probar dos materiales nativos vinculados al mismo ítem de catálogo). Pasar al modo placa/canto requiere Activar y renovar autorización compartida; muestrear no pinta.
- Material sin binding, binding obsoleto, UUID duplicado, heredado o solo datos OCL: muestra motivo y no inventa/instala/aprueba material. Probar dorso distinto, componente anidado y transformado, cara vacía y contexto de edición abierto.
- Cambiar catálogo después del hover y antes del clic: no seleccionar asociación que dejó de ser válida.

## Navegación y persistencia

- **Muebles y nombres** usa selección compatible para enfocar mueble/pieza ya generada; si no existe guía, muestra selector y pide Generar. Ver dibujo y modificar nombres con controles habituales. Ningún renombre automático desde icono.
- **Maderera** abre la pestaña real de pedido. No guardar/exportar hasta revisión y confirmación; preservar preflight, lotes, nueve columnas TXT y controles de medidas/cantos/veta. No enviar pedido comercial por este ensayo.
- **Guías A4** abre editor; no crea PDF por el mero clic. Probar una/dos vistas, rotación/zoom, ocultación interior por ruta, IDs, cotas movibles y notas/flechas; conservar17unidades y límites de legibilidad. No crear páginas extra automáticamente.
- Con nombre pendiente, cambiar de modelo y volver al original: edición se conserva y vuelve a poder guardarse. En el modelo distinto no se puede Guardar/Exportar la guía anterior. Comprobar borradores de catálogo/pedido no descartados por acceso rápido.
- Guardar/cerrar/reabrir SKP: guía, nombres, cámaras, ocultas y notas idénticas, preferencias sin permisos/UUID persistidos. Usar `verificar_preferencias_sketchup.rb`083 de solo lectura con esperado realmente elegido en UI; no afirmar otro reinicio si solo se cerró paleta.
- Repetir en perfil QA sin OpenCutList, sin desinstalarlo del perfil habitual. Compatibilidad con OCL debe ser lectura, no requisito para pintura propia.

## Regresión pendiente heredada de0.8.2: diálogo lento PDF

Con BM17 agrupado8filas y nota/flecha: Exportar PDF A4, dejar selector Windows real abierto **al menos158segundos**, Guardar ruta válida nueva. Debe aparecer «PDF A4 guardado» sin aviso rojo y generarse una página297×210mm legible. Repetir Cancelar después de158s y luego exportación rápida. Repetir una/dos vistas. No usar Ruby.sleep, que bloquearía el hilo en lugar de simular elección humana. No se recibió todavía validación nativa del arreglo082;083 lo conserva y necesita esa prueba.

## Contratos y API de ensayo

- Barra: `PlanosSanto::QuickToolbar.registry` (dos barras y `commands` con main/sheet/edge/remove_edge/sample/furniture/order/guides). `OfflineController#quick_validation` refleja estado real y `quick_block_reason` solo consulta; no usar llamadas directas como sustituto de gestos UI.
- UI: `ui_loading` suspende entrega, `ui_ready` retorna intención pendiente, `quick_action_ack` confirma secuencia. Eventos `planos-santo-quick-action` y `planos-santo-smart-paint`; no persisten autorizaciones.
- Muestreo: `smart_sample_start` front/back, herramienta `MaterialSampleTool`; evento sample con ruta, lado, estado/selectable y UUID exacto únicamente si válido. No hay mutaciones en servicio de muestreo.
- Persistencia sin migraciones nuevas: `PlanosSanto/guide_v1` y preferencias `smart_paint_settings_v2` con `ps2:`/schema2. PDF A4 horizontal297×210, una hoja por mueble. TXT nueve columnas por lote compatible.

Devolver informe por caso PASS/FAIL/PENDIENTE, hashes de instalación antes/después, capturas reales de barras/estados/paleta, snapshots y Undo, PDFs y render/tamaño/páginas/textos, JSON de diagnósticos y tiempos del selector lento. Señalar qué gestos fueron manuales y qué configuraciones se sembraron por fixture. No contar controles anteriores como ejecutados otra vez. Conservar originales y errores del harness diferenciados. Para transferir ZIP a nube, separar en paquetes menores de32MiB si hace falta.

No aprobación global de producción hasta estas pruebas; siguen pendientes aceptación comercial de materiales/SKU, veta industrial, benchmark de modelos grandes y proveedor.
