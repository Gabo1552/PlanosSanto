# Hito 7 · Pincel avanzado — contrato de diseño

Fuente: `audit/opencutlist-paridad-2026-10-21/PLAN_PARIDAD_OCL.md` §2.1 (matriz Pintura) y §5 (Hito 7). Se apoya en `docs/hito2-pincel/DISENO.md` (Hito 2).
Clean-room: nada de código, cursores, textos, estructura ni nombres de recursos de OCL. Todo es diseño propio de PS.

Invariantes que no se negocian (heredadas del Hito 2):
- un clic que pinta = una operación = un Undo; nada de make_unique silencioso;
- el hover, el dibujo, el menú abierto, el cuentagotas y la tira de recientes **nunca escriben el modelo**;
- ante la duda se bloquea con un motivo; nunca se pinta a medias;
- ninguna acción nueva instala materiales: elegir un reciente o muestrear usa `smart_quick_options(..., install:false)`.

Alcance: solo el modo inmediato (`immediate`/`immediatePiece`) de `SmartPaintTool`. El modo con vista previa/lote no cambia de comportamiento.

## 1. PINTURA-15 · varias caras por lado (`native_paint.rb`)

Hoy `boundary_frame` agrupa las caras por `[eje, min|max]` y `expanded_faces` exige exactamente una cara por lado. Cambia a:

- Un lado está **completo** cuando la suma de `areaMm2` de sus caras coincide con el rectángulo del lado (producto de los dos otros extentes de `localBounds`) con tolerancia relativa `1e-3` (y absoluta 0,5 mm²). Las caras coplanares no se superponen en SketchUp, así que área completa ⇒ el lado está cubierto.
- `boundary_frame` agrega `complete:{[eje,lado]=>true|false}` (no cambia `groups`).
- `expanded_faces`:
  - **4 cantos**: los 4 lados deben estar completos; devuelve **todas** las caras de los 4 lados. Si alguno no lo está → `ExportError` «Un lado no está cubierto por caras planas completas (rebaje o geometría abierta). Revisá la pieza; no se pintó nada.»
  - **2 cantos**: el lado apuntado y su opuesto deben estar completos; devuelve todas sus caras. Mismo motivo si no.
  - **1 canto**: si la cara apuntada pertenece a un lado completo con más de una cara → devuelve todas las caras de ese lado (canto partido por una arista = un solo canto). Si el lado no está completo o el marco no se puede calcular → devuelve solo la cara apuntada (comportamiento del Hito 2: el rebaje se puede pintar cara por cara).
  - **Placa** (`paintScope:'piece'`): las dos caras anchas (`[espesor,min]` y `[espesor,max]`) deben estar completas; devuelve todas sus caras. Si no → «Las caras anchas no cubren la placa completa. Usá pintar Cara.»
- Validación de `validate_edge!` sigue igual (cada cara debe ser plana en un lado del marco).
- `smart_paint.rb` no necesita cambios de contrato: ya trabaja con listas de caras.
- El área de cada cara es la de su **bucle exterior** proyectado en el plano del lado (los agujeros de bisagra o de clavija no destapan el lado; un rebaje sí). Tolerancia: `|suma−rectángulo| ≤ max(0,5 mm², 1e-6 × rectángulo)`.
- En el hover el marco se memoriza por definición/ejes/transformación dentro de la generación (`data[:memo]`); el clic nunca usa esa memoria.
- Excepción al alcance «solo modo inmediato»: `expanded_faces` es compartido, así que la paleta avanzada (vista previa/lote) también expande un lado partido completo y bloquea con el mismo motivo un lado incompleto. Mismas garantías: un Undo, nunca a medias.

## 2. Herramienta (`smart_paint_tool.rb`)

### 2.1 Nuevos parámetros del constructor (todos opcionales, `nil` = función apagada)
| Parámetro | Firma | Uso |
|---|---|---|
| `select_material:` | `lambda { \|catalog_id, mode\| options_hash }` | Opciones inmediatas completas para ese material y modo (`'sheet'`/`'edge'`), sin instalar. Lanza `ExportError` con el motivo si no está listo. |
| `recents:` | `lambda { \|mode\| [{'catalogId','materialUuid','name','color'=>[r,g,b]}] }` | Hasta 6 materiales recientes listos para el modo. Se llama en `activate`, `update_options`, cambio de modo/material; **nunca** en `draw`/`onMouseMove`. |
| `eyedropper_key:` | `'alt'` (defecto) o `'shift'` | Tecla sostenida del cuentagotas. |

