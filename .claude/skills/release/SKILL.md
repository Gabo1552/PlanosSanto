---
name: release
description: Sacar una versión candidata de Planos Santo (X.Y.Z): subir la versión, correr la batería completa, armar el RBZ reproducible, documentar, limpiar dist, abrir el PR y, según el modo, mergear o esperar la prueba en SketchUp. Usar cuando el usuario pide «sacá la versión», «armá el RBZ», «subilo y mergealo» o invoca /release.
---

# Entrega de una versión (`/release`)

Uso: `/release [X.Y.Z] [directo|espera]`. Sin versión, sube el último número de la actual (`sketchup_offline/version.json`). Correr desde la raíz del repo.

## Elegir el modo

| Modo | Cuándo | Qué hace al final |
|---|---|---|
| **directo** | Cambios chicos y acotados (un tope, un texto, un ajuste de UI) o el usuario dijo «mergealo» | Mergea el PR y manda el RBZ |
| **espera** | Cambios en pintura, veta, geometría (Dibujar pieza), guardado de la guía, optimizadores o compatibilidad SketchUp 2022 | Manda el RBZ y deja el PR **abierto** hasta que el usuario confirme la prueba en SketchUp |

Si el usuario no dijo el modo, proponé uno con el motivo en una línea. Ante la duda, **espera**. Mergear siempre necesita una autorización del usuario en esta conversación («mergealo», «dale con el merge»); un modo «directo» elegido en otra versión no vale para esta.

## Pasos

1. **Rama.** Trabajar en la rama de la sesión. Si su PR anterior ya se mergeó, reiniciarla desde `origin/main` (`git fetch origin main && git checkout -B <rama> origin/main`).
2. **Versión.** `node scripts/release/bump-version.mjs X.Y.Z`. Cambia los cuatro lugares (`version.json`, la lista de `lib/model.ts` y los dos verificadores 0811) o ninguno.
3. **Batería.** `bash scripts/release/bateria.sh` (unos 12 minutos; correrla en segundo plano). Pasos: tsc, eslint, build, vitest, Ruby 3.3, chequeo Ruby 2.7, Ruby 2.7, exportador, Playwright offline, next build y Playwright web. El build va antes de vitest a propósito. **Si falla un paso, se corrige y se vuelve a correr entera.** No se saltea ni se desactiva ninguna prueba.
4. **Commit del cambio** (código + versión), antes de los documentos.
5. **Documentos** en `docs/validacion-XXYY/` (`0.8.31` → `validacion-0831`), con el tono de las versiones anteriores:
   - `CAMBIOS.md`: base, estado («pendiente de validación real; producción no aprobada»), qué había, cambio, pruebas nuevas, qué se conserva y límites (compatibilidad hacia atrás, rendimiento, lo que sólo se probó con dobles).
   - `VALIDACION_LOCAL.md`: pasos concretos para probar **en SketchUp** lo nuevo, sobre copias, y la regresión.
   - `dist/README.md`: una entrada nueva arriba de todo, `# Entrega X.Y.Z — <resumen>, PENDIENTE DE VALIDACIÓN REAL`, separada con `---`.
6. **Empaquetar.** `python3 scripts/release/preparar.py X.Y.Z [--nota "…"] [--check clave=PASS]`:
   - genera `RESULTADOS.json` con los conteos de los logs de la batería;
   - arma el RBZ dos veces y exige el mismo SHA;
   - copia `empaquetar.py` de la versión anterior y lo corre (RBZ, `.sha256` y paquete de validación en `dist/`);
   - saca de `dist/` todo lo que no sean las dos últimas versiones (y su entrada en `dist/README.md`);
   - actualiza la línea «Candidata actual» de `README.md`.
   
   A mano queda una sola cosa: la frase de `README.md` que empieza «La X.Y.Z …» (sumarla delante de la anterior).
7. **Commit y push** de la entrega: `git add -A docs/validacion-XXYY dist README.md`, commit «Candidata X.Y.Z: RBZ, paquete de validación y documentación» y `git push -u origin <rama>`.
8. **PR** con las herramientas de GitHub: crearlo como borrador, con qué cambia, las pruebas (conteos de `RESULTADOS.json`), el SHA del RBZ y «Pendiente de validación en SketchUp real». Después pasarlo a listo.
9. **Cierre según el modo:**
   - **directo:** mergear con el SHA completo del último commit y mandar el RBZ con `SendUserFile`.
   - **espera:** mandar el RBZ con `SendUserFile`, suscribirse al PR y **no mergear**. Mergear recién cuando el usuario confirme que lo probó, o que lo mergee igual.
10. **Informe al usuario** (en castellano, corto): qué cambió en términos del taller, qué se verificó (simulado), qué falta probar en SketchUp con los pasos de `VALIDACION_LOCAL.md`, y las preguntas abiertas.

## Reglas

- **Simulado ≠ SketchUp.** Las pruebas usan dobles de la API. Nunca decir «probado en SketchUp»; `nativeSketchupExecuted` queda en `false` hasta que el usuario lo valide.
- No publicar modelos del taller, SKM, texturas comerciales ni datos de clientes. `empaquetar.py` rechaza `.skp`, `.skm` y `.jpg` dentro del RBZ.
- No commitear `sketchup_offline/build/` ni `artifacts/` (los logs de la batería quedan en `artifacts/bateria/`).
- No tocar la configuración global de Claude Code ni agregar hooks.
- No incluir identificadores de modelo en commits, PR ni documentos.
- Si `preparar.py` falla, leer el motivo y corregir la causa; no editar `RESULTADOS.json` a mano para que pase.
