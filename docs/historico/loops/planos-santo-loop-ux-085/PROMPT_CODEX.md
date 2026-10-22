# Misión de Codex — Planos Santo «menos clics»

Actuá como responsable de la experiencia completa de trabajo en SketchUp 2026 Windows. El negocio es fabricación de muebles: diseño → placas/cantos → agrupar muebles y nombrar piezas → TXT de maderera → guía A4 para armado.

## Regla principal

**No añadir más formularios y opciones: reducir trabajo operativo.** Las opciones avanzadas pueden quedar en «Más ajustes»; accesos diarios a 1–2 acciones. El parecido con OpenCutList se refiere a la fluidez y patrones de interacción, nunca a copiar el logo, iconos, código de estilo ni identidad gráfica.

### Objetivo 1 — Pintado inmediato (P0)

Desde el botón de SketchUp «Pintar»: activar herramienta real **sin abrir el panel general 1440×920**. Si existe un material válido recordado, quedará seleccionado y al hacer clic en pieza/canto se aplicará según el modo y reglas seguras. Si no existe, mostrar paleta compacta con materiales reales y permitir elegir uno con una acción. No requerir confirmar cada clic seguro; sí frenar para revisar cambios a definiciones compartidas, caras ambiguas, lotes riesgosos y materiales sin vínculo válido.

Utilizá la API SketchUp con barra nativa, paleta `UI::HtmlDialog` modeless o arquitectura equivalente autorizada. Mantener SketchUp operable mientras está abierta. Reutilizar `SmartPaintTool`, `SmartPaint`, `NativePaint`, `PhotoMaterial`, `MaterialPolicy`; NO crear otro motor paralelo.

### Objetivo 2 — Nombres (P1)

Seleccionar mueble en el modelo → «Muebles» → lista inmediata de piezas ordenadas por mueble, con identificador estable, vista/resaltado, edición inline, sugerencia de nombres y renombrado masivo con vista previa única. Reutilizar `NameManager`, sin cambiar nombres de definición compartida. El encargado puede corregir rápidamente sin recorrer árbol o abrir ficha de cada pieza.

### Objetivo 3 — Guías A4 (P1)

Seleccionar mueble → «Planos» → configuración visual de 1 o 2 vistas exterior/interior. Cámara ortográfica girable, clic sobre pieza para ocultarla **solo en la vista interior**, mostrar/restaurar ocultos, notas con flechas, vista previa de A4 297×210 mm con tabla y cotas. Exportar PDF cuando sea legible; si no, mensaje específico de qué ajustar; sin cortar ni borrar piezas, nunca más de una hoja por mueble sin decisión explícita.

### Objetivo 4 — Barra/identidad (P1)

Barra nativa con 5 entradas principales: Pintar, Muebles, Maderera, Planos A4, Materiales. Funciones especializadas de cantos, quitar, cuentagotas accesibles desde una subpaleta o atajo (no eliminar comandos). Iconos originales coherentes con verde profundo/acentos sobrios de Planos Santo, legibles en 24px y 32px; tooltips precisos, estado activo, Esc, accesibilidad y escalado Windows.

### Mínimos de ingeniería

- Preservar materiales/imagenes reales y biblioteca privada. No subir los modelos ni texturas del usuario al repositorio público.
- Preservar TXT de 9 campos tabulados EXACTOS: `cant base altura detalle rota canto_arr canto_aba canto_izq canto_der`; separar por material/espesor/cantos. Bloqueo si orientación o cantos sin validar.
- No perder la edición de guías, notas y flechas; no alterar modelos originales ni las dimensiones.
- No modificar `ComponentDefinition#name` para resolver renombres de distintas instancias; no tocar una definición compartida por pintar una sola instancia sin una decisión segura.
- Conservar licencia/atribuciones de cualquier código externo efectivamente reutilizado.

## Forma de trabajo

Iterá: inspección → cambio pequeño → test → evidencia → actualización de `PROGRESO.md` y `ESTADO.json`. La cantidad de ciclos es un límite, NO una meta de terminar todo sin controles.

**Entregables:** código, pruebas, RBZ candidata con versión incrementada, video opcional/capturas reales, medición de clics, informe de diferencias y paquete de instrucciones para Codex local/Dot.

## Finalización

Si solo pasa lint o scripts en la nube, estado **CANDIDATA_PARA_VALIDAR**; no «producción lista». Si precisa prueba nativa indispensable que no pueda ejecutar, estado **NECESITA_SKETCHUP**. Si ocurre bloqueo técnico, **BLOQUEADO** con reproducción y siguiente acción.
