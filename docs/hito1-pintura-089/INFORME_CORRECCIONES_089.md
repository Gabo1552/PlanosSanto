# Planos Santo 0.8.9 — correcciones de la validación nativa 0.8.8 (Hito 1)

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. El Hito 1 no está aceptado y el Hito 2 no se inició.
**Origen:** informe nativo de Dot, SketchUp 26.2.243 / Ruby 3.2.2 / Windows, sobre `main` af434dd. Copia saneada en `docs/hito1-pintura-088/validacion-nativa/`.
**Resultado de 0.8.8:** 10 PASS, 4 FAIL (V1, V6, V15, V19) y 5 PENDIENTE (V2, V3, V7, V12, V18).

## 1. Qué se corrigió

| Prioridad | Falla nativa | Causa confirmada | Corrección 0.8.9 | Regresión automática |
|---|---|---|---|---|
| P1 | **V1/V15**: un JPG válido de 1200×1200 se rechaza en «+ Material» y en «Asignar foto». | `ImageRep#load_file` devuelve `nil` en SketchUp 2026 tras decodificar bien la imagen. `photo_material.rb` exigía `== true`. | Solo `false` (o una excepción) se toma como rechazo. La prueba de decodificación pasa a ser la imagen decodificada: dimensiones dentro de los límites, iguales al encabezado, y `ImageRep#data` con bytes para todos los píxeles (8, 24 o 32 bits). Se mantienen la validación de encabezados, los límites de 12 MiB, 16 MP y 16.384 px, el rechazo de archivos corruptos y el rechazo de enlaces simbólicos. | `photo_material_test`: retorno `nil` y `true`, JPG 1200×1200 creado y pintado, decodificación vacía, texto con extensión `.jpg`, JPG truncado, `.gif`, 16 MP exactos, 16.385 px y 4001×4000. El doble de `ImageRep` ahora imita a SketchUp 2026 y devuelve `nil`. **Con el código 0.8.8 fallan 25 pruebas**: reproduce V1. |
| P1 | **V6**: Caju 18mm figura como «Se instala al elegir» pero falla con «SketchUp devolvió un material existente». | El SKM de Caju trae el nombre interno «Melamina petiribi18mm», que ya existe en el modelo sin vínculo. Para ese caso `Materials#load` devuelve el material existente. | `MaterialLibrary#load_beside` corre dentro de la misma operación nativa: da al material existente un nombre temporal libre, carga el SKM como material **nuevo** con un nombre libre basado en la ficha (por ejemplo «Caju 18mm» o «Caju 18mm (2)») y le devuelve su nombre al existente. El material del taller **nunca se vincula ni se modifica**: conserva nombre, color, textura y atributos, y no recibe atributos OCL. Si SketchUp igual devuelve el existente, se aborta la operación con un mensaje claro y el modelo queda igual. Todo es un solo paso de Ctrl+Z. | `paint_ready_test`, 5 casos: mismo nombre con visual idéntico; mismo nombre con visual distinto (pinta con la textura de la ficha, no con la del homónimo); otro nombre; mismo material desde otro proceso (no se duplica); cambio a un material en colisión con el pincel activo. Más el caso de SketchUp devolviendo siempre el existente (nada vinculado, nombre restaurado). El doble de `Materials#load` imita a SketchUp: devuelve el existente por nombre. Con el código 0.8.8 fallan 4. |
| P2 | **V19**: 545 ms de mediana por plan en 1.560 piezas; objetivo orientativo < 300 ms. | Cada clic recorría el modelo **3 veces**: una en `plan` y una por lado (frente y dorso) en `prepare_application`. Cada recorrido extraía la malla de todas las caras y calculaba un SHA-256 de todo el modelo. Esa firma solo se usa en el flujo de vista previa y confirmación. | El clic inmediato hace **un** recorrido liviano (`inventory(geometry: false)`) y pasa el mismo inventario a `prepare_application`. Se conservan todos los controles que usa el clic: bloqueos, instancias fuera de la jerarquía, aislamiento, `make_unique` y validación del material. La vista previa con token sigue calculando la firma completa para detectar cambios. | `paint_ready_test`: el clic hace exactamente un recorrido sin huella; la vista previa con token conserva la firma y rechaza un modelo cambiado. |
| P2 | Un clic cerca del borde inferior no cambiaba nada (observación de V9). | `SmartPaintTool#hit` solo miraba `leaf_at(0)`. Cerca de un borde, PickHelper devuelve primero la **arista**. | Si la hoja es una arista, se usa una cara **de esa misma arista**: mismas entidades, misma ruta de instancia, nunca una pieza vecina. En modo placa sirve cualquiera, porque se pinta la pieza entera. En modo canto se toma la cara claramente más angosta. Si no hay una cara angosta clara (esquina entre dos cantos o arista abierta), no se pinta nada. | `paint_ready_test`: arista de borde → cara angosta de la misma pieza, aunque haya una pieza vecina detrás; esquina ambigua → nada; arista con una sola cara ancha → nada. |
| P2 | Dos paletas abiertas: la paleta previa no veía el material recién creado o importado. | Cada ventana leía su propia copia de la biblioteca; no había aviso entre ventanas. | (a) Después de cada acción que cambia la biblioteca, se avisa a la **otra** ventana (`planos-santo-library-changed`), que recarga catálogo y estados sin tocar el pincel. (b) Abrir Pintar en la ventana principal cierra la paleta separada y detiene su pincel. Ese cierre se desacopla antes, para que un aviso tardío de cierre no detenga el pincel nuevo de la ventana principal. | `quick_install_controller_test`: aviso a la otra ventana y nunca a la propia; leer no avisa; Pintar en la principal cierra la paleta; un cierre tardío no mata el pincel nuevo. Playwright `hito1-paint.spec`: la paleta abierta muestra el material nuevo sin reabrirla. |

