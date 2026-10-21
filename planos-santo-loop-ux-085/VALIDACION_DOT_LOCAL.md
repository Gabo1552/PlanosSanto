# Validación candidata0.8.6 — Dot/Codex local

La nube entrega pruebas estáticas, unitarias y de integración con dobles explícitos de SketchUp/HtmlDialog/Material. No ejecutó SketchUp2026 ni verificó ventanas/DPI/Undo/texturas nativos. Probar una candidata instalada, sin parches de runners históricos.

## Preparación e identidad

1. Respaldar RBZ0.8.5, Plugins y biblioteca completa `%LOCALAPPDATA%/PlanosSanto` (catálogo, backups, photo-assets y material-assets). Usar copias de modelos y materiales QA. No desinstalar OpenCutList del perfil habitual.
2. Cerrar TODAS las ventanas SketchUp, instalar `PlanosSanto-0.8.6-candidata.rbz` desde Administrador de extensiones y reiniciar. No instalar ZIP de entrega ni fixture0.5.3 que acompaña fuentes.
3. Comprobar SHA256, versión cargada, manifiesto53archivos/52hashes de payload, menús y una barra de5acciones. Registrar Windows/SketchUp/Ruby/OCL/DPI. Los verificadores adjuntos son readonly: cargar no modifica ni ejecuta una prueba automáticamente.
4. Mantener originales/BM17 conservando SHA; sin pedidos comerciales, sin copiar fotos/texturas privadas a evidencias públicas. Registrar PASS/FAIL/PENDIENTE por caso, indicando manual/sembrado/automatizado.

## P0 — Pintura sin ventana general

- Con SketchUp recién abierto y último material válido en el modelo, pulsar Pintar. Debe crearse sólo una paleta modeless de≈400×760, sin mostrar ni hacer parpadear el panel1440×920. El modelo sigue navegable. Herramienta activa y material visible: un clic sobre pieza pinta. Medir dos decisiones reales, no contar la simulación cloud como prueba nativa.
- Sin material válido o con UUID/archivo/vínculo obsoleto: no pintar ni cargar en otro modelo silenciosamente. Paleta permite elegir una tarjeta válida; un clic en tarjeta arma la herramienta sin otro Activar. Si no hay un material utilizable, estado claro y +Material para foto; asociación/carga requiere acción explícita.
- Con herramienta activa, otra tarjeta cambia material sin reactivar manualmente y cancela cola pendiente. Probar tarjeta+clic; Enter confirma lote sólo del material actual. No reutilizar permisosall ni UUID de otro SKP.
- Cara/Pieza, cantos1/2opuestos/4, quitar y cuentagotas. Hover muestra exactamente superficies/rutas afectadas; marco/ejes dudosos bloquean. Conservar side/axes/submodo/batch válidos recordados; cambios físicos de escala no permiten clasificar espesor incorrectamente. Restauración explícita de placa usa material de placa, no canto.
- Tab/ShiftTab/CtrlTab/flechas en Tool, Esc/cierre cancelan sin aplicar cola; Ctrl+Z/Redo un gesto/lote. Teclas no roban escritura en campos HtmlDialog. Diez clics seguros sin diez formularios; definición compartida/ancestro inseguro detiene o aísla de forma comprobada.
- Crear JPG/PNG desde +Material en paleta: textura/miniatura/SKM, guardar y pintar sin panel general. Reabrir SKP y cargar SKM en otro proyecto sin JPG original, duplicados/variantes/reemplazo y revisión comercial de0.8.5 conservados. Fotos no infieren escala/espesor/SKU.
- Abrir/cerrar/reabrir paleta varias veces: sin ventanas/Tool duplicadas. Cambiar modelo con cola cancela y exige reanálisis. Con guía o pedido editados en panel general, toolbar bloquea inicio; no descarta cambios. Pintar con general abierto marca análisis desactualizado; guardar/exportar se bloquean hasta reanalizar, sin descartar notas.
- Probar dos ventanas: mensajes/errores y picker van a la que inició la operación; cerrar una no invalida datos/herramientas de la otra indebidamente. Mantener abierto selector foto/PDF158s y cancelar/guardar: sin timeout falso ni respuesta cruzada. El arreglo histórico necesita confirmación nativa.

