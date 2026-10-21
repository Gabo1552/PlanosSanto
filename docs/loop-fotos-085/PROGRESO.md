# Progreso de fotos y pintura 0.8.5

## Ciclos 2–6 — candidata 0.8.5

Implementados PhotoMaterial, política diseño/comercial, miniatura nativa+SKM privado y flujo UI +Material/Guardar y pintar. Root controlador valida modelo, selección Ruby, token y revisión; conserva espera humana del picker y cancelación. Catálogo con locks/backups/rollback de modelo y dos índices; archivos por hash fuera de entrega. Permiso diseño no modifica approved de maderera. Fotos guardadas se cargan en otro modelo aun sin imagen original. Reemplazo genera nueva versión, no cambia caras antiguas.

SmartPaint/NativePaint reutilizados: Cara/Pieza, cantos1/2opuestos/4, preview expandido, único seguro, guardas compartidos y escala física, teclado contextual/Undo. Paleta compacta, frecuente/favoritos/recientes, último material seguro y alta desde foto. Identidad verde/crudo/madera con iconos originales. A4, nombres, TXT nueve columnas y anotaciones conservados.

Errores corregidos durante pruebas: preview/modelo fixtures sin APIsUV y directorio de catálogo; harness .tsx temporal contaminaba typecheck (movido fuera del proyecto); retorno de Guardar y pintar competía con refresco readonly; faltaban filas de miniaturas fotográficas y carga del SKM de diseño en otro proyecto; reutilización después de reemplazar confundía versiones antiguas; ficha comercial editada invalidaba vínculo sin vía de reparación. Reparación ahora requiere confirmación explícita de vínculo y activo, sin sincronización silenciosa. El selector nativo explica JPG/PNG. Logs iniciales y notas de pruebas conservados.

Pruebas finales `npm run verify`, exit0: 410 Ruby/2889 aserciones/34 suites, 140 TypeScript,16 web y76 offline. Lint/build/typecheck PASS. Nuevas pruebas incluyen fotos25/196, política10/65, controlador10, cantos9, Tool19 y4 recorridos UI. Comparativas con Ruby/UI0.8.4 congelados y mismo fixture sintético;5decisiones desdeMateriales para crear/pintar, sin afirmar exploradorWindows ni tiempos humanos. Galería HTML/PNG y hashes incluidos.

Los35SKM reales:35miniaturas,35candidatos noaprobados,35duplicados/0nuevos y revisión intacta al reimportar; biblioteca QA aislada, originales sin cambios. Prototipo con imágenes embebidas, texturas, SKP/SKM/inventarios privados y referencias se excluyen de Git y paquetes. Tres PDF A4 sintéticos de17piezas: una hoja297×210mm por modo, no BM17 nativo.

RBZ50archivos/49hashes de payload/CRC correcto; nueve servicios nativos de nombres/maderera/guías/importador idénticos a0.8.4, ningún archivo previo eliminado. SHA256 `2ab072647d7b042b6a5ee39af91d93ce3eb8787931f3f44924ba166b052fd997` (1712222bytes). Baseline0.8.4 intacta. Estado CANDIDATA_PARA_VALIDAR: nube sin SketchUp, pendientes textura/cargaSKM/Undo/reapertura/toolbar/DPI reales y aceptación comercial; guía de encargado e instrucciones Dot incluidas.

Reproducción limpia desde ZIP: 396 pruebas Ruby/2819 aserciones, 31 suites PASS; buildRBZ byte a byte idéntico, dependencias locales reutilizadas. No es instalación SketchUp. Auditoría de privacidad y CRC/hash de archivos anidados PASS.
