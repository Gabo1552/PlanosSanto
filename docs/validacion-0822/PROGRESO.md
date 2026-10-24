# Ciclos 0.8.22 · 24/10/2026

## Ciclo 1 · Fuente y diseño
- Base 0.8.21 main 10674f848527bf572e6ff1a18277bba5b2558e27; no se reemplazaron avances con entregas antiguas.
- Referencia Experto recibida como algoritmo de calibración; formatos SIEMPRE desde la ficha por instrucción del usuario.
- General: el usuario eligió implementación propia basada en criterios de OpenCutList. Sin motor GPL copiado ni dependencia instalada.
- Skill UI/UX Pro Max aplicada por agente paralelo; identidad azul noche/blanco extraída del SVG del usuario.

## Ciclo 2 · Implementación
- Experto puro, formatos configurados, kerf 4,4, refilado total 10, mínimo 50, first-fit/profundidad y métricas. Paridad con Python adjunto y lotes atómicos.
- Selector persistido, TXT revalidado con método, giro sin veta, validación útil y nueve columnas conservadas.
- Resumen por material/espesor, detalle individual, navegación por teclado y foco, avisos y totales parciales.
- Cantos Experto incluyen 15% de desperdicio para compra; medidas nominales de pieza no cambian.
- Logo original y tokens de color, sin cambiar PDF ni materiales privados.
- Typecheck excluye salidas generadas artifacts/test-results/build, igual que ESLint; no excluye fuentes ni tests.

## Ciclo 3 · Verificación en curso
- Pruebas focales motor: 36 Experto + 3 invariantes General + 17 existentes PASS (antes de nuevas pruebas de integración).
- Ruby focal: 46 pruebas, 338 aserciones PASS con dobles.
- UX aislada: 3 pruebas PASS con Chromium y datos sintéticos.
- Pendiente: regresión completa, revisión independiente, empaquetado y verificación nativa/comercial.

No se ejecutó SketchUp en la nube ni se aprueba producción.

## Ciclo 4 · Correcciones y regresión final
- Ruby completo: 1067 pruebas / 10276 aserciones / 72 suites, sin fallas. Vitest: 487 pruebas / 52 archivos, sin fallas.
- UI offline: 241 casos ejecutados; primera corrida 236 PASS y 5 fallos por expectativas anteriores (4 acceso directo al detalle, 1 verde anterior). Se actualizaron al recorrido por tarjeta y azul corporativo, manteniendo todas las verificaciones: los cinco pasaron al repetirlos.
- Typecheck, lint y Next build PASS. Web E2E 35/35 PASS.
- Último cambio solo CSS en paleta compacta/avanzada: 26 casos de paleta repetidos PASS. Esos 26 ya forman parte de los 241, no se suman como casos nuevos.
- Revisión independiente: dos avisos UX P2 corregidos (medidas ausentes y totales fuera de cálculo); limitación de veta individual registrada. Sin P0/P1 nuevos reportados.
- El primer intento Vitest en sandbox no pudo ejecutar pdftotext (EPERM); la suite completa con procesos locales autorizados pasó. No se atribuye al producto.
- Capturas comparativas y paleta a 680/360 px sintéticas. No hay aprobación nativa ni comercial.

## Entrega
- Candidata 0.8.22, manifiesto y SHA256 verificables. Versiones anteriores conservadas.
- Informe, contratos, scripts de comparación y guía local incluidos. No se copiaron assets ni motor de OpenCutList; General conserva motor propio por elección expresa del usuario.

## Auditoría posterior con pedido real
- 368 filas/1244 piezas iguales entre JSON y PDF. Experto proveedor56 placas; 0.8.22/Python57. Cantos1032m coinciden; recorrido/pasos no. Paridad comercial NO aprobada.
- Comparador reproducible y6tests sintéticos nuevos;43focales PASS. Informe en `docs/auditoria-experto-0822/REVISION.md`. Sin cambios al motor ni nueva RBZ hasta demostrar la corrección.
