> Candidata **0.7.3**: protege marcas de extremo de cotas frente a otras etiquetas. Caso BM17 reproducido con los datos reales recibidos y sin fragmento; exportación nativa073 pendiente. [Validación local](../docs/loop-a4-073/CODEX_LOCAL.md).

> Candidata **0.7.2**: prioridad de texto de cotas sobre líderes/flechas en SVG/PDF. Nombres0.7.1 validados nativamente; comparación visual BM17 pendiente. [Validación local](../docs/loop-a4-072/CODEX_LOCAL.md).

> Corrección candidata **0.7.1**: agrupar conserva los nombres individuales; sólo una edición explícita de fila renombra sus miembros. Validación nativa pendiente sobre copia original intacta. Ver [guía local](../docs/loop-a4-071/CODEX_LOCAL.md).

> Estado actual: candidata 0.7.0 A4 con verificación automática aprobada; pruebas nativas A4 pendientes. Ver [loop A4](../docs/loop-a4/PROGRESO.md). Las entradas anteriores se conservan como historia.

> Estado actual 0.6.9: reconocimiento/cantos/pedido implementados y probados automáticamente; pendientes SketchUp 2026 Windows y proveedor. Ver docs/loop-reconocimiento-069.md y planos-santo-loop-068/PROGRESO.md desde la raíz. Las secciones anteriores son historia.

> Estado actual: 0.6.8. Las secciones anteriores son históricas. El usuario pidió validar SketchUp al final; catálogo, nombres sugeridos, pedidos y PDF compacto ya tienen implementación y pruebas automáticas. Validación nativa/proveedor pendiente: [guía conjunta](../docs/loop-ocl-068.md).

# Backlog operativo — extensión autónoma 0.6.0

15 de octubre de 2026. Estado: implementación verificada automáticamente; **pendiente de SketchUp 2026 Windows**. Los casilleros completados corresponden al código y a los tipos de prueba indicados, no a aceptación del operador.

## Implementado y verificado en Linux

- [x] Respaldo previo del código y conservación del RBZ 0.3 (mismo hash).
- [x] Registro/loader 0.4, menú/barra y ventana local; sintaxis y ciclo de vida con doble de API.
- [x] Bundle local React, Three.js, Zod, pdf-lib, fuentes y licencias; empaquetado reproducible, sin CDN/servidor.
- [x] Protocolo JS/Ruby versionado, respuestas por ID y tratamiento de errores.
- [x] Reutilización del lector Ruby de grupos/componentes, instancias repetidas, matrices, dimensiones, materiales y advertencias.
- [x] Todos/Seleccionados y rutas dentro del contexto de edición; revisión manual del árbol antes de generar.
- [x] Modelo de guía, axonometría ortográfica, despiece de representación y tabla con medidas protegidas.
- [x] Nombres y códigos estables al reordenar instancias; pruebas de inserción de piezas.
- [x] Crear/editar/mover/reanclar/eliminar notas, con anclas locales.
- [x] Guardado de atributos con esquema, límites, revisión, operación deshacible y aborto ante fallo.
- [x] Detección de guía/geometría desactualizada y notas huérfanas; bloqueo de PDF hasta resolverlas.
- [x] PDF vectorial offline de 420 × 297 mm, una hoja por mueble; fuentes locales y control de desbordamientos.
- [x] PDF de dos muebles sintéticos; caso de 30 piezas iguales con dos cotas compartidas y todas las filas/códigos. Rechazo de tablas de 50 piezas.
- [x] PDF nuevo con la exportación real de ocho piezas; nombres/códigos/notas, formato e invariancia de medidas verificados.
- [x] Download 0.4 independiente y guía web, conservando descarga/flujo 0.3.
- [x] Regresión `npm run verify`: 49 Ruby (14 anteriores + 35 offline), 49 TypeScript, 13 E2E web y 10 E2E del editor empaquetado. Ver `PROGRESS.md` del repositorio.
- [x] Diseño 0.4.1 con logo, azul oscuro, secciones y tablas basados en la referencia visual de Santo Carpintero; PDF offline y web A3.
- [x] Ayudas «?» con clic/teclado, Escape, cierre explícito y clic afuera; posición verificada a 1000 px sin modificar datos.
- [x] Estado «Guía sin guardar» / «Falta guardar el SKP» y bloqueo del PDF al cambiar selección hasta regenerar.
- [x] Capturas de la exportación real de ocho piezas y PDF desde la UI con nota rotulada de PRUEBA; no equivalen a ejecución en SketchUp.

