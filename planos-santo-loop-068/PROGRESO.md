# Registro de ejecución — Planos Santo 0.6.8

Estado actual: **0.6.9 preparada; NEEDS_USER para validación real.** El estado inicial y los ciclos se conservan abajo. Este archivo se completa durante los ciclos de Codex.

## Evidencia inicial
- Baseline adjunta: `referencias/PlanosSanto-0.6.8.rbz` (integridad en INDEX.json).
- 9 archivos SKP de trabajo adjuntos; son privados y su jerarquía real debe extraerse desde SketchUp 2026.
- No se declara validado un PDF para producción ni un pedido real a maderera.

## Ciclos

_Agregar una entrada por ciclo: fecha, etapa, archivos, pruebas efectivamente ejecutadas, resultados, advertencias y próximo paso._

### Ciclo 1 — P0, 19/10/2026

Se leyeron los seis documentos requeridos antes de ejecutar el loop. ZIP nuevo extraído con verificación CRC y apertura exclusiva, sin sobrescribir. La baseline adjunta y la generada anterior coinciden: SHA256 c1f435cdae7e55c54b7ebb12c6edc1657eb1c7521a8fb3b3e36bad0f4a0960f3. Nueve SKP íntegros y excluidos de Git junto con baseline/state. El repo ya existe, rama work sin commit inicial; no se inicializa ni resetea. Checkpoint de fuentes en artifacts/respaldo-068-antes-reconocimiento.tar.gz. Node 24.19, Ruby 3.3.7, Chromium 154 disponibles; se reutiliza setup existente, sin dependencias nuevas.

Ejecutados: verificar_entradas.py y nueve unittest del paquete, todos correctos; npm run test (75 TS) y test:offline:ruby (115 pruebas offline) correctos. No se ejecutó SketchUp ni se aprobó manual/validacion_usuario.json. Se trabaja directamente desde la conversación, sin lanzar otro Codex anidado.

Inventario: CatalogStore/NameManager/SupplierOrder y PDF/notas existentes se conservan. OclReader aún descarta geometría de las caras en su informe y no mapea lados. NameSuggestions usa coordenadas globales, no persiste frente/correcciones y requiere aplicar + guardar por separado. Próximo: frente local por mueble, clasificación contextual y confirmación única; luego propuesta de cantos por cara.

### Ciclo 2 — P1/P2, marco de mueble y nombres revisables

Se reutilizaron el recorrido por ocurrencias y el selector de raíces existentes. El importador conserva la transformación raíz como marco derivado inmutable; clasificación y posiciones se calculan dentro del mueble, con paridad de espejo, y no desde una caja global rotada. Se puede marcar el frente tocando una cara vertical del dibujo o elegir ejes locales. Se agregaron vecinos/conjuntos anidados para propuestas de cajón, roles ambiguos con motivo y vocabulario observado Lat/Piso/List/Fondo/Est/Puerta/Fte/Del Caj; PT/Banq/Ranu se mantienen ambiguos.

La propuesta se edita viendo y resaltando geometría. Una sola acción Confirmar y guardar nombres usa la operación existente de NameManager/GuideStore: guarda guía/nombres según la opción de sincronización, frente y correcciones, conservando notas, prefijos y Undo. Las correcciones se conservan como vocabulario revisable del mismo mueble; no hay ML ni cambios automáticos posteriores. Cancelar no escribe. Las referencias/revisiones tienen validación Ruby y se filtran piezas retiradas al reconstruir la guía.

Pruebas ejecutadas: 84 TS (suite incluye los 75 previos y nueve nuevas de contexto, ejes, espejo, vocabulario, cajón y proyección); adjustments_test.rb 16/121 assertions; dos E2E iniciales de propuesta/pedido. El primer test sin metadata reveló que un prefijo podía ocultar Componente#; se corrigió usando nombre original o base previa, no el nombre compuesto. Un chequeo de tipos detectó una aserción de test sin !, corregida. Pendiente: corroborar funciones reales de los nueve SKP en Windows; no se extraen cantidades desde definiciones ni strings binarios.

### Ciclo 3 — P3, caras pintadas y cuatro lados 2D

OclReader conserva vértices/normales/orígenes de pintura por cara, definición y ruta física; propone caras perimetrales por plano local, cobertura y ejes explícitos. Usa la misma paridad de ejes, cara, espejo e inversiones que orderProjection. No usa color/nombre de material para asignar productos. Lados incompletos, pintura mixta, tipos OCL no compatibles, cizallamiento o geometría irregular quedan sin resolver. Se revisan frontal/dorso, materiales heredados y caras divididas; ausencia de pintura no se certifica como canto.

EdgeReview muestra evidencia por lado junto a la malla 2D. Cada canto observado se vincula explícitamente con un producto aprobado, luego con el rol principal/secundario; usar propuesta no confirma por sí solo la revisión. Se admite inspección manual documentada para resolver incertidumbre, sin pintar SKP. Al cambiar cara/ejes/inversiones se invalidan confirmaciones. Al validar/exportar se releen las caras; el manifest conserva orientación, pintura, caras fuente, vínculos y exclusiones.

