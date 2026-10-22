# Orden del repositorio — informe (sin cambios aplicados)

Fecha: 2026-10-22 · Rama: `claude/noche-orden-repo` (desde `claude/ux-extras-0811`, HEAD `af64a15`) · Versión en `sketchup_offline/version.json`: **0.8.10**.

> Este informe **no mueve ni borra nada**. Todos los comandos de la sección 6 son una propuesta para revisión humana.

## 0. Estado de ejecución (actualizado 2026-10-22)

Con aprobación del usuario se aplicó **una parte reducida** del plan. Solo se usó `git mv`, no hubo ningún `git rm`.

| Hecho | Detalle |
|---|---|
| Archivados en `docs/historico/loops/` | `planos-santo-arranque`, `-loop-nombres`, `-loop-pintado-073`, `-loop-toolbar-082`, `-loop-ux-082`, `-loop-experiencia-084` y `-loop-ux-085` (133 archivos) |
| Archivado en `docs/historico/` | `PLAN_DESARROLLO_EXTENSION.md`, con su enlace actualizado en `README.md` |
| Enlace corregido | `sketchup_offline/PRUEBA_SKETCHUP_2026.md`, que apuntaba a `INSTALACION_RBZ.md` de `loop-nombres`. Ese archivo no entra en el RBZ |
| `.gitignore` | Las rutas privadas de los 6 loops movidos que tenían reglas en la raíz ahora apuntan a la ruta nueva. Se agregaron las reglas genéricas de la sección 5. Se probó con `git check-ignore` sobre archivos ficticios en cada ruta privada: todas quedan ignoradas |
| Verificación | `build-offline` (RBZ 0.8.10, CRC OK), `test-offline-ruby`, `tsc --noEmit` y `vitest` (172/172): todo en verde |

**Pendiente, sin ejecutar:**

- Paso 6.1: reubicar los validadores. Por eso `planos-santo-ocl-066/` y `planos-santo-loop-068/` siguen en la raíz.
- `git rm --cached` de los 4 `.pyc`. Siguen versionados aunque ahora estén ignorados.
- Excluir `ux`, `backups`, `baseline`, `state` y `referencia` en `scripts/package-hito1-fixes.py`. Hoy ese script no corre porque exige la versión 0.8.9. **Antes de reactivarlo hay que agregar esa exclusión**, porque los loops archivados ahora están dentro de `docs/`.
- `scripts/package-paint-validation.py` con `KIND` `toolbar`, `ux`, `photo` o `flows`: sigue apuntando a las rutas viejas de 4 loops archivados. Esos paquetes (0.8.2–0.8.6) ya no se pueden reproducir sin actualizar las rutas.

## 1. Resumen ejecutivo

| Hecho medido | Valor |
|---|---|
| Archivos versionados | 670 (24,8 MB de contenido en HEAD) |
| Pack de Git (historia completa, 45 commits) | 24,3 MB |
| `dist/` | 14 archivos, **17,7 MB = 71 % del árbol** |
| 9 carpetas `planos-santo-*` de loops viejos | 195 archivos, **~540 KB en total (2 % del árbol)** |
| Archivos versionados que el `.gitignore` debería ignorar | 0 (pero hay 4 `.pyc` porque falta la regla en la raíz) |
| Contenido local ignorado o sin seguimiento en este clon | ninguno (`test-results/` no existe en este clon) |

Conclusiones, de mayor a menor importancia:

