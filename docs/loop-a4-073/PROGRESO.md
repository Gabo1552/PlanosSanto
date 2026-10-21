# Candidata0.7.3 — remates de cotas sin oclusión

## Ciclo1 — evidencia recibida y causa exacta

Recibido `PLANOS-SANTO-071-RESULTADOS-LOCALES.zip`, SHA256b9361927a145dfa2524c4edc2ae97279767af755b277175c25b318dfd3daa5dc. Extraído sin sobrescribir y con validación de rutas/CRC a `fixtures/private/validacion-071-recibida` (ignorado porGit). No se ejecutaron scripts adjuntos ni se abrieron SKP en nube.

SKP original recibido conserva SHA2566be09dfb6a24872a28f9efe3b379644c0ee93b788272ec30e8edd146417eef22. PDF doble nativo071 SHA256b3436a02d15ba2252f6794fae0a38aa9e6c358143f8a69e62e5de8cef48b1abc.

PDF/recorte real confirman confusión visual, pero no un texto de cota incompleto: el fragmento está formado por ticks y trazos de35mm parcialmente tapados por la máscara blanca de800mm. Máscara800 operación521:(50.179,248.286)-(64.653,292.151)pt. Ticks35 operaciones474/475:(48.554,285.686)-(53.125,293.457)pt, más operaciones473/476. Eliminar sólo esas cuatro operaciones en memoria elimina el fragmento y conserva ambos textos.

La reproducción con JSON/guía reales y motor072 produce la misma zona píxel a píxel:072 NO corrige esta causa. Su protección ante líderes ID sigue vigente y atiende un defecto diferente.

## Ciclo2 — corrección y reproducción exacta

`makeDimensions` antes penalizaba pero permitía que una máscara tapara los remates de otra cota. Ahora se rechazan candidatos si la máscara oculta ticks o extremos medidos de otra, en ambos sentidos. Las líneas continuas pueden cruzar por debajo de fondos de texto como convención de dibujo; no se permite borrar sus extremos medidos ni marcas.

Si la búsqueda inicial no encuentra lugar, se prueban más separaciones y posiciones con líder. No se cambian valores, fuentes, visibilidad, anclas ni geometría. Los desplazamientos manuales también se verifican y bloquean exportación si tapan marcas.

Reproducción propia con JSON/guía nativos reales (sin ejecutar SketchUp):17piezas,8filas,misma cámara yaw-2/pitch10,zoom.7,ambas vistas,todas las cotas activas,3ocultas y misma nota. PDF generado073 cabe en una páginaA4. Comparación independiente confirma los mismos129fragmentos de texto y26textos de cotas (14exterior+12interior), ninguna omisión; desaparece fragmento junto800. La cota35 cambia de lugar y conserva texto/remates. Render y nota/flecha revisados.

Reproducción: `node --import tsx scripts/replay-bm17-071.ts fixtures/private/validacion-071-recibida artifacts/BM17-REPLAY-073.pdf`. Requiere datos privados recibidos, no incluidos en instalador ni fuentes públicas.

Pendiente: suite completa, pruebas de regresión públicas, paquete073 y nueva exportación nativa local. No se declara aceptación de producción.

## Ciclo3 — regresión completa y candidata

`npm run verify` terminó con código0:154pruebas Ruby/1005aserciones,119TypeScript,16integralesweb y39integralesoffline. Lint,compilación,tipos ypaquetes aprobados. Ocho pruebas nuevas públicas cubren ticks/extremos,comparación independiente por pares,tres orientaciones14/12cotas,medidas intactas,no mutación,bloqueo si no cabe y detección de desplazamiento manual sobremarca.

Nueve pruebas Python/contrato ybaseline0.6.8/nueveSKP intactos. `scripts/verify-bm17-replay.py` compara PDFnativo071 conreproducción073:129spans/26cotas idénticos,1A4,originalhash coincide. Se inspeccionó el render073; fragmento eliminado,35recolocada,nota/IDs visibles.

RBZ073 CRC ymanifiesto aprobados; sin SKP privados. Hash/tamaño en artifacts/validacion-a4-073.json. Los datos privados y PDFreproducido se conservan fuera del paquete de código; no se ejecutaron los scripts adjuntos ni SketchUp en nube.

Estado:**NEEDS_USER**, sólo queda la nueva instalación/exportación nativa073 y aceptación local. Evidencia de reproducción con datos reales completada; no se confunde con una corrida nueva de SketchUp.
