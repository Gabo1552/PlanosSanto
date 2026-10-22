# Entrega 0.8.16 — menos pasos: pedido sin tildes, guía sin diálogos y pestaña Piezas, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.16-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp y comprobar el `.sha256`. Sobre la 0.8.15:
- El pedido se propone y se guarda solo, sin tildes, con un solo «Exportar TXT».
- Las fichas se marcan como «completas» de forma automática.
- La guía y la pintura ya no tienen diálogos ni casillas de confirmación.
- Pestaña «Piezas» por material y espesor, al estilo OpenCutList.

Validar con `docs/validacion-0816/ENCARGO_SESION_LOCAL_0816.md`. Producción no aprobada.

---

# Entrega 0.8.15 — pintar sin ventanas y sin pasos previos, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.15-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp y comprobar el `.sha256`. Sobre la 0.8.14:
- «Pintar» de la barra pinta sin abrir ventanas: el modo y el material se eligen en la vista 3D o en la bandeja Materiales de SketchUp.
- Ya no aparece el error de copia de seguridad en Windows al modificar la biblioteca.
- Se puede pintar sin analizar, y el análisis se rehace solo.
- El canto ya no está atado a la placa.

Validar con `docs/validacion-0815/ENCARGO_SESION_LOCAL_0815.md`. Producción no aprobada.

---

# Entrega 0.8.14 — corrección del F0 nativo de la 0.8.13 (fotos rechazadas), PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.14-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp y comprobar el `.sha256`. Sobre la 0.8.13:
- La foto se decodifica con la copia temporal cerrada. En Windows, `ImageRep#load_file` falla si el archivo sigue abierto, y por eso toda foto válida se rechazaba.
- `ALT_MASK` queda definida una sola vez.
- El verificador espera los 5 cursores y la versión 0.8.14.

Validar con `docs/validacion-0814/ENCARGO_SESION_LOCAL_0814.md`, empezando por F0–F3. `PlanosSanto-0.8.14-Validacion-Local.zip` trae los anexos, la guía, el verificador y los checklists de cada hito. No se instala. Producción no aprobada.

---

# Entrega 0.8.13 — 0.8.12 + latencia del pincel, fix del cuentagotas y empaquetado seguro, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.13-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp y comprobar el `.sha256`. Sobre la 0.8.12 suma:
- Línea base de latencia del pincel (PINTURA-09).
- La tecla del cuentagotas ya no se revierte si se cambia con el pincel detenido.
- Los scripts de empaquetado sólo toman archivos versionados en git y usan las rutas al día.

`PlanosSanto-0.8.13-Validacion-Local.zip` trae los anexos 0.8.13 y 0.8.12, la guía 0.8.11, el verificador (ahora espera la 0.8.13) y los checklists de cada hito. No se instala. Todo se probó con dobles de la API, no en SketchUp. Producción no aprobada.

---

# Entrega 0.8.12 — 0.8.11 + Hito 3 completo, cierre del Hito 4 y orden del repositorio, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.12-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp y comprobar el `.sha256`. Sobre la 0.8.11 suma:
- Hito 3: correcciones de la revisión de la interfaz.
- Hito 4: cierre de la revisión y checklist nativo (H4-1 a H4-15).
- Hito 5: referencias parciales que no dependen del perfil del TXT.
- Hito 6: huella del inventario por definición. En el banco simulado, el clic en modo Cara o lote baja de 434 a 93 ms.
- Hito 7: fichas archivadas fuera de la paleta.
- Accesibilidad de la biblioteca de materiales (axe sin exclusiones).
- Sugerencia «Listón» para listones comunes.
- Orden del repositorio.

`PlanosSanto-0.8.12-Validacion-Local.zip` trae el anexo 0.8.12, la guía 0.8.11, el verificador (ahora espera la 0.8.12) y los checklists de cada hito. No se instala. Todo se probó con dobles de la API, no en SketchUp. Producción no aprobada.

---

