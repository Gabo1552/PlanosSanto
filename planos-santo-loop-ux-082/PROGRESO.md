# Registro de avances del loop UI/UX 0.8.2

## Estado inicial
- Paquete generado a partir de archivos proporcionados por el usuario; **NO se implementó todavía el rediseño en código del proyecto**.
- 35 SKM inventariados; 12 nombres candidatos de canto; tipos/medidas por nombre NO validados.
- RBZ 0.8.2 de referencia auditado estáticamente; estado del repositorio de Codex en la nube todavía por comprobar.

## Por ciclo
Para cada ciclo, anotar: fecha, commit/base, objetivo, archivos cambiados, pruebas ejecutadas y salidas, capturas, bloqueos, próximo paso. Nunca afirmar validación en SketchUp sin prueba local.

## Ciclo A — base actual preservada

Fuentes actuales0.8.3, no0.8.2. Se preservan RBZ083 SHA2567d2d6c47fdc70245ede3c7c96d42dc7e943b7c55081082605428b99a97181b54 yfuentes/pruebas083. Git sincommits/sintracking; no se crean commitsmasivos. Referencia082 sololectura, no se instala ni sustituye. ZIP extraído sin sobrescribir; wireframeindependiente idéntico al incluido.35SKM reales confirmados dentro del ZIP privado; referencias/capturas/inventarios excluidos deGit ypaquetes.

Yaexistían barra rápida,cuentagotas,generaciónA4ycontroles deconfirmación; se integran, no se rehacen. Capturasantes conbundle/Ruby083 congelados,fixture sintéticoidéntico paraInicio/Materiales/Pintura/Muebles/Maderera/Guías1280x720. No son capturas deSketchUp ni modelos reales. Baselineprevio verify310Ruby/2175,138TS,16web,56offline exit0, logs083 conservados.

Desarrollo coordinado en paralelo: shell/catálogoUI,importadoracotadoSKM,iconos/paleta,comparativas,resaltadoreadonly. Motores degeometría/pintura/renombrado/TXT/PDF permanecen como base.

## Ciclos B–D — integración funcional

Implementados cinco destinos sobre el editor existente: Inicio, Materiales, Muebles, Maderera y Planos A4. Shell persistente mantiene contexto y borradores al abrir paleta; Maderera reutiliza el panel y motor anteriores, y Muebles/Planos comparten geometría y estado. Controles secundarios permanecen accesibles. Iconos lineales originales, grafito y ámbar, 24/32 locales. Máximo ocho visibles entre las dos barras: principal y siete herramientas; cuentagotas conserva menú/atajo y paleta.

Biblioteca visual conecta CatalogStore/MaterialLibrary con importación ZIP/carpeta/SKM individual. Vista previa de solo lectura, selección, miniaturas embebidas raster, sugerencias sin verificar, duplicados por SHA y conflictos con nombre nuevo explícito. Commit de candidatos unknown/approved=false mediante transacción/revisión/backup existentes; archivos privados en repositorio local por SHA, no en RBZ. La carga nativa posterior usa MaterialLibrary.install únicamente tras aprobación y confirmación explícitas. No carga SKM en el modelo para mostrar tarjetas.

Importador acotado de ZIP/XML/imágenes, sin extracción de rutas ni código externo, CRC de entradas incluido contenido de textura; REXML perezoso con error de función si falta, sin bloquear arranque del resto. Presupuesto de miniaturas 8MiB y límites de lote. Muestra fallback real cuando no hay imagen utilizable, sin gradientes simulando texturas.

Ensayo privado repetido sobre los 35 SKM del usuario: 35 miniaturas reales, 35 candidatos pendientes, todos los campos técnicos sin verificar. Otra instancia del servicio recupera biblioteca; reimportación35duplicados/0nuevos/revisión intacta; ZIP malformado no daña catálogo y fuente original conserva hash. Biblioteca QA aislada en fixtures/private, no producción. Evidencia de entrega solo conteos sanitizados, no nombres/imágenes/bytes privados. No SketchUp ejecutado.

Resaltar en SketchUp implementado como Tool de lectura de una ruta de instancia, reutiliza overlay/mallas transformadas; no cambia selección, contexto, dimensiones, geometría o Undo. Esc/clic finaliza. Ocho pruebas de herramienta/65aserciones; importador25/133; controlador10/63. Errores iniciales del doble de modelos sin API materials/name se corrigieron usando modelo vacío con API de materiales, sin cambiar la implementación del producto para ocultarlos.

Pruebas dirigidas de biblioteca detectaron retorno de foco tras Escape antes de quitar disabled; se corrigió mediante efecto posterior al render, sin relajar el criterio. Pruebas previas a1000px detectaron apilamiento que separaba vista y nombre: CSS corregido para conservar dos columnas a1000 y apilar en ventanas pequeñas. Regresiones y comparativas finales en curso; logs iniciales conservados. No se anuncian aprobadas las funciones nativas pendientes de Dot.


## Ciclos E–F — regresión y entrega de candidata 0.8.4

Corregidos foco tras cancelar importación, conservación del mensaje de carga y controles que desplazaban el dibujo. El arrastre de cotas se interrumpía por selección nativa de texto SVG; se desactivó esa selección en el dibujo manteniendo el arrastre y los nombres editables. Se añadió acceso a cinco muestras recientes de la sesión, filtradas por tipo/aprobación vigente, sin persistir autorizaciones.

La primera verificación integral detectó una expectativa antigua del test names:36: dibujo a la izquierda del campo. El diseño solicitado lo ubica a la derecha en ventanas amplias. Se adaptó únicamente el assert de separación a ambas disposiciones, manteniendo límites visibles, solapamiento vertical, foco y todas las comprobaciones de nombres, una operación, geometría y reapertura. Log inicial conservado en verify-ux-084-inicial.log.

Verificación final: `npm run verify`, exit0. 353 pruebas Ruby / 2495 aserciones / 30 suites; 139 pruebas TypeScript; 16 web y 67 editor offline. Lint, compilación y tipos aprobados. Auditoría RBZ:48 archivos,47 hashes de payload,24 comprobaciones de sintaxis Ruby/JS, CRC correcto;11 servicios nativos de negocio idénticos a0.8.3, ningún archivo anterior eliminado y baseline intacta. Tres PDF sintéticos de17piezas: exterior/interior/doble, una hoja297×210mm cada uno.

Comparativas con el mismo fixture sintético y bundle/Ruby0.8.3 congelados: cinco módulos, paleta e iconos. Pruebas de teclado, foco y seis combinaciones de tamaño/zoomCSS; no se presentan como DPI Windows ni pruebas de operario. Galería ux-084-comparacion.html y evidencia sanitizada de35SKM incluidas. Los materiales, texturas, inventarios y capturas privadas se excluyen del RBZ/fuentes/entrega.

RBZ SHA256 `68f3417ff77eae10f5f78c374de1c1729c48040b32bfc391aa722787d889935b` (1695168bytes). Instrucciones de instalación, rollback y casos nativos reproducibles en VALIDACION_LOCAL_POSTERIOR.md. Estado CANDIDATA_PARA_VALIDAR; sin ejecución SketchUp en nube ni aprobación de producción.

Reconstrucción de fuentes en directorio limpio:339 pruebas Ruby offline/2425 aserciones/27 suites PASS y RBZ byte a byte idéntico al entregado; dependencias locales reutilizadas. No equivale a instalación SketchUp. Auditoría de privacidad por hashes:74 activos privados comprobados y0 coincidencias en los archivos descomprimidos de entrega, incluidos ZIP/RBZ anidados. CRC y SHA256SUMS correctos.