### 2.2 PINTURA-04 · tira de recientes en el viewport (`draw2d`)
- Se dibuja abajo a la izquierda: hasta 6 cuadrados de `28 px × UI.scale_factor`, separados 6 px, margen 12 px desde el borde izquierdo y el inferior (`view.vpheight`). Relleno con el color del material (`GL_QUADS`), borde gris; el activo (`materialUuid` igual al de las opciones) con borde grueso negro (`GL_LINE_LOOP`, `view.line_width=2` si existe). Debajo/encima, el texto «Recientes · clic o 1–6» con `draw_text` en coordenadas de pantalla.
- Si la vista no tiene `draw2d` o `vpheight` (dobles viejos), no se dibuja nada y no falla.
- `onMouseMove` dentro del rectángulo de la tira: no hace pick de piezas; borra el hover de pieza y deja `@strip_hover=índice` (el tooltip muestra el nombre del material).
- `onLButtonDown` sobre un cuadrado: cambia de material con `select_material.(catalogId, modo_material)` donde modo_material es `'edge'` para `edge`, `'sheet'` para `sheet`. **No pinta**, no abre operación. Resetea el alcance a «Solo esta». En `remove_edge` la tira no se muestra.
- Teclas `1`..`6` (códigos 49..54, sin modificadores, `repeat==1`): igual que clic en el cuadrado N. (Nota: si SketchUp tiene atajos en esas teclas los toma primero; se documenta en la validación.)
- El evento de cambio incluye `'recents'=>[...]` (lista pública sin colores Sketchup::Color, solo arrays).

### 2.3 PINTURA-07 · cuentagotas temporal con tecla sostenida
- `onKeyDown` con la tecla configurada (`VK_ALT`/`VK_MENU` → 18 por defecto; `VK_SHIFT` → 16), `repeat==1`, en modo inmediato y sin estar ya muestreando: entra en **muestreo**. Devuelve `true` (intenta que Windows no active el menú con Alt).
- En muestreo: cursor propio de cuentagotas si existe (`paint-sample.png`; si no, cursor nativo); el hover muestra el material de la cara apuntada (`face.material` o heredado del contenedor) con su estado; no se calcula veredicto de pintura ni se resaltan copias.
- Clic en muestreo: lee la cara (frente; si no tiene, dorso; si no, heredado). Solo acepta un material con vínculo PS válido (`MaterialResolver.observe_binding(m)['status']=='valid'`) de tipo `sheet`/`edge`. Llama `select_material.(catalogId, kind)`; además verifica que el `materialUuid` devuelto sea el UUID muestreado (si no: «El material de esta cara no coincide con su ficha de biblioteca; revisalo en la biblioteca.»). El modo pasa a `kind` (`sheet` o `edge`); alcance a «Solo esta». **No pinta** y no abre operación. Material sin vínculo/no listo → `error` con motivo, nada cambia.
- Si el clic trae la máscara de la tecla en `flags` (`ALT_MODIFIER_MASK`/Mayús) se trata como muestreo aunque se haya perdido el `onKeyDown`: un evento de teclado perdido nunca convierte un muestreo en pintura.
- Si el material tomado cambia el modo (p. ej. desde Quitar canto), el mensaje lo nombra («Modo: Pintar canto.»). Con Mayús como tecla, Tab sale del muestreo: Mayús+Tab es un atajo, no un muestreo.
- `onKeyUp` de la misma tecla: sale del muestreo y vuelve al pincel (con el material nuevo si se tomó uno). Devuelve `true`.
- `deactivate`, `suspend`, `stop`, `onCancel` y cambiar de opciones salen del muestreo.
- El evento lleva `'sampling'=>true|false` (y `'sample'=>{'name','status','catalogId','kind'}` del hover en muestreo).

### 2.4 PINTURA-11 · pick en profundidad (↑/↓)
- En modo inmediato ↑ (38) y ↓ (40) dejan de rotar materiales (←/→ siguen haciéndolo; en modo no inmediato las cuatro flechas siguen igual que antes).
- `hit` arma la **pila** de candidatos bajo el cursor: para cada índice `0...picker.count`, si `leaf_at(i)` es `Face` (o el índice 0 es `Edge` resuelto con `face_of_edge` como hoy) y la ruta es de instancias completas válida, un candidato; se deduplica por `pieceId` conservando el orden (de adelante hacia atrás). La clave de la pila es la lista de `pieceId`.
- `@depth` (entero) elige el candidato `@depth % n`. ↓ suma 1 (más profundo), ↑ resta 1. Cambiar de pila (otra lista de `pieceId`) vuelve `@depth` a 0.
- El hover muestra `'depth'=>{'index'=>i,'count'=>n}` cuando `n>1`; el tooltip agrega «(i+1 de n · ↑/↓)».
- **Seguridad del clic**: el clic usa la misma pila; si `@depth>0` y la pila del clic no es la misma que la del último hover → no pinta y avisa «Cambió lo que hay bajo el cursor; elegí de nuevo con ↑/↓.» (nunca adivina).

