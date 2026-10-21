# Hotfix P0 — pintura inmediata 0.8.7

## Ciclo 1 — análisis

Base: candidata 0.8.6, conservada. El modo rápido todavía heredaba Cara, XY y lote de preferencias antiguas; el hover llamaba SmartPaint.preview, que inventaría el modelo. Pintar Pieza expandía caras amplias usando ejes elegidos a mano. La paleta mostraba superficie, alcance, permiso y activación. Los SKM sin aprobación comercial no tenían permiso independiente de diseño.

Alcance exclusivo: pieza completa con material real, preservación de cantos, aislamiento seguro, una aplicación Undo por clic, paleta pequeña e independiente. No cambia A4, nombres ni pedidos. Pruebas reales de textura, gestos, Ctrl+Z y reapertura en SketchUp pendientes.

## Backlog

- [x] Motor: ambas superficies principales, ejes internos y cantos preservados.
- [x] Tool: hover local sin inventario, clic directo y cinco aplicaciones seguidas.
- [x] Controlador: defaults seguros y actualizar material sin desactivar Tool.
- [x] Paleta: modos pieza/canto, miniaturas y recientes sin formularios normales.
- [x] Diseño desde JPG y SKM sin aprobación comercial.
- [x] Regresiones, capturas, RBZ y paquete de validación nativa.

## Ciclo 2 — implementación y pruebas dirigidas

Tool inmediata y servicio reutilizados. Placa completa/both con ejes automáticos, cantos conservados, aislamiento único comprobando geometría/acabados y un Undo por clic. Hover local, caché de pick y cero preview de servicio en150movimientos. Tool permanece activa y se actualiza al cambiar material. Estado de modo refleja la nueva opción y una advertencia transitoria se limpia tras operación válida. Defaults rápidos descartan lote/ejes/superficie heredados. Paleta680×320 con siete casos UI nuevos, sin formularios normales; foto amplía temporalmente y vuelve. SKM clasificado y originalhashverificado sirve para diseño sin aprobación comercial. Motores de fotos y maderera conservados.

Errores corregidos: doble de Tool heredado interceptaba constructorstub Ruby y generaba recursión; se conserva un doble con contrato real de update_options. Expectativas de0.8.6 para400×760/ejes/lote recordados se cambiaron al requisito explícito sin tocar pruebas avanzadas. Captura encontró tipografía heredada y etiqueta de búsqueda visible: Arial y sr-only acotados a paleta. Nueva comprobación de estado encontró modo antiguo al cambiar tarjeta: status incluye mode. Material inválido conserva la Tool/material previo.

## Ciclo 3 — regresión, entrega y límites

Pruebas finales por fases: 448 Ruby / 3226 aserciones / 36 suites; 140 TypeScript; 16 web y102offline. 706casos en total. Lint/build/typecheck PASS. Primera invocación npm run verify se detuvo porque seguía el servidor de previsualización anterior en puerto3000; no fue fallo producto. Se detuvo el servidor propio y continuaron todas las fases restantes con exit0. CSS final recompilado antes de Ruby/UI offline; la reproducción limpia verifica las dos aserciones finales de limpieza de advertencias; revisión posterior incorporó también foto/biblioteca/rail al modo inmediato y dejó Pintura avanzada como acceso explícito. Lint/typecheck y102testsUI repetidos sobre fuentes finales. La corrida intermedia se detuvo tras fallar selectores del botón avanzado renombrado, ya corregidos sin alterar sus validaciones. Pintar desde biblioteca/rail activa el material recordado sin un segundo botón. Rechazo de UUID restaura selección visible al material activo; cambio a modo sin material compatible detiene de forma segura. No se afirma una sola invocación npmrunverify completada.

La nueva integración de13casos/157aserciones recorre PhotoMaterial JPG→ToolREAL→SmartPaint/NativePaint con API doubles. Cinco clics, ambos materiales explícitos reemplazados, materialfoto exacto/UUID, cantos intactos, hermana compartida intacta, cambio de material sin detener, Undo y Escape. Guarda/carga SKM por API doble, no SKP real. Políticas/importación/biblioteca validan SKM original íntegro sin comercial; proveedor sigue bloqueado sin aprobación. Las siete pruebas de paleta incluyen JPGlistodiseño/SKMlistodiseño y ausencia de controles de caras/ejes/autorización.

RBZ53archivos,52hashes payload,56entradas; ningún archivo añadido/eliminado respecto0.8.6, nueve servicios nativos, incluido PhotoMaterial, idénticos. SHA256 `6503d53cb8bafdd7dd5d6955b6afa22381ee9472ee0e5530bb9719bea7f24ad0` (1819799bytes). Capturas sintéticas y pasos de los10casos nativos incluidos. Privados excluidos, baseline intacta. Estado CANDIDATA_PARA_VALIDAR: no render nativo, no producción aprobada.

Reproducción limpia desde fuentes: 434Ruby/3156aserciones/33suites PASS y buildRBZ byteidéntico; node_modules locales reutilizados. Auditoría CRC/SHA/privacidad de archivos anidados PASS.
