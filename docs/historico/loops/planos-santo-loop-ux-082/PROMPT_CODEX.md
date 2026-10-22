# MISIÓN CODEX — LOOP UI/UX, BARRA RÁPIDA Y MATERIALES REALES

Sos desarrollador principal de Planos Santo para SketchUp 2026. Mejorá MUCHO la usabilidad de la extensión, inspirándote en la interacción de OpenCutList (capturas adjuntas), pero con identidad y gráficos propios.

**No reconstruyas el proyecto desde 0.8.2 si el repositorio tiene una versión posterior.** Auditalo y reutilizá los servicios actuales antes de modificar UI.

## Entrega concreta
1. Estructura clara de 5 módulos: Inicio, Materiales, Muebles, Maderera, Planos A4; herramienta de pintar como acción rápida.
2. Nueva barra nativa SketchUp: máximo 8 iconos originales uniformes (estilo lineal de los iconos de la derecha de la captura), tooltips, estados, menú, acciones reales.
3. Paleta de Pintura Inteligente compacta para material y canto, accesos en un clic y material seleccionado visible sin tapar el modelo. No crear un viewport falso por encima de SketchUp.
4. Biblioteca visual persistente: tarjetas con texturas, filtro, buscador, favoritos, aprobaciones y **importación masiva de 35 SKM del usuario** desde ZIP/carpeta (sin aprobar por inferencia ni duplicar registros).
5. Simplificar Muebles, Maderera y Planos A4 sin romper sus motores. Mejorar estados, feedback, densidad, navegación, teclados y DPI.
6. Pruebas automatizadas, capturas antes/después, candidata RBZ y reporte para Dot local.

## Procedimiento por ciclo
- Leé los documentos de esta carpeta: `AUDITORIA_REAL.md`, `DISENO_UX.md`, `MAPA_ICONOS.md`, `CATALOGO_SKM.md`, `BACKLOG.md`, `CRITERIOS.md`, `CONTRATO_MADERERA.md`, `SEGURIDAD.md`.
- Tomá una o varias tareas coherentes del backlog, construí la solución en código real y ejecutá pruebas.
- En cada ciclo actualizá `PROGRESO.md` con evidencia y `ESTADO.json` (`last_cycle` entero exacto, `state` una de `CONTINUAR`, `CANDIDATA_PARA_VALIDAR`, `NECESITA_SKETCHUP`, `BLOQUEADO`).
- Usá `CONTINUAR` si hay más tareas realizables en nube; cuando exista candidata con tests completos pero sin prueba SketchUp, usar `CANDIDATA_PARA_VALIDAR`, **no «aprobado»**.
- Si algo requiere pruebas en SketchUp instalado, prepará guion Dot local pero seguí con tareas independientes.
- Preservá el código de negocio, catálogos y datos originales, y verificá la versión instalada y el rollback.

## Prohibido
- Rediseñar solo un mock visual sin conectar handlers.
- Introducir botones decorativos o iconos de marca OpenCutList copiados.
- Migrar a nuevo framework sin razón comprobable.
- Marcar materiales o TXT como aprobados por interpretar solo sus nombres.
- Publicar SKM privados, texturas o modelos del taller.
- Perder notas/PDF A4/cantos/maderera al reorganizar pantallas.
- Afirmar que probaste SketchUp local desde la nube si no hubo ejecución real.
