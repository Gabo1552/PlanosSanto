# Planos Santo 0.8.12 — anexo a la guía 0.8.11

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

La 0.8.12 es la 0.8.11 de `main`, más:

| Cambio | Detalle | Prueba automática (dobles, no SketchUp) |
|---|---|---|
| Hito 3: correcciones de la revisión TypeScript | `WorkshopPanel.tsx` y `workshopRules.ts`: la edición queda bloqueada mientras hay una operación en curso, y las marcas de propuesta (omitir y extra) se limpian al preparar de nuevo | `tests/workshop.test.ts` y la batería completa |
| Orden del repositorio | Siete carpetas de loops viejos y `PLAN_DESARROLLO_EXTENSION.md` pasan a `docs/historico/` (`git mv`, sin borrar). Se agregan reglas al `.gitignore` y se dejan de versionar 4 `.pyc` | build, Ruby, tsc y vitest |
| Verificador | `docs/validacion-0811/verificar_0811_sketchup.rb` ahora espera la versión **0.8.12** | `verificador_0811_test.rb` (29 casos) |

El código del producto es el mismo que en la 0.8.11, salvo esas dos pantallas del Hito 3.

## Cómo validarla

Seguir completa `docs/validacion-0811/GUIA_VALIDACION_0811.md`, instalando `dist/PlanosSanto-0.8.12-candidata.rbz`. Cambia lo siguiente:

1. **Paso 0.9 (versión):** `version.json` dice **0.8.12**. `V.integridad` sin argumentos tiene que dar `passed: true`. La observación «versión sin subir» ya no aplica.
2. **Hito 4 (maderera): ahora SÍ APLICA.** La guía 0.8.11 lo daba por no implementado. Se valida con `docs/hito4/VALIDACION_SKETCHUP.md`, si está en la rama, o como mínimo con `V.perfil_maderera`, que tiene que encontrar el perfil:
   - un perfil no aprobado no cambia medidas ni presupuesto;
   - la migración de la biblioteca v1→v2 deja una copia de seguridad;
   - un paquete con fichas v1 se importa sin error.
3. **Hito 3:** repetir T1–T9 de la guía. Además, con «Preparar de nuevo» en medio de una operación, la tabla no se puede editar hasta que termina.

Sin modelos, SKM, fotos, SKU ni precios reales en el informe.
