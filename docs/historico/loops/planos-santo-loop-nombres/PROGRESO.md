# Seguimiento del agregado NOMBRES

Estado inicial: PENDIENTE_DE_IMPLEMENTACION

Proyecto: Planos Santo / extensión SketchUp 2026.
Alcance: vista de muebles y piezas, edición de nombre de grupo y abreviatura, renombrado prefijado tras confirmación.

## Historial

Codex debe anexar aquí cada ciclo, en orden: fase, archivos cambiados, decisiones de compatibilidad, comandos de prueba y resultado REAL, fallos y próxima tarea. No marcar pruebas manuales como hechas desde el entorno remoto.

## Ciclo 0 — ejecución del lanzador y respaldo

Se extrajo el paquete, se conservaron fuentes en artifacts/respaldo-050-antes-nombres.zip y se guardaron hashes de los módulos fuera de alcance. La primera ejecución literal del script falló antes de invocar al agente: el CLI instalado requiere --ask-for-approval antes de exec. Se corrigió únicamente la posición de esa opción, conservando sandbox workspace-write y aprobación never. No hubo cambios en el modelo ni en funciones de guías.

## Ciclo 1 — N01, auditoría verificada

El segundo intento del lanzador corrigió el argumento global pero falló al inicializar el app-server con Read-only file system. No se cambió la configuración de Codex ni se solicitaron permisos. Se usa la alternativa de ejecución desde chat prevista por README: ciclos registrados con salidas reales, sin afirmar ejecuciones CLI que no ocurrieron.

Base: extensión autónoma 0.5.0; loader sketchup_offline/planos_santo.rb, HtmlDialog y dispatcher offline.rb, NativeSession en session.rb, atributos de guía GuideStore (PlanosSanto/guide_v1), UI React empaquetada localmente y puente request/receive por IDs. Se reutiliza el tipo de entidades/rutas de Exporter; no se cambia su fuente. La guía guarda nombres separados del nombre real de la instancia, junto a códigos y anclas por rutas. El gestor nuevo deberá sincronizar solamente nombres de filas afectadas, en la misma operación, manteniendo todos los demás campos.

La enumeración nueva distinguirá contenedores estructurales de piezas con caras, conservará todas las rutas e inventariará ocurrencias globales. Una entidad de instancia que aparezca en varias rutas bloqueará la confirmación: renombrar una hoja de definición compartida afectaría otras ocurrencias. No se usará make_unique. Metadatos propios separados por entidad. Plan de pruebas sintéticas para fallo a mitad de operación, Undo simulado, repetidos, invalidados, modelo cambiado y persistencia serializada. La ejecución y Undo nativos siguen pendientes de Windows.

Se inspeccionaron los módulos y pruebas actuales y hashes de los módulos fuera de alcance. No hay AGENTS.md aplicable ni runs/latest.json previo. N01 completa como auditoría, no como prueba de SketchUp.

## Ciclo 2 — N02, N03 y N05 verificados en Ruby

Se añadió sketchup_offline/names.rb: inventario recursivo de ocurrencias por persistent_id/ruta y GUID de definición, distinción entre contenedor/pieza/vacío/mixto, abreviaturas Unicode, fallback de instancia/definición y metadata privada PlanosSantoNombres. La vista previa no escribe. Se mantienen íntegros los nombres ajenos sin metadata; el prefijo gestionado se reemplaza por su base registrada. Hay guardas para padres/interiores compartidos, referencias de Definition#instances incluso fuera del árbol colocado, bloqueados/inválidos, revisión vieja, modelo activo y guía pendiente. No se hace make_unique.

Confirmar usa una operación atómica para nombres, metadata propia y solamente los nombres de filas de guía afectadas. Códigos/notas/anclas, geometría, materiales y definiciones se conservan. Una segunda confirmación idéntica no abre operación. Si falla la relectura de guías después del commit, informa nombres aplicados y pide reanalizar; no simula un rollback posterior al commit.

Pruebas actuales: npm run test:offline:ruby pasó, incluidos 16 tests del gestor / 97 assertions y 3 tests de controller / 13 assertions. Casos: ejemplo de tres piezas, prefijos, Unicode, repetidos/rotados/anidados, padres compartidos, errores parciales en nombre/atributos/guía, Undo simulado, serialización y compatibilidad de guía. Los tests originales Ruby pasan. Correcciones de desarrollo: require del exportador según contexto fuente/paquete, lambda dentro del doble SimpleDelegator y uso de IDs persistentes en vez de identidad de wrappers Ruby. Son pruebas sintéticas, no SketchUp ni Undo nativos.

