# Everything Claude Code (ECC) — instalación selectiva del proyecto

- **Origen:** https://github.com/affaan-m/ECC (repositorio oficial)
- **Commit:** `90606c8315ee09cafc303515c5f33024db6b9882` (2026-10-20, `VERSION` 2.2.3)
- **Licencia:** MIT. Copia en `.claude/ECC-LICENSE`.
- **Método:** copia manual por componente, documentada en el README de ECC ("Manual component-by-component copying"). Alcance: **solo este proyecto** (`.claude/`).
- **Fuera de alcance:** `~/.claude`, `settings.json`, hooks y servidores MCP. No se tocaron.
- **Por qué no se usó el instalador** (`ecc install --target claude-project`): el *dry-run* agregaba más de 25 skills ajenas al proyecto (healthcare, DeFi, Laravel, etc.) y scripts de soporte.

## Componentes instalados (archivos sin modificar)

| Componente | Rol en Planos Santo |
|---|---|
| `agents/architect.md` | Decisiones de arquitectura y refactorización |
| `agents/planner.md` | Planificación y división de tareas |
| `agents/code-reviewer.md` | Revisión de calidad general |
| `agents/ruby-reviewer.md` | Revisión del código Ruby de la extensión (`sketchup_offline/*.rb`) |
| `agents/typescript-reviewer.md` | Revisión de la UI (`sketchup_offline/ui/*.tsx`) |
| `agents/tdd-guide.md` | Pruebas primero |
| `agents/security-reviewer.md` | Revisión de seguridad (archivos locales, rutas, ZIP/SKM, puente HtmlDialog) |
| `agents/build-error-resolver.md` | Errores de esbuild, `tsc` y empaquetado del RBZ |
| `skills/verification-loop/` | Ciclo de verificación genérico |
| `skills/tdd-workflow/` | Flujo TDD genérico |
| `skills/security-review/` | Checklist de seguridad |

**Adaptación propia** (no viene de ECC): `skills/planos-santo-verificacion/SKILL.md` traduce el *verification loop* a los comandos reales de este repo (Ruby con dobles de la API de SketchUp, esbuild, `tsc`, vitest, Playwright offline y empaquetado RBZ) y separa con claridad las pruebas simuladas de las pruebas en SketchUp.

## Huellas SHA-256 al instalar

```
326146379f01bb13…  ECC-LICENSE
6b8e1e8bd274995f…  agents/architect.md
acc9e14df59dd28d…  agents/build-error-resolver.md
9dd23be23d65f181…  agents/code-reviewer.md
63aba865206bac9c…  agents/planner.md
3ba715e19b0f776f…  agents/ruby-reviewer.md
813e4062bed5f42a…  agents/security-reviewer.md
979afbb40c42bfdd…  agents/tdd-guide.md
6b012db1a9039870…  agents/typescript-reviewer.md
b9eb6416eebc8dda…  skills/security-review/SKILL.md
7d9a83852475a939…  skills/security-review/cloud-infrastructure-security.md
8887afa786ef30de…  skills/tdd-workflow/SKILL.md
5b06be54d4852f60…  skills/verification-loop/SKILL.md
```

## Actualizar o quitar
- **Actualizar:** clonar ECC en el commit deseado, volver a copiar los mismos archivos y actualizar este documento.
- **Quitar:** borrar los archivos listados. No hay estado instalado en otro lugar.
