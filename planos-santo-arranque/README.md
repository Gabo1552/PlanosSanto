# Planos Santo — Loop de arranque de OpenCutList personalizado

Este paquete **no instala por sí solo una extensión terminada**. Contiene el loop operativo para que Codex trabaje sobre el repositorio EXISTENTE de Planos Santo; incluye referencias privadas de nueve SKP aportados por el taller, datos de metadatos, pruebas del formato del proveedor y un extractor de diagnóstico Ruby (no probado en SketchUp 2026).

## Objetivo
Una sola extensión en SketchUp 2026 (Windows) que conserve las capacidades de OpenCutList —corte, optimización, materiales, cantos, etiquetas y presupuestos—, simplifique la interfaz para el taller e integre los planos y anotaciones de Planos Santo. No agregar herrajes en este MVP (solo diseño de integración futura).

Flujo real: **diseñar sin nombrar piezas → pintar materiales y cantos → agrupar por mueble → identificar y renombrar desde la extensión → exportar TXT tabulado por lote para maderera → optimizar y presupuestar → generar PDF A3 por mueble con notas y flechas**.

## Inicio rápido (Codex con terminal)

1. Hacé una copia o una rama de resguardo de `/workspace/PlanosSanto` y confirmá que es un repositorio Git. Si tu directorio es distinto, usá el directorio de tu proyecto.
2. Descomprimí el ZIP en la **raíz del proyecto**, de manera que exista `/workspace/PlanosSanto/planos-santo-arranque/`.
3. Los `.skp` están bajo `planos-santo-arranque/referencias_privadas/modelos`. **No subir a un repositorio público ni incluirlos en un paquete RBZ, CI, logs o telemetría**. El script los excluye en `.git/info/exclude` local.
4. Comprobá el paquete con `python3 planos-santo-arranque/scripts/verificar_corpus.py` y `python3 -m unittest discover -s planos-santo-arranque/tests -v`.
5. Si estás en un entorno Codex Linux, ejecutá:

```bash
cd /workspace/PlanosSanto
bash planos-santo-arranque/codex-loop.sh 6
```

En tu PC Windows, desde la carpeta raíz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\planos-santo-arranque\codex-loop.ps1 -MaxCycles 6
```

El programa `codex` debe estar instalado y autenticado. Requiere también Git y Python 3. El modelo se deja sin fijar (usa el predeterminado en tu Codex); el esfuerzo se configura en `high`. Opcional: `CODEX_MODEL=...` o `-Model ...`. Codex usa sandbox `workspace-write`, no acceso irrestricto. Soporta como máximo 12 ciclos por invocación.

## Si usás Codex mediante interfaz (sin terminal propia)

Descomprimí el ZIP dentro del repositorio y pedile: **«Leé `planos-santo-arranque/LOOP_PROMPT.md` y `TAREAS.md`. Ejecutá una iteración por vez, actualizá `PROGRESO.md`, pasá las pruebas y continuá hasta que necesites validación real en SketchUp 2026. No publiques los SKP.»**

## Alcance de este primer arranque

**Prioridad inmediata:** inspeccionar el proyecto existente (incluida RBZ 0.3, editor de PDF web como respaldo), probar un adaptador de datos geométricos con SketchUp Ruby API, construir el administrador de muebles y el renombrado asistido, consolidar el catálogo de materiales/cantos y preparar el exportador del proveedor con las nueve columnas. Luego conectar funciones originales de OpenCutList, optimización, presupuestos y PDF dentro de SketchUp sin reescribir motores que ya funcionan.

El primer loop puede detenerse para pedir dos intervenciones humanas: **(1) diagnóstico Ruby real de uno de los modelos en SketchUp**, y **(2) un TXT pequeño importado y aceptado por la maderera**. No simular ninguna de esas validaciones.

## Seguridad / compatibilidad

- Trabajar sobre una copia/rama; no sobrescribir OpenCutList original ni su configuración del usuario.
- Una distribución derivada de OpenCutList debe conservar avisos de autoría y cumplir GPLv3. Fuente: https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension
- Antes de decidir si hacer fork integral o un módulo Planos Santo sobre su API/datos, inspeccionar la arquitectura real y validar qué se puede mantener al actualizar OpenCutList.
- El catálogo extraído es **candidato**, no un catálogo definitivo ni una lista de precios. No fusionar sustratos ni nombres parecidos de manera automática.
- Los nombres de definiciones SKP no son cantidades físicas, ni prueban orientación o cantos pintados.
- El diagnóstico Ruby es **solo lectura y todavía no probado dentro de SketchUp**. Abrir una copia del SKP y ejecutarlo guiado desde la Consola Ruby.

## Archivos

- `LOOP_PROMPT.md`: instrucciones completas de cada ciclo para Codex.
- `TAREAS.md`: fases priorizadas y criterios claros para avanzar.
- `CRITERIOS_ACEPTACION.md`: requisitos verificables.
- `FORMATO_MADERERA.md`: contrato TXT y decisiones pendientes de prueba.
- `VALIDACION_SKETCHUP.md`: checklist manual de Windows/SketchUp y maderera.
- `PROGRESO.md`: bitácora inicial, a actualizar por Codex.
- `INICIO_EN_CODEX.md`: texto para iniciar en la interfaz de Codex.
- `DECISIONES_PENDIENTES.md`: decisiones que debe confirmar el encargado.
- `codex-loop.sh` / `.ps1`: loop finito con informes por ciclo, validadores y paradas.
- `scripts/verificar_corpus.py` / `validar_pedido_txt.py`: chequeos independientes.
- `tests/`: pruebas automatizadas del validador del formato de la maderera.
- `referencias_privadas/`: nueve SKP y corpus de metadatos/hashes (nunca incorporar al RBZ).

## Validación y estados

`working`: más trabajo sin bloqueo; `needs_user`: espera SketchUp/maderera; `blocked`: un bloqueo técnico; `done`: Codex terminó su parte automática, pero la **aprobación humana final** requiere seguir `VALIDACION_SKETCHUP.md` y generar en tu PC `~/.planos-santo/aprobacion-sketchup2026.txt` con el texto `APROBADO PLANOS SANTO 2026` tras las pruebas reales. Codex no debe crear ese archivo.

**Importante:** un fork puede alterar materiales/configuraciones existentes. No reemplazar la instalación del OpenCutList oficial hasta que los ensayos en copias funcionen.