## Ciclo 3 — N04 y N06 verificados en panel y puente

Se integraron NamePanel.tsx/names.ts al diálogo existente con selector por ruta, árbol tabular de todos los niveles, nombre del mueble, abreviatura editable y nombres base. Las propuestas cambian mientras se escribe, con Cancelar/Escape, actualización explícita, estado de cambios y bloqueo visible. La guía debe guardarse antes de renombrar; los cambios confirmados quedan en memoria del SKP hasta Ctrl+S. Se refrescan los nombres de guía sin alterar su esquema ni el renderer.

Build offline, lint y tipos pasaron. Nueve E2E offline pasaron (cinco existentes y cuatro del nuevo panel), ejecutando bytes empaquetados y controlador Ruby con API sintética y red offline. Cubren cancelar sin escrituras, confirmar una vez, idempotencia, cambiar prefijo, reapertura de diálogo, conservar filas/notas/anclas/códigos y Undo simulado, bloqueo de compartidos, revisión vieja y HTML mostrado como texto. Capturas: artifacts/nombres-preview-sintetico.png y nombres-bloqueo-compartidos-sintetico.png. npm test pasó: 46 TypeScript. La comprobación de guardado/reapertura física en Windows permanece en VALIDACION_SKETCHUP.md como PENDIENTE.

La versión candidata es 0.5.1 (13 entradas por el nuevo servicio Ruby). Solo se añadió 0.5.1 a la lista de versiones aceptadas del modelo web; exportador original, renderer, escenas, PDFs y guía TypeScript no cambiaron. Falta regresión completa y verificación final del alcance antes de entregar.

## Ciclo 4 — N07 completa; N08 empaquetado, pendiente operador

`npm run verify` terminó con código 0: 47 Ruby / 233 assertions, 46 TypeScript, 12 E2E web y 9 E2E offline. Lint, tipos, build y ambos empaquetados pasaron. Los 19 tests Ruby nuevos (16 del servicio y 3 del controller) verifican las guardas y persistencia simulada; cuatro E2E nuevos comprueban panel/bridge y conservación de datos. Se añadió el rechazo de abrir nombres cuando la guía está sin guardar y la relectura de abreviatura cuando el padre se renombra fuera del panel.

`git diff` no representa las fuentes de esta copia porque estaban sin seguimiento. Se compararon hashes guardados antes del agregado y el respaldo ZIP: PDF, cámaras, render, anotaciones, guía TypeScript, web y exportador original sin cambios. La única excepción protegida es lib/model.ts: se comprobó byte por byte que solo agrega 0.5.1 al enum de versiones admitidas, necesario para mantener compatibilidad de importación. Evidencia en artifacts/nombres-verificacion-alcance.json y nombres-model-version.patch.

Paquete final PlanosSanto-0.5.1.rbz: 1.550.298 bytes, 13 entradas; SHA256 bb713885a7168015bea7ef64c58bd9936f41d5b80bd8dbffff6e0e84aef1a109. CRC, hashes del manifiesto y descarga /api/extension/offline idéntica con nombre 0.5.1 verificados. El RBZ 0.5.0 se conserva con su hash anterior. No incluye modelos, pruebas, loop ni credenciales. Instrucciones exactas en INSTALACION_RBZ.md. El registro VALIDACION_SKETCHUP.md conserva exactamente los bytes del ZIP original y sigue PENDIENTE.

Errores del ciclo resueltos: posición de --ask-for-approval en los lanzadores; carga del exportador en tests de fuente vs paquete; lambda del doble SimpleDelegator; cierre JSX y aviso del cleanup del panel. Bloqueo de entorno restante del lanzador: el segundo Codex no puede inicializar su app-server en filesystem de solo lectura; se ejecutaron los ciclos en este chat según README, sin cambiar la configuración ni el sandbox. No se afirma que el lanzador haya completado seis subprocessos.

Estado final de este agregado: needs_user. N08 tiene RBZ e instrucciones preparados; únicamente falta instalar en SketchUp 2026 Windows, verificar las instancias reales/compartidas, Ctrl+Z nativo y guardar/cerrar/reabrir físicamente. No se ejecutaron modificaciones sobre el SKP real del taller, ni commit/deploy/publish. Prueba visual del panel inspeccionada con datos sintéticos. Logs y validación automática en artifacts/verify-nombres.log y nombres-validacion-final.json.
