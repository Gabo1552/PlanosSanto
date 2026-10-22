# Hito 4 «Perfil de maderera y catálogo v2»: validación pendiente en SketchUp 2026

**Estado:** `PENDIENTE DE VALIDACIÓN REAL`. Todo lo de este hito se probó con **dobles de la API**: CatalogStore y MaderaProfileStore en carpetas temporales, el controlador Ruby real por la tubería de Playwright offline y fixtures sintéticos. **Nada se probó en SketchUp ni con la maderera.** El TXT sigue marcado `production_ready=false`.

Plan de referencia: `audit/opencutlist-paridad-2026-10-21/PLAN_PARIDAD_OCL.md`, sección 5, Hito 4. Llegó a `main` en 0.8.11. La guía `docs/validacion-0811/GUIA_VALIDACION_0811.md` lo marcaba NO APLICA porque se escribió sobre una integración anterior. Este documento la reemplaza para el Hito 4.

## Qué entra

| # | Entregable | Dónde | Prueba automática (dobles) |
|---|---|---|---|
| 1 | **Esquema 2 de la biblioteca** (F-MAT-D): campos `variantOf`, `notes` y `suggested`. La migración v1→v2 es explícita y solo ocurre en memoria. Antes del **primer guardado** se escribe una copia `backups/catalog-v1-premigracion-<rev>-<hex>.json`, verificada por sha256. Un archivo dañado se rechaza sin tocarlo y sin respaldarlo. | `catalog_store.rb` | `catalog_schema_test.rb`: lectura v1 sin reescribir, huellas de vínculos nativos intactas, copia previa verificada, 16 tipos de archivo dañado, errores de disco, importación v1/v2 |
| 2 | **Perfil de maderera** (F-OPT-C). Es versionado, requiere aprobación y queda registrado en el manifiesto (`madereraProfile`). Define refilado, kerf, % de desperdicio, tarifas de corte y canteado, codificación, decimal y encabezado. La regla «descontar canto» está **apagada por defecto**, usa el `thicknessMm` del canto y para aprobarse exige anotar cómo lo confirmó el proveedor. | `maderera_profile.rb`, `supplier_order.rb`, pestaña «Perfil de maderera» | `maderera_profile_test.rb`, `maderera_order_test.rb`: sin perfil el TXT sale byte a byte igual; un perfil sin aprobar nunca aplica; el borrador queda atado a la versión revisada |
| 3 | **Medida útil** (OPT-02): con el refilado, una pieza que entra en la placa bruta pero no en la útil genera un **aviso que no bloquea**. El bloqueo contra la placa bruta sigue igual. | `MaderaProfile.usable_warning` | Placa de 615 con pieza de 609,6 y refilado de 10 → aviso; placa de 600 → bloqueo |
| 4 | **Presupuesto en tres columnas** (OPT-05): neto, con desperdicio (y kerf), y placas o metros enteros a comprar. Los servicios (corte, canteado) van en otra tabla. Solo suman los precios vigentes (hasta 90 días). | `MaderaProfile.budget`, `BudgetView` | 3 m² netos, 20 % de desperdicio y placa de 2 m² → 2 placas; canto de 4,8 m → 5 m |
| 5 | **Altas rápidas** (MATERIALES-02): `presets-taller.json` con melamina de 18 mm (2750 × 1830 y 2600 × 1830, formato a confirmar) y cantos de 22 × 0,45 y 22 × 2. Las fichas nacen **sin aprobar**, sin SKU y con los campos marcados como sugeridos. | `presets-taller.json`, `CatalogV2Tools.tsx` | `catalog_v2_actions_test.rb` |
| 6 | **Variante de espesor** (MATERIALES-03) y las tres salidas cuando el espesor de la pieza no coincide con la placa: crear la variante, elegir otra placa o excluir la pieza. | `CatalogStore#variant_item`, `ThicknessOptions` | Variante de 15 mm desde una de 18: copia formato, proveedor y cantos compatibles, sin SKU ni precio |
| 7 | **Tipo en lote al importar SKM** (MATERIALES-06) y **precarga de medidas OpenCutList** al traer materiales del modelo (F-MAT-A), siempre como sugerencia. | `skm_import.rb` (`skm_commit_typed`), `CatalogStore#ocl_values` | Si hay varios valores o la unidad no es métrica, no se precarga nada |

El formato del TXT (9 columnas, TAB, CRLF) y sus bloqueos comerciales no cambian. Se agrega un único bloqueo nuevo: medidas de corte en cero o negativas después de descontar el canto.

## Decisiones y supuestos (validar)

