# Actualización 0.3 — un solo ZIP

La versión 0.2 ya fue ejecutada por el usuario con SketchUp 26.2.243; se recibió una exportación de un mueble y 8 piezas. JSON, informe y CSV coinciden, y se generó una hoja A3. Quedan las comparaciones manuales de medidas.

Para instalar/actualizar la 0.3: **Instalar extensión** en la web → **Descargar extensión para SketchUp**. En el Administrador de extensiones de SketchUp, instalar `PlanosSanto-0.3.0.rbz` sin descomprimirlo y reiniciar si se solicita. Después usar **Guardar ZIP para la web** y subir ese único archivo mediante **Elegir archivo**. El ZIP incluye JSON, medidas e informe; no hace falta extraerlos. La versión 0.3 nueva todavía requiere prueba en Windows.

Los archivos JSON de la 0.2 siguen admitidos. No hace falta volver a exportar los datos ya aportados: se armó `artifacts/CA-AmSurrbac-PlanosSanto.zip` con esos tres archivos, sin cambiar su contenido.

La guía detallada de la primera versión queda a continuación como referencia para revisar jerarquía y medidas; sus pasos de tres archivos separados corresponden a la 0.2. El envío directo queda como opción avanzada y no hace falta para subir el ZIP.

---

# Planos Santo 0.2.0 — instalación y prueba en Windows / SketchUp 2026

**Estado: PARCIAL.** Se generó un RBZ con código Ruby, interfaz de revisión, exportador y transporte. Se ejecutaron pruebas en Linux con dobles de la API y una entrega real HTTP local Ruby → servidor web. **No se ejecutó SketchUp 2026 ni se decodificó la geometría del archivo de muestra en este entorno.** La prueba siguiente debe ejecutarse en la PC que tiene SketchUp instalado.

## Archivos

- Extensión: `artifacts/PlanosSanto-0.2.0.rbz` y su `.rbz.sha256`.
- Modelo aportado: `CA AmSurrbac (1).skp`, incluido en el ZIP del usuario. Se conserva en `fixtures/private/` sin publicarlo ni incluirlo en el RBZ.
- Hash original SHA256: `f20ce6e44c0d1b0d9e0bf444c04727a23b52d57b96a3582a552590a9b1af5d00`.
- Tamaño original: 306.411 bytes. La cabecera indica 26.2.243; eso no prueba jerarquía, medidas ni cantidades.

El RBZ es un ZIP de extensión con `planos_santo.rb` en la raíz y la carpeta `planos_santo/`. No es necesario descomprimirlo para instalar. No está firmado ni publicado en Extension Warehouse. Si una política administrada exige firma y lo rechaza, registrar el mensaje y solicitar la aprobación/firma correspondiente; no desactivar políticas de la organización.

## 1. Instalar y abrir el modelo

