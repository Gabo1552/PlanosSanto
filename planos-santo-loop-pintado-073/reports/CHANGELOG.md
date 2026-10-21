# 0.7.4 — candidata de pintado, 2026-10-19

- Aplicar un material ya presente informa Sin cambios y conserva la guía y la pila Undo.
- Pintado nativo por cara y ruta física, con vista previa, alcance compartido explícito y operación Undo.
- Aislamiento de una instancia hoja cuando sus ancestros permiten hacerlo de manera comprobable; casos ambiguos se bloquean.
- Biblioteca visual permanente con archivos SKM reales, vinculados explícitamente al catálogo comercial existente; revisión, hashes y backups.
- Lectura independiente de OpenCutList de asociaciones propias y compatibilidad heredada conservadora. Conflictos y vínculos comerciales obsoletos bloquean producción.
- Pedido propone materiales observados sin confirmar automáticamente ejes, frente, medidas, veta ni roles. TXT mantiene nueve columnas exactas y lotes compatibles.
- Selector de caras con materiales reales, filtros, favoritos, ayudas y confirmación de las rutas afectadas.
- Se conservan PDF A4, cotas, cámaras, ocultamiento, nombres y anotaciones. No se cambia el esquema de guías ni catálogo.

## Migración y vuelta atrás

No hay migración destructiva del catálogo schema 1 ni de `guide_v1`. Se agrega metadata `PlanosSantoMaterial/binding_v1` a materiales confirmados y un índice `material-assets.json` junto al catálogo global. Los activos están en `material-assets/`, identificados por SHA256.

Antes de instalar: cerrar SketchUp completamente; conservar el RBZ 0.7.3 y copias del SKP y de la carpeta de datos PlanosSanto. Ensayar únicamente sobre copias.

Para volver: cerrar SketchUp y reinstalar el RBZ anterior mediante el Administrador de extensiones. Recuperar los respaldos del catálogo/índice y el SKP de prueba si se desea revertir el estado completo. No borrar Plugins ni texturas a mano. Undo del modelo revierte la operación nativa, pero no borra archivos visuales archivados en la biblioteca global.

## Estado

PENDIENTE DE PRUEBA NATIVA EN SKETCHUP 2026. No aprobada para producción. Las pruebas Linux con dobles no verifican texturas, instalación Windows, interacción con el modelo real ni Undo nativo.
