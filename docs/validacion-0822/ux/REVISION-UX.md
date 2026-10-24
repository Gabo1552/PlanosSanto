# Revisión UX · Planos Santo 0.8.22

## Implementado

- Maderera abre un resumen por material **y espesor real**. Cada tarjeta informa formato, piezas, placas, aprovechamiento y estado TXT; nombre/SKU/veta siguen visibles.
- Un clic abre únicamente el material elegido: configuración, diagramas, leyenda, cantos, problemas y exportación. «Volver a materiales» devuelve el foco a su tarjeta; Enter y Espacio usan botones HTML nativos.
- Los problemas se describen con texto; no se comunican solo por color. El acceso «Ver en el modelo» sigue funcionando. Durante validación, el estado es visible y exportar permanece bloqueado.
- Margen de cantos Experto del15% antes de redondear al metro entero; pasos y recorrido de sierra identificados como estimados.
- Totales del proyecto separados del detalle, advertencias conservadas y explicación técnica secundaria plegada. Material sin formato conserva acceso a su diagnóstico.
- Identidad corporativa basada en los SVG proporcionados: tinta azul noche **#000028** y blanco, con neutros claros derivados. El logo original se muestra en el encabezado; no se altera su geometría ni el PNG usado por el PDF A4. Verde/ámbar/rojo siguen indicando éxito/advertencia/error.
- Sin tipografías remotas, servicios ni imágenes de materiales privados.

## Repaso por sección (código actual)

| Sección | Evaluación y decisión |
|---|---|
| Pintar | Paleta rápida y avanzada ya separadas; recientes, activo y estados están implementados. Conservar flujo directo; no agregar formularios ni modificar seguridad de instancias. Pendiente validar densidad horizontal y nombres largos en SketchUp Windows. |
| Materiales | La ficha separa vista general y datos de pedidos mediante pestañas. Conservar SKU/proveedor y listas de espesores/formatos: necesarios para maderera. No imponer validación comercial para pintar. Pendiente prueba de importación con biblioteca grande real. |
| Muebles | Nombres editables junto al visor, filtro y agrupación existente conservados. «Proponer nombres» y «Codificar despiece» cumplen funciones distintas; posible siguiente mejora: explicación comparativa en ayuda contextual, sin fusionar operaciones de renombrado. |
| Piezas | Lista de corte por material y espesor conserva cantos/ejes; medidas de modelo no editables. Pendiente recorrido de taller para confirmar terminología Base/Altura frente a Largo/Ancho en situaciones rotadas. No renombrar ejes técnicos sin evidencia. |
| Planos A4 | Tabla de plano de solo lectura deriva edición de nombres a Muebles; cámaras, ocultas y notas conservadas. No incorporar ajustes de corte en vistas ni cambiar cotas del PDF. Pendiente verificación nativa del nuevo encabezado a escalado125/150%. |
| Maderera | Cambio principal aplicado: resumen → material → despiece/TXT, regreso predecible, advertencias visibles, ayuda plegable. Formato proviene de ficha, no de nombre/marca. |

No se afirma haber validado todas las secciones manualmente en SketchUp: el repaso transversal es estático y los cambios funcionales se concentran en Maderera.

## Skill solicitada y procedencia

Repositorio utilizado: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
Commit consultado: `d14efff8ed1faa4187f004f79926f428c8074ec7`.
Archivo leído: `.claude/skills/ui-ux-pro-max/SKILL.md` y `references/pro-rules.md` (este último identifica su alcance móvil; se usa solo lo aplicable a escritorio).

Consultas ejecutadas con su `scripts/search.py`:

- `workshop inventory dashboard --design-system --density 8 --variance 2`
- Reintento más específico: `industrial operations dashboard --design-system --density 8 --variance 2`
- `keyboard focus navigation --domain ux -n 3`
- `focus state navigation --stack react -n 2`

Los dos resultados de sistema propusieron estructura marketing Hero/CTA, no adecuada a una herramienta de taller: **descartada**. Se adoptó la recomendación de minimalismo funcional/densidad operativa; navegación por teclado, foco visible, HTML semántico y regreso del foco tuvieron coincidencias específicas. La paleta viene del logo del usuario, no de la recomendación genérica. No se copiaron iconos, marca ni assets de OpenCutList.