Pruebas ejecutadas: edge_sides_test.rb 10 pruebas/39 assertions (frente/dorso, 90/180°, espejo, ejes intercambiados, herencia, compartidas, cobertura parcial/dividida, tipos desconocidos, tercer canto, cambios de fuente bloqueados y TXT); E2E cantos por cara pasó con tres piezas físicas y validador del paquete. Build 0.6.9 nuevo, baseline 0.6.8 sin cambios. La correspondencia con pintura real de SketchUp y la interpretación del portal siguen pendientes.

### Ciclo 4 — P4 y revisión paralela autorizada

Se reutilizó SupplierOrder: nueve columnas TAB por lote compatible, cantidades físicas, medidas/ejes y veta explícitos. La nueva auditoría conserva todas las filas bloqueadas y exclusiones; una exclusión sin motivo ahora aparece junto a los otros errores. Un pedido 0.6.8 conserva datos pero migra a cantos sin confirmar, sin sobreescribir el atributo anterior al leer. Guardar un borrador exige estructura completa; exportar no acepta evidencia observada sin releer caras ni inspección manual sin fuente/motivo.

Workshop_test.rb: 18 pruebas/98 assertions, incluyendo migración, falta de justificación, auditoría y conservación del estado. Por autorización explícita del usuario se usaron dos agentes: revisión solo lectura de cantos y tres E2E nuevos de reconocimiento. Esos tres pasaron (guardado único, frente/correcciones/notas, Undo, cancelar/foco, compartidos sin escrituras parciales). La revisión encontró y se corrigieron retorno de foco y exclusiones omitidas del informe de bloqueos. No se ejecutó SketchUp ni se aprobó el JSON manual. Próximo: regresión completa, paquete y protocolo acotado de validación real.

### Ciclo 5 — P5, regresión, paquete y parada para validación real

`npm run verify` terminó con exit 0: **146 pruebas Ruby / 923 assertions, 86 TypeScript, 16 E2E web + 32 offline**, lint/build/tipos correctos. Tras ampliar únicamente el caso de prueba de referencia vertical se ejecutó adjustments_test.rb nuevamente: **16/124 assertions**, incluyendo vertical negativa válida y signo cero rechazado. Se verificaron también nombres seleccionados vacíos, devolución de foco, correcciones específicas izquierda/derecha que no se transfieren a otras piezas y espejos que no se consolidan como una misma orientación.

Los nueve unittest del paquete y verificar_entradas.py pasaron al inicio y al final. La baseline adjunta y la 0.6.8 anterior siguen con SHA256 c1f435cdae7e55c54b7ebb12c6edc1657eb1c7521a8fb3b3e36bad0f4a0960f3, y los nueve SKP conservan sus hashes/tamaños. No se añadieron dependencias ni configuración de nube; el entorno existente Node/Ruby/Chromium y los scripts actuales resultaron utilizables. Se restauró npm run start y se comprobó la descarga/instalador mediante HTTP local, sin publicación ni deploy.

PDF: verify:offline:real conserva el caso aportado previamente de ocho piezas, una A3, dos vistas, diez cotas, notas y ocultar/restaurar. El replay del diagnóstico previo de 23/164 piezas genera dos A3 sin pérdida de cuerpos, filas ni advertencias de espacio; no abre SKP ni verifica medidas manuales. Capturas sintéticas de nombres y cantos inspeccionadas.

Reproducción de caras reales previamente diagnosticadas: scripts/review-edge-diagnostic.rb procesó **453 ocurrencias**, de las cuales 448 pasan el control geométrico rectangular de QA. Enumeró las doce combinaciones U/V/cara, sin elegir orientación de fabricación: 17.008 lados sin canto observado, 3.968 con canto observado y 768 sin resolver. Estos números son casos de una reproducción, no un inventario nuevo de los nueve SKP, no prueban cuál es el frente real ni certifican cantos/medidas para cortar. El JSON está privado en artifacts/cantos-069-diagnostico-REAL-QA.json y mantiene production_ready:false.

**Entrega:** artifacts/PlanosSanto-0.6.9.rbz, **1.606.559 bytes**, SHA256 **3f4a70f2164d7c15383b77a3678c209becd00687a40797075eadff47502759b5**, 20 archivos + 2 directorios. CRC, hashes de manifest, versión y descarga idéntica comprobados. Sin SKP/corpus ni dobles de prueba en el RBZ. Fuentes nuevas: nameSuggestions/naming/model/orderPreview, NameSuggestions/App/EdgeReview/WorkshopPanel/style, OclReader/SupplierOrder/Workshop/GuideStore/controller y pruebas; se reutilizan NameManager, CatalogStore, renderer/PDF y sus protecciones. Informe completo artifacts/validacion-reconocimiento-069.json; estado y ciclos en state/latest.json y state/cycles/.

**NEEDS_USER, no DONE.** Aquí no hay SketchUp 2026 Windows ni sesión del portal. Se detiene después de completar el trabajo independiente. Seguir ../docs/loop-reconocimiento-069.md y VALIDACION_SKETCHUP.md: instalar/reiniciar en copias de CA AmSurrbac y otro mueble sin nombres, contrastar cinco medidas y ocurrencias físicas, frente/vertical, dos cantos asimétricos, 90/180°/espejo/compartidos, confirmar una vez, Undo, guardar/cerrar/reabrir y PDF A3 impreso. Importar un TXT pequeño como prueba sin enviar pedido comercial. Solo el encargado puede completar manual/validacion_usuario.json con evidencia; no se creó ni se aprobó ese archivo.
