# Validación multiagente de la candidata 0.8.10 (antes de SketchUp real)

> Informe del juez final (8 agentes de replay por caso de Dot, 3 revisores y 1 juez). **No es SketchUp:** traza de código, contrato con la API documentada y pruebas con dobles. Los defectos obligatorios de la sección 2.1 (resize inexistente, PALETAS-1, R1 y rollback de V6) ya están corregidos en la candidata publicada; ver `VALIDACION_0810.md`. El punto 5 (contrato de `load_file`) quedó cubierto con la verificación de píxeles en toda decodificación.

# Juez final: candidata 0.8.10 de Planos Santo, antes de mandarla a Dot

**Decisión: la 0.8.10 no se manda a Dot como está.** Antes hay que corregir un bug bloqueante: `photo_material.rb:87` llama a `rep.resize`, y ese método no existe en la API oficial. Ese bug deja inválidos V1, V15, V2, V3 y V12. Además conviene cerrar otros tres bugs baratos, listados en la sección 2.1. Todas las pruebas del repo usan dobles de la API. Nada de este informe está probado en SketchUp.

**Fuente de la documentación.** ruby.sketchup.com no respondió desde la nube: falló el DNS y el proxy devolvió 403. Todos los agentes contrastaron el código contra la gema oficial `sketchup-api-stubs` 0.7.11 (Trimble, 2026), que sale del mismo YARD que esa web. Conviene releer la web cuando haya acceso.

**Base del código.** Volví a verificar las líneas citadas sobre el HEAD actual, `3ae0c69`; la candidata siguió avanzando después de `ec5995c` y de `2421344`. Coinciden:
- `photo_material.rb:87` llama a `rep.resize(width,height)==false`.
- `photo_material_double.rb:144` define `resize` en el doble.
- `material_library.rb:226` usa `abort_operation==true`.
- `smart_paint_tool.rb:71-72` aplica la regla del 50 %.
- `offline.rb:578-580` cierra la paleta separada dentro de `smart_palette_load`.

Las pruebas que agregaron los agentes están en ramas `val/*` (en worktrees de `.claude/worktrees/wf_6293afa4-*`), sin push y sin cambios de producto.

## 1. Tabla por caso

