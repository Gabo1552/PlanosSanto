# Candidata 0.8.23 — fichas desde materiales del modelo

Se corrige el acceso «Asociar a una ficha…», que abría Pintar. Ahora Materiales → En este modelo → Crear ficha desde material abre una ficha editable. Piezas también ofrece Crear ficha cuando identifica exactamente un material nativo sin ficha; las fichas existentes se editan en la biblioteca actual.

La previsualización lee directamente atributos conocidos de OpenCutList, sin exigir que esté instalado: tipo placa/canto, espesores, ancho de canto, formato de placa y veta cuando los valores tienen unidades explícitas y una interpretación inequívoca. Listas de espesores y anchos se conservan. Varios formatos, números sin unidad y tipos desconocidos requieren completar la ficha; no se adivinan.

Guardar vincula la ficha al mismo objeto material del modelo y archiva su SKM para reutilizar la apariencia. No pinta caras, cambia nombres nativos, UV, geometría ni atributos OCL. El nombre de ficha es independiente del nombre del material SketchUp. Los campos comerciales continúan sujetos a las validaciones existentes del pedido TXT.

La vinculación pertenece a una operación Deshacer de SketchUp; el catálogo permanente queda disponible aunque se deshaga la vinculación. Cancelar no crea fichas. Se rechazan solicitudes vencidas, cambios de modelo, versiones de biblioteca desactualizadas y materiales modificados desde la previsualización.

Se conservan motores de optimización, nombres, guías A4 y anotaciones. No se calibró el motor Experto en este cambio: siguen pendientes los ensayos controlados documentados en `docs/auditoria-experto-0822/ensayos`.

Estado: candidata para validación local. Las pruebas de nube utilizan dobles de la API y Chromium; no equivalen a ejecutar SketchUp 2026.
