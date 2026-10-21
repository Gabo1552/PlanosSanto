# 01 — Estado actual (PASO 0)

**Fecha de auditoría:** 2026-10-21 · **Auditor:** Claude Code (sesión remota, sin SketchUp)
**Alcance:** lectura estática de código. No se instaló el RBZ, no se abrió SketchUp ni se modificó ningún modelo.

## 1. Proyecto de trabajo detectado

| Ítem | Resultado | Clasificación |
|---|---|---|
| Repositorio de trabajo | `github.com/Gabo1552/PlanosSanto` | VERIFICADO |
| Rama | `claude/vibrant-ride-j0zfuu` (local, creada vacía) | VERIFICADO |
| Commits | **Ninguno**, ni local ni remoto (`git ls-remote origin` no devuelve ramas) | VERIFICADO |
| `git status` | Sin archivos, sin cambios pendientes | VERIFICADO |
| Código fuente posterior a 0.8.7 | **No disponible en esta sesión** | NO VERIFICADO |

**Conclusión:** la única base de código disponible es `PlanosSanto-0.8.7-candidata.rbz`, así que **toda la auditoría se hace sobre 0.8.7**. Si existe código posterior en otro lugar (proyecto en la nube, carpeta local, otra rama), **todavía no se comparó** y hay que repetir el PASO 0 contra esa fuente antes de implementar (ver backlog, ítem P0-0).

Hay evidencia de que existe un *source checkout* que no se entregó. `planos_santo/release.rb:4` dice: *"Source checkout uses version.json; installed RBZ uses the build manifest"*. Además, `ui/app.js` (4,0 MB) y `ui/palette.js` (275 KB) son **bundles React minificados**, no código fuente. El RBZ no trae los fuentes TS/JSX, el `package.json`, los scripts de build ni las pruebas. **Para modificar la interfaz hace falta el repositorio fuente real**: editar los bundles minificados no es una opción mantenible.

## 2. Baseline reproducible

| Artefacto | Valor |
|---|---|
| RBZ | `PlanosSanto-0.8.7-candidata.rbz` |
| SHA-256 RBZ | `6503d53cb8bafdd7dd5d6955b6afa22381ee9472ee0e5530bb9719bea7f24ad0` (coincide con `BASELINE.json`) |
| Manifiesto | `version=0.8.7`, `target=SketchUp 2026 Windows`, `validation=PENDIENTE…` |
| Entradas ZIP | 56 (52 archivos inventariados + `manifest.json` + 3 directorios) |
| Hashes | 52/52 correctos (`05_CONTROL_ESTATICO.py`, ejecutado con `python3 -I`) |
| Sintaxis Ruby | 25/25 archivos pasan `ruby -c` (Ruby 3.3.6 fuera de SketchUp) |
| Sintaxis JS | `app.js` y `palette.js` pasan `node --check` |
| OpenCutList | `master` = `1ef3e14c896171eed8cd77ede440c7f5563e943e` (2026-10-19, merge PR #1067). **No hay commits posteriores**: `git ls-remote` el 2026-10-21 apunta al mismo SHA |
| Versión OCL en ese commit | `EXTENSION_VERSION='7.1.0'`, `EXTENSION_BUILD='202511301621'` (`src/ladb_opencutlist/ruby/constants.rb:4-5`) |
| Compatibilidad declarada por Planos Santo | `ocl_reader.rb:10-11` fija OCL 7.1.0 / build 202511301621 / commit `d03f4548…`. **Coincide en versión y build** con el master actual |

Copias de trabajo (fuera del repo, solo lectura): RBZ extraído y clon superficial de OCL en el *scratchpad* de la sesión. No se copió código de OCL al repositorio.

## 3. Estructura real de Planos Santo 0.8.7

| Capa | Archivos | Líneas | Rol |
|---|---|---|---|
| Carga | `planos_santo.rb`, `bootstrap.rb`, `release.rb` | 66 | Registro de la extensión y chequeo de archivos obligatorios |
| Controlador | `offline.rb` | 837 | Controlador único: 2 HtmlDialog + despacho de ~60 acciones + estado de herramientas |
| Toolbar | `quick_toolbar.rb` | 85 | 1 comando principal + 8 acciones (5 en la barra) |
| Materiales | `catalog_store.rb`, `material_library.rb`, `material_policy.rb`, `material_resolver.rb`, `photo_material.rb`, `skm_import.rb`, `bounded_zip.rb` | 1.232 | Catálogo JSON local + activos SKM/foto por hash + vínculo UUID en el material |
| Pintado | `native_paint.rb`, `smart_paint.rb`, `smart_paint_tool.rb`, `material_sample_tool.rb` | 1.000 | Motor de pintura de caras + herramienta de viewport + cuentagotas |
| Nombres | `names.rb`, `piece_highlight_tool.rb` | 436 | Inventario de jerarquía, renombrado por mueble, resaltado |
| Planos | `guide_store.rb`, `session.rb`, `exporter.rb`, `ui/app.js` (pdf-lib) | 611 + bundle | Guía A4 con vistas, cotas, notas y PDF vectorial local |
| Maderera | `supplier_order.rb`, `workshop.rb` | 344 | TXT de 9 columnas por lote + manifiesto + estimación de costo neto |
| OCL | `ocl_reader.rb`, `p1_diagnostics.rb`, `workshop.rb:154-167` (OclGateway) | 448 | Lectura de atributos `ladb_opencutlist` y apertura del diálogo de OCL original |
| UI | `ui/app.js`, `ui/palette.js`, html/css | 4,3 MB | React minificado (sin fuente) |
| Licencias | `THIRD_PARTY_LICENSES.txt` | 348 | MIT (pdf-lib, buffer, UPNG, pako, etc.) |

**Total Ruby:** ≈ 4.900 líneas en 25 archivos.

## 4. Cobertura de pruebas comprobada

| Tipo | Estado |
|---|---|
| Pruebas unitarias / integración en el RBZ | **Ninguna incluida** (no hay `test/` ni specs) |
| Pruebas automáticas ejecutadas en esta auditoría | Solo sintaxis (`ruby -c`, `node --check`) y hashes. **No son pruebas funcionales** |
| Pruebas en SketchUp 2026 | **NO VERIFICADO.** El propio manifiesto declara la validación como PENDIENTE |
| Diagnóstico integrado | `p1_diagnostics.rb`: escáner de solo lectura invocable desde el menú. Es útil como herramienta de soporte, no como prueba |

## 5. Discrepancias y observaciones del PASO 0

1. **El repositorio de trabajo está vacío.** No se puede confirmar que 0.8.7 sea la última versión del proyecto (criterio 6 de `03_CRITERIOS_AUDITORIA.md`: **NO VERIFICADO**).
2. **Falta el código fuente de la UI**: hay bundles, pero no hay fuentes. Esto bloquea cualquier cambio serio de interfaz hasta recuperar el repo fuente.
3. **No hay pruebas automatizadas** distribuidas ni visibles.
4. La compatibilidad OCL fijada (7.1.0/202511301621) **coincide** con el OCL actual. `OclGateway` llama a `plugin.show_tabs_dialog(tab)`, que existe en `src/ladb_opencutlist/ruby/plugin.rb:1101` del commit auditado.

## 6. Acción pendiente antes de programar

- Subir al repositorio `PlanosSanto` el **código fuente real** (Ruby + fuentes de la UI + build + pruebas), o indicar dónde está.
- Repetir el diff contra este baseline (los hashes del manifiesto permiten comparar archivo por archivo).
