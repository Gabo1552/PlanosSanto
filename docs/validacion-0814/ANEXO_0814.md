# Planos Santo 0.8.14 — corrección del F0 de la validación nativa 0.8.13

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

La validación nativa de la 0.8.13 (PR #13) se detuvo en F0: un JPG válido de 1200×1200, PNG RGB, PNG con alfa y una textura de madera se rechazaban con «Elegí una imagen JPG o PNG válida…». La 0.8.14 es la 0.8.13 de `main` con esa causa corregida y dos hallazgos menores de la misma corrida.

| Hallazgo nativo 0.8.13 | Causa | Corrección | Prueba automática (dobles, no SketchUp) |
|---|---|---|---|
| **F0–F3: toda foto válida se rechaza** | En Windows, `ImageRep#load_file` lanza `ArgumentError: failed to load image` si Ruby todavía tiene el archivo abierto. `PhotoMaterial#temporary` (`photo_material.rb:76-80`) pasaba la copia temporal sin cerrarla. Además, el `rescue StandardError` escondía el error detrás del mensaje genérico | La copia se cierra antes de decodificar, como ya hacían la vista previa y las miniaturas del mismo archivo. Revisé el resto del producto (SKM, paquetes, activos de foto, PDF): todos cierran el archivo antes de entregárselo a SketchUp | El doble de `ImageRep` falla si el archivo está abierto en Ruby, igual que en Windows. Con el código anterior, las pruebas de foto fallan con el mismo mensaje que se vio en SketchUp; con el arreglo pasan 38/38. Hay una prueba nueva que fija ese contrato |
| Aviso de Ruby al cargar: `ALT_MASK` redefinida | Estaba definida dos veces en `smart_paint_tool.rb` (`:739` y `:751`) con el mismo valor | Queda una sola definición | `ruby -w` sin avisos y la suite del pincel |
| `V.cursores` → `ok: false` | El verificador esperaba 4 cursores y el producto trae 5 (se sumó el del cuentagotas) | El verificador espera los 5. Además espera la versión **0.8.14** | `verificador_0811_test.rb`, con prueba nueva |

## Cómo validarla

Repetir la corrida completa con `docs/validacion-0814/ENCARGO_SESION_LOCAL_0814.md`, **empezando por F0–F3**:
1. Con `V.foto(...)`, el JPG de 1200×1200, el PNG RGB, el PNG con alfa y la textura de madera tienen que dar `aceptada: true`.
2. **+ Material** con cada uno → Guardar y pintar → la pieza toma la textura real.
3. Los rechazos (JPG de 24 MP, `.txt` renombrado y JPG cortado) siguen rechazándose.

## Lo que falta en la PC para completar la guía

La corrida 0.8.13 no encontró estos insumos. Sin ellos, esos casos quedan PENDIENTES, no FAIL:
- los modelos A, B y BM17, el placard y una cocina de más de 40 piezas;
- el JPG original que falló en la 0.8.8;
- el caso Caju/petiribi en la biblioteca QA (V6).

Tienen que ser copias de modelos y materiales del taller, y no se suben al repositorio.
