# Entrega implementada — candidata0.8.3

La barra rápida añade siete accesos nativos a los servicios existentes. El encargado puede abrir la paleta compacta de placas/cantos/quitar, tomar un material con cuentagotas, revisar muebles y nombres, preparar pedidos o configurar guíasA4. Los accesos de revisión navegan; no renombrarán, guardarán ni exportarán automáticamente.

`quick_toolbar.rb` registra `UI::Command` y las dos barras una sola vez, con menús equivalentes para atajos. Respeta visibilidad guardada y delega estados/guardas al controlador. Catorce iconos24/32 originales se distribuyen localmente. El principal vuelve a la interfaz completa.

Pintura reutiliza SmartPaintTool/SmartPaint/NativePaint. El acceso elige modo y muestra paleta; aplicar sigue requiriendo Activar con ejes, material físico y alcance explícitos. Ni material recordado ni muestreo conceden autorización compartida. Cambio de modo/repetición del modo activo cancela cola. Favoritos y selección aprobada reciente se priorizan sin inventar materiales.

`MaterialSampleTool` hereda picking completo y resaltado de SmartPaintTool, pero utiliza contexto readonly y no tiene ruta de aplicación/cola. Lee frente/dorso, MaterialResolver y MaterialLibrary: detecta binding vigente/aprobado y UUID exacto; materiales heredados/sin vínculo/obsoletos se explican. Clic no altera el modelo, catálogo ni Undo. No se agregan dependencias de OpenCutList ni red.

Carga de ventana con secuencias/ack, preservación de borradores y AppObserver cancelan herramientas antiguas al cambiar modelo. Generación de herramienta impide reactivar callbacks viejos; regresar al original conserva nombres pendientes sin forzar un nuevo análisis. Modelo nuevo exige análisis explícito.

## Evidencia

Pruebas específicas automatizadas: barra11/149, cuentagotas12/79, controlador15/127; contrato TypeScript5; cinco recorridos browser nuevos y tres de Pintura Inteligente existente. Captura sintética de paleta440px y lámina de iconos originales incluidas. Verify completo, auditoría y SHA final se registran en `RESULTADO.json`, `validacion-toolbar-083.json` y log adjunto.

La auditoría contrasta inventario contra0.8.2, hashes, CRC, sintaxis y ausencia de SKP/SKM privados. Se conserva baseline y fuentes previas; no se descomprimió referencia sobre fuentes del producto. Los PDF de demostración se generan con17piezas sintéticas en una páginaA4 y no son ensayos nativos.

Fuentes no minificadas y tests incluidos en ZIP de fuentes. Reproducción: `npm ci`, Ruby3.2+/Node24/Python3/Chromium/Poppler disponibles, `npm run verify`; `PLANOS_VALIDATION_KIND=toolbar python3 scripts/package-paint-validation.py` crea el paquete una vez presentes los artefactos/estado verificados. No carga modelos de clientes.

## Pendientes reales

No se ejecutó SketchUp en nube. Instalar/usar barras, acoplamiento/visibilidad/atajos, estados nativos, picking/pintado/cuentagotas y Undo reales de0.8.3 requieren Codex local/Dot. Repetir también el selector PDF abierto158s, cuyo arreglo0.8.2 aún espera confirmación nativa. Instrucciones y verificadores de lectura: `VALIDACION_LOCAL_POSTERIOR.md`; sintaxis de runners comprobada, ejecución nativa pendiente.

Se preservan A4/vistas/ocultas/notas, nombres individuales al agrupar, catálogo/materiales/cantos, preferencias, TXT y guardarraíles; no se implementa optimizador, ejes inteligentes ni exportación automática futura. Continúan pendientes materiales/SKU comerciales, veta industrial, perfil sinOCL, benchmark y proveedor. No declarar producción global.

El ZIP de fuentes de este ciclo incluye `artifacts/PlanosSanto-0.5.3.rbz` exclusivamente como fixture congelado de `warm_update_test.rb`, para que la prueba de actualización sea reproducible en un checkout nuevo. No instalar esa versión. El instalador de entrega es únicamente `PlanosSanto-0.8.3-candidata.rbz`. No se incluyen SKP/SKM privados.

Reproducción desde ZIP de fuentes en carpeta limpia: compilación y296pruebasRubyoffline/2105aserciones PASS; RBZ reconstruido idéntico por SHA256. Dependencias locales reutilizadas, sin SketchUp. Log incluido.
