# Planos Santo 0.8.10 — mejoras sobre la 0.8.9 (Hito 1)

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada. El Hito 2 no se inició.

La 0.8.10 es la 0.8.9 de `main` (commit `7d599a1`), sin cambios, más cinco mejoras de la rama paralela y de la auditoría OCL que la 0.8.9 no tenía. Las correcciones de foto (V1/V15), colisión de SKM (V6) y sincronización de paletas son **las de la 0.8.9**.

## Qué agrega

| # | Mejora | Detalle | Prueba automática (dobles, no SketchUp) |
|---|---|---|---|
| 1 | **Clic sin huella geométrica** (V19) | La 0.8.9 bajó de 3 inventarios a 1. Ese único inventario igual leía la malla de todas las caras y calculaba un SHA-256 de todo el modelo. En la 0.8.10 el clic inmediato (`apply_immediate`) usa `inventory(geometry: false)`: mismo índice, ocurrencias, bloqueos, aislamiento y validación de material, sin la firma. Esa firma solo sirve para comparar una vista previa con su confirmación posterior, y ese flujo con token **la conserva**. | `paint_ready_test`: un clic hace exactamente un inventario liviano; la vista previa con token hace uno completo y rechaza un modelo cambiado |
| 2 | **Clic cerca del borde del canto** | Si PickHelper devuelve primero la **arista**, se usa una cara de esa misma arista: misma pieza, nunca la vecina. En placa sirve cualquiera. En canto se toma la cara claramente más angosta (menos de la mitad del área). Si es ambiguo (esquina entre dos cantos o arista abierta con una sola cara), no pinta. | `paint_ready_test`: borde → cara angosta de la misma pieza aunque haya otra detrás; esquina → nada; arista con una sola cara ancha → nada; un clic sobre la cara sigue igual |
| 3 | **Una sola paleta** | Abrir Pintar en la ventana principal cierra la paleta separada y detiene su pincel. La paleta se desacopla antes de cerrarse, para que un cierre diferido de Windows no detenga el pincel nuevo ni borre el borrador de foto de la ventana principal. Se suma a la sincronización de la 0.8.9, que no cambia. | `quick_install_controller_test`: cierre de la paleta separada; un pedido tardío de la paleta cerrada no cierra la principal; un cierre diferido no mata el pincel nuevo |
| 4 | **Verificador 0.8.10** | `verificar_0810_sketchup.rb` = el verificador 0.8.9 más: `tiempo_clic` con `clic` (camino real) y `vistaPrevia` (plan completo) por separado; `foto(ruta)`, que registra lo que responde `ImageRep` (`loadReturn`, `bitsPerPixel`, `rowPadding`, `size`, `dataBytes`) y si el producto acepta la foto, sin crear nada; y `colisiones`, que lista las fichas cuyo SKM trae un nombre ya existente en el modelo. Todo de solo lectura. | Sintaxis verificada; corre solo dentro de SketchUp |
| 5 | **Repasar piezas compartidas ya pintadas** (auditoría OCL F-PINT-A) | Si todas las caras ya tienen el material, el clic no aísla la pieza ni crea un Ctrl+Z vacío. Antes, una puerta compartida se separaba en una definición nueva idéntica. | `paint_ready_test`: dos puertas compartidas ya pintadas → `changed:false`, misma definición, sin Ctrl+Z |

Banco sintético de 1.560 piezas, plan del clic sin aplicar:

| Versión | Tiempo por plan |
|---|---|
| 0.8.8 | 377–856 ms |
| Inventario único de la 0.8.9 | ~100–130 ms en este banco (192 → 57 ms en el banco de Codex) |
| 0.8.10 | 29–63 ms |

**No son tiempos de SketchUp.**

## Correcciones de la validación multiagente (antes de Dot)

Cinco agentes recorrieron los casos de Dot sobre el código 0.8.10 y contrastaron cada llamada con la documentación oficial de la API (gema `sketchup-api-stubs` 0.7.11). Resultado:

