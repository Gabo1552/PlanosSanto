# Plan de desarrollo — Planos Santo dentro de SketchUp 2026

Fecha: 15 de octubre de 2026. Estado actualizado: implementación 0.4 con pruebas automáticas; pendiente de validación dentro de SketchUp 2026 Windows. Seguimiento en `sketchup_offline/TASKS.md` y `sketchup_offline/PROGRESS.md`.

## Resultado esperado

El encargado abre su `.skp` en SketchUp 2026 para Windows, pulsa **Planos Santo**, elige los muebles, genera sus guías, agrega notas y exporta un PDF. Todo ocurre dentro de SketchUp, sin navegador externo, servidor, internet ni ZIP intermedio.

Cada mueble ocupa exactamente una hoja A3 horizontal de 420 × 297 mm, con axonometría ortográfica ligeramente despiezada, identificadores P01… y tabla de nombre, largo, ancho, espesor y cantidad. Los nombres y notas son editables; las medidas se calculan a partir del modelo y quedan protegidas. Generar vistas nunca mueve la geometría original.

El usuario confirmó la dirección de la migración, pidió este plan y luego autorizó implementarlo. El ZIP `PlanosSanto_Loop_SketchUp2026.zip` se usa como referencia de alcance y aceptación. Sus scripts de ejecución no se ejecutaron. La entrega inicial fue de planificación; la implementación posterior conserva la aplicación existente.

## Punto de partida verificado por inspección

- Existe una web Next.js/React/TypeScript con visor SVG, cálculos Three.js, edición de nombres, notas ancladas y PDF por Playwright/Chromium.
- La extensión Ruby 0.3 usa `UI::HtmlDialog` local para revisar entidades y exportar; todavía no contiene el editor autónomo. La lectura de geometría está en `sketchup/planos_santo/exporter.rb`.
- `lib/scene.ts`, `components/Diagram.tsx` y `lib/model.ts` contienen lógica aprovechable. Los endpoints de Next, el almacenamiento en `data/` y el PDF del servidor requieren reemplazo para el nuevo flujo.
- Se recibieron JSON, CSV e informe reales desde SketchUp 26.2.243: un mueble seleccionado y ocho piezas. Sirven como regresión puntual; no prueban la detección de todo `CA AmSurrbac (1).skp`.
- `CODEX_STATUS.json` registra una ejecución anterior satisfactoria de 14 pruebas Ruby, 26 TypeScript y 11 E2E. En esta tarea de planificación no se volvieron a ejecutar ni se probó SketchUp.
- Faltan la comparación manual de cinco piezas y la ejecución de la versión 0.3 en Windows. El entorno Linux no ejecuta SketchUp 2026.

## Decisiones de arquitectura

| Parte | Propuesta | Reutilización y condición |
| --- | --- | --- |
| Lectura del modelo | Ruby API sobre el modelo abierto | Reutilizar el exportador, revisando selección, visibilidad y clasificación |
| Editor | React/TypeScript compilado en assets locales para `UI::HtmlDialog` | Separar componentes de Next y probar rutas `file://`; sin CDN ni llamadas de red |
| Geometría y notas | Núcleo compartido de proyección y documento de guía | Mantener la misma escena para pantalla y exportación; no duplicar fórmulas |
| Puente Ruby/JS | Mensajes versionados con ID de solicitud, validación y respuesta de error | Ruby valida las ediciones; medidas y geometría no se aceptan desde controles de edición |
| Persistencia | Atributos propios del modelo, con esquema y revisión | Guardar nombres, notas y configuración; operaciones deshacibles, sin renombrar entidades originales |
| PDF offline | Evaluar primero LayOut Ruby API en la instalación real | Confirmar disponibilidad, licencia, métodos, unidades y exportación antes de adoptarla |
| Distribución | `.rbz` de la serie 0.4 con dependencias y assets incluidos | Conservar fuentes y artefacto 0.3 como respaldo; evitar dos versiones activas del mismo loader |

El PDF web seguirá disponible en la aplicación conservada. No cuenta como solución al requisito offline. Si LayOut no permite el flujo requerido, se evaluará una biblioteca local de PDF con licencia compatible y una prueba equivalente. No se trasladará el problema a un servidor.

## Etapas, entregables y pruebas

### 0. Establecer la base y resolver el riesgo del PDF

Trabajo:

- Crear un respaldo verificable del estado actual, sin incluir modelos privados en el RBZ ni publicarlos.
- Ejecutar la regresión existente y registrar resultados nuevos, separados de los históricos.
- Revisar documentación oficial de las APIs de SketchUp/LayOut 2026; comprobar los métodos concretos dentro de Windows con un diagnóstico pequeño.
- Probar generación offline de dos páginas A3 con texto, una vista vectorial mínima y flechas. Este documento de prueba no se presentará como plano de un modelo real.

