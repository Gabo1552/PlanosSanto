# Hito 6 · Rendimiento (ARQ-01 etapa S, PINTURA-09 / ARQ-04)

> **Advertencia: todos los números son SIMULADOS.** Salen de `scripts/bench-analisis.rb`, que corre en Linux con Ruby 3.3 y con los dobles de la API (`sketchup/test/fake_api.rb` y los de `sketchup_offline/test`). **No son tiempos de SketchUp.** Sirven para comparar dos versiones del código Ruby entre sí. Los milisegundos reales hay que medirlos en SketchUp 2026 (ver "Qué falta validar").

## Cómo reproducirlo

```
LANG=C.UTF-8 ruby scripts/bench-analisis.rb --runs 7
# antes: exporter de la rama base (b613762)
git show b613762:sketchup/planos_santo/exporter.rb > /tmp/exporter-antes.rb
LANG=C.UTF-8 ruby scripts/bench-analisis.rb --runs 7 --exporter /tmp/exporter-antes.rb
```

Opciones: `--runs N`, `--warmup W`, `--seed S` (por defecto 42), `--select K` (muebles en generate, por defecto 10) y `--json`.

**Modelo sintético (determinista):**
- 75 muebles con 20 placas cada uno, 1.500 placas en total.
- 338 definiciones: compartidas por todo el proyecto, compartidas por tipo de mueble, únicas y un subgrupo Cajón.
- Hay placas que heredan el material del mueble, otras con material en la instancia y otras con material en las caras.
- 20 herrajes curvos: bisagras de 516 triángulos y tiradores de 756, hechos con cilindros de 64 segmentos y material OCL `type = 5`.

## Resultados (mediana de 7 corridas, ms)

| Medición | Antes | Después | Cambio |
|---|---:|---:|---:|
| scan (`NativeSession#scan`) | 625 | 97 | −84 % |
| generate (10 muebles, incluye un segundo `tree`) | 701 | 164 | −77 % |
| Triángulos en el árbol | 30.720 (12.720 de herrajes) | 18.000 | −41 % |
| Piezas con malla | 1.520 (20 herrajes) | 1.500 | sin herrajes |
| Respuesta de scan cruda, sin enviar | 8,95 MB | 5,75 MB | −36 % |
| Respuesta de scan enviada (`light_scan`) | 1,28 MB | 1,28 MB | igual: las mallas ya se diferían |
| Respuesta de generate enviada | 1,22 MB | 0,77 MB | −37 % |
| `ModelWatch.fingerprint` | 21 | 22 | ruido |
| `NameManager#inventory(geometry: true)` | 188 | 184 | no usa el exporter |
| `NameManager#inventory(geometry: false)` | 11 | 8 | ruido |
| `SmartPaint#plan(light: true)`, pieza única | 15 | 10 | — |
| **Clic inmediato, pieza única** (`apply_immediate`) | 14 | 14 | — |
| **Clic inmediato, pieza compartida** (150 apariciones) | 51 | 48 | — |

El ruido entre corridas en esta máquina es de ±20–40 %. Las diferencias de menos de unos 5 ms no significan nada.

### Después de integrar `claude/ux-extras-0811` (pincel avanzado, Hitos 3, 5 y 7)

Volví a medir con el merge de `ux-extras-0811`, que incluye PINTURA-15 (varias caras por lado), la profundidad del pick, el pedido (Hito 3) y la A4 (Hito 5). Agregué al benchmark el clic de canto inmediato, porque ahora arma el marco local (`NativePaint#boundary_frame`) en cada clic.

| Medición (mediana, ms) | Antes del merge | Después del merge |
|---|---:|---:|
| scan | 97 | 126–130 |
| generate (10 muebles) | 164 | 172–217 |
| `ModelWatch.fingerprint` | 22 | 20 |
| `inventory(geometry: false)` | 8 | 9–15 |
| Clic inmediato, pieza única | 14 | 14 |
| Clic inmediato, pieza compartida (150) | 48 | 42–46 |
| Clic inmediato, canto (1 canto, une caras partidas) | — | 15 |
| Clic inmediato, canto (4 cantos) | — | 14 |

- Ningún número se acerca a los objetivos: scan menor a 10 s y clic menor a 150 ms.
- El scan y el generate suben unos 30 ms. Está dentro del ruido y coincide con lo que la integración agregó a la guía (`guide_store.rb`). Hay que vigilarlo, pero no exige trabajo.
- La profundidad del pick (PINTURA-11) vive en `SmartPaintTool`, del lado de la vista: el doble no la mide. Va a la validación en SketchUp.
- El pedido (Hito 3) y la A4 (Hito 5) no pasan por scan, generate ni el clic. Solo consumen el documento que ya devolvió generate.

## Qué cambió (ARQ-01, etapa S)

Todo está en `sketchup/planos_santo/exporter.rb`.

