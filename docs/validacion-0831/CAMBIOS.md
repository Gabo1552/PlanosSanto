# Candidata 0.8.31 — cotas totales del mueble y materiales del proyecto

Base: 0.8.30 (`220f6af`, con la skill `/release`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## 1. Cotas: por defecto, solo las totales del mueble

**Qué había:** los planos acotaban cada pieza (largo y ancho). Se veían todas, salvo las que el usuario ocultaba una por una.

**Cambio:**
- **Cotas por defecto:** los planos (visor y A4) muestran solo **alto, ancho y profundidad totales** del mueble armado.
  - **Cómo se miden:** sobre la caja envolvente de todas las piezas, en el frente del mueble (el marcado o el propuesto). Los valores salen de la geometría en mm, no de píxeles, y una pieza rotada o escalada cuenta por sus esquinas reales.
  - **Dónde se ubican:** el ancho abajo y el alto al costado, por fuera de la silueta. La profundidad, que en vista frontal apunta a cámara, se nombra: «profundidad 600 mm».
  - **Una vez por hoja:** van en la vista exterior, o en la interior si es la única impresa.
- **Cotas de pieza:** quedan **ocultas por defecto** y se activan una por una desde los controles de cotas.
  - **Controles:** suman «Mostrar todas las cotas» y «Solo medidas totales».
  - **Totales:** también se pueden ocultar (clic sobre la cota) y mover («Mover cotas»).
- **Rótulo:** «COTAS EN mm · TOTALES DEL MUEBLE · PIEZAS EN LA TABLA».
- **Guía:** campo opcional nuevo por mueble, `dimensionDisplay` (`shownPieces`, `hiddenTotals`, `totalOffsets`), validado igual en `lib/model.ts` y `guide_store.rb`. Si se deja todo como viene por defecto, no se guarda nada.

**Compatibilidad:**
- **Guías viejas:** abren con el nuevo criterio, o sea tres totales y cotas de pieza ocultas, incluidas las que antes se veían. Su `hiddenDimensions` no se borra ni se reescribe; queda guardado pero ya no decide nada.
- **Guía nueva en una versión anterior:** si no se tocaron las cotas, abre normal. Si se tocaron, la versión anterior la rechaza con «Campos no permitidos: "dimensionDisplay"» y no sobrescribe nada.

## 2. Materiales del proyecto

**Qué había:** la paleta de pintura mostraba toda la biblioteca del taller.

**Cambio:**
- **Elegir en Materiales:** cada ficha tiene «Usar … en este proyecto».
  - **Dónde se guarda la lista:** en el SKP abierto, diccionario `PlanosSantoProject`, clave `materials_v1`, solo con los ids de las fichas. Cada SKP tiene la suya. No toca la guía, los pedidos ni los atributos de OpenCutList.
  - **Deshacer:** cada cambio es una operación «Materiales del proyecto Planos Santo», que un Ctrl+Z deshace.
- **Biblioteca:** arriba, «En este proyecto». Debajo, «Biblioteca del taller» en un bloque plegable: plegado si el proyecto ya tiene materiales y desplegado si no tiene ninguno. Al buscar se abre solo.
- **Paleta (también la rápida):**
  - **Qué muestra:** solo los materiales del proyecto del tipo elegido, placa o canto. El resto queda plegado en «Otros de la biblioteca (n)».
  - **Al buscar:** también aparecen los otros que coinciden, con su marca.
  - **Si pintás con uno de «Otros»:** se suma solo al proyecto y avisa.
- **Qué cuenta como del proyecto:** lo elegido más todo material de la biblioteca **ya pintado en el modelo**, así un SKP existente no queda vacío. Si no hay ninguno, la paleta muestra la biblioteca completa e invita a elegir.
- **Pintura en vista:** la tira de muestras pone primero los del proyecto (los reordena, no los filtra).

## Pruebas nuevas

- **Cotas**
  - `tests/cotas-totales.test.ts`: medidas totales con piezas rotadas y escaladas, cotas de pieza ocultas por defecto, activar y ocultar.
  - Validación de `dimensionDisplay` en `guide_store_coverage_test.rb`.
  - Las pruebas de layout de cotas de pieza ahora las activan explícitamente (`tests/helpers/cotas.ts`). Algunas validan además las totales junto con las de pieza.
- **Materiales**
  - `project_materials_test.rb` (12 pruebas): modelo sin atributo, Undo, ids inexistentes, datos dañados, esquema más nuevo y falla de escritura.
  - `tests/project-materials-model.test.ts` (11 pruebas).
  - `tests/offline/materiales-proyecto.spec.ts`: elegir en Materiales, ver en la paleta solo ese y el resto plegado, y sumar uno desde «Otros».
- **Skill `/release`:** se corrigió un error de `bump-version.mjs`: sin `--root` no tomaba la versión. Tiene una prueba nueva.

## Se conserva

- **Pintura:** gotero, reanudación, estados de pintura, «Necesitan atención», recientes, favoritos y archivados.
- **Cotas:** desplazamientos manuales y modo compacto.
- **Biblioteca:** el formato v4 de la biblioteca del taller no cambia.

## Límites

- **Frente mal propuesto:** si el frente del mueble está mal propuesto, ancho y profundidad salen invertidos. Se corrige marcando el frente en Proponer nombres.
- **A4 de dos vistas:** la vista interior queda sin cotas por defecto, porque las totales van en la exterior. **Confirmar con el taller.**
- **Muebles altos en A4 de dos vistas:** el ancho puede quedar arriba o con texto horizontal. Solo se probó con muebles sintéticos.
- **Simulado:** todo se probó con dobles. Falta validar en SketchUp el Undo nativo de la lista de materiales, que la lista viaje dentro del SKP al guardar y reabrir, y las totales con grupos anidados, espejados o escalados reales.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
