# Planos Santo — loop UX / pintura con fotografías — base 0.8.4

**Propósito:** eliminar fricción en la creación, elección y pintado de materiales; llevar la practicidad de OpenCutList a una interfaz con identidad propia Planos Santo.

**El ZIP contiene:** `PlanosSanto-0.8.4-candidata.rbz` como *referencia de lectura*, capturas aportadas por el usuario y biblioteca privada original de 35 materiales SKM. **Nunca reemplazar código más reciente** del proyecto de la nube por archivos de referencia.

## Inicio recomendado (Codex nube)

1. Copiar/descomprimir la carpeta `planos-santo-loop-experiencia-084/` a la raíz de su proyecto existente.
2. Leer `INSTRUCCION_CLOUD.md` y `PROMPT_CODEX.md`.
3. Ejecutar `python3 planos-santo-loop-experiencia-084/scripts/auditar_base.py`.
4. Realizar iteraciones manualmente en Codex o desde la raíz del proyecto ejecutar `bash planos-santo-loop-experiencia-084/codex-loop.sh 6` **solo si tiene Codex CLI instalado**.
5. Entregar RBZ candidata + informes y pruebas. No publicar ni declarar producción aprobada sin SketchUp real.

**Prioridad:** fotografía JPEG/PNG → material REAL de SketchUp → misma textura visible en piezas y miniatura → pintado sin formularios repetidos. Material en estado *Diseño* cuando faltan datos de proveedor. TXT a maderera sigue bloqueado hasta validación.

## Navegación
- `REFERENCIAS_OPENCUTLIST.md`: investigación de repositorio y documentación (ideas, no copia de assets).
- `AUDITORIA_084.md`: estado de componentes existentes y brecha encontrada.
- `DISENO_UX.md`: identidad, pantallas y flujos.
- `CONTRATO_IMAGEN_MATERIAL.md`: contrato del nuevo material con imagen.
- `ARQUITECTURA.md`: puntos de integración Ruby / HtmlDialog / SketchUp.
- `BACKLOG.md`: tareas priorizadas en ciclos.
- `ACEPTACION.md`: métricas y no-regresiones.
- `VALIDACION_DOT_LOCAL.md`: pruebas posteriores en SketchUp 2026 con Dot/Codex local.
- `ux/PROTOTIPO.html`: referencia visual de interacción **NO conectada** a SketchUp.

## Confidencialidad
`referencias_privadas/` y `runs/` se excluyen de Git; no subir modelos de clientes, texturas, materiales SKM, capturas ni rutas de Windows sin autorización. No copiar iconos ni CSS de OpenCutList: usar solo patrones UX e implementar recursos originales.
