# Planos Santo 0.8.12 — anexo a la guía 0.8.11

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

La 0.8.12 es la 0.8.11 de `main`, más:

| Cambio | Detalle | Prueba automática (dobles, no SketchUp) |
|---|---|---|
| Hito 3: correcciones de la revisión TypeScript | `WorkshopPanel.tsx` y `workshopRules.ts`: la edición queda bloqueada mientras hay una operación en curso, y las marcas de propuesta (omitir y extra) se limpian al preparar de nuevo | `tests/workshop.test.ts` y la batería completa |
| Orden del repositorio | Siete carpetas de loops viejos y `PLAN_DESARROLLO_EXTENSION.md` pasan a `docs/historico/` (`git mv`, sin borrar). Se agregan reglas al `.gitignore` y se dejan de versionar 4 `.pyc` | build, Ruby, tsc y vitest |
| Hito 4: cierre de la revisión | Tope de 1e9 al importe de los precios del catálogo; el borrador queda atado a la versión del perfil; en el panel del perfil, aviso de tarifa incompleta, Ctrl+S, `aria-pressed` y anuncio del tipo en lote del SKM | `catalog_schema_test`, `maderera_order_test`, `madera-rules.test.ts`, `hito4-maderera.spec.ts` |
| Hito 6: rendimiento | `NameManager#inventory` arma la huella de caras una vez por definición y guarda sólo su SHA-256, que se compara en memoria. En el banco sintético, el clic en modo Cara o lote (no inmediato) baja de 434 a 93 ms | `inventory_cache_test.rb`, `scripts/bench-analisis.rb` |
| Sugerencias de nombres (BUG-TS-05) | Los listones comunes (40×18, 70×18) se proponen como «Listón»; antes quedaban «Sin clasificar» | `recognition.test.ts` |
| Ajustes chicos de las sesiones | Hito 5: las referencias parciales no dependen del perfil del TXT. Hito 7: fichas archivadas fuera de la paleta y conteo accesible de los filtros. Pincel: el cuentagotas anuncia el cambio de modo y Mayús+Tab no muestrea. Accesibilidad: la biblioteca queda sin violaciones serias de axe; contraste AA del texto chico de la vista previa de visibilidad; la ayuda de atajos describe lo que hacen. App web: notas operables con teclado | Pruebas de cada rama, Playwright offline y e2e web |
| Verificador | `docs/validacion-0811/verificar_0811_sketchup.rb` ahora espera la versión **0.8.12** | `verificador_0811_test.rb` (29 casos) |

El código del producto es el mismo que en la 0.8.11, salvo esas dos pantallas del Hito 3, el cierre del Hito 4, la huella del inventario y la regla del listón.

## Cómo validarla

Seguir completa `docs/validacion-0811/GUIA_VALIDACION_0811.md`, instalando `dist/PlanosSanto-0.8.12-candidata.rbz`. Cambia lo siguiente:

1. **Paso 0.9 (versión):** `version.json` dice **0.8.12**. `V.integridad` sin argumentos tiene que dar `passed: true`. La observación «versión sin subir» ya no aplica.
2. **Hito 4 (maderera): ahora SÍ APLICA.** La guía 0.8.11 lo daba por no implementado. Se valida con `docs/hito4/VALIDACION_SKETCHUP.md` (casos H4-1 a H4-15). `V.perfil_maderera` tiene que encontrar el perfil. Lo mínimo:
   - un perfil no aprobado no cambia medidas ni presupuesto;
   - la migración de la biblioteca v1→v2 deja una copia de seguridad;
   - un paquete con fichas v1 se importa sin error.
3. **Rendimiento (R1–R11 de la guía):** repetir la medición del clic en **modo Cara o lote** (no inmediato) sobre la obra grande. Además, una vista previa con token sigue rechazando un modelo que cambió entre la vista previa y la confirmación.
4. **Sugerencias:** en un mueble con listones de 40×18, la sugerencia dice «Listón», con revisión.
5. **Hito 3:** repetir T1–T9 de la guía. Además, con «Preparar de nuevo» en medio de una operación, la tabla no se puede editar hasta que termina.

Sin modelos, SKM, fotos, SKU ni precios reales en el informe.
