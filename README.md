# Planos Santo

Extensión de SketchUp 2026 para el taller: pintura de placas y cantos, biblioteca de materiales, nombres de piezas, planos A4 de armado, listado de piezas y pedido optimizado a la maderera. Funciona entera dentro de SketchUp, sin servidor.

**Candidata actual 0.8.23:** [RBZ](dist/PlanosSanto-0.8.23-candidata.rbz) · [SHA256](dist/PlanosSanto-0.8.23-candidata.rbz.sha256) · [paquete de validación local](dist/PlanosSanto-0.8.23-Validacion-Local.zip) · [qué cambió](docs/validacion-0823/CAMBIOS.md) · [validación local](docs/validacion-0823/VALIDACION_LOCAL.md). **Pendiente de validación real en SketchUp**: todas las pruebas automatizadas usan dobles de la API.

La 0.8.23 crea fichas desde materiales y texturas del modelo, lee datos OpenCutList sin exigir el plugin y evita abrir Pintar al asociar.

**Auditoría posterior del modo Experto:** el pedido real comparado requiere 56 placas en el proveedor y 57 en la candidata. [Resultado y límites de la referencia](docs/auditoria-experto-0822/REVISION.md). Paridad comercial pendiente de corrección.

## Módulos de la extensión

| Módulo | Para qué |
|---|---|
| Pintar (barra de herramientas) | Pintar placas y cantos en la vista 3D, sin ventanas |
| Materiales | Biblioteca de placas y cantos (fichas, fotos, espesores), vinculada sola a los materiales del modelo |
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

La skill `planos-santo-verificacion` (`.claude/skills/`) describe el ciclo completo. Cada versión sube `sketchup_offline/version.json`, la lista de versiones de `lib/model.ts` y el verificador de `docs/validacion-0811/`.

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
