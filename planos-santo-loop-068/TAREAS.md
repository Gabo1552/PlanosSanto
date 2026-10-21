# Backlog priorizado (un foco por ciclo)

**Estado 0.6.9:** [x] significa código y pruebas automáticas, no aceptación real. La PC Windows, el contraste de los nueve SKP y la importación en la maderera siguen pendientes. Ver PROGRESO.md y ../docs/loop-reconocimiento-069.md.

## P0 — Resguardar y conocer la base
- [x] Verificar manifiesto 0.6.8, repo fuente, historia, dependencias y pruebas existentes.
- [x] Si hay diferencias entre código repo y RBZ, registrar mapa de versiones y no sobreescribir.
- [x] Capturar tests de regresión y comandos de build; respaldar 0.6.8 y sus PDFs.
**Aceptación:** inventario reproducible, base intacta, plan de integración concreto.

## P1 — Inventario geométrico real por mueble
- [x] Extraer jerarquía de grupos/instancias, `persistent_id`/ruta de ocurrencia, transformaciones acumuladas, cara/material, ejes y dimensiones sin perder rotación, espejo ni repetición.
- [x] Determinar qué nodos representan muebles y piezas físicas; permitir corrección manual de raíz.
- [x] Añadir a diagnóstico origen, fecha/versión y alertas sobre modelo incompleto/transformaciones problemáticas.
- [ ] Utilizar los nueve SKP **como corpus privado**; no deducir cantidades físicas a partir del número de definiciones.
**Aceptación:** inventario auditable, piezas sin nombre presentes, sin duplicados por definiciones compartidas ni omisiones ocultas.

## P2 — Reconocimiento y renombrado guiado
- [x] Clasificación contextual por posición relativa, orientación, tamaño, nivel de grupo, vecinos y frente del mueble seleccionado.
- [x] Tipos básicos: lateral, piso, tapa, estante, fondo, puerta, frente cajón, lateral cajón, travesaño/listón y **sin clasificar**.
- [x] Priorizar vocabulario observado del taller: `Lat`, `Piso`, `List`, `Fondo`, `Est`, `Puerta`, `Fte`, `Del Caj`; PT/Banq/Ranu como **ambiguos**.
- [x] UI: seleccionar mueble, ver todas las piezas, resaltar, previsualizar cambios automáticos, editar nombre de mueble/pieza y confirmar una vez.
- [x] No aplicar nombre sin revisión si el rol depende del frente, geometría poco clara o evidencia insuficiente; reportar motivo y confianza.
- [x] Renombrar la **instancia** correspondiente, sin modificar definición compartida ni la geometría; comando reversible con Undo de SketchUp; idempotencia de prefijos.
**Aceptación:** tests de orientación, nested groups, modelos sin nombre, definiciones compartidas, prefijos cambiantes y Undo.

## P3 — Materiales y cantos por cara y lado de pieza
- [x] Reutilizar `CatalogStore`, preservar catálogo y mapeo de IDs/atributos de OCL.
- [x] Extraer material pintado en cara frontal/reverso y cantos físicos; determinar caras perimetrales respecto a **ejes locales elegidos para la pieza**.
- [x] Proponer `arr/aba/izq/der` desde una orientación 2D explícita y visualizable. Respetar espejo, rotación, frentes y sentido de veta.
- [x] Configurar para cada lote canto principal y secundario sin deducir por el color o el nombre si no hay correspondencia confirmada.
- [x] Mostrar overlay por pieza y permitir cambiar lado/material sin modificar el SKP durante revisión.
- [x] Para piezas atípicas o contornos irregulares, bloquear exportación automática o solicitar revisión específica.
**Aceptación:** pruebas en piezas rotadas 90°, 180°, invertidas, compartidas, canteadas parcial/completo; cotejo con pintura real.

## P4 — Pedido de corte listo para validar con el proveedor
- [x] Aprovechar `supplier_order.rb` sin eliminar confirmaciones existentes.
- [x] Generar lotes por material + espesor + canto principal + secundario; manifest con selección manual en la web de la maderera.
- [x] Agrupar sólo piezas inequívocamente equivalentes, con cantidades físicas auditables.
- [x] Verificar nueve columnas TAB exactas, decimales, códigos de canto 0/1/2 y rotación 0/1; evitar encabezado sin aceptación.
- [x] Mantener advertencias si hay cantos sin asignación a principal/secundario, espesores desconocidos o dimensiones no confirmadas.
- [ ] Ejecutar importación **de prueba** y registrar si el proveedor la acepta, sin enviar un pedido productivo accidentalmente.
**Aceptación:** TXT + manifiesto + informe de bloqueados, validación automática y aceptación del operador.

## P5 — Regresiones y empaquetado
- [x] Confirmar que PDF A3, anotaciones, movimientos de flechas, nombres editados y guardado/reapertura siguen funcionando.
- [x] Empaquetar `.rbz` en nueva versión (no reemplazar la 0.6.8) y ejecutar hashes/pruebas de sintaxis.
- [x] Actualizar `PROGRESO.md` con archivos, cambios, pruebas y pendientes; adjuntar bitácora de cada ciclo.
- [ ] Ejecutar `VALIDACION_SKETCHUP.md` con el encargado antes de declarar listo para taller.
**Aceptación:** builds verificables, evidencia de Windows/SketchUp, TXT aceptado en prueba, PDF A3 válido.

## Fuera de alcance de esta tanda

- Eliminar por completo OpenCutList, desarrollar su propio optimizador de placas, pintado de cantos autónomo, presupuestos completos con merma, biblioteca de herrajes. Mantenerlos como roadmap, sin declarar que ya existen.
