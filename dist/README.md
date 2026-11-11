# Entrega 0.8.33 — pintura solo con los materiales elegidos y giro al marcar el frente, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.33-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`.

Sobre la 0.8.32:

- **Pintura:** la barra y la paleta muestran solo los materiales elegidos para el SKP en Materiales.
- **Frente:** en Sugerencias de nombres se puede girar el dibujo para marcar un frente que quedó atrás.

Validar con `docs/validacion-0833/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.32). Producción no aprobada; SketchUp 2022 sin probar.

---

# Entrega 0.8.32 — frentes de cajón con veta vertical sin aviso, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.32-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`.

Sobre la 0.8.31: el taller confirmó la veta vertical en los frentes de cajón, así que se saca el aviso «revisar» de las piezas verticales más anchas que altas.

Validar con `docs/validacion-0832/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.31). Producción no aprobada; SketchUp 2022 sin probar.

---

# Entrega 0.8.31 — cotas totales del mueble y materiales del proyecto, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.31-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Sobre la 0.8.30, hay dos cambios:

- **Cotas:** los planos muestran por defecto solo alto, ancho y profundidad totales del mueble. Las cotas de pieza quedan ocultas y se activan una por una.
- **Materiales:** cada SKP elige sus materiales en Materiales, y al pintar se ven solo esos. El resto de la biblioteca queda plegado.

Validar con `docs/validacion-0831/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.30). Producción no aprobada; SketchUp 2022 sin probar.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.30 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
