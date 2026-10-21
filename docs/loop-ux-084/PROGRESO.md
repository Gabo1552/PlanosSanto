# Rediseño UI/UX 0.8.4 — registro

El loop detallado se mantiene en `planos-santo-loop-ux-082/PROGRESO.md` y `ESTADO.json`. El número082 de la carpeta corresponde al encargo, no a la versión que se está sobrescribiendo. Baseline de trabajo0.8.3 conservada, fuentes/candidata anteriores intactas.

## Base y alcance

Se revisaron wireframe y referencias sin copiar marca/iconos/texturas de OpenCutList. Wireframe independiente idéntico al incluido. Datos privados excluidos deGit/paquetes;35 SKM originales usados únicamente para verificación aislada. Los módulos de negocio existentes se reutilizan.

## Implementación

Cinco destinos reales, shell persistente, catálogo visual y paleta compacta. Iconografía lineal original local; ocho accesos visibles sumando principal y herramientas, cuentagotas en menú/paleta. Importación ZIP/carpeta/individual como candidatos, miniaturas reales, deduplicación SHA y resolución explícita de conflictos. Carga nativa solo tras aprobación/confirmación mediante MaterialLibrary existente. Resaltado de solo lectura por ruta en el modelo, sin escribir selección/geometría ni generar Undo.

Pruebas dirigidas del importador25/133, resaltado8/65, controlador10/63 y barra11/175. El ensayo de los35 SKM reales confirmó35 miniaturas,35pendientes y0 nuevos en reimportación, revisión intacta y catálogo recuperable por otra instancia. ZIP inválido no dañó catálogo y originales conservaron hash. Evidencia sanitizada `ux-084-skm-reales-verificacion.json`; los activos y catálogo de ensayo están en `fixtures/private/ux-084-biblioteca-ensayo` y no se entregan en el RBZ.

## Correcciones durante pruebas

- Doble de modelos sin API de materiales: fixture corregido; no se alteró producto para ocultar el fallo.
- Vista previa importación: foco tras Escape debía esperar a que finalizara busy; corregido con efecto posterior al render.
- Mensaje de carga SKM explícita se perdía con refresco automático: se conserva feedback de la operación.
- Maquetación a1000px: se restauró continuidad entre dibujo y nombre, manteniendo controles anteriores.
- Revisión de dibujo y movimiento de cotas en curso; logs iniciales guardados. No se declaran PASS hasta repetir.

Pendiente verificación integral, auditoría final y entrega; instalación/gestos y DPI nativos de SketchUp quedan para Codex local/Dot.


## Ciclos E–F — regresión y entrega de candidata 0.8.4

Corregidos foco tras cancelar importación, conservación del mensaje de carga y controles que desplazaban el dibujo. El arrastre de cotas se interrumpía por selección nativa de texto SVG; se desactivó esa selección en el dibujo manteniendo el arrastre y los nombres editables. Se añadió acceso a cinco muestras recientes de la sesión, filtradas por tipo/aprobación vigente, sin persistir autorizaciones.

La primera verificación integral detectó una expectativa antigua del test names:36: dibujo a la izquierda del campo. El diseño solicitado lo ubica a la derecha en ventanas amplias. Se adaptó únicamente el assert de separación a ambas disposiciones, manteniendo límites visibles, solapamiento vertical, foco y todas las comprobaciones de nombres, una operación, geometría y reapertura. Log inicial conservado en verify-ux-084-inicial.log.

Verificación final: `npm run verify`, exit0. 353 pruebas Ruby / 2495 aserciones / 30 suites; 139 pruebas TypeScript; 16 web y 67 editor offline. Lint, compilación y tipos aprobados. Auditoría RBZ:48 archivos,47 hashes de payload,24 comprobaciones de sintaxis Ruby/JS, CRC correcto;11 servicios nativos de negocio idénticos a0.8.3, ningún archivo anterior eliminado y baseline intacta. Tres PDF sintéticos de17piezas: exterior/interior/doble, una hoja297×210mm cada uno.

Comparativas con el mismo fixture sintético y bundle/Ruby0.8.3 congelados: cinco módulos, paleta e iconos. Pruebas de teclado, foco y seis combinaciones de tamaño/zoomCSS; no se presentan como DPI Windows ni pruebas de operario. Galería ux-084-comparacion.html y evidencia sanitizada de35SKM incluidas. Los materiales, texturas, inventarios y capturas privadas se excluyen del RBZ/fuentes/entrega.

RBZ SHA256 `68f3417ff77eae10f5f78c374de1c1729c48040b32bfc391aa722787d889935b` (1695168bytes). Instrucciones de instalación, rollback y casos nativos reproducibles en VALIDACION_LOCAL_POSTERIOR.md. Estado CANDIDATA_PARA_VALIDAR; sin ejecución SketchUp en nube ni aprobación de producción.

Reconstrucción de fuentes en directorio limpio:339 pruebas Ruby offline/2425 aserciones/27 suites PASS y RBZ byte a byte idéntico al entregado; dependencias locales reutilizadas. No equivale a instalación SketchUp. Auditoría de privacidad por hashes:74 activos privados comprobados y0 coincidencias en los archivos descomprimidos de entrega, incluidos ZIP/RBZ anidados. CRC y SHA256SUMS correctos.
