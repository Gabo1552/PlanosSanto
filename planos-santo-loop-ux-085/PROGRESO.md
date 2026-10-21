# Progreso del loop 0.8.5

Estado inicial: **CONTINUAR**. Solo auditoría estática y paquete de planificación entregados; **no se aplicó código al proyecto nube**, no se ejecutó SketchUp.

## Ciclos

| Ciclo | Cambios realizados | Comandos y resultados de prueba | Riesgos / pendientes | Estado |
|---|---|---|---|---|
| — | Inicial | Auditoría del RBZ referencia | Validación nativa posterior | CONTINUAR |

Cada ciclo nuevo debe actualizar esta tabla, el estado JSON y, si corresponde, ubicación de evidencia real. Sin afirmaciones de éxito sin salida observable.

## Ciclo1 — auditoría y decisiones

Fuentes vigentes0.8.5, SHA de baseline2ab072647d7b042b6a5ee39af91d93ce3eb8787931f3f44924ba166b052fd997. Se conserva RBZ y fuentes de0.8.5; referencia sólolectura, ZIP extraído sin sobrescribir archivos. Prototipo independiente idéntico al adjunto, no conectado ni usado como evidencia nativa. Referencias/runs/ux ignorados enGit y excluidos de entrega. Auditoría estática ejecutada; baseline642tests automatizadosPASS, sin aceptación SketchUp.

Arquitectura: un controlador y los motores existentes, dos HtmlDialog independientes con destino de respuesta explícito. Pintar abre palette.html400×760 y no crea ventana general; acciones de gestión abren general sólo de forma explícita. Material seguro recordado resuelto por catálogo/vínculo vigentes, alcanceúnico sin autorización compartida automática. Nombres: seleccióncontextual y preview readonly del lote antes de saveatomic. A4: controlesdirectos y previsualización del PDF exacto, ocultos sólo por ruta en representación interior.

Implementación paralela autorizada: controlador/pintura,nombres,paleta,guías,barra/iconos y comparativas. Raíz coordina versión/build/pruebas/paquete; sin sustituir servicios de fotos, TXT ni geometría. Git sin historial: se conserva y entregará ZIP reproducible; no se hace commitmasivo de archivos privados/untracked.

## Ciclos 2–6 — candidata 0.8.6

Paleta independiente palette.html400×760 y entrada compilada sin App/editorA4. Pintar de barra prepara Tool antes de abrir, sin scan/generate ni ventana general; conserva material válido y exige selección si falta. Cambio de tarjeta cancela cola y activa siguiente material seguro; permisos compartidos no se reutilizan. Controlador conserva sesión de ambos diálogos, progreso/respuesta al emisor y espera humana de picker; cierre cancela cola. Restauración de canto valida placa, no canto. Fotos0.8.5 y motores existentes conservados.

Muebles contextual prepara únicamente selección y muestra piezas/dibujo. Tab/Enter recorren nombres; Escape restaura bases físicas. Preview readonly de lote y una confirmación atómica con Undo. Cambio desde paleta invalida análisis sin descartar anotaciones. A4: controles1/2vistas, cámara restablecible, ocultas por ruta con chips y restauración; vista previa usa el PDF real, no una composición alternativa. Preview/exportación de una y dos vistas tienen render Poppler idéntico. Barra única cinco accesos con iconos originales24/32; secundarios en menú y paleta.

Correcciones y errores conservados: doble de barra inicialmente invocado dentro de busy; driver de nombres carecía select_tool; CSP correctamente bloquea fetch(blob), se descarga enlace real sin relajar seguridad; encabezado de lote corregido a12px/contraste4.5. Campos y dibujo se separaban en pantalla ancha: CSS compacto. Regresión web de arrastre: primera hipótesis user-select no bastó; traza mostró nota fuera de viewport por controles nuevos antes del dibujo. Editor web ahora presenta dibujo antes de controles; prueba original pasa sin alterar gesto. Expectativa antigua de no generar desde Muebles se actualizó al nuevo requisito de preparación readonly, conservando cero save/names_apply/pdf implícitos. Logs iniciales conservados.

Verificación final por fases equivalentes a npm run verify: sesión original interrumpida sin resultado; offline completo dio93PASS/1expectativa antigua, corregida al nuevo contrato readonly y protección de guía pendiente. Repetición final del archivo5/5PASS:94casos únicos aprobados entre ambas corridas. No se afirma una única corrida npm run verify exit0. Lint/typecheck finales y empaquetado exit0. Totales: 426 pruebas Ruby / 2986 aserciones / 35 suites, 140 TypeScript, 16 web y 94 offline: 676 pruebas. Lint/build/typecheck PASS. Comparación0.8.5/0.8.6 con mismo fixture sintético y controladores reales+dobles nativos; dos decisiones automatizadas en caso recordado, no ensayo humano. Capturas100/125/150 son zoom CSS, no DPI Windows.

Iframe PDF negro en Chromium headless: NO aprobado visor integrado. Enlace real de descarga funciona y PDF/render verifican contenido y una hoja297×210. Validación CEF/Abrir PDF incluida para Dot. Los tres PDF17piezas son sintéticos, no BM17 nativo. Privados/prototipo/referencias excluidos. RBZ53archivos,52hashes payload,56entradas con directorios; ningún archivo previo eliminado y13servicios centrales byteidénticos a0.8.5. SHA256 `7391c2b2e09204046b255e16b3431aa2dcb2fcf497041e37eac262a9e0cef258` (1813818bytes). Baseline intacta; candidata pendiente de SketchUp real, no producción aprobada.

Reproducción limpia de fuentes: 412Ruby/2916aserciones/32suites, buildRBZ idéntico. Node_modules locales reutilizados; no SketchUp. Auditoría CRC/hash/privacidad de paquetes completada.