### 2.5 PINTURA-13 · menú contextual (`getMenu(menu, flags, x, y, view)`)
Se arma sobre la pieza bajo el cursor (la del hover, respetando la profundidad). Ítems (`menu.add_item(texto) { ... }`; `menu.add_separator` si existe; marcas con `menu.set_validation_proc(id) { MF_CHECKED | MF_UNCHECKED }` si existen):
1. «Tomar el material de esta cara» — mismo flujo que el clic del cuentagotas (no pinta).
2. «Ocultar esta pieza» — **una operación** `'Ocultar pieza Planos Santo'` con `hidden=true` sobre la instancia; evento `changed:true`; si falla, `abort_operation`. Pieza bloqueada → rechazado con motivo, sin operación.
3. «Mostrar las piezas ocultadas desde el pincel» (solo si hay) — una operación que vuelve a mostrar las que esta herramienta ocultó en la sesión y siguen válidas.
4. «Renombrar pieza…» — `UI.inputbox(['Nombre'],[actual],'Renombrar pieza')`; valida con `NameManager.clean(valor, 80)`; una operación `'Renombrar pieza Planos Santo'` que asigna `instance.name=`; cancelar o mismo nombre → sin operación. Pieza bloqueada → rechazado.
5. En canto/quitar canto: «1 canto», «2 cantos opuestos», «4 cantos» (con marca en el activo) → mismo efecto que Ctrl+Tab hasta ese valor (se recuerda).
6. «Resaltar lo que falta pintar» (marca) → alterna F-PINT-C.
7. «Transparencia (rayos X)» (marca) → alterna PINTURA-14.
Si no hay pieza bajo el cursor, solo aparecen 6 y 7. `getMenu` nunca escribe el modelo por sí mismo: escriben solo los bloques de 2–4 al elegirlos. Devuelve `true`.

### 2.6 F-PINT-C · resaltar lo que falta pintar
- Interruptor `@missing` (apagado por defecto). Se alterna con el menú o con la paleta (`set_view_options('highlightMissing'=>bool)`); sin tecla propia, porque las teclas de función pueden tener atajos de SketchUp.
- Con el interruptor activo, en cada generación se recorre `OccurrenceIndex` (solo instancias) y se evalúan las piezas hoja (instancias cuya definición tiene caras y ninguna instancia hija), hasta 500 piezas. Para cada una (cache por `[definition.guid, generación, material heredado, escalas]`):
  - `sinPlaca`: ninguna de las caras anchas (las de `expanded_faces` placa; si eso falla, las caras que no son de canto) tiene material de placa reconocido (`binding.kind=='sheet'`, propio o heredado) en frente o dorso.
  - `cantos`: de los 4 lados del marco (si se puede calcular), cuántos tienen **todas** sus caras con material de canto (`NativePaint#edge_material?`) en frente o dorso → `{'done'=>k,'total'=>4}`; `nil` si el marco no se puede calcular.
- Dibujo: piezas `sinPlaca` en rojo translúcido (alpha 70), hasta 300 piezas dibujadas.
- Tooltip (con el interruptor activo) agrega una 3.ª línea para la pieza apuntada: «Falta: placa · cantos 2/4» o «Completa: placa · cantos 4/4».
- Evento: `'missing'=>{'enabled'=>bool,'withoutSheet'=>N,'evaluated'=>M,'truncated'=>bool}`.
- Nunca escribe, nunca lee el catálogo; los errores de geometría de una pieza la marcan como no evaluable (no rompen el resto). Un error general queda cacheado en la generación (`missing.error`) y nunca escapa de `status`/`draw`.
- Costo: el resultado se guarda por `[definición, material heredado, escalas, huella de caras y materiales]` entre generaciones (un clic solo reevalúa lo que cambió) y cada pasada tiene un presupuesto de 150 ms (si se agota, `truncated`). No cuenta piezas ocultas ni en etiquetas ocultas.