1. **Caché de malla por definición.** La malla local depende solo de las caras de la definición y del material que heredan. La clave es `(definición, material heredado)` y se identifica por `entityID`; los dobles, que no lo tienen, usan `object_id`. Cada aparición reutiliza la misma malla. El tope de 200.000 vértices o triángulos se sigue contando por aparición. Los errores de una definición, como un triángulo degenerado, se repiten en cada aparición con el mismo mensaje.
2. **Caché de la forma local por malla.** Bounds, cierre de aristas y volumen se calculan una vez por malla. Las medidas siguen dependiendo de la transformación, y los errores de la transformación (escala cero, sesgo) se evalúan primero, igual que antes.
3. **Herrajes fuera del teselado.** Un nodo es herraje cuando el material efectivo de todas sus caras propias (el de la cara o el heredado) es de tipo herraje en OpenCutList (`ladb_opencutlist/type = 5`). Es el mismo criterio de OCL. Sus caras no se teselan, queda sin malla (fuera del despiece) y lleva el aviso «Herraje…». Los hijos siempre se recorren y se deciden por sus propias caras: una placa pintada dentro de un contenedor de herraje no se pierde.

**Equivalencia byte a byte:**
- `sketchup_offline/test/exporter_cache_test.rb` compara `tree` y `document` con y sin caché (`Exporter.new(model, cache: false)`), sobre el fixture de contrato y sobre un modelo con definiciones compartidas bajo materiales heredados distintos, errores repetidos, escala no uniforme y transformación sesgada.
- Aparte, sin quedar en la suite, comparé la salida contra el exporter anterior (`b613762`) sobre los mismos fixtures sin herrajes: **idéntica byte a byte**.
- La única diferencia buscada es la exclusión de herrajes.

La etapa L (árbol liviano con malla a demanda) **no se justifica**: el scan simulado bajó a menos de 100 ms y la respuesta enviada ya difiere las mallas.

## PINTURA-09 / ARQ-04: índice de rutas

**Decisión: no se implementa.** El plan lo condiciona a que la medición lo pida, y no lo pide:
- El clic inmediato no usa el exporter. Recorre el modelo con `NameManager#inventory(geometry: false)`, que tarda unos 8 ms con 1.670 nodos, y el clic completo tarda unos 14 ms (unos 48 ms con 150 apariciones compartidas).
- El objetivo del Hito 6 es menos de 150 ms por clic. Un índice invalidado por `ModelWatch` ahorraría como mucho los ~8 ms del recorrido, y agregaría el riesgo que el plan marca: un caché inválido que pinte la cara equivocada.
- Se puede retomar si la medición en SketchUp real da más de unos 100 ms por clic con 1.500 piezas. El log de tiempos por clic (`timed!` en la herramienta) ya registra ese dato.

### Plan concreto, si la medición real lo pide

Estimado en medio día con pruebas. No se puede acotar a 30 minutos sin arriesgar el bug que el plan marca: un caché inválido que pinte la cara equivocada.

1. **Archivos.**
   - `sketchup_offline/path_index.rb` (nuevo): guarda el resultado de `NameManager#inventory(geometry: false)` con un número de generación.
   - `sketchup_offline/offline.rb`: es dueño del índice. Lo invalida en `model_watch_changed` con los tipos `model` y `materials`, y también **después de cada operación propia**. Esto es clave: `without_model_watch` suprime las notas de ModelWatch para las transacciones de PS, así que esas no llegan al índice.
   - `sketchup_offline/smart_paint.rb`: `plan(light: true)` recibe el snapshot del índice en vez de recorrer el modelo.
   - `smart_paint_tool.rb` no cambia.
2. **Salvaguardas.**
   - Antes de usar el índice, verificar `valid?` y `persistent_id` de la ruta pedida y de sus padres. Si algo falla, descartar el índice y recorrer de nuevo.
   - La verificación final por `persistent_id` del plan se conserva.
   - El índice nunca sirve para `geometry: true` ni para los planes con token, que necesitan la firma.
3. **Riesgos.**
   - Undo o redo de una operación propia: llega como `onTransactionUndo`, que no está suprimido, así que invalida.
   - Cambios que no disparan observers, como `make_unique` hecho desde otra extensión: los cubre la verificación por ruta.
   - Ahorro máximo: los ~9 ms del recorrido, sobre un clic de ~14 ms simulado.
4. **Pruebas.**
   - `sketchup_offline/test/path_index_test.rb`: hit sin recorrer (con un contador de `entities_of`); invalidación por cada tipo de ModelWatch; invalidación tras una operación propia suprimida; caída al recorrido si la entidad quedó inválida o cambió de padre; equivalencia del plan con y sin índice.
   - Un caso nuevo en `scripts/bench-analisis.rb` con el índice caliente.

## Supuestos y límites del doble

- En SketchUp, `face.mesh`, `material` y los recorridos cruzan de Ruby a C++. Es esperable que los tiempos reales sean varias veces mayores; la proporción antes/después debería mantenerse, porque la caché evita exactamente esas llamadas.
- Las placas son cajas de 6 caras con 2 triángulos por cara. No hay aristas reales, texturas, UV, `definition.instances` ni `make_unique`.
- No se mide la herramienta de UI (pick, hover, `invalidate`), el troceo de `reply` en el diálogo, los observers después del commit ni la biblioteca de materiales con fotos.
- `inventory(geometry: true)` (unos 185 ms) es el siguiente punto caro, pero no está en el camino del clic: lo usan los planes con token y el renombrado.

## Qué falta validar en SketchUp 2026

1. Con un modelo real de 1.500 piezas, que el scan tarde menos de 10 s y el clic de pintura menos de 150 ms, leyendo el log de diagnóstico.
2. Que una bisagra de Warehouse con material OCL de herraje no aparezca en el despiece y que el resto de las piezas no cambie.
3. Que `entityID` de definiciones y materiales sea estable durante un `tree` (la API lo garantiza dentro de la sesión).
