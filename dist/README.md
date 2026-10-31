# Entrega 0.8.27 — Maderera sin exigir guardar la guía, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.27-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Sobre la 0.8.26: Maderera optimiza las placas y exporta el TXT aunque la guía tenga cambios sin guardar; avisa que los nombres y códigos salen de la última guía guardada. Validar con `docs/validacion-0827/VALIDACION_LOCAL.md` (más los pasos de 0.8.26). Producción no aprobada; SketchUp 2022 sin probar.

---

# Entrega 0.8.26 — vetas, Dibujar pieza, cabecera compacta, nombres agrupados y preparación para SketchUp 2022, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.26-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Antes de actualizar, cerrar SketchUp y respaldar `%LOCALAPPDATA%\PlanosSanto\`. Sobre la 0.8.25:
- Veta por pieza (vertical en puertas y laterales; lado más largo en horizontales), editable con «Girar veta 90°» y coherente entre textura, Piezas, TXT y optimización.
- «Dibujar pieza»: rectángulo y espesor con mouse o medidas exactas, un solo Deshacer.
- Cabecera en una fila con estado y Opciones; sugerencias de nombres agrupadas con «×N».
- Preparada para SketchUp 2022 (Ruby 2.7, Chromium 88): **no probada en SketchUp 2022**.

Validar con `docs/validacion-0826/VALIDACION_LOCAL.md` y `docs/validacion-0826/SKETCHUP_2022.md`. Producción no aprobada.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.25 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
