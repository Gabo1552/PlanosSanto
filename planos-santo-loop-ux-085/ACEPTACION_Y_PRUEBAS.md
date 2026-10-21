# Criterios de aceptación — UX para el taller

## P0 Pintura rápida

- [ ] Con material recordado válido, «Pintar» desde SketchUp deja la herramienta en uso sin mostrar la ventana 1440×920. Máximo 2 clics hasta pintar la pieza.
- [ ] Si no hay material válido, paleta compacta aparece con estado claro; elegir un material y pintar sin navegar a otra sección.
- [ ] Con herramienta activa, tocar otra miniatura cambia material **sin reactivar herramienta** y sin pintar selecciones pendientes con material viejo.
- [ ] Modos Pieza/Cara/Canto 1/2/4/Quitar y Cuentagotas accesibles en mismo contexto.
- [ ] La paleta no impide navegar el modelo; varios clics repetidos se comportan de forma consistente.
- [ ] Modelos con instancias/definiciones compartidas no son modificados masivamente sin revisión; Undo revierte cada operación.
- [ ] Los materiales creados desde foto en 0.8.5 siguen siendo utilizables y mantienen textura/miniatura.

## P1 Nombres

- [ ] Selección de mueble → abrir Muebles con listado inmediatamente.
- [ ] Selección de fila resalta la pieza correcta; edición inline con Tab/Enter/Esc.
- [ ] Prefijos no se duplican; edición por lote produce **una vista previa** y **una confirmación** antes de escribir.
- [ ] No cambia definiciones compartidas accidentalmente ni pisotea nombre cambiado fuera del panel.

## P1 Planos

- [ ] Abrir editor A4 desde selección; cambiar 1/2 vistas sin abrir pantallas adicionales.
- [ ] Rotar/zoom persisten; ocultar puerta y otra pieza desde la vista interior, sin modificar el modelo ni el listado.
- [ ] Crear nota/flecha, editar, anclar, guardar/reabrir.
- [ ] Vista previa coincide con PDF A4 horizontal (297×210 mm), una hoja por mueble; sin recortar etiquetas, nombres, piezas ni notas.

## P1 Iconos y diseño

- [ ] 5 accesos principales funcionando, con iconos propios coherentes 24/32 y estados/ayudas; sin barra duplicada.
- [ ] Comandos secundarios no perdidos; ventana usable con DPI Windows 100%, 125% y 150%.
- [ ] Interfaz conserva marca Planos Santo; no se copiaron iconos OpenCutList.

## Regresión imprescindible

- [ ] Modelo real copia + fixture sintético: pintado por cara/pieza, renombrado, materiales/cantos, TXT exacto maderera, guardado y reapertura, PDF A4.
- [ ] TXT delimitado por tabuladores con columnas exactas: cant, base, altura, detalle, rota, canto_arr, canto_aba, canto_izq, canto_der; lotes por material/espesor/cantos.
- [ ] Pedido bloqueado si falta verificar tipo, orientación o cantos; cambio UX nunca fuerza exportación de producción.
- [ ] No pérdidas de datos, cambios en modelos originales ni referencias a servidor externo.

## Evidencia

Tests con comando, salida, entorno; vídeo opcional; capturas de la paleta y del editor; PDFs renderizados; TXT de prueba y validación en web del proveedor **solo con datos de prueba y autorización**. Señalar en cada caso `estática`, `aislada`, `integración`, o `SketchUp real`.

**No se aceptan** capturas de maqueta como evidencia de funcionamiento nativo ni tests sintéticos como aceptación de medidas reales.

## Evidencia de nube0.8.6

Automatización completa aprobada; ver RESULTADO.json y verify-flujos-086.log. Checks nativos permanecen pendientes. Capturas sintéticas y métricas no sustituyen SketchUp2026. PDF real descargado/renderizado, iframe headless negro explícitamente sin aprobar.
