# Candidata 0.8.21 — correcciones de la revisión de 0.8.20

Base: `6ac2cb1` (0.8.20). Estado: **pendiente de validación real en SketchUp 2026; producción no aprobada**.

## Cambios

1. **PDF y TXT comparten códigos de canto por placa.** Las referencias del A4 usan el mismo pedido sin perfil comercial que la pantalla Maderera y el mismo mapa de códigos que el TXT. Una placa bloqueada por más de dos productos no imprime una asignación ficticia. Si diferentes placas usan el mismo número para productos distintos, la leyenda del PDF identifica cada placa, incluso cuando dos fichas comparten SKU y espesor.
2. **Importar bibliotecas conserva cambios en espesores y anchos.** JSON y ZIP comparan las listas normalizadas de v4. Una ficha diferente se conserva como ficha nueva/conflicto; el ZIP pide resolverlo. La original no se sobrescribe silenciosamente. Listas equivalentes no crean conflictos por su orden.
3. **Permitir giro vuelve a validar la exportación.** Los avisos y botones se actualizan con la misma regla Ruby que genera el TXT. Durante esa comprobación no se permite exportar usando un resultado anterior. Las placas con veta y las piezas con cantos asimétricos conservan sus restricciones.
4. **Las tapas salientes no desplazan el plano de las puertas.** La vista interior calcula el plano con paneles candidatos que cubren el interior. La prueba cubre banco, placard, cajonera, giro/espejo y mueble abierto; conserva piezas y medidas.

## Alcance y pendientes

- Se conserva el formato de biblioteca v4 de 0.8.20. Antes de instalar, respaldar `%LOCALAPPDATA%\PlanosSanto\`; versiones hasta 0.8.19 no abren v4.
- Se conservan las decisiones de 0.8.20 sobre hojas A4 adicionales, etiquetas y Maderera sin perfil comercial; este hotfix no cambia esas decisiones.
- La detección automática sigue siendo geométrica. Un herraje plano orientado como un frente puede requerir ocultamiento manual; no se declara resuelto todo tipo de tirador.
- Una pieza que sólo cabe girada puede seguir figurando pendiente de pedido en el A4: la consulta de referencias no toma el ajuste local de giro de la pantalla Maderera. No se imprime una asignación falsa; queda como limitación preexistente para un ciclo posterior.
- No se ejecutó SketchUp nativo ni una importación comercial al proveedor en la nube. Ver `VALIDACION_LOCAL.md`.

## Verificación

`RESULTADOS.json` registra las pruebas finales. Se incorporan regresiones de biblioteca, puertas y giro, y una prueba cruzada que ejecuta los servicios Ruby para producir TXT/referencias y después genera y lee el PDF real con Poppler. Ruby y Chromium usan dobles de la API de SketchUp.
