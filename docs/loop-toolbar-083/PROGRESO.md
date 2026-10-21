# Loop 0.8.3 — barra rápida nativa

Seguimiento pedido por el usuario: `planos-santo-loop-toolbar-082/PROGRESO.md` y `ESTADO.json`. Referencia de entrada 0.8.2 conservada; fuentes actuales ampliadas sin reemplazarlas por el RBZ adjunto.

## Ciclo 0

ZIP extraído sin sobrescribir. Baseline0.8.2 coincide exactamente con referencia SHA256 `5dd7f9c9fca8216bbd4ec3f6cc6916c4ebf10dc6ed95dcf892d0978e4bd28282`; respaldo fuente/pruebas `PlanosSanto-0.8.2-fuentes-pruebas.zip` SHA256 `5804d698fad3ac65845735138136ec35db1c16cf852d96d3c66298611a1e8d04`. Repositorio sin commits y sin seguimiento; se preservan archivos, sin crear commit masivo para simular un respaldo Git.

## Ciclo 1

Barra native API `UI::Toolbar/UI::Command`, siete comandos con menú/atajos e iconos originales. Respeta ocultamiento/posición nativos e idempotencia en recarga. Reutiliza una ventana existente; secuencias y confirmación `ui_loading/ui_ready/quick_action_ack` evitan perder/duplicar navegación al cargar/reabrir.

Cuentagotas de lectura reutiliza picking y overlays de SmartPaintTool, validaciones de MaterialLibrary y binding propio. Ningún motor de pintado nuevo, ninguna migración/aprobación implícita, ningún atributo OCL escrito. Solo cara física frente/dorso; ambos exige elegir. Configuración de pintura continúa requiriendo confirmación y alcance explícitos.

## Ciclo 2

Paleta compacta con modos y materiales aprobados/favoritos, selección vigente preferida, selección exacta por UUID muestreado. Cuestiones observadas durante revisión y corregidas antes del verify final: retorno al modelo original debía restaurar la UI sin perder nombres pendientes; callbacks de herramienta vieja se invalidan mediante generación; apertura de documento nuevo se invalida incluso si un wrapper se reutiliza; navegación no descarta borradores de biblioteca/pedido. La lectura de catálogo al volver de modelo no activa pintura ni concede permisos.

Pruebas dirigidas: barra11/149, cuentagotas12/79, controlador15/127, contrato de intents5 TypeScript; ocho pruebas browser nuevas/existentes PASS. Captura de paleta sintética 440px inspeccionada, textos y modos legibles; panel desplazable vertical cuando ajustes están desplegados. No es captura nativa de SketchUp.

Verificación integral y auditoría en curso. Pendiente toda instalación/inspección visual real en SketchUp2026.

## Corrección de regresión de arranque

La primera verificación completa pasó310Ruby/2175,138TypeScript,16web y55/56offline, pero encontró `ui_loading` antes de comprobar compatibilidad con Ruby antiguo (prueba de actualización sin reinicio). Se corrigió el orden del producto: ensureRuntime/diagnostic primero; ui_loading y scan solo después. La prueba original se conserva sin relajación y se repite verify completo. Log inicial guardado. No se presentó esta corrida como aprobada.

## Ciclo3 — verificación final y entrega

Segundo `npm run verify` exit0: **310Ruby/2175aserciones en27suites,138TypeScript,16web,56offline**. La protección de arranque de Ruby anterior pasó con la prueba original sin cambios. Auditoría RBZ:40hashes,CRC/inventario y21Ruby/JS de sintaxis PASS.41archivos+3directorios;16payloadsnuevos(2Ruby+14iconos),sineliminar anteriores.11servicios nativos existentes de pintura/materiales/catálogo/nombres/TXT/guía/diagnóstico byte a byte idénticos a082.

Candidata083 1673823bytes, SHA256 `7d2d6c47fdc70245ede3c7c96d42dc7e943b7c55081082605428b99a97181b54`. Baseline082 intacta. TresPDFDEMOsintéticos A4 de17piezas conservados. Captura de paleta y lámina de iconos originales incluidas. Fuentes de entrega incluyen fixture053 solo para warm_update_test; no instalar esa versión. Log inicialfallido ycorrección de orden conservados.

Pendiente: instalación ygestos/estados reales enSketchUp2026 porCodexlocal/Dot,conpruebas deUndo,perfiles,materiales yPDF158s. No SketchUp en nube ni aprobación deproducción. Estado CANDIDATA_PARA_VALIDAR.

### Reproducibilidad de fuentes entregadas

ZIP de fuentes extraído en carpeta limpia, dependencias locales existentes reutilizadas. Build y24suitesRubyoffline (296pruebas/2105aserciones) exit0; RBZ recompilado **byte a byte idéntico** a la candidata. Fixture053 de warm_update_test incluido expresamente para este ensayo, sin SKP/SKM privados. El primer intento del comando no inició porque se indicó un directorio aún no creado; se creó secuencialmente y se ejecutó correctamente. No era un fallo de producto. Log de reproducción incluido.
