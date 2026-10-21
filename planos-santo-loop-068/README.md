# Planos Santo — loop de Codex sobre 0.6.8

**Objetivo de este loop (acotado):** completar el circuito de producción: **detectar muebles y piezas sin nombre → proponer nombres → revisar cantos y orientación → exportar TXT válido para la maderera**. Sin perder la axonometría, anotaciones y PDF A3 existentes.

**Importante:** paquete preparado a partir de la versión 0.6.8 entregada por el usuario. No contiene una nueva extensión terminada. La geometría y el TXT real requieren validación en **SketchUp 2026 Windows** y una importación controlada con el proveedor.

## Contenido

- `PROMPT_CODEX.md`: instrucciones del trabajo, orden, barreras y entregables.
- `TAREAS.md`: backlog por etapas, prioridades y aceptación.
- `BASELINE_068.md`: hallazgos comprobados mediante inspección estática de 0.6.8.
- `VALIDACION_SKETCHUP.md`: protocolo obligatorio de pruebas manuales.
- `CONTRATO_MADERERA.md`: las 9 columnas y reglas del proveedor.
- `referencias/PlanosSanto-0.6.8.rbz`: extensión original intacta, para inspección y respaldo.
- `referencias/privado/modelos/`: nueve `.skp` reales del taller, **privados**.
- `scripts/`: ejecutor acotado, chequeo de integridad y validador de TXT.
- `manual/validacion_usuario.example.json`: ejemplo; Codex **no** puede aprobarlo por el usuario.
- `state/`: se crea al ejecutar; contiene evidencia y salidas de ciclos.

## Inicio dentro de Codex/Linux

1. Cargá este ZIP en el proyecto donde está el código fuente de Planos Santo, normalmente `/workspace/PlanosSanto`, y extraé la carpeta `planos-santo-loop-068/` en la raíz del proyecto. **No sobreescribas código existente**.
2. Confirmá que la carpeta raíz es un repositorio Git. Si no lo es, revisá los archivos y luego inicializalo explícitamente (`git init`) antes de correr el loop.
3. Con Codex CLI disponible y sesión iniciada:

```bash
cd /workspace/PlanosSanto
bash planos-santo-loop-068/codex-loop.sh 6
```

Para inspeccionar solamente sin llamar a Codex:

```bash
python3 planos-santo-loop-068/scripts/verificar_entradas.py
python3 -m unittest discover -s planos-santo-loop-068/tests -v
bash planos-santo-loop-068/codex-loop.sh --dry-run
```

## Windows PowerShell (si ejecutás Codex CLI localmente)

```powershell
cd C:\ruta\a\PlanosSanto
.\planos-santo-loop-068\codex-loop.ps1 -MaxCycles 6
```

Necesitás Python 3, Git y Codex CLI. Para ejecución automática de código, preferí el entorno Linux/Codex donde ya venís trabajando. Las pruebas reales de SketchUp se hacen aparte en tu PC Windows. El loop no intenta manipular SketchUp desde Linux.

**Comportamiento:** máximo 6 ciclos por ejecución. Se detiene en `NEEDS_USER`, `BLOCKED`, `DONE`, fallo del CLI o pérdida de integridad. No lanza ciclos simultáneos. Podés reanudarlo volviendo a ejecutar el mismo comando después de un límite de ciclos. Si se detuvo en `NEEDS_USER` o `BLOCKED`, primero resolvé el pedido y agregá `--resume-after-user` para indicar que la validación se realizó; si devolvió `DONE`, completá la validación manual y ejecutá de nuevo para verificar el cierre. `DONE` exige el archivo de validación completado por una persona y pasa por una comprobación adicional.

## Resultado esperado del primer avance

Un panel de mueble seleccionable, con piezas sin nombre clasificadas (propuestas editables y nivel de confianza), tabla de cantos por lado con revisión de orientación, y exportación de TXT por lote (material/espesor/canto principal/secundario) sin omitir piezas ni mezclar lotes.

**No incluye en este loop:** rediseñar toda la UI, optimizador independiente de OpenCutList, nuevas herramientas de pintado o herrajes. Se mantienen como próximas fases. No desinstalar OpenCutList hasta pasar sus pruebas de equivalencia.

**Reanudación tras una prueba tuya:** `bash planos-santo-loop-068/codex-loop.sh 3 --resume-after-user` (o en PowerShell `-ResumeAfterUser`).

## Si trabajás desde la interfaz de Codex y no tenés la terminal CLI

Podés subir el ZIP al proyecto, descomprimirlo y copiar el texto de `INSTRUCCION_RAPIDA_CODEX.md` en tu conversación con Codex. El ejecutor automático requiere la CLI (`codex exec`) y no necesariamente está instalada dentro de todos los entornos de Codex. Codex puede cumplir el mismo backlog directamente en la conversación, informando avances por etapas.
