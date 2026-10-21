# Texto para copiar en Codex de la nube

Continuá Planos Santo desde el último código fuente disponible. Adjunto el paquete `PlanosSanto_0.8.5_Loop_UX_Flujos_Rapidos.zip`.

1. Extraé `planos-santo-loop-ux-085/` en la raíz del repo. **La RBZ 0.8.5 es referencia, no la reemplaces por encima del trabajo posterior.**
2. Leé `PROMPT_CODEX.md`, `AUDITORIA_085.md`, `CONTRATO_PINTURA_RAPIDA.md`, `UX_NOMBRES.md`, `UX_PLANOS_A4.md`, `BARRA_E_ICONOS.md`, `BACKLOG.md`, `ACEPTACION_Y_PRUEBAS.md`.
3. Implementá un cambio profundo de UX, no solo CSS: el botón Pintar debe activar herramienta real y abrir como máximo una paleta compacta, sin abrir el panel general de 1440 × 920. Material activo, cambio con un clic, clic sobre pieza/canto, estado visible. Mantener Undo, advertencias por instancias compartidas y salvaguardas de maderera.
4. Reducí Nombres a una lista editable con resaltado, y Planos a configuración visual A4 de 1/2 vistas, cámara, ocultamiento por pieza y notas con flechas.
5. Reorganizá la barra en cinco entradas principales, iconos originales de Planos Santo y comandos secundarios accesibles. No copiar iconografía de OpenCutList.
6. Ejecutá pruebas regresivas, documentá clics/evidencias, actualizá `PROGRESO.md` y entregá RBZ candidata con instructivo para Dot/Codex local. No afirmes prueba nativa de SketchUp desde la nube.

Si tenés Codex CLI, ejecutá desde la raíz `bash planos-santo-loop-ux-085/codex-loop.sh 6`; si no, seguí el proceso por ciclos en Codex sin CLI.
