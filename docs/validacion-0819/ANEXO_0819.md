# Planos Santo 0.8.19 — Muebles y Planos separados, zócalo, cotas sin repetir y maderera optimizada

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Producción no aprobada.

Responde a lo que Gabriel reportó con la 0.8.18 (caso «Banco espera 1200x450x450» con zócalo).

## Muebles y Planos, separados

| Antes | Ahora |
|---|---|
| Un solo módulo mezclaba nombres, cotas y hoja A4 | **Muebles**: elegir muebles, marcar el frente, proponer y guardar nombres, codificar el despiece. Deja todo listo para la maderera. **Planos**: vistas exterior/interior, cotas, notas y hoja A4. Los nombres se ven, no se editan; si faltan, «Proponer nombres en Muebles» |
| La abreviatura de la obra no se podía editar con una guía abierta | Causa: el campo borraba la primera letra hasta tener dos, se bloqueaba durante el análisis automático y el panel se ocultaba con «Ocultar muebles». Ahora se edita siempre y recalcula los nombres |

## Nombres: zócalo, piso y frente

| Reporte | Causa | Corrección |
|---|---|---|
| Con zócalo no propuso nombres ni el piso | (1) piso y tapa se buscaban en el 15 % inferior/superior de la caja **con** zócalo, así que el piso caía en «Estante»; (2) no había regla para el zócalo; (3) piso, tapa y fondo siempre quedaban «a revisar» y no se aplicaban solos | Zócalo detectado (pieza baja de hasta 150 mm apoyada en el suelo con un tablero encima) y nombrado «Zócalo». Franjas medidas sobre el cuerpo sin zócalo. Piso, tapa, fondo delgado (≤ 10 mm) y zócalo se aplican solos; estantes, puertas y frentes de cajón quedan a revisar |
| ¿Alcanza con el frente? | — | Sí. La vertical sale del eje azul de SketchUp (también con el grupo girado de a 90°). Sólo se pide la vertical si el mueble está inclinado más de 10° |
| Frente | — | Se propone solo (lado opuesto al fondo delgado o lado de las puertas) y la UI dice de dónde salió. Un clic en «Marcar frente en el dibujo» lo cambia y recalcula todo |
| Exterior/interior | — | En Planos, la vista exterior mira el frente marcado en Muebles y la interior el lado opuesto, sin pedir nada. Las guías con cámara guardada conservan su encuadre |

## Planos

| Reporte | Corrección |
|---|---|
| IDs visibles en el plano | Ocultos por defecto en Planos y en el PDF, con control para mostrarlos. En Muebles se siguen viendo, porque ahí se ubica cada pieza |
| Cotas repetidas (laterales iguales) | Una medida igual (± 0,5 mm, mismo texto, misma dirección y tipo) se acota una sola vez por mueble. El pie dice «MEDIDAS IGUALES UNA SOLA VEZ». Nunca se omite una medida distinta |
| «El texto de una cota tapa marcas de otra…» bloqueaba la hoja | Se reubica sola en el lugar libre más cercano. Si no hay ninguno, se imprime igual con una nota que no bloquea |
| Adivinar cómo queda la hoja | El visor de Planos es la hoja A4: misma escena, mismas cotas omitidas, mismos IDs y misma medición de texto que el PDF. Las notas del visor son los marcadores numerados del A4 (no se arrastran; se anclan, reanclan y borran) |

## Maderera

| Antes | Ahora |
|---|---|
| Detalle pieza por pieza | Plegado en «Ver detalle por pieza», cerrado por defecto (se abre solo al ir a una pieza con problema) |
| Estimación por m² + desperdicio | **Optimización de placas estimada** por material: placas, aprovechamiento, m² netos y comprados, costo con el precio de la ficha y diagrama de cada placa. Cortes de guillotina (seccionadora), respeta veta, disco y refilado del perfil (sin perfil: 3 y 10 mm, avisado). La maderera puede optimizar distinto |
| — | **Total de cantos** por material: metros netos, con margen del perfil y a comprar en metros enteros |
| Presupuesto por m² | Con formato de placa usa las placas optimizadas; sin formato vuelve al cálculo anterior con aviso. El TXT no cambia |

## Cómo validarla

Igual que la 0.8.18 (`docs/validacion-0818/ANEXO_0818.md`), instalando `dist/PlanosSanto-0.8.19-candidata.rbz`. Respaldá `%LOCALAPPDATA%\PlanosSanto\` antes. Se agrega, con una **copia** del modelo «Banco espera 1200x450x450»:
1. **Muebles**
   - B1: escribir la abreviatura letra por letra con un mueble abierto; los nombres se recalculan.
   - B2: sin marcar nada, el banco propone Lateral, Piso, Zócalo (y Tapa/Fondo si existen) y se aplican solos. Anotar qué piezas quedaron «a revisar» y sus medidas si algo no se reconoce (tolerancias: contacto 2 mm, piso hasta 20 mm sobre el zócalo, zócalo hasta 150 mm).
   - B3: el frente propuesto es el correcto; si no, un clic lo cambia y recalcula.
   - B4: un mueble girado 90° en planta propone igual.
2. **Planos**
   - B5: Exterior mira el frente marcado; Interior, el lado opuesto.
   - B6: sin IDs por defecto; el control los muestra.
   - B7: los dos laterales iguales llevan una sola cota de alto y una de ancho.
   - B8: mover una cota encima de otra: se reubica sola y la hoja se genera sin aviso.
   - B9: el visor coincide con el PDF impreso (comparar lado a lado).
   - B10: Planos no permite editar nombres.
3. **Maderera**
   - B11: la vista muestra placas, aprovechamiento, diagramas y total de cantos; el detalle por pieza aparece plegado.
   - B12: comparar la cantidad de placas con lo que da la maderera o OpenCutList para el mismo pedido (anotar ambos números).
   - B13: el TXT exportado es igual al de la 0.8.18 para el mismo pedido.
