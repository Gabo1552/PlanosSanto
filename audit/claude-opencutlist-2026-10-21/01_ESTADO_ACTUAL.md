# 01 — Estado actual (PASO 0)

**Fecha de auditoría:** 2026-10-21 · **Auditor:** Claude Code (sesión remota, sin SketchUp)
**Alcance:** lectura estática + build + pruebas automáticas del propio proyecto. No se instaló el RBZ, no se abrió SketchUp ni se modificó ningún modelo o archivo fuente.

## 1. Proyecto de trabajo detectado

| Ítem | Resultado | Clasificación |
|---|---|---|
| Repositorio | `github.com/Gabo1552/PlanosSanto` | VERIFICADO |
| Rama con fuente | `main` @ `2bf694f` — *"Import Planos Santo 0.8.7 with immediate painting candidate and validation"* (2026-10-21 11:40 UTC, único commit, 579 archivos) | VERIFICADO |
| Rama de esta auditoría | `claude/vibrant-ride-j0zfuu`, sin historia común con `main`; **solo contiene `audit/`** | VERIFICADO |
| Código de la extensión | `sketchup_offline/` (Ruby + UI React/TSX + pruebas), `version.json = 0.8.7` | VERIFICADO |
| Otros componentes del repo | App web Next.js (`app/`, `lib/`, `components/`), extensión web antigua (`sketchup/`), carpetas de *loops* Codex (`planos-santo-*`, `docs/loop-*`) | VERIFICADO |
| Modificaciones sin confirmar | Ninguna: el checkout de `main` quedó limpio tras el build y las pruebas, salvo el directorio generado `sketchup_offline/build/` | VERIFICADO |

> **Nota de proceso:** cuando empezó la sesión, el remoto estaba vacío. `main` apareció durante la auditoría. Los entregables se ajustaron a esa fuente.

## 2. ¿El RBZ 0.8.7 coincide con el código actual? — **Sí, exactamente**

| Comprobación | Resultado |
|---|---|
| Los 24 `.rb` de `sketchup_offline/` frente al RBZ | **24/24 idénticos byte a byte** (`cmp`) |
| `dist/PlanosSanto-0.8.7-candidata.rbz` en `main` | SHA-256 `6503d53c…24ad0`, **igual** al RBZ del kit y a `BASELINE.json` |
| Build reproducible: `npm ci` + `node scripts/build-offline.mjs` | Genera `PlanosSanto-0.8.7.rbz` con SHA-256 **`6503d53c…24ad0`** (idéntico) y `app.js`/`palette.js`/html/css con los mismos hashes que el RBZ |
| Manifiesto del RBZ | 52/52 hashes correctos (`05_CONTROL_ESTATICO.py`) |

**Conclusión:** **0.8.7 es la última versión del proyecto**. Fuente, build y RBZ coinciden. No hay avances posteriores que se pudieran pisar. El baseline de esta auditoría es inequívoco.

## 3. Baseline OpenCutList

