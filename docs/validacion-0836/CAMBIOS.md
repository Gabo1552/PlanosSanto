# Candidata 0.8.36 — herrajes calculados por el nombre de las piezas

Base: 0.8.35 (`88185b0`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Qué había

Los herrajes se cargaban a mano: Piezas solo listaba placas y cantos, y el paquete de obra no llevaba herrajes.

## Cambio

Paso 1 de herrajes: **lista calculada, sin dibujar nada en el modelo.** Cada pieza con nombre de puerta o de frente de cajón suma sus herrajes.

| Pieza | Herrajes | Regla (a confirmar con el taller) |
|---|---|---|
| «Puerta» | Bisagras de cazoleta 35 mm | Según el alto de la puerta en el mueble: hasta 900 mm, 2; hasta 1500, 3; hasta 2000, 4; más, 5 |
| «Puerta» | Tirador | 1 por puerta |
| «Frente cajón» o «Fte» | Par de correderas | El largo más grande entre 300, 350, 400, 450 y 500 mm que entra en la profundidad del mueble menos 50 mm |
| «Frente cajón» o «Fte» | Tirador | 1 por cajón |

- **Cómo reconoce la pieza:** por el nombre, con o sin obra y módulo delante («AB M01 Puerta»). «Lateral cajón» y «Fondo cajón» no suman. Si el mueble tiene «Fte», la «Del Caj» se toma como la delantera de la caja y no suma; sin «Fte», la «Del Caj» cuenta como frente.
- **Medidas:** el alto de la puerta y la profundidad del mueble salen del mueble generado, con el frente confirmado (las mismas cotas totales del A4).
- **Fichas de la biblioteca:** el nombre y el SKU salen de la ficha de herraje cuyo nombre diga «bisagra», «corredera» con su largo (en el nombre o en el largo de la ficha), o «tirador»/«manija». Si hay varias posibles se usa la favorita. Sin ficha, queda el nombre genérico con el aviso «Sin ficha en la biblioteca».
- **Piezas:** nueva sección «Herrajes según el nombre de las piezas», debajo del resumen, con la cantidad, las piezas que los llevan, los avisos y el lápiz para editar la ficha. Sigue al filtro de mueble (la búsqueda no la filtra).
- **CSV:** una fila «Herraje» por herraje de cada pieza (ficha, designación, mueble, códigos, cantidad y largo de corredera).
- **Paquete de obra:** cada mueble lleva `herrajes` (nombre, SKU, cantidad, unidad `u` o `par`, largo y piezas). Es un campo opcional: no cambia el esquema `planos-santo.obra.v1`. Documentado en `docs/integracion-app-santo/OBRA_JSON.md`.
- **Avisos:** puerta más ancha que alta (puede ser rebatible: las bisagras irían arriba), mueble sin profundidad suficiente para la corredera más corta y piezas sin mueble generado.

## Pruebas nuevas

- `tests/hardware.test.ts` (11): reconocimiento por nombre, tabla de bisagras en los bordes (900, 901, 1500, 2000, 2001), largo de corredera, puerta medida en el mueble, puerta rebatible, «Fte» y «Del Caj», sin muebles generados, mueble poco profundo, fichas (palabra, largo, favorita, varias, otro tipo), filas del CSV y herrajes del paquete de obra (incluye rechazar un herraje de una pieza de otro mueble y aceptar paquetes de 0.8.35 sin herrajes).
- `tests/offline/piezas.spec.ts`: una pieza llamada Puerta en el controlador Ruby real con dobles de la API muestra bisagras con la ficha creada en la biblioteca y el tirador sin ficha, pasa axe, se va al elegir el otro mueble, y aparece en el CSV y en el paquete de obra.
- `docs/integracion-app-santo/ejemplo.obra.json` regenerado por la prueba.

## Qué se conserva

- No se toca el modelo, la guía, el pedido ni la biblioteca: es una lista de lectura.
- Placas, cantos, Maderera y optimización siguen igual. Los herrajes no entran en el pedido a la maderera.
- Paquetes de obra de 0.8.35 (sin `herrajes`) siguen siendo válidos.

## Límites

- **Las reglas son una propuesta:** las cantidades y largos de la tabla hay que confirmarlos en uso real. Están juntas en `HARDWARE_RULES` (`sketchup_offline/ui/hardwareModel.ts`) para cambiarlas en un solo lugar.
- **Depende del nombre:** una puerta sin nombre «Puerta» no suma. Conviene nombrar con Sugerencias de nombres antes de mirar herrajes.
- **Sin tipo de bisagra:** no distingue codo 0, 9 o 18 ni el lado de apertura. Eso entra con el paso 2 (herrajes en 3D).
- **Puerta rebatible:** se cuentan bisagras por el alto igual; queda un aviso para revisar.
- **Simulado:** falta validar en SketchUp real con un modelo del taller.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