Entregables: informe de compatibilidad, decisión sobre el motor PDF, evidencia de tamaño y cantidad de páginas, diagnóstico ejecutable e instrucciones breves para la PC.

Criterio de salida: alternativa técnica viable demostrada o bloqueo específico documentado. La comprobación dentro de Windows requiere al operador; mientras tanto se puede avanzar con lectura y editor independientes.

### 1. Abrir Planos Santo dentro de SketchUp

Trabajo:

- Preparar una versión 0.4 preliminar con menú, botón y `UI::HtmlDialog` que cargue assets locales.
- Implementar inicialización del puente, estado de carga, errores recuperables y cierre/reapertura sin callbacks ni menús duplicados.
- Diseñar la ventana con selector de muebles a la izquierda, vista central y panel de piezas/notas. Acciones principales: **Generar guías**, **Agregar nota**, **Guardar guía** y **Exportar PDF A3**.
- Mantener la pantalla inicial breve: usar el modelo abierto y elegir **Todos** o **Seleccionados**. La selección se revisa antes de generar.

Entregable: RBZ preliminar que abre la ventana local. Pruebas: integridad del paquete, puente con datos y errores, apertura/reapertura y ejecución con red desconectada en SketchUp.

Criterio de salida: el operador puede instalar y abrir la ventana sin iniciar ningún servidor. La prueba automática del HTML no sustituye esta comprobación.

### 2. Detectar muebles y piezas con identidad estable

Trabajo:

- Recorrer grupos/componentes y conservar árbol, transformaciones, materiales e identificadores persistentes por ruta de instancia.
- Resolver selección dentro del contexto de edición de SketchUp; impedir duplicación al elegir simultáneamente un padre y su descendiente.
- Mostrar qué se incluye, qué está oculto y qué es ambiguo. Permitir corregir la selección sin modificar el modelo. No excluir referencias únicamente por su nombre ni inferir muebles desde escenas.
- Contar instancias físicas: dos instancias de una definición son dos piezas. Mantener Pxx estables al regenerar una guía cuando la instancia siga existiendo.
- Comprobar rotación, escala, reflejos, anidamiento y formas no rectangulares. Rechazar escalas nulas/sesgos incompatibles y explicar las cotas de envolvente cuando correspondan.
- Registrar ejes de referencia: usar ejes locales y transformación acumulada; alertar si largo/ancho/espesor son ambiguos. No resolver orientación únicamente ordenando tres números.

Entregable: inventario revisable por mueble, con medidas protegidas y advertencias.

Pruebas: regresión del mueble real de ocho piezas; casos controlados de repetición, rotación, escalado y anidamiento; contraste manual de al menos cinco piezas en SketchUp. Para varios muebles se necesita lectura del modelo completo dentro del programa; el JSON recibido no alcanza.

Criterio de salida: inventario consistente con la selección y cotas verificadas. Los casos automáticos controlados deben identificarse como sintéticos.

### 3. Generar axonometría y tabla automáticamente

Trabajo:

- Adaptar el núcleo compartido al editor local y representar las mallas reales con cámara ortográfica.
- Aplicar el despiece únicamente sobre la representación; conservar dimensiones y transformaciones del modelo.
- Vincular cada etiqueta Pxx con su fila. Permitir editar el nombre de uso de la guía, conservando el nombre original como referencia.
- Mejorar ajuste de encuadre, oclusiones y distribución de etiquetas para modelos grandes; probar muebles de 30–50 piezas.
- Mostrar una advertencia explícita cuando no se pueda mantener todo legible en una sola A3; no prometer que cualquier cantidad de piezas cabe.

Entregable: guía generada sin armar vistas manualmente, con control opcional de zoom/despiece.

Criterio de salida: correspondencia completa entre vista y tabla, sin piezas descartadas silenciosamente y sin modificaciones de geometría. Comparar una captura del modelo real con la guía y verificar invariancia de las cotas al cambiar el despiece.

### 4. Notas con flechas y persistencia en el SKP

Trabajo:

- Crear, editar, mover, reanclar y eliminar notas. Guardar anclaje como ruta de instancia y punto local; posición de la tarjeta en coordenadas de la guía.
- Reproyectar flechas al cambiar zoom/despiece y regenerar. Si una pieza desaparece, marcar la nota sin destino y pedir reanclaje; nunca asignarla automáticamente a otra pieza.
- Guardar nombres, códigos, notas, selección y ajustes en un diccionario propio con versión de esquema, revisión y validación de tamaño.
- Escribir atributos mediante operaciones Ruby seguras con deshacer y abortar ante fallo. Separar **Guardar guía** del guardado físico del `.skp`: informar si faltan cambios por guardar y ofrecer el diálogo nativo para modelos nuevos, sin sobrescribir en silencio.
- Detectar cambio de modelo activo y cambios de geometría; invalidar vistas/PDF desactualizados. Conservar ediciones recuperables ante error del diálogo.

