# Validación local de la candidata 0.7.4 — Codex local y Dot

Estado: **CANDIDATA; SIN APROBACIÓN DE PRODUCCIÓN**. La nube no ejecutó SketchUp ni verificó visualmente texturas reales. No utilizar runners históricos que sustituyan archivos del producto en memoria. Validar solamente el RBZ instalado, sin parches temporales.

## Preparación y evidencia

1. Registrar versión completa de SketchUp, Ruby y OpenCutList; sistema Windows y política de carga de extensiones. Conservar el RBZ 0.7.3 para reversión.
2. Copiar los modelos originales a una carpeta de validación. Calcular y registrar SHA256 de originales y copias antes de comenzar. **Nunca pintar los originales**. La aplicación de materiales cambia el SKP de trabajo deliberadamente; no hay respaldo automático completo del SKP en este agregado.
3. Respaldar el directorio local `PlanosSanto` de datos antes de comenzar. Normalmente está bajo `%LOCALAPPDATA%`; también puede resolverse por `%APPDATA%` o el directorio de usuario. La consola permite consultar `PlanosSanto::CatalogStore.default_directory`. `PLANOS_SANTO_DATA_DIR` es una configuración opcional del controlador.
4. Verificar el SHA256 del RBZ contra su archivo `.sha256`, instalarlo desde el Administrador de extensiones, **cerrar todas las ventanas de SketchUp y reiniciar**. Registrar `PlanosSanto::Release::VERSION` y hashes de los archivos instalados contra `planos_santo/manifest.json`.
5. Elegir un modelo rectangular simple con materiales y texturas reales del taller, una copia de BM17, componentes rotados/espejados y un caso con definición compartida en dos muebles. Guardar capturas antes/después, logs y resultados por paso.

## Contratos que deben comprobarse

- Pieza: ruta completa de `persistent_id` de instancias, separada por `/`. Cara: `persistent_id` dentro de la pieza. El ID de definición o el nombre no sustituyen a esa ruta.
- Un material nativo tiene ID de ejecución y un UUID propio persistente. La asociación comercial está en el atributo JSON `PlanosSantoMaterial` / `binding_v1`, con `schema:1`, `uuid`, `catalogId`, `kind` y `catalogFingerprint`. No se escriben atributos `ladb_opencutlist`.
- El UUID identifica el material, **no un lado de fabricación**. Los lados del pedido se reconstruyen desde las caras realmente pintadas y los ejes U/V, signo de frente y espejado confirmados; girar cámara A4 no debe cambiarlos.
- Catálogo comercial: `catalog.json` schema 1 sin campos nuevos. Biblioteca visual: `material-assets.json` schema 1, revisión independiente; SKM reales privados bajo `material-assets/<sha256>.skm`. Respaldos JSON bajo `backups/`.
- Un archivo SKM ausente, alterado, un SKU no aprobado o una asociación obsoleta nunca habilitan una textura ficticia. La vinculación de un material existente puede ser válida aunque no se pueda exportar su SKM; el activo global queda pendiente.
- No se asignan equivalencias por nombre o color. Reemplazar una asociación o un activo visual anterior necesita su confirmación específica.
- Cancelar o abrir una previsualización no pinta caras ni escribe metadatos. Aplicar es una operación nativa única con Undo. Crear una vinculación o instalar un SKM es otra operación explícita; no confundirlas con la aplicación de pintura.

## Secuencia reproducible

### A. Biblioteca permanente y autonomía

1. Revisar/aprobar una placa y dos cantos del catálogo, con SKU, proveedor, medidas y compatibilidades reales. Los precios pueden permanecer vacíos. Comprobar favoritos y filtro de búsqueda.
2. En «Pintar placas y cantos», asociar la placa a un material real existente, con confirmación. Comprobar que no se pintaron caras, no cambió el color ni la textura de ese material y no se tocaron los atributos OCL.
3. Repetir para ambos cantos. Materiales homónimos deben poder distinguirse por su identidad; no debe asociarse automáticamente el otro.
4. Crear otro proyecto y usar «Instalar visual guardado». Verificar visual/textura real, asociación comercial y UUID nuevo. Repetir la instalación: no debe crearse un duplicado silencioso.
5. Probar también «Instalar archivo SKM…» con un archivo real y cancelar su selector. Cancelar no cambia el modelo. Si SketchUp devuelve un material existente, el sistema debe pedir vinculación explícita.
6. Respaldar y retirar temporalmente un SKM global; el activo debe quedar pendiente, sin crear un color de reemplazo. Restaurar el archivo. Repetir un reemplazo de asociación y de visual con y sin sus confirmaciones.
7. En un perfil de prueba, desactivar temporalmente OCL, reiniciar y repetir lectura/pintado de materiales propios. No desinstalar OCL ni alterar el perfil productivo. Registrar por separado el caso de OCL heredado compatible y el conflicto de tipos propios/OCL.

### B. Pieza, caras, previsualización y pintado

