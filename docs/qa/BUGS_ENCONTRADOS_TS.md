# Bugs encontrados por las pruebas unitarias TypeScript

> **Estado (rama `claude/noche-bugs-qa`): los cuatro están corregidos** y sus pruebas pasaron de `it.skip` a `it` como regresión.
> - BUG-TS-01: `ensureGlyphs` trata `\t` y `\r` como espacio en blanco y `text()` los dibuja como espacio. La prueba cubre observaciones con tabulación y con `\r\n`, y un nombre de pieza con tabulación.
> - BUG-TS-02: `previewFileName` corta con `Array.from(...)` (puntos de código).
> - BUG-TS-03: `carryNotice` dice «se descartó» / «se descartaron».
> - BUG-TS-04: `importDocument` recorta el nombre del mueble antes del reemplazo.

Pasada de cobertura vitest de la rama `claude/noche-cobertura-ts`. **No se corrigió código de producto**: cada bug queda con su prueba en `it.skip` y el motivo, lista para activarse cuando se corrija.

| ID | Severidad | Archivo:línea | Prueba en `it.skip` |
|---|---|---|---|
| BUG-TS-01 | Media | `sketchup_offline/ui/pdf.ts:42` | `tests/cobertura-pdf-pedido.test.ts` — «una tabulación pegada en observaciones…» |
| BUG-TS-02 | Baja | `sketchup_offline/ui/pdf.ts:117` | `tests/cobertura-pdf-pedido.test.ts` — «no parte un emoji en el corte de 80 caracteres…» |
| BUG-TS-03 | Baja (texto visible) | `sketchup_offline/ui/names.ts:25` | `tests/cobertura-guia-nombres.test.ts` — «el aviso de varias ediciones descartadas…» |
| BUG-TS-04 | Baja | `lib/model.ts:125` | `tests/cobertura-lib.test.ts` — «un mueble con nombre solo de espacios…» |

## BUG-TS-01 — Una tabulación o un `\r` bloquean el PDF A4 con un carácter invisible

- **Dónde:** `sketchup_offline/ui/pdf.ts:42` (`ensureGlyphs`). Solo exime `\n`; la tabulación (`\t`) y el retorno de carro (`\r`) no tienen glifo en DejaVu Sans.
- **Escenario:** el operador pega en «Observaciones de armado» texto copiado de una planilla (`Tornillos⇥4 × 50`). El `<textarea>` conserva la tabulación y `guide_store.rb:113` la acepta porque solo rechaza `\x00-\x08`, `\x0b`, `\x0c` y `\x0e-\x1f`. Al exportar, `createOfflinePdf` lanza `A4FitError` de tipo `glyph`:
  `Módulo bajo · 800: El PDF no puede representar el carácter «	». Qué hacer: Reemplazá el carácter «	».`
  En pantalla el carácter entre comillas no se ve, así que el operador no sabe qué borrar. Lo mismo pasa con `\r` (guía guardada con fin de línea `\r\n`) y con un nombre de pieza de SketchUp que tenga una tabulación interna.
- **Esperado:** tratar `\t`/`\r` como espacio en blanco (de hecho `linesFor` ya parte por `\s+` después de validar), o al menos nombrar el carácter de forma visible («tabulación»).
- **Impacto:** bloquea la hoja A4 de ese mueble hasta que el operador descubra el carácter invisible. La TSV (`tsvCell`) sí lo limpia, así que pedido y PDF divergen.

## BUG-TS-02 — El nombre del archivo PDF puede terminar con medio emoji

- **Dónde:** `sketchup_offline/ui/pdf.ts:117` (`previewFileName`): `.slice(0,80)` corta por unidades UTF-16.
- **Escenario:** obra con 79 caracteres seguidos de un emoji (`'A'.repeat(79)+'😀'`). El nombre queda con un *surrogate* alto suelto: `AAAA…A\uD83D-A4-2026-10-05.pdf`. Según el sistema de archivos se guarda como `�` o falla el guardado.
- **Esperado:** cortar por puntos de código (`Array.from(...).slice(0,80).join('')`).
- **Impacto:** bajo; requiere nombres de proyecto largos con emoji.

## BUG-TS-03 — El aviso dice «se descartón» en plural

- **Dónde:** `sketchup_offline/ui/names.ts:25` (`carryNotice`): `` `se descartó${lost===1?'':'n'}` ``.
- **Escenario:** al reorientar la lista de propuestas de nombres se pierden 2 ediciones manuales. El aviso muestra «2 ediciones quedaron fuera de la lista y se descartón.»
- **Esperado:** «…y se descartaron.»
- **Impacto:** texto visible incorrecto en la UI de nombres; no afecta datos.

## BUG-TS-04 — Un mueble con nombre de solo espacios no recibe el nombre de reemplazo

- **Dónde:** `lib/model.ts:125` (`importDocument`): `name: root.name || 'Mueble sin nombre'`. Las piezas usan `node.name.trim() || \`Pieza N\``, el mueble no recorta.
- **Escenario:** un grupo de SketchUp llamado `"   "`. El mueble se importa con nombre `"   "`: `createOfflinePdf` genera la hoja con el encabezado del mueble en blanco y los mensajes de `A4FitError` empiezan con `"   : "`. No hay validación que lo bloquee (`guideIssues` solo revisa `groupName`).
- **Esperado:** `root.name.trim() || 'Mueble sin nombre'`, igual que las piezas.
- **Impacto:** bajo; caso poco frecuente, pero produce una hoja impresa sin título.

## Observaciones que no se registran como bugs

- `listRows` con «Agrupar por medidas» redondea las medidas a 0,1 mm para la clave de plegado: piezas que difieren en menos de 0,05 mm se suman en una fila y se imprime la medida de la primera. Es tolerancia deliberada (prueba «tolera diferencias de redondeo menores a 0,05 mm»).
- El PDF imprime las medidas con separador de miles (`1.234,5`) y la TSV sin él (`1234,5`). Es coherente con cada destino (hoja impresa en es-AR / planilla que debe parsear números).
