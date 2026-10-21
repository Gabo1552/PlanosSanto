# Rediseño funcional — candidata 0.8.4

La versión se construye sobre las fuentes 0.8.3, manteniendo sus motores y contratos. La referencia 0.8.2 adjunta no sustituye código. La nueva navegación tiene cinco destinos reales: Inicio, Materiales, Muebles, Maderera y Planos A4. Pintar abre la paleta compacta sobre el modelo nativo, sin crear un viewport ficticio. El contexto y los borradores se mantienen al alternar secciones.

## Funciones integradas

Materiales muestra fichas globales con búsqueda/filtros/favoritos, estado y medidas pendientes o verificadas por el usuario. Distingue biblioteca del taller y materiales cargados en el modelo. Las miniaturas vienen de los SKM cuando existen, con fallback explícito; no se inventan texturas ni se descargan imágenes. El editor anterior de fichas/aprobación y las opciones avanzadas permanecen accesibles.

Importación ZIP/carpeta/SKM individual: análisis de solo lectura acotado, selección/preview, duplicados por SHA, conflictos con renombrado explícito y publicación mediante CatalogStore revisionado/con lock/backups. Todo candidato ingresa unknown/approved=false y conserva campos técnicos sin verificar. La procedencia está en observed y el original SKM se archiva por SHA en carpeta local privada. No se extraen rutas internas ni se usan para buscar imágenes. Cargar material aprobado en el modelo requiere una acción y confirmación explícitas, mediante MaterialLibrary actual.

La paleta reutiliza SmartPaintTool/SmartPaint/NativePaint, su Undo y controles de instancias, caras físicas y UV. Destaca modo/material, muestra miniatura raster real cuando hay y no autoriza compartidos por recordar una selección. Cuentagotas conserva selección exacta por UUID; materiales no aprobados/heredados se explican sin aprobarlos. Resaltar una pieza usa una herramienta de solo lectura por ruta de instancia, sin cambiar geometría, selección, contexto o Undo.

Iconos lineales originales 24/32 locales. Dos barras opcionales conservan posiciones/visibilidad: principal 1 y herramientas 7, ocho accesos visibles en total; cuentagotas continúa en menú/paleta con atajo/estado. Comandos y botones navegan a funciones reales. Maderera no exporta por el simple acceso, y Planos no genera PDF automáticamente.

## Evidencias y reproducción

El paquete incluye logs, fuentes/pruebas, galería HTML y capturas comparativas sintéticas antes/después de la UI0.8.3 congelada. Mismo mueble enL de dos tablones, mismo catálogo QA y ventanas1280 × 720; materiales también1920 × 1080, paleta440 × 760. Seis combinaciones de zoomCSS100/125/150% y tamaño, teclado/foco y contraste medido. El tiempo de búsqueda registrado es de automatización, no de un operario.

Importador probado además con los35 SKM reales en un catálogo QA privado, sin SketchUp:35 miniaturas embebidas,35 candidatos pendientes, reimportación35 duplicados/0 nuevos/revisión intacta, reapertura por otro servicio y rechazo de ZIP inválido sin dañar el catálogo. La evidencia pública solo contiene conteos sanitizados. Los originales, miniaturas privadas y catálogo QA no están en el RBZ ni ZIP de fuentes/entrega.

Resultados finales y SHA se encuentran en RESULTADO.json y validacion-ux-084.json. `npm run verify` reproduce Ruby/TypeScript/build/web/editor offline; requiere Node 24, Ruby 3.2+, Python3, Chromium y Poppler. El fixture0.5.3 dentro de fuentes es solo para warm_update_test, no debe instalarse. `PLANOS_VALIDATION_KIND=ux python3 scripts/package-paint-validation.py` empaqueta una vez presentes estado/logs verificados.

## Lo que necesita SketchUp

No se ejecutó SketchUp 2026 desde nube. Instalar y comprobar barras, docking, atajos, picking, resaltado, pintado/UV/Undo y carga real de SKM requiere Codex local/Dot. Probar REXML del Ruby instalado; si falta, la importación informa el problema y no bloquea otras funciones. Se entregan instrucciones de rollback y ensayos nativos en VALIDACION_LOCAL_POSTERIOR.md.

La aprobación comercial de materiales/SKU, veta, perfil sin OpenCutList, rendimiento grande y proveedor sigue pendiente. La prueba nativa del diálogo PDF abierto 158 s también debe repetirse. No hay aprobación de producción, optimizador ni nuevas funciones de presupuesto en este ciclo.