- [x] Largo y ancho en 3D sobre una pieza por tamaño dentro de cada mueble; espesor solo en la tabla, reubicadas automáticamente con zoom/despiece y compartidas entre SVG/PDF web y offline.
- [x] Rotaciones, espejo, escala, profundidad y redondeo probado; valores separados de la proyección y medidas originales intactas.
- [x] Caso real de ocho piezas, cinco tamaños: diez valores extraídos solo de la región del dibujo PDF y cotejados con el modelo; texto de cotas offline a 11 pt.

- [x] Dos cámaras ortográficas separadas por giro de 180°, con selección/anclas verificadas y geometría intacta.
- [x] Dos vistas A3, tabla única, cotas en delantera y leyenda única de notas con referencias numeradas en ambas.
- [x] Alternar vistas y ayuda en el complemento sin escrituras; comprobación de textos a 9–11 pt en impresión.

## Pendientes que requieren SketchUp 2026 Windows

- [ ] Instalar/actualizar el RBZ y abrir el HTML local con el CEF real de SketchUp.
- [ ] Confirmar que Delantera corresponde al frente real de cada mueble; la cámara conserva la orientación previa.
- [ ] Comprobar uno y varios muebles del modelo completo, incluyendo jerarquía compleja y referencias.
- [ ] Contrastar cinco medidas con SketchUp; una rotada y otro espesor si existen.
- [ ] Verificar que el original conserva caras, definiciones y transformaciones.
- [ ] Guardar SKP, cerrar SketchUp y recuperar nombres/notas/anclas/códigos al reabrir.
- [ ] Probar Deshacer, cambio de modelo activo, archivo sin guardar y fallo de permisos.
- [ ] Exportar e imprimir PDF real con todas las piezas, dos cotas por tamaño, notas y flechas; comprobar desconexión de internet.
- [ ] Registrar observaciones del operador y corregir las que aparezcan.
- [ ] Aceptación del operador en `VALIDACION_MANUAL.md` o evidencia equivalente explícita; sigue pendiente.

## Limitaciones registradas

- El despiece es radial; no es un cálculo de secuencia de montaje ni un solucionador completo de oclusiones. Los modelos complejos necesitan cotejo visual.
- Todos propone grupos padres con descendientes; el operador confirma qué nodo representa cada mueble. No se infieren módulos de rótulos de escenas.
- Las formas no rectangulares informan caja local con advertencia. Las transformaciones sesgadas/escalas nulas se rechazan.
- La legibilidad limita la cantidad de filas/notas por A3; no se garantiza que cualquier mueble entre. La leyenda de notas/advertencias admite cuatro líneas a 9 pt; se bloquea si no cabe.
- Las fuentes cubren los caracteres habituales del taller; si un glifo no está disponible, se impide exportar con un mensaje concreto.
- La API de LayOut se consultó mediante las definiciones oficiales, pero no se ejecutó. Se eligió el motor PDF local probado; no se afirma que LayOut sea incompatible.

## Agregado de nombres 0.5.1

- [x] Loop N01–N07 implementado y verificado: panel reactivo, nombres de instancias, confirmación atómica, idempotencia, rutas y guardas de compartidos.
- [x] PDF, cámaras y anotaciones conservados; RBZ 0.5.1/descarga/manifiesto verificados.
- [ ] N08: prueba real Windows de nombres/Undo/guardar-reabrir. Registro específico PENDIENTE en planos-santo-loop-nombres/VALIDACION_SKETCHUP.md.

## Visibilidad de cotas 0.5.2

- [x] Clic/teclado para ocultar, lista individual y restauración completa en ambos editores.
- [x] Persistencia opcional con lectura de guías anteriores, validación de referencias y compatibilidad con nombres/notas.
- [x] PDF A3 respeta ocultación y conserva todas las medidas de la tabla; caso real nueve/diez cotas verificado e inspeccionado.
- [x] Regresión, paquete y descarga 0.5.2 verificados.
- [ ] Ejecutar dentro de SketchUp 2026 Windows y verificar guardado/reapertura física del SKP y PDF impreso.

## Instalación 0.5.3 — fallo reportado en Windows

