# Progreso del loop

Fecha / versión base: Planos Santo 0.8.2 candidata (referencia estática; verificar versión del repositorio real).

## Iteraciones

<!-- Codex: añadir al final de cada ciclo un bloque con fecha, etapa, commits/archivos, pruebas, fallos y pendientes. -->

## Estado actual

PENDIENTE DE INICIO. No hay pruebas de integración nativas de la barra.

## C0 — análisis y preservación (20/10/2026)

Fuentes actuales 0.8.2; referencia adjunta idéntica al RBZ de nube SHA256 5dd7f9c9fca8216bbd4ec3f6cc6916c4ebf10dc6ed95dcf892d0978e4bd28282. Extraído sin sobrescribir archivos; no se instala el RBZ de referencia. Proyecto Git sin commits y archivos fuente sin seguimiento: se conserva el respaldo de fuentes/pruebas 0.8.2 en artifacts/PlanosSanto-0.8.2-fuentes-pruebas.zip y RBZ anterior, evitando crear un commit masivo ajeno al trabajo.

Arquitectura revisada: OfflineController + puente HtmlDialog, SmartPaintPalette/SmartPaintTool/SmartPaint/NativePaint existentes, catálogo/biblioteca global y Workshop/SupplierOrder. Desarrollo paralelo acotado: módulo de barra e iconos, cuentagotas de lectura, UI/paleta; integración/controlador y empaquetado coordinados en raíz. No se modifica la implementación de pintura ni los contratos A4/TXT.

Pruebas iniciales: CRC del paquete adjunto correcto y referencia byte a byte idéntica a baseline. Pendiente implementación y nuevas pruebas; no SketchUp en nube.

## C1 — barra e integración nativa

Módulo `quick_toolbar.rb`: dos barras independientes, siete comandos equivalentes en menú/atajos, iconos originales 24/32, registro idempotente y respeto de visibilidad oculta. El botón principal recupera la interfaz completa. Controller integra readiness `ui_loading/ui_ready/quick_action_ack` y secuencias para no perder ni duplicar acciones mientras carga la ventana; cada acceso conserva ID/estado y no exporta automáticamente.

Estados nativos delegados a herramienta real y bloqueos de contexto/ediciones. Pulsar modo activo cancela; cambiar modo cancela cola con aviso. Los modos de pintura abren su paleta compacta para revisión, sin conceder permiso ni iniciar escritura. Activar pintura conserva confirmación explícita de material/cara/ejes/alcance; cuentagotas sí se puede activar directamente porque es solo lectura.

Módulo nuevo `material_sample_tool.rb` reutiliza picking/rutas/overlay de SmartPaintTool y validación de MaterialLibrary; no incorpora otro motor de pintura. Binding vigente aprobado seleccionable; heredado/sin vínculo/inválido se informa sin inferencias ni mutaciones. Frente/dorso explícitos, nunca adivina entre ambos. Sin Undo en muestreo. Pruebas dirigidas iniciales: barra11/149, cuentagotas12/79 y controlador inicial11/108 PASS con dobles. Sin SketchUp real.

Cancelación y reapertura se protegen con generación de herramienta; callbacks viejos no reactivan estados ni aplican después de cambiar de modelo. AppObserver cancela colas y preserva campos pendientes; vuelta al modelo original restaura el contexto sin descartar nombres. Abrir documento nuevo exige analizar incluso si el wrapper nativo del modelo fuese reutilizado. Estas ramas adicionales se verifican en el siguiente ciclo.

Build/bootstrap/manifiesto extendidos con dos módulos y catorce iconos, sin quitar payloads anteriores. Inventario de candidata:41 archivos y3 directorios,40 hashes de payload. Se ajustaron los dobles de instalación para los nuevos comandos/API. No se usa la referencia RBZ como fuente.

## C2 — integración UI, pruebas y corrección

UI/App/SmartPaintPalette reutilizados, WorkshopPanel admite abrir la pestaña Pedido sin exportar; propaga dirty para bloquear también eventos recibidos antes de que Ruby procese la notificación. Confirmación de intención y secuencias idempotentes, selección exacta UUID y permiso compartido reiniciado al cambiar modo. Recuperación de scan al volver al modelo original conserva nombres pendientes. Lectura de biblioteca tras restaurar contexto no activa ni autoriza pintura.

Pruebas dirigidas finales: barra11/149, cuentagotas12/79, controlador15/127, contrato TypeScript5. Browser5nuevas+3existentes PASS; captura440px inspeccionada como sintética. Primera verificación integral:310Ruby/2175aserciones,138TypeScript y16web PASS;55de56offline PASS. Falló protección de arranque con Ruby antiguo porque ui_loading se enviaba antes de diagnostic. Se corrigió la implementación para comprobar runtime primero y después emitir ui_loading/scan; no se relajó la prueba. Log inicial conservado como artifacts/verify-toolbar-083-inicial.log. Verify completo repetido en curso. No es fallo atribuido al harness ni ejecución nativa.

## Ciclo3 — verificación final y entrega

Segundo `npm run verify` exit0: **310Ruby/2175aserciones en27suites,138TypeScript,16web,56offline**. La protección de arranque de Ruby anterior pasó con la prueba original sin cambios. Auditoría RBZ:40hashes,CRC/inventario y21Ruby/JS de sintaxis PASS.41archivos+3directorios;16payloadsnuevos(2Ruby+14iconos),sineliminar anteriores.11servicios nativos existentes de pintura/materiales/catálogo/nombres/TXT/guía/diagnóstico byte a byte idénticos a082.

Candidata083 1673823bytes, SHA256 `7d2d6c47fdc70245ede3c7c96d42dc7e943b7c55081082605428b99a97181b54`. Baseline082 intacta. TresPDFDEMOsintéticos A4 de17piezas conservados. Captura de paleta y lámina de iconos originales incluidas. Fuentes de entrega incluyen fixture053 solo para warm_update_test; no instalar esa versión. Log inicialfallido ycorrección de orden conservados.

Pendiente: instalación ygestos/estados reales enSketchUp2026 porCodexlocal/Dot,conpruebas deUndo,perfiles,materiales yPDF158s. No SketchUp en nube ni aprobación deproducción. Estado CANDIDATA_PARA_VALIDAR.

### Reproducibilidad de fuentes entregadas

ZIP de fuentes extraído en carpeta limpia, dependencias locales existentes reutilizadas. Build y24suitesRubyoffline (296pruebas/2105aserciones) exit0; RBZ recompilado **byte a byte idéntico** a la candidata. Fixture053 de warm_update_test incluido expresamente para este ensayo, sin SKP/SKM privados. El primer intento del comando no inició porque se indicó un directorio aún no creado; se creó secuencialmente y se ejecutó correctamente. No era un fallo de producto. Log de reproducción incluido.
