> Candidata **0.7.3**: protege marcas de extremo de cotas frente a otras etiquetas. Caso BM17 reproducido con los datos reales recibidos y sin fragmento; exportación nativa073 pendiente. [Validación local](docs/loop-a4-073/CODEX_LOCAL.md).

> Candidata **0.7.2**: prioridad de texto de cotas sobre líderes/flechas en SVG/PDF. Nombres0.7.1 validados nativamente; comparación visual BM17 pendiente. [Validación local](docs/loop-a4-072/CODEX_LOCAL.md).

> Corrección candidata **0.7.1**: agrupar conserva los nombres individuales; sólo una edición explícita de fila renombra sus miembros. Validación nativa pendiente sobre copia original intacta. Ver [guía local](docs/loop-a4-071/CODEX_LOCAL.md).

> Estado actual: candidata 0.7.0 A4 con verificación automática aprobada; pruebas nativas A4 pendientes. Ver [loop A4](docs/loop-a4/PROGRESO.md). Las entradas anteriores se conservan como historia.

> Estado actual 0.6.9: reconocimiento/cantos/pedido implementados y probados automáticamente; pendientes SketchUp 2026 Windows y proveedor. Ver docs/loop-reconocimiento-069.md y planos-santo-loop-068/PROGRESO.md desde la raíz. Las secciones anteriores son historia.

> Estado actual: 0.6.8. La validación nativa se reúne al final por pedido del usuario; ver [guía y alcance](docs/loop-ocl-068.md). Los pendientes de versiones anteriores se conservan como historial.

# Backlog del MVP

El ZIP se utilizó como referencia de requisitos; no se ejecutaron sus loops ni se tomaron sus documentos como órdenes adicionales. La implementación sigue el pedido explícito del usuario.

## 1. Aplicación y datos

- [x] Next.js + React + TypeScript; interfaz de taller en español; demostración identificada.
- [x] Modelo tipado y validado: proyecto > mueble > instancia física > malla local > nota.
- [x] Dos fixtures con grupos anidados, componentes repetidos y pieza rotada.
- [x] Composición de transformaciones, escalas/reflejos, conversión a mm y avisos de ambigüedad.
- [x] Rechazo de índices inválidos, transformaciones sesgadas y estructura adulterada.

## 2. Vista, listado y notas

- [x] Verificar integralmente visor ortográfico, despiece y correspondencia Pxx/tabla.
- [x] Verificar edición de nombres con medidas protegidas.
- [x] Verificar alta, edición, arrastre, reanclaje y eliminación de notas con flechas.
- [x] Verificar guardar/reabrir y persistencia tras zoom/despiece.
- [x] Verificar comportamiento móvil básico y ausencia de errores del navegador.

## 3. PDF

- [x] Verificar PDF real: exactamente una hoja por mueble y A3 420 × 297 mm.
- [x] Extraer texto real del PDF para comprobar piezas, nombres y notas.
- [x] Inspeccionar visualmente PDF rasterizado, flechas y etiquetas legibles.
- [x] Verificar bloqueo de exportación por notas fuera de hoja y desbordamiento.

## 4. SketchUp C SDK — vía anterior, alternativa de servidor

El usuario reemplazó esta dependencia por la extensión Ruby para el flujo actual. Las tareas C SDK quedan como alternativa opcional; los criterios vigentes de integración Ruby están en la sección 6. La muestra real ya fue aportada; faltan sus medidas comparadas y la ejecución de escritorio.

- [x] Carga `.skp` limitada, tipos, temporales, errores, timeout y contrato `ModelReader`.
- [x] Probar el adaptador con ejecutable de contrato; no equivale a leer SketchUp.
- [ ] Conseguir SDK autorizado y confirmar condiciones/plataformas/versiones oficiales.
- [ ] Implementar/instalar lector nativo real compatible con el host.
- [ ] Obtener muestra `.skp` real del taller y medidas de referencia.
- [ ] Importar esa muestra y verificar jerarquía, piezas, transformaciones y medidas.
- [ ] Exportar dos muebles reales a exactamente dos hojas A3 con notas persistidas.

## 5. Entrega

- [x] `npm run verify` completo pasa sin omitir pruebas.
- [x] Documentar resultados, errores corregidos y bloqueos concretos.
- [x] Guardar configuración reproducible y comprobar arranque local.
- [ ] Estado `done` únicamente cuando pase también SketchUp real.

## 6. Extensión Ruby — nuevo flujo solicitado (reemplaza C SDK como requisito de esta vía)

