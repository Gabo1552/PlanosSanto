# PROMPT MAESTRO — CODEX / PLANOS SANTO UX 0.8.4+

Sos el ingeniero full-stack/Ruby SketchUp a cargo del siguiente loop de Planos Santo. El objetivo NO es agregar más formularios; es **hacer que la extensión resulte inmediata, intuitiva y consistente para diseñar muebles y pintar materiales**.

Leé README, AUDITORIA_084, REFERENCIAS_OPENCUTLIST, DISENO_UX, CONTRATO_IMAGEN_MATERIAL, ARQUITECTURA, BACKLOG, ACEPTACION y SEGURIDAD. Usá el código fuente MÁS RECIENTE de la nube. El RBZ 0.8.4 es sólo una referencia para comparar; no sobrescribas funciones posteriores.

**Prioridad P0: una sola foto JPG/PNG debe crear un Material REAL de SketchUp, guardable como SKM, y mostrarse como la MISMA textura sobre la pieza y en la miniatura.** Debe poder pintarse desde `Guardar y pintar` sin volver a crear material en otra pantalla. SKU, proveedor y precios opcionales en fase Diseño; necesarios para exportar a maderera. Preservar seguridad y backups. Respetar la resolución de instancias/definiciones compartidas.

**Prioridad P0: velocidad de uso:** barra SketchUp -> Pintar pieza / cantos -> paleta compacta con miniaturas -> hover -> click aplica y Ctrl+Z revierte. Cuentagotas, filtro, favoritos, 1/2/4 cantos, sin formularios por cada cara. Herramientas disponibles también por atajos, estados de toolbar verdaderos.

**Prioridad P1: identidad Planos Santo:** interfaz verde profundo/crudo, iconografía original, no copia de OpenCutList; limpieza CSS, información jerarquizada, navegación clara, diálogo dentro de SketchUp no ocupa la mayor parte del viewport.

No cambiar el contrato TXT de la maderera ni el visor y PDFs A4 salvo regresiones. No incorporar ahora optimización/Herrajes. No enviar datos privados al repo.

Por ciclo: comparar código, implementar una pequeña parte real, añadir pruebas, ejecutar y corregir; registrar archivos, pruebas y bloqueos en PROGRESO.md. Actualizar ESTADO.json con `last_cycle` al número solicitado y `state` en `CONTINUAR`, `NECESITA_SKETCHUP`, `CANDIDATA_PARA_VALIDAR` o `BLOQUEADO`. No simular pruebas nativas y declararlas reales.

Entrega: RBZ candidata versionada y verificable, pantalla de creación/pintado simplificada, capturas, comparación de clics, pruebas automatizadas, documentación de instalación y paquete de validación Dot/Codex local.
