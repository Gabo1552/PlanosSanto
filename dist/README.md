# Entrega 0.8.26 — vetas, Dibujar pieza, cabecera compacta, nombres agrupados y preparación para SketchUp 2022, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.26-candidata.rbz` sin descomprimirlo y comprobar el `.sha256`. Antes de actualizar, cerrar SketchUp y respaldar `%LOCALAPPDATA%\PlanosSanto\`. Sobre la 0.8.25:
- Veta por pieza (vertical en puertas y laterales; lado más largo en horizontales), editable con «Girar veta 90°» y coherente entre textura, Piezas, TXT y optimización.
- «Dibujar pieza»: rectángulo y espesor con mouse o medidas exactas, un solo Deshacer.
- Cabecera en una fila con estado y Opciones; sugerencias de nombres agrupadas con «×N».
- Preparada para SketchUp 2022 (Ruby 2.7, Chromium 88): **no probada en SketchUp 2022**.

Validar con `docs/validacion-0826/VALIDACION_LOCAL.md` y `docs/validacion-0826/SKETCHUP_2022.md`. Producción no aprobada.

---

# Entrega 0.8.25 — interfaz del taller, pendiente de validación nativa

[Instalar candidata](PlanosSanto-0.8.25-candidata.rbz) · [SHA256](PlanosSanto-0.8.25-candidata.rbz.sha256) · [Paquete local](PlanosSanto-0.8.25-Validacion-Local.zip).

Guardar y exportar arriba, herramientas secundarias integradas en Materiales, tipo Herraje, revisión de nombres con búsqueda y acciones fijas. Piezas abre la optimización del material; Maderera incorpora navegación y ampliación de placas. Balde único para placas/cantos y acceso a Crear componente. A4 conserva la maquetación horizontal después de comparar alternativas.

[Cambios y decisión A4](../docs/validacion-0825/CAMBIOS.md) · [Validación local](../docs/validacion-0825/VALIDACION_LOCAL.md). Reiniciar SketchUp después de instalar. La biblioteca con herrajes requiere 0.8.25 o posterior.

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

Las candidatas 0.8.7 a 0.8.24 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
