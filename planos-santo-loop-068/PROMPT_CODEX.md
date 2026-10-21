# Instrucciones para Codex — ciclo incremental 0.6.8

**Rol:** ingeniero principal de extensiones SketchUp Ruby/JS para carpintería. Trabajás en la base existente de Planos Santo, SIN crear otro proyecto desde cero.

## Objetivo único de este loop

Tomar 0.6.8 como referencia inmutable y completar el flujo:

**modelo SketchUp → detectar agrupaciones/muebles → identificar y sugerir nombres a piezas sin nombre → localizar cantos pintados con OpenCutList → orientar y confirmar cantos 2D → exportar lotes TXT para la maderera → conservar PDF A3**.

El usuario **no nombra componentes mientras diseña**. Los coloca como instancias dentro de grupos por mueble. La extensión debe interpretar lo que pueda de la geometría, proponer nombres con motivo/confianza y permitir corregirlos desde el panel de cada mueble, sin exigir pre-nombrado manual pieza por pieza.

## Fuente de verdad

1. Código real que ya existe en el repositorio `/workspace/PlanosSanto` (si está disponible).
2. `planos-santo-loop-068/referencias/PlanosSanto-0.6.8.rbz` como **baseline intacta**; inspeccionar o extraer a una subcarpeta de trabajo, nunca sobreescribirla.
3. Nueve `.skp` en `planos-santo-loop-068/referencias/privado/modelos/`, protegidos y usados sólo localmente.
4. `BASELINE_068.md`, `TAREAS.md`, `CONTRATO_MADERERA.md`, `VALIDACION_SKETCHUP.md`.

No tomar los comentarios de memoria/conversación como evidencia de funcionamiento en SketchUp. No inventar resultados de pruebas. Si no podés ejecutar SketchUp de Windows, marcar **PENDIENTE VALIDACIÓN REAL**.

## Metodología por ciclo (usar criterio propio)

1. Identificar el primer requisito P0–P5 incompleto; no dispersarte en funciones futuras.
2. Inspeccionar el código afectado y sus pruebas; realizar la **menor modificación verificable**.
3. Desarrollar cobertura de casos límite (componentes anidados/compartidos, espejos, piezas sin nombre, cantos de caras, orientación y veta).
4. Ejecutar los tests disponibles. Nunca declarar `PASS` sin haber ejecutado el comando y visto su resultado.
5. Actualizar `planos-santo-loop-068/PROGRESO.md` indicando tarea, cambios, evidencia, límites y próximo paso.
6. Devolver un JSON final que cumpla `SCHEMA_RESPONSE.json`. Usar `NEEDS_USER` cuando la única forma de avanzar sea usar SketchUp 2026 o verificar el portal del proveedor; no seguir en bucle simulado.

## Reglas técnicas obligatorias

- Mantener integridad de la geometría, transformaciones, atributos originales y los PDF A3/notas; **no borrar ni reescribir** datos ajenos.
- No convertir nombres de definiciones en unidades físicas; recorrer ocurrencias con rutas y IDs estables. No renombrar `ComponentDefinition.name` cuando altere otros muebles; trabajar a nivel instancia.
- No inferir lado izquierdo/derecho sin definir primero el frente de referencia del mueble. No inferir canto superior/izquierdo a partir de la vista de cámara, del mayor valor de dimensión ni del nombre/color de material.
- Reconocimiento geométrico = sugerencia con confianza; roles ambiguos requieren validación humana. Guardar correcciones para mejorar reglas (sin necesitar ML externo).
- Usar exclusivamente Ruby API pública de SketchUp, mantener integración OCL en solo lectura en esta etapa. No modificar ni depender de APIs internas inestables sin documentación explícita y tests.
- Respetar la versión/build de OpenCutList soportada en `ocl_reader.rb`; si otra versión, degradar a revisión, no inventar tipos de material.
- Reutilizar `CatalogStore`, `NameManager`, `SupplierOrder`, `OclReader`, `P1Diagnostics` y UI existentes. Auditar limitaciones antes de reescribir. Mantener libre de dependencias web en producción.
- Protección contra sobrescritura: operaciones atómicas con Undo, backups y versión nueva de RBZ. No auto-instalar en Windows ni desinstalar OpenCutList.
- Si se reutiliza código de OpenCutList, cumplir GPLv3 y licencias de terceros. Preferir la API pública, no copiar código sin atribución.
- Los SKP y datos de clientes son **privados**: no subir a GitHub, issue trackers ni servicios de análisis externos. Cualquier subida remota necesita autorización expresa.

## Pedido a la maderera: contrato innegociable

Nueve columnas TAB, en este orden:

`cant  base  altura  detalle  rota  canto_arr  canto_aba  canto_izq  canto_der`

Medidas mm, `rota` 0/1; cada canto 0=ninguno, 1=principal, 2=secundario. El usuario selecciona material, espesor y cantos principal/secundario **en el sistema de la maderera**; separar los TXT por esas combinaciones. Respetar sentido de veta. No suponer que `base` es siempre dimensión mayor ni que dimensiones finales son medidas de corte.

Prevenir exportación productiva con cantos, ejes, medidas, materiales, espesores o piezas sin validar. Reportar explícitamente exclusiones y motivos. No agrupar piezas incompatibles. La aceptación de TXT en la maderera exige prueba controlada del encargado.

## No confundir el objetivo con terminar toda la suite

Este loop **no implementa** el optimizador propio, herrajes ni todo el fork de OpenCutList. Puede planificar esos módulos, pero el avance aprobado requiere el flujo pieza/canto/pedido y las regresiones de PDF A3.

## Entregables mínimos

1. Código fuente y tests, reutilizando proyecto.
2. Inventario por mueble, sugerencia editable de nombres, inspección visual de cantos y los lotes TXT.
3. Documentación de cómo instalar la nueva `.rbz` desde el Administrador de extensiones de SketchUp.
4. `PROGRESO.md` actualizado con números reales de tests y qué no pudo probarse.
5. Nueva `.rbz` si la compilación/empacado fue exitosa, sin renombrar falsamente a 0.6.8.

Si encontrás bloqueos, terminá con un diagnóstico concreto y una instrucción breve para el encargado; no declares terminado sin pruebas reales.
