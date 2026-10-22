# Planos Santo

**Candidata actual 0.8.9 — correcciones Hito 1:** [RBZ](dist/PlanosSanto-0.8.9-candidata.rbz), [SHA256](dist/PlanosSanto-0.8.9-candidata.rbz.sha256), [paquete para Dot/Codex local](dist/PlanosSanto-0.8.9-Validacion-Local-Hito1-Correcciones.zip), [validación local](docs/hito1-correcciones-089/VALIDACION_LOCAL.md) y [evidencia real recibida de 0.8.8](docs/hito1-correcciones-089/EVIDENCIA_LOCAL_088.md).

Corrige ImageRep nil de fotos, colisión SKM sin vincular materiales por nombre, sincronización de paletas e inventarios duplicados. Pruebas automatizadas aprobadas; **candidata aún no validada en SketchUp**. La 0.8.8 no fue aprobada (10 PASS/4 FAIL/5 pendientes). No iniciar Hito 2. Se conservan A4, notas, nombres, materiales/cantos y TXT. No se publican archivos privados.

Para desarrollo: `npm ci`, `npm run verify`; Node 24, Ruby 3.2+, Python 3, Chromium y Poppler. `npm run dev` inicia la web. El archivo `artifacts/PlanosSanto-0.5.3.rbz` es un fixture de prueba de actualización, no el instalador actual.

## Información histórica de los flujos anteriores

Las secciones siguientes conservan el historial del exportador web y versiones anteriores; para el uso actual, seguir los enlaces de la candidata 0.8.9 de arriba.

Plan: [migración a SketchUp](docs/historico/PLAN_DESARROLLO_EXTENSION.md). Estado operativo: [tareas de la extensión](sketchup_offline/TASKS.md). La aceptación exige probar el RBZ con un modelo real, cinco medidas, guardar/cerrar/reabrir y PDF impreso.

Web y extensión de guías de armado con vistas ortográficas ensambladas configurables, notas con flechas persistentes y PDF A4 horizontal (una hoja por mueble).

**Historial de exportación real recibida (flujo web 0.2/0.3).** El usuario ejecutó la extensión 0.2 en SketchUp 26.2.243 y aportó JSON/informe/CSV. Se importó un mueble con 8 piezas, se verificaron las 24 medidas entre CSV/JSON/geometría y se generó su PDF A3. La comparación manual contra mediciones en SketchUp sigue pendiente. La versión 0.3 agrega un único ZIP y descarga/instalación desde la web; esa versión nueva aún necesita ejecución en Windows.

## Extensión para SketchUp 2026

Descargable generado: `artifacts/PlanosSanto-0.3.0.rbz` y su SHA256. El exportador anterior queda en `/instalar/web`, con descarga mediante `/api/extension`. **Instalar extensión** abre ahora `/instalar` y descarga el editor actual mediante `/api/extension/offline`. No descomprimir el RBZ. Las instrucciones para instalar, exportar localmente, comparar cinco medidas y después habilitar el envío están en [sketchup/PRUEBA_SKETCHUP_2026.md](sketchup/PRUEBA_SKETCHUP_2026.md).

1. Instalar el RBZ mediante el Administrador de extensiones de SketchUp.
2. Abrir el archivo real y usar **Enviar a Planos Santo** para analizar/revisar la jerarquía y seleccionar los padres que representan muebles.
3. Elegir **Guardar ZIP para la web**. Se genera un único `.planos-santo.zip` con geometría, medidas e informe. No se modifica ni se guarda el `.skp` original. La versión anterior sigue admitida.
4. En la web, arrastrar el ZIP o usar **Elegir archivo**. También se aceptan los JSON anteriores y archivos .skp. El ZIP listo se procesa sin descomprimirlo manualmente; conserva jerarquía, malla, transformaciones, materiales, visibilidad e IDs por ruta de instancias. La fuente se muestra como `SKETCHUP · EXTENSIÓN RUBY`; la DEMO original conserva su rótulo.
5. Tras validar el JSON y las medidas reales, se puede habilitar el envío directo con una clave de taller y un código temporal de un uso. Se envía el JSON, no el binario `.skp`.

La ruta antigua de carga directa `.skp` al servidor permanece disponible con su adaptador C SDK, pero no tiene lector instalado. **El nuevo flujo Ruby no requiere C SDK**: la lectura ocurre dentro de SketchUp de escritorio. No son la misma vía de importación.

## Desarrollo y pruebas

Next.js 15, React 19, TypeScript, Three.js para geometría/proyección, SVG compartido para anotaciones/impresión, Playwright/Chromium y pdf-lib para A3 físico exacto. Persistencia JSON en disco.

Requisitos: Node.js 22+ (verificado con 24), npm, Chromium, Poppler (`pdftotext`), Python 3.12 y Ruby 3.2+ con Minitest/JSON/CSV/OpenSSL. Los tests actuales usan Ruby 3.3.7 de Linux, no el intérprete de SketchUp.

