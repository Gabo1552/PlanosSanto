# Planos Santo — Loop de barra rápida (base 0.8.2)

Este paquete es un **encargo de desarrollo**, no una extensión actualizada. Incluye una copia **de referencia** de `PlanosSanto-0.8.2-candidata.rbz`, auditada estáticamente. No reemplaza los fuentes más recientes del Codex de la nube.

## Objetivo

Crear barras nativas de SketchUp similares en comodidad a OpenCutList, con accesos rápidos al pintado de placas/cantos, borrado de cantos, toma de material y acciones comunes del taller. Mantener la arquitectura del código de la nube; no reescribir los módulos actuales.

### Para Codex en la nube

1. Extraer esta carpeta al **proyecto fuente actual** de Planos Santo, sin reemplazar `src/`, `Plugins/` ni archivos más recientes con el RBZ de referencia.
2. Leer `PROMPT_CODEX.md`, `BACKLOG.md`, `CRITERIOS_ACEPTACION.md` y `CONTRATO_DE_SEGURIDAD.md`.
3. Desde el proyecto, pegá `INSTRUCCION_PARA_CLOUD.md` en la tarea de Codex, o ejecutá `bash planos-santo-loop-toolbar-082/codex-loop.sh 6` si **Codex CLI** está disponible allí.
4. Cuando termine, entregar **RBZ candidata + código fuente + pruebas + informe**. La instalación real la valida Dot/Codex local en SketchUp 2026.

### Para Windows local, si fuera necesario

Desde la raíz del proyecto: `powershell -ExecutionPolicy Bypass -File .\\planos-santo-loop-toolbar-082\\codex-loop.ps1 -MaxCycles 6` (requiere Codex CLI).

**Importante:** no hacer cambios a instalaciones de SketchUp desde el Codex de nube; no se debe considerar probado el pintado real o la barra nativa sin ejecutar SketchUp. La nube NO controla SketchUp local por defecto.

## Archivos

- `AUDITORIA_082.md`: qué se comprobó de la candidata 0.8.2.
- `PROMPT_CODEX.md`: alcance principal y requisitos implementables.
- `BACKLOG.md`: tareas acotadas y orden de ejecución.
- `CRITERIOS_ACEPTACION.md`: criterios verificables y ensayos.
- `CONTRATO_DE_SEGURIDAD.md`: restricciones para modelos, materiales y pedidos.
- `VALIDACION_LOCAL_DOT.md`: handoff para Dot/Codex local.
- `ESTADO.json`: estado del loop, mantenido por Codex.
- `scripts/verificar_referencia.py`: chequeo de integridad del RBZ de referencia.
- `codex-loop.sh`, `codex-loop.ps1`: wrappers opcionales con límite de ciclos.