| | |
|---|---|
| Commit | `1ef3e14c896171eed8cd77ede440c7f5563e943e` (2026-10-19, merge PR #1067) = `master` al 2026-10-21 (`git ls-remote`) |
| Versión | `7.1.0` / build `202511301621` (`src/ladb_opencutlist/ruby/constants.rb:4-5`) |
| Compatibilidad fijada por PS | `ocl_reader.rb:10-11`: 7.1.0 / 202511301621 / commit `d03f4548…`. **Coinciden** versión y build |
| Clon | Superficial y de solo lectura, en el *scratchpad* de la sesión (fuera del repo) |

## 4. Estructura real de la extensión (`sketchup_offline/`)

| Capa | Archivos | Líneas aprox. | Rol |
|---|---|---|---|
| Carga | `planos_santo.rb`, `bootstrap.rb`, `release.rb` | 66 | Registro + verificación de archivos obligatorios |
| Controlador | `offline.rb` | 837 | Controlador único: 2 HtmlDialog + ~60 acciones + estado de herramientas |
| Toolbar | `quick_toolbar.rb` | 85 | 1 comando principal + 8 acciones (5 en la barra) |
| Materiales | `catalog_store.rb`, `material_library.rb`, `material_policy.rb`, `material_resolver.rb`, `photo_material.rb`, `skm_import.rb`, `bounded_zip.rb` | 1.232 | Catálogo JSON local + activos por hash + vínculo UUID |
| Pintado | `native_paint.rb`, `smart_paint.rb`, `smart_paint_tool.rb`, `material_sample_tool.rb` | 1.000 | Motor + Tool de viewport + cuentagotas |
| Nombres | `names.rb`, `piece_highlight_tool.rb` | 436 | Inventario, renombrado por mueble, resaltado |
| Planos | `guide_store.rb`, `session.rb`, `exporter.rb`, `ui/GuideViews.tsx`, `ui/A4SheetPreview.tsx`, `ui/pdf.ts` | — | Guía A4 + PDF pdf-lib |
| Maderera | `supplier_order.rb`, `workshop.rb`, `ui/WorkshopPanel.tsx` | — | TXT de 9 columnas por lote |
| OCL | `ocl_reader.rb`, `p1_diagnostics.rb`, `workshop.rb:154-167` | 448 | Lectura de `ladb_opencutlist` + apertura del diálogo OCL |
| UI (fuente) | `ui/*.tsx`, `ui/*.ts`, css. Pintura: `SmartPaintPalette.tsx`, `StandalonePaintApp.tsx`, `palette.tsx`, `PhotoMaterialPanel.tsx`, `MaterialLibraryPanel.tsx` | — | React, bundle con esbuild (`scripts/build-offline.mjs`) |
| Pruebas Ruby | `sketchup_offline/test/*` (32 archivos *_test + drivers/dobles) | — | Minitest con dobles de la API de SketchUp |
| Pruebas UI | `tests/offline/*.spec.ts` (17 specs Playwright), `tests/*.test.ts` (vitest) | — | UI con puente simulado |

## 5. Cobertura de pruebas comprobada

### 5.1 Ejecutadas en esta auditoría
Pruebas Ruby offline (`scripts/test-offline-ruby.mjs`, cada archivo por separado, Ruby 3.3.6, `LANG=C.UTF-8`):

| Resultado | Detalle |
|---|---|
| **422 runs, 3.053 aserciones, 1 falla, 0 errores** | 31/32 archivos en verde |
| Falla 1 (ambiental) | `installation_test.rb:19` necesita `artifacts/PlanosSanto-0.3.0.rbz`, que **no está commiteado** en `main` |
| Hallazgo de robustez | Sin locale UTF-8 (`LANG` vacío), 4 pruebas más de `installation_test.rb` fallan por `Encoding::CompatibilityError` con la ruta de usuario `Usuario José`. El script `test-offline-ruby.mjs` **corta en el primer archivo que falla**, así que una corrida "en rojo" oculta los archivos siguientes |
| Reproducción propia | `repro_causas_test.rb` (en esta carpeta) reproduce **C1 y C3** de `05_CAUSA_PINTADO.md`: 2 runs, 5 aserciones, 0 fallas → `PROBADO_AUTOMATICAMENTE` |

**No ejecutadas** (no hacían falta para las conclusiones): vitest, Playwright offline (UI) y e2e de la app web.

### 5.2 Brechas de cobertura relevantes
- **Ningún test cubre "ficha visible en la paleta pero sin material nativo en el modelo".** Los dobles de `tests/offline/immediate-palette.spec.ts:12,24` y `palette-fast.spec.ts:25` le dan un material vinculado a **toda** ficha aprobada o de foto. El caso de la captura queda fuera por construcción.
- Ninguna prueba ejecuta SketchUp real. El propio proyecto lo declara: `docs/hotfix-pintura-087/VALIDACION_LOCAL_POSTERIOR.md` ("La nube ejecuta API doubles; NO comprueba render nativo…").
- Sin pruebas de rendimiento por clic.

### 5.3 En SketchUp 2026
**NO VERIFICADO.** El recorrido manual de 12 pasos de `docs/hotfix-pintura-087/VALIDACION_LOCAL_POSTERIOR.md` figura como pendiente. La captura `fallo_pintado_087.png` indica que falló, al menos, en el paso 3-4 en el modelo del usuario.

## 6. Discrepancias y observaciones del PASO 0

1. **El RBZ del kit y la fuente coinciden al 100%.** No hay divergencia.
2. **Artefacto faltante:** `artifacts/PlanosSanto-0.3.0.rbz` (lo usa una prueba de migración).
3. **Higiene del repo:** se versionan `__pycache__/*.pyc` (`docs/loop-a4/__pycache__`, `scripts/__pycache__`), binarios RBZ/ZIP en `dist/` y `artifacts/`, y una docena de carpetas de *loops* históricos. No afecta a la auditoría, pero conviene limpiarlo (backlog P2).
4. Antecedentes en el propio repo: `docs/opencutlist-integracion-p0.md` y `planos-santo-ocl-066/INTEGRACION_OPENCUTLIST.md` ya desaconsejaban el fork y fijaban la regla "no escribir atributos OCL". `planos-santo-loop-experiencia-084/REFERENCIAS_OPENCUTLIST.md:33` ya recomendaba "diseño original inspirado en patrones UX". **Esta auditoría es consistente con esas decisiones** y las refina (ver `06`).
5. `PROGRESS.md` (0.8.5) declara "diseño separado de comercial", **pero el fingerprint del vínculo sigue incluyendo SKU, proveedor y formato** (`material_resolver.rb:125-135`). Es la causa C3, reproducida.