## 2. Rendimiento: medición sintética, no nativa

Banco con dobles de la API (no es SketchUp): 1.560 piezas de 6 caras, plan del clic inmediato sin aplicar.

| Código | ms por plan (5 piezas) |
|---|---|
| 0.8.8 | 856, 377, 406, 479, 555 |
| 0.8.9 (camino del clic) | 33, 63, 31, 31, 29 |

Esto indica cuánto baja el trabajo, pero no da tiempos de SketchUp. El verificador nativo `verificar_089_sketchup.rb` → `tiempo_clic` ahora informa por separado:
- `clic`: el plan que usa el clic real.
- `vistaPrevia`: el plan completo que medía 0.8.8.

## 3. Lo que no cambió (a propósito)

- No se vincula ningún material por coincidencia de nombre, ni se acepta una textura distinta por llamarse igual.
- No se quitó ningún control de integridad para ganar velocidad.
- Siguen vigentes los límites de imagen (12 MiB, 16 MP, 16.384 px) y el rechazo de corruptos, truncados y no imágenes.
- No se tocaron OpenCutList, la decisión 3 (canto solo en la pieza elegida) ni el TXT de maderera.

## 4. Riesgos y supuestos a validar en SketchUp

1. **`ImageRep#data`**: se asume lo que documenta la API, es decir, bytes de píxeles. `PlanosSantoValidacion089.foto(ruta)` registra `loadReturn`, `bitsPerPixel`, `rowPadding`, `size` y `dataBytes` reales, y si el producto acepta la foto. Correrlo primero con el JPG de V1 (SHA-256 `4af47551…`).
2. **`Material#name=`** dentro de la operación: se asume que el renombrado temporal y su restauración funcionan y se deshacen con un solo Ctrl+Z. `PlanosSantoValidacion089.colisiones` lista las fichas afectadas antes de V6.
3. **Firma geométrica**: el clic inmediato ya no la calcula. Es seguro porque planifica y confirma en la misma llamada sincrónica. El flujo con vista previa la conserva.
4. **Selección por arista**: el umbral «claramente más angosta» es la mitad del área. En piezas muy delgadas o cuadradas puede quedar ambiguo, y entonces no pinta (prefiere no pintar a pintar mal).

## 5. Verificación ejecutada en la nube (no es SketchUp)

| Suite | Resultado |
|---|---|
| Ruby (dobles de la API) | **468 pruebas / 3.434 aserciones / 0 fallas** |
| Playwright offline | **107/107** |
| vitest | 140/140 |
| tsc | OK |
| eslint | 0 errores (2 advertencias preexistentes) |
| Build | Reproducible: dos ejecuciones dan el mismo SHA-256 |

También se hizo la revisión ECC de Ruby. Sus 4 observaciones se corrigieron:
- Sombreado de una variable.
- Uso de `ImageRep#size`, cuya semántica no está verificada.
- Arista de una sola cara en modo canto.
- Carrera al cerrar la paleta.