# Entrega 0.8.11 — candidata noche (Hitos 1 a 7), PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.11-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp y comprobar el `.sha256`. Sobre la 0.8.10 suma:
- Hito 2: pincel diario completo (cursores, cantos y sincronización con el modelo).
- Hito 3: pedido desde el modelo, con propuesta, confirmación en bloque y código módulo·pieza.
- Hito 4: perfil de maderera, presupuesto y catálogo v2.
- Hito 5: codificar el despiece, etiquetas y referencias parciales.
- Hito 6: análisis desactualizado sin reescaneo automático y caché de malla.
- Hito 7: materiales, paquetes y pincel avanzado (cuentagotas, recientes, profundidad, varias caras por lado).
- Mejoras de UI/UX en las pantallas extra.

`PlanosSanto-0.8.11-Validacion-Local.zip` trae la guía por riesgo, el verificador de solo lectura y el encargo para la sesión local. No se instala. Todo se probó con dobles de la API, no en SketchUp. Producción no aprobada.

---

# Entrega 0.8.10 — candidata Hito 1 = 0.8.9 + mejoras, PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.10-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp. Es la 0.8.9 sin cambios, más cuatro mejoras: clic sin huella geométrica (V19), clic cerca del borde del canto, una sola paleta abierta y verificador con diagnóstico de foto. `PlanosSanto-0.8.10-Validacion-Local-Hito1.zip` trae la guía 0.8.9 completa y el anexo `VALIDACION_0810.md`. No se instala. Validar esta candidata en lugar de la 0.8.9. Producción no aprobada.

---

# Entrega 0.8.9 — correcciones Hito 1, candidata sin aprobación nativa

Instalar `PlanosSanto-0.8.9-candidata.rbz` tras cerrar TODAS las ventanas de SketchUp. Comprobar `.sha256`. `PlanosSanto-0.8.9-Validacion-Local-Hito1-Correcciones.zip` contiene fuentes reproducibles, pruebas, perfil sintético y VALIDACION_LOCAL.md. El ZIP no se instala.

0.8.8: resultado local NO APROBADO (10PASS/4FAIL/5PENDIENTE); esa evidencia no aprueba 0.8.9. Repetir fotos/UV/SKM/persistencia/Undo/rendimiento. No Hito2; sin modelos/materiales/fotos privados.

---

# Entrega 0.8.8 — candidata Hito 1 (Pintura Inteligente), PENDIENTE DE VALIDACIÓN REAL

Instalar `PlanosSanto-0.8.8-candidata.rbz` sin descomprimirlo. Antes de actualizar, cerrar todas las ventanas de SketchUp. El archivo `.sha256` permite verificar el instalador.

`PlanosSanto-0.8.8-Validacion-Local-Hito1.zip` trae, para Dot/Codex local:
- la batería V1–V19 (`VALIDACION_SKETCHUP_088.md`);
- el verificador de solo lectura (`verificar_088_sketchup.rb`);
- el informe del hito;
- capturas **sintéticas** (no provienen de SketchUp).

El ZIP no se instala. No incluye modelos, fotos ni materiales privados del taller. La candidata no está aprobada para producción hasta completar la batería.

---

# Entrega 0.8.7 — candidata para validar

Instalar `PlanosSanto-0.8.7-candidata.rbz`, sin descomprimir. Cerrar todas las ventanas de SketchUp antes de actualizar. El archivo `.sha256` permite comprobar el instalador.

El ZIP de validación incluye fuentes reproducibles, pruebas, capturas sintéticas, PDFs de ensayo y pasos para Dot/Codex local. No se instala el ZIP. La captura no procede de SketchUp Windows.

No se incluyen modelos, fotos ni materiales privados del taller. La candidata aún requiere validación nativa; no está aprobada para producción.

`artifacts/PlanosSanto-0.5.3.rbz` es únicamente una versión pública congelada requerida por `warm_update_test.rb`; no instalar esa versión antigua.
