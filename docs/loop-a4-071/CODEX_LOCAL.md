# Validación local de la corrección 0.7.1

La candidata 0.7.0 permanece **no aprobada** por el renombrado implícito. Las pruebas A4 reales recibidas son evidencia válida de esa versión, no una aceptación automática de0.7.1.

1. Guardá evidencia del fallo y conservá intactos el original BM17 y la copia problemática. No sigas guardando con0.7.0 sobre la única copia buena.
2. Instalá `PlanosSanto-0.7.1.rbz` desde Administrador de extensiones. Cerrá TODAS las ventanas y reiniciá SketchUp. Comprobá versión y hashes. No cargues fuentes anteriores ni el runner de diagnóstico antiguo.
3. Abrí una **copia nueva del original intacto** BM17 (SHA conocido `6be09dfb6a24872a28f9efe3b379644c0ee93b788272ec30e8edd146417eef22`). La corrección no intenta reconstruir nombres ya sobrescritos por0.7.0. Para recuperar una copia afectada, usá Undo mientras siga disponible o la copia anterior/evidencia original, después de preservar el archivo problemático.
4. Capturá los nombres físicos y `guide_v1` antes de activar agrupación. Confirmá las rutas informadas:22/51,22/108,22/137,22/255/256 y las bisagras; verificá también las restantes piezas.
5. Activá Agrupar componentes iguales. **No edites ningún nombre ni obra/módulo.** Guardar guía+SKP. Compará todos los nombres físicos y bases: deben permanecer idénticos. La tabla usa el primer nombre como referencia con cantidad; eso no se aplica a los nombres de las instancias.
6. Cerrá/reabrí SKP, generá guía y desactivá agrupación. Deben reaparecer los nombres individuales originales. Guardá y compará nuevamente. Cámara, notas, cotas y visibilidad de guía deben conservarse.
7. Activá agrupación y editá explícitamente una fila, por ejemplo «Lateral». Al guardar con sincronización, sólo los miembros de esa fila deben adoptar ese nombre. Probá Undo: debe restaurar el estado anterior de la guía y los nombres. Verificá piezas ajenas intactas.
8. Repetí la exportación A4 exterior y doble con los ajustes que funcionaron: yaw-2°,pitch10°,zoom0.7 para la doble. Conservá todas las cotas activas para comparar. Comprobá17unidades en tabla, puertas/bisagra ocultas sólo interior, flecha/anotación y tamaño exacto297×210mm/1página.
9. Verificá geometría/visibilidad originales, guardado/reapertura, materiales/cantos, nombres con prefijos y TXT de nueve columnas. Los bloqueos de composición anteriores deben seguir informándose, sin recortar ni generar páginas extra.

Se incluyen `validar_instalacion.rb` (sólo lectura, ahora versión0.7.1), `inspeccionar_pdf.py`, fuentes y pruebas. El helper Ruby verifica manifest instalado y captura geometría/visibilidad; los nombres se capturan en `instance_names` y bases/guía en `guide`. `after` registra diferencias de nombres para revisión; no las da por aprobadas cuando se trata de una edición explícita autorizada.

Devolvé versión/hash, nombres por ruta antes y después, `guide_v1`, resultado de cada paso, PDF y cualquier bloqueo. No aprobar producción si se vuelve a cambiar un nombre sin edición explícita. Las pruebas nativas de esta candidata están pendientes.