## P1 — Selección, nombres y revisión

- Seleccionar un mueble y pulsar Muebles: lista inmediata y dibujo sin volver al árbol/generar manualmente. Sin selección: selector normal. Seleccionar una pieza hija debe resolver su contenedor correcto, no convertir accidentalmente un tablón en mueble. Anidados/repetidos por ruta.
- Clicfila/dibujo resalta sólo la ocurrencia nativa correcta. Overlayreadonly; selección, active_path, medidas y Undo sin escritura. Campo permanece visible con dibujo a1000px y1500px.
- Editar con Tab/Enter/Esc, buscar/filtrar, grupos idénticos con nombres originales distintos: sin renombrado implícito. Cambiar abreviaturas/padre no duplica prefijos; medidas siempre protegidas.
- Aplicar renombrado muestra original/propuesto/ruta/alcance y exclusiones. Preview no escribe. Una confirmación guarda lote y guía en operación coherente; Undo restaura nombres/guía. No se cambia ComponentDefinition#name. Si otra aplicación editó el nombre o guía, preview/save obsoletos bloquean sin escrituras parciales.

## P1 — A4 directo y fidelidad

- Seleccionar mueble→Planos: editor listo. Alternar1/2vistas yExterior/Interior; cámaraortográfica arrastrable, zoom yRestablecer. No rota geometría.
- En interior activar Ocultar pieza: clic en puerta y otra pieza anidada. Sólo representación interior por ruta, piezas siguen en tabla/modelo. Preview/Cancelar/Aplicar, chips/restaurar todas y reapertura.
- Nota/flecha: crear, editar, mover, reanclar, borrar, guardar/cerrar/reabrir. Probar también arrastre del recuadro en web: el texto SVG no debe iniciar un drag de navegador ni impedir mover la nota.
- Vista previa usa los bytes del exportador real. Verificar visor PDF en CEF: puede depender de soporte local. Si no renderiza integrado, comprobar Abrir/Descargar y reportar la limitación, no aceptar una pantalla vacía como preview aprobado.
- Comparar render depreview con exportación para1/2vistas, tabla/cotas/textos/notas. Cada mueble una hoja297×210mm; nombre/pieza/cotas completos. BM17 agrupado17unidades/8filas;17sinagrupar bloquea legibilidad donde corresponda, sin recortar ni añadir hojas.
- Cuando no cabe, causa específica (tabla/nota/vista/cota) y opciones de ajuste. Ocultos/anotaciones preservados; no quitar piezas automáticamente.

## Barra, DPI y regresión comercial

Una barra de5acciones: Pintar/Muebles/Maderera/Planos/Materiales. Comandos secundarios, interfazcompleta y diagnóstico permanecen en menú; activar/desactivar/reiniciar no duplica ni fuerza barra oculta. Iconos originales24/32, estados/tips y contraste, DPI100/125/150% real a1280×720/1920×1080. Cloud sólo prueba zoomCSS, no DPI nativo.

Nombres, catálogos35SKM, fotos, materiales/cantos/UV, persistencia, perfiles sinOCL y modelos grandes. TXT exacto9columnas TAB: cant/base/altura/detalle/rota/canto_arr/canto_aba/canto_izq/canto_der. Lotes separados por material/espesor/cantos y bloqueos de aprobación/orientación vigentes. No enviar pedidos al proveedor sin autorización específica y datos de prueba.

## Evidencia y rollback

Devolver informe, versión/hash de52archivos antes/después, clics reales, capturas de ventanas completas (para verificar ausencia de general), snapshots de caras/geometría/nombres/Undo, PDF/preview renderizados, TXT sintético y errores Ruby/JS. Separar materiales/SKP privados y evidencias autorizadas en paquetes<32MiB. No tocar el producto durante la validación.

Rollback: cerrarSketchUp, reinstalar0.8.5 y restaurar respaldos de Plugins/biblioteca/modelos si hace falta. No se migra destructivamente guide_v1/CatalogStore schema1/preferenciasps2schema2. Aceptación de SKU/veta/proveedor y producción global siguen pendientes de pruebas reales.