- [x] Verificar el RBZ 0.5.2 adjuntado: íntegro e idéntico; arranca con doble de API.
- [x] Corregir descarga principal y distinguir el exportador ZIP anterior.
- [x] Empaquetar carpetas/atributos DOS y avisos de carga/registro; seis casos del paquete instalado.
- [x] Regresión completa y descarga 0.5.3: 55 Ruby / 311 assertions, 49 TypeScript y 24 E2E.
- [ ] Confirmar aparición en el Administrador y ejecución dentro de SketchUp 2026 Windows; causa del fallo nativo aún sin reproducir.

## Ajustes 0.6.0

- [x] Incorporar reporte del usuario: instalación anterior ya funciona; causa previa no determinada.
- [x] Cámaras ortográficas independientes, rotación por mouse/controles y persistencia/PDF.
- [x] Ocultar IDs del dibujo, conservar tabla y validar PDF.
- [x] Mover cotas con arrastre/teclado desde el encuadre A3; conservar medidas y anclas, restablecer.
- [x] Obra + módulo + base de pieza; sincronizar tabla/instancias en operación de guardado atómica.
- [x] Preservar geometría y definiciones; bloquear compartidos/bloqueados y rollback ante fallos.
- [x] Guardado SKP y sincronización opcionales, con estado visible.
- [x] Jerarquía compactada y filtros Todos/Seleccionados/No seleccionados sin cambiar casillas.
- [x] Regresión: 64 Ruby / 380 assertions, 55 TypeScript, 28 E2E; RBZ/descarga y reproducción de exportación real.
- [ ] Prueba de la actualización 0.6.0 dentro de SketchUp 2026 Windows: nombres, Ctrl+Z, cierre/reapertura físicos y PDF/impresión.


## Configuración integrada y guardado 0.6.1

- [x] Reproducir rechazo por actualización sin reinicio con dos RBZ reales; detectar incompatibilidad antes de analizar/guardar.
- [x] Integrar grupo/piezas junto al dibujo y retirar el botón de configuración separado; selección enfoca y muestra pieza/nombre incluso a 1000 px.
- [x] Reusar obra/módulo, sincronizar grupo y piezas atómicamente y evitar duplicación de prefijos importados.
- [x] Guardar guía conserva ventana; Guardar y cerrar espera éxito y mantiene abierta ante error/cancelación SKP/cambios nuevos.
- [x] Regresión final: 74 Ruby / 447 assertions, 56 TypeScript, 31 E2E; paquete, CRC/manifiesto y descarga 0.6.1 verificados.
- [x] Registrar diagnóstico, capturas y evidencia en artifacts/validacion-integracion-061.json; instrucciones de reinicio y uso actualizadas.
- [ ] Validar UI y cierre real del HtmlDialog en SketchUp 2026 Windows, Ctrl+Z, guardar/reabrir físicamente y PDF A3 impreso; aceptación humana PENDIENTE.


## Exportar después de guardar — 0.6.2

- [x] Reproducir el falso aviso por GUID de revisión tras commit/guardado sin modificar geometría.
- [x] Comparación única de vigencia sin GUID volátil; mantener datos físicos, nombres, jerarquía y revisión de guía bajo validación.
- [x] Probar guardar/exportar y segunda edición/guardado/exportación sin regenerar, con nombres/notas en PDF.
- [x] Verificar bloqueo ante cambios reales y preservación del PDF válido/guía cuando se rechaza exportar.
- [x] Regresión completa: 78 Ruby / 495 assertions, 56 TypeScript, 32 E2E; replay de exportación real, RBZ y descarga comprobados.
- [ ] Repetir dentro de SketchUp 2026 Windows con SKP real; guardar/reabrir físicamente, Ctrl+Z, medidas y A3 impresa.


## UI/UX de piezas y visor — 0.6.3

- [x] Revisar modelo recibido y corregir controles dispersos, columnas cortadas y espacio desaprovechado.
- [x] Visor/inspector juntos, selector de muebles ocultable, herramientas directas y ayudas conservadas.
- [x] Búsqueda por ID/nombre, filtro de seleccionada, recorrido anterior/siguiente y resaltado sin modificar el modelo/PDF.
- [x] Medidas completas por fila sin desplazamiento horizontal; edición mantiene el foco bajo búsqueda.
- [x] Verificar clic geométrico y ancla local en visor encuadrado; notas arrastrables con encuadre estable.
- [x] Regresión: 78 Ruby / 495 assertions, 56 TypeScript y 35 E2E; capturas reales 1000/1550 px, PDF A3, paquete/descarga 0.6.3 comprobados.
- [ ] Instalar y probar esta UI en SketchUp 2026 Windows con SKP real; persistencia física, Ctrl+Z, cierre y A3 impresa.


