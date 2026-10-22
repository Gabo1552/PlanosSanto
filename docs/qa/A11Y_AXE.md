# Auditoría automática de accesibilidad (axe-core, WCAG 2.2 AA)

- **Herramienta:** `@axe-core/playwright` 4.14.0 (axe-core 4.14.0), Chromium de Playwright.
- **Etiquetas:** `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`.
- **Spec:** `tests/offline/a11y-axe.spec.ts`, con el controlador Ruby real y dobles sintéticos de SketchUp (`names_bridge_driver.rb`), el mismo puente que `names.spec.ts` y `ux-taller.spec.ts`.
- **Anchos:** cada pantalla se audita a 1500×1100 (ancho de trabajo) y a 1000×760 (ventana compacta del HtmlDialog, la que usa `editor.spec.ts`): 18 escaneos en total.
- **Cómo regenerar el detalle crudo:** `A11Y_REPORT=<carpeta> npx playwright test --config playwright.offline.config.ts a11y-axe` deja un JSON por pantalla con regla, impacto y selectores.

## Pantallas auditadas

| Pantalla | Cómo se abre | Alcance del escaneo | Resultado final |
|---|---|---|---|
| Inicio | Carga inicial, antes de generar | Página completa | 0 violaciones |
| Guía y editor (incluye `GuideViews`) | «Generar guías (2)» | Página completa | 0 (1 corregida) |
| Ayuda (`HelpPopover`) | «Ayuda: Vistas configurables» | Diálogo | 0 violaciones |
| Nombres: sugerencias (`NameSuggestions`) | «Proponer nombres por geometría…» con piezas con nombre | Diálogo | 0 violaciones |
| Nombres: lote (`NameBatchPreview`) | Editar P01 y «Aplicar renombrado» | Diálogo | 0 violaciones |
| Vista previa A4 (`A4SheetPreview`) | Módulo «Planos A4» con el PDF generado | Página completa | 0 (1 corregida) |
| Biblioteca (`WorkshopPanel`) | «Biblioteca y pedidos» | Diálogo | 0 violaciones |
| Pedido del taller (`WorkshopPanel`) | Pestaña «Pedido maderera» | Diálogo | 0 violaciones |
| Revisión de cantos (`EdgeReview`) | Pedido con placa y cantos, «Leer cantos de las caras» | Diálogo | 0 violaciones |
| Materiales y cantos OCL (`MaterialReview`) | «Materiales y cantos» en modo `materials` | Diálogo | 0 violaciones |

## Violaciones encontradas

| # | Pantalla | Regla | Selector | Impacto | Corrección | Estado |
|---|---|---|---|---|---|---|
| 1 | Guía y editor | `color-contrast` (1.4.3) | `.notes-panel > .section-heading > h2 > span` | serious | El número de sección («03») usaba `#65809d` a 11 px sobre `#F8F9F5`: contraste 3,87:1 (se exige 4,5:1). Se cambió `h2>span` a `#4f6a86` en `style.css`: 5,31:1 sobre `#F8F9F5` y 5,62:1 sobre blanco. Se mantiene el tono azul grisáceo. | Corregida |
| 2 | Vista previa A4 | `color-contrast` (1.4.3) | `.notes-panel > .section-heading > h2 > span` | serious | Es el mismo elemento que la #1: el panel de notas sigue visible en el módulo A4. Se resolvió con el mismo cambio. | Corregida |

No quedaron violaciones de ningún impacto (minor, moderate, serious ni critical) después de la corrección.

## Allowlist del spec

`ALLOWLIST` en `tests/offline/a11y-axe.spec.ts` está **vacía**. Cualquier violación nueva en las pantallas auditadas hace fallar la suite. Para aceptar una excepción hay que agregar una entrada `{screen, rule, reason}` con su motivo y registrarla en este documento.

## Resultados «incomplete» (axe no pudo decidir): revisión

axe marca como «incomplete» lo que no puede resolver solo. Aparecieron dos tipos.

