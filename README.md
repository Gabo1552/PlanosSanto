# Planos Santo

Extensión de SketchUp (2026; 2022 en preparación) para el taller: pintura de placas y cantos, biblioteca de materiales, nombres de piezas, planos A4 de armado, listado de piezas y pedido optimizado a la maderera. Funciona entera dentro de SketchUp, sin servidor.

**Candidata actual 0.8.33:** [RBZ](dist/PlanosSanto-0.8.33-candidata.rbz) · [SHA256](dist/PlanosSanto-0.8.33-candidata.rbz.sha256) · [paquete de validación local](dist/PlanosSanto-0.8.33-Validacion-Local.zip) · [qué cambió](docs/validacion-0833/CAMBIOS.md) · [0.8.32](docs/validacion-0832/CAMBIOS.md) · [0.8.31](docs/validacion-0831/CAMBIOS.md) · [0.8.30](docs/validacion-0830/CAMBIOS.md) · [0.8.29](docs/validacion-0829/CAMBIOS.md) · [0.8.28](docs/validacion-0828/CAMBIOS.md) · [0.8.27](docs/validacion-0827/CAMBIOS.md) · [0.8.26](docs/validacion-0826/CAMBIOS.md) · [SketchUp 2022](docs/validacion-0826/SKETCHUP_2022.md). **Pendiente de validación real en SketchUp 2026; SketchUp 2022 preparado pero sin probar.**

La 0.8.34 arma el SKU solo con el nombre y el espesor. La 0.8.33 hace que la pintura muestre solo los materiales elegidos para el SKP y deja girar el dibujo al marcar el frente. La 0.8.32 deja los frentes de cajón con veta vertical sin aviso de revisar. La 0.8.31 acota por defecto solo alto, ancho y profundidad totales del mueble y deja elegir los materiales de cada proyecto, que son los únicos que aparecen al pintar. La 0.8.30 sube el tope de muebles por guía de 100 a 500. La 0.8.29 agrupa el listado del A4, suma «Notas del armador» y achica el encabezado. La 0.8.28 permite ocultar el frente en Sugerencias de nombres para elegir piezas del interior. La 0.8.27 deja optimizar en Maderera sin guardar antes la guía. La 0.8.26 agrega veta por pieza (textura, Piezas, TXT y optimización coherentes), la herramienta «Dibujar pieza», una cabecera compacta y sugerencias de nombres agrupadas, y prepara la extensión para SketchUp 2022 (Ruby 2.7, Chromium 88). Mantiene el motor Experto y las funciones de 0.8.25.

**Auditoría del modo Experto:** [resultados actuales y límites](docs/validacion-0824/CAMBIOS.md). A/B/C ahora usan una placa; el caso real de 1244 piezas baja de 57 a 56. Tres pedidos siguen una placa por encima del proveedor; los pasos y metros industriales todavía difieren. [Diagnóstico histórico](docs/auditoria-experto-0822/MULTICASO.md).

## Módulos de la extensión

| Módulo | Para qué |
|---|---|
| Pintar (barra de herramientas) | Pintar placas y cantos en la vista 3D, sin ventanas |
| Materiales | Biblioteca de placas, cantos y herrajes (fichas, fotos, espesores), vinculada sola a los materiales del modelo |
| Muebles | Elegir muebles, marcar el frente, proponer y guardar nombres, codificar el despiece |
| Planos | Vistas exterior/interior, cotas, notas y hoja A4 (el visor es la hoja) |
| Piezas | Listado de piezas por material, CSV e impresión |
| Maderera | Experto / General, resumen por material + espesor, detalle de placas y TXT |

## Estructura

| Ruta | Qué hay |
|---|---|
| `sketchup_offline/` | La extensión: Ruby (`*.rb`), UI React (`ui/`), pruebas Ruby (`test/`) |
| `lib/` | Lógica compartida con la extensión (cotas, escena, nombres, hoja A4) |
| `tests/` | Vitest (`*.test.ts`), Playwright offline (`tests/offline/`) y web (`tests/e2e/`) |
| `scripts/` | Build del RBZ, runners de prueba y validadores del TXT de la maderera |
| `docs/` | Validaciones por versión (`validacion-08xx/`), contratos por hito (`hito*/`), QA y auditorías |
| `dist/` | Candidatas publicadas y sus paquetes de validación; versiones anteriores en el historial de git |
| `app/`, `components/`, `sketchup/` | App web heredada (página de descarga del RBZ y editor web congelado) y su exportador 0.3 |

## Desarrollo

Requisitos: Node 22+ (verificado con 24), Ruby 3.2+ con Minitest, Python 3, Chromium. `bash scripts/setup.sh` prepara el entorno.

```sh
npm ci
npm run build:offline                      # genera artifacts/PlanosSanto-<versión>.rbz (reproducible)
LANG=C.UTF-8 npm run test:offline:ruby     # pruebas Ruby (cargan desde sketchup_offline/build)
npx tsc --noEmit && npx eslint sketchup_offline/ui tests lib app components
npx vitest run
npx playwright test --config playwright.offline.config.ts   # UI offline con el controlador Ruby simulado
npx next build && npx playwright test                      # web
```

La skill `planos-santo-verificacion` (`.claude/skills/`) describe el ciclo de verificación. La skill `release` (`/release X.Y.Z [directo|espera]`) saca una versión: `scripts/release/bump-version.mjs` sube la versión en sus cuatro lugares, `scripts/release/bateria.sh` corre la batería completa y `scripts/release/preparar.py` arma el RBZ reproducible, `RESULTADOS.json`, el paquete y la limpieza de `dist/`.

### Grafo del código (graphify)

`.claude/skills/graphify/` trae la skill de [graphify](https://graphify.com) a nivel proyecto, **sin hooks** y sin tocar `CLAUDE.md`. Para usarla:

```sh
uv tool install graphifyy    # o: pipx install graphifyy
graphify update .            # arma graphify-out/ (sólo análisis local del código; no se versiona)
graphify query "¿qué conecta la pintura con la biblioteca?"
```

En Claude Code también funciona `/graphify`. El código se analiza localmente con tree-sitter; los documentos usan el modelo de la sesión.

## Reglas del taller

- No se publican modelos, SKM, fotos, texturas comerciales, catálogos reales ni datos de clientes. Las reglas de privacidad de `.gitignore` se mantienen aunque la carpeta ya no exista.
- OpenCutList es opcional; General aplica criterios de guillotina con código propio, sin copiar su motor ni sus recursos.
- Una candidata no se aprueba para producción sin validación en SketchUp real.
