# Pincel avanzado (adelanto del Hito 7) — contrato de diseño

Base: `audit/opencutlist-paridad-2026-10-21/PLAN_PARIDAD_OCL.md` §2.1 y §5 Hito 7, sobre el pincel del Hito 2 (`DISENO.md`).
Clean-room; mismas invariantes: un clic = una operación = un Undo, el hover no escribe, ante la duda se bloquea con motivo, nunca make_unique con alcance «todas».
Orden: valor diario primero. Todo sigue pendiente de validación en SketchUp.

## 1. PINTURA-15 · varias caras por lado (P2)
- `NativePaint#boundary_frame` ya agrupa por lado las caras cuyo plano coincide con el borde. Hoy 2/4 cantos exigen **una** cara por lado.
- Nuevo: si la pieza es rectangular (`shape['rectangular']`) y un lado tiene **varias** caras coplanares sobre ese borde, el lado se pinta completo (todas sus caras), en 1, 2 o 4 cantos. Con 1 canto, apuntar cualquier mitad pinta el lado entero.
- Se sigue bloqueando: pieza no rectangular (rebaje, muesca, calado), lado sin ninguna cara, una cara del lado que no esté contenida en el plano del borde.
- El preview muestra todas las caras del lado. `validate_edge!` acepta las caras del grupo.
- Cambia por diseño la prueba del Hito 2 «lado partido bloquea 2 y 4»: ahora pinta el lado completo. La batería nativa (d) sigue siendo con rebaje (no rectangular → bloqueado).

## 2. PINTURA-11 · pick en profundidad (P2)
- ↑/↓ recorren las **piezas distintas** bajo el cursor (todas las rutas del `pick_helper`, deduplicadas por pieza, de la más cercana a la más lejana). ←/→ siguen cambiando material.
- La elección se conserva mientras el cursor se mueva menos de 6 px (× `UI.scale_factor`) y la lista de piezas no cambie; si no, vuelve a la más cercana.
- El clic pinta la pieza elegida (misma validación). Tooltip línea 1 agrega `· 2/3 bajo el cursor` cuando hay más de una.

## 3. PINTURA-07 · cuentagotas temporal (P2)
- Mantener apretada la tecla del cuentagotas convierte el clic en «tomar material» (solo lectura, misma lógica que `MaterialSampleTool`: binding válido, tipo placa/canto, listo en este modelo). Al soltar la tecla, el pincel queda con el material tomado y el modo correspondiente (placa → Pieza, canto → Canto), alcance reseteado a «Solo esta».
- Material sin vínculo aprobado o no listo: no cambia nada y avisa el motivo.
- Tecla configurable en settings `sampleKey`: `'shift'` (defecto: en el pincel inmediato Mayús+clic no se usa), `'alt'`, `'off'`. Alt no es defecto por el menú de Windows. Mayús+Tab sigue siendo Tab (cancela el cuentagotas temporal).
- Cursor propio mientras está apretada (reusar `paint-piece`/`paint-edge` no; agregar `paint-sample.png` al generador y al RBZ).

## 4. F-PINT-C · revisar lo que falta (P2)
- Conmutador «Revisar lo que falta» (paleta y tecla `R` en la herramienta). Mientras está activo, la herramienta dibuja sobre **todas** las piezas (vía `OccurrenceIndex`, tope 2000):
  - rojo: sin placa reconocida en sus caras anchas;
  - ámbar: con placa, cantos parciales (algún lado con canto y otro sin);
  - sin marca: placa y 0 o 4 lados con canto (estado consistente).
- El tooltip del hover agrega una línea `Placa: <nombre> · Cantos: 2/4`.
- Cálculo por definición + generación (mismo caché del veredicto). No escribe el modelo.
- La paleta muestra el conteo `Sin placa: N · Cantos parciales: M`.

## 5. PINTURA-13 · menú contextual (P2)
`getMenu(menu, flags, x, y, view)` en el pincel inmediato:
- «Solo esta» / «Todas las iguales (N)» (marcado según el alcance; elegir «Todas» desde el menú **es** la autorización explícita de ese gesto, igual que el toggle, y se resetea con las mismas reglas);
- «1 canto» / «2 cantos opuestos» / «4 cantos» (en canto);
- «Pintar pieza» / «Pintar canto»;
- «Ocultar esta pieza» (una operación, un Undo, solo la instancia apuntada) y «Mostrar piezas ocultadas por el pincel» (una operación, solo las que ocultó esta herramienta en la sesión);
- «Revisar lo que falta».
Todo cambio de opciones se emite a la paleta y se recuerda como con el teclado.

## 6. Paleta inmediata
- Conmutador «Revisar lo que falta» con el conteo.
- En «···»: «Tecla del cuentagotas: Mayús / Alt / Desactivada» (se guarda en settings vía `smart_quick_start` → `sampleKey`, o una acción `smart_settings_update` acotada a esa clave).
- Ayuda: «↑/↓ eligen la pieza de atrás · Mayús sostenida toma material».

## 7. Claves del puente (Ruby ↔ paleta)
- Acción nueva `smart_tool_option` `{key, value}`, solo con estas claves:
  - `reviewMissing` (`true`/`false`): activa o apaga la revisión en la herramienta activa sin reiniciarla; no se persiste.
  - `sampleKey` (`'shift'|'alt'|'off'`): se persiste en settings (esquema 2) y se aplica a la herramienta activa.
  Devuelve `{toolState}`. Cualquier otra clave o valor → `ExportError`. No instala ni pinta nada.
- `smart_palette_load` → `settings.sampleKey` (defecto `'shift'`).
- Evento de la herramienta:
  - `options.sampleKey`, `options.reviewMissing`;
  - `review: {active, missingSheet, partialEdges, truncated}` (solo con la revisión activa);
  - `hover.depth: {index, count}` (1-based, solo si count>1);
  - `hover.summary: {sheetName|null, edgeSides: 0..4}`;
  - `sampling: true` mientras la tecla del cuentagotas está apretada.
