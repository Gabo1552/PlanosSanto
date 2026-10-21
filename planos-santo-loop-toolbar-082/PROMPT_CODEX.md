# LOOP CODEX — PLANOS SANTO, BARRA RÁPIDA NATIVA

## Rol

Sos el desarrollador principal de Planos Santo en el proyecto de la nube. Base auditada: `0.8.2-candidata.rbz`. Si tu repositorio es posterior, conservar **el código más nuevo** y aplicar este trabajo por integración, nunca por reemplazo del proyecto con el RBZ.

## Entregable principal

Convertir Planos Santo en una extensión de SketchUp fácil de utilizar cotidianamente con una **barra nativa y accesos rápidos**, similar al enfoque de OpenCutList, sin duplicar el motor de pintura ya implementado.

### Experiencia requerida

Al abrir SketchUp, la extensión debe ofrecer dos barras **opcionales y acoplables**:

- `Planos Santo`: botón principal que abre la interfaz completa existente (conservar su identidad y su estado).
- `Planos Santo - Herramientas`: botones pequeños de uso habitual, con iconos distintos, texto emergente, descripción en barra de estado y presencia en el submenú `Extensiones > Planos Santo` para permitir atajos configurables desde SketchUp.

**Acciones principales de la segunda barra:**

1. **Pintar melamina / placa**: activa la herramienta de Pintura Inteligente en modo `sheet` y muestra una paleta compacta con los materiales de placa aprobados. Si no hay selección válida, abre la paleta y solicita elegir; no pinta todavía.
2. **Pintar canto**: modo `edge`, muestra cantos aprobados compatibles y permite clic directo en la cara estrecha, usando el servicio de pintado actual.
3. **Quitar canto**: modo `remove_edge`, con alcance controlado y confirmación del objetivo; nunca limpia todo el componente por accidente.
4. **Tomar material (cuentagotas)**: modo de solo lectura sobre una cara para identificar el material nativo/binding y elegirlo en la paleta. Crear esta función si falta; no escribir atributos ni geometría al muestrear.
5. **Muebles y nombres**: abre la sección existente para consultar grupos, piezas y renombrar. Si hay selección compatible, utilizarla para enfocar el mueble; si no, permitir elegir desde la lista. No aplicar renombres automáticamente sin los controles existentes.
6. **Maderera**: abre el módulo de pedidos, sin exportar ni guardar hasta que el encargado confirme el preflight y el destino. Respeta las nueve columnas y la validación por lote.
7. **Guías A4**: abre el editor de una/dos vistas, ocultamiento de piezas, notas y PDF. NO exportar PDF automáticamente al pulsar el icono.

Podés agregar **Materiales** como un octavo acceso cuando aporte claridad sin saturar la barra. Los comandos de `Ejes Inteligentes` y `Exportación Inteligente` al estilo OpenCutList deben quedar como **futuro** a menos que exista implementación real, probada, segura y con alcance acordado; nunca colocar iconos sin acción real.

### Comportamiento

- Usar `UI::Command` y `UI::Toolbar` oficiales. Crear comandos una sola vez, gestionar recarga y no duplicar barras al reiniciar o recargar archivos Ruby.
- `set_validation_proc`: estado habilitado/deshabilitado según contexto; `MF_CHECKED` cuando está activo el modo correspondiente y `MF_UNCHECKED` cuando no. No dejar iconos falsamente activos.
- Clic en el icono de pintura activo = desactivar o volver al modo selección, sin operaciones pendientes. Clic en otro modo = cambiar modo; cancelar colas previas de selección con aviso.
- Abrir/traer al frente la paleta compacta reutilizando el `HtmlDialog` y el puente existente; no crear una ventana nueva por cada clic. Si la UI aún no está lista, esperar su señal de preparación de forma segura.
- La paleta debe dejar visible el modelo y permitir alternar entre melamina, canto, quitar canto y cuentagotas; favorecer últimos materiales usados/favoritos, pero sin decidir automáticamente un material no aprobado.
- Los iconos deben ser distintos, legibles a 24/32 px y tener rutas internas válidas dentro del RBZ. No descargar iconos en tiempo de uso ni requerir internet.
- Las barras deben poder ocultarse/mostrarse desde las opciones de barras de SketchUp, con posiciones conservadas; no forzar que reaparezcan en cada sesión si el usuario las ocultó.
- Mostrar el motivo de bloqueo si faltan permisos, aprobación de material, pieza, configuración de ejes o hay ediciones sin guardar.
- Mantener compatibilidad con OpenCutList instalado o desinstalado; no mutar sus atributos y nunca reescribir la definición compartida sin comprobación explícita.
- No modificar geometría ni dimensiones en el modo vista previa o muestreo. Agrupar cambios por gesto en un único Undo nativo cuando realmente hubo cambio.
- Preservar catálogo, materiales/cantos, nombres de piezas, pedidos maderera, PDFs A4 y anotaciones.

### Plan de implementación

Seguir `BACKLOG.md` por prioridad. En cada ciclo hacer análisis del código real, cambios mínimos, pruebas y registro en `PROGRESO.md`. No afirmar integración probada en SketchUp si solo se hizo lint o mocks.

### Estados para el ejecutor

Al final de cada ciclo actualizar `planos-santo-loop-toolbar-082/ESTADO.json` con:
`{"state":"CONTINUAR|CANDIDATA_PARA_VALIDAR|NECESITA_SKETCHUP|BLOQUEADO","last_cycle":<entero>,"summary":"...","tests":"...","pending":"..."}`.

- `CONTINUAR`: quedan tareas implementables en la nube.
- `CANDIDATA_PARA_VALIDAR`: RBZ con pruebas automáticas completadas, falta instalación y prueba local.
- `NECESITA_SKETCHUP`: bloqueado por prueba que debe hacer Dot/Codex local.
- `BLOQUEADO`: describir impedimento real, no simularlo ni saltarlo.

### Fin del loop

Entregar `PlanosSanto-0.8.3-candidata.rbz` o una versión posterior correcta, archivos fuente, inventario de cambios, capturas/mocks cuando corresponda, pruebas reproducibles y una guía de ensayos para Dot/Codex local. Es una **candidata**, NO versión certificada para producción.