```sh
cd /workspace/PlanosSanto
bash scripts/setup.sh
npm run dev
```

`setup.sh` usa `npm ci`, prepara un Ruby de pruebas aislado si no existe, verifica Chromium/Poppler y compila. El fallback Ruby se descarga de la distribución oficial y valida su SHA256 antes de compilar en `/workspace/.tools`; no escribe en carpetas del sistema ni desactiva verificación TLS. Los logs de compilación de ese fallback están en `/tmp/planos-ruby-setup.log`. Puede usarse un Ruby existente mediante `RUBY_BIN`.

Para producción local: `npm run build` y `npm start`. Usar un solo proceso Node para esta persistencia. No iniciar desarrollo y producción simultáneamente ni compilar mientras se ejecutan E2E contra producción.

```sh
npm run verify
npm run package:rbz
```

`verify` ejecuta ESLint, pruebas Ruby, Vitest, build, tipos, E2E web, contratos Ruby/JS del editor offline y empaquetado/CRC de ambos RBZ. El puerto 3000 debe estar libre: Playwright levanta/cierra su propio servidor. Los E2E usan `/tmp/planos-santo-e2e`, separados de los proyectos de taller. El código de prueba Ruby genera un fixture sintético claramente identificado; no abre archivos `.skp`.

Para la extensión local: `npm run verify:offline`. Para verificar el nuevo PDF con la exportación privada real ya aportada: `npm run verify:offline:real` (requiere sus JSON en `fixtures/private/`; falla si no existen). `npm run build` y `predev` generan ambos instaladores. En la PC del taller solo se instala el RBZ: no necesita Node, Ruby aparte, Chromium externo ni servidor. El PDF local usa pdf-lib y fuentes incluidas, con pruebas de formato, contenido y bloqueo de desbordamientos; no usa LayOut.

El Chromium administrado de este host bloquea `file://`. Los tests del editor sirven los mismos bytes empaquetados mediante interceptación de solicitudes con la red desconectada y ejecutan el controlador Ruby por stdio con un doble de SketchUp. Esto verifica el editor/contrato/PDF; `HtmlDialog#set_file` y el guardado físico del SKP quedan pendientes de Windows.

Evidencias: `artifacts/demo-armado-A3.pdf`, `artifacts/ruby-contract-A3.pdf`, capturas y RBZ. Los PDFs se cuentan/miden y se verifica texto real con Poppler; se inspeccionaron también imágenes rasterizadas. El PDF del modelo real aportado es `artifacts/CA-AmSurrbac-Grupo13-A3.pdf`; el ZIP listo es `artifacts/CA-AmSurrbac-PlanosSanto.zip`. Los otros PDFs identificados como contrato/DEMO siguen siendo sintéticos. El RBZ se genera con una lista explícita de ocho archivos, sin el modelo privado ni tests. El ZIP del proyecto es otro archivo: contiene la exportación del mueble y se sube a la web, no se instala.

## Uso del editor

Elegir un proyecto DEMO o importar/exportar desde Ruby. Seleccionar mueble/pieza, renombrar sin editar medidas, agregar nota y anclar su flecha sobre una superficie. Mover tarjetas arrastrando o mediante flechas del teclado; editar/reanclar/eliminar desde el panel. El guardado es automático o con «Guardar ahora». Reabrir desde «Proyectos guardados».

Cada Pxx identifica una instancia física, cantidad 1. Las definiciones repetidas no se fusionan. Las dimensiones usan la geometría local y la escala acumulada, con conversión a mm. Ruby comprueba cierre, planos de caja y volumen antes de clasificar una pieza rectangular; las formas ambiguas muestran advertencias de envolvente. Las transformaciones sesgadas/escalas nulas se rechazan.

Cada mueble produce una sola A3 de 420 × 297 mm con todas las etiquetas, piezas y notas. Si no cabe legiblemente, la exportación se bloquea con explicación; no recorta filas ni achica texto para forzar el formato. El despiece es radial/ilustrativo y puede requerir revisar oclusiones en modelos complejos.

## Persistencia y configuración

`data/` contiene proyectos JSON con escritura temporal/reemplazo atómico. UUID restringen rutas; revisiones impiden sobrescrituras silenciosas entre clientes del mismo proceso. Las medidas/geometría no se editan desde el cliente. La exportación Ruby original queda dentro del proyecto, junto a los datos del editor. Cada carga crea un proyecto nuevo y conserva los anteriores; no se fusionan anotaciones entre reimportaciones. Respaldar `data/`.

