# Loop 0.8.2 — espera de diálogos nativos

## Ciclo 0 — evidencia recibida, 20/10/2026

Se recibió `validation-081.zip` (10.595.338 bytes, SHA256 `9e5f6e33b1e18638303085c6c5364e6ea337fcd5056cbb59e62193f076206261`). Es un subconjunto del ZIP completo anunciado por Codex local: 75 archivos recibidos, 74 hashes de archivos comprobados sin diferencias, 17 referencias externas del manifiesto ausentes. CRC correcto. Extracción privada y sin sobrescrituras. Ningún script adjunto ejecutado ni SKP abierto en SketchUp desde nube.

Cuatro JSON de preferencias PASS y comparación antes/después de reinicio idéntica. Informe confirma 12 regresiones nativas PASS, clic/lote y Undo PASS. PDF exterior, doble y reproducción de timeout: cada uno una página 297 × 210 mm, comprobado con PyMuPDF aquí. La ejecución nativa corresponde al validador local. No se repitieron las 53 pruebas de 0.8.0 ni los gestos manuales de cámara/ocultación. La configuración B no tuvo segundo reinicio completo. Preferencias 0.8.1 aceptadas dentro de ese alcance.

Nuevo P2: elección humana de ruta durante 158 s consume el límite del bridge de 120 s. PDF escrito correctamente pero respuesta final descartada. Se conservan baseline RBZ 0.8.1 y respaldo puntual de fuentes en `artifacts/baseline-081-before-082/`.

## Ciclo 1 — corrección y pruebas dirigidas

Archivos de producto: `sketchup_offline/ui/bridge.ts`, `sketchup_offline/offline.rb`, `sketchup_offline/version.json`, `lib/model.ts`.

El controlador emite fases `waiting_user` y `working`, con el ID original, exclusivamente alrededor de los siete selectores nativos de archivo/carpeta. JS suspende el reloj solo para acciones permitidas al recibir `waiting_user`; conserva la promesa pendiente y vuelve a habilitar 120 s al recibir `working`. Cancelación/error pasan por ensure y finalizan mediante la respuesta habitual. Operaciones sin selector y ausencia de respuesta inicial conservan límite de 120 s. El plazo no se amplía por notificaciones repetidas. No hay cambios en geometría, preferencias, catálogo, PDF, UV o Undo.

Pruebas nuevas: `tests/offline-bridge.test.ts` (14 casos con reloj virtual, todos PASS tras arreglo); `sketchup_offline/test/controller_test.rb` (5 casos añadidos, suite 13/57 PASS); `tests/offline/a4.spec.ts` (regresión de interfaz con espera virtual 158 s, controlador Ruby real sobre dobles). El transporte de esta prueba retiene la respuesta: NO es ejecución de un diálogo de Windows. Baseline sin protocolo falla las nuevas expectativas (log `bridge-082-before-fix.log`); corrección dirigida PASS (`bridge-082-after-fix.log`).

La primera comprobación de tipos detectó el respaldo `bridge.ts` dentro del alcance de TypeScript: se renombró a `bridge.ts.txt`. No era fallo del producto instalado. Verificación integral y candidata pendientes.

## Ciclo 2 — verificación completa y candidata

`npm run verify`: exit0; 272 Ruby/1802 aserciones en24suites, 133 TypeScript, 16 web y51 offline. Lint/build/typecheck PASS. Regresión de interfaz158s virtual PASS, PDF A4 válido y modelo sintético intacto. Auditoría RBZ19Ruby/JS PASS sin omisiones; CRC/hashes/inventario correctos. PDFs DEMO17 exterior/interior/doble regenerados como sintéticos. No ejecución nativa en nube.

El verificador local de integridad tuvo un error de espacio en `modified? == modified` al prepararlo; corregido y sintaxis PASS, al igual que el verificador de preferencias adaptado082. No se ejecutaron en SketchUp.

RBZ082: 1642661 bytes, SHA256 `5dd7f9c9fca8216bbd4ec3f6cc6916c4ebf10dc6ed95dcf892d0978e4bd28282`. Respecto a081 cambian offline.rb, ui/app.js, licencia con versión y manifiesto; los otros archivos distribuidos se conservan. Preferencias, nombres, pintura/UV/Undo, catálogo, cantos/TXT y PDF no reciben cambios de implementación. Baseline081 conserva SHA original.

Estado: candidata lista para validación nativa, no aprobada para producción. Próxima evidencia necesaria: selector Windows real abierto158s, guardar/cancelar/reintentar, éxito visible y PDF correcto; instrucciones específicas en VALIDACION_LOCAL_POSTERIOR.md.
