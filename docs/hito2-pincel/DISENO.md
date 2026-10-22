# Hito 2 · Pincel diario completo — contrato de diseño

Fuente: `audit/opencutlist-paridad-2026-10-21/PLAN_PARIDAD_OCL.md` §2.1 y §5 (Hito 2).
Clean-room: nada de código, cursores, textos ni estructura de OCL. Este documento es diseño propio de PS.
Invariantes que no se negocian: un clic = una operación = un Undo; nunca make_unique silencioso; ante la duda se bloquea con motivo; el hover nunca escribe el modelo.

## 1. Opciones del pincel rápido (Ruby ↔ paleta)

`smart_quick_start` (paleta inmediata) acepta, además de lo que ya acepta:

| Campo | Valores | Regla |
|---|---|---|
| `edgeCount` | `1`, `2`, `4` | Solo `edge` y `remove_edge`. Se valida contra `[1,2,4]` con `Integer` exacto (no `"2"`, no `2.0`). Ausente → el último recordado en settings, y si no hay, `1`. En `sheet` se fuerza `1`. |
| `scope` | `'unique'` (defecto), `'all'` | `'all'` exige `allowShared: true` en la **misma** solicitud. Si falta, se rechaza con `ExportError` y no se instala nada. |
| `allowShared` | `true`/`false` | Es la autorización del toggle «Todas las iguales». Nunca se persiste en settings. |

Reglas de reseteo de la autorización (`scope` vuelve a `'unique'`, `allowShared` a `false`):
- cambiar de material (paleta, flechas ←/→ en la herramienta) o de modo (Tab, botones de la paleta);
- cerrar/detener la herramienta, cambiar de modelo, reabrir la paleta;
- `remember_smart_settings` guarda siempre `scope:'unique'` para el modo inmediato (el toggle no sobrevive).

`validate_smart_options` para inmediato: `side=='both'`, `batch!=true`, y (`scope=='unique' && allowShared!=true`) **o** (`scope=='all' && allowShared==true`).

Settings (`smart_paint_settings_v2`, mismo esquema 2, claves nuevas): `edgeCount` (ya existía), `lastMaterials` = `{"sheet":"<catalogId>","edge":"<catalogId>"}` (solo ids de catálogo; el UUID es del modelo y se resuelve con `PaintMaterials#prepare` sin instalar).

## 2. Herramienta (`SmartPaintTool`) en modo inmediato

### 2.1 Teclado
- **Tab / Mayús+Tab**: alterna `sheet` ↔ `edge` (desde `remove_edge` va a `sheet`). Pide al controlador el último material del modo destino (`switch_mode` callback). Si no hay material recordado o no está listo, no cambia de modo y avisa «Elegí un canto en la paleta para usar Tab.» (o placa). Resetea el alcance a «Solo esta».
- **Ctrl+Tab** (`COPY_MODIFIER_MASK`, respaldo 8): en `edge`/`remove_edge` cicla `edgeCount` 1→2→4→1 (con Mayús, al revés). En `sheet` avisa que los cantos se eligen en modo canto. Se recuerda en settings.
- Ignora repeticiones de tecla (`repeat>1`). Nunca desactiva la herramienta.
- ←/→ siguen rotando materiales del mismo tipo y resetean el alcance.

### 2.2 Veredicto de aptitud (PINTURA-08 + F-PINT-B)
`PaintVerdict` (nuevo, en `smart_paint_tool.rb`): cache `{clave => veredicto}` con clave
`[definition.guid, generación, modo, edgeCount, escalas_redondeadas(3 decimales), faceId (solo canto)]`.
- `generación` = contador de transacciones: un `Sketchup::ModelObserver` mínimo (solo `+=1` en `onTransactionCommit/Undo/Redo/Abort` y `onTransactionEmpty`; nunca recorre el modelo) agregado en `activate` y quitado en `deactivate`; además la herramienta suma 1 después de cada clic propio. Si el modelo no admite observers (dobles), la generación solo cambia con los clics propios.
- El veredicto es `{ok:true|false, reason:String|nil, expandedFaceIds:[...], sharedCount:Integer, broadSheet:Boolean}` y se calcula con la API de `NativePaint` sobre un nodo armado del pick (`{'_entity'=>instancia,'_parents'=>contenedores,'id'=>pieceId}`):
  - `sheet`: `automatic_axes` + `expanded_faces(paintScope:'piece')` (las 2 caras anchas únicas). Si falla → motivo de la excepción.
  - `edge`/`remove_edge`: `automatic_axes` + `expanded_faces(edgeCount)` desde la cara apuntada. Caras partidas o rebajes → bloqueado con el motivo de `NativePaint` (no se pinta a medias).
  - `edge`: **F-PINT-B** si ninguna cara ancha tiene una placa reconocida (`MaterialResolver.observe_binding(...).dig('binding','kind')=='sheet'` en frente o dorso, o heredada) → `ok:false`, motivo «Canto sin placa: pintá primero la placa de esta pieza.».
  - pieza bloqueada (`locked?`) → `ok:false`.
- Nunca hace I/O de catálogo, hash de archivos ni inventario completo. El clic sigue validando todo (`apply_immediate`), el veredicto solo adelanta el rechazo.
- Si el veredicto es `ok:false`, el clic no llama al servicio: muestra el motivo (estado + tooltip) y no hay Undo.

