# Corrección 0.7.1 — agrupación sin renombrado implícito

## Evidencia local recibida (0.7.0, no ejecutada aquí)

Codex local informó SketchUp26.2.243/Ruby3.2.2,19 hashes instalados correctos y12 comprobaciones nativas aprobadas. BM17:20instancias/17piezas, diagnóstico corregido. Exportación real exterior y exterior+interior: una página A4 exacta, nota con flecha,2puertas y bisagra ocultas sólo interior,17unidades en tabla. Guía idéntica al guardar/reabrir, geometría/visibilidad conservadas y originalSHA intacto.

**Defecto alto confirmado:** activar agrupación y guardar SKP cambió nombres de9instancias sin editar nombres: laterales, banquinas, travesaños, puertas y bisagras. La aceptación se mantiene rechazada hasta comprobar la corrección.

Limitaciones de composición recibidas:17filas sin agrupar bloquean tabla8pt; vista doble agrupada puede bloquear cotaP11 a yaw-20/pitch27; se obtuvo doble con yaw-2/pitch10/zoom.7. Estos casos se registran, no se ocultan cotas ni se aumenta paginado para forzar aprobación.

El ZIP de evidencia y BM17 están en una ruta Windows inaccesible aquí; esta corrección usa el informe textual y fixtures sintéticos. No se afirma haber inspeccionado los binarios locales.

## Ciclo 1 — análisis y corrección

- Causa: `withNaming` uniformaba bases al activar agrupación y en cada normalización/lectura de guía. `NameManager` recibía los nombres ya cambiados y los sincronizaba al guardar. El guardado nativo no podía distinguir ese cambio implícito de una edición.
- Eliminada la uniformización automática de bases. La agrupación afecta filas/IDs de presentación; conserva nombres y bases físicos.
- Sólo una edición explícita de fila agrupada propaga su nombre a sus miembros. Campos obra/módulo mantienen su función explícita de prefijar nombres.
- Eliminada la exigencia de igualdad de nombres al guardar guías agrupadas, tanto web como Ruby. Conservadas validaciones de rutas, códigos, medidas, formatos, nombres/prefijos, transacciones y conflictos de entidades compartidas.
- Corregida también la agrupación web, que llamaba directamente al sincronizador.
- Ayuda actualizada para explicar nombre de referencia frente a renombrado explícito.

Pruebas iniciales:15pruebas TS dirigidas aprobadas;140pruebas Ruby offline/935aserciones aprobadas; nueva E2E de9instancias aprobada en3.4s. Todos usan fixtures/dobles en nube.

## Pendiente

Ejecutar verificación completa y empaquetar candidata0.7.1. Repetir localmente sobre COPIA del original intacto, no sobre el modelo ya renombrado por0.7.0. No restaurar nombres automáticamente usando suposiciones.

## Ciclo2 — verificación y entrega

`npm run verify` terminó con código0:154pruebas Ruby/1005aserciones,108TypeScript,16integralesweb y38integralesoffline. Lint, compilación, tipos y empaquetado aprobados. Log:`artifacts/verify-a4-071.log`. Nueve pruebas Python de contrato también aprobadas y baseline0.6.8/nueveSKP intactos.

Nueva regresión integral verifica nueve instancias nombradas distintas, ocho anidadas, Guardar+SKP, reapertura, desagrupar, bases/nombres originales intactos, cámara/notas/geometría conservadas; edición grupal explícita sobre nueve miembros y Undo. Son dobles de API en nube.

RBZ0.7.0 preservado SHA256df85152dcb6c66b2fdff9755752ca75e69448a59c7f26ecc9a78713d3d564340. Candidata0.7.1 verificada por CRC/manifiesto, sin SKP privados; hash/tamaño en validacion-a4-071.json. Se prepara entrega reproducible con fuentes/pruebas, instructivo y capturas de nombres por ruta. Helper Ruby local: sólo sintaxis aprobada; ejecución dentro de SketchUp pendiente.

Estado:**NEEDS_USER**, candidata no aceptada para producción. Ejecutar validación0.7.1 sobre copia nueva del original, sin intentar recuperar automáticamente nombres desde un modelo ya sobrescrito.