1. Guardar una copia del `.skp` y trabajar sobre esa copia. Conservar el original sin cambios. Opcionalmente comprobar su hash con PowerShell:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\ruta\CA AmSurrbac (1).skp'
   ```

2. Abrir SketchUp 2026. En **Administrador de extensiones → Instalar extensión**, elegir `PlanosSanto-0.2.0.rbz`. Reiniciar SketchUp si lo solicita.
3. Comprobar que aparece **Extensiones → Planos Santo → Enviar a Planos Santo**. También hay una barra de herramientas con ese botón. Puede activarse desde las barras de herramientas de SketchUp.
4. Abrir `CA AmSurrbac (1).skp` con **Archivo → Abrir**. La extensión ofrece el comando «Abrir archivo .skp…», que delega en la ventana nativa de apertura de SketchUp. Guardar cualquier otro trabajo antes de cambiar de modelo. Si la versión instalada no puede abrir el archivo, registrar la versión exacta y el error; actualizar mediante el distribuidor oficial cuando corresponda.
5. Abrir **Ventana → Consola Ruby** para conservar mensajes si surge un error. Registrar `Sketchup.version` y `RUBY_VERSION`. Las pruebas Linux usaron Ruby 3.3.7, que no demuestra compatibilidad con el intérprete integrado de la PC.

## 2. Revisar sin cambiar el modelo

1. Pulsar **Enviar a Planos Santo → 1. Analizar modelo activo**.
2. Expandir el árbol. Revisar nombres, IDs/rutas de instancias, etiquetas, material heredado, piezas detectadas, dimensiones y avisos. Los hijos con malla son candidatos a pieza; una definición repetida produce tantas instancias físicas como apariciones.
3. Marcar los padres que realmente representan muebles. Si hay un contenedor que agrupa todo el proyecto, expandirlo y elegir los muebles dentro. No elegir a la vez un padre y su descendiente; la interfaz impide esa combinación.
4. Excluir personas, paredes o referencias mediante la selección explícita. No se filtran por nombres, escenas, materiales ni rótulos. Revisar también cualquier mueble adicional, incluido uno que no tenga escena de despiece. Los textos «M1 (21 piezas)», etc., **no se usan como cantidades esperadas**.
5. Revisar ocultos: se incluyen las piezas y caras ocultas con avisos; no se descartan silenciosamente. Caras sueltas en la raíz generan advertencia y no se convierten automáticamente en muebles. Si hay errores de escala/cizallamiento/volumen nulo, la selección afectada no se exporta.
6. No usar Explode, Make Unique, transformaciones, cambios de material ni edición de dimensiones para preparar la exportación. El código lee entidades, triangulación y matrices; no cambia atributos, geometría, selección ni escenas. Puede comparar `Sketchup.active_model.modified?` antes y después de exportar, sin guardar el original.

## 3. Exportación local primero

1. Elegir **2. Guardar exportación local** y un nombre nuevo, por ejemplo `C:\PlanosSantoPruebas\CA-AmSurrbac.planos-santo.json`.
2. Se guardan tres archivos:
   - `CA-AmSurrbac.planos-santo.json`: jerarquía seleccionada, vértices locales, triángulos, transformaciones, materiales de ambas caras e IDs persistentes por ruta.
   - `CA-AmSurrbac.planos-santo.medidas.csv`: medidas calculadas por pieza y columna `PENDIENTE VALIDACION MANUAL`.
   - `CA-AmSurrbac.planos-santo.informe.json`: hash del JSON, versiones, muebles seleccionados y cantidad de piezas calculada por recorrido.
3. Los archivos existentes no se sobrescriben. Si se cancela o cambia la selección/modelo, volver a revisar antes de exportar. Una exportación nueva usa un nombre nuevo. El JSON y el informe no contienen códigos de vinculación ni el binario `.skp`.
4. Abrir la web y pulsar **Importar exportación Ruby**. Elegir el JSON, **no** el CSV/informe ni el `.skp`. La carga directa `.skp` al servidor conserva su limitación previa del SDK; este nuevo flujo lo lee en SketchUp mediante Ruby.
5. Abrir **Datos y jerarquía de la exportación Ruby** en la web y comparar el árbol con SketchUp. Revisar que cada mueble/pieza seleccionado aparezca una vez y que componentes repetidos tengan rutas distintas.

## 4. Validar el modelo real y conservar evidencia

No considerar validada la integración por ver un árbol o una miniatura. Completar estos controles:

| Comprobación | Evidencia a guardar |
| --- | --- |
| Versión y modelo | Versión exacta de SketchUp, versión Ruby y hash original. |
| Jerarquía | Captura del árbol de la extensión y su correspondencia con grupos/componentes del modelo. |
| Al menos cinco tablones identificables | ID/nombre, largo/ancho/espesor medidos en SketchUp, valores exportados, diferencia en mm y resultado. Incluir piezas rotadas y repetidas. |
| Ejes y escala | Usar mediciones sobre aristas reales con Cinta Métrica sin crear guías ni aceptar redimensionar. No comparar solo una caja global que crece con la rotación. Tolerancia inicial: 0,1 mm; investigar cualquier diferencia mayor. |
| Forma | La extensión valida cierre, volumen y caras en los seis planos de una caja local con tolerancia 0,01 mm. Si no es rectangular, marca medidas de envolvente y pide revisión; no deduce espesor por material. |
| Ocultos y anidamientos | Comprobar una pieza oculta y otra anidada; registrar si debían incluirse. |
| Sin cambios | Estado de modificación antes/después y hash del original sin guardar cambios. |
| Persistencia | Renombrar una pieza y crear una nota con flecha; guardar, recargar/reabrir, cambiar zoom/despiece y comprobar su anclaje. |
| PDF | Exportar A3 y verificar una hoja por mueble, etiquetas, medidas y notas completas. Si no cabe, registrar la advertencia; no ocultar filas ni aceptar texto ilegible. |

Copiar el CSV a otro nombre para la validación manual y agregar las medidas observadas y el veredicto. El archivo generado inicialmente queda como evidencia del cálculo, sin inventar comparaciones. Para un conjunto grande, comprobar primero su cantidad real; no usar cantidades de rótulos como resultado de la extracción.

**Para continuar el desarrollo en este chat:** adjuntar el JSON local, el informe, el CSV comparado, versiones y capturas/errores de la prueba. No adjuntar claves ni códigos temporales. Con esos datos podremos verificar el modelo aportado, ajustar detección/maquetación y generar su PDF real. No se generó aquí un `modelo-real-A3.pdf` ni un árbol de supuesta importación real.

## 5. Solo después: envío directo autorizado

La exportación local funciona sin credenciales ni conexión desde SketchUp a la web. El envío directo requiere configuración adicional del servidor y accesibilidad desde la PC:

1. El administrador configura `PLANOS_BRIDGE_KEY` como secreto **real del proceso servidor**, de al menos 32 caracteres aleatorios. No se guarda en el repositorio, el `.skp`, la extensión ni los JSON. No usar un placeholder de proxy: el servidor compara el valor localmente. La web y el entorno siguen siendo un prototipo para red confiable, sin autenticación completa de usuarios.
2. Usar la dirección HTTPS real de la aplicación. `localhost` en Windows apunta a esa PC, no al entorno de nube `/workspace`. Si el servidor corre en la misma PC, se admite HTTP para `localhost`, `127.0.0.1` o `::1`. No se desplegó ni abrió un túnel automáticamente.
3. En la web, **Vincular extensión**, ingresar la clave del taller y pulsar **Generar código temporal**. La clave se borra del formulario después de generarlo. El código vence a los cinco minutos y autoriza **un intento** de carga, incluso si el JSON es rechazado. El servidor solo guarda su hash.
4. En la extensión, después de verificar el JSON/medidas, marcar **Verifiqué la exportación local…**, ingresar la URL raíz de la web y pegar el código. Seleccionar **Enviar a Planos Santo** y confirmar el destino que muestra SketchUp.
5. La extensión verifica que la selección, el modelo y el hash del JSON local no cambiaron. Envía solo el JSON por POST, con el código en un encabezado. Verifica certificado TLS/nombre del servidor y rechaza redirecciones; no agrega excepciones de confianza. La solicitud es síncrona con límites de conexión/escritura/lectura: SketchUp puede quedar ocupado durante el envío.
6. El proyecto recibido aparece en **Proyectos guardados**. El panel web actualiza la lista mientras muestra el código; también ofrece **Actualizar proyectos recibidos**. Cada entrega crea un proyecto nuevo; nunca reemplaza anotaciones previas de otro proyecto.
7. Si la respuesta se pierde, revisar primero los proyectos antes de reintentar: una carga puede haber llegado aunque el cliente no recibiera confirmación. No hay reintento automático. Si hace falta, generar otro código.

La entrega Ruby → servidor se probó por HTTP loopback con geometría sintética. Las opciones de validación TLS y rechazo de errores se probaron con dobles. **La entrega HTTPS desde SketchUp Windows, su cadena de certificados y la conectividad a la URL de destino siguen pendientes.**

## Límites y errores útiles

- Máximo 100 muebles seleccionados, 500 piezas por mueble, 5.000 grupos/componentes inspeccionados, 24 niveles, 200.000 vértices/triángulos totales y 30 MB de JSON. Si una referencia enorme agota el análisis, registrar el error y trabajar en una copia que aísle los muebles, sin modificar el original.
- Medidas en mm por geometría local × escala acumulada. Se rechazan cizallamientos y escalas nulas. Largo ≥ ancho ≥ espesor se asigna después de validar forma; geometrías no rectangulares conservan advertencia.
- Se conservan nombre/color/opacidad y presencia de textura; **no se exportan mapas UV ni imágenes de textura**. El visor usa color de material y sombreado, no un render fotográfico.
- El despiece web es radial e ilustrativo; no calcula una secuencia de ensamblado ni garantiza resolver toda oclusión en modelos complejos. Revisar la vista real.
- JSON inválido: 400/422. Envío sin clave configurada: 503. Código ausente/vencido/usado: 401. Modelo que no cabe en A3: 422 con advertencia.
- Si falla una prueba, registrar acción exacta, mensaje, versiones, IDs afectados y adjuntar solo los archivos pertinentes. No dar la integración por terminada hasta completar las pruebas reales anteriores.
