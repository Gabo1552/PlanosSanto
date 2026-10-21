# 06 — Decisión de arquitectura y licencia

## 1. Hechos que condicionan la decisión

| # | Hecho | Fuente |
|---|---|---|
| H1 | OCL se publica bajo **GPLv3**. Sus archivos no tienen encabezado por archivo; el copyright figura como "GNU GPLv3" en el registro de la extensión | `LICENSE`; `src/ladb_opencutlist.rb:24` |
| H2 | OCL tiene ≈ 57.000 líneas de Ruby propias, 20.600 de JS, 141 plantillas y binarios nativos (Packy, Clippy, Imagy) para Windows y macOS | Informe del clon `1ef3e14c` |
| H3 | El motor de optimización de OCL (Packy) es nativo y depende de `fontanf/packingsolver` **[inferido: MIT; hay que verificarlo]** | `cpp/lib/Packy/extern/CMakeLists.txt:18-26` |
| H4 | Para OCL, una **pieza es una ComponentInstance**; los grupos no son piezas. PS trata grupos y componentes como piezas | `helper/part_helper.rb:7-13`; `cutlist_generate_worker.rb:926-979` |
| H5 | Lo que hace directo el pintado de OCL son **decisiones de diseño**, no código difícil: `model.materials` como fuente, HUD en el viewport, asignación directa | `05_CAUSA_PINTADO.md` §4 |
| H6 | PS tiene funciones que OCL no tiene: nombres por mueble, guía A4 y TXT de maderera por lotes | `02_MAPA_CODIGO.md` §6-8 |
| H7 | PS tiene fuente completo en `main`, build reproducible bit a bit y 422 pruebas Ruby con dobles; ninguna en SketchUp real | `01_ESTADO_ACTUAL.md` |

### Lo esencial de GPLv3 para esta decisión

**Esto no es asesoramiento legal.** Para distribuir comercialmente, conviene validarlo con un abogado de propiedad intelectual.

- GPLv3 permite **usar, estudiar y modificar libremente**. Las obligaciones aparecen al **distribuir** ("convey") el programa o una obra derivada a terceros: entregar el código fuente completo bajo GPLv3, conservar los avisos y no agregar restricciones.
- Si se **copia o adapta código de OCL** (Ruby, JS, Kuix, iconos) dentro de Planos Santo y luego se distribuye el RBZ (a clientes, otros talleres o en venta), **el RBZ completo** pasa a tener que distribuirse bajo GPLv3 con su fuente.
- **El uso interno en el propio taller**, sin entregar el RBZ a terceros, en general **no** dispara la obligación de publicar el código. Hay que confirmarlo si hay más de una empresa o PCs de terceros.
- **Aprender de OCL** (cómo resuelve un problema, qué API de SketchUp usa) y **escribir código propio desde cero** no genera obra derivada. Es la base de la opción 1.
- **Leer** los atributos `ladb_opencutlist` de un modelo (interoperabilidad de datos) no es copiar código. **Abrir el diálogo de OCL instalado** (`OclGateway`) tampoco: es usar el programa, no incorporarlo.

## 2. Las tres alternativas

### Opción 1 — Mantener el núcleo PS y adoptar los **patrones** de OCL sin copiar código (*clean-room*)
- **Qué implica:**
  - Reescribir el pincel con 4 ideas tomadas de OCL, implementadas con código propio sobre la API pública de SketchUp:
    1. fuente de verdad en `model.materials` + auto-instalación desde el catálogo;
    2. barra de materiales dibujada en el viewport con `view.draw2d` / Overlay (no Kuix);
    3. pintar pieza = material de la instancia;
    4. validación cacheada, sin recorridos globales por clic.
  - Mantener nombres, guía y maderera.
  - Delegar la optimización y los costos con desperdicio a **OCL original instalado** (ya existe `OclGateway`), y en lo posible escribir `ladb_opencutlist/type` en los materiales PS para que OCL los reconozca. **Decisión a confirmar:** hoy PS se prohíbe escribir atributos de OCL.
- **Esfuerzo:** M (≈ 3–5 semanas para el pincel nuevo + hotfix).
- **Deuda:** baja. Código propio y acotado (HUD estimado en 400–700 líneas **[inferido]**).
- **Regresiones:** controladas: se cambia un módulo (pintado) con pruebas en copias.
- **Licencia:** **sin obligaciones GPL**. Hay que documentar el *clean-room*: no tener abierto ni pegar código OCL, y escribir desde la especificación de comportamiento de este informe.
- **Rendimiento:** mejora fuerte esperada en el clic.
- **Taller:** mismo producto, sin el error y con menos pasos. OCL sigue instalado para optimizar.

### Opción 2 — Reutilizar componentes de OCL legalmente (GPLv3)
- **Qué implica:** incorporar Kuix (la librería del HUD), `SmartTool`/`SmartPaintTool` adaptados y/o los workers de cutlist o packing, y **relicenciar Planos Santo completo como GPLv3** si se distribuye.
- **Esfuerzo:** M–L. Kuix y SmartTool están muy acoplados a `PLUGIN`, presets, i18n y `CutlistGenerateWorker` (el pick de piezas corre un cutlist). Extraerlos implica arrastrar mucho código o reescribir las uniones.
- **Deuda:** media-alta. Hay que seguir los cambios de upstream a mano, y Kuix trae su propio sistema de layout.
- **Regresiones:** medias. La semántica "pieza = componente" (H4) choca con modelos de grupos.
- **Licencia:** **todo PS bajo GPLv3** al distribuir: fuente pública para quien reciba el RBZ. Sin problema si se usa solo internamente. Inviable si se quiere vender cerrado.
- **Rendimiento:** comparable a OCL.

