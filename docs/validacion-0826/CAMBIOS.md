# Candidata 0.8.26 — vetas, Dibujar pieza, cabecera, nombres agrupados y preparación para SketchUp 2022

Base: 0.8.25 (`5ea204e`) más el WIP `e4f1479` (rama `codex/vetas-dibujo-componentes-0826`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp 2022 ni 2026: las pruebas usan dobles de la API, Ruby 2.7 y 3.3 fuera de SketchUp y Chromium 88 y 141 fuera de SketchUp.

## Qué estaba incompleto en el WIP

- **Vetas:** `grain.rb` y `piece_grain.rb` no estaban conectados (sin `require`, sin acción, sin interfaz). Nadie calculaba `grainAxis`: Piezas, el TXT y los optimizadores seguían usando el lado más largo.
- **Dibujar componente:** `offline.rb` requería `draw_component_tool.rb`, pero el RBZ no lo incluía, así que **la extensión no cargaba**. Además, la herramienta tenía estos problemas:
  - aplicaba dos veces la transformación del grupo abierto;
  - dejaba piezas espejadas al dibujar hacia el cuadrante negativo;
  - no usaba inferencias;
  - las medidas tipeadas perdían el sentido del mouse;
  - exigía un espesor menor que el ancho;
  - el nombre de la definición podía repetirse.
- **Cabecera:** el CSS ocultaba el estado de guardado y el motivo de bloqueo.
- **Nombres:** el agrupado comparaba la malla, que cambia entre definiciones, así que nunca agrupaba piezas de definiciones distintas. Las piezas con funciones distintas quedaban fusionadas como «Panel», y las ediciones se indexaban por fila.
- **SketchUp 2022:** no había nada. La 0.8.25 fallaba en el primer pedido a Ruby en Chromium 88 (`crypto.randomUUID`), y `Hash#except` (Ruby 3.0) rompía, sin avisar, «Quitar canto» y la reanudación de pintura con Ruby 2.7.

## Cambios

1. **Vetas**
   - **Criterio:** las piezas verticales (puertas, laterales) siguen la altura; las horizontales, el lado más largo. Una sola fuente, `Grain.info`, decide el eje automático o el manual (atributo `PlanosSantoGrain/axis_v1`).
   - **Un solo largo para todo:** el eje llega al análisis, a Piezas, al pedido, al TXT de la maderera y a los dos optimizadores con la misma regla: **largo = a lo largo de la veta**, sin rotar.
   - **En Piezas:** cada fila muestra la veta (↕/↔, automática o manual) y tiene «Girar veta 90°» y «Veta automática», que valen para todas las piezas de la fila. Todo es una sola operación de Deshacer; si algo falla, se aborta.
   - **Textura:** se alinea la U de la textura con la veta (`position_material`). Los cantos y las testas no se tocan.
     - Si una cara hereda el material del contenedor, se pinta explícitamente con la misma placa sólo la cara ancha frontal, y se avisa.
     - Una instancia compartida se aísla; si el contenedor también está compartido, se bloquea con el motivo.
   - **Casos dudosos:** una pieza horizontal cuadrada, una vertical más ancha que alta (frente de cajón, zócalo), una pieza inclinada o un mueble acostado reciben el aviso «revisar». No se bloquean.
   - **Pedidos guardados:** si tienen otro eje, manda el modelo. Los cantos y cortes editados se trasladan.
2. **Dibujar pieza** (reemplaza el diálogo «Crear componente»)
   - **Flujo:** esquina sobre una cara o el suelo, rectángulo, espesor. Las flechas fijan el plano.
   - **Medidas exactas:** `600;400`, `600;400;18`, `18`, con las unidades del modelo. Se pueden corregir justo después de crear.
   - **Resultado:** una sola operación de Deshacer, y un componente independiente seleccionado, con nombre único. Esc cancela sin tocar el modelo.
   - **Contexto:** la pieza queda en el contexto de edición activo. Si el contenedor está bloqueado, o si el modelo o el contexto cambian, se cancela.
3. **Cabecera**
   - **Una fila:** logo, módulo, recuadro del proyecto, «Guardar guía» con su estado, «Exportar PDF A4» y «⋯ Opciones».
   - **Recuadro del proyecto:** nombre del modelo, versión y estado con su color, más el motivo de bloqueo.
   - **«⋯ Opciones»:** opciones de guardado, Plegar, último aviso y ayuda.
   - **Se conserva:** todos los atajos y los nombres accesibles. A 650 px de ancho pasa a dos filas.
4. **Sugerencias de nombres**
   - **Qué se agrupa:** piezas físicamente iguales, aunque sean de definiciones distintas: medidas ±0,5 mm, material, veta, espejo y forma. Cada fila muestra «×N» y el nombre se aplica a todas sus piezas.
   - **Qué no se agrupa:** una fila por clasificación, así un Lateral y un Divisor iguales quedan separados.
   - **Ediciones:** se guardan por pieza. Al agrupar piezas con ediciones distintas, quedan separadas y se avisa.
5. **SketchUp 2022** (preparado, **no probado**; detalle en `SKETCHUP_2022.md`)
   - Ruby: la versión de SketchUp 2022 es 2.7.2. Se reemplazó `Hash#except`.
   - Navegador: CEF/Chromium 88. Esbuild pasa de `chrome109` a `chrome88`.
   - Polyfills: `crypto.randomUUID`, `structuredClone`, `.at`, `findLast` y `Object.hasOwn`.
   - CSS: respaldo para `:has()`.
   - Números: agrupación de miles manual en es-AR.
   - Chequeos automáticos nuevos: `check:ruby27` (sintaxis 2.7, métodos de Ruby 3 y API de SketchUp 2023 o posterior sin protección) y el piso del bundle en cada build.
   - Diagnóstico: ahora informa `cefVersion` y `chromeVersion`.
   - El manifiesto declara «SketchUp 2022-2026», con la leyenda «2022 sin probar».
6. **Prueba de rendimiento Experto**
   - Antes medía el reloj y fallaba con la máquina cargada, sin cambios en el motor.
   - Ahora exige el límite documentado de planes: 90 con giro y 40 sin giro. El reloj queda como control grueso de 8 s.

## Se conserva

- El motor Experto de 0.8.24 y 0.8.25 y el motor General.
- Materiales, cantos, pintura, A4, notas, cámaras y herrajes.
- La biblioteca v4: no cambia su formato.

## Límites y pendientes

- Las vetas suponen que la U de la textura es la dirección de la fibra. `PhotoMaterial` la deja así, pero no está comprobado con SKM o texturas de terceros.
- El frente de cajón vertical sigue el criterio confirmado («vertical en puertas y laterales»), pero queda marcado para revisar. **Falta confirmar con el taller si los frentes de cajón van con veta horizontal.**
- En Dibujar pieza no se implementó el bloqueo de inferencia con Shift, y la vista previa es sólo de líneas.
- Para SketchUp 2022, ver los riesgos y las pruebas M1–M15 en `SKETCHUP_2022.md`.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