| Caso | Veredicto | Riesgo residual | Prueba agregada (dobles, rama/commit) | Qué tiene que mirar Dot |
|---|---|---|---|---|
| **V1 / V15** Foto JPG 1200×1200 | **Debería fallar** | **Bloqueante:** `photo_material.rb:87` llama a `ImageRep#resize`, que no existe. Toda foto de más de 256 px daría `NoMethodError`, tanto en +Material como en Asignar foto. La parte de `load_file` que devuelve nil sí quedó bien resuelta. Quedan riesgos con 8 bpp (gris o indexado), CMYK, PNG de 16 bits, orientación EXIF, y con `data` cuando la fila lleva relleno. | `val/v1-v15` c716cca: caracterización de `resize` (hay que invertirla al corregir), SOF2 con EXIF+ICC, riesgo EXIF, riesgo 8 bpp | `Sketchup::ImageRep.method_defined?(:resize)`. Correr `foto()` con el JPG de V1 y anotar loadReturn, bitsPerPixel, rowPadding, size y dataBytes. Después, la batería de variantes de formato. |
| **V2 / V3 / V12** Foto nueva: textura, otro modelo, reapertura | **Debería fallar** | Queda bloqueado por el mismo `resize`. Si se corrige, quedan dos riesgos: (a) que `Material#save_as` no guarde `photo_v1` dentro del SKM, en cuyo caso V3 falla limpio; (b) que `Texture#width` devuelva un Integer según la doc, con lo que una escala verificada no exacta en pulgadas quedaría en `texture_mismatch`. El UV queda con el mapeo por defecto. | `val/v2-v3-v12` 95dfb8e: 7 pruebas (instalación A→B, reapertura, deriva de escala, SKM sin atributos, foto de 256 px o menos) | `m.texture.width.class` y `width*25.4`. `photo_v1` en el material instalado en el otro modelo. Capturas de UV y escala antes y después de reabrir; pieza girada y espejada. |
| **V6** SKM con nombre que ya existe en el modelo | **Riesgo** | La doc no define qué es «matching» en `Materials#load`. Si deduplica por GUID o contenido, falla seguro pero V6 sigue en FAIL. Si `abort_operation` no devuelve `true` exacto, aparece una falsa alarma fatal y el reintento no corre. El renombre temporal del material previo no se revierte de forma explícita si el reintento falla por otra causa. | `val/v6` a80b4f6: copia independiente con un solo Undo y el pincel activo; caso de deduplicación tipo GUID que no modifica el modelo | Snapshot del material previo antes y después. Mensaje exacto (caso A, B o C). Un solo paso «vincular material» en Deshacer. Si aparece «no confirmó la cancelación», no guardar. |
| **V7** Edición comercial y foto nueva | **Debería pasar** | Mismo riesgo de `Texture#width` Integer con 600 mm. Detalle de nombre «#1» al reemplazar. `supplierReady` no tiene en cuenta la huella comercial. Al reemplazar la foto se conserva la aprobación aunque cambie el espesor. | `val/v7` 2d531c0: 4 pruebas (edición sin re-vincular, reemplazo de foto, otro modelo bloqueado, catalog_save bloqueado mientras se pinta) | Pasos A a G: clase de `texture.width`, mismo uuid en `binding_v1`, sin pasos en Deshacer por la ficha, Pedido después de editar. Depende de que V1 pase. |
| **V19** Rendimiento del clic | **Riesgo** | No está medido en SketchUp. El inventario liviano sigue siendo O(N) sobre 1603 contenedores. Por clic: `catalog.read` ×6, `affected_paths` ×4. `tiempo_clic` no mide commit ni redibujo. La firma nil falla cerrado, lo cual es correcto. | `val/v19` 555ad63: token liviano nunca confirmable, controles que siguen sin firma, línea base de conteos | Mediana de `clic` y `vistaPrevia` con pieza compartida y única. `apply_immediate` cronometrado en consola con 5 cambios y 5 no-op. Separar el hover del clic. |
| **CANTO-BORDE** Arista antes que la cara | **Riesgo** | **R1, bug reproducido:** en la esquina entre dos cantos de largo muy distinto se pinta el canto corto (`smart_paint_tool.rb:71-72`). Contradice VALIDACION_0810.md («esquina entre cantos → no pinta»). **R2:** con una pieza vecina, el orden de los registros de PickHelper no está documentado. Con escala no uniforme, `Face#area` sin transformación no refleja lo que se ve. Con más de 2 caras en la arista, `sort_by` elige mal. | `val/canto-borde` 12589d1: gemela antes de la cara propia, ruta sin hoja, esquina canto-canto (skip = R1) | Volcado de `count`/`leaf_at`/`path_at`/`depth_at`/`picked_face` en cada clic. Esquina de un estante de 2000×300. Tableros a tope (R2). |
| **PALETAS** Dos paletas, aviso y relectura | **Riesgo** | **PALETAS-1, bug reproducido:** con Pintar ya abierto en la principal y la separada abierta después, la relectura de fondo de la principal (`smart_palette_load`, `offline.rb:578-580`) cierra la separada y detiene su pincel. **API:** `UI.start_timer` documenta que un temporizador puede repetirse si se abre una ventana modal adentro, así que con el selector de foto abierto el mismo pedido podría recibir «Esperá…». | `val/paletas` e1c1ac0: el aviso llega a las dos ventanas (pasa); PALETAS-1 (skip) | Pasos A a D, sobre todo B (orden inverso) y D (selector abierto 10 s). Consola completa. |
| **V18-REGRESIÓN** Nombres, A4, TXT de 9 columnas, bloqueos | **Debería pasar** | El TXT de un pedido totalmente revisado sigue sin validarse en nativo desde 0.8.8. Cosmético: si hubo colisión, puede aparecer « · Planos Santo <hex> » en las leyendas del PDF. | `val/v18-regresion` 5eee3be: inventario liviano igual al completo en rutas; pintar entre la vista previa de nombres y Aplicar exige una vista previa nueva; dispatch sin aviso para pdf, names y order; la versión 0.8.10 está en el enum del exportador | Nombres sin prefijo duplicado, un solo Undo, reapertura. PDF exterior y doble con 17 piezas en 1 hoja. TXT con 9 campos TAB y CRLF. |