### Opción 3 — Fork de OCL con identidad Planos Santo
- **Qué implica:** partir del repositorio de OCL (GPLv3), cambiar marca e identidad, y agregar nombres por mueble, guía A4 y maderera como pestañas o herramientas nuevas.
- **Esfuerzo:** L–XL. Hay que aprender y mantener ≈ 80.000 líneas, el build con gulp + CMake y los binarios nativos para 2 plataformas, y portar las funciones de PS a jQuery/Twig (la UI React de PS no encaja).
- **Deuda:** **alta y permanente**: hay que hacer *merge* de upstream en cada versión o quedarse congelado.
- **Regresiones:** altas en lo propio de PS (grupos vs componentes, modelo de datos del catálogo).
- **Licencia:** GPLv3 obligatoria, fuente pública al distribuir y atribución a OCL. La identidad propia es posible, pero **debe quedar claro el origen**.
- **Ventaja real:** optimización, costos y etiquetas "gratis" desde el día 1.
- **Riesgo operativo:** conflicto si conviven el OCL original y el fork (mismo diccionario `ladb_opencutlist`, mismos tipos) **[inferido]**.

## 3. Comparación

| Criterio (peso) | Opción 1: Patrones | Opción 2: Componentes GPL | Opción 3: Fork |
|---|---|---|---|
| Resolver el pintado ya (30%) | **Alta** (hotfix en días; pincel nuevo en semanas) | Media (integración lenta) | Baja (meses) |
| Mantenibilidad / deuda (20%) | **Alta** | Media | Baja |
| Conservar el diferencial PS (15%) | **Alta** | Alta | Media (hay que portarlo) |
| Optimización y costos (15%) | Media (delegados a OCL instalado) | Media | **Alta** |
| Libertad de licencia (10%) | **Total** | Solo si se acepta GPLv3 | Solo GPLv3 |
| Riesgo de regresión (10%) | **Bajo** | Medio | Alto |
| **Resultado** | **Recomendada** | Plan B | No recomendada hoy |

## 4. Recomendación

**Opción 1**, con estas condiciones:

1. **Clean-room documentado.** Quien implemente no copia ni pega código, iconos ni recursos de OCL. Este informe (comportamiento y API) es la especificación. Se registra en `THIRD_PARTY_LICENSES.txt` que no se incorporó código OCL.
2. **OCL original sigue instalado** como motor de optimización, costos y etiquetas hasta que haya motivo para internalizarlos. PS no lo reemplaza.
3. **Interoperabilidad de datos (decisión del dueño):** que PS **escriba** `ladb_opencutlist/type` (2 = placa, 4 = canto) y `thickness` en **los materiales que PS crea**, para que el cutlist y la optimización de OCL los entiendan sin retipar a mano. No viola GPL (es formato de datos). Rompe la regla interna actual de "no escribir atributos OCL", así que **requiere aprobación explícita**. Alternativa sin escritura: el usuario los tipa en OCL una vez.
4. **Revisar a los 6 meses.** Si el taller necesita optimización integrada y no le molesta que el producto sea GPLv3, evaluar la opción 2 para ese módulo específico.

### Por qué no el fork
El problema actual **no es que falte motor**, sino que el pincel de PS es indirecto y su modelo de material está acoplado al catálogo comercial. Un fork resolvería el pintado a cambio de cargar con 80.000 líneas ajenas, binarios nativos y GPL, y obligaría a reescribir lo que PS ya hace mejor (nombres, guía, maderera). La relación esfuerzo/beneficio no cierra para una pyme.

## 5. Diseño objetivo del pincel (Opción 1)

1. **Fuente de verdad del pincel = `model.materials`** con vínculo PS válido **+ fichas del catálogo instalables automáticamente**. Un material del modelo sin vínculo PS también debe poder pintarse ("material libre", sin datos de maderera), igual que en OCL. El vínculo solo condiciona el pedido, no el diseño.
2. **Auto-instalación:** al elegir una ficha no presente, se instala desde el SKM verificado en la misma operación del primer clic, o en una operación propia transparente.
3. **HUD propio en el viewport:** franja inferior con miniaturas o colores de los materiales del modo actual, filtro placa/canto, buscador opcional en la paleta (que pasa a ser **opcional**, para administración). Teclas: ←/→ material, Tab placa/canto/quitar, Ctrl+Tab 1/2/4, Alt cuentagotas temporal, Esc salir.
4. **Pintar pieza:** `instance.material = placa`. Al hacerlo, **quitar el material de caras amplias** de esa pieza solo si las caras están en una definición **no compartida**; si está compartida, aplicar solo a la instancia y avisar. Los cantos (caras estrechas con material de canto) **se preservan siempre**. Hay que validar que OCL y la maderera de PS lean el material correcto (pruebas T-OCL).
5. **Pintar canto:** caras de la definición según el marco local. Si la definición está compartida, ofrecer en el HUD (no en un diálogo): "esta pieza sola (hace única)" o "todas las iguales". Por defecto, la elección del taller (a definir; propuesta: "todas las iguales", porque en melamina los gemelos suelen llevar el mismo canto).
6. **Costo por clic O(pieza):** resolver la ruta clicada, validar el material una vez al seleccionarlo (caché invalidado por `MaterialsObserver`) y no hacer inventario global.
7. **Undo:** una operación por clic, como hoy.
