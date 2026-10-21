# Planos Santo 0.6.8 — desarrollo y validación conjunta

El usuario pidió continuar el desarrollo y hacer la validación en SketchUp al final. Esto reemplaza la pausa previa en P1 del documento del loop; no reemplaza la aceptación manual final. No se ejecutó SketchUp en esta nube.

## Implementación

- Biblioteca global del taller, independiente del SKP: esquema versionado, favoritos, búsqueda, fichas de placas/cantos, SKU, proveedor, formatos, veta, compatibilidades y precios opcionales con fecha/fuente. Guarda en `%LOCALAPPDATA%\PlanosSanto\catalog.json` (o APPDATA), con respaldo de la versión anterior en `backups`. Guardado atómico, bloqueo de escritura y control de revisión entre ventanas. Cambiar un dato de fabricación quita la aprobación en la interfaz.
- Importar JSON o materiales observados del modelo conserva las sugerencias sin aprobar. Deduplicación por procedencia exacta; nombres coincidentes con datos distintos se conservan separados y se avisan. Los ZIP aportados contienen **58 registros**, no los 111 mencionados por su backlog: 25 placas, 21 cantos, 3 perfiles y 9 registros de tipo 5 sin resolver para este catálogo. No se inventaron los faltantes ni precios. `artifacts/catalogo-taller-sugerido-058.json` es una copia opcional, privada y separada del instalador; los 58 registros están sin aprobar y sin precio.
- Propuestas geométricas de nombres dentro del editor: confirmar vertical/frente, ver motivo, editar y aplicar explícitamente. Laterales/divisores reconocidos; piso/estante/tapa/frente son propuestas para revisar; oblicuos/macizos quedan sin clasificar. No se aplica ningún nombre al SKP hasta Guardar guía. Reutiliza prefijos, agrupación de iguales y operación de renombrado/Undo existentes.
- Pedido maderera: vista 2D de la malla real por ejes locales escalados, cara e inversiones explícitos; muestra espejos. Revisa cada pieza física y exige placa aprobada con espesor coincidente, eje de veta, rotación, medidas terminadas aceptadas o corte explícito documentado, y cuatro cantos 0/1/2 compatibles. No deduce lados por el tamaño ni convierte atributos OCL brutos en medidas de corte. Se bloquean geometrías no rectangulares y transformaciones con cizallamiento. Excluir exige motivo.
- Borrador de pedido en atributo independiente del modelo, una operación deshacible; conservarlo en disco requiere guardar el SKP. Al cambiar geometría/catálogo debe revisarse de nuevo. No cambia mallas, definiciones, materiales ni atributos OCL.
- TXT por lote de placa/espesor/canto principal/secundario, exactamente nueve columnas TAB; perfil predeterminado UTF-8 sin BOM, punto decimal, sin encabezado, CRLF. Perfiles alternativos requieren probar el portal. Manifiesto separado con selección de productos, todas las filas físicas/IDs, exclusiones y hashes. Se publica una carpeta nueva de forma atómica, sin reemplazar exportaciones existentes. `production_ready:false` hasta la prueba real del proveedor.
- Estimación **neta**, no presupuesto final: placas por m² o fracción de placa y cantos por metro. Sin precio/unidad compatible queda pendiente; precios de más de 90 días o futuros se separan del subtotal vigente, por moneda. No calcula desperdicio, impuestos, mano de obra ni optimización.
- Interoperabilidad limitada con **OpenCutList original**: se abre su diálogo real de listas/optimización/presupuesto o materiales/Smart Paint. Punto de entrada revisado `PLUGIN.show_tabs_dialog`, versión 7.1.0/build 202511301621; otras versiones no se fuerzan. No hay copia del motor GPL, optimizador propio, presupuesto OCL ejecutado automáticamente ni resultado simulado. La compatibilidad en Windows queda para la prueba final.
- Opción para incluir SKU de material y mapa de cantos en la tabla del PDF, solo a partir de un borrador completo, guardado y vigente. Piezas excluidas no reciben especificación; si una fila de iguales tiene asignaciones diferentes, exige desagrupar. El control de espacio sigue bloqueando contenido que no cabe.
- Plano compacto **optativo**, para usar con iguales agrupados: todas las geometrías delante/detrás; un ID por tipo con cantidad en la trasera y cotas por ID bajo la delantera. Conserva el modo anterior por defecto y la precisión/visibilidad/posición guardada de cotas. Agrupa avisos repetidos manteniendo todos los códigos. No es un dibujo a escala.

## Uso e instalación reversible

