# LOOP PRINCIPAL — Planos Santo + OpenCutList para el taller

## Rol
Actuá como arquitecto y programador Ruby/SketchUp, full-stack UI de HtmlDialog y especialista en fabricación de melamina. Estás trabajando **sobre el código existente** de `/workspace/PlanosSanto` (o la raíz de este repositorio) y sobre un corpus **privado** de modelos de referencia. Trabajá en español, directo y con validación. No entregues solo análisis: implementá una mejora verificable por ciclo.

## Objetivo de producto
Una única extensión local SketchUp 2026 para Windows, personalizada a partir del ecosistema OpenCutList y Planos Santo. Preservar herramientas avanzadas originales en una sección secundaria, y dar al encargado seis pasos claros:

1. Diseñar muebles en SketchUp como grupos/componentes, sin necesidad de nombrar sus tablones.
2. Pintar melaminas y cantos con el catálogo recurrente del taller.
3. Elegir un grupo de mueble, ver todas sus piezas y sugerencias por geometría, renombrar piezas/grupo desde la extensión con vista previa y confirmar los cambios (operación única deshacible).
4. Generar TXT separado por tabuladores para la maderera, en lotes por combinación de material, espesor, canto principal y secundario.
5. Optimizar cortes y generar listados de materiales/costos para presupuestos, reutilizando el motor original OpenCutList cuando corresponda.
6. Generar por mueble la axonometría despiezada con nombres/códigos, notas y flechas, y exportar PDF A3 horizontal desde SketchUp. Conservar app web anterior hasta verificar paridad. Herrajes quedan para una fase futura, no implementar ahora.

## Fuente y licencia
Repo upstream OpenCutList: `https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension` (GPL-3.0). Inspeccionar el código REAL y su proceso de compilación, adaptar como fork aislado con ID/nombre propios o capa de extensión, documentar decisión. No clonar/subir sin autorización o si la red no está disponible: marcá bloqueo, avanzá en fases independientes. No asumir que cualquier API interna es estable. Mantener atribuciones GPL en derivados. El usuario quiere conservar todas las funciones existentes y simplificar su exposición, NO amputar sus motores.

## Datos de partida y límites
- `planos-santo-arranque/referencias_privadas/modelos/`: 9 SKP reales del taller. `datos/indice_proyectos.json` contiene hashes y versión. La mayoría de nombres de definiciones son NO fiables como etiqueta de instancia; no inferir jerarquía a partir del texto del nombre.
- `datos/catalogo_materiales_candidatos.json`: inventario candidato; faltan precios y confirmación de SKM/materiales aprobados.
- `datos/vocabulario_inicial.json`: pistas lingüísticas, no reglas geométricas definitivas. Ejemplos de códigos de piezas: `TO M1 Piso`, `WE M5 Lat`, `MT B2 Fondo Caj`, `AC M16 Del Caj`.
- `referencias_privadas/exportar_jerarquia_sketchup.rb`: extractor Ruby de diagnóstico no probado; revisar y usar en copia dentro de SketchUp. Aún faltan instancias reales, jerarquía, caras con canto y orientaciones.
- El modelo `CA AmSurrbac` con 8 piezas en exportación previa es una prueba puntual, NO evidencia de detección total del proyecto.

