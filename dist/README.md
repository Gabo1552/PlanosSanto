# Entrega 0.8.38 — nombres en el campo «Definición» de los componentes, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.38-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. **Escribe en el modelo: probar sobre copias.** Sobre la 0.8.37: al guardar sincronizando nombres, cada componente lleva el nombre en los dos campos de Info. de entidad, «Instancia» y «Definición» (el que lista OpenCutList); si la definición la comparten piezas con nombres distintos o si otra definición ya se llama igual, queda solo en la instancia y la fila lo anota. Validar con `docs/validacion-0838/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.37). Producción no aprobada; SketchUp 2022 sin probar.

---

# Entrega 0.8.37 — herrajes en 3D: bisagras codo 0 y correderas en el modelo, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.37-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. **Escribe en el modelo: probar sobre copias.** Sobre la 0.8.36: en Piezas, «Colocar en el modelo» dibuja las bisagras codo 0 (con el lado elegido por puerta) y las correderas de cada cajón en un grupo propio por mueble, con la etiqueta «Planos Santo · Herrajes», en una operación de Deshacer. No toca las piezas; Piezas, guías y pedido no cambian. Validar con `docs/validacion-0837/VALIDACION_LOCAL.md` (más los pasos de 0.8.26 a 0.8.36). Producción no aprobada; SketchUp 2022 sin probar.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.36 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