### 2.3 Copias (PINTURA-02)
`OccurrenceIndex`: por generación, recorre solo instancias (Group/ComponentInstance, nunca caras) desde `model.entities` y arma `definición → [rutas de instancias]`. `sharedCount` = cantidad de rutas de la definición de la pieza apuntada.
- Alcance «Solo esta» (`unique`): resalta solo la pieza; el tooltip dice «Solo esta (de N)». Al hacer clic, el servicio aísla con make_unique solo si N>1 (comportamiento existente).
- Alcance «Todas» (`all` + `allowShared`): resalta las mismas caras en **todas** las copias (tope de dibujo 200 copias) y el clic pinta la definición con `scope:'all'`, **sin make_unique** y con un solo Undo.
- En el servicio (`SmartPaint#plan`), el modo inmediato deja de forzar `scope:'unique'`: respeta `'all'` solo si `allowShared==true`; si no, `'unique'`.

### 2.4 Feedback en la vista
- `Sketchup.status_text=` (si existe): `«Pintar pieza · Melamina Blanca · Solo esta (de 4) · último error: …»`. Se actualiza solo cuando cambia.
- Tooltip `view.draw_text` 2 líneas junto al cursor (offset 18 px × `UI.scale_factor` si existe):
  - línea 1: nombre de la pieza · modo (`Pieza` / `1 canto` / `2 cantos` / `4 cantos` / `Quitar canto`) · alcance (`Solo esta (de N)` / `Todas las iguales (N)`);
  - línea 2: material activo en verde (`ok`) o el motivo en rojo (`ok:false`).
- Preview con el color real del material activo (`material.color` del material nativo con ese UUID; si tiene textura, igual el color promedio que da la API), alpha propio 110 en hover, 60 en las copias. Bloqueado → rojo translúcido. Sin material → naranja (anterior).
- Cursores propios (`sketchup_offline/cursors/paint-{piece,edge,remove,blocked}.png`, 32 px, hotspot 3,3, generados por `scripts/generate-paint-cursors.py`): `onSetCursor` elige por modo; `blocked` si el veredicto del hover es `ok:false`. `UI.create_cursor` perezoso, una vez por proceso; si falta el archivo o la API, cursor nativo.

### 2.5 Eventos a la paleta (F-ARQ-B)
`emit` desde el hover pasa por un limitador: solo se envía si cambió la firma `[mensaje, error, pieceId, faceId, sharedCount, ok, reason, edgeCount, scope, mode]` **y** pasaron ≥100 ms desde el último envío. Si cambió pero no pasaron 100 ms, queda pendiente y se envía con un `UI.start_timer(0.1,false)` (o en el próximo evento). Los eventos de clic, error de clic, cambio de modo/opciones, `activate`/`deactivate`/`stop` se envían siempre y al instante (y limpian el pendiente). Reloj inyectable (`clock:` lambda, `Process.clock_gettime(Process::CLOCK_MONOTONIC)` por defecto) para las pruebas.

### 2.6 Medición (PINTURA-09)
Cada clic inmediato mide `hit+veredicto+apply` en ms. `PaintTimingLog` (en `smart_paint_tool.rb`): anillo en memoria de 200 entradas `{at, ms, mode, edgeCount, scope, changed, ok}` y una línea JSONL en `<carpeta de datos>/diagnostico/pincel-tiempos.jsonl` (rota a `.1` al superar 512 KB; si falla la escritura, solo `warn`). El controlador expone el resumen (`count, p50, p95, max, last`) en `smart_tool_status['timings']` y en la acción `diagnostic` (`paintClicks`). Objetivo del plan: <150 ms con 500 piezas (se valida en SketchUp, no con dobles).

## 3. Hover → evento (lo que lee la paleta)

```json
{"hover":{"pieceId":"1/11","faceId":"101","name":"Puerta 3","side":"both",
  "sharedCount":4,"scope":"unique","edgeCount":4,"expandedFaceIds":["103","104","105","106"],
  "verdict":{"ok":false,"reason":"Canto sin placa: pintá primero la placa de esta pieza."}},
 "options":{"mode":"edge","edgeCount":4,"scope":"unique","catalogId":"…","materialUuid":"…"}}
```

## 4. Paleta inmediata (`SmartPaintPalette` quickMode)
- Selector segmentado «1 · 2 · 4» (`role=group`, `aria-label="Cantos por clic"`, botones `aria-pressed`) visible en modo canto y quitar canto. Cambiarlo reenvía `smart_quick_start` con el `edgeCount` nuevo (sin detener la herramienta); el valor llega de `settings.edgeCount` al cargar.
- Conmutador «Solo esta / Todas las iguales (N)» (`role=group`, `aria-label="Alcance del clic"`). N = `tool.hover.sharedCount` (o `—` sin hover). Elegir «Todas» envía `scope:'all', allowShared:true`; cualquier cambio de material o de modo lo vuelve a «Solo esta» antes de enviar. Aviso visible: «Pinta todas las copias de la definición con un solo Undo.»
- El pie muestra el veredicto del hover (motivo en rojo si `ok:false`).
- Tab/Ctrl+Tab se documentan en la ayuda; en la paleta no se capturan (Tab conserva la navegación del formulario).