1. **El peso del repo es `dist/`, no los loops.** Archivar los loops ordena la raíz pero no cambia el tamaño. El peso real está en los RBZ y ZIP de entrega de `dist/`, que este informe marca como **intocables**. Mi recomendación a futuro es publicarlos como GitHub Releases y no versionarlos (ver 7.3), pero esa decisión es humana.
2. **Dos pruebas dependen de scripts que viven dentro de los loops.** Hoy no se puede archivar `planos-santo-ocl-066/` ni `planos-santo-loop-068/` sin romper `workshop_test.rb`, `edge_sides_test.rb` y `tests/offline/names.spec.ts` (detalle en 3.1).
3. **Riesgo de privacidad al mover carpetas.** Varias reglas que protegen datos privados del taller (modelos, SKM, fotos, baselines) están escritas en el `.gitignore` raíz con la ruta vieja. Si se hace `git mv` de un loop en una máquina que tenga esos datos, quedan **sin ignorar** y un `git add -A` los publica. Además, `docs/` entra entero en el ZIP de fuentes de `scripts/package-hito1-fixes.py`. Antes de cualquier movimiento hay que aplicar la sección 5 (detalle en 3.3).
4. Hay 4 `.pyc` versionados (basura regenerable) porque la raíz no ignora `__pycache__/`.
5. Hay documentación desactualizada: el README anuncia la candidata 0.8.9 cuando la versión es 0.8.10, y `scripts/package-hito1-fixes.py` exige `version=='0.8.9'`, así que con 0.8.10 falla de entrada.

## 2. Método