## Pruebas y evidencia

`npx playwright test --config playwright.offline.config.ts tests/offline/optimizer-material-navigation.spec.ts`

Resultado: **3/3 PASS** (repetidas tras colores y avisos de motor). Harness de componente con dos materiales sintéticos, no modelos/SKM privados. Comprueba teclado, foco de ida/vuelta, un solo detalle, callback de exportación y resaltado, bloqueo, estado ocupado, Axe WCAG2A/AA/2.1AA y ancho390px sin desborde en resumen. El tercer caso comprueba diagnóstico de motor bloqueado y total parcial.

Las pruebas antiguas `maderera-placas.spec.ts` se adaptaron al acceso por tarjeta; su ejecución final se coordina con integración de los motores.

Capturas sintéticas:
- `antes-SINTETICO.png`: estructura anterior, mismos datos ficticios, estilo base actual del harness.
- `despues-resumen-SINTETICO.png`: resumen de materiales.
- `despues-detalle-SINTETICO.png`: detalle de uno de los materiales.

No equivalen a evidencia de SketchUp 2026 ni a aceptación comercial de ningún proveedor. Validación final integrada y nativa queda registrada por el desarrollador principal/local.

### Integración candidata 0.8.22

Ejecución coordinada tras build del desarrollador principal:

`npx playwright test --config playwright.offline.config.ts tests/offline/optimizer-material-navigation.spec.ts tests/offline/maderera-placas.spec.ts`

**7/7 PASS**: tres regresiones Maderera existentes adaptadas, tres de navegación y un nuevo flujo Experto integrado con controlador Ruby real y dobles sintéticos de SketchUp. El nuevo caso confirma formato2750×1830 de ficha, selector persistido, controles General ocultos en Experto, TXT9columnas con rota1 y cantoasimétrico conservado, margen15% de canto antes de redondear (2→3metros), regreso General restaura parámetros3,2/15 y rota0. Validadores TXT Python pasan. Axe pasa en ambos métodos.

`experto-integrado-SINTETICO.png` y `general-integrado-SINTETICO.png` muestran el encabezado con el logo original y la navegación azul. Inspeccionadas visualmente. Tras captura se unificó también el fondo de encabezados de tabla a azul corporativo; la captura conserva el tono previo de esas tablas hasta la próxima reproducción. La comprobación visual en SketchUp Windows sigue pendiente.

### Correcciones posteriores a revisión

- El motivo de una tarjeta bloqueada prioriza errores del motor, falta de formato/medidas y problemas reales; evita el mensaje incorrecto «0 piezas requieren corrección».
- El resumen recibe también las piezas que están fuera de todos los materiales. Las cuenta explícitamente y señala total parcial, aunque todas las placas presentes se hayan optimizado.
- Suite aislada ampliada: **4/4 PASS**, incluido un caso con3piezas fuera del cálculo. ESLint focal y `git diff --check`: PASS.

### Paleta independiente

También se actualiza `smart-paint.css`: tokens, selección, foco y acciones adoptan el azul noche del logo. La paleta rápida y la avanzada no dependen de `ux-shell.css`; por eso requieren su propia actualización. No cambian layout, funciones, muestras reales de material, advertencias ni estados semánticos verdes de herramienta activa. Sin logo adicional para conservar espacio de trabajo. Pruebas focales y captura se registran tras el build coordinado.

Tras build final coordinado: `palette-fast.spec.ts`, `immediate-palette.spec.ts` y `pincel-avanzado.spec.ts`, salida separada `/tmp/0822-palette`: **26/26 PASS**. Capturas `paleta-corporativa-680-SINTETICO.png` y `paleta-corporativa-360-SINTETICO.png` copiadas; vista680inspeccionada visualmente. Materiales QA conservan sus colores/texturas; acciones y selección usan azul noche, estado Pintando permanece verde. Sin cambios adicionales de producto tras ese build.
