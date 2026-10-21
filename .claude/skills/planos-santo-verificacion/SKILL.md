---
name: planos-santo-verificacion
description: Ciclo de verificación de Planos Santo (extensión SketchUp 2026): pruebas Ruby con dobles de la API, build esbuild, typecheck, lint, vitest, Playwright offline y empaquetado RBZ. Usar después de cada cambio significativo en sketchup_offline/ y antes de abrir un PR.
---

# Verificación de Planos Santo

Adaptación del *verification loop* de ECC a este repositorio. Correr desde la raíz del repo, con `LANG=C.UTF-8` (las pruebas usan rutas con "José").

## Fases (detenerse en la primera falla, corregir y repetir)

1. **Build de la extensión:** `npm run build:offline` genera `sketchup_offline/build/` y el RBZ. Muestra el SHA-256 y el conteo de archivos.
2. **Ruby (dobles de la API de SketchUp):** `node scripts/test-offline-ruby.mjs` corre la sintaxis de todos los `.rb` y todos los `sketchup_offline/test/*_test.rb`, y termina con un resumen.
3. **Tipos y lint:** `npm run typecheck` y `npm run lint` (0 errores).
4. **Unitarias TS:** `npx vitest run`.
5. **UI offline (Chromium + puente simulado y motor Ruby real en algunos specs):** `CHROMIUM_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome npx playwright test --config playwright.offline.config.ts`.
6. **Revisión del diff:** usar los agentes `ruby-reviewer` / `typescript-reviewer` / `security-reviewer` sobre los archivos tocados.

## Reglas
- **Simulado ≠ SketchUp.** Las fases 2 y 5 usan dobles (`fake_model.rb`, `*_double.rb`, bridge drivers). Nunca reportarlas como "probado en SketchUp". La validación real usa `docs/hito1-pintura-088/VALIDACION_SKETCHUP_088.md`.
- No editar los bundles `ui/*.js` a mano: se regeneran con el build.
- No commitear `sketchup_offline/build/`, `*.skp` ni `*.skm` (están en `.gitignore`).
- Los cambios de comportamiento deliberados que rompen una prueba existente se documentan en el informe del hito, junto con la prueba actualizada.

## Reporte
```
VERIFICACIÓN: [PASS/FAIL]
Build:      [OK/FAIL] sha256=…
Ruby:       [N runs, N aserciones, N fallas]
Tipos/Lint: [OK/FAIL]
Vitest:     [N/N]
Playwright: [N/N]
Simulado vs real: [qué falta validar en SketchUp]
```