## 2. Bugs a corregir antes de mandar la 0.8.10 a Dot

### 2.1 Obligatorios

1. **BLOQUEANTE: `ImageRep#resize` no existe.** Está en `sketchup_offline/photo_material.rb:87` (`image_preview`).
   - **Corrección mínima:** no redimensionar el ImageRep. A partir de `rep.data`, ya validado (stride = `width*bpp/8 + row_padding`), armar una miniatura de hasta 256×256 por vecino más cercano. Después: `Sketchup::ImageRep.new`, `set_data(w, h, bpp, 0, pixeles)` y `save_file` a un PNG temporal. Se mantiene la revalidación ≤256 y el orden de bytes nativo (BGR(A) en Windows). Atajo válido: si el original ya pesa ≤ `MAX_THUMBNAIL`, usarlo directamente como data URI.
   - **Además:** quitar `resize` de `sketchup_offline/test/photo_material_double.rb:144` e invertir las pruebas de caracterización de V1 y V2. Sin esto, V1, V15, V2, V3, V12 y el paso E de V7 dan FAIL en nativo.

2. **PALETAS-1: la relectura de fondo cierra la paleta separada.** Está en `sketchup_offline/offline.rb:578-580`.
   - **Corrección mínima:** cerrar la separada solo si `data['claim']==true`. Ese flag lo manda únicamente la carga inicial al montar Pintar en la ventana principal (`ui/.../SmartPaintPalette.tsx:122`, no en StandalonePaintApp). La relectura por aviso (línea ~62) y la de `contextRestored` (~106) no lo mandan.
   - Envolver `palette.close` en `begin … rescue StandardError` (diálogo ya destruido).
   - Pasar el skip de `quick_install_controller_test.rb` a aserción real.

3. **R1: esquina entre dos cantos pinta el canto equivocado.** Está en `sketchup_offline/smart_paint_tool.rb:71-72`.
   - **Corrección mínima:** aplicar la regla de la cara angosta solo si la ancha es cara de placa (`wide.area >= piece_max*0.5`, con `piece_max` = el área máxima de las caras de la pieza). Si no, usar `ranked.length==1 ? ranked.first : nil`.
   - Usar `faces.min_by` / `faces.max_by` en vez de `sort_by` (caso de más de 2 caras).
   - Quitar el skip de `test_edge_shared_by_two_cantos_of_very_different_length_is_ambiguous`.

4. **Rollback de V6 frágil.** Está en `sketchup_offline/material_library.rb:226` y `:411-416`.
   - La doc dice que `abort_operation` devuelve Boolean, pero un `nil` convertiría cualquier colisión en un error fatal y el reintento no correría.
   - **Corrección mínima:** dar el rollback por fallido solo con `== false`, igual que commit y start, y confirmar siempre con `ensure_rollback_states!`.
   - En el reintento (`install` :411-416), ante cualquier excepción, ejecutar `ensure_rollback_states!(protected_states)` o restaurar `original_name` explícitamente antes de relanzar. Así el material del usuario no queda con el nombre «Planos Santo <hex>».

5. **Contrato de `load_file`.** Está en `sketchup_offline/photo_material.rb:56-57`. La doc no le documenta ningún retorno.
   - **Corrección mínima:** considerar éxito cuando no lanza excepción y las dimensiones son válidas, cualquiera sea el retorno, y aplicar siempre la verificación de píxeles.
   - Aceptar `data.bytesize == rep.size` (documentado) además de la fórmula propia.
   - Cuesta poco y evita otro FAIL en V1 si el retorno cambia.

### 2.2 Mejoras opcionales (pueden ir después de la batería de Dot)