1. Guardar una copia del SKP y conservar el RBZ anterior. Instalar `PlanosSanto-0.6.8.rbz` desde Administrador de extensiones, sin descomprimir. Cerrar **todas** las ventanas de SketchUp y volver a abrir. Comprobar versión 0.6.8. No reinstalar el exportador web 0.3 encima.
2. En Planos Santo, abrir **Biblioteca y pedidos → Biblioteca**. Crear/importar candidatos; revisar cada ficha y aprobar solo los datos contrastados. Guardar biblioteca crea respaldo; Exportar copia genera JSON nuevo. Para volver a una versión de biblioteca, conservar una copia del catálogo actual y restaurar el JSON elegido de `backups` como `catalog.json` con SketchUp cerrado. Importar una copia crea sugerencias, no restaura aprobaciones automáticamente.
3. Generar guías y editar nombres mirando el dibujo. **Proponer nombres por geometría…** no cambia el modelo por sí solo. Guardar guía aplica los nombres si está activada la sincronización.
4. Guardar guía antes de preparar el pedido. En **Pedido maderera**, revisar ejes/cara, material, veta, medidas y cantos en cada pieza. Guardar borrador; guardar el SKP para conservarlo al cerrar. Revisar costo neto y exportar TXT de prueba a una carpeta.
5. Para dibujos densos, activar **Agrupar componentes iguales** y **Rotar vista, mover cotas y mostrar IDs → Plano compacto por tipos**; revisar delantera y trasera. Es una opción expresa: el modo normal sigue mostrando los IDs en todas las instancias.
6. Para referencias de material, activar **Opciones de guardado → Incluir materiales y cantos del pedido revisado en el PDF**. No basta con observar materiales: se requiere el pedido revisado guardado. Si la tabla crece demasiado, se bloquea la exportación en vez de recortarla.

## Validación final en SketchUp 2026 Windows

Hacerla junta sobre **copias** de CA AmSurrbac y otros dos modelos del taller; no hace falta detener el desarrollo en cada paso.

- Instalación/reinicio: versión, ausencia de errores de carga, interfaz sin conexión; OpenCutList original sigue habilitado y sin modificar.
- Lectura de materiales: contrastar biblioteca completa/aplicados/sin aplicar, tres placas/cantos, piezas con pintura heredada/frente/dorso y piezas rotadas/espejadas. Guardar informe de diagnóstico.
- Comparar cinco medidas reales y sus ejes, espesores, cantidades y materiales con el modelo, no con la caja global del mueble.
- Nombres: probar prefijos obra/módulo, repetidos de misma definición/material/medidas, seis ocurrencias compartidas reportadas, instancia externa no seleccionada y bloqueo. Guardar, Ctrl+Z, volver a guardar, cerrar/reabrir SKP y exportar PDF después de guardar.
- Biblioteca: revisar/aprobar una placa y dos cantos reales, guardar y abrir otro SKP/reiniciar; verificar que siguen disponibles. Intentar guardar desde dos ventanas para comprobar aviso de revisión.
- Pedido: revisar primero **una pieza asimétrica**, con canto distinto arriba/izquierda y veta; contrastar cara e inversiones con SketchUp. Probar espejo/rotación/anidación. Verificar medidas terminadas/corte con el proveedor. Guardar/reabrir borrador y comprobar que cambiar geometría/catálogo obliga a revisar.
- Abrir OCL original desde los dos accesos y ejecutar **allí** lista, optimización 2D con veta/espesor/kerf/formato, etiquetas y presupuesto con precios documentados. Comparar antes/después: no asumir que abrir el diálogo ejecutó el motor.
- Exportar un lote pequeño, elegir en el portal los SKU/material/espesor/cantos del manifiesto e importar el TXT. Registrar captura/resultado y sentido de cada canto. No mandar un pedido productivo hasta comprobarlo; el validador sintáctico no acredita aceptación del portal.
- Exportar e imprimir A3 al 100%: una hoja por mueble, dos vistas, notas/flechas, cotas ocultas/movidas, IDs y cantidades, tabla completa y materiales opcionales. Revisar en particular los muebles de 23 y 164 piezas en compacto. Validar legibilidad visual, no solo ausencia de avisos.

Registrar diferencias con versión, modelo, pieza/ruta, valor esperado/obtenido y captura o diagnóstico. No hay aceptación manual fabricada ni estado de producción aprobado.

## Evidencia automatizada final

`npm run verify`: exit 0, 129 Ruby/853 assertions, 75 TS, 16 E2E web y 28 offline. Después del pulido visual de la ventana: lint/tipos/build offline y 28 E2E offline correctos, más dos comprobaciones de vista 2D/cierre dentro de pantalla. El caso real previo de ocho piezas mantiene A3/dos vistas/diez cotas/notas; replay privado de 23/164 piezas produce dos A3 en compacto; 27 pruebas Python/preflight correctas.

[Instalador 0.6.8](../artifacts/PlanosSanto-0.6.8.rbz): 1.598.616 bytes, SHA256 `c1f435cdae7e55c54b7ebb12c6edc1657eb1c7521a8fb3b3e36bad0f4a0960f3`. [58 sugerencias opcionales](../artifacts/catalogo-taller-sugerido-058.json), sin aprobar ni precios. [Informe completo](../artifacts/validacion-loop-ocl-068.json). Las versiones 0.6.6/0.6.7 están conservadas; no se publicó ni desplegó nada.
