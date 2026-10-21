# UX: Planos Santo — rápido y con identidad del taller

## Identidad visual

Usar la marca **Planos Santo** actual, sin copiar la estética naranja de OpenCutList. Guía de tokens *propuestos para ajustar al branding real*, no redefinir logo del cliente por cuenta propia:

- Verde profundo `#19483D`, fondo cálido `#F6F5F0`, superficie `#FFFFFF`.
- Texto `#263830`, secundario `#62736A`, líneas `#D9DED7`, madera / acento cálido `#B78553`.
- Advertencias y errores usan colores semánticos, nunca la paleta de acento como único indicador.
- Símbolos propios vectoriales de 24/32 px: placa, cinta en borde, quitar canto, cuentagotas, muebles, lista, PDF, biblioteca; grosor visual consistente, sin depender sólo de color; tooltip español y estado marcado.
- Escalas DPI Windows 100%, 125% y 150%; foco de teclado claro, controles de 36-40px como mínimo y textos legibles.

## Pantalla principal

- Encabezado bajo: logo Planos Santo, proyecto SKP activo, mueble/selección y estado de guardado.
- Navegación lateral compacta: **Pintar / Muebles / Maderera / Planos / Materiales**. Sin pantallas de bienvenida adicionales al trabajo.
- Una acción primaria por sección; opciones avanzadas en `Más opciones` desplegable.
- Persistencia de última sección, último material y modos de pintado (por proyecto/sesión según corresponda, sin estados obsoletos).
- Reusar barra SketchUp ya existente: los botones deben funcionar sin abrir el panel principal, y estado activo debe reflejar la herramienta real. Limitar barra principal a las acciones verdaderamente frecuentes.

## Pintar — experiencia principal

Al pulsar `Pintar` (o icono de pincel de placa):
1. Activar herramienta nativa sobre SketchUp; si no hay material seleccionado, mostrar la paleta compacta con último/favoritos.
2. Barra de modos clara: **Pieza, Canto, Cara, Tomar, Limpiar**.
3. Centro: modelo SketchUp libre; hover resalta componente/cara y muestra una previsualización inequívoca. Nada de abrir un formulario por cara.
4. Abajo o en paleta flotante compacta: carrusel de miniaturas reales (placas/cantos según modo), búsqueda incremental, favoritos, `+ Nuevo material`.
5. Click sobre pieza/cara aplica material como una operación SketchUp deshacible. Informar cuál pieza/cara cambió. No pedir confirmación por cada cara segura.
6. Si la pieza comparte definición con otra instancia, se va a modificar geometría compartida, hay orientación dudosa, o existe una acción destructiva: presentar un aviso puntual antes de aplicar (o usar mecanismo de aislamiento probado). No ocultar riesgos.
7. Cambiar el material activo con teclado sin salir de la herramienta; `Esc` cancela.

**Pintar cantos:** submodo rápido `1`, `2 opuestos`, `4` cantos, siempre con preview por lado y orientación confiable. 1 clic sobre borde aplica al lado correcto. Si la clasificación es dudosa, bloquear y ofrecer revisión de ejes; no exportar cantos inferidos como ciertos.

**Cuentagotas:** muestra qué material REAL hay en la cara y lo deja seleccionado para seguir pintando, sin pasos de vínculo obligatorios para simple muestreo. Si está sin asociar a catálogo, sugerir vincular después.

## Biblioteca

- Galería con miniaturas/colores reales (nunca miniaturas sin usar para pintar), búsqueda por nombre/proveedor, filtro tipo placa/canto, favoritos y usados recientemente.
- Botón principal **`+ Material`** arriba y también en paleta.
- Crear con foto: acción grande `Elegir foto (JPG/PNG)`; campos iniciales nombre, tipo y espesor (para placas); dimensiones físicas de textura claramente separadas de tamaño de placa.
- `Guardar y pintar` crea el material real y lo selecciona, sin pedir todavía proveedor/SKU/costo. Ficha marcada `Listo para diseño` / `Pendiente para maderera`.
- `Detalles de compra` (proveedor, SKU, espesor aprobado, placas, precios, cantos compatibles) en panel secundario; validar antes de exportar.
- Materiales SKM previos: aparecer visualmente y permitir seleccionar; importación masiva de 35 sin obligar a aprobar uno por uno para verlos. Sí se revisan atributos antes de enviar a maderera.
- Acciones junto a tarjeta: usar, favorito, editar, duplicar, reemplazar textura (con confirmación si afecta piezas existentes).

## Metas de eficiencia medibles

- Abrir pintura con último material y empezar a pintar: <=2 acciones visibles si ya hay material.
- Elegir otro favorito y pintar una pieza: <=3 acciones visibles.
- Crear material desde foto y llegar a pintar: <=5 decisiones principales, sin contar navegación en selector de archivos ni campos opcionales.
- Pintar 10 cantos correctos seguidos sin 10 diálogos de confirmación; no se sacrifica seguridad en piezas compartidas.
- Salir o cambiar de modo sin perder el modelo o cerrar SketchUp.

## No hacer

- No construir otro panel paralelo desconectado de SmartPaint existente.
- No sustituir la textura real por una imagen decorativa de tarjeta.
- No ocultar las advertencias críticas a favor de velocidad.
- No agregar 12 botones arriba ni obligar a tres ventanas para pintar una cara.
- No copiar los SVG/PNG/logos originales de OpenCutList.