| Variable | Uso |
| --- | --- |
| `PROJECT_DATA_DIR` | Carpeta de proyectos; por defecto `data/`. |
| `CHROMIUM_PATH` | Ejecutable Chromium; se usa `/usr/bin/chromium` si existe. |
| `PORT` | Puerto del servidor y de la vista interna de impresión; 3000 por defecto. |
| `RUBY_BIN` | Ruby para tests; usa el aislado de `/workspace/.tools/ruby/bin/ruby` si existe. |
| `SKETCHUP_READER_BIN` | Lector C SDK opcional de la ruta antigua. No hace falta para la extensión Ruby. |
| `PLANOS_BRIDGE_KEY` | Secreto real del proceso servidor, mínimo 32 caracteres aleatorios; habilita emisión de códigos para envío directo. No se guarda en código, modelo, JSON ni navegador persistente. Sin esta variable sigue funcionando la importación del JSON local. |

El código temporal vence en cinco minutos, se consume en un intento y se almacena como hash. Se vincula al host del taller. El envío Ruby verifica TLS y nombre del servidor, rechaza redirecciones y no reintenta automáticamente. HTTP solo se permite por loopback en la misma PC. No usar placeholders de secretos de proxy para `PLANOS_BRIDGE_KEY`: su comparación ocurre dentro del servidor.

Este prototipo sigue destinado a un taller/red confiable y no tiene autenticación completa ni aislamiento entre usuarios. El control de vinculación protege la entrega de la extensión; no convierte las demás rutas del editor en un servicio público multiusuario. No se desplegó ni abrió un túnel. SketchUp en Windows necesita una URL HTTPS accesible para enviar a un servidor de nube; su `localhost` no es el de `/workspace`.

## Muestra y pendientes reales

`fixtures/private/CA AmSurrbac (1).skp` está excluido de Git. Se verificó su hash original y no se incluyó en el RBZ. Solo se inspeccionó la cabecera; no se usaron rótulos/materiales del ZIP para inventar geometría ni cantidades.

La instalación/ejecución 0.2 en Windows fue reportada por el usuario y está respaldada por la exportación aportada. Queda comparar cinco tablones físicamente en SketchUp, validar todas las agrupaciones del proyecto y probar la nueva 0.3 en Windows. El envío HTTPS desde esa PC también queda pendiente. Los detalles están en la guía Windows, `TASKS.md`, `PROGRESS.md` y `CODEX_STATUS.json`.


## Carga simple de ZIP

La pantalla inicial ofrece una sola zona de carga y una guía de instalación separada. La vinculación con claves/códigos queda en opciones avanzadas. El proyecto abierto se conserva en la URL para recuperarlo al recargar.

- ZIP de la extensión: se importa la geometría y se abre el editor.
- ZIP con solo archivos .skp: se detecta el modelo y se explica el paso de conversión en SketchUp. No se crea un plano ficticio ni se promete lectura directa si falta el lector del servidor.
- ZIP corrupto, con contraseña, rutas inseguras, enlaces o tamaños excesivos: se rechaza con un mensaje. No se extraen archivos a disco ni se ejecutan documentos adjuntos. Se verifica CRC de los datos de modelo importados. Límites: 50 MB subidos, 100 MB descomprimidos, 200 entradas, 30 MB de exportación JSON.

`npm run verify:real` verifica por separado la exportación privada, su CSV/informe, la conservación dentro del ZIP y las piezas/texto/formato del PDF real. Requiere los archivos privados aportados y los artefactos indicados; no se sustituye por un fixture si faltan. `npm run verify:real:workflow` levanta un servidor temporal propio en el puerto 3100, carga el ZIP real y prueba guardar/reabrir/eliminar una nota y su PDF, sin modificar los proyectos del taller. Esas comprobaciones validan la consistencia del pipeline, no equivalen a medir cinco piezas dentro de SketchUp.

## Diseño de la 0.4.1

Se tomó `Orden_Trabajo_Pias.docx` como referencia visual: logo de Santo Carpintero, azul oscuro, franjas de sección y tablas con bordes/filas alternadas. Se conservan A3 horizontal y una hoja por mueble; los datos de ejemplo y observaciones del Word no se trasladan a otros modelos ni cambian sus medidas. Las ayudas del complemento se abren con clic o Enter, se cierran con Escape, botón o clic afuera y se acomodan dentro de la ventana.

`npm run preview:offline:real` reproduce en el editor el JSON real aportado para capturas y un PDF con nota de PRUEBA; no ejecuta SketchUp ni guarda un SKP. Las capturas están en `artifacts/complemento-estilo-Santo-exportacion-real.png` y `artifacts/complemento-ayuda-notas-exportacion-real.png`.

## Cotas por pieza — 0.4.4

