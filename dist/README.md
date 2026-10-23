# Entrega 0.8.19 — Muebles y Planos separados, zócalo, cotas sin repetir y maderera optimizada, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.19-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp, respaldar `%LOCALAPPDATA%\PlanosSanto\` y comprobar el `.sha256`. Sobre la 0.8.18:
- Muebles (nombres y frente) y Planos (vistas, cotas y A4) separados; la abreviatura de la obra se edita siempre.
- Zócalo, piso, tapa y fondo se reconocen y se aplican solos; el frente se propone solo y alcanza para nombrar.
- Exterior/interior orientados desde el frente marcado.
- IDs ocultos por defecto en Planos; medidas iguales acotadas una sola vez; cotas que se tapan se reubican solas; el visor es la hoja A4.
- Maderera: optimización estimada de placas con diagramas, total de cantos y detalle por pieza plegado.

Validar con `docs/validacion-0819/ENCARGO_SESION_LOCAL_0819.md`. Producción no aprobada.

---

# Entrega 0.8.18 — listado de piezas y nitidez, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.18-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp, respaldar `%LOCALAPPDATA%\PlanosSanto\` y comprobar el `.sha256`. Sobre la 0.8.17:
- Pestaña «Piezas» al estilo «Listado de partes»: resumen por material con Σ longitud, área y volumen, secciones de placa y de canto, avisos en rojo, Exportar CSV e Imprimir.
- Miniaturas de materiales a 512 px con promedio de área (antes 256 px por vecino más cercano).
- Barra y tira de pintura en la vista alineadas a píxel y con texto escalado.
- Íconos de la barra en SVG.

Validar con `docs/validacion-0818/ENCARGO_SESION_LOCAL_0818.md`. Producción no aprobada.

---

# Versiones anteriores

Las candidatas 0.8.7 a 0.8.17 y sus paquetes de validación se sacaron de `dist/` el 23/10/2026 para alivianar el repositorio. Siguen en el historial de git: `git log --diff-filter=D --name-only -- dist/` muestra el commit, y `git show <commit>^:dist/<archivo> > <archivo>` lo recupera.
