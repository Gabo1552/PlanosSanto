# Entrega 0.8.30 — tope de muebles por guía de 100 a 500, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.30-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Sobre la 0.8.29: una guía puede tener hasta 500 muebles (antes 100), en la exportación, el guardado y los esquemas. Siguen los límites de 200.000 vértices o triángulos y de 5 MB por guía. Una guía de más de 100 muebles no abre en versiones anteriores. Validar con `docs/validacion-0830/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.29). Producción no aprobada; SketchUp 2022 sin probar.

---

# Entrega 0.8.29 — hoja A4 con listado agrupado, «Notas del armador» y encabezado compacto, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.29-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Sobre la 0.8.28: el listado de la hoja A4 agrupa las piezas iguales con su cantidad, hay un recuadro «Notas del armador» debajo de la lista y el encabezado es una franja baja que deja más lugar al mueble. Validar con `docs/validacion-0829/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.28). Producción no aprobada; SketchUp 2022 sin probar.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.28 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