1. Elegir la pieza por lista y luego desde la selección de SketchUp. Para seleccionar caras de una aparición compartida, entrar en su contexto de edición; registrar ruta y caras seleccionadas.
2. Cambiar giro/inclinación del selector, elegir caras amplias explícitas y placa. Probar frente, dorso y ambos. Comprobar que nombres/materiales existentes de las caras se ven correctamente en lista/visor.
3. Previsualizar: verificar material, caras resaltadas y **todas** las rutas afectadas. Cancelar; comparar geometría, materiales, atributos y estado modificado del modelo.
4. Aplicar confirmado, observar material real en el viewport de SketchUp. Deshacer inmediatamente: caras y metadatos del modelo deben volver al estado anterior. Reaplicar y guardar la copia.
5. Seleccionar caras estrechas para un canto, confirmar U/V locales y aplicar; aplicar un segundo canto a otra cara. Probar caras frontal/posterior diferentes. Una cara amplia o un plano de corte inválido no debe admitirse como canto.
6. Cambiar la selección, geometría o material después de previsualizar: el token debe invalidarse; no aceptar una previsualización antigua. Repetir con contenedor bloqueado.

### C. Definiciones compartidas y límites explícitos

1. En dos muebles con la misma definición de pieza, elegir «Pintar todas las ocurrencias compartidas». Verificar lista completa de rutas, confirmar y comprobar que se pintaron las apariciones anunciadas. Undo revierte todas.
2. Repetir con «Hacer única esta ocurrencia». Solo está disponible cuando se puede aislar con seguridad toda la ruta: no promete aislar automáticamente ancestros compartidos o referencias fuera de la jerarquía activa. Si se bloquea, hacer única la estructura necesaria **manualmente en SketchUp**, volver a analizar y repetir.
3. Cuando el aislamiento está permitido, comparar transformaciones, cotas y topología antes/después; solo debe diferir la definición/material de la aparición elegida. Verificar Undo de aislamiento y pintado como una operación.
4. Probar componentes anidados, rotación 90°, espejo, dos piezas con igual nombre y pieza sin nombre. Registrar rechazos por geometría irregular/ambigua como validaciones, sin forzar su aceptación.
5. Simular fallos solo en una copia aislada si se dispone de un runner aprobado: operación abortada no debe dejar pintura parcial ni un índice visual activo parcialmente publicado. No modificar Plugins ni el producto para convertir un fallo en aprobado.

### D. Persistencia, guías y pedido

1. Guardar/cerrar/reabrir el SKP de prueba y comprobar caras reales, UUID, asociación y catálogo. Una referencia de sesión vieja no debe utilizarse después de reanalizar.
2. Regenerar las guías tras pintar. Conservar los nombres individuales, los textos de notas, anclajes, cámara exterior/interior, ocultamientos por ruta y zoom. Las caras pintadas deben seguir siendo reales en SketchUp.
3. Revisar el pedido: la placa y cantos propios pueden proponer su SKU exacto; no deben autoaprobar U/V, frente, veta, medidas terminadas o códigos de lados. Confirmar cada dato de fabricación.
4. Con placa y dos roles de canto seleccionados, comparar `arr`, `aba`, `izq`, `der` con las caras del modelo. Repetir girando cámara A4 y con una pieza espejada; documentar resultados.
5. Generar TXT de **prueba** por lote: nueve columnas exactas, códigos 0/1/2, cantidades, milímetros, roles y manifiesto de trazabilidad. Un canto propio no puede sustituirse silenciosamente por otro SKU. Los conflictos propio/OCL deben bloquear, también si se intenta saltar a resolución manual.
6. Ejecutar el validador `python scripts/validar_txt.py <archivo.txt>` del paquete. No subir pedidos a un proveedor sin autorización explícita; aceptación del proveedor queda separada.
7. Repetir BM17: 17 unidades, una vista exterior y dos vistas A4, nota con flecha, ocultamientos interiores por ruta. Cada PDF debe tener una hoja de 297 × 210 mm. Revisar cotas del arreglo 0.7.3 visualmente, sin texto tapado y sin tablas truncadas. Si la tabla sin agrupar no cabe, debe bloquear y ofrecer ajustes; no agregar hojas automáticamente.
8. Regresión de nombres: agrupar/guardar/reabrir/desagrupar sin edición conserva nombres físicos; editar una fila cambia solo sus miembros; Undo restaura nombres y guía. Materiales/cantos no deben alterar ese contrato.

## Entrega de resultados

Entregar un ZIP local con versión/hash del RBZ, entorno, lista de casos PASS/FAIL/NO_EJECUTADO, pasos exactos, logs de consola, hashes originales/finales, copias de diagnóstico, PDF A4 real, capturas del viewport/texturas y TXT/manifiesto de prueba. No adjuntar bibliotecas privadas o modelos a servicios externos sin autorización. No completar una aprobación a partir de dobles automatizados de la nube.

**Aprobación de producción:** pendiente de estos resultados nativos y de revisión visual de Dot; la aceptación de la maderera, cuando corresponda, es un hito independiente.
