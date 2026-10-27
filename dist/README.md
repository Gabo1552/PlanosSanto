# Entrega 0.8.24 — corrección del motor Experto, pendiente de validación nativa

[Instalar candidata](PlanosSanto-0.8.24-candidata.rbz) · [SHA256](PlanosSanto-0.8.24-candidata.rbz.sha256) · [Paquete local](PlanosSanto-0.8.24-Validacion-Local.zip).

A/B/C bajan de dos placas a una. Los cuatro pedidos pasan de 29/13/13/57 a 28/12/13/56 (proveedor: 27/11/12/56). La equivalencia comercial sigue pendiente. Conserva los materiales de 0.8.23.

[Cambios y resultados](../docs/validacion-0824/CAMBIOS.md) · [Validación local](../docs/validacion-0824/VALIDACION_LOCAL.md).

# Entrega 0.8.23 — fichas desde materiales del modelo, PENDIENTE DE VALIDACIÓN REAL

[Instalar candidata](PlanosSanto-0.8.23-candidata.rbz) · [SHA256](PlanosSanto-0.8.23-candidata.rbz.sha256) · [Paquete local](PlanosSanto-0.8.23-Validacion-Local.zip).

Materiales → En este modelo → Crear ficha desde material. Lee datos OCL disponibles y conserva la textura nativa. Permite completar placa o canto, sin abrir Pintar ni modificar las caras. También accesible desde Piezas. Sin dependencia de OpenCutList instalado.

[Cambios](../docs/validacion-0823/CAMBIOS.md) · [Resultados](../docs/validacion-0823/RESULTADOS.json) · [Validación local](../docs/validacion-0823/VALIDACION_LOCAL.md).

Cerrar todas las ventanas de SketchUp y reiniciar después de instalar. Validar primero con copia del modelo y biblioteca QA. No cambia la versión v4 del catálogo ni el motor Experto; su paridad comercial sigue pendiente.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.22 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