## Componentes iguales con ID/nombre compartido — 0.6.4

- [x] Aplicar criterio confirmado: misma definición, medidas y material dentro de cada mueble; separar diferencias de geometría/escala/espejado.
- [x] Opción persistente por mueble, nombre editable en lote, ID compartido en ambas vistas y cantidad derivada por fila.
- [x] Preservar todas las instancias, códigos físicos únicos, geometrías, medidas y anclas de notas; desagrupar sin perder nombres actuales.
- [x] Validación Ruby/web, sincronización atómica, Undo/rollback con dobles y guardas de bloqueados/compartidos conservadas.
- [x] PDF web/offline A3 con tablas agrupadas y todas las piezas; caso recibido 8 piezas / 5 filas, cantidades 2 y 3.
- [x] Regresión completa: 85 Ruby / 543 assertions, 62 TypeScript y 38 E2E; paquete/descarga 0.6.4 verificados.
- [ ] Instalar y validar agrupación/renombrado y persistencia física del SKP completo en SketchUp 2026 Windows, Ctrl+Z y A3 impresa.

## Arranque OpenCutList — P0/P1, 0.6.5

- [x] P0: auditar 0.6.4 real, respaldo verificable, corpus privado ignorado/íntegro y regresiones documentadas.
- [x] Auditar upstream oficial fijado (7.1.0/GPLv3), registrar build/licencia y decidir integración aditiva aislada, sin sustituir motores.
- [x] P1.1/P1.3: diagnóstico local solo lectura desde menú, jerarquía y rutas físicas, geometría completa por definición, mm, transformaciones, materiales frente/dorso y referencias de aristas.
- [x] P1.4: dobles de API con repetición/anidación/rotación/escala/agujeros/materiales/topes/no mutación; validador Python de integridad y matrices.
- [x] `npm run verify`: 95 Ruby / 626 assertions, 62 TypeScript y 38 E2E; 11 Python del paquete; RBZ 0.6.5 y descarga correctos; 0.6.4 preservada.
- [ ] **P1.2 necesita usuario:** instalar/reiniciar SketchUp 2026, diagnosticar copia del modelo y devolver JSON + cinco medidas/materiales/orientaciones según `docs/prueba-p1-sketchup-2026.md`.
- [ ] Validar en Windows no mutación por diagnóstico, coexistencia OpenCutList, editor existente, renombrado/Undo, agrupación, guardado/reapertura y PDF A3.
- [ ] P2–P6 según backlog `planos-santo-arranque/TAREAS.md`: no dar por implementados catálogo/cantos/TXT/motores integrados por esta entrega.

## Compartidas y despiece de muebles largos — 0.6.6

- [x] Validar ambos diagnósticos reales (469/471 instancias, completos) y preservar datos privados.
- [x] Permitir renombrado nativo coherente de todas las apariciones compartidas, una escritura por entidad y un solo Undo; no modificar definición/geometría/IDs.
- [x] Conservar bloqueo por diferencias de nombres, ocurrencias externas/bloqueadas y referencias en definiciones sin colocar; mejorar explicación.
- [x] Despiece por capas/ejes y normal del tablón, sin escala radial dependiente de la diagonal; separar también divisores centrales.
- [x] Resaltar pieza/grupo limpia rótulos/cotas de otras piezas solo en pantalla; PDF y todas las geometrías conservados.
- [x] Regresión final: 103 Ruby/677 assertions, 68 TS, 38 E2E; replay privado 23/164 piezas y PDF real anterior de 8 piezas; RBZ/descarga 0.6.6 y 0.6.5 intacta.
- [ ] Probar en SketchUp 2026 las seis ocurrencias reportadas, guardar/exportar/Undo/reapertura y nuevo despiece; instalar 0.6.6 y reiniciar todas las ventanas.
- [ ] Resolver distribución legible automática de cotas/IDs en A3 para modelos densos de 23/164 piezas; el replay aún no puede producir sus PDF completos. No ocultar ni omitir información automáticamente para forzar una prueba verde.
- [ ] P1.2: recibir los cinco contrastes manuales de medidas/orientación/materiales; diagnósticos nativos ya recibidos, no pedirlos de nuevo salvo cambios relevantes.

