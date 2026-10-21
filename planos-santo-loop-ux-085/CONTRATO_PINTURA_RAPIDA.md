# UX y seguridad — Pintura inmediata

## Resultado observable

- Acceso **Pintar** desde barra SketchUp: con último material válido, el usuario puede pintar tras hacer clic en la pieza; sin él, paleta compacta visible para elegir.
- Paleta reducida (referencia de tamaño 320–420 px ancho; adaptable a pantallas con escalado). No interrumpir la interacción con SketchUp. Material activo y modo siempre visibles.
- Cambio de melamina/canto desde tarjeta con **un clic**, manteniendo la herramienta activa; miniatura fotográfica/texture del catálogo.
- Modos rápidos: `Pieza`, `Cara`, `Canto 1/2/4`, `Quitar`, `Cuentagotas`. Avanzadas: `alcance`, `caras frontal/dorso`, `ejes`, `batch`, `definiciones compartidas`.
- Atajos existentes Tab y flechas: mantener y documentar; Esc cancela selección sin aplicar cambios pendientes.
- Cuentagotas lee material real sin escribir y permite seleccionarlo para seguir pintando.
- Fotografías recién creadas en 0.8.5: el botón **Crear y usar** deja el material de diseño disponible, con requisitos comerciales marcados como «Pendientes», no fuerza llenar precio/proveedor para pintar.

## Máquinas de estado / eventos a implementar o estabilizar

- `inactive`, `choosing-material`, `painting`, `preview-risk`, `pending-batch`, `context-changed`, `error`.
- Cambio de material mientras hay selección en cola: cancelar la cola con aviso, nunca aplicar un lote viejo al material nuevo.
- Cambio de modelo activo: cancelar tool/previsualización y pedir reanálisis, sin transferir materiales a otro modelo silenciosamente.
- Persistencia: recordar solo opciones seguras (modo, material válido, submodo) por usuario/modelo donde corresponda; nunca confiar en identificadores obsoletos.
- No crear repetidamente una ventana nueva ni una barra duplicada al reabrir el plugin.

## Punto de implementación observado en 0.8.5

`quick_toolbar.rb` llama `OfflineController#quick_action`, que hoy pasa por `show` de HtmlDialog general. `offline.rb#validate_smart_options` requiere `confirmed`, `side`, `scope`, `axes`. Nuevo camino rápido debe **derivar esas opciones de una preferencia segura validada y explicitable**, y solo solicitar intervención cuando sea riesgoso.

No desactivar confirmaciones de riesgos ni sobreescribir el método existente a ciegas. Añadir ruta segura con pruebas.

## Seguridad y comportamiento mínimo

- Una operación de pintura modificadora debe estar cubierta por un único `start_operation`/`commit_operation` o `abort_operation` (Undo coherente).
- Evitar tocar dos instancias que compartan definición salvo aprobación explícita; si no puede garantizar aislamiento, bloquear y explicar cómo resolverlo.
- Pintado de canto por **cara correcta**, no por borde visual arbitrario. Reflejar cuatro orientaciones arriba/abajo/izquierda/derecha del TXT en la orientación exportable de la pieza.
- Fallos de vinculación foto/material, espesor, geometría ambigua, cara inexistente → bloquear modificación, devolver motivo accionable.
- Ninguna foto puede considerarse espesor/material/escala de fabricación verificados por deducción visual.

## Métrica de clics (medir en SketchUp)

1. **Último material listo**: botón Pintar + un clic en la pieza = máximo dos clics hasta aplicar.
2. **Cambiar material activo**: una tarjeta + clic en pieza, sin reactivar herramienta.
3. **Canto simple**: modo Canto + elección si no está activa + clic en canto; ninguna navegación a la ventana principal.
4. **Crear desde foto**: Elegir foto → nombre/tipo/espesor cuando corresponda → Crear y usar. No más de una confirmación de creación segura; conflictos de duplicación sí requieren revisión.

La medición de clics **no autoriza** pintura silenciosa en superficies compartidas ni atajos que salteen verificación.
