# Planos Santo — Loop UX de taller 0.8.5

**Objetivo:** que las tareas comunes sean inmediatas desde SketchUp: **pintar**, **nombrar** y **armar guía A4**, conservando todos los controles de integridad ya implementados. Enfoque principal: menos clics, paneles compactos, atajos efectivos, iconografía propia y continuidad en el modelo.

## Qué contiene

- `referencias_privadas/PlanosSanto-0.8.5-candidata.rbz`: **referencia inmutable**, no debe sobreescribirse encima del código fuente más reciente.
- `referencias_privadas/*.png`: capturas aportadas por el usuario de OpenCutList, **referencias de interacción, no assets para copiar**.
- `AUDITORIA_085.md`: comparación real 0.8.4 → 0.8.5 y fricciones detectadas.
- `CONTRATO_PINTURA_RAPIDA.md`, `UX_NOMBRES.md`, `UX_PLANOS_A4.md`, `BARRA_E_ICONOS.md`: especificaciones concretas.
- `BACKLOG.md`: entregables por prioridad y dependencias.
- `ACEPTACION_Y_PRUEBAS.md`, `VALIDACION_DOT_LOCAL.md`: cómo demostrar que funciona.
- `ux/PROTOTIPO_FLUJOS.html`: **maqueta orientativa, no conectada a SketchUp**.
- `codex-loop.sh`, `codex-loop.ps1`: ejecutores acotados a seis ciclos por defecto.

## Arranque recomendado en Codex nube

1. Copiar la carpeta `planos-santo-loop-ux-085/` a la **raíz del proyecto que ya está desarrollando Codex**.
2. Leer `INSTRUCCION_CLOUD.md` y `PROMPT_CODEX.md`; comprobar que se trabaja sobre el código fuente MÁS RECIENTE (puede ser posterior a 0.8.5).
3. Ejecutar `python3 planos-santo-loop-ux-085/scripts/auditar_base.py` y conservar el reporte como evidencia **estática**.
4. Implementar por ciclos. Si está Codex CLI: `bash planos-santo-loop-ux-085/codex-loop.sh 6` (Linux) o `./planos-santo-loop-ux-085/codex-loop.ps1 -MaxCycles 6` (PowerShell).
5. Entregar RBZ candidata, changelog, pruebas y guía para Dot/Codex local. **No declarar validación nativa en nube**.

**No ejecutar `git reset --hard`, copiar la RBZ por encima de `src/`, sustituir fotos de usuarios por mockups, ni borrar funciones existentes.**

## Alcance de este loop

P0: **pintura en 1–2 acciones** desde SketchUp. P1: **renombrado en lista con resaltado inmediato**. P1: **editor A4 de una/dos vistas con selección visual**. P1: **barra e iconos coherentes**. P0 paralelo: regresiones de exportación TXT y PDF.

## Coordinación

Codex nube es dueño del desarrollo; Dot/Codex local valida en SketchUp 2026 sobre copias. No editar en paralelo dos versiones de la misma extensión sin un intercambio controlado (commit/PR o paquete de parches).