- **Fotos:** aceptar 8 bpp (stride = ancho + relleno) o rechazarlo con un mensaje propio. Esperar los datos de Dot sobre CMYK, 16 bits y EXIF.
- **V3:** en `install_visual` (`material_library.rb:369`), si el SKM cargado tiene exactamente `photo.skmHash`, escribir `photo_v1` después de cargar en vez de exigir que venga dentro del SKM. Aplicar solo si Dot confirma que se pierde.
- **V19:** leer el catálogo una sola vez por clic, memoizar `material_for`, saltear `MaterialPolicy.warnings` en el clic inmediato (`native_paint.rb:229`) y usar un índice definición→rutas para `affected_paths`. Ninguna quita controles.
- **CANTO R2/R3:** desempatar con `picked_face`, `depth_at` o `face.area(transformation_at(i))`.
- **PALETAS:**
  - En `handle`, ignorar en silencio un id que ya está en curso (bug documentado de `UI.start_timer` con ventanas modales).
  - Ejecutar `palette_close` y `palette_manage` solo si `@request_dialog.equal?(@palette_dialog)`.
  - Que `quick_action('sheet')` cierre el Pintar de la ventana principal.
- **V7:**
  - `supplierReady = approved && commercial_issues.empty?`.
  - Si cambia el espesor al reemplazar la foto, poner `approved=false` (`photo_material.rb:236-237`).
  - Que WorkshopPanel escuche el evento de biblioteca.
- **V6 UX:**
  - Estado `skm_collision` en `state_for` después de un fallo por deduplicación.
  - Usar `materials.unique_name` en `independent_name`.
- **Otros:**
  - Verificar el retorno de `abort_operation` en `photo_material.rb:271`.
  - Copiar el SKM a un temporal propio con verificación de hash antes de `Materials#load`.
  - En `emit_to`, validar el nombre del evento con `/\A[a-z0-9-]+\z/`.

## 3. Llamadas de API que la doc no garantiza

| Método | Qué falta en la doc | Dónde lo usa PS |
|---|---|---|
| `ImageRep#resize` | **No existe** en la API documentada. | `photo_material.rb:87` |
| `ImageRep#load_file` | No tiene @return; solo documenta `@raise ArgumentError`. Tampoco dice si rota por EXIF ni cómo convierte gris, indexado, CMYK o 16 bits. | `photo_material.rb:56-57` |
| `ImageRep#data` / `#row_padding` / `#bits_per_pixel` | No dice si `data` incluye el relleno de fila ni cuál es el rango de `row_padding`; 0..3 es una suposición. Es posible que existan 8 bpp. | `photo_material.rb:62-70` |
| `Texture#width` / `#height` | Declarados como `@return [Integer]` en pulgadas. Si fuera literal, rompería la escala verificada. | `material_policy.rb` (~165-170) |
| `Material#save_as` | No dice si el SKM conserva los diccionarios de atributos. | `material_library.rb:185` y `:369` |
| `Materials#load` | «matching» no está definido (nombre, GUID o contenido). | `material_library.rb:360` |
| `Material#name=` | Lanza error si el nombre no es único, pero no dice si la unicidad distingue mayúsculas. | `material_library.rb:357/365/366` |
| `Model#abort_operation` | Devuelve Boolean, pero no dice qué devuelve con una operación sin cambios ni si las referencias Ruby siguen válidas, ni si revierte `name=`. | `material_library.rb:226` |
| `PickHelper#leaf_at(0)` / `#path_at(0)` | El orden de los registros no está documentado; el índice 0 no es necesariamente el «best». | `smart_paint_tool.rb:78` |
| `PickHelper#do_pick` | No cuantifica la tolerancia con aperture 0. | `smart_paint_tool.rb:76` |
| `Edge#faces` | No fija orden ni cantidad. | `smart_paint_tool.rb:62` |
| `Face#area` sin argumento | Devuelve el área sin escalar. | `smart_paint_tool.rb:71-72` |
| `ComponentDefinition#instances` | No aclara si incluye instancias dentro de definiciones no colocadas. | `native_paint.rb:215-223` |
| `UI::HtmlDialog#close` / `#set_on_closed` | No dice si on_closed corre sincrónico o diferido. El código cubre los dos casos. | `offline.rb:158`, `:197`, `:580` |
| `UI::HtmlDialog#execute_script` | Es asíncrono y no confirma la entrega; no dice qué pasa con un diálogo cerrado. | `offline.rb:205` |
| `UI.start_timer(0,false)` | La propia doc avisa que se repite si se abre una ventana modal adentro. | `offline.rb:153`, `:195` (con openpanel en :471, :499, :531, :674) |

