# Definición de terminado (únicamente el módulo de nombres)

## Flujo que tiene que quedar operativo

En SketchUp 2026, abrir un SKP → abrir Planos Santo → elegir grupo/mueble → ver **todas** las piezas y sus nombres actuales → cambiar el nombre del mueble y/o abreviatura → ver instantáneamente los nombres propuestos → pulsar **Confirmar cambios** una vez → todos los nombres de instancias afectados aparecen actualizados en la extensión y SketchUp → guardar/cerrar/reabrir y conservarlos → cambiar otra vez el nombre del mueble y actualizar solo el prefijo → Ctrl+Z revierte toda la operación.

### Ejemplo 1: grupo común

Padre: `Bajo Mesada` → propuesta `BM`; piezas: `Lateral izquierdo`, `Lateral derecho`, `Base`. Tras confirmar:

- `BM - Lateral izquierdo`
- `BM - Lateral derecho`
- `BM - Base`

El grupo mismo se llama `Bajo Mesada`, no `BM - Bajo Mesada`.

### Ejemplo 2: cambiar el nombre del grupo

Se edita desde la extensión: `Bajo Mesada` → `Alacena Superior` (abreviatura automática `AS`). Resultado `AS - Lateral izquierdo` y demás. Jamás `AS - BM - Lateral izquierdo`.

### Ejemplo 3: código de módulo

Padre: `M08 - Alacena Superior` → propone `M08` (editable). Niño `Piso` → `M08 - Piso`.

### Ejemplo 4: confirmar dos veces

Repetir con los mismos datos no genera cambios ni otra transacción; nombres y metadatos permanecen constantes.

### Ejemplo 5: componentes reutilizados

Si el mismo tipo de componente de pieza se usa en dos grupos distintos mediante instancias distintas, el prefijo de un grupo no afecta al otro. **Si el padre es una instancia de una definición de mueble que se reutiliza**, el sistema no renombra silenciosamente los hijos compartidos: avisa y bloquea el guardado inseguro hasta que se defina una solución explícita.

### Ejemplo 6: datos existentes

`Lateral - Blanco`, `BM - Lateral` (preexistente, no generado por Planos Santo), nombres vacíos, grupos anidados, tildes y ñ deben manejarse sin borrar texto ajeno. No renombrar etiquetas/metadatos ajenos sin permiso.

## Pruebas mínimas de aceptación

1. El panel incluye vista de todos los niveles y localiza de forma inequívoca cada instancia/ocurrencia.
2. Las propuestas se recalculan automáticamente y la edición del grupo es posible desde la extensión.
3. Vista previa no cambia el SKP; cancelar no deja cambios.
4. Una confirmación aplica todos los cambios de ese mueble; un Ctrl+Z revierte la operación completa.
5. Guardar/reabrir respeta nombres gestionados y nombres base.
6. Idempotencia al confirmar dos veces; reemplazo correcto cuando cambia nombre/abreviatura.
7. No modifica `ComponentDefinition#name` para aplicar prefijos; no modifica dimensiones, transformaciones, materiales, caras ni aristas.
8. Maneja o bloquea explícitamente componentes padres compartidos, entidades bloqueadas/inválidas y conflictos de edición.
9. Pruebas automatizadas propias pasan y no se rompen las pruebas existentes; ruta hacia `.rbz` documentada.
10. El encargado validó **en SketchUp 2026 real**, no solo por mocks. `VALIDACION_SKETCHUP.md` queda aprobado explícitamente por el usuario.

NO se considera "terminado" solo porque el programa compila, el panel aparece en screenshots o el código Ruby se ejecuta con un simulador.
