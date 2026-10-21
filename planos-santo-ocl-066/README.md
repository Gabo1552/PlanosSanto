# Planos Santo + OpenCutList: ciclo de integración sobre la versión 0.6.6

**Paquete de trabajo para Codex, no es una nueva extensión instalada.**

## Para empezar sin perder lo que ya funciona

1. Hacé copia del repositorio/carpeta original de Planos Santo y conservá la extensión 0.6.6 instalada y el OpenCutList original. No reemplaces ninguno sin probar.
2. Extraé **esta carpeta `planos-santo-ocl-066/` completa** en la raíz del proyecto existente de Codex (por ejemplo `/workspace/PlanosSanto/planos-santo-ocl-066/`). Si usás Codex Cloud, subí este ZIP al mismo entorno del código o pegá `LOOP_PROMPT.md` en Codex.
3. Codex primero debe auditar las fuentes reales del repositorio y el `.rbz` adjunto. Nunca asumir que el ZIP del `.rbz` equivale al código fuente del proyecto.
4. En la terminal del proyecto, ejecutá:

```bash
bash planos-santo-ocl-066/codex-loop.sh --check
bash planos-santo-ocl-066/codex-loop.sh 6
```

Windows/PowerShell, desde la raíz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\planos-santo-ocl-066\codex-loop.ps1 -Check
powershell -ExecutionPolicy Bypass -File .\planos-santo-ocl-066\codex-loop.ps1 -MaxCycles 6
```

Necesitás Git, Codex CLI autenticado y Python 3 para los chequeos. No hace falta instalar SketchUp en el servidor de Codex; se suspende el loop cuando necesite una prueba en la PC del taller.

Si en tu entorno Codex no permite ejecutar scripts, adjuntá el paquete y pedile expresamente que siga `LOOP_PROMPT.md`, `TAREAS.md` y `CRITERIOS_ACEPTACION.md` por iteraciones, actualizando `PROGRESO.md`.

## Qué contiene

- `baseline/PlanosSanto-0.6.6.rbz`: copia inalterada suministrada por el usuario.
- `INFORME_BASE_066.md`: auditoría del contenido comprobado en ese RBZ.
- `LOOP_PROMPT.md` / `TAREAS.md`: alcance acotado y orden de las iteraciones.
- `FORMATO_MADERERA.md`, `fixtures/` y `scripts/validar_pedido_txt.py`: contrato del TXT.
- `INTEGRACION_OPENCUTLIST.md`: estrategia de compatibilidad/derivación sin alterar la instalación original.
- `referencias_privadas/`: los 9 modelos, vocabulario preliminar, catálogo candidato y extractor SketchUp del paquete anterior. **Datos confidenciales, excluidos de Git y de toda publicación.**
- `VALIDACION_WINDOWS.md`: checklist manual de medidas, cantos, agrupaciones y pedidos.
- `codex-loop.sh` / `codex-loop.ps1`: ciclos Codex con logs, reportes estructurados y límites.

## Qué NO promete

- El contenido de un `.rbz` no demuestra que funcione en SketchUp 2026: falta prueba presencial.
- Leer colores en las caras no valida automáticamente el lado de canto 2D ni la medida de corte.
- Los nombres extraídos de los SKP no son recuentos físicos ni etiquetas ya validadas.
- Una validación sintáctica de TXT no equivale a que la maderera lo acepte.
- Mantener optimización y presupuestos requiere una integración real con el motor existente de OpenCutList, no una interfaz simulada.

## Continuidad

Cada nueva ejecución lee `PROGRESO.md`, `TAREAS.md` y `runs/latest.json`; no reinicia el proyecto. Máximo 12 ciclos por ejecución. La prueba manual final en SketchUp y el proveedor es obligatoria, y se registra fuera de las pruebas automáticas.
