# Planos Santo — loop de pintado propio (base 0.7.3)

## Propósito

Desarrollar el catálogo y las herramientas **nativas de pintado de melaminas y cantos dentro de Planos Santo**, de manera que los nuevos proyectos puedan prepararse y exportarse a la maderera **sin utilizar la interfaz ni el código en ejecución de OpenCutList**. OpenCutList permanece instalado como respaldo y sus materiales antiguos deben poder leerse sin modificarse.

**No es un loop de optimización de cortes**, ni de rediseño de PDFs: conservar el A4 horizontal (una o dos vistas), nombres, notas/flechas y TXT actual.

## Usar en Codex de la nube (recomendado)

1. Descomprimir esta carpeta dentro del proyecto Planos Santo, sin sustituir archivos de producción.
2. Adjuntar el paquete o subirlo al workspace donde está la rama fuente más reciente.
3. Pegar **`INSTRUCCION_CLOUD.md`** en la conversación de Codex. No lanzar `codex exec` dentro de una ejecución de Codex en la nube.
4. Codex trabaja por fases, registra `PROGRESO.md` y entrega un RBZ candidato con `reports/IMPLEMENTACION_LISTA.md`.
5. La instalación/prueba visual real en SketchUp 2026 se hará después, mediante el Codex local/Dot.

## Usar con Codex CLI de forma repetida (opcional)

En la raíz del proyecto (el padre de `planos-santo-loop-pintado-073/`):

```bash
python3 planos-santo-loop-pintado-073/scripts/run_loop.py --dry-run
bash planos-santo-loop-pintado-073/codex-loop.sh 6
```

Windows PowerShell:

```powershell
.\planos-santo-loop-pintado-073\codex-loop.ps1 -MaxCycles 6
```

Requisitos del ejecutor CLI: Python 3, Codex CLI autenticado, permiso de escritura en el workspace. Usará el modelo configurado en Codex (no fuerza nombres de modelos). `--dry-run` no llama a Codex. Cada ciclo genera archivos en `runs/`, excluidos de Git. El ejecutor usa `workspace-write`, `never` para aprobaciones y no permite operaciones fuera del workspace; si una acción necesita más permisos, se detiene.

**Estados posibles:** trabajando, necesita información, bloqueado o **listo para validar en SketchUp**. El último estado NO significa aprobado para producción.

## Archivos

- `PROMPT_CODEX.md`: objetivo, alcance y reglas vinculantes.
- `TAREAS.md`: fases, prioridad y resultados.
- `ARQUITECTURA_073.md`: clases y puntos de integración constatados en el RBZ real.
- `CONTRATO_MATERIALES_CANTOS.md`: reglas de catálogo, pintado y trazabilidad.
- `CONTRATO_MADERERA.md`: TXT de nueve columnas; nada de pedidos reales.
- `CRITERIOS_DE_ACEPTACION.md`: definición de implementación lista para pruebas locales.
- `VALIDACION_LOCAL_POSTERIOR.md`: escenarios para Codex local/Dot en el próximo hito.
- `SEGURIDAD.md`: respaldo, licencias y modificaciones permitidas.
- `INSTRUCCION_CLOUD.md`: instrucción corta para la nube.
- `scripts/verify_rbz.py`: auditoría estática de RBZ y manifiesto.
- `scripts/validar_txt.py`: validador local del TXT del proveedor.
- `scripts/run_loop.py`: ejecutor CLI con registros y paradas seguras.

La referencia RBZ 0.7.3 se incluye para **comparar**, no para pisar código nuevo de la nube. No se incluyen los 9 modelos privados en este paquete: usar copias existentes en el proyecto cuando corresponda.
