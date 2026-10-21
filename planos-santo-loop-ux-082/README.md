# Planos Santo — LOOP UI/UX + materiales SKM (referencia 0.8.2)

## Propósito
Rediseñar profundamente la experiencia de Planos Santo dentro de SketchUp 2026 para hacerla **tan directa como OpenCutList**, sin copiar sus logos ni gráficos. Mejorar diseño visual, arquitectura de pantallas, iconos, barra rápida, paleta de pintado, biblioteca y recorridos del encargado. **No rehacer motores ni perder funcionalidades ya implementadas.**

## Material adjunto y resultado de la auditoría
- `referencias_privadas/PlanosSanto-0.8.2-candidata.rbz`: SOLO referencia; partir del código más reciente de la nube, si es posterior.
- `referencias_privadas/image(...).png` (3): referencias visuales entregadas por el usuario.
- `referencias_privadas/OpenCutList.zip`: **35 SKM reales**, 12 con nombres compatibles con canto (una con error tipográfico «Catno»). Son datos privados del usuario; no subirlos a Git público.
- `inventario_materiales.json` y `.csv`: inventario extraído sin rutas locales privadas; tipos y medidas sugeridos son candidatos, no datos verificados.

## Instrucciones para Codex
1. Incorporá esta carpeta a la raíz del repo fuente más reciente de Planos Santo (sin sobrescribir código ni cambiar de rama sin revisar).
2. Leé `INSTRUCCION_CLOUD.md`, `PROMPT_CODEX.md`, `AUDITORIA_REAL.md`, `DISENO_UX.md`, `MAPA_ICONOS.md`, `CATALOGO_SKM.md`, `BACKLOG.md`, `CRITERIOS.md` y `SEGURIDAD.md`.
3. Primero hacé un diagnóstico de la UI existente y un plan breve, después implementá por ciclos. Actualizá `PROGRESO.md` y `ESTADO.json` después de cada ciclo.
4. Si Codex CLI está instalado en el entorno, ejecutar **desde la raíz del repo**: `bash planos-santo-loop-ux-082/codex-loop.sh 6` (o el equivalente `.ps1`). Si no, pegar `INSTRUCCION_CLOUD.md` en Codex.
5. Al finalizar entregar candidata RBZ, comparativa visual antes/después, capturas de flujos, tests y `VALIDACION_DOT_LOCAL.md` cumplimentado solo con lo realmente realizado.

## Alcance y restricciones
**Incluye**: navegación principal, patrones visuales, sistema de iconos, botones de toolbar accionables, paleta compacta Smart Paint, catálogo con carga masiva `.skm`/previsualización, mejor organización de Muebles/Maderera/Planos A4, estados y accesibilidad.
**Excluye**: reescribir geometría, algoritmo de cantos, cálculo de precios, motor de optimización, rediseño estructural del PDF, publicar o enviar pedidos reales. Solo arreglos mínimos de integración derivados del rediseño con pruebas.

**Importante**: El RBZ y los SKM aquí son privados de referencia y pruebas. No incorporar archivos de usuario al RBZ comercial final por defecto. Ni la validación de sintaxis ni un mock visual equivalen a una prueba en SketchUp.
