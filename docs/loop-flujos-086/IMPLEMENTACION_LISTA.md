# Flujos rápidos — candidata0.8.6

Continúa las fuentes0.8.5. Referencia adjunta y baseline conservadas sin sobrescribir; no se reemplazaron motores de geometría, materiales, nombres, pedidos ni PDF. No se ejecutó SketchUp en la nube.

## Pintar sin ventana general

Un único OfflineController conserva sesión y guardas; ahora administra dos HtmlDialog independientes: `ui/index.html` para gestión y `ui/palette.html` para pintar. El botón Pintar abre solamente la paleta≈400×760. Un material recordado válido se resuelve contra el catálogo, archivo/vínculo nativo y UUID del modelo actual; la Tool puede quedar activa antes de que termine de cargar HTML. No reutiliza permisos compartidos ni importa a otro modelo silenciosamente.

La paleta tiene su propio bundle React y no importa App ni el editor A4. Valida versiónRuby/JS antes del handshake. Elegir tarjeta o cambiar submodo seguro en alcance único cancela la cola y arma la herramienta con un solo gesto; alcanceall exige revisar nuevamente. Las opciones seguras de lado/ejes/submodo se conservan y validan. Cara/Pieza, cantos1/2/4, quitar, cuentagotas, fotos, favoritos, recientes y teclado reutilizan los servicios anteriores. Una placa de restauración explícita se resuelve como placa, no como canto.

RPC/progreso responden a la ventana solicitante, incluidos callbacks anidados de estado mientras espera un picker humano. Una sola sesión evita motores duplicados. Cerrar una ventana no descarta la otra; cambio de modelo y colas pendientes cancelan de forma segura. Si la paleta modifica el modelo, el editor se marca desactualizado y bloquea guardado/exportación hasta reanalizar sin borrar borradores.

## Nombres y A4

Selección de mueble→Muebles/Planos resuelve contenedor y genera revisión readonly cuando corresponde; sin selección queda el selector. Filas resaltan la ruta correcta. Edición inline con Tab/Enter/Escape, prefijos y agrupación preservados. Aplicar renombrado solicita un previewreadonly con originales/propuestos/alcances; exclusiones que se puedan representar y una confirmación usan el guardado atómico existente de nombres+guía. Cambios externos/revisión obsoleta bloquean. No escribe ComponentDefinition#name.

Guías con controles1/2vistas, ocultar por clic únicamente en interior y restaurar por chip/ruta. Cámara/zoom/reset afectan representación, no geometría. La nueva previsualización es el PDF generado por el mismo exportador: tabla, cotas, IDs y notas completos. No es una segunda composición aproximada. RenderPoppler comparado píxel a píxel para una/dosvistas. El soporte del iframePDF en CEF requiere prueba local; Abrir/Descargar son alternativas que también deben comprobarse en SketchUp.

La barra principal tiene cinco acciones e iconos originales24/32: Pintar, Muebles, Maderera, Planos y Materiales. Se conservan los nueve comandos en registro/menús y accesos secundarios; una sola barra con visibilidad persistente e idempotencia. Las funciones avanzadas de gestión anteriores permanecen accesibles de forma explícita.

## Correcciones encontradas

- El selector inicial debía armar con tarjeta, no pedir un segundo Activar.
- Faltaba conservar opciones seguras recordadas y resolver como placa la restauración de cantos.
- Separación vertical entre dibujo/nombre en escritorio amplio: controles compactados sin reducir objetivos ni fuente.
- Cabecera de revisión de nombres heredaba texto blanco/10px: color de contraste y12px explícitos.
- La traza del drag web mostró la nota fuera del viewport: los nuevos controles compartidos de A4 empujaban el dibujo hacia abajo y los eventos caían sobre HTML. Se movieron los ajustes de vistas debajo del dibujo también en web, sin cambiar la prueba. Además se previene selección de texto SVG en el gesto y se conserva foco/captura. Coordenadas, ancla y geometría permanecen iguales. La primera hipótesis sobre selección nativa no resolvía por sí sola este fallo; logs y traza conservados.
- Dobles históricos carecían de select_tool y generaban errores artificiosos; se agregó registro headless, sin afirmar render nativo. CSP bloquea fetch(blob:) de manera intencional; las pruebas descargan el PDF real sin relajar connect-src.

## Evidencia y pendientes

RESULTADO.json/verify-flujos-086.log contienen resultados finales. Comparativas con UI/Ruby0.8.5 congelados, mismo mueble y materiales sintéticos. Las métricas de dos decisiones son de integración browser/API doble, no de un operario ni ventanas Windows reales. Se incluyen PDF/render, iconos, fuentes y pruebas reproducibles. Prototipo y capturas privadas nunca son evidencia de producto ni se incluyen como assets de instalación.

Fotos/JPG/PNG/SKM de0.8.5, nombres, cantos, catálogo, TXT nueve columnas, A4 y anotaciones conservados por regresiones. Datos privados fuera de Git/instalador/entrega. No hay optimizador, presupuesto, herrajes ni envío comercial nuevos.

Pendientes: instalación/barra/modeless/DPI nativos, texto/UV/SKM/Undo/reapertura reales, soportePDFCEF, picker158s, perfil sinOCL, modelos grandes y aceptación comercial de SKU/veta/proveedor. Usar VALIDACION_LOCAL_POSTERIOR.md con Dot/Codex local. No producción aprobada.
