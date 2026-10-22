# Especificación UX — Una herramienta para el encargado, no diez menús

## Principios
- **Modelo como protagonista**: en pintado el viewport SketchUp ocupa el mayor espacio; paleta compacta flotante/no modal, controles que no bloqueen la interacción.
- **Una acción principal por pantalla**; acciones avanzadas tras «Más opciones» o un modo avanzado reversible (sin borrar funciones).
- **Contexto persistente**: proyecto → mueble → pieza/material seleccionado. No pedir que vuelva a elegir lo mismo en cada paso.
- **Español de taller**: «Pintar placa», «Pintar canto», «Quitar canto», «Nombrar piezas», «Pedido a maderera», «Plano A4».
- **Estado siempre visible**: material activo, mueble, selección, guardado, modo de herramienta, cambios pendientes, material sin aprobar.
- **Simplicidad sin pérdida de seguridad**: no permitir usar propiedades inferidas/no validadas en exportaciones reales.

## Navegación: cinco destinos claros
Barra lateral fija angosta (inspirada en captura, pero diseño propio):
1. Inicio: proyecto/mueble seleccionado y próximos pasos (no dashboard de métricas sin acción).
2. Materiales: catálogo persistente del taller, texturas, cantos, importación y revisión.
3. Muebles: jerarquía → lista piezas → resaltado/ocultamiento → sugerir/editar nombres.
4. Maderera: lote por material/espesor/cantos, preflight de errores y TXT tabulado.
5. Planos A4: 1 o 2 vistas, rotación, ocultar piezas, notas/flechas y PDF.

**Pintar** es un modo rápido desde la barra de SketchUp, no una pantalla nueva que obliga a abandonar el viewport. Su paleta compacta puede abrir «Materiales» si es preciso.

## Pantallas y componentes

### A. Materiales
- Cabecera «Materiales del taller», buscador, filtros `Placas | Cantos | Otros | Por revisar`, botón destacado «Importar biblioteca» y acción secundaria «Nuevo material».
- Tarjetas con textura/miniatura REAL, nombre, tipo, espesor, estrella Favorito y estado «Pendiente de revisar» / «Aprobado»; no esconder errores tras un icono de pregunta.
- Pestañas o filtros «Todo el taller» y «En este modelo». Ambos son conceptos diferentes.
- Importar ZIP/carpeta SKM → vista previa de 35 filas con miniaturas y sugerencias NO APROBADAS → detectar duplicados/colisiones → seleccionar → importar → revisión de SKU, proveedor, tipo, medidas, veta, vinculaciones de canto → aprobar individualmente o por lote solo si todas las reglas existentes se satisfacen.
- Nunca aprobar en silencio con nombre `Canto ...` o `18mm`.

### B. Pintura Inteligente
- Barra compacta horizontal de modo (Pieza / Canto / Recubrir cara / Quitar canto / Limpiar), sin perder el foco de SketchUp.
- Franja de materiales favoritos/más usados, busca + lista corta de muestras visuales.
- Hover resalta cara/arista que se va a pintar; confirmación de pieza compartida cuando aplica; Esc cancela modo; Deshacer funciona con el historial de SketchUp.
- Indicar si el material elegido es canto o placa. Si no tiene tipo aprobado, advertir y bloquear su uso de producción según reglas actuales.
- Estado persistente durante el pintado: herramienta activa, material activo y destino.

### C. Muebles
- Izquierda: árbol simple de grupos/muebles; centro: piezas con código, nombre editable y medidas protegidas; derecha: vista del mueble/despiece si cabe.
- Desde un mueble renombrar todas sus piezas con vista previa y confirmación sin duplicar prefijos.
- Resaltar en SketchUp al seleccionar pieza; no cambiar definición compartida por accidente.
- Reutilizar el backend existente `names.rb`/`workshop.rb`, no redefinir la lógica de geometría.

### D. Maderera
- Selección del lote (material + espesor + canto principal/secundario) antes de generar TXT.
- Resumen de cantidad de piezas, lista con alertas por orientación o cantos no resueltos; botón «Generar TXT» habilitado solo con preflight válido.
- No mostrar columnas técnicas salvo en «Vista previa técnica»; la salida sí debe ser EXACTAMENTE: `cant base altura detalle rota canto_arr canto_aba canto_izq canto_der` separados por TAB.
- Sin material ni espesor en TXT; se seleccionan aparte en la página del proveedor.

### E. Planos A4
- Vista exterior frontal rotatable y opcional vista interior con piezas ocultas; selector 1/2 vistas, etiquetas, anotaciones. Una hoja A4 horizontal por mueble por defecto, respetar límites de legibilidad.
- Reorganizar controles y estados; evitar reescribir algoritmos de proyección o PDF en este loop.

## Layouts, pantallas y ergonomía
- Ventana grande (aprox. 1440×920 o adaptable): navegación lateral 68-84 px, cabecera 56-64 px, contenido adaptable a 2 columnas cuando corresponde.
- Paleta de pintado (aprox. 440×760 o más compacta y redimensionable): puede contraerse para liberar viewport. HtmlDialog redimensionable no promete tamaño exacto (DPI).
- Probar 1280×720, 1920×1080, 100% / 125% / 150% de escala; sin controles cortados ni scroll horizontal excesivo.
- Tipografía mínimo visual 12-13 px para secundarios, 14-16 px principal; contrastes suficientes; objetivos clic >=32 px, foco visible y navegación teclado.
- Fondo claro neutro, panel lateral oscuro neutro, acento único ámbar/naranja (inspiración OCL, no clonar), feedback verde solo para correcto y rojo solo errores. Identidad y logo propios de Planos Santo.
- Estados: inicial, cargando, vacío, error, lectura offline, guardado, seleccionado, hover, deshabilitado + causa y éxito verificado.
- Mantener textos reales y ventanas accesibles. Atajos de teclado desde menús, tooltip para todos los iconos, colores no como única señal de estado.

## Metas mensurables de usabilidad (verificar, no inventar)
- Desde SketchUp: activar Pintar canto o Pintar placa con **1 clic de toolbar** y seleccionar material visible sin abrir la ventana principal.
- Desde Materiales: localizar una melamina por buscador en < 3 acciones, tipo/espesor/estado visibles.
- Desde Muebles: llegar al panel de nombres de un mueble con <=3 interacciones.
- Desde maderera: entender por qué un pedido está bloqueado y cómo resolverlo sin abrir un log técnico.
- Todas las acciones antiguas deben tener ubicación accesible (principal o avanzado) y no perderse.

## Comparación obligatoria antes/después
Generar capturas con el MISMO modelo y tamaño de ventana del antes/después de Materiales, paleta Pintar, Muebles, Pedido, Planos y Toolbar. Auditar tiempos/clics observados (no estimados) y lista de accesibilidad visual.