Largo y ancho se muestran una sola vez por tamaño de tablón dentro de cada mueble. La coincidencia exige largo, ancho y espesor; se ignora solo ruido numérico menor a 0,000001 mm. El espesor se conserva en la tabla, sin cota en el dibujo. Los valores provienen de la caja local y la transformación 3D; no se miden píxeles. Se comparten entre editor, PDF web y PDF offline. El caso real recibido tiene diez cotas para cinco tamaños y conserva las ocho piezas, comprobadas en la región del dibujo de ambos PDF. Las formas irregulares indican caja envolvente. Si no caben todas las cotas, se bloquea la exportación con un mensaje; el caso sintético de 30 piezas iguales cabe con un par de cotas compartidas y conserva todas las filas/códigos. Pruebas y evidencia vigentes: `CODEX_STATUS.json` y `sketchup_offline/PROGRESS.md`.

## Dos vistas — 0.5.0

El editor permite alternar Delantera/Trasera sin modificar ni guardar la geometría. La cámara trasera gira 180° alrededor del eje vertical; no espeja una imagen. La vista delantera conserva la orientación anterior: el operador debe confirmar que corresponde al frente real del mueble. El modelo no contiene una etiqueta semántica que permita deducirlo automáticamente.

El PDF usa dos columnas de 139 mm para las vistas y una tabla de 107 mm. Mantiene una A3 por mueble, códigos/cotas a unos 11 pt y tabla/notas a 9 pt. No repite las cotas en la trasera. Los números de las notas apuntan a la misma coordenada local en ambas cámaras; el texto se reúne al pie. La leyenda admite cuatro líneas a 9 pt; si notas/advertencias o vistas no caben, se bloquea el PDF con una explicación, sin omitir contenido.

## Ocultar cotas individuales — 0.5.2

Hacé clic sobre una medida del dibujo (o enfocala y pulsá Enter/Espacio) para ocultarla. En **Mostrar u ocultar cotas**, desmarcá/marcá cada Largo o Ancho y usá **Mostrar todas las cotas** para restaurarlas. Cada opción identifica su código, medida y piezas que comparten tamaño. Ocultar afecta esa cota compartida, no otras medidas ni el listado de piezas.

La selección se guarda con la guía en web y SketchUp y se aplica al PDF A3. El dibujo informa cuántas cotas se ocultaron; si todas están ocultas, remite a las medidas de la tabla. Las cotas visibles siguen verificándose para evitar recortes. Las referencias usan IDs físicos y roles largo/ancho, por lo que sobreviven a cambiar cámara, despiece, orden de instancias y renombrado. Al eliminar una pieza se descarta su referencia; no se ocultan automáticamente medidas de nuevas piezas.

La 0.5.2 lee guías sin preferencias de visibilidad y muestra todas sus cotas. Las versiones antiguas de la extensión no reconocen el campo opcional nuevo: para volver a una versión anterior, usá una copia del SKP previa a guardar esas preferencias.


## Ajustes del taller — 0.6.0

Rotación independiente y persistente para Delantera/Trasera, ocultar IDs del dibujo y cotas movibles con mouse/teclado desde el encuadre de impresión A3. La web guarda las mismas preferencias. El PDF mantiene una hoja por mueble; advierte y bloquea posiciones fuera del plano o superpuestas.

En SketchUp, configurá dos letras de obra (VF), un número de módulo del grupo padre (M01) y editá solo la base de cada pieza en la tabla (Lateral). La propuesta VF M01 Lateral se aplica a las instancias al guardar la guía, en una operación con rollback. Cambiar el módulo en SketchUp se recoge al volver a analizar/generar. Se bloquean cambios sobre instancias de contenedores compartidos y bloqueadas; no se escriben definiciones ni geometría. Guardar el archivo SKP y sincronizar nombres tienen opciones explícitas. El árbol arranca compactado y ofrece tres filtros de selección.

La aceptación de estos cambios dentro de SketchUp y el guardado/reapertura físicos siguen pendientes. Las instrucciones paso a paso están en sketchup_offline/PRUEBA_SKETCHUP_2026.md.


## Configuración integrada y guardado — 0.6.1

Grupos y piezas se configura junto a la axonometría, sin un botón o diálogo aparte. Tocar una pieza enfoca su fila; seleccionar la fila la resalta en el dibujo. El nombre del grupo se edita en el mismo panel y los campos existentes de obra/módulo componen los nombres completos. Guardar sincroniza grupo, piezas y guía en una operación con rollback; la tabla sigue conservando las medidas originales.

Guardar guía mantiene el editor abierto. Guardar y cerrar cierra el HtmlDialog después de guardar correctamente; los errores y la cancelación del guardado del SKP mantienen la ventana abierta. El cierre nativo real debe comprobarse en Windows.

Se reprodujo el rechazo de campos al instalar sin reiniciar SketchUp: la interfaz nueva encontraba clases Ruby anteriores en memoria. Ahora se compara la versión cargada antes de analizar, guardar o exportar y se indica que hay que reiniciar todas las ventanas si no coincide. No se aflojó la validación del modelo.
