# Planos Santo — Loop independiente: nombres automáticos por mueble

Este paquete **solo agrega** a la extensión actual de SketchUp 2026 un panel para explorar los muebles, ver sus piezas y renombrarlas con el prefijo del mueble. **No desarrolla ni cambia** axonometrías, PDFs, flechas, cotas, importación SKP ni el editor web.

## Comportamiento esperado

- En la ventana de Planos Santo, el encargado elige un **grupo o componente padre** (mueble) y ve las piezas que contiene, incluso piezas anidadas.
- Puede **editar el nombre del mueble directamente en la extensión** y editar la abreviatura propuesta. De forma opcional, puede editar los nombres base de las piezas desde la tabla.
- La abreviatura se **calcula automáticamente** (p. ej. `Bajo Mesada` → `BM`; `M08 - Alacena Superior` → `M08`). Mientras edita, **la vista previa se actualiza sola**: no hace falta un botón «Renombrar» por pieza.
- Al pulsar **«Confirmar cambios» una sola vez**, se actualiza el nombre del padre y se escriben los nombres finales de las instancias hijas (`BM - Lateral izquierdo`, etc.). No se ejecutan escrituras durante la vista previa.
- Si cambia `Bajo Mesada` por `Alacena Superior`, los hijos pasan de `BM - ...` a `AS - ...` sin duplicar prefijos. Una segunda confirmación sin cambios no modifica nada.
- Si se cambia un grupo por fuera de la extensión, al reabrir/refrescar el panel se detecta el nombre nuevo y se ofrece actualizar la nomenclatura (siempre confirmando antes de escribir).
- Todo cambio debe poder deshacerse con Ctrl+Z y persistir tras guardar/reabrir el SKP.

## Instalar y ejecutar el loop en Codex

1. **Hacé una copia de seguridad o commit del proyecto.** No hay cambios en el SKP hasta que uses la función dentro de SketchUp, pero protegé también ese archivo antes de probarla.
2. Extraé el ZIP en la raíz del proyecto; debe quedar:

   ```text
   PlanosSanto/
     [extensión y archivos actuales]
     planos-santo-loop/                  <- loop anterior, intacto (si existe)
     planos-santo-loop-nombres/          <- ESTE paquete nuevo
       LOOP_PROMPT.md
       TAREAS.md
       ...
   ```

3. Requiere Codex CLI autenticado y repositorio Git existente. El script no instala Codex ni inicializa Git.
4. Ejecutá desde la raíz de PlanosSanto:

   **Windows / PowerShell**

   ```powershell
   .\planos-santo-loop-nombres\codex-loop.ps1 -MaxCycles 6
   ```

   **Linux / entorno `/workspace/PlanosSanto`**

   ```bash
   bash planos-santo-loop-nombres/codex-loop.sh 6
   ```

   Para fijar un modelo disponible agregá `-Model "..."` en Windows; en Linux pasalo como segundo argumento. El esfuerzo es `high` por defecto.

5. Si trabajás solo con el chat de Codex (sin terminal/CLI), abrí `LOOP_PROMPT.md` y pegá el contenido. Pedile que complete **únicamente `TAREAS.md` de esta carpeta**, en ciclos hasta la prueba manual.

## Qué hace el script

Ejecuta hasta seis ciclos (`codex exec`) dentro del repositorio, guarda un informe JSON/log por ciclo bajo `runs/`, y se detiene cuando Codex dice `needs_user`, `blocked`, `done` o se llega al límite. No hace commits, no publica, no instala la extensión, no ejecuta SketchUp en la computadora del encargado, y no usa acceso irrestricto al sistema.

Antes de aceptar `done`, exige que Codex haya realizado pruebas del agregado y que **vos** marques `Estado: APROBADO_POR_OPERADOR` en `VALIDACION_SKETCHUP.md` luego de probarlo en SketchUp 2026. Un informe de Codex por sí solo no significa que la función esté terminada.

## Archivos

- `LOOP_PROMPT.md`: prompt de cada iteración, alcance y reglas técnicas.
- `TAREAS.md`: secuencia verificable de implementación.
- `CRITERIOS.md`: criterios de aceptación y casos límite.
- `CASOS_DE_PRUEBA.md`: tabla de pruebas imprescindibles.
- `VALIDACION_SKETCHUP.md`: prueba manual que completa el encargado.
- `PROGRESO.md`: bitácora de decisiones y resultados que actualiza Codex.
- `codex-loop.ps1` y `codex-loop.sh`: scripts independientes del loop anterior.
- `codex-output.schema.json`: contrato del informe de cada ciclo.

## Seguridad

Nunca modificar el nombre de una definición de componente compartida para agregar un prefijo. Deben usarse nombres de **instancias**. Los padres que son componentes repetidos requieren un tratamiento especial: **no** actualizar silenciosamente los hijos de todas las instancias de la misma definición; advertir, bloquear la operación peligrosa y pedir consentimiento explícito para una solución segura comprobada. **Nunca** hacer `make_unique` silenciosamente ni romper referencias de anotaciones. No modificar geometría, dimensiones, materiales ni posiciones. Ejecutar cambios en una operación deshacible y abortar si algo falla.

Cuando Codex requiera tu prueba real en Windows, se detiene y deja las instrucciones. Es lo esperado.