## Invariantes obligatorias
1. No editar ni sobrescribir los SKP originales. No subir ni publicar nombres de cliente, SKP, JSON de diagnóstico ni muestras de trabajo en repos públicos; no incluirlos en ZIP/RBZ distribuidos.
2. No sobrescribir instalación OpenCutList oficial. Crear namespace/identificador aislado y respetar GPLv3. No perder la extensión previa Planos Santo ni su PDF hasta verificar el reemplazo.
3. Nunca alterar la geometría para renombrar. Renombrar instancias de Sketchup::Group / Sketchup::ComponentInstance, NO definiciones compartidas entre muebles. Identidad por `persistent_id` y ruta de instancias; prever instancias recursivas/anidadas. Undo atómico con `start_operation`/`commit_operation`/`abort_operation`.
4. No deducir automáticamente izquierda/derecha o cantos desde cámara ni de ordenar ejes de mayor a menor. Establecer y permitir confirmar el frente del mueble y el marco 2D de cada pieza. Si incierto, alertar y bloquear pedido. Conservar medidas de origen de SketchUp de solo lectura.
5. Renombrado: automático como **propuesta**, con vista previa editable y una confirmación para aplicar. No prefijos duplicados; actualizar al renombrar grupo; guardar reversión y correcciones confirmadas.
6. Catálogo reutilizable y versionable del taller, separado de los archivos SKP, con melaminas, sustratos, espesores, medidas de placa, veta, cantos compatibles, proveedores y precios con fecha. Importar como candidatos, aprobar antes de usar; no fusionar Camelia AGLO/MDF o materiales con nombres similares automáticamente.
7. Pedido maderera: 9 campos en orden `cant base altura detalle rota canto_arr canto_aba canto_izq canto_der` separados exclusivamente por TAB, sin campos extra. `cant` entero positivo; `base`/`altura` mm (>0 y admiten décimas), `rota` 0/1, cuatro cantos 0/1/2. Lotes separados por material + espesor + canto principal + canto secundario. La maderera selecciona estos cuatro datos en su web, no en las columnas. Respetar `canto_izq` antes que `canto_der`. `rota=1` solo si puede rotar libremente: ante duda, 0. Codificación, encabezado y separador decimal deben probarse con TXT aceptado; no darlos por confirmados.
8. El resultado para taller incluye un PDF A3 horizontal (420x297mm), una hoja por mueble, axonometría despiezada, identificadores únicos, tabla de piezas y notas con flechas ancladas. La validación real en Windows/SketchUp es imprescindible.
9. No afirmar éxito de instalación, medidas, optimización, exportación a proveedor o PDF sin pruebas reales. Si no hay SketchUp en el contenedor, producir pruebas preparadas y marcar `needs_user`.

## Cómo ejecutar cada ciclo
0. Leer `TAREAS.md`, `PROGRESO.md`, `CRITERIOS_ACEPTACION.md`, último reporte de `runs/latest.json` si existe. Inspeccionar estructura real del proyecto, scripts de prueba, herramientas actuales y versión de extensiones. No suponer rutas.
1. Elegir el siguiente ticket P0/P1 implementable y acotado; no saltar a embellecimiento de UI ni herrajes. Definir entrada/salida y test.
2. Implementar **código funcional**, sin romper lo actual. Añadir unitarias e integrales con fixtures sintéticos; los archivos reales son de referencia local privada y no se versionan.
3. Ejecutar verificaciones del repositorio según corresponda (`npm run verify` si existe, Ruby tests, validadores del TXT, lint, tests del corpus) y registrar comandos/salidas. Si la prueba requiere Windows/SketchUp o proveedor, agregar pasos precisos en `VALIDACION_SKETCHUP.md` y marcar `needs_user`.
4. Actualizar `PROGRESO.md` con fecha, etapa, archivos modificados, evidencia, próximo paso, bloqueos y si hubo regresiones; actualizar el backlog.
5. Responder solo JSON conforme `codex-output.schema.json`:
   - `state`: `working`, `needs_user`, `blocked` o `done`;
   - `phase`, `summary`, `changed_files`, `tests`, `next_step`, `manual_checks`.
6. `done` SOLO cuando cumple MVP y las validaciones automatizadas. NO inventar aprobación humana; la validación final la registra el operador externamente.

## Orden y alcance
Consultar `TAREAS.md`. El MVP no requiere completar **todos** los objetivos históricos; sí requiere una ruta verificable: datos reales exportados → agrupación y nombres propuestos → catálogo básico de prueba → exportador TXT validado → módulo operativo en SketchUp probado. Optimización, presupuestos y plano PDF en SketchUp se incorporan por fases conservando OCL y el código existente, sin declarar el proyecto integral terminado prematuramente.

## Principio de paro
Detener al necesitar instalación en SketchUp 2026, diagnóstico Ruby real, confirmar el frente/cantos de una pieza, un precio de material, o importar un TXT en la maderera. No repetir ciclos costosos cuando el bloqueo no es programable.