### 2.7 PINTURA-14 · alternar transparencia
- `SmartPaintTool.toggle_transparency(model)` (método de clase): lee `model.rendering_options['ModelTransparency']`, escribe el opuesto y devuelve el nuevo valor. Es una opción de vista: **no** abre operación ni crea Undo; no toca entidades. Si el modelo no tiene `rendering_options`, lanza `ExportError` «Esta versión de SketchUp no permite cambiar la transparencia desde el pincel.»
- Disponible desde el menú contextual y desde la paleta (acción `smart_toggle_transparency`).
- El estado se informa en el evento como `'transparency'=>bool`.

### 2.8 `status` / evento a la paleta
`status` agrega: `'sampling'`, `'missing'` (resumen de 2.6), `'transparency'`, `'recents'` (lista pública), `'eyedropperKey'`. `hover` agrega `'depth'` y, en muestreo, `'sample'`. La firma del limitador de hover agrega `sampling`, `depth` y `missing.withoutSheet`.

## 3. Controlador (`offline.rb`, solo funciones de pintura)
- `SMART_SETTING_KEYS` agrega `recentMaterials` (`{'sheet'=>[ids…≤6],'edge'=>[ids…≤6]}`) y `eyedropperKey` (`'alt'`/`'shift'`). `smart_settings` sanea ambos (ids String no vacíos ≤200, máximo 6 por modo, únicos; clave inválida → se descarta).
- `remember_smart_settings`, en modo inmediato con `catalogId` y modo `sheet`/`edge`: un id nuevo entra al frente de `recentMaterials[modo]` (máximo 6); uno conocido **conserva su lugar**, para que el cuadrado N y la tecla N sigan siendo el mismo material.
- `smart_tool_start` pasa a `SmartPaintTool.new` los callbacks nuevos:
  - `select_material: lambda { |catalog_id, mode| tool_guard!(generation); smart_select_material(catalog_id, mode) }` → `smart_quick_options({'mode'=>mode,'catalogId'=>catalog_id},install:false)` + `remember_smart_settings` + `@quick_options=`.
  - `recents: lambda { |mode| smart_recent_materials(mode) }` → para cada id recordado del modo: `paint_materials.state(id)`; solo `state=='ready'`; nombre del ítem del catálogo; color del material nativo con ese UUID (`[r,g,b]`). Nunca instala. Errores por ítem → se omite.
  - `eyedropper_key: smart_settings['eyedropperKey'] || 'alt'`.
- Acciones nuevas del dispatch:
  - `smart_tool_view` con `{'highlightMissing'=>bool}` → `@smart_tool.set_view_options(...)` si la herramienta inmediata está activa; responde `{'toolState'=>smart_state}`.
  - `smart_toggle_transparency` → `SmartPaintTool.toggle_transparency(@model)`; responde `{'transparency'=>bool,'toolState'=>smart_state}`; no marca el análisis como desactualizado.
  - `smart_eyedropper_key` con `{'key'=>'alt'|'shift'}` → valida, recuerda en settings y, si la herramienta inmediata está activa, `@smart_tool.eyedropper_key=`; responde `{'settings'=>smart_settings,'toolState'=>smart_state}`.
- Las acciones nuevas no se agregan a la lista que detiene la herramienta.

## 4. Paleta (`SmartPaintPalette.tsx`, quickMode)
- Fila «Vista» con dos botones conmutables (`aria-pressed`): «Resaltar lo que falta» (envía `smart_tool_view` con el valor nuevo; solo habilitado con la herramienta activa) y «Transparencia» (envía `smart_toggle_transparency`).
- Cuando `toolState.missing.enabled`, texto «Sin placa: N piezas» (o «N+» si `truncated`).
- Selector «Cuentagotas: Alt / Mayús» (`role=group`, `aria-label="Tecla del cuentagotas"`) → `smart_eyedropper_key`. Valor inicial de `settings.eyedropperKey` (defecto Alt).
- Si `toolState.sampling`, aviso visible «Cuentagotas activo: hacé clic en una cara para tomar su material.»
- Si `toolState.hover.depth`, el pie muestra «Pieza i de n bajo el cursor (↑/↓)».
- La ayuda (HelpPopover del pincel) documenta: recientes en la vista (clic o 1–6), Alt sostenido, ↑/↓, clic derecho.
- Cuando llega un `toolState.options` con otro `catalogId` (cambio desde la vista: recientes/cuentagotas), la paleta marca ese material como activo y vuelve el alcance a «Solo esta» sin reenviar `smart_quick_start`.