Entregable: una guía editable que acompaña al archivo SketchUp guardado.

Criterio de salida: guardar, cerrar SketchUp, reabrir el `.skp` y recuperar nombres, notas y destinos correctos. Probar deshacer, regeneración, pieza borrada y error de escritura. Comparar geometría antes/después excluyendo los atributos propios esperados.

### 5. Integrar PDF A3 offline completo

Depende de la decisión de la etapa 0 y del documento de guía de las etapas 3–4.

Trabajo:

- Implementar el adaptador PDF local con una página de 420 × 297 mm por mueble elegido.
- Incorporar nombre del mueble, vista, Pxx, tabla completa, notas y flechas desde la misma representación validada que usa el editor.
- Comprobar encuadre, superposiciones, filas completas y tamaño de letra antes de exportar. Usar 9 pt como mínimo inicial para el listado; validar impresión real y ajustar el diseño si hace falta.
- Bloquear exportación si el contenido no cabe legiblemente, indicando el mueble y el problema. No truncar notas ni generar hojas extra para ese mueble.
- Usar diálogo de destino, gestionar cancelación y permisos, y evitar dejar un PDF incompleto como resultado válido.

Entregables: PDF de un mueble real y PDF de varios muebles; informe de preflight con cantidad de hojas y dimensiones físicas.

Criterio de salida: verificar tamaño y páginas con una herramienta independiente, extraer/comprobar textos y cotejar visualmente flechas y destinos. Imprimir una A3 para confirmar legibilidad con el operador. La apariencia en el editor no prueba por sí sola el resultado PDF.

### 6. Empaquetar, instalar y validar el flujo completo

Trabajo:

- Producir el RBZ completo y reproducible con assets, dependencias y avisos de licencia; verificar estructura, CRC y hash.
- Documentar actualización desde 0.3 y recuperación de la versión anterior. Mantener el mismo nombre visible sin duplicar menús; no instalar dos loaders incompatibles activos.
- Comprobar instalación limpia, actualización, cierre/reapertura y uso desconectado en SketchUp 2026 Windows.
- Ejecutar regresión web y pruebas de la extensión; entregar guía de instalación y checklist corto para el taller.
- Registrar errores con versión y paso reproducible. Los diagnósticos locales no deben copiar geometría privada ni enviarla automáticamente.

Entregables: RBZ candidato, instrucciones, resultados automáticos y registro de validación del operador.

Criterio de salida: un `.skp` real se procesa de principio a fin dentro de SketchUp: selección, vista automática, cotas, notas, guardado/reapertura y PDF A3. Deben verificarse uno y varios muebles, cinco piezas reales y un caso con instancias repetidas/rotadas si está disponible. La aprobación del operador se conserva literalmente; no se fabrica una aprobación con pruebas simuladas.

## Secuencia y prioridades

1. **Primero:** respaldo, regresión base y diagnóstico de APIs/PDF. Entregar un primer RBZ instalable de prueba pronto.
2. **Después:** lectura y selección → vista y tabla → notas y guardado.
3. **Luego:** integrar el motor PDF validado y realizar pruebas de extremo a extremo.
4. **Por último:** corregir resultados de Windows y preparar el RBZ aceptado para taller.

No hace falta ejecutar el script de loop adjunto para seguir esta secuencia. Cada ciclo toma una tarea concreta, implementa, prueba, corrige y registra su resultado. Se continúa con trabajo independiente mientras una prueba en Windows esté pendiente; solo se detiene la parte que requiere esa evidencia.

## Seguimiento y definición de terminado

Al iniciar la implementación se creará el backlog operativo de la migración, enlazado con este plan, sin sustituir los registros históricos. Cada tarea tendrá estado, archivos cambiados, comando de prueba, resultado, limitación y siguiente paso. Los informes distinguirán pruebas unitarias, pruebas con datos reales exportados y ejecución real dentro de SketchUp.

Estados: **pendiente**, **en desarrollo**, **verificado automáticamente**, **pendiente de Windows** y **aceptado por el operador**. Ninguna funcionalidad se considerará terminada por compilar o por generar un RBZ.

La entrega final exige simultáneamente: pruebas relevantes correctas, instalación real, detección y cinco medidas contrastadas, notas persistentes tras reapertura, ausencia de cambios geométricos, funcionamiento desconectado y PDF A3 legible con exactamente una hoja por mueble. Mientras falte esa prueba real, la integración seguirá figurando como parcial.

## Próxima tarea concreta

Instalar el candidato 0.4 y ejecutar la prueba de `sketchup_offline/PRUEBA_SKETCHUP_2026.md` en Windows. El respaldo, editor, persistencia, PDF offline y pruebas automáticas ya tienen implementación y evidencias en el registro operativo. La aceptación de las etapas depende todavía de esa prueba real; no se considera terminada la integración.