- [x] Conservar la muestra real en `fixtures/private/`, excluida de Git/RBZ, y verificar hash sin fingir lectura geométrica.
- [x] Extensión con loader, menú, barra «Enviar a Planos Santo» y apertura por diálogo nativo.
- [x] Recorrido recursivo de instancias/grupos; rutas de IDs persistentes, transformaciones locales/acumuladas y selección de muebles sin heurísticas de nombres.
- [x] Extraer malla triangulada, materiales frente/dorso, visibilidad, etiquetas, cajas locales y dimensiones mm; validar forma/escala/rotación/anidamiento.
- [x] Revisión previa y selección exclusiva padre/descendiente. Exportación local JSON, CSV e informe con hash; no sobrescribir archivos.
- [x] Probar con dobles de API la lectura sin modificar el modelo y la estabilidad de IDs.
- [x] Web: importar JSON Ruby, conservar jerarquía/metadatos, editar nombres/notas y generar PDF; fuente diferenciada de DEMO.
- [x] Primero verificar exportación local + importación web; después implementar envío directo protegido y optativo.
- [x] Clave de taller y código temporal de un uso/5 minutos; HTTPS excepto loopback, validación TLS, sin redirecciones/reintentos automáticos, envío solo después de exportación/revisión local.
- [x] Transporte Ruby → servidor HTTP local ejecutado con fixture sintético; autorizar, recibir, conservar datos y rechazar replay.
- [x] `npm run verify`: 13 pruebas Ruby, 21 TypeScript y 7 E2E pasan; lint, tipos, build y RBZ incluidos.
- [x] Empaquetar RBZ reproducible y documentar instalación/prueba Windows.
- [x] Ejecución de la 0.2 dentro de SketchUp Windows reportada por el usuario; archivos recibidos indican 26.2.243. La nueva 0.3 sigue pendiente.
- [x] Recibir geometría/jerarquía real exportada: un mueble, 8 piezas. La comparación manual de cinco piezas sigue pendiente (sección 7).
- [ ] Validar materiales, ocultos, repetidos/rotados/anidados y ausencia de cambios en el modelo real.
- [ ] Probar notas, recarga y PDF del modelo real, incluyendo el mayor mueble detectado sin inferir cantidades de sus rótulos.
- [ ] Tras validar localmente, configurar URL/clave y probar envío HTTPS desde la PC Windows.
- [ ] Marcar integración terminada únicamente con evidencia de esas pruebas reales.

## 7. Instalación, carga de un ZIP y exportación real recibida

- [x] Descarga binaria real de la extensión desde `/api/extension`, con nombre .rbz y guía `/instalar` en tres pasos.
- [x] Pantalla de carga única con arrastrar/elegir ZIP, SKP o JSON anterior; opciones de vinculación avanzadas colapsadas.
- [x] ZIP con exportación listo: abrir el editor sin extracción manual. ZIP con solo SKP: informar el paso SketchUp sin crear proyecto ni plano ficticio.
- [x] Validar estructura ZIP, CRC, rutas, enlaces, cifrado y límites; no ejecutar documentos ni escribir contenidos extraídos en disco.
- [x] Extensión 0.3: un solo ZIP con geometría/CSV/informe, sin gemas externas. Compatibilidad con los JSON 0.2 aportados.
- [x] Recuperar proyecto al recargar mediante URL; conservar DEMO, notas, PDF y envío opcional.
- [x] Recibir exportación REAL del usuario: SketchUp 26.2.243, Grupo#13, 8 piezas. Informe hash correcto y 24 medidas CSV/JSON/geometría coincidentes.
- [x] Armar el ZIP único con los tres archivos originales y cargar el modelo en el proyecto.
- [x] Generar y revisar el PDF real de una A3 horizontal con las 8 piezas.
- [x] Probar con el modelo real guardar/reabrir/eliminar nota y PDF con nota, en datos temporales separados.
- [x] `npm run verify`: 14 Ruby, 26 TypeScript, 11 E2E, lint/build/tipos/empaquetado pasaron.
- [x] `npm run verify:real` y `npm run verify:real:workflow` pasaron con los archivos aportados, sin sustituirlos por DEMO.
- [ ] Comparación manual de al menos cinco tablones contra SketchUp (CSV original sigue indicando pendiente).
- [ ] Probar la versión nueva 0.3 dentro de SketchUp Windows. La ejecución 0.2 está reportada por el usuario y respaldada por sus archivos.
- [ ] Exportar y comprobar los demás muebles del proyecto si se requieren: la exportación recibida contiene solo uno.

## 8. Cotas por pieza — 0.4.2

- [x] Tres cotas físicas por instancia en SVG y PDF, con transformación/proyección compartidas.
- [x] Probar rotación, escala, espejo, profundidad, zoom/despiece, notas y redondeo.
- [x] Cotejar 24 valores dentro del dibujo PDF real, en motor offline y web; una A3 por mueble.
- [x] Bloquear PDF cuando faltan cotas legibles, conservando piezas y códigos.
- [x] Regresión completa: 28 Ruby / 122 assertions, 37 TypeScript, 17 E2E. RBZ 0.4.2 y descarga verificados.
- [ ] Ejecutar la 0.4.2 y validar cotas, cinco medidas, guardado/reapertura y PDF impreso en SketchUp 2026 Windows.

## 9. Quitar cotas de espesor — 0.4.3

