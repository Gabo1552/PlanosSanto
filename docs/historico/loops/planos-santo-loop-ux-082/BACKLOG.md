# Backlog de trabajo — ejecutar ordenado, no marcar sin evidencia

## Ciclo A — Base de código, inventario, preservación (obligatorio)
- [x] Identificar branch y archivos fuente del último código de la nube (no editar bundle minificado salvo que sea fuente real).
- [x] Extraer la 0.8.2 como solo referencia y comprobar evolución del repo.
- [x] Documentar acciones actuales y botones del UI; capturas baseline.
- [x] Ejecutar suites existentes (incluido PDF A4, nombres, cantos y TXT), registrar fallos previos.
- [x] Acordar tokens, navegación y estados; hacer wireframe dentro del proyecto.

## Ciclo B — Diseño y navegación
- [x] Implementar estructura de 5 secciones con navegación consistente e indicador del destino.
- [x] Unificar componentes UI (botones, controles, tarjetas, listas, tabs, avisos, skeletons, modales, espaciado, tipografía).
- [x] Extraer CSS/tokens modulares y mejorar accesibilidad; conservar capacidad offline del HtmlDialog.
- [x] Mejorar Inicio y contextualización del flujo de taller.

## Ciclo C — Barra de herramientas e iconografía
- [x] Dibujar set ORIGINAL lineal coherente, 24/32, tooltip y estados.
- [x] Registrar `UI::Command` por función y toolbar de 8 acciones máximo visibles.
- [x] Conectar acciones con handlers reales existentes; incluir menús/atajos y desactivación.
- [x] No duplicar barra tras recargas y proteger modo Tool activo.

## Ciclo D — Pintado cómodo + catálogo de SKM
- [x] Paleta compacta: modos, favoritos, últimas muestras, material activo, estados.
- [x] Integrar `SmartPaintTool` sin perder deshacer, seguridad de definición compartida, previsualización de cara.
- [x] Importador masivo SKM desde ZIP/carpeta con miniaturas, duplicados, barra progreso y revisión.
- [x] Integrar 35 SKM como candidatos NO APROBADOS, persistir y relacionar cantos tras validación.
- [x] Distinguir biblioteca del taller y materiales cargados en modelo.

## Ciclo E — Muebles / Maderera / Planos
- [x] Reordenar UI Muebles: árbol, piezas, sugerencias de nombre, vista/resaltado contextual.
- [x] Reordenar UI Maderera: lotes compatibles, alertas, preflight y botón TXT.
- [x] Reordenar UI Planos A4: 1 o 2 vistas, rotación, ocultar piezas, notas/guardar/exportar.
- [x] Conservar motores existentes y reforzar pruebas de regresión.

## Ciclo F — Pulido y entrega
- [x] Tests de acceso, estados vacíos, error, guardado, selección, keyboard, escalado y contraste.
- [x] Capturas antes/después con mismos modelos, ventanas y pasos.
- [x] Probar empaquetado y manifest del nuevo RBZ; no incluir catálogo privado por defecto.
- [x] Generar `VALIDACION_DOT_LOCAL.md` con casos reales listos para el Codex local.
- [x] Entregar nueva candidata, resumen de pruebas y fallos/pendientes reales.


Implementación y comprobaciones nube finalizadas. Los checks anteriores registran trabajo de desarrollo, no validación nativa: ver CRITERIOS.md y VALIDACION_DOT_LOCAL.md. Los35materiales se incorporaron a biblioteca QA aislada como pendientes, no se aprueban relaciones de cantos sin datos técnicos del taller. No se creó commit masivo porque el repo está sin historial; fuentes/pruebas reproducibles se entregan en ZIP.