### Contraste con fondo indeterminado: 43 elementos, todos cumplen

Son textos dentro de diálogos modales, debajo de encabezados fijos o en el SVG del dibujo. axe no determina el fondo cuando hay capas superpuestas. El spec los mide con los colores computados: toma el primer fondo opaco de los ancestros o, en el SVG, el `<rect>` que enmascara el texto. Además **falla si alguno queda por debajo de 4,5:1** (3:1 para texto grande). Esa aserción se verificó con una prueba de mutación: bajar `.viewer-hint` a `#aaa` rompe el spec con 2,32:1.

| Elemento (pantallas) | Contraste medido | Mínimo |
|---|---|---|
| `td:nth-child(2) > small` en Nombres: lote | 5,02:1 | 4,5:1 |
| `.material-review-count` en Materiales OCL | 5,60:1 | 4,5:1 |
| `.viewer-hint` en editor y A4 | 5,72:1 | 4,5:1 |
| `.naming-hint` y `kbd` en Sugerencias | 6,10:1 | 4,5:1 |
| `header > div > p` en Sugerencias, Pedido y Cantos | 6,29:1 | 4,5:1 |
| Resto (cotas SVG, rótulos de piezas, botones de herramientas, textos de diálogos) | 7,9:1 a 21:1 | 4,5:1 |

Los cinco casos más ajustados quedan entre 5,0 y 6,3:1. Ahí conviene no aclarar más los grises.

### `aria-prohibited-attr` en las cotas del dibujo de Sugerencias: pendiente

- **Selector:** `g[aria-label="P01 · largo: 609,6 mm"]` y `g[aria-label="P01 · ancho: 406,4 mm"]`.
- **Impacto que asigna axe:** serious, pero quedó como «incomplete», no como violación.
- **Causa:** en `components/DimensionLayer.tsx`, una cota de solo lectura es un `<g>` con `aria-label` y sin `role`. Ese `aria-label` no tiene soporte fiable y un lector de pantalla puede ignorarlo o leer solo el número suelto.
- **Corrección propuesta:** usar `role={onHide||onMove?'button':'img'}`, así la cota de solo lectura se anuncia como una imagen con su nombre completo.
- **Por qué no se aplicó:** `components/DimensionLayer.tsx` está fuera de los archivos autorizados para esta ronda.

## Límites conocidos (qué no cubre axe)

- axe solo detecta lo que se puede verificar en forma automática (aproximadamente un tercio de los criterios WCAG). No reemplaza la prueba con teclado y lector de pantalla: el orden del foco, la trampa de foco en los diálogos y los anuncios de `role=status` ya los cubren `editor.spec.ts`, `ux-taller.spec.ts` y los specs `ux2-*`.
- La medición propia de contraste usa el fondo opaco más cercano. No detecta un texto pintado encima de otra pieza del dibujo con otro color: eso sigue necesitando revisión visual.
- El contenido del `iframe` con el PDF A4 lo dibuja el visor del navegador y queda fuera de la auditoría.
- La paleta de pintura y los paneles de materiales y fotos (`SmartPaintPalette`, `PaintPanel`, `MaterialLibraryPanel`, `PhotoMaterialPanel`) quedaron fuera de esta ronda por alcance.

## Ajustes a specs existentes para dejar la suite en verde

Estos dos fallos ya existían en `claude/ux-extras-0811`, antes de la auditoría:

- `ux2-nombres.spec.ts`: esperaba el rótulo «Otro mueble 1 piezas». Desde el merge de `ux2/shell` la UI pluraliza bien («1 pieza»). Se actualizó la expectativa; la UI no cambió.
- `ux2-shell.spec.ts` (foco visible del riel): fallaba de forma intermitente, en 3 de 6 corridas sobre la base. `Alt+3` mueve el foco de forma asíncrona al cambiar de módulo. Ahora el test espera `aria-current=page` y mide el estilo de foco con `expect.poll`. La aserción no se relajó: sigue exigiendo un outline `solid` y de un color distinto al fondo del riel.