- **Hecho:** un perfil cuyo contenido cambia pierde la aprobación y sube de versión. El borrador del pedido guarda `{id, version, contentHash}` del perfil con el que se revisó. Si el perfil cambia, el pedido pide «Preparar de nuevo».
- **Hecho:** si el archivo de perfiles está dañado, no se bloquean los pedidos: se trabajan como si no hubiera perfil y el error se ve solo en la pestaña «Perfil de maderera».
- **Hecho:** los paquetes de materiales (`.zip`) que traen fichas de una biblioteca v1 se migran al importar. `variantOf` siempre se limpia, porque apunta a otra biblioteca.
- **Supuesto:** el refilado se aplica en los cuatro lados de la placa. El kerf se suma una vez a cada medida de la pieza para estimar las placas a comprar. Es una **estimación**, no una optimización: la maderera optimiza el corte.
- **Supuesto:** con «descontar canto», el canto de izquierda y derecha acorta la base, y el de arriba y abajo acorta la altura (`edgeMap` = arriba, abajo, izquierda, derecha). Los metros de canto se siguen calculando sobre la medida que recibe la maderera.
- **Pendiente con la maderera real:** formatos de placa del mercado, refilado y kerf reales. También si la maderera recibe la medida terminada o descuenta ella el canto (riesgo de descontarlo dos veces), y cómo cobra el corte (por placa, por pieza o por metro).

## Cómo validarlo en SketchUp 2026

Usar un modelo **de prueba** (copia), nunca el original. **Privacidad:** usar SKU, proveedores y precios **inventados** (por ejemplo `QA-MB18`, «Maderera de prueba», ARS 1000), nunca datos reales de clientes ni listas de precios del proveedor. No adjuntar `catalog.json` ni `maderera-profiles.json` reales a ningún informe.

### Preparación

