# Protección de datos y entorno de trabajo

- Los nueve SKP contienen modelos de proyectos reales. Usarlos sólo en el entorno elegido por el usuario. No publicarlos, no subirlos a repositorios públicos ni mencionarlos con detalles de clientes en logs accesibles a terceros.
- El loop usa `codex exec --sandbox workspace-write`. No incluye `danger-full-access`, no usa `--skip-git-repo-check` ni concede acceso administrativo.
- Antes de ejecutar, revisar los permisos del proyecto y las reglas de Codex. No incluir tokens ni credenciales en prompts, logs, modelos o repositorio.
- El script no crea commits, no sube archivos, no despliega, no toca un servidor ni instala extensiones en SketchUp.
- El flag `--output-last-message` almacena resúmenes de ciclos sin permitir asumir pruebas que no existieron.
- Los archivos bajo `referencias/` deben permanecer **inmutables**; todo código debe salir al árbol de desarrollo del repositorio.
- Si el entorno tiene una limitación de Windows para `workspace-write`, usar un entorno Linux de desarrollo o corregir permisos sin ampliar a acceso total.
