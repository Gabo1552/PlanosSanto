# Planos Santo 0.8.17 — pintura y materiales como OpenCutList

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

Responde a lo que Gabriel reportó con la 0.8.16 en SketchUp 2026. Replica el comportamiento y la estética de OpenCutList escribiendo de cero, sin copiar su código ni sus íconos.

## Pintura en la vista

| Reporte | Causa encontrada | Corrección |
|---|---|---|
| «No cambia de placa a canto; ni el clic ni Tab» | Al pasar a canto se buscaba el último canto usado. Si no estaba instalado en ESTE modelo, el cambio de modo fallaba entero | El modo cambia siempre. Sin canto elegido, muestra la tira de cantos para elegir |
| «Detené Pintura Inteligente antes de guardar…» | Guardar, la biblioteca, el pedido y las fotos exigían detener el pincel a mano | El pincel se detiene solo, avisa en la barra de estado y la acción sigue. Generar guías no lo detiene, porque sólo lee el modelo |
| «El pintado se detiene de vez en cuando» | Seis causas: (a) el análisis automático de la 0.8.15 detenía el pincel en cada reanálisis; (b) la regeneración de guías; (c) cerrar la ventana o la paleta; (d) cambios sin guardar en la biblioteca; (e) elegir un material en la bandeja, que activa el Bote de pintura de SketchUp; (f) errores no rescatados en los callbacks | Corregidas las seis. El pincel sólo se detiene con Esc, otra herramienta o al cerrar el modelo. Si el material de la bandeja es de la biblioteca, el pincel vuelve solo |
| Interfaz como la captura de OpenCutList | — | Barra oscura arriba: «PINTAR», con pestañas Pintar piezas, Pintar cantos y Quitar canto, y la activa en naranja. «Cantos por clic 1 2 4». Tira inferior con «Ningún material» y una celda por material, con el borde naranja en la elegida. Escala con el escalado de Windows |

## Materiales

| Reporte | Corrección |
|---|---|
| «Revisá la vinculación de este material…» | Tenía cinco causas ocultas: UUID copiado al duplicar o pegar, ficha borrada, ficha reclasificada, textura o escala cambiada y atributo ilegible. Ahora se resuelve sola al abrir Materiales, al elegir el material para pintar y al elegirlo en la bandeja: primero por el atributo propio, después por el nombre único, y los vínculos rotos se reparan. Sólo queda un aviso, con un botón por ficha, si hay ambigüedad real (dos fichas con el mismo nombre). No toca los valores de OpenCutList puestos por el usuario |
| Espesores predeterminados | Placa: 3, 5, 12, 15, 18 y 25 mm. Canto: 0,45 y 2 mm. Son una lista editable por ficha («Espesores estándar» con + y −) y los predeterminados se pueden cambiar en `presets-taller.json`. El esquema de la biblioteca pasa a la v3, con migración automática y copia de seguridad de la v2. **La 0.8.16 no abre una biblioteca v3: no vuelvas a la 0.8.16 después de guardar con la 0.8.17** |
| Ficha fea e impráctica | Grilla agrupada por tipo (Placas, Cantos, Otros, Sin tipo), con tarjetas cuadradas de textura o color y el nombre sobre un degradado. «Propiedades del material» tiene pestañas General (nombre, color, descripción, SKU, proveedor y tipo; Formatos con fibra, espesores con + y −, tamaño de panel o ancho de canto; Precio) y Textura (foto, escala y giro). Pie: archivar, Duplicar, Exportar, Cancelar y Aplicar. Si la ficha está incompleta se avisa sin bloquear |

## Cómo validarla

Igual que la 0.8.16 (`docs/validacion-0816/ANEXO_0816.md`), instalando `dist/PlanosSanto-0.8.17-candidata.rbz`. **Antes de instalarla, respaldá `%LOCALAPPDATA%\PlanosSanto\`**, porque la biblioteca migra a v3. Se agrega:
1. **Pintura:** casos W1–W16 de la §0.8.17 de `docs/pintura-en-vista/VALIDACION_SKETCHUP.md`. Los críticos:
   - pasar de placa a canto con clic y con Tab (W1–W2);
   - pegar un material y guardar sin detener el pincel (W4);
   - 20 clics seguidos con la ventana principal abierta, sin cortes (W7);
   - elegir en la bandeja Materiales y seguir pintando (W9);
   - nitidez al 100 %, 125 % y 150 % (W11).
2. **Vinculación automática:**
   - duplicar un material en SketchUp: los dos quedan bien vinculados;
   - pegar un mueble de otro modelo: se vinculan solos;
   - dos fichas con el mismo nombre: un aviso con botón, y un clic lo resuelve;
   - Ctrl+Z deshace la vinculación automática en una sola entrada.
3. **Ficha:**
   - crear una placa nueva: trae los 6 espesores;
   - crear un canto: trae 0,45 y 2;
   - agregar 9 mm con +, elegirlo, Aplicar y reabrir;
   - Cancelar y Escape no guardan.
4. **Migración:**
   - abrir la biblioteca existente: las fichas conservan su espesor y suman los predeterminados de su tipo;
   - aparece `catalog-v2-premigracion-*.json` en `backups`.