- Inventario: `git ls-files`, `du -sb`, `git ls-files -ci --exclude-standard` (versionado pero ignorado) y `git status --porcelain --ignored`.
- Referencias: búsqueda de cada nombre de la raíz en `scripts/`, `tests/`, `sketchup_offline/`, `package.json`, `.gitignore`, `playwright*.config.ts`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs` y `.claude/`. Después se filtraron a mano los falsos positivos por subcadena, por ejemplo "native" dentro de "validación nativa" o "audit" dentro de `audit(...)`. Las menciones en `docs/` y en el README se cuentan aparte: si se mueve algo, esos enlaces se rompen, pero el build sigue funcionando.
- Archivos grandes y binarios: tamaños de `git ls-files`, recuento por extensión y blobs de más de 400 KB en toda la historia (`git rev-list --objects --all`).
- Duplicados: hash de blob de `git ls-files -s`. Mismo hash significa contenido idéntico.

Supuesto: este clon no tiene los datos privados del taller (no hay nada ignorado en disco). En la PC de Windows o de Dot/Codex **sí puede haberlos**. Eso es lo que hay que validar antes del paso 6.2.

## 3. Hallazgos clave

### 3.1 Dependencias de código hacia carpetas de loops

| Quien depende | Referencia | Efecto si se mueve el loop |
|---|---|---|
| `sketchup_offline/test/workshop_test.rb:110` | `python3 planos-santo-ocl-066/scripts/validar_pedido_txt.py` | Falla la suite Ruby offline |
| `sketchup_offline/test/edge_sides_test.rb:103` | `python3 planos-santo-loop-068/scripts/validar_txt_maderera.py` | Falla la suite Ruby offline |
| `tests/offline/names.spec.ts:469` | `planos-santo-loop-068/scripts/validar_txt_maderera.py` | Falla Playwright offline |
| `scripts/package-hito1-fixes.py:29,36` | incluye `planos-santo-ocl-066/scripts` y `planos-santo-loop-068/scripts` en el ZIP de fuentes | El ZIP queda sin los validadores |
| `scripts/package-paint-validation.py:38-42,78-99` | `ocl-066/scripts` y `loop-068/scripts` siempre; `toolbar-082`, `ux-082`, `experiencia-084` y `ux-085` según `KIND` | Ya no se pueden reproducir los paquetes históricos 0.8.2–0.8.6 |
| `.gitignore` raíz | reglas de datos privados para los 9 loops | Ver 3.3 |

Los demás loops (`arranque`, `loop-nombres` y `loop-pintado-073`) **no tienen dependencias de código**: solo se mencionan en `PROGRESS.md`, `TASKS.md` y `sketchup_offline/PROGRESS.md`/`TASKS.md`. Las pruebas Python internas de los loops (`tests/test_*.py`) no las ejecuta ningún script ni CI. No hay `.github/`.

### 3.2 Material que no debe tocarse (intocable)

| Ruta | Motivo |
|---|---|
| `dist/` (14 archivos, 17,7 MB) | Candidatas 0.8.7–0.8.10 con su `.sha256` y paquetes de validación local. El README las enlaza. `scripts/package-hito1-fixes.py` escribe aquí. |
| `artifacts/PlanosSanto-0.5.3.rbz` | Fixture de `sketchup_offline/test/warm_update_test.rb:12`. También lo empaqueta `package-paint-validation.py:54-64`. Es la única excepción a `artifacts/*` en el `.gitignore`. |
| `audit/claude-opencutlist-2026-10-21/` y `audit/opencutlist-paridad-2026-10-21/` | Material de auditoría (408 KB). Lo citan `docs/hito1-pintura-088/INFORME_HITO1.md` y las decisiones del producto. |
| `docs/hito1-pintura-088/validacion-nativa/` (15 archivos) | Evidencia de validación nativa en SketchUp. Incluye 2 pares de JSON idénticos (ver 4.3), que **se conservan igual** porque cada nombre corresponde a un paso distinto del protocolo. |

### 3.3 Riesgo de privacidad al mover loops

Cada loop tiene su propio `.gitignore` con reglas relativas. Esas reglas **se mueven con la carpeta**. Las reglas del `.gitignore` raíz usan la ruta vieja y **dejan de aplicar** después de un `git mv`. Estas reglas solo están en la raíz y quedarían sin protección:

| Loop | Rutas privadas que solo protege la raíz |
|---|---|
| `planos-santo-arranque` | `backups/` |
| `planos-santo-ocl-066` | `backups/` |
| `planos-santo-loop-068` | `referencias/` (el `.gitignore` local cubre solo `referencias/privado/` y un RBZ) |
| `planos-santo-loop-pintado-073` | `referencias/`, `state/` |
| `planos-santo-loop-toolbar-082` | `referencia/`: **no tiene `.gitignore` propio** |
| `planos-santo-loop-ux-082` | `inventario_materiales.json`, `inventario_materiales.csv`, `WIREFRAME_REFERENCIA.html` |
| `planos-santo-loop-experiencia-084` | `ux/` |
| `planos-santo-loop-ux-085` | `ux/` |

Riesgo agravado: `scripts/package-hito1-fixes.py` incluye **todo `docs/`** en el ZIP de fuentes y solo excluye las carpetas `private`, `referencias_privadas`, `referencias`, `runs`, `evidencia_local`, `node_modules` y `build`. No excluye `ux/`, `backups/`, `baseline/`, `state/` ni `referencia/`. Si un loop con datos locales se archiva en `docs/historico/`, esos datos pueden terminar dentro del ZIP que se entrega a Dot/Codex.

Mitigación obligatoria antes de mover: aplicar las reglas genéricas de la sección 5 y correr `git status --ignored planos-santo-*` en **cada** máquina que tenga datos del taller.

## 4. Inventario de la raíz

Leyenda de decisión: **Conservar** · **Archivar** (a `docs/historico/…`) · **Eliminar** · **Intocable**.
"Refs" indica dónde se usa desde código o configuración. Las menciones solo en documentación se aclaran como tales.

### 4.1 Carpetas

| Elemento | Qué es | Tamaño versionado | Estado git | Refs (código/config) | Decisión | Motivo | Riesgo |
|---|---|---|---|---|---|---|---|
| `.claude/` | Agentes, skills (incluida `planos-santo-verificacion`) y licencia ECC | 114 KB / 15 | versionado | se usa en sesiones Claude; `package-hito1-fixes.py` lo incluye en el ZIP | Conservar | Configuración activa del flujo de trabajo | — |
| `app/` | App web Next.js (instalador, PDF, impresión) | 43 KB / 18 | versionado | `next build`, tsconfig, tests e2e | Conservar | Código activo | — |
| `components/` | Componentes React de la web y del editor offline | 44 KB / 8 | versionado | `sketchup_offline/ui/App.tsx`, tests | Conservar | Código activo | — |
| `lib/` | Lógica compartida (PDF, store, archive, pairing) | 86 KB / 21 | versionado | scripts, tests, build | Conservar | Código activo | — |
| `public/` | `santo-carpintero.png` de la web | 19 KB / 1 | versionado | `app/print/[id]/page.tsx` | Conservar | Es un asset de Next. Hay un duplicado en `sketchup_offline/assets/` porque los dos bundles son independientes | Unificarlo obliga a cambiar el build: no vale la pena |
| `scripts/` | Build, empaquetado, verificaciones reales | 133 KB / 30 | versionado (con 3 `.pyc`) | `package.json` | Conservar (sacar `__pycache__/`) | Código activo | — |
| `sketchup/` | Extensión Ruby clásica (puente web) | 56 KB / 16 | versionado | `test-ruby.mjs`, tests e2e, `build-offline.mjs` | Conservar | El RBZ web y `npm run verify` lo usan | — |
| `sketchup_offline/` | Producto principal: extensión offline 0.8.10 | 2,5 MB / 139 | versionado | todo el pipeline | Conservar | Núcleo del producto | — |
| `tests/` | Vitest, Playwright web y Playwright offline | 585 KB / 63 | versionado | `vitest.config.ts`, `playwright*.config.ts` | Conservar | Pruebas activas | — |
| `docs/` | Documentación por loop y entrega (140 archivos) | 567 KB | versionado (con 1 `.pyc`) | scripts de empaquetado, `hito1-paint.spec.ts` | Conservar (sacar `__pycache__/`) | Aquí debe vivir el histórico | — |
| `dist/` | Candidatas RBZ 0.8.7–0.8.10, `.sha256`, ZIP de validación y captura | **17,7 MB / 14** | versionado | README, `package-hito1-fixes.py` | **Intocable** | Entregables vigentes de validación | Ver 7.3 |
| `artifacts/` | Solo `PlanosSanto-0.5.3.rbz` versionado; el resto es salida local ignorada | 1,55 MB / 1 | `artifacts/*` ignorado salvo el fixture | `warm_update_test.rb`, ~15 scripts escriben aquí, eslint lo ignora | **Intocable** (el fixture) / Conservar (la carpeta) | Fixture de prueba de actualización en caliente | Si se borra, falla `warm_update_test` |
| `audit/` | Auditorías OpenCutList del 2026-10-21 | 408 KB / 12 | versionado | solo en documentación (`INFORME_HITO1.md`) | **Intocable** | Material de auditoría | — |
| `native/` | `README.md`: contrato del lector C SDK (alternativa descartada) | 5 KB / 1 | versionado | `package-paint-validation.py` y `package-hito1-fixes.py` lo incluyen en el ZIP. `PROGRESS.md:31` lo enlaza | Conservar | Pocos bytes, pero moverlo cambia el contenido de los paquetes reproducibles | Bajo. Archivar en el futuro junto con un cambio de los scripts |
| `data/` | Directorio de datos de la web (`PROJECT_DATA_DIR` por defecto) | 0 B / 1 (`.gitkeep`) | `data/*` ignorado salvo `.gitkeep` | `lib/store.ts:6`, `lib/pairing.ts:5` | Conservar | La app escribe proyectos y tokens aquí | Si se borra `.gitkeep`, la web arranca sin la carpeta; depende de que el código la cree |
| `test-results/` | Salida de Playwright (`outputDir` en `playwright.offline.config.ts:6`) | no existe en este clon | ignorado | `playwright.offline.config.ts`, `eslint.config.mjs` | Conservar la regla | Es temporal y se regenera | — |
| `planos-santo-arranque/` | Kit de arranque del loop OpenCutList (prompts, ps1/sh, validador) | 62 KB / 17 | versionado + `.gitignore` propio | ninguna (solo documentación y `.gitignore`) | **Archivar** | Loop cerrado. Su `validar_pedido_txt.py` es idéntico byte a byte al de `ocl-066` | Bajo. Hay que mover antes la regla `backups/` (3.3) |
| `planos-santo-ocl-066/` | Loop 0.6.6: contrato maderera e integración OCL | 65 KB / 21 | versionado + `.gitignore` | **`workshop_test.rb:110`**, `package-*.py` | **Archivar, después de reubicar el validador** | Loop cerrado, pero su validador se usa en pruebas | **Alto** si se mueve sin reubicar `scripts/validar_pedido_txt.py` |
| `planos-santo-loop-068/` | Loop 0.6.8: contrato TXT maderera | 54 KB / 21 | versionado + `.gitignore` | **`edge_sides_test.rb:103`, `names.spec.ts:469`**, `package-*.py` | **Archivar, después de reubicar el validador** | Igual que el anterior | **Alto**: rompe Ruby y Playwright |
| `planos-santo-loop-nombres/` | Loop de nombres (0.6.x) | 42 KB / 12 | versionado + `.gitignore` | ninguna | **Archivar** | Loop cerrado | Bajo |
| `planos-santo-loop-pintado-073/` | Loop pintado 0.7.3 (con `reports/` y runner Ruby) | 108 KB / 30 | versionado + `.gitignore` | ninguna | **Archivar** | Loop cerrado. Su evidencia (`reports/`) se conserva dentro del histórico | Medio: `referencias/` y `state/` solo están protegidos por la raíz |
| `planos-santo-loop-toolbar-082/` | Loop barra de herramientas 0.8.2 | 40 KB / 13 | versionado, **sin `.gitignore`** | `package-paint-validation.py` (`KIND=toolbar`) | **Archivar** | Loop cerrado. Su `VALIDACION_LOCAL_DOT.md` ya está duplicado en `docs/loop-toolbar-083/` | Medio: `referencia/` queda sin protección; no se puede reproducir el paquete 0.8.3 |
| `planos-santo-loop-ux-082/` | Loop UX 0.8.2 (catálogo SKM, iconos) | 54 KB / 18 | versionado + `.gitignore` | `package-paint-validation.py` (`KIND=ux`) | **Archivar** | Loop cerrado. Su validación ya está duplicada en `docs/loop-ux-084/` | Medio: inventarios de materiales y wireframe |
| `planos-santo-loop-experiencia-084/` | Loop experiencia foto 0.8.4 | 55 KB / 20 | versionado + `.gitignore` | `package-paint-validation.py` (`KIND=photo`) | **Archivar** | Loop cerrado. Su validación ya está duplicada en `docs/loop-fotos-085/` | Medio: `ux/` |
| `planos-santo-loop-ux-085/` | Loop flujos rápidos 0.8.5 | 58 KB / 23 | versionado + `.gitignore` | `package-paint-validation.py` (`KIND=flows`) | **Archivar** | Loop cerrado. Su validación ya está duplicada en `docs/loop-flujos-086/` | Medio: `ux/` |

### 4.2 Archivos de la raíz

| Archivo | Qué es | Tamaño | Refs | Decisión | Motivo | Riesgo |
|---|---|---|---|---|---|---|
| `.gitignore` | Reglas de ignorado | 1,8 KB | git | Conservar (+ sección 5) | Necesario | Ver 3.3 |
| `README.md` | Entrada del proyecto | 18 KB | — | Conservar (actualizar) | Línea 3 anuncia 0.8.9 aunque `version.json` es 0.8.10. Línea 21 cita `artifacts/PlanosSanto-0.3.0.rbz`, que ya no existe | Documentación engañosa para quien instala |
| `CODEX_STATUS.json` | Estado legible por máquina del loop Codex (fase 089) | 28 KB | `package-a4-validation.py:19`. Los `RESULTADO.json` de los loops 081/082 lo listan como modificado | Conservar | Lo escriben los loops Codex y lo empaqueta un script | Moverlo rompe el empaquetado A4 y los loops lo recrearían en la raíz. Está desactualizado (dice 0.8.9) |
| `PROGRESS.md` | Registro histórico desde el ciclo 1 de la web hasta 0.7.x | 91 KB | solo documentación (`sketchup_offline/TASKS.md:34`). Los loops 081/082 lo modifican | Conservar | Los loops Codex escriben en él | Archivarlo hace que el próximo loop lo recree vacío. Alternativa en 7.2 |
| `TASKS.md` | Backlog del MVP web + estados 0.6–0.7 | 25 KB | solo documentación; loops 081/082 | Conservar | Igual que `PROGRESS.md` | Igual que `PROGRESS.md` |
| `PLAN_DESARROLLO_EXTENSION.md` | Plan del 15-oct (estado 0.4) | 14 KB | README:13 (enlace) | **Archivar** | Obsoleto. El seguimiento real está en `sketchup_offline/TASKS.md` | Bajo: hay que actualizar el enlace del README |
| `package.json`, `package-lock.json` | Dependencias y scripts npm | 2 KB / 252 KB | npm | Conservar | Necesarios | — |
| `tsconfig.json`, `next.config.ts`, `next-env.d.ts` | Configuración de TS y Next | <1 KB | tsc, next | Conservar | Necesarios (`next-env.d.ts` se versiona por convención) | — |
| `eslint.config.mjs`, `vitest.config.ts` | Configuración de lint y unitarias | <1 KB | npm scripts | Conservar | Necesarios | — |
| `playwright.config.ts`, `playwright.offline.config.ts` | E2E web y offline | <1 KB | npm scripts | Conservar | Necesarios | — |

### 4.3 Duplicados exactos (mismo hash de blob)

| Grupo | Archivos | Decisión |
|---|---|---|
| `inspeccionar_pdf.py` ×4 | `docs/loop-a4/`, `docs/loop-a4-071/`, `-072/`, `-073/` | Conservar. Cada carpeta es un paquete de entrega autocontenido para Codex local |
| `santo-carpintero.png` ×2 | `public/` y `sketchup_offline/assets/` | Conservar: son bundles independientes |
| `validar_pedido_txt.py` ×2 | `planos-santo-arranque/scripts/` y `planos-santo-ocl-066/scripts/` | Se resuelve al reubicar el validador (6.1) y archivar los dos loops |
| `pedido_ejemplo.txt` ×2 | `planos-santo-arranque/fixtures/` y `planos-santo-ocl-066/fixtures/` | Se archivan con sus loops |
| `VALIDACION_*` ×4 pares | `toolbar-082`↔`docs/loop-toolbar-083`, `ux-082`↔`docs/loop-ux-084`, `experiencia-084`↔`docs/loop-fotos-085`, `ux-085`↔`docs/loop-flujos-086` | Ya existe la copia en `docs/`. Se archivan con el loop |
| JSON de validación nativa ×2 pares | `V16-restarted-integrity.json`=`final-native-integrity.json`; `V16-restart-restored.json`=`V16-restored.json` | **Intocable**: cada nombre es un paso del protocolo nativo |

### 4.4 Binarios y archivos grandes versionados

| Archivo(s) | Tamaño | ¿Debería estar en git? |
|---|---|---|
| `dist/*-Validacion-*.zip` (0.8.7 y 0.8.9: ~5 MB cada uno; 0.8.8 y 0.8.10: 28–121 KB) | 10,4 MB | Es una entrega, no código fuente. Mejor ubicación: GitHub Release. **Intocable por ahora** |
| `dist/*-candidata.rbz` ×4 | 7,3 MB | Lo mismo. Además, la historia ya guarda **3 versiones distintas** de `0.8.10-candidata.rbz` y 2 de `0.8.8` y `0.8.9`: cada recompilación suma ~1,8 MB al pack de forma permanente |
| `artifacts/PlanosSanto-0.5.3.rbz` | 1,55 MB | Sí: es un fixture de prueba. **Intocable** |
| `sketchup_offline/assets/DejaVuSans*.ttf` | 1,1 MB | Sí: fuentes embebidas en el PDF offline |
| `audit/.../areas_comparacion_y_verificacion.json` | 274 KB | Sí: material de auditoría |
| PNG `*-SINTETICA.png` (`docs/hito1-pintura-088/capturas`, `dist/capturas`) | ~130 KB | Sí: son livianos y están rotulados como sintéticos |
| **`*.pyc` ×4** (`scripts/__pycache__/` ×3, `docs/loop-a4/__pycache__/` ×1) | ~30 KB | **No.** Son bytecode regenerable de CPython 3.12. Decisión: **Eliminar del índice** (`git rm --cached`) |
| `planos-santo-loop-pintado-073/reports/.keep` | 0 B | Inofensivo. Se archiva con su loop |

## 5. Reglas de `.gitignore` que faltan (propuesta, sin aplicar)

```gitignore
# Bytecode y caches de Python (hoy hay 4 .pyc versionados)
__pycache__/
*.py[cod]
.pytest_cache/

# Protección de datos privados independiente de la ruta: sobrevive a mover o archivar loops.
# Verificado: ningún archivo versionado coincide hoy con estos patrones.
**/referencias_privadas/
**/evidencia_local/
**/backups/
**/baseline/
**/runs/
!**/runs/.gitkeep

