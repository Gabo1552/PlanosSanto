# Registro de ciclos — 0.8.23

## 1. Análisis e implementación

Causa comprobada: `MaterialLibraryPanel.onManageModel` estaba conectado desde App a `setShowPaint(true)`. Se reemplazó por previsualización/ficha nativa; se reutilizó MaterialProperties, el catálogo y el archivo SKM de MaterialLibrary. No se creó otro motor de pintura.

Archivos principales: `model_material_catalog.rb`, `offline.rb`, `MaterialLibraryPanel.tsx`, `App.tsx`, `CutlistView.tsx`, CSS y scripts de build/paquete.

## 2. Pruebas focales y correcciones

Servicio: 19 pruebas / 124 aserciones. Controlador: 5 pruebas / 50 aserciones. UI de ficha: 6 casos nuevos; Piezas: 3 casos nuevos. Se verifican identidad exacta, OCL sin plugin, unidades ambiguas, cantos, cancelación, datos faltantes, vínculo existente, miniaturas persistentes, modelo obsoleto, rollback y ausencia de acciones Pintar.

Revisión independiente Ruby/seguridad y TypeScript/UX. Se corrigieron: acceso nullable al material, navegación con caché anterior, devolución de foco, textura modificada desde preview y recuperación secundaria de catálogo/índice. Cuando falla la recuperación se conservan los SKM y se informa el problema.

## 3. Integración y candidata

El primer recorrido Ruby detectó la expectativa antigua de 85 archivos del instalador; se actualizó a 86 incluyendo el nuevo servicio. El runner incorpora ambos archivos de prueba nuevos. Versión candidata 0.8.23; se conserva aceptación de exportaciones anteriores en el esquema.

Resultados consolidados y hash final: `RESULTADOS.json`. Comandos reproducibles: `npm run build:offline`, `npm run test:offline:ruby`, `npm run typecheck`, `npm run lint`, `npm test`, `CHROMIUM_PATH=/usr/bin/chromium npm run test:offline:ui`.

La pasada completa UI tuvo 242 aprobadas y 3 fallos iniciales: exportación cuyo directorio temporal fue eliminado durante otra ejecución Playwright, selector de status ambiguo y expectativa del editor viejo. En las repeticiones se completó el doble de material con `name` (API nativa existente) y se encontró/corrigió la diferencia entre IDs `material:77` del diagnóstico y `77` de la biblioteca. El servicio normaliza solo ese prefijo numérico y nunca resuelve por nombre. El caso integrado desde Piezas queda como regresión.

## Pendientes

Validación nativa en SketchUp 2026 de textura/UV/SKM, atributos OCL reales, guardar/reabrir, Undo y reutilización en otro modelo. Seguir `VALIDACION_LOCAL.md`. No hay aprobación de producción.

La calibración Experto continúa pendiente de los tres ensayos del proveedor; esta candidata no cambia ese algoritmo ni afirma equivalencia comercial.
