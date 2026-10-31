# Planos Santo 0.8.26 · preparación para SketchUp 2022

> **NO PROBADO EN SKETCHUP 2022.** Este trabajo se hizo en Linux, sin SketchUp. Todo lo que sigue es preparación y evidencia indirecta: análisis estático, Ruby 2.7 real fuera de SketchUp, Chromium 88 real fuera de SketchUp y dobles de la API. No se afirma compatibilidad. La extensión sigue apuntando a SketchUp 2026 Windows. 2022 queda como **objetivo pendiente de validación** y el manifiesto del RBZ lo dice: `validation: «… SketchUp 2022 sin probar»`.

Rama local `agente/su2022-0826`, sobre `e4f1479` (WIP 0.8.26). `version.json` no se tocó.

## 1. Versiones encontradas

Fuentes consultadas el 2026-10-31. `ruby.sketchup.com`, `forums.sketchup.com` y `help.sketchup.com` no se pueden abrir desde este entorno (el proxy los bloquea). Por eso, de los foros se usan los resúmenes del buscador. Los datos oficiales salen de la gema **sketchup-api-stubs 0.7.11** (rubygems.org), que publica Trimble y que se genera desde la misma documentación YARD de `ruby.sketchup.com`. Tiene el `@version` de cada método y la tabla de CEF de `UI::HtmlDialog`.

