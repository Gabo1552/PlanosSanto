# Entrega 0.8.36 — herrajes calculados por el nombre de las piezas, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.36-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Sobre la 0.8.35: las piezas llamadas «Puerta» suman bisagras (según su alto) y tirador, y los «Frente cajón»/«Fte» un par de correderas (según la profundidad del mueble) y tirador. Se ven en Piezas, salen en el CSV y en el paquete de obra, con la ficha de herraje de la biblioteca si la hay. No se dibujan en el modelo. Validar con `docs/validacion-0836/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.35). Producción no aprobada; SketchUp 2022 sin probar.

---

# Entrega 0.8.35 — paquete de obra para App Santo, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.35-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Sobre la 0.8.34: en Piezas, «Paquete de obra» guarda un JSON con todos los muebles y piezas (ubicación, medidas y material) para el visor 3D de avance de obra de App Santo. El contrato está en `docs/integracion-app-santo/OBRA_JSON.md`. Validar con `docs/validacion-0835/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.34). Producción no aprobada; SketchUp 2022 sin probar.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.34 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
