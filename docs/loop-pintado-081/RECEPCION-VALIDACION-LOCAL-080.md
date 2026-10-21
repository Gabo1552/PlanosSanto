# Recepción de evidencias nativas080 — subconjunto validation-080.zip

Recibido ZIP31400443bytes, SHA256 `f2f4ec719c837fd944690f481a01eb0271ac49d831c71972b554eb02e409e7d7`. CRC correcto;81entradas(76archivos/5carpetas). Extracción sin sobrescribir ni ejecutar scripts en fixtures/private/validacion-080-recibida, excluida de Git.

## Integridad y cobertura recibida

75archivos presentes coinciden con el manifiesto de93entradas;18referencias externas no están en este recorte. El propio manifiesto no se incluye en su lista de hashes. No hay discrepancias entre hashes de archivos presentes. No se confunde el hash de este ZIP con el paquete original de94archivos que no pudo transferirse.

El informe es idéntico al texto recibido previamente. suite-summary.json informa53PASS y1FAIL adicional de preferencias;6UI PASS y1inconclusa, por separado. Se inspeccionaron directamente15NativePaint+8biblioteca+18SmartPaint=41casos detallados PASS. Los12restantes(BM17/regresiones generales) están referenciados por el resumen, pero sus dos result.json originales no se incluyeron: no se cuentan como archivos detallados revisados en nube.

## Comprobaciones realizadas aquí

- Se abrieron ambos PDF nativos recibidos: exactamente una página297x210mm, texto de17unidades y nota PRUEBA080.
- Se revisó la captura nativa de las dos superficies cyan seleccionadas en modo lote.
- Comparación de snapshots recibidos: cola pendiente, Undo simple, Undo de lote y cierre de ventana restauran/conservan íntegramente el snapshot inicial.
- En el clic simple solo difieren22/50/face/45 y22/51/face/45; geometría, materiales de biblioteca y atributos permanecen iguales.
- preference-regression.json contiene expectedSubset configurado y actual{}, passedfalse. console-final.txt contiene8registros SyntaxError y8referencias a smart_settings. BUG-PREFERENCIAS-080.txt concuerda con la corrección implementada081. El fallo es del producto080, no del harness.
- smart-persistence.json documenta UV/UUID conservados al reabrir; a4-persistence.json documenta guía/diagnóstico conservados. final-integrity.json informa24payloads instalados sin fallos y originales intactos; los originales SKP externos no forman parte de este subconjunto y no se rehashearon aquí.

Estas son inspecciones de archivos/evidencia de ejecuciones locales. No se ejecutó SketchUp ni scripts adjuntos en la nube.

## Estado vigente

0.8.0 conserva53PASS/1FAIL reportados, sin aprobación global. La0.8.1 contiene el arreglo de preferencias y sigue pendiente de repetirlo en SketchUp real, incluyendo cierre/reapertura y exclusión de permisos. Este ZIP es evidencia de080, no aprobación de081.

Los modelos de ensayo recibidos permanecen privados; no se incorporaron a distribuciones ni código de producto. No se modifica el RBZ ni se genera otra versión por esta recepción. Resúmenes verificables en artifacts/recepcion-validacion-local-080.json, recepcion-080-hashes.json y recepcion-080-snapshots.json.
