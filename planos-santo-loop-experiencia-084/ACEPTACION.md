# Criterios de aceptación — loop UX materiales y pintura

**A. Fotografía/miniatura/realidad**
- [ ] Nueva foto PNG/JPG produce material real de SketchUp con textura visible en cara pintada y en tarjeta.
- [ ] Una sola imagen es origen común de textura y miniatura; al reemplazar imagen ambas se actualizan.
- [ ] Material se guarda/reabre en mismo SKP, se recupera desde SKM en otro modelo aun si el JPG original fue borrado.
- [ ] Importar los 35 SKM del usuario funciona sin pérdida ni duplicados; metadatos inciertos quedan pendientes.
- [ ] Alta desde foto se puede terminar sin precio ni SKU; material sigue bloqueado para producción hasta confirmación.

**B. Facilidad real**
- [ ] Abrir Pintar -> seleccionar último material -> clic en pieza; sin pantalla principal obligatoria.
- [ ] Creación desde foto a primer pintado en <=5 decisiones principales (sin contar navegación del explorador).
- [ ] Un clic por cara segura sin confirmación repetitiva; diez pintados seguidos deshacibles.
- [ ] Selector de materiales compacto, miniaturas visibles, filtros/favoritos y cuentagotas.
- [ ] Pintado de cantos 1/2/4 con preview correcto y errores de orientación bloqueados.
- [ ] Herramientas botón/menu/atajo consistentes; ESC cancela; barra funciona a DPI alto.

**C. No regresión**
- [ ] Borrar/cambiar textura no afecta otras piezas/materiales inesperadamente.
- [ ] Modelo original no recibe cambios en pruebas de nube (no hay ejecución de SketchUp en nube).
- [ ] TXT de proveedor usa EXACTAMENTE `cant\tbase\taltura\tdetalle\trota\tcanto_arr\tcanto_aba\tcanto_izq\tcanto_der` en ese orden y separado por material/espesor/perfil cantos, sin encabezado si así lo requiere el proveedor.
- [ ] Se mantiene bloqueo de TXT si material o orientación/cantos no están validados.
- [ ] Guías A4 297x210 mm, una o dos vistas, notas/flechas, sin regresión.
- [ ] Compatible con datos anteriores y OpenCutList como fuente legible, sin dependencia para pintar lo nuevo.

**D. Entrega**
- [ ] RBZ candidata con versión nueva/manifiesto/hash, log de cambios, fuentes compiladas, pruebas unitarias/integrales automatizadas.
- [ ] Capturas o maqueta de antes/después; medición de clics; pruebas negativas.
- [ ] `VALIDACION_DOT_LOCAL.md` completada cuando Dot tenga acceso real; hasta entonces estado pendiente.


## Evidencia de nube de la candidata0.8.5

Implementación y pruebas automatizadas aprobadas en RESULTADO.json y verify-fotos-085.log. Los checks de aceptación nativa permanecen abiertos: no se ejecutó SketchUp. GUIA_ENCARGADO.md y VALIDACION_DOT_LOCAL.md describen casos pendientes, incluidas fotos reales, SKM, modelo nuevo sinoriginal, Undo, reparación de vínculo comercial, cantos, TXT y A4. El contador de5decisiones es automatizado, no un ensayo con encargado ni explorador Windows. Los35SKM se analizaron en bibliotecaQA privada, no en Materials#load nativo. No producción aprobada.
