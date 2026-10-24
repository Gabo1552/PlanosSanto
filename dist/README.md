# Entrega 0.8.23 — fichas desde materiales del modelo, PENDIENTE DE VALIDACIÓN REAL

[Instalar candidata](PlanosSanto-0.8.23-candidata.rbz) · [SHA256](PlanosSanto-0.8.23-candidata.rbz.sha256) · [Paquete local](PlanosSanto-0.8.23-Validacion-Local.zip).

Materiales → En este modelo → Crear ficha desde material. Lee datos OCL disponibles y conserva la textura nativa. Permite completar placa o canto, sin abrir Pintar ni modificar las caras. También accesible desde Piezas. Sin dependencia de OpenCutList instalado.

[Cambios](../docs/validacion-0823/CAMBIOS.md) · [Resultados](../docs/validacion-0823/RESULTADOS.json) · [Validación local](../docs/validacion-0823/VALIDACION_LOCAL.md).

Cerrar todas las ventanas de SketchUp y reiniciar después de instalar. Validar primero con copia del modelo y biblioteca QA. No cambia la versión v4 del catálogo ni el motor Experto; su paridad comercial sigue pendiente.

---

# Entrega 0.8.22 — Experto/General y Santo Carpintero, PENDIENTE DE VALIDACIÓN REAL

[Instalar candidata](PlanosSanto-0.8.22-candidata.rbz) · [SHA256](PlanosSanto-0.8.22-candidata.rbz.sha256) · [Paquete local](PlanosSanto-0.8.22-Validacion-Local.zip).

Maderera por material y espesor, detalle individual y TXT. Experto usa la referencia suministrada y formato de la ficha; General es implementación propia sin dependencia de OpenCutList. Logo y colores originales de Santo Carpintero. Preserva guías A4, nombres, pintura y notas.

[Cambios y límites](../docs/validacion-0822/CAMBIOS.md) · [Pruebas](../docs/validacion-0822/RESULTADOS.json) · [Verificación local](../docs/validacion-0822/VALIDACION_LOCAL.md).

Cerrar todas las ventanas de SketchUp después de instalar y reabrir. Biblioteca sigue en v4: conservar respaldo. Validar ejecución nativa y proveedor antes de producción. Versiones anteriores intactas.

---

# Entrega 0.8.21 — correcciones de la revisión, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.21-candidata.rbz` sin descomprimirlo, con todas las ventanas de SketchUp cerradas antes de actualizar. Comprobar el SHA256 adjunto y respaldar la biblioteca: sigue siendo v4 y no la abren versiones hasta 0.8.19.

- PDF y TXT comparten códigos de canto por placa; la leyenda identifica placas con asignaciones diferentes.
- Importar bibliotecas conserva los cambios en listas de espesores y anchos.
- Activar giro revalida la exportación y habilita los TXT que caben girados.
- Las tapas salientes no impiden ocultar automáticamente las puertas.

[Pruebas y resultados](../docs/validacion-0821/RESULTADOS.json) · [Cambios](../docs/validacion-0821/CAMBIOS.md) · [Validación local](../docs/validacion-0821/VALIDACION_LOCAL.md).

Producción no aprobada. Las candidatas anteriores se conservan intactas.

---

# Entrega 0.8.20 — pintura nítida, varios espesores, visor 3D, piezas que se ven y maderera sólo optimización, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.20-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp, **respaldar `%LOCALAPPDATA%\PlanosSanto\` (la biblioteca migra a v4 y la 0.8.19 no la abre después)** y comprobar el `.sha256`. Sobre la 0.8.19:
- Barra, tira y cursores del pincel más grandes y nítidos.
- La placa vale para todos sus espesores; el despiece separa por el espesor real. Cantos con anchos 22 y 45.
- Muebles: girar, acercar, mover y separar piezas en el visor. Planos: siempre de frente y dibujo 3D sin superposiciones. Etiquetas ocultas.
- Piezas: clic encuadra y resalta en SketchUp; el resumen lleva a cada sección.
- Maderera: sólo optimización por placa (material + espesor) y un TXT por placa.

Validar con `docs/validacion-0820/ENCARGO_SESION_LOCAL_0820.md`. Producción no aprobada.

---

# Entrega 0.8.19 — Muebles y Planos separados, zócalo, cotas sin repetir y maderera optimizada, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.19-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp, respaldar `%LOCALAPPDATA%\PlanosSanto\` y comprobar el `.sha256`. Sobre la 0.8.18:
- Muebles (nombres y frente) y Planos (vistas, cotas y A4) separados; la abreviatura de la obra se edita siempre.
- Zócalo, piso, tapa y fondo se reconocen y se aplican solos; el frente se propone solo y alcanza para nombrar.
- Exterior/interior orientados desde el frente marcado.
- IDs ocultos por defecto en Planos; medidas iguales acotadas una sola vez; cotas que se tapan se reubican solas; el visor es la hoja A4.
- Maderera: optimización estimada de placas con diagramas, total de cantos y detalle por pieza plegado.

Validar con `docs/validacion-0819/ENCARGO_SESION_LOCAL_0819.md`. Producción no aprobada.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.18 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