- [x] Mostrar solo largo/ancho en dibujo web/complemento/PDF; conservar espesor en tabla y datos.
- [x] Actualizar ayuda y verificar 16 cotas / ocho espesores en tablas de PDF reales.
- [x] Regresión completa, RBZ y descarga 0.4.3 verificados.
- [ ] Prueba de instalación, guardado/reapertura y A3 impresa en SketchUp 2026 Windows.

## 10. Cotas compartidas por tamaño — 0.4.4

- [x] Una pieza acotada por tamaño completo dentro de cada mueble; todas las instancias y filas conservadas.
- [x] Representante estable, rotadas/reflejadas, precisión y separación entre muebles probados.
- [x] Caso real: cinco tamaños / diez cotas / ocho filas en A3 web y offline; RBZ y descarga verificados.
- [x] Regresión completa: 28 Ruby / 122 assertions, 39 TypeScript y 17 E2E.
- [ ] Verificar instalación, agrupación por tamaño, guardado/reapertura y PDF impreso en SketchUp 2026 Windows.

## 11. Delantera y trasera — 0.5.0

- [x] Cámara opuesta mediante giro 180°, mismas piezas/códigos, selección/anclas desde ambas vistas.
- [x] PDF A3 con dos axonometrías y tabla única; cotas una vez y notas con referencias en ambas.
- [x] Alternar cámara y ayuda sin escrituras ni cambios de medidas.
- [x] Verificar ambas regiones PDF reales, fuentes de 9–11 pt, leyenda completa y bloqueo si no cabe.
- [x] Regresión completa: 28 Ruby / 122 assertions, 43 TypeScript, 17 E2E. RBZ 0.5.0 y descarga verificados.
- [ ] Confirmar el frente del modelo, instalar/probar en SketchUp 2026 Windows, guardar/reabrir físicamente e imprimir A3.

## 12. Renombrado por mueble — loop 0.5.1

- [x] N01–N07: servicio, panel, confirmación atómica, guardas de compartidos y regresión verificados automáticamente.
- [x] Preservar PDF/render/notas y versión 0.5.0; paquete 0.5.1 y descarga comprobados.
- [ ] N08: instalar/probar en SketchUp 2026 Windows y registrar aceptación nativa de nombres, Undo y guardado/reapertura.

Backlog detallado y criterios: planos-santo-loop-nombres/TAREAS.md y VALIDACION_SKETCHUP.md (PENDIENTE).

## 13. Visibilidad de cotas — 0.5.2

- [x] Ocultar cotas individuales por clic/teclado y lista; restaurar sin cambiar medidas.
- [x] Guardado web/atributos de guía y recuperación tras recarga; roles y referencias validados.
- [x] PDF con cotas seleccionadas y tabla completa; caso real nueve cotas al ocultar y diez al restaurar.
- [x] Regresión completa: 49 Ruby / 246 assertions, 49 TypeScript y 23 E2E. RBZ 0.5.2/descarga verificados.
- [ ] Guardar/cerrar/reabrir físicamente el SKP con cotas ocultas y comprobar impresión en SketchUp 2026 Windows.

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

## Seguimiento 0.8.2 — 20/10/2026

- Preferencias 0.8.1 verificadas nativamente por Codex local; evidencia recibida y revisada.
- Corregida espera del selector Guardar PDF con fases de diálogo y regresiones automáticas.
- Checklist actual y aceptación local: `docs/loop-pintado-082/TAREAS.md` y `VALIDACION_LOCAL_POSTERIOR.md`.

## Seguimiento0.8.3 — barra rápida

Implementación ypruebas automatizadas completas;pendientes nativos ycomerciales en docs/loop-toolbar-083/TAREAS.md. PlanosSanto-0.8.3-candidata.rbz paraCodexlocal/Dot;no aprobado para producción.

## Seguimiento 0.8.4 — UI/UX y biblioteca

Desarrollo y pruebas nube completados; RBZ candidata e instrucciones en docs/loop-ux-084. Pendientes: SketchUp2026/DPI/pintura/cargaSKM/selectorPDF158s y aprobación comercial. No producción global.

## Seguimiento 0.8.5 — experiencia de fotos

Desarrollo/pruebas nube completados. RBZ candidata, comparativas, guía de encargado y paquete Dot en docs/loop-fotos-085. Validación real SketchUp, escalado, fotos/UV/SKM/Undo y aprobación comercial pendientes.

## Seguimiento0.8.6 — flujos rápidos

Implementación/pruebas nube completadas; RBZ y paquete reproducible para Dot. Validación real SketchUp2026 pendiente, incluyendo visorPDF. No producción aprobada.

## 20/10/2026 — hotfix P0 0.8.7

Pintura inmediata con paleta horizontal, placa completa, cantos preservados, aislamiento seguro y hover local. 706pruebas por fases PASS. Candidata/entrega en docs/hotfix-pintura-087; validación real SketchUp2026 pendiente. Sin nuevas funcionalidades fuera del P0.