## 4. Orden recomendado de la batería nativa para Dot

Va con la 0.8.10 ya corregida según 2.1, siempre sobre COPIAS de los modelos QA y con la consola Ruby guardada entera.

1. **Sondeo de API, sin crear nada.** Correr:
   - `p Sketchup::ImageRep.method_defined?(:resize)`
   - `load 'verificar_0810_sketchup.rb'`
   - `PlanosSantoValidacion0810.foto(ruta)` con el JPG de V1.

   Anotar loadReturn, bitsPerPixel, rowPadding, size, dataBytes y si queda aceptada. Si aparece cualquier `NoMethodError`, parar.
2. **V1/V15 en la interfaz.** +Material → Elegir foto con el JPG de V1: tiene que aparecer la vista previa y Guardar y pintar. Repetir con Asignar foto desde una ficha con SKU: el SKU tiene que quedar intacto.
3. **Variantes de formato con `foto()`.** Progresivo, gris de 8 bits, CMYK, teléfono en retrato con EXIF 6 (anotar si ancho y alto salen girados), ICC, PNG RGB, RGBA, indexado, gris y de 16 bits, y uno de 1201×900. Límites: más de 12 MiB, más de 16 MP, más de 16384 px, un JPG renombrado a .png y uno truncado. Todos los límites tienen que dar «imagen inválida».
4. **V2.** Foto con escala verificada de 2750×1830 → pintar. En consola: `texture.width.class`, `width*25.4` y `photo_v1`.
5. **V3.** Elegir la foto en otro modelo: se tiene que instalar sola, y `photo_v1` no puede ser nil. Anotar si aparece «El SKM de diseño no coincide…».
6. **V12.** Guardar, cerrar y reabrir. Mismo UV y escala (captura desde la misma cámara), «Listo para pintar» sin reinstalar. Repetir con pieza girada y espejada.
7. **V6.** Snapshot del material previo → con el pincel activo, elegir Caju18mm → mensaje A, B o C → volver a sacar el snapshot. Un solo Undo. Si sale el caso C, no guardar.
8. **CANTO-BORDE R1.** Esquina del canto largo de un estante de 2000×300×18: con la corrección no tiene que pintar nada. Volcado de PickHelper.
9. **CANTO-BORDE V9b.** Clic a 1-2 px del borde de la cara 310 en vista frontal, isométrica, girada, espejada y anidada. Solo cambia la 310.
10. **CANTO-BORDE R2.** Dos tableros a tope: clic en B junto a la arista que comparten. Anotar qué pieza cambió y el volcado.
11. **PALETAS B y D.** Orden inverso: la principal en Pintar, después la separada, después instalar desde la separada. La separada tiene que seguir abierta y pintando. Después dejar el selector de foto abierto 10 s con un cambio de biblioteca desde la otra ventana: no tiene que aparecer «Esperá…» en la ventana del selector.
12. **PALETAS A y C.** Orden de 0.8.8: la separada se cierra en menos de 1 s y el pincel nuevo sigue activo. Una ficha creada en la principal aparece en la separada en menos de 3 s, sin perder la búsqueda ni el estado.
13. **V19.** En M-L, `tiempo_clic` con pieza compartida y única, más `apply_immediate` cronometrado en consola (5 cambios y 5 no-op), y 10 clics reales separando el hover. Anotar el tamaño de la biblioteca si el clic da 300 ms o más.
14. **V7.** Pasos A a G: edición comercial con Pintar activo (tiene que bloquear), elegir de nuevo sin re-vincular, reemplazo de foto conservando los datos comerciales, Pedido.
15. **V18.** Nombres (incluida la variante pintar entre Vista previa y Aplicar), PDF exterior y doble con 17 piezas en 1 hoja, TXT bloqueado y TXT de una pieza totalmente revisada: 9 campos TAB, CRLF, `production_ready=false`.

Para cada paso: PASS, FAIL o PENDIENTE con capturas y el JSON saneado, sin la foto. V1, V15, V2, V3 y V12 no pueden marcarse PASS si en el paso 1 apareció cualquier `NoMethodError`.