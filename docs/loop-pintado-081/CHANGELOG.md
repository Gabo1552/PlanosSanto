# 0.8.1 — corrección de preferencias de Pintado directo

Corrige el defecto P2 informado en SketchUp26.2.243/Ruby3.2.2: las cadenas JSON escritas con write_default podían provocar SyntaxError al recuperarse mediante read_default.

Las preferencias nuevas se guardan bajo smart_paint_settings_v2 como una cadena ps2: seguida de Base64 estricto de un sobre JSON con schema2. Así no contiene las comillas internas del JSON original. Se conserva UTF-8 y no se ejecuta eval en el producto.

Solo se guardan modo, material comercial, tipo de reemplazo, ejes, lado, alcance y modo lote. Confirmación, permiso compartido y UUID propios del proyecto siguen excluidos.

Lectura de v1 válida se mantiene sin escrituras. Si la API no puede leer el dato v1 o está dañado, se devuelve configuración vacía sin modificarlo: elegir nuevamente los ajustes y Activar crea el nuevo registro seguro. No se promete recuperar datos que la API nativa ya no puede leer. Un sobre v2 inválido falla de forma segura sin sobrescribir preferencias.

No cambia geometría, pintado, UV, catálogo/SKM, Undo, PDF A4, nombres, anotaciones o TXT. Catálogo y guías conservan sus esquemas; schema2 corresponde solo al nuevo registro de preferencias. La0.8.0 y sus informes permanecen intactos.

Cerrar todas las ventanas de SketchUp para actualizar. Para volver, reinstalar la versión anterior con SketchUp cerrado. El registro v1 no se borra; versiones antiguas no leen v2. La0.8.1 necesita confirmación real de la regresión de preferencias; no hereda automáticamente la aprobación de otras versiones.
