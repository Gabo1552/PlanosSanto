# Texto breve para iniciar desde la interfaz de Codex

> Estoy continuando el proyecto existente Planos Santo. Descomprimí este paquete en la raíz del repositorio, conservando la carpeta `planos-santo-arranque/`. Leé `planos-santo-arranque/README.md`, `LOOP_PROMPT.md`, `TAREAS.md`, `CRITERIOS_ACEPTACION.md` y el corpus privado de nueve SKP.
>
> Quiero implementar una extensión única y personalizada de OpenCutList + Planos Santo para SketchUp 2026, **sin perder nada del motor original ni lo que ya funciona de los planos**. El primer objetivo es auditar el código actual y empezar el reconocimiento de muebles/piezas sin nombres, catálogo reutilizable de materiales/cantos y exportación TXT a la maderera. El TXT debe tener las nueve columnas tabuladas exactas; los lotes se separan por material, espesor y cantos. Priorizá primero los tickets P0/P1 de `TAREAS.md`.
>
> Hacé ciclos cortos de implementación + prueba, actualizá `PROGRESO.md`, y detenete únicamente ante una validación que no puedas hacer sin SketchUp real o la página de la maderera. No presentes maquetas como funciones terminadas. **No publiques ni subas los nueve SKP de clientes a GitHub o a un repositorio público**. Respetá la licencia GPLv3 de OpenCutList.

## Si hay una terminal en Codex

```bash
cd /workspace/PlanosSanto
bash planos-santo-arranque/codex-loop.sh --check
bash planos-santo-arranque/codex-loop.sh 6
```

Es normal que el loop se detenga con código 3 cuando necesita que el encargado pruebe algo en SketchUp 2026 o cargue un pedido de prueba a la web del proveedor. Resolver la validación y reanudar.