| Dato | SketchUp 2022 | SketchUp 2026 | Fuente | Certeza |
|---|---|---|---|---|
| Ruby | **2.7.2** (2021.1 subió de 2.7.1 a 2.7.2; 2023.0.2 pasó a 2.7.7) | 3.2.x (desde 2024.0) | Foro «SketchUp 2021.1 Developer Resources» <https://forums.sketchup.com/t/sketchup-2021-1-developer-resources/167137>. Foro «Ruby version» <https://forums.sketchup.com/t/ruby-version/218319>, donde un usuario de 2022 Pro informa `RUBY_VERSION` 2.7.2. Para 2024: <https://forums.sketchup.com/t/sketchup-2024-0-developer-resources/266851> y notas de 2024.0.2 <https://prod-aws-help.sketchup.com/node/3783>. | Media-alta: foro de desarrolladores y usuarios, no una nota oficial leída directamente. |
| json (gema estándar) | 2.3.0 (la de Ruby 2.7.0 a 2.7.2) | 2.x reciente | Gema `json` 2.3.0 descargada de rubygems.org: no tiene `JSON.load_file`. | Alta para la gema. Que SketchUp traiga exactamente esa versión se infiere de Ruby 2.7.2. |
| CEF/Chromium de `UI::HtmlDialog` | **CEF 88** (Chromium 88.0.4324.x) | No figura en la tabla. La última fila es «SketchUp 2025.0: CEF 128». | sketchup-api-stubs 0.7.11, `UI/HtmlDialog.rb` (= <https://ruby.sketchup.com/UI/HtmlDialog.html>): «2017.0 CEF 52 · 2018.0 CEF 56 · 2019.0 CEF 64 · **2021.1 CEF 88** · 2024.0 CEF 112 · 2025.0 CEF 128». La tabla marca los cambios, y entre 2021.1 y 2024.0 no hay ninguno. Foro <https://forums.sketchup.com/t/are-the-calls-to-the-2024-and-2023-html-windows-significantly-different-from-2022-and-lower/267400>: «SU 2023 and 2022 both used the same Chromium framework v 88». Foro <https://forums.sketchup.com/t/htmldialog-cef-support-for-es-modules/219349>: «v 88.0.4324.150». | Alta: tabla oficial más dos testimonios. **Falta confirmarlo en la máquina.** El diagnóstico ahora muestra `cefVersion` y `chromeVersion` (prueba manual M2). |

Elegí el **piso conservador chrome88**. El target anterior (`chrome109`) no correspondía a ninguna versión de SketchUp: en 2024 y 2025 hay 112 y 128 o más.

## 2. Inventario de la API de SketchUp

Este inventario es automático. `scripts/check-ruby27.rb` lee los `@version` de los stubs en cada ejecución: hay 73 métodos y 6 clases cuya primera versión es 2023 o posterior, y los cruza con cada llamada de los 37 archivos `.rb` (los del RBZ y todos los `sketchup_offline/*.rb`, incluidos `draw_component_tool.rb`, `grain.rb` y `piece_grain.rb`). Una llamada a esa API tiene que estar protegida en el mismo método con `respond_to?`, con `defined?` o con `Sketchup.version`. Resultado: **0 usos sin protección**. La tabla también revisa a mano lo que pidió el encargo.

| API | Versión (stubs) | Uso en el código | Estado en 2022 |
|---|---|---|---|
| `Sketchup::Overlay`, `Model#overlays` | 2023.0 | No se usa. `PieceHighlightTool#overlays` es un método propio. | No aplica. |
| PBR de `Material` (`roughness_*`, `metallic_*`, `normal_*`, `ao_*`, `workflow`) | 2025.0 | No se usa. | No aplica. |
| `Sketchup::Snap`, `Entities#add_snap` | 2025.0 | No se usa. | No aplica. |
| `UI.scale_factor(view)` (con argumento) | 2025.0 | No se usa. Se llama `UI.scale_factor` sin argumento (2017). | Existe. |
| Coordenadas de `Tool`/`View`/`InputPoint#pick`/`pickray` en píxeles lógicos | 2025.0 (antes, físicos) | `smart_paint_tool.rb`, `piece_highlight_tool.rb`, `draw_component_tool.rb`. | Funcionan en 2022 porque cada API devuelve y recibe píxeles del mismo tipo. El tamaño de la tira 2D se multiplica por `UI.scale_factor`, que es el modelo de 2017 a 2024. **Revisar a 125 %/150 %** (M7). |
| `View#load_texture`, `release_texture`, `draw2d(texture:, uvs:)` | 2020.0 | `smart_paint_tool.rb:1422-1463`, protegido con `respond_to?(:load_texture)`. | Existe. |
| `View#text_bounds` | 2020.0 | `smart_paint_tool.rb:1140,1165`, protegido. | Existe. |
| `Face#texture_projected?`, `texture_positioned?` | 2021.1 | `smart_paint.rb:78-80` y `grain.rb:33`, protegidos. | Existe. |
| `Face#uv_tile_at` | 2021.1 | No se usa. | No aplica. |
| `Face#position_material`, `Texture#image_rep` | 6.0 / 2018 | `grain.rb`, `smart_paint_tool.rb:1432`. | Existe. |
| `Material#save_as`, `Materials#load` | 2017 | `material_library.rb:185,190,367`, `model_material_catalog.rb`. | Existe. |
| `Model#active_path=` | 2020.0 | `piece_highlight_tool.rb:190-264`, protegido. | Existe. |
| `Entities#build` | 2022.0 | No se usa: `BoundedZip.build` y `Cutlist.build` son propios. | Existiría (justo 2022.0). |
| `InputPoint#instance_path`, `InstancePath`, `persistent_id` | 2017 | `names.rb`, `skm_import.rb`, `model_watch.rb`, `draw_component_tool.rb`. | Existe. |
| `Model#find_entity_by_persistent_id` | 2017 | No se usa. | No aplica. |
| `UI.create_cursor` con SVG | 6.0; SVG en Windows desde 2016 | `smart_paint_tool.rb:445-467`. Sin SVG usa PNG 32/64 y, si no hay, el cursor nativo. | Existe. |
| `Sketchup::ImageRep` | 2018 | `photo_material.rb`, protegido con `defined?`. El mensaje ya no dice «SketchUp2026». | Existe. |
| `UI::HtmlDialog#get_size` | 2021.1 | `offline.rb:310`, protegido. | Existe. |
| `HtmlDialog#set_size`/`set_position`/`set_can_close`/`set_on_closed`/`bring_to_front`/`visible?` | 2017 | `offline.rb`. | Existe. |
| `Sketchup.focus` | 2021.1 | `offline.rb:350,1655`, protegido. | Existe. |
| `UI::Command` con iconos SVG | Windows desde 2016 | `quick_toolbar.rb`. | Existe. |
| `Environment#thumbnail` (2025) frente a `importer.thumbnail` | — | `material_library.rb:1106,1113` y `model_material_catalog.rb:87` llaman a `SkmImport#thumbnail`, que es propio. | Aviso del chequeo revisado: no es la API. |

No hay ninguna compuerta de versión que rechace SketchUp anterior a 2026. No la hay en `bootstrap.rb`, en `planos_santo.rb` ni en el registro de `SketchupExtension`. La única comprobación de versión exige OpenCutList 7.1.0 en `workshop.rb`, y es ajena a SketchUp. El manifiesto pasa de `target:'SketchUp 2026 Windows'` a `target:'SketchUp 2022-2026 Windows'` y agrega `browserTarget:'chrome88'`.

## 3. Ruby 2.7

Revisé sintaxis y biblioteca estándar de Ruby 3.0 o posterior, entre otras: `Hash#except`, `Array#intersect?`, `{x:}`, `def f = …`, `case/in`, `it`, `Data`, `&`/`*`/`**` anónimos, `Enumerable#compact`, `Integer#ceildiv`, `String#bytesplice`, `Set` sin `require`, `private attr_*`, `tally(h)`, `transform_keys(h)`, `Dir.glob(sort:)`, `unpack1(offset:)`, opciones nuevas de JSON, `JSON.load_file`, `Regexp.timeout` y `Time.now(in:)`. También busqué el congelado de cadenas interpoladas con `frozen_string_literal`: en 2.7 `"#{x}"` queda congelada y en 3.0 no. `Kernel#then` existe desde 2.6 y no se marca. `filter_map`, `tally` sin argumentos, rangos sin comienzo y `_1` son de 2.7 y están permitidos.

**Encontrado y corregido:**

- `sketchup_offline/offline.rb:217` y `:1421`: `remembered.except(...)` (`Hash#except`, Ruby 3.0) pasa a `remembered.reject { |key,_| … }`. En Ruby 2.7 tiraba `NoMethodError` dentro de `quick_action`, que lo atrapa como error genérico. Por eso la reanudación de pintura desde la barra rápida y «Quitar canto» fallaban **en silencio**. Ocho pruebas Ruby fallaban con Ruby 2.7 real antes del cambio y pasan después.

**Revisado sin cambio.** Son cinco métodos con argumento opcional y palabras clave: `CatalogStore#suggested_item`, `GuideStore#keys!`, `MaterialLibrary#locked`, `NativePaint#status` y `#tool_guard!`. En Ruby 2.7, un Hash final se puede tomar como palabras clave. Revisé todas las llamadas: `locked` ya acepta los dos caminos (`data = request if data.nil?`) y las demás reciben Arrays, Strings, booleanos o Hashes con claves String, que 2.7 deja como posicionales.

**Verificación objetiva:**

- `npm run check:ruby27` (`scripts/check-ruby27.mjs` + `scripts/check-ruby27.rb`): pasa `Parser::Ruby27` (gema `parser` 3.3.13.0), la lista negra de métodos de Ruby 3.0 o posterior, la API de SketchUp 2023 o posterior y la cadena de `require_relative` de cada archivo del RBZ. Antes corre una autoprueba con `scripts/fixtures/ruby27/` para comprobar que cada regla sigue marcando su caso. La salida actual es 37 archivos, 0 errores y 8 avisos revisados.
- Ruby 2.7 real: `node scripts/fetch-ruby27.mjs` desempaqueta Ruby **2.7.0** de Ubuntu 20.04 (`ruby2.7 2.7.0-5ubuntu1.18`, `libssl1.1`), con json 2.3.0. Con eso, `check:ruby27` corre además `ruby -wc` sobre los 37 archivos, y `npm run test:offline:ruby27` corre **toda** la suite Ruby con los dobles de la API. Es 2.7.0 y no el 2.7.2 de SketchUp, aunque son la misma línea de lenguaje y de biblioteca estándar.
- La cadena de `require_relative` encontró que `offline.rb` requiere `draw_component_tool.rb`, que no entraba en el RBZ. La instalación habría fallado en cualquier versión. Se agregó a `copies`, junto con `grain.rb` y `piece_grain.rb`.

## 4. Navegador interno (CEF 88)

- `scripts/build-offline.mjs`: `BROWSER_TARGET='chrome88'` para `app.js` y `palette.js`. esbuild baja a ese piso la sintaxis y el CSS: anidamiento, colores nuevos y `inset`. No agrega APIs de runtime.
- Polyfills en `sketchup_offline/ui/polyfills.ts`, importado primero en `index.tsx` y `palette.tsx`. Cada uno se instala sólo si falta, así que 2024-2026 conservan la versión nativa (lo prueba vitest):

| API | Chromium | Dónde se usa |
|---|---|---|
| `crypto.randomUUID` | 92 | `ui/bridge.ts:63` (**cada pedido a Ruby**), `App.tsx:374`, `lib/model.ts:128` |
| `structuredClone` | 98 | `ui/guide.ts:41-62`, `App.tsx:365`, `lib/model.ts:135` (datos de la guía) |
| `Array.prototype.at` | 92 | `ui/PaintPanel.tsx:33` |
| `Array.prototype.findLast/findLastIndex`, `Object.hasOwn`, `String/TypedArray.at` | 93-97 | No se usan hoy. Se cubren porque esbuild no los detecta y son comunes. |

  Contraprueba en Chromium 88 real con el mismo bundle sin polyfills (esbuild `chrome109`, como 0.8.25): la interfaz arranca y el primer pedido muestra **«crypto.randomUUID is not a function»**, así que no habla con Ruby. Con polyfills, el pedido sale.
- Librerías revisadas en el bundle: `react-dom` 19 (`reportError` con detección, `Error(…, {cause})` ignorado sin error en 88), `zod` 4 (`URL.canParse` con detección), `three` 0.180 (`.at()` es `Ray#at`; WebGL2 existe en 88) y `pdf-lib`/`fontkit` (`findLastMatch` es una función propia). Ninguna necesita más polyfills.
- CSS. En Chromium 88, cuando un selector no se entiende, se descarta la regla entera. Existe: `inset` (87), `aspect-ratio` (88), `gap` en flex (84), `:is()` (88), `:focus-visible` (86) y `margin-block`/`padding-block` (87). No se usan container queries, `color-mix`, anidamiento, `dvh/svh`, `@layer` ni `text-wrap`.
  - **`:has()`** (105) aparece en 7 reglas de `paint.css`, `photo-material.css`, `style.css` y `ux-shell.css`. Respaldo: si `CSS.supports('selector(:has(*))')` es falso, `polyfills.ts` marca los `label` con `ps-has-select`, `ps-has-non-checkbox`, `ps-has-radio`, `ps-has-direct-checkbox` y `ps-has-checked`, usando un `MutationObserver` y el evento `change`. `compat-chromium88.css` repite cada regla con esas clases. En 2024-2026 las clases no se agregan.
  - Avisos que degradan solos y quedan así: `accent-color` (93) muestra las casillas con el color nativo y `scrollbar-gutter` (94) no reserva el canal de la barra.
- `scripts/check-browser-floor.mjs` corre **en cada `build:offline`** y falla con APIs posteriores a 88 sin polyfill (`toSorted`, `Object.groupBy`, `Promise.withResolvers`, `AbortSignal.timeout`, `checkVisibility`, `roundRect`, Popover, flags `d`/`v` de RegExp, etc.). También falla con CSS no soportado y con cualquier `:has()` sin respaldo, y comprueba que el target sea `chrome88` o menor. Acepta un uso precedido por `typeof` (detección de la función). Hoy da 0 errores y 14 avisos (`accent-color`, `scrollbar-gutter`).
- **ICU de Chromium 88:** con `toLocaleString('es-AR')`, el ICU de Chromium 88 no agrupa los números de cuatro cifras («2750 × 1830 mm»), y el Chromium actual sí («2.750 × 1.830 mm»). Lo encontró la corrida en Chromium 88 (`maderera-placas.spec.ts`). `mm()` en `lib/model.ts` ahora agrupa a mano. Contra la salida anterior en Node/ICU actual da 0 diferencias en 20 000 valores, así que en 2026 no cambia nada. Quedan otros `Intl.NumberFormat` sin `useGrouping:false` con la misma diferencia, sólo estética, en números de 4 cifras: `A4SheetPreview.tsx:13` y `PhotoMaterialPanel.tsx:83`.
- Chromium 88 real: `npm run test:chromium88` descarga una vez el snapshot oficial r827102 (**Chromium 88.0.4324.0**, el punto de rama de M88) de `storage.googleapis.com/chromium-browser-snapshots` y corre la suite Playwright offline. Para esa corrida, y restaurándolo al final, protege la llamada de Playwright 1.56 a `Element.checkVisibility` (Chromium 105) dentro de su propio script inyectado. El bundle no se toca. Las specs que arman su propio bundle de prueba (`target:'chrome109'`, sin polyfills) se bajan a chrome88 con los polyfills inyectados mediante `scripts/chromium88-esbuild-preload.cjs`. `tests/offline/chromium88-compat.spec.ts` comprueba con estilos computados que el respaldo de `:has()` y los polyfills dan el mismo resultado en el Chromium actual y en el 88.

## 5. Cambios (rama `agente/su2022-0826`)

| Archivo | Cambio |
|---|---|
| `sketchup_offline/offline.rb` | `Hash#except` pasa a `reject` (2 sitios). El diagnóstico agrega `cefVersion` y `chromeVersion`. `create_component` no se tocó. |
| `sketchup_offline/photo_material.rb` | Mensaje de `ImageRep` neutral respecto de la versión. |
| `lib/model.ts` | `mm()` agrupa miles a mano (ICU de Chromium 88). |
| `scripts/build-offline.mjs` | `chrome88`; `draw_component_tool.rb`, `grain.rb` y `piece_grain.rb` entran al RBZ; manifiesto `target`/`browserTarget`/`validation`; corre `check-browser-floor`. |
| `scripts/package-offline-rbz.py`, `sketchup_offline/test/installation_test.rb` | 92 archivos (antes 89); nuevos `validation`, `target` y `browserTarget`. |
| `sketchup_offline/ui/polyfills.ts`, `compat-chromium88.css`, `index.tsx`, `palette.tsx` | Polyfills y respaldo de `:has()`. |
| `scripts/check-ruby27.{mjs,rb}`, `scripts/fixtures/ruby27/*` | Chequeo de Ruby 2.7 y de la API 2022, con autoprueba. |
| `scripts/check-browser-floor.mjs` | Escaneo del bundle contra Chromium 88. |
| `scripts/fetch-ruby27.mjs`, `scripts/test-chromium88.mjs`, `scripts/chromium88-esbuild-preload.cjs` | Ruby 2.7 y Chromium 88 reales para Linux. |
| `tests/sketchup2022-compat.test.ts`, `tests/offline/chromium88-compat.spec.ts` | Pruebas de polyfills, escaneo y respaldo CSS. |
| `sketchup_offline/test/windows_io_test.rb`, `direct_paint_test.rb` | Sin `def … =` y con un stub tolerante, para que la suite corra también en 2.7. |
| `package.json` | `check:ruby27`, `check:browser-floor`, `test:chromium88`, `test:offline:ruby27`; `verify:offline` incluye `check:ruby27`. |

## 6. Cambios pendientes en archivos de otros agentes

Ningún archivo de vetas, dibujo o interfaz **necesita** cambios para Ruby 2.7 o CEF 88. El chequeo los cubre: `grain.rb:33` ya protege `texture_projected?`, `draw_component_tool.rb` sólo usa API de 2017 o anterior, y `App.tsx` usa `structuredClone` y `crypto.randomUUID`, que cubren los polyfills. Pendientes:

1. **Interfaz, `sketchup_offline/ui/App.tsx:492`** (texto, opcional): reemplazar ``title={`Versión ${version} en prueba. Extensión candidata: instalación y revisión visual pendientes en SketchUp 2026 Windows.`}`` por ``title={`Versión ${version} en prueba. Extensión candidata: instalación y revisión visual pendientes en SketchUp 2026 Windows; SketchUp 2022 sin probar.`}``.
2. **Dibujo, pruebas de base:** el WIP cambió «Crear componente» por «Dibujar componente» y `create_component` por `DrawComponentTool`. Fallan seis pruebas Ruby, tanto con 3.3 como con 2.7: `pintura_en_vista_controller_test.rb:62` (el doble no define `Sketchup::InputPoint`), `quick_toolbar_test.rb:78` e `installation_test.rb:41,84,89,121`. En estas listas hay que poner `'Dibujar componente'` en lugar de `'Crear componente'`. No es un tema de compatibilidad.
   - En Playwright offline fallan siete pruebas, en Chromium 141 y en el 88, también con el bundle de base `e4f1479` sin estos cambios: `names.spec.ts:422,493`, `recognition.spec.ts:36`, `ux-nombres.spec.ts:52,70`, `ux-shell.spec.ts:52` y `ux2-nombres.spec.ts:33`. Las causas son el botón «Componente», que ahora se llama «Dibujar pieza»; `.ux-block-reason{display:none}` en el `ux-shell.css` del WIP; y los grupos de `NameSuggestions`/`pieceGroups`. Corresponden a los agentes de dibujo e interfaz.
3. **Dibujo o integración, `sketchup_offline/bootstrap.rb:9`** (opcional): agregar `draw_component_tool.rb` a `required`. Así, un RBZ incompleto da «Faltan archivos» en lugar de un `LoadError`. Si vetas pasa a requerir `piece_grain`, agregar también `grain.rb` y `piece_grain.rb`. Ya están en el RBZ.
4. **Todos:** al integrar, correr `npm run check:ruby27` y `npm run build:offline`, que incluye `check-browser-floor`. Así se cubre el árbol completo.

## 7. Cómo reproducir

```bash
npm ci
npm run build:offline                 # incluye check-browser-floor (piso Chromium 88)
npm run check:ruby27                  # Parser::Ruby27 + métodos ≥3.0 + API ≥2023 + require_relative
node scripts/fetch-ruby27.mjs         # Ruby 2.7.0 real (Ubuntu focal) en node_modules/.cache/ruby-2.7
npm run check:ruby27                  # ahora también ruby -wc con 2.7
npm run test:offline:ruby27           # suite Ruby completa con Ruby 2.7
npm run test:chromium88               # suite Playwright offline con Chromium 88 real
```

## 8. Evidencia indirecta (2026-10-31)

Ninguna de estas corridas es SketchUp. Las fallas «de base» también aparecen sin este trabajo (punto 6.2).

| Corrida | Resultado |
|---|---|
| `npx tsc --noEmit` / `npx eslint .` | 0 errores / 0 problemas |
| `npx vitest run` | 550/551. Falla `experto-optimizer.test.ts` «1500+ pieces…», un umbral de tiempo de 2000 ms que es inestable con carga (corrida sola pasa 2 de 3 veces) y no toca código cambiado. |
| `npm run build:offline` | RBZ de 92 archivos; `check-browser-floor` con 0 errores y 14 avisos |
| `check:ruby27` | 37 archivos, 0 errores, 8 avisos revisados. Autoprueba con 22 hallazgos esperados. `ruby -wc` 2.7.0: 37/37. |
| Suite Ruby con **Ruby 3.3.6** (2026 no se rompe) | 1095 runs, 10376 aserciones, 6 fallas de base, 0 errores |
| Suite Ruby con **Ruby 2.7.0 real** | 1095 runs, 10376 aserciones, **las mismas** 6 fallas de base, 0 errores. Antes de corregir `Hash#except` había 8 fallas más, propias de 2.7. |
| Playwright offline en Chromium 141 | 250/257; las 7 fallas son de base |
| Playwright offline en **Chromium 88.0.4324.0** | 241/257. Fallan las 7 de base y 9 que vienen de límites de Playwright 1.56 con Chromium 88, no de la app: `mouse.move` pide `Input.setInterceptDrags` (`names.spec.ts:106,252`, `piece-viewer.spec.ts:29,75`), el evento `download` no llega (`a4-ux.spec.ts:56` ×2, `flujos-rapidos.spec.ts:116`), `page.clock` falla (`a4.spec.ts:107`) y el `zoom` CSS anterior a Chromium 128 desubica los clics (`ux-comparison.spec.ts:100`). Esas 9 **no prueban** descargar el PDF, arrastrar en el visor ni el zoom en 88: quedan para M5, M7 y M12. |
| Contraprueba en Chromium 88 con el bundle de 0.8.25 (chrome109 sin polyfills) | El primer pedido falla con «crypto.randomUUID is not a function» |
| `npx next build` y Playwright web (`playwright.config.ts`) | OK; 35/35 |

## 9. Riesgos

- **CEF 88 no se confirmó en la máquina.** Si una instalación de 2022 tuviera otro CEF, `cefVersion` lo muestra (M2).
- Ruby 2.7.**0** probado; SketchUp trae 2.7.2. No hay cambios de sintaxis entre ambas. El reenvío `...` con argumentos previos es de 2.7.3 y el código no lo usa.
- Las coordenadas de `View`/`Tool` en 2022 son físicas, y la tira y el tooltip de pintura dependen de `UI.scale_factor` y de `View#text_bounds`. Hay que revisar la nitidez y el tamaño a 100/125/150 %.
- `HtmlDialog` en 2022 no tiene los callbacks `sketchup.launchEW`/`installRBZ` de 2026.1. La extensión no los usa.
- Fuentes y tamaño de ventana: Chromium 88 en Linux no reproduce Segoe UI ni la escala de Windows.
- El respaldo de `:has()` depende de que el `MutationObserver` marque los `label` después de cada render. El color de «Agrupar» marcado sigue al evento `change`; un cambio programático sin re-render podría tardar un cuadro. El observador revisa todos los `label` en cada cuadro en que el DOM cambia, cosa que sólo pasa en 2022. Con listas muy largas, medir si se nota (M4).
- OpenCutList 7.1.0, que exige `workshop.rb`, declara soporte desde SketchUp 2017. No se verificó con 2022.
- Rendimiento: CEF 88 y Ruby 2.7 son más lentos. Un bundle de 4,3 MB y modelos grandes pueden tardar más.

## 10. Pruebas manuales en SketchUp 2022 Windows

Usar una copia del modelo y de la biblioteca (`%APPDATA%` de Planos Santo). Anotar la build de SketchUp (Ayuda → Acerca de), la escala de Windows y el resultado de cada paso.

1. **M1 Instalación:** Extensiones → Administrador → Instalar `PlanosSanto-<versión>.rbz`. Reiniciar. No debe aparecer «Planos Santo · Error de instalación» ni ningún error en la Consola Ruby.
2. **M2 Diagnóstico:** abrir Planos Santo, Ayuda (?) → Ver diagnóstico. Anotar `sketchupVersion` (22.x), `rubyVersion` (2.7.2 esperado), `cefVersion` y `chromeVersion` (88 esperado). En la Consola Ruby, `UI::HtmlDialog::CEF_VERSION` debe dar lo mismo.
3. **M3 Interfaz principal:** abrir la ventana. Debe aparecer el rail completo (Inicio … Planos A4) y el análisis del modelo debe terminar **sin «crypto.randomUUID is not a function»** ni otro aviso rojo. Recorrer los módulos con Alt+1…Alt+5.
4. **M4 Respaldo de `:has()`:** en Pintar (panel) los `select` quedan en columna. En Materiales → foto duplicada, las opciones de radio quedan alineadas. En Piezas, la casilla «Agrupar» marcada cambia de color.
5. **M5 Guías y PDF:** generar guías de un mueble, editar un nombre y una nota y guardar la guía. Exportar PDF A4, que usa `structuredClone`, y abrirlo: debe estar completo.
6. **M6 Barra rápida:** probar Pintar placa, Pintar canto, **Quitar canto** y Tomar material con un material recordado. Es el camino que fallaba con `Hash#except`: debe reanudar o explicar por qué no, nunca quedarse sin mensaje. Pegar el resultado de la Consola Ruby si aparece un error.
7. **M7 Tira y cursor en la vista:** con la escala de Windows a 100 %, 125 % y 150 %, revisar el tamaño y la nitidez de la tira de materiales, los textos y el cursor (SVG/PNG). Hacer clic en la tira: no debe elegir la pieza de abajo.
8. **M8 Pintura y Undo:** pintar caras de una pieza y de instancias compartidas. Comprobar «Todas las iguales» y deshacer con Ctrl+Z.
9. **M9 Fotos y texturas:** crear un material desde una foto (ImageRep), aplicarlo y orientar la veta (`position_material`). Si la textura está proyectada, el aviso tiene que ser claro.
10. **M10 SKM y biblioteca:** importar un `.skm` (`Materials#load`) y exportar un paquete de materiales.
11. **M11 Dibujar pieza:** primera esquina, rectángulo, espesor y medidas por la casilla de valores. Ctrl+Z deshace todo en un paso.
12. **M12 Resaltar pieza:** desde Piezas, localizar una pieza en el modelo (`active_path=`) y volver. La cámara y la selección se restauran.
13. **M13 Maderera, TXT y OpenCutList:** exportar un pedido TXT. Con OpenCutList 7.1.0 instalado, sincronizar atributos.
14. **M14 Ventanas:** plegar y desplegar (`get_size`/`set_size`), abrir la paleta, cerrar y volver a abrir. Las posiciones se recuerdan.
15. **M15 2026 sigue igual:** repetir M1-M3 y M6 en SketchUp 2026 con el mismo RBZ.

Hasta que M1-M15 pasen en SketchUp 2022 con el visto bueno del operador, la compatibilidad con 2022 **no está probada**.
