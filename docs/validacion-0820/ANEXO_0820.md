# Planos Santo 0.8.20 — pintura nítida, varios espesores, visor 3D, piezas que se ven y maderera sólo optimización

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

**Antes de instalar, respaldá `%LOCALAPPDATA%\PlanosSanto\`: la biblioteca migra a v4 y la 0.8.19 no la abre después.**

## Pintura en la vista
| Antes | Ahora |
|---|---|
| Barra y tira chicas y pixeladas; texto de 10 px | Texto medido en pantalla para salir a 13 pt (un solo ajuste: `font_size`/`TEXT_SIZE` en `smart_paint_tool.rb`). Barra de 40 px, tira de 58 px, celdas de 48 px de alto que paginan con ‹ › si no entran. Muestras con la textura real del material del modelo |
| Cursor PNG de 32 px borroso | Cursores propios en SVG (Windows) con PNG de 64/32 px de respaldo; cruz con punto activo en el centro; contorno blanco y negro |

## Materiales
| Antes | Ahora |
|---|---|
| La placa tenía un espesor elegido | La placa tiene la lista de espesores disponibles; todos valen. El despiece separa por el espesor real de cada pieza (15 y 18 mm del mismo material son secciones distintas) |
| Espesor distinto bloqueaba | No bloquea: marca suave «Espesor fuera de la lista de la ficha» con «Agregar X mm a la ficha» |
| Canto con un ancho; «Ancho no definido» | Anchos estándar 22 y 45 mm (editables). Sólo bloquea si NINGÚN ancho cubre el espesor de la pieza |
| Biblioteca v3 | v4 con migración automática y copia `catalog-v3-premigracion-*.json`. Los vínculos con el modelo siguen valiendo |

## Muebles (visor)
Girar arrastrando o con Frente/Atrás/Arriba/±90°, zoom con la rueda, «Mover piezas» arrastrando (o flechas de a 20 mm), «Separar piezas» y «Restablecer». Nada de esto toca el modelo.

## Planos
- Las vistas miran el frente (marcado o propuesto) con un ¾ suave (30°, 25° de inclinación).
- Interior desde el mismo frente, con puertas y frentes de cajón ocultos solos (cada pieza queda del mismo lado en los dos dibujos).
- Cámaras guardadas que miran a otro lado: «Mirar desde el frente» con un clic.
- **Dibujo 3D corregido:** antes se ordenaban triángulos sueltos y los estantes se veían a través de las puertas; ahora se ordena por pieza con separación en 3D (0 errores en banco, placard y cajonera de prueba, contra 34/84/45 antes).
- Etiquetas ocultas (el código queda).
- Pendiente: el exterior todavía dibuja cotas de piezas tapadas por puertas.

## Piezas
- Clic en una pieza: selecciona todas sus instancias, encuadra la cámara y la marca en naranja con contorno rojo visible a través de puertas. Otro clic o ‹ › recorre «1 de N». «Volver a la vista anterior» restaura cámara, grupo abierto y selección. Errores en la misma fila.
- Clic en una fila del resumen: va a la sección, la despliega y la marca. «Volver al resumen» en cada sección.

## Maderera
- Sólo «Optimización de placas» de todo el proyecto, por placa = material + espesor real.
- Corte: disco 4 mm, refilado 10 mm por lado, girar sin veta apagado (editables, se recuerdan en la PC).
- Un TXT por placa (`obra-material-espesor.txt`) y «Exportar todos» en una carpeta nueva. Máximo dos cantos por placa (canto 1 = el de más metros).
- Se quitaron de la vista perfil, biblioteca del taller, pedido, presupuesto y detalle por pieza. Lo guardado no se borró.

## Cómo validarla
Igual que la 0.8.19 (`docs/validacion-0819/ANEXO_0819.md`), instalando `dist/PlanosSanto-0.8.20-candidata.rbz`. Se agrega:
1. **Pintura** (al 100, 125 y 150 %): C1 texto de la barra ~17 px lógicos (ni doble ni mitad); C2 cursor nítido y que pinte donde está la cruz; C3 textura derecha en la celda; C4 la tira pagina con muchos materiales.
2. **Materiales**: C5 migración v3→v4 con copia en `backups`; C6 una placa con piezas de 15 y 18 mm sale en dos secciones; C7 «Agregar X mm a la ficha» funciona; C8 canto con 22/45 sin avisos sobre piezas de 18 mm.
3. **Muebles**: C9 girar, zoom, mover y separar piezas; el modelo no cambia.
4. **Planos**: C10 exterior de frente; C11 interior sin puertas; C12 sin estantes a través de puertas en el PDF impreso.
5. **Piezas**: C13 clic en una pieza la encuadra y resalta en SketchUp (perspectiva y paralela); C14 «Volver a la vista anterior»; C15 clic en el resumen lleva a la sección.
6. **Maderera**: C16 placas por material+espesor; C17 TXT por placa aceptado por la maderera; C18 «Exportar todos»; C19 comparar cantidad de placas con la maderera u OpenCutList.

**No aplica desde 0.8.20:** las filas de la guía §8 (modelo → TXT del Hito 3: propuesta, confirmación en bloque, aplicar a filas) y `docs/hito4/VALIDACION_SKETCHUP.md` (perfil de maderera, presupuesto) se marcan NO APLICA, porque esa interfaz se quitó. Las reemplazan C16–C19. Guía §9 A4: las etiquetas en papel (parte de A2–A4) quedan NO APLICA porque las etiquetas están ocultas.