1. Instalar el RBZ 0.8.11 en SketchUp 2026 (Windows).
2. Cerrar SketchUp y hacer una **copia completa** de la carpeta de datos del taller: `%LOCALAPPDATA%\PlanosSanto`, que contiene `catalog.json`, `backups\`, `material-assets\` y, si ya existe, `maderera-profiles.json`.
3. Para el caso de migración, conseguir una biblioteca **v1** de prueba: la de una instalación 0.8.10, o la copia del paso 2 si todavía es v1. Abrir `catalog.json` y comprobar que dice `"schema": 1`. Anotar cuántas fichas tiene.
4. Tener un mueble de prueba de 6 a 10 piezas de melamina, ya pintado (Hitos 1 y 2), con su guía guardada.

### Casos

| # | Caso | Qué hacer | Qué se espera |
|---|---|---|---|
| H4-1 | **Migración v1→v2** | Con la biblioteca v1, abrir «Biblioteca y pedidos» → «Biblioteca». No tocar nada y cerrar. Revisar `catalog.json`. | Se ven **todas** las fichas. `catalog.json` **no cambió** (sigue en schema 1, misma fecha de modificación) y no hay copia nueva en `backups\`. |
| H4-2 | **Primer guardado** | Marcar una ficha como favorita y «Guardar biblioteca». | `catalog.json` pasa a `"schema": 2` con la misma cantidad de fichas. En `backups\` aparece **una** `catalog-v1-premigracion-<rev>-….json`, idéntica byte a byte al v1 anterior (comparar tamaño o sha256). Los materiales ya pintados siguen vinculados: la paleta los muestra sin «Revisar vínculo». |
| H4-3 | **Archivo dañado** | Con SketchUp cerrado, guardar una copia de `catalog.json`, romperlo (borrar la última llave) y abrir la Biblioteca. Después restaurar la copia. | Mensaje «La biblioteca está dañada; no se sobrescribió…». El archivo roto queda igual y no se crea ninguna copia en `backups\`. |
| H4-4 | **Perfil sin aprobar** | Ir a «Perfil de maderera» → «Nuevo perfil». Completar nombre y proveedor (de prueba), refilado 10, kerf 3 y desperdicio 15, y «Guardar perfil». Intentar «Usar en pedidos». | Queda «Sin aprobar · v 1». «Usar en pedidos» está deshabilitado. En «Pedido maderera», el presupuesto dice que no hay perfil aprobado en uso y el TXT sale igual que sin perfil. |
| H4-5 | **Perfil aprobado** | «Aprobar esta versión» → «Usar en pedidos». Elegir decimal «Coma» antes de aprobar. Ir a «Pedido maderera» → «Preparar de nuevo». | El perfil muestra «Aprobado · v 1» y «En uso en pedidos». El pedido nuevo toma el decimal del perfil. Al exportar, `manifest.json` trae `madereraProfile` con id, versión y `contentHash`. El TXT conserva 9 columnas, ahora con coma decimal. |
| H4-6 | **Cambio de versión** | Con un borrador guardado, cambiar el kerf a 4 y guardar el perfil. Volver al pedido e intentar «Guardar borrador del pedido». | El perfil pasa a v 2 sin aprobar. El pedido avisa que el perfil en uso cambió y pide «Preparar de nuevo». Hasta volver a aprobar, el pedido vuelve a la estimación neta. |
| H4-7 | **Descontar canto** | Elegir «Descontar el espesor del canto», dejar Notas vacías e intentar aprobar. Después anotar en Notas cómo lo confirmó la maderera (texto de prueba) y aprobar. Exportar una pieza de 700 × 450 con canto de 0,45 mm arriba. | Sin notas no se aprueba. Con notas y canto arriba, la altura del TXT es **449,55**. Con «Medidas de corte explícitas» no se descuenta nada. |
| H4-8 | **Medida útil** | Con refilado de 10 mm, poner en la biblioteca una placa de prueba con largo igual al de una pieza (por ejemplo 2600 y una pieza de 2600). «Revisar pedido y costo neto». | Aparece «Avisos de medida útil · no bloquean» con la pieza. El TXT se exporta igual. Si la placa es más corta que la pieza, el pedido **se bloquea** como antes. |
| H4-9 | **Presupuesto** | Cargar precios de prueba vigentes (placa por «Placa», canto por metro), una tarifa de corte por placa y una de canteado por metro. «Revisar pedido y costo neto». | La tabla «Presupuesto con desperdicio» tiene Neto, Con desperdicio (15 %) y A comprar (placas enteras / metros). Corte y canteado van en «Servicios de la maderera», aparte. Un precio de más de 90 días figura «fuera del total». Anotar la diferencia contra una **cotización real** del mismo mueble, sin copiar precios reales a este documento. |
| H4-10 | **Altas rápidas** | En la Biblioteca, «Alta rápida desde valores sugeridos»: crear «Melamina 18 mm · 2750 × 1830», «Canto 22 × 0,45 mm» y «Canto 22 × 2 mm». Medir el tiempo total de 10 altas de colores de melamina. | Cada ficha nace «Sin aprobar», sin SKU y con aviso de campos sugeridos. Aprobar limpia los sugeridos. **Criterio: 10 colores en menos de 2 minutos.** |
| H4-11 | **Variante de espesor** | En una placa de 18 mm, «Crear variante de espesor» de 15 mm. En el pedido, asignar una placa de 18 a una pieza de 15. | La variante copia proveedor, formato, veta y cantos compatibles, sin SKU ni precio y sin aprobar. En el pedido aparecen las tres salidas: «Crear variante de … de 15 mm», «Elegir otra placa» y «Excluir la pieza». Crear la variante pide confirmación y avisa que hay que «Preparar de nuevo». |
| H4-12 | **SKM con tipo en lote** | Importar un ZIP de prueba con varios SKM, «Aplicar tipo a los seleccionados» = Placa, cambiar uno a Canto y tildar «Usar el espesor sugerido por el nombre del archivo como sugerencia (sin aprobar)». | Las fichas importadas tienen el tipo elegido. Las placas o cantos con «18mm» en el nombre traen 18 mm marcado como sugerido. Ninguna queda aprobada. |
| H4-13 | **Medidas de OpenCutList** | En un modelo con materiales tipados en OpenCutList (espesor y formato estándar en mm), «Traer materiales del modelo». | Espesor, formato, veta y ancho de canto llegan como sugerencia, sin aprobar. Si un material tiene varios espesores o medidas en pulgadas, esos campos quedan vacíos. |
| H4-14 | **Paquete con fichas v1** | Importar con «Importar paquete .zip» un paquete exportado desde una instalación cuya biblioteca todavía era v1 (anterior a 0.8.11). | La vista previa lo acepta y las fichas se importan pendientes de aprobar, sin `variantOf`. No aparece «Versión de biblioteca desconocida». |
| H4-15 | **Deshacer** | Ctrl+Z después de guardar un perfil o la biblioteca. | No deshace nada del modelo: perfiles y biblioteca viven en la carpeta del taller, no en el SKP. Ctrl+Z después de «Guardar borrador» deshace solo el borrador, como en el Hito 3. |

Registrar en cada caso: versión de SketchUp, PASS / FAIL / PENDIENTE, capturas de la pestaña y del presupuesto, y los nombres de archivo de `backups\`. Para H4-2, registrar los sha256 del v1 y de la copia; para H4-5 y H4-7, el TXT y el `manifest.json`. Todo debe usar datos de prueba.

## Criterio de aceptación

Viene del plan, sección 5, Hito 4:

- [ ] Dar de alta 10 colores de melamina con preset lleva **menos de 2 minutos** (H4-10).
- [ ] Un lateral de 2600 sobre una placa de 2600 con 10 mm de refilado **muestra un aviso** y no bloquea (H4-8).
- [ ] El presupuesto de un mueble de referencia queda **dentro de ±10 %** de la cotización real de la maderera (H4-9).
- [ ] Una biblioteca v1 **migra sin perder fichas** y la copia de seguridad queda escrita (H4-1 y H4-2).

Además, para cerrar el hito:

- [ ] Sin perfil aprobado en uso, el TXT es idéntico al de 0.8.10 para el mismo mueble (H4-4).
- [ ] Ningún perfil sin aprobar cambia medidas, formato ni presupuesto (H4-4 y H4-6).
- [ ] «Descontar canto» se validó **por escrito con la maderera** antes de usarlo en producción (H4-7).
