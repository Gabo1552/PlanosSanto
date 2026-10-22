# Criterios de aceptación medibles

## Arranque técnico
- Existe respaldo/rama y registro de versión del proyecto actual. OpenCutList original sigue operativo e intacto.
- El proyecto personalizado tiene namespace/ID propios; no sobreescribe carpetas, settings ni base de materiales oficial.
- Tests del corpus validan 9 SHA256, se impide commit/distribución accidental de SKP privados.

## Renombrado
- Seleccionando un mueble con tablones sin nombres, la extensión lista sus instancias reales y propone nombres con confianza, sin inventar posiciones inciertas.
- Los nombres se pueden editar desde Planos Santo, se ven previamente y se aplican con una confirmación; cambiar prefijo no genera duplicados.
- Los objetos en otros muebles que comparten la misma definición no se renombran. La geometría se mantiene. Undo revierte el lote.
- Las piezas recurrentes se contabilizan por instancias (no por nombres de definición). Una misma pieza en dos grupos pertenece a las rutas correctas.

## Materiales y canto
- El catálogo del taller se guarda entre sesiones y proyectos, sin duplicar fichas automáticamente por variaciones ortográficas.
- Cada placa aprobada tiene espesor, formato, sustrato y canto compatible; precio puede faltar pero no se inventa. Distinguir material aplicado de material simplemente existente en el archivo.
- Un canto pintado en una cara se corresponde con el lado correcto de la pieza en orientación 2D confirmada, incluso en piezas rotadas y con espejo.

## Maderera
- TXT sin encabezado por defecto: nueve columnas separadas por ocho TAB por fila. Orden exacto con `canto_izq` ANTES de `canto_der`.
- `cant` entero >= 1, `base`/`altura` numéricos positivos mm, `rota` 0/1, cuatro cantos 0/1/2, un lote homogéneo por material/espesor/pareja de cantos.
- `rota=1` únicamente cuando sea seguro; no deducirlo automáticamente si no está configurado.
- Se genera manifest separado con material, espesor y nombres de cantos que el encargado debe seleccionar en la web; nunca agregar esas columnas al TXT.
- Ante datos incompletos de canto/orientación/material, no exportar como si estuviese correcto: mostrar advertencia y piezas a revisar.
- Falta prueba real con un TXT mínimo aceptado por la maderera para dar esto por confirmado.

## Funciones preservadas
- Optimización/listado de placas, cantos, costos y etiquetas continúan disponibles (aunque sus botones estén agrupados bajo modo avanzado).
- Modo normal orientado al proceso real con cinco áreas claras. Agregado futuro de herrajes no afecta el MVP.
- PDF dentro de SketchUp: una hoja A3 420x297mm por mueble, axonometría ligeramente despiezada, etiquetas únicas, medidas y notas con flechas vinculadas a una pieza.
- La aplicación web de Planos Santo no se borra hasta comparar funciones y validar la extensión en SketchUp 2026.

## Seguridad y límites
- Ningún SKP original editado, ningún archivo privado en RBZ ni repositorio público, ninguna compra/pedido real sin instrucción específica.
- El resultado de tests en contenedor se etiqueta **simulado/unitario**. El resultado SketchUp/impresión/proveedor se etiqueta **manual real** con evidencia. No declarar terminado si falta uno esencial.
