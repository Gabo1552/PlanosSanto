# Planos Santo 0.8.13 — anexo a la guía 0.8.11 y al anexo 0.8.12

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

La 0.8.13 es la 0.8.12 de `main`, más lo que se rescató de la rama `noche-hito2-pincel` (descartada por duplicar el pincel avanzado) y algunas correcciones.

| Cambio | Detalle | Prueba automática (dobles, no SketchUp) |
|---|---|---|
| Línea base de latencia del pincel (PINTURA-09) | `scripts/profile-hito2-pincel.rb`, sobre 500 piezas sintéticas (125 módulos × 4 puertas). En este banco el clic p95 da unos 37 ms. La §6 de `docs/hito2-pincel/VALIDACION_SKETCHUP.md` explica cómo medirlo en SketchUp | El script corre con los dobles de la suite |
| Tecla del cuentagotas con el pincel detenido | Antes, al cambiar Alt/Mayús desde la paleta con el pincel detenido, la paleta volvía a la tecla anterior, porque el último estado de la herramienta seguía con la vieja. Ahora ese estado se actualiza junto con la preferencia | `pincel_avanzado_controller_test` (falla sin el arreglo) |
| Empaquetado del Hito 1 | `scripts/package-hito1-fixes.py` sólo incluye archivos versionados en git y excluye `ux/`, `backups/`, `state/` y `referencia/`, para no filtrar datos privados del taller | Sintaxis verificada |
| Paquetes históricos de validación | `scripts/package-paint-validation.py` apunta a las rutas nuevas de `docs/historico/loops/` | Sintaxis verificada |
| Verificador | Espera la versión **0.8.13** | `verificador_0811_test.rb` |

## Cómo validarla

Igual que la 0.8.12 (`docs/validacion-0812/ANEXO_0812.md`), instalando `dist/PlanosSanto-0.8.13-candidata.rbz`. Se agrega:

1. **PINTURA-09:** medir la latencia real según la §6 de `docs/hito2-pincel/VALIDACION_SKETCHUP.md` y compararla con la línea base sintética.
2. **Cuentagotas:** con el pincel **detenido**, cambiar en la paleta la tecla del cuentagotas a Mayús; la paleta tiene que seguir mostrando Mayús. Al iniciar el pincel, Mayús + clic toma el material.

**Pendiente, sin cambios en esta versión:** revisar si «Revisar lo que falta» recalcula ejes o geometría por instancia en cada hover, en una obra grande. Con los dobles no se ve un costo alto (hover de 46 ms en el banco de rendimiento); se confirma con la medición nativa.