## Loop OCL/maderera sobre 0.6.6 — 0.6.7

- [x] Incorporar el loop nuevo, verificar baseline idéntico/corpus privado, crear checkpoint y documentar arquitectura/alcance sin publicar.
- [x] Unificar versión offline desde manifest/version.json, incluidos reportes del exportador; preservar legado 0.3 y baseline 0.6.6.
- [x] P1: lector público de atributos y biblioteca OCL, categorías por type/version/build, material pintado/heredado/frente/dorso, capacidades e incertidumbres sin escribir.
- [x] Pantalla Materiales y cantos de lectura, filtros y pieza/caras; JSON local nuevo, no sobrescritura, cancelar/foco/Escape y modelo/guía intactos.
- [x] Verificación: 115 Ruby/771 assertions, 68 TS y 40 E2E; 27 Python/preflight; replay de datos previos y PDF real de ocho piezas conservados; RBZ/descarga 0.6.7 comprobados.
- [ ] P1 needs_user: contrastar nuevo lector en SketchUp 2026/OpenCutList real y devolver informe local con tres materiales/piezas revisados (`docs/loop-ocl-067.md`).
- [ ] P2–P6 del nuevo loop siguen pendientes; catálogo global/111 candidatos sin aprobar, propuestas geométricas, orientación/corte/veta/lotes/TXT, motores/costos y aceptación real de proveedor/Windows.
- [ ] Conservar pendiente A3 denso de 23/164 piezas, cinco medidas manuales y pruebas físicas de renombrado/Undo/guardar/reabrir.

## Continuación — 0.6.8

- [x] Biblioteca global versionada/atómica, respaldos/revisión concurrente, favoritos e importación sin aprobar; 58 candidatos reales, sin precio inventado.
- [x] Propuestas auditables de nombres por geometría, confirmación de ejes y aplicación explícita; reutiliza sincronización y Undo.
- [x] Malla 2D, ejes/cara/espejo, revisión de material/espesor/veta/corte/cantos, exclusión con motivo y borrador por modelo.
- [x] Lotes TXT de nueve columnas + manifest separado y trazabilidad; perfiles, publicación de carpeta nueva, validador sintáctico.
- [x] Estimación neta documentada: placas/cantos, faltantes pendientes, precios antiguos/futuros y monedas separados; acceso real a interfaz OCL original sin copiar su motor.
- [x] Referencias de material/canto revisado optativas en PDF; modo compacto optativo conserva todos los cuerpos, cotas por referencia y tipos con cantidad.
- [ ] Validación conjunta en SketchUp 2026: instalar/reiniciar, biblioteca entre modelos, caras/medidas, compartidas, Undo, guardar/cerrar/reabrir y PDF después de guardar.
- [ ] Ejecutar motores originales OCL (kerf/veta/formato/etiquetas/costos) y validar un TXT pequeño en el portal de la maderera; imprimir A3 y contrastar cinco medidas.
- [ ] No afirmar producción aprobada ni aceptación nativa a partir de dobles de API/replay de diagnóstico.

## Loop de reconocimiento — 0.6.9

- [x] Baseline 0.6.8 intacta, extracción sin reemplazo, fuentes/corpus protegidos y regresión inicial.
- [x] Marco local, frente/vertical ±, propuestas por contexto y vocabulario, edición con dibujo, confirmación única, correcciones/Undo.
- [x] Caras pintadas/heredadas, cobertura perimetral, cuatro lados 2D con espejo/ejes/cara, vínculos explícitos y revalidación al exportar.
- [x] Auditoría sin omitir bloqueos, migración conservadora, nueve columnas TXT/lote y evidencia por fila en manifiesto.
- [x] Regresión completa, PDF/anotaciones y RBZ 0.6.9 con hashes/descarga comprobados.
- [ ] Abrir los nueve SKP en SketchUp 2026 Windows y validar recuentos, funciones, cinco medidas, frente/cantos, compartidos, Undo y guardado físico.
- [ ] Importar TXT pequeño en proveedor y verificar interpretación de cantos/rotación/productos; imprimir A3. Solo entonces evaluar aceptación real.