# Datos crudos del taller en cualquier carpeta (complementan *.skp / *.skm existentes)
**/inventario_materiales.json
**/inventario_materiales.csv

# Ruido de sistema operativo, editores y logs
.DS_Store
Thumbs.db
desktop.ini
*.log
*.tmp

# Salidas de herramientas que hoy no generan conflicto, pero conviene cubrir
coverage/
blob-report/
playwright/.cache/
```

Decisiones de diseño:

- **No propongo** reglas genéricas para `**/referencias/`, `**/state/`, `**/ux/`, `**/reports/` ni `**/manual/`, porque en el repo hay archivos legítimos versionados con esos nombres (`loop-068/manual/validacion_usuario.example.json`, `loop-pintado-073/reports/*`). Para esas rutas, al archivar un loop se agrega una regla **explícita con la ruta nueva** (ver 6.2).
- **No propongo** ignorar `dist/` ni `*.rbz`/`*.zip`: `dist/` es intocable y el fixture 0.5.3 tiene que seguir versionado.
- Validación antes de aplicar: `git ls-files -ci --exclude-standard` tiene que devolver solo los 4 `.pyc`, que luego se sacan con `git rm --cached`.

## 6. Plan de comandos para revisión humana (NO ejecutado)

Orden obligatorio: 6.0 → 6.1 → 6.2 → 6.3. Cada fase termina con la verificación del skill `planos-santo-verificacion` (`npm run verify:offline` + Ruby + vitest).

### 6.0 Preparación y salvaguardas (en cada máquina con datos del taller)

```bash
git switch -c chore/orden-repo
# 1. ¿Hay datos privados locales en los loops? Si aparece algo, se saca FUERA del repo antes de seguir.
git status --ignored --porcelain planos-santo-* | grep '^!!'
# 2. Aplicar las reglas de la sección 5 y verificar que no capturan nada versionado salvo .pyc
git ls-files -ci --exclude-standard
# 3. Sacar el bytecode del índice (los archivos locales se conservan)
git rm -r --cached scripts/__pycache__ docs/loop-a4/__pycache__
git commit -m "chore: ignorar bytecode de Python y generalizar reglas privadas"
```

### 6.1 Reubicar los validadores que usan las pruebas (requiere editar código)

```bash
mkdir -p scripts/validadores
git mv planos-santo-ocl-066/scripts/validar_pedido_txt.py  scripts/validadores/validar_pedido_txt.py
git mv planos-santo-loop-068/scripts/validar_txt_maderera.py scripts/validadores/validar_txt_maderera.py
# Editar a mano (no se puede hacer con git mv):
#  - sketchup_offline/test/workshop_test.rb:110   -> scripts/validadores/validar_pedido_txt.py
#  - sketchup_offline/test/edge_sides_test.rb:103 -> scripts/validadores/validar_txt_maderera.py
#  - tests/offline/names.spec.ts:469              -> scripts/validadores/validar_txt_maderera.py
#  - scripts/package-hito1-fixes.py:29,36 y scripts/package-paint-validation.py:38
#    -> reemplazar 'planos-santo-ocl-066/scripts' y 'planos-santo-loop-068/scripts' por 'scripts/validadores'
#    (scripts/ ya está en la lista permitida, así que alcanza con quitar esas entradas)
# Comprobar que los scripts de cada loop no importan el validador por ruta relativa:
grep -rn "validar_pedido_txt\|validar_txt_maderera" planos-santo-ocl-066 planos-santo-loop-068
node scripts/test-offline-ruby.mjs && npm run test:offline:ui
```

### 6.2 Archivar los loops y el plan viejo

```bash
mkdir -p docs/historico/loops
for d in planos-santo-arranque planos-santo-ocl-066 planos-santo-loop-068 planos-santo-loop-nombres \
         planos-santo-loop-pintado-073 planos-santo-loop-toolbar-082 planos-santo-loop-ux-082 \
         planos-santo-loop-experiencia-084 planos-santo-loop-ux-085; do
  git mv "$d" "docs/historico/loops/$d"
done
git mv PLAN_DESARROLLO_EXTENSION.md docs/historico/PLAN_DESARROLLO_EXTENSION.md
# Editar a mano:
#  - .gitignore: reemplazar las reglas 'planos-santo-*/...' por las rutas nuevas. Como mínimo:
#      docs/historico/loops/planos-santo-loop-068/referencias/
#      docs/historico/loops/planos-santo-loop-068/state/
#      docs/historico/loops/planos-santo-loop-068/manual/validacion_usuario.json
#      docs/historico/loops/planos-santo-loop-pintado-073/referencias/
#      docs/historico/loops/planos-santo-loop-pintado-073/state/
#      docs/historico/loops/planos-santo-loop-toolbar-082/referencia/
#      docs/historico/loops/planos-santo-loop-ux-082/WIREFRAME_REFERENCIA.html
#      docs/historico/loops/planos-santo-loop-experiencia-084/ux/
#      docs/historico/loops/planos-santo-loop-ux-085/ux/
#  - scripts/package-hito1-fixes.py: agregar a la exclusión las partes 'ux', 'backups', 'baseline', 'state', 'referencia'
#    (hoy incluye todo docs/ en el ZIP de fuentes)
#  - scripts/package-paint-validation.py:39-42,78-99: actualizar rutas de KIND toolbar/ux/photo/flows
#    o documentar que esos KIND quedan solo para consulta histórica
#  - README.md:13: enlace a docs/historico/PLAN_DESARROLLO_EXTENSION.md
# Verificación anti-fuga: no debe aparecer nada privado como pendiente de agregar
git status --porcelain --ignored docs/historico | grep -v '^R ' 
npm run verify
```

### 6.3 Cierre

```bash
git ls-files | grep -c '^planos-santo-'   # debe dar 0
git ls-files -ci --exclude-standard        # debe quedar vacío
git commit -m "chore: archivar loops cerrados en docs/historico"
```

## 7. Pendientes y recomendaciones fuera del alcance

1. **Corregir el desfase de versión (prioridad alta).** README línea 3 (0.8.9 en lugar de 0.8.10), `CODEX_STATUS.json` (fase 089) y `scripts/package-hito1-fixes.py:7` (`assert version=='0.8.9'`, que con 0.8.10 falla de entrada). Falta validar con qué script se generó `dist/PlanosSanto-0.8.10-*`: no aparece referenciado en `scripts/`.
2. **`PROGRESS.md` y `TASKS.md` de la raíz.** Mi recomendación es no moverlos mientras los loops Codex los escriban. Sí conviene cortar todo lo anterior a 0.8 en `docs/historico/PROGRESS_hasta_0.7.md` y dejar en la raíz un registro corto con enlace. Es una edición de contenido, no un `git mv`.
3. **`dist/` en git.** Hecho: es el 71 % del árbol, y cada recompilación de una candidata agrega ~1,8 MB permanentes al pack. Mi recomendación es dejar en `dist/` solo `README.md`, los `.sha256` y las capturas, y publicar RBZ y ZIP como GitHub Releases. Ignorar `dist/*.rbz` y `dist/*.zip` **después** de publicarlos. Reescribir la historia para recuperar los ~24 MB **no** lo recomiendo: el beneficio es bajo y rompe los clones de Dot/Codex.
4. **`native/`.** Es candidato a `docs/historico/` cuando se toque la lista permitida de los dos scripts de empaquetado. Hoy no vale el cambio.
5. **Pruebas Python de los loops** (`tests/test_*.py` dentro de cada loop). Nadie las ejecuta. Al archivarlos, quedan solo como referencia y no hace falta portarlas.