| # | Defecto | Corrección | Prueba |
|---|---|---|---|
| 6 | **Bloqueante: `ImageRep#resize` no existe** (API 2018–2026). Toda foto de más de 256 px fallaba al armar la vista previa, tanto en la 0.8.9 como en la 0.8.10, y bloqueaba V1, V15, V2, V3 y V12. Las pruebas pasaban porque el doble inventaba ese método. | La miniatura se arma por submuestreo de los píxeles ya validados (`data`), conservando el orden nativo BGR(A) y rellenando cada fila a 4 bytes, y se crea con `set_data`. La verificación de píxeles corre siempre, sea cual sea el retorno de `load_file`. | El doble de `ImageRep` ahora implementa solo la API documentada. `photo_material_test` incluye un contrato que falla si el código llama a un método de `ImageRep` fuera de la API, la vista previa de 1200×1200 → 256×256 y de 1000×300 → 256×77, y una prueba de orden de bytes y relleno. Con el código anterior: `NoMethodError resize`. |
| 7 | PALETAS-1: una relectura de fondo de la ventana principal cerraba la paleta separada y su pincel. | Solo la carga inicial de Pintar en la ventana principal (`claim: true`) cierra la otra paleta. El cierre está protegido si el diálogo ya no existe. | `quick_install_controller_test` |
| 8 | R1: en la esquina entre dos cantos de largo muy distinto se pintaba el canto corto. | La regla de la cara angosta se aplica solo si la otra cara es de placa (al menos la mitad del área mayor de la pieza). Se usa `min_by`/`max_by`. | `paint_ready_test` |
| 9 | V6: un `nil` de `abort_operation` cortaba toda colisión como si fuera fatal, y un reintento fallido podía dejar el material del taller con el nombre temporal. | Solo `false` o una excepción se toman como rollback fallido; con `nil` decide la comparación de estados. Ante cualquier fallo del reintento se restaura explícitamente el nombre original. | `material_library_test` |

Detalle completo en `docs/hito1-correcciones-0810/VALIDACION_MULTIAGENTE_0810.md`.

## Cómo validarla

Seguir completa `docs/hito1-correcciones-089/VALIDACION_LOCAL.md` (la guía de la 0.8.9), instalando `dist/PlanosSanto-0.8.10-candidata.rbz`. Agregar:

```ruby
load 'C:/ruta/docs/hito1-correcciones-0810/verificar_0810_sketchup.rb'
PlanosSantoValidacion0810.integridad                    # version 0.8.10, passed: true
PlanosSantoValidacion0810.foto('C:/ruta/jpg-de-V1.jpg')  # antes de V1: aceptada: true + valores reales de ImageRep
PlanosSantoValidacion0810.colisiones                     # antes de V6
PlanosSantoValidacion0810.tiempo_clic('<catalogId listo>') # V19: medianas de clic y vistaPrevia
```

1. **V19:** registrar las dos medianas. Objetivo orientativo: `clic` < 300 ms en M-L. Después, diez clics reales con escritura, como pide la guía 0.8.9.
2. **Borde del canto:** en modo canto, clic justo en el borde inferior de una cara estrecha. Debe pintar esa cara, sin tocar la pieza vecina. Clic en una arista de esquina: no pinta nada.
3. **Repasar:** en dos puertas iguales ya pintadas con el mismo material, clic sobre una. No cambia nada, no aparece un Ctrl+Z nuevo y en la ventana Componentes no se crea una definición nueva.
4. **Una paleta:** abrir Pintar desde la barra (paleta separada) y después Pintar en la ventana principal. La separada se cierra. Activar el pincel en la principal y pintar: sigue activo.

## Riesgos y supuestos

- Se asume que no recalcular la firma en el clic es seguro: plan y confirmación ocurren en la misma llamada sincrónica de Ruby, igual que en la 0.8.8 y la 0.8.9.
- El umbral de cara angosta (la mitad del área) puede declarar ambiguas piezas casi cuadradas o muy finas. En ese caso prefiere no pintar a pintar mal.
- Las correcciones de foto, SKM y sincronización son las de la 0.8.9: se validan con la guía 0.8.9.
