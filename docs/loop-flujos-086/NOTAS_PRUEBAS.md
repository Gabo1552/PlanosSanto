# Flujos rápidos 0.8.6 — evidencia de nube

La prueba utiliza UI y controladores reales de cada versión y los motores existentes SmartPaint/NativePaint/NameManager. HtmlDialog, modelo SketchUp, materiales y eventos del cursor son dobles de API. No se ejecuta SketchUp ni se usa el prototipo del paquete como evidencia funcional. No se incluyen modelos/materiales privados.

Baseline congelada: PlanosSanto-0.8.5.rbz, SHA256 2ab072647d7b042b6a5ee39af91d93ce3eb8787931f3f44924ba166b052fd997, extraída en /tmp/planos-flujos-baseline-085. Mismo modelo L y tres materiales sintéticos de comparación en ambas versiones.

Comando baseline: PLANOS_FLUJOS_BASELINE=1 npx playwright test --config playwright.offline.config.ts --output test-results/flujos-baseline-085-final tests/offline/flujos-rapidos.spec.ts. Resultado: 2/2 PASS. Registro de HtmlDialog prueba que el botón Pintar de 0.8.5 construía index.html de 1440×920; el editor de nombres requería generar tras abrir Muebles.

Prueba actual: npx playwright test --config playwright.offline.config.ts --output test-results/flujos-after-086-final tests/offline/flujos-rapidos.spec.ts.

Se registran decisiones, no tiempo humano ni clics físicos en Windows. Caso recordado: callback de barra Pintar + clic de cara por API doble = dos decisiones; la prueba exige una herramienta, solo palette.html 400×760 y ningún scan/ui_ready/ui_loading/generate ni smart_tool_start iniciado por la página general. El servidor puede iniciar su motor existente antes de mostrar la paleta. Cambiar material desde la tarjeta cancela primero una cola pendiente y permite el siguiente clic sin reactivar manualmente.

El flujo de nombres prueba una vista previa de solo lectura y una confirmación/guardar que cambia una instancia sintética. El A4 se descarga desde el enlace real de la vista previa creado por el exportador, valida una página 297×210 mm y genera el render con Poppler si está disponible. No se aproxima el plano con otra composición HTML. El iframe nativo y sus capacidades requieren comprobación en SketchUp.

Ajustes del harness durante el ciclo: el comando de barra se invoca fuera del flag busy del bridge (como sucede en la extensión); la primera versión del driver lo invocaba dentro de un request y era bloqueado correctamente. La lectura de PDF mediante fetch(blobURL) es bloqueada correctamente por CSP connect-src none, comprobado también con un Blob de prueba nuevo. La prueba final descarga el enlace actual de la vista previa y valida ese archivo; no relaja la CSP ni modifica el PDF.

Pendiente en SketchUp 2026: ventanas modeless reales, navegación del modelo mientras la paleta está abierta, clics físicos, DPI 100/125/150, tooltips/iconos 24/32, Escape/Tab/flechas nativos, dibujos de hover/cola, aislamiento de instancias y Undo reales, visor PDF integrado/Abrir PDF y regresión sobre copia BM17. El zoom CSS automatizado no sustituye DPI Windows.

## Resultado final

Cinco casos aprobados en la corrida integral (8.3 s): entrada recordada de dos decisiones sin panel general; tarjeta inicial/cambio activo/cola; modos a zoom CSS 100/125/150; contexto de nombres con vista previa y confirmación únicas; PDF A4 real descargado con una y dos vistas. El encabezado de la tabla de renombrado se corrigió tras inspección y ahora exige contraste >=4.5 y tamaño >=12px en la regresión.

La vista A4 completa se encuentra dentro del panel de dibujo con desplazamiento interno. Se verificó que puede desplazarse hasta quedar completamente dentro de ese contenedor. `flujos-086-after-a4-sheet-SINTETICA.png` registra ese contexto: el iframe PDF aparece negro en Chromium headless. NO se aprueba el render integrado por esta captura. El enlace real de descarga funciona y el archivo descargado se valida y renderiza con Poppler; comprobar el iframe y «Abrir PDF» en SketchUp 2026 es una condición local pendiente. No se sustituyó el visor con una imagen simulada.

Artefactos finales: galería `flujos-086-comparacion-SINTETICA.html/png`, manifiesto `flujos-086-evidencias.json`, métricas `flujos-086-metricas.json` y `flujos-086-cambio-material-metricas.json`, PDF `flujos-086-A4-SINTETICO.pdf` y su render `flujos-086-A4-RENDER-SINTETICO.png`. Todos los datos son sintéticos.

## Correcciones finales de integración

La traza del arrastre web mostró que los controles A4 habían dejado el dibujo debajo del viewport. Moverlos después del dibujo corrige el gesto original; el preventDefault SVG por sí solo no bastaba. Se conserva la prueba original. La expectativa anterior de no generar desde Muebles cambió según el requisito explícito: ahora debe preparar la selección sin guardar nombres ni exportar. El test exige una sola generación readonly y cero escrituras/exportaciones.

Una sesión de verificación terminó sin resultado final durante offline UI; se repitió esa fase completa por separado, sin atribuir la interrupción a un fallo del producto. Registros iniciales se conservan.
