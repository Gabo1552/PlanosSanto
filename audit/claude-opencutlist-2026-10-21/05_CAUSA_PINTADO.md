# 05 — Causa del fallo de pintado (0.8.7)

**Síntoma (evidencia `evidencias/fallo_pintado_087.png`):** la ventana "Planos Santo · Pintar / Pintado directo" muestra estado `○ Detenido` con dos materiales en la paleta: **Camellia** (sin miniatura, ícono genérico) y **Caju 18mm** (con miniatura de foto). Al elegir uno aparece:

> `Este material no tiene una textura válida en el modelo. No se cambió la pintura activa.`

El pincel no llega a activarse.

## 1. Veredicto

**Causa raíz confirmada en el código fuente (VERIFICADO_EN_CODIGO). Causas C1 y C3 reproducidas con los dobles de prueba del proyecto (PROBADO_AUTOMATICAMENTE, `repro_causas_test.rb`). Falta reproducir en SketchUp 2026 (NO VERIFICADO).**

La paleta muestra **fichas del catálogo local** (`catalog.json` en `%LOCALAPPDATA%\PlanosSanto`), pero para pintar exige un **material nativo de SketchUp, instalado en el modelo abierto, vinculado por UUID y sin "issues"**. Ningún paso del flujo de pintado instala o repara ese material: lo tiene que hacer el usuario a mano, en otra pantalla (biblioteca) y con otra confirmación. Cuando el material nativo falta o su vínculo quedó "desactualizado", la paleta lanza el error **desde JavaScript, sin consultar a Ruby**, y con un texto que habla de "textura" aunque el problema real es "no instalado / vínculo inválido en este modelo".

La hipótesis de `02_AUDITORIA_PRELIMINAR.md` era correcta en lo esencial, con un ajuste: el bloqueo de la captura **no ocurre en `quick_paint_start`/`material_choices` (Ruby)**, sino antes, en la paleta JS. El camino Ruby es un segundo cerrojo con la misma lógica.

## 2. Traza exacta (UI → JS → Ruby)

### 2.1 Qué muestra la paleta
`sketchup_offline/ui/SmartPaintPalette.tsx:125`, lista de mosaicos:
```ts
loaded?.catalog.items.filter(item => usableForPainting(item, loaded?.visuals.materials) && item.kind===kind && …)
```
`SmartPaintPalette.tsx:22`, condición para mostrar un mosaico:
```ts
function usableForPainting(item, materials){ return (item.kind==='sheet'||item.kind==='edge') &&
  ( item.approved                 // ficha comercial aprobada
 || designReady(item)             // foto con designReady (dato del catálogo, :18)
 || materials?.some(m => m.designReady===true && m.binding?.catalogId===item.id && m.binding.kind===item.kind && !m.issues?.length) ); }
```
En el bundle distribuido equivale a `ia()`/`ry()` en `ui/palette.js:9`.
**Las dos primeras ramas no miran el modelo.** Una ficha aprobada para la maderera, o una foto creada en **otro** modelo, se muestra en la paleta de cualquier SKP aunque ese SKP no tenga el material.

### 2.2 Qué exige el clic sobre un mosaico
`SmartPaintPalette.tsx:99-114`, función `change(patch)` al elegir material en modo rápido (`quickMode`):
```ts
const visual = loaded?.visuals.materials.find(material => material.binding?.catalogId===item?.id
                 && material.binding?.kind===nextKind && !material.issues?.length && …);      // :111
if (… || (next.mode!=='remove_edge' && !visual?.binding) || …) {                              // :113
   if (quickMode) { …; throw new Error('Este material no tiene una textura válida en el modelo. No se cambió la pintura activa.'); } // :114
}
```
`visuals.materials` es el listado de `Sketchup::Material` **del modelo activo**, que arma `MaterialLibrary#status` (`material_library.rb:79-101`). Si no hay ninguno con `binding.catalogId` igual a la ficha y con `issues` vacío, se dispara el error. **Ruby no interviene.**

### 2.3 Segundo cerrojo en Ruby (mismo criterio)
- `offline.rb:105`: la barra rápida reanuda el último material (`quick_paint_start`) si hay `catalogId` recordado.
- `offline.rb:226-228`: `SmartPaint#material_choices` filtra **materiales del modelo** con vínculo válido. Si no hay exactamente uno: `"Elegí un material vigente de la paleta; no se cargó ni modificó el modelo."`
- `smart_paint.rb:13-26`: `material_choices` recorre `@model.materials` y descarta lo que `NativePaint#material_for` rechaza.
- `native_paint.rb:344-357` (`material_for`) exige: (a) ficha `paintable?`, (b) **exactamente un** material del modelo con ese UUID, (c) `MaterialPolicy.native_valid?` (prueba de foto + escala) y (d) `binding.catalogFingerprint == item_fingerprint(item)`. **No crea ni instala nada.**

### 2.4 Por qué el material nativo falta o queda inválido: 5 causas con ruta exacta

| # | Causa | Evidencia | Explica la captura |
|---|---|---|---|
| C1 | **Ficha aprobada sin material instalado en este modelo.** `usableForPainting` la muestra por `item.approved` | `SmartPaintPalette.tsx:22`; `catalog_store.rb:250-256`. **Reproducido** (`repro_causas_test.rb#test_C1`) | **"Camellia"** (sin miniatura → no es foto). Alta probabilidad |
| C2 | **Foto creada en otro modelo.** `PhotoMaterial#create` agrega el material solo al modelo activo (`photo_material.rb:219`) y guarda la ficha en el catálogo global. En otro SKP la ficha aparece (`designReady(item)`), pero el material no existe | `photo_material.rb:213-238`; `SmartPaintPalette.tsx:18,22` | **"Caju 18mm"** (miniatura de foto). Alta probabilidad |
| C3 | **Editar datos comerciales invalida el vínculo.** `item_fingerprint` incluye `kind, sku, supplier, thicknessMm, widthMm, lengthMm, grain, compatibleIds` y la escala de la foto. Si se completa SKU, proveedor o formato para la maderera, el `catalogFingerprint` guardado en el material deja de coincidir → `issues` → no se puede pintar hasta "re-vincular" | `material_resolver.rb:125-135`; `material_library.rb:63`; `native_paint.rb:355`. **Reproducido**: issue `"SKU ausente, pendiente o modificado: revisar vínculo."` (`repro_causas_test.rb#test_C3`) | Posible. Contradice la política propia: "pintar ≠ aprobación comercial" (`material_policy.rb:7-8`) |
| C4 | **Archivos de la biblioteca local alterados o ausentes** (foto, miniatura, SKM o `material-assets.json`): cualquier cambio de hash vuelve la ficha no `paintable?` o el material no `native_valid?` | `material_policy.rb:33-42, 57-80, 87-101` | Posible si se copió la biblioteca entre PCs o se restauró un backup |
| C5 | **Escala de textura editada en SketchUp.** Con escala verificada, `native_valid?` exige ancho y alto de textura a ±0,1 mm del valor guardado. Cambiar el tamaño en el editor de materiales invalida el material | `material_policy.rb:97-98` | Posible |

Otros puntos frágiles en el mismo circuito:
- `material_library.rb:275`: si `materials.load(skm)` devuelve un material existente (por ejemplo, del mismo nombre), la instalación aborta con *"vinculalo explícitamente"*.
- Un SKM importado entra con `kind='unknown'` (`skm_import.rb:197`). No es pintable hasta clasificarlo como placa o canto y luego instalarlo.
- `remember_smart_settings` guarda `catalogId` y `materialUuid` en las preferencias globales (`offline.rb:718-725`). Al abrir otro modelo, la barra intenta reanudar un UUID que en ese modelo no existe.

## 3. Por qué además hay "demasiados pasos" (aunque el material esté instalado)

Recorrido mínimo actual con un JPG nuevo, contado desde el código (clics reales **NO VERIFICADOS**):
1. Barra → Pintar (abre la paleta HtmlDialog 680×320, `offline.rb:183-202`).
2. "+ Material" → la paleta se agranda → elegir foto (diálogo del SO) → revisar vista previa → completar nombre y tipo (placa/canto), espesor y opcionalmente escala → confirmar (`material_photo_create`).
3. Volver a la paleta → elegir el mosaico → recién ahí se activa la herramienta.
4. Clic en pieza.

En **otro modelo**, la misma foto requiere: Pintar → error → "…" → *Administrar biblioteca* (cierra la paleta y abre la ventana principal de 1440×920, `offline.rb:356-362`) → instalar con confirmación (`material_photo_install`, `offline.rb:463-471`) → volver a abrir Pintar → elegir el mosaico → clic.

Además, cada pintada es costosa, según el código:
- `SmartPaintTool#onLButtonDown` → `SmartPaint#apply_immediate` → `preview` (plan) **+** `apply` (vuelve a planificar) (`smart_paint.rb:214-218, 229`).
- Cada `plan` hace `NameManager#inventory` (recorre **todo el modelo**, malla cada cara y calcula SHA-256 de un JSON de todo el modelo, `names.rb:69-103`) **1 vez + 1 por cada lado** vía `NativePaint#preview` (`native_paint.rb:465`). Más el snapshot de `apply` (`smart_paint.rb:233`): ≈ **7 recorridos completos del modelo por clic**.
- Cada `material_for` recalcula SHA-256 de la foto original (hasta 12 MiB), la miniatura, el SKM y el índice, dos veces (`paintable?` y `native_valid?`): ≈ **6 llamadas por clic ≈ 40-50 lecturas y hashes de archivos**.
- Después, `smart_event('changed')` marca la guía para re-escanear (`offline.rb:743-750`).

Es una **inferencia de código**: en modelos grandes, la latencia por clic crecería con el tamaño del modelo y del archivo de foto. Hay que medirlo (ver `08_PLAN_PRUEBAS_SKETCHUP.md`, prueba T-PERF).

## 4. Cómo lo resuelve OpenCutList (código auditado `1ef3e14c…`)

Ver detalle con citas en `02_MAPA_CODIGO.md` §2. Resumen de las diferencias que importan:

1. **La fuente de verdad es `model.materials`.** No hay catálogo externo ni paso de instalación o vínculo. `_populate_material_defs` (`tool/smart_paint_tool.rb:1095-1121`) recorre `model.materials` y filtra por el tipo OCL guardado en el propio material (`ladb_opencutlist/type`). **Lo que se ve es lo que se puede pintar, siempre.**
2. **Pintar pieza = pintar la instancia** (`instance.material = @active_material`, `smart_paint_tool.rb:1269-1291`), con una operación de Undo por clic. **No toca caras.** Cantos y caras (`face.material=`) se pintan sobre la **definición** y avisan si está compartida (`:856-861`); OCL **no** hace `make_unique`.
3. **La barra de materiales está dentro del viewport** (Kuix, `setup_entities`, `:121-351`). Elegir material no cambia de ventana ni desactiva el pincel. ←/→ cambian de material y Alt activa el cuentagotas temporal (`:726-740`).
4. **La textura no es requisito**: los botones usan solo `material.color` (`:1123-1224`).
5. **La herramienta es `MaterialsObserver`**: si se crea un material con "+", vuelve a la herramienta **ya seleccionado** (`:792-796`).
6. **Costo por movimiento del cursor**: corre un `CutlistGenerateWorker` acotado a **una entidad** cuando cambia la ruta bajo el cursor (`helper/part_helper.rb:15-36`). No recorre el modelo entero ni lee archivos.
7. Limitación importante: **para OCL, una pieza es la `ComponentInstance` más profunda** (`helper/part_helper.rb:7-13`). **Los grupos sueltos no son piezas.** Planos Santo, en cambio, trata grupos y componentes como piezas, lo que encaja con cómo se modela en el taller.

## 5. Reproducción propuesta (sobre COPIAS de modelos)

| Caso | Pasos | Resultado esperado según el código |
|---|---|---|
| R1 (C2) | En `A.skp` crear material desde foto → cerrar → abrir `B.skp` → Pintar → elegir la foto | Error "no tiene una textura válida" |
| R2 (C1) | Crear ficha manual, completar SKU, proveedor, espesor, formato y veta → aprobar → abrir Pintar en un modelo sin ese material | Mosaico sin miniatura + mismo error |
| R3 (C3) | Material de foto que funciona en `A.skp` → en Biblioteca, agregar SKU → volver a Pintar | Mismo error (fingerprint distinto) |
| R4 (C5) | Material con escala verificada → cambiar el ancho de la textura en el editor de materiales de SketchUp → Pintar | Mismo error |
| R5 (control) | Material recién creado desde foto en el **mismo** modelo, sin editar | El pincel se activa; medir el tiempo por clic |

Para cada caso, registrar la versión de SketchUp, la consola Ruby y el JSON de `Diagnóstico de integración`. Hay que comprobar `visuals.materials[*].issues`, que es el dato que decide el error.

## 6. Solución propuesta (NO aplicada)

### 6.1 Hotfix aislado (P0-1, tamaño S, 1 a 2 días)
Objetivo: **"lo que se ve en la paleta, se puede pintar"**, sin eliminar controles.

1. **Instalación automática y segura antes del gesto.** Al elegir un mosaico sin material válido en el modelo:
   - si la ficha tiene activo verificado (SKM de foto o SKM importado con hash correcto), llamar internamente a `MaterialLibrary#install` (ya transaccional y con Undo propio, `material_library.rb:247-284`) **sin pedir confirmación**. La confirmación existe para la UI de biblioteca; acá la intención del usuario ("quiero pintar con esto") ya es explícita.
   - si no hay activo (ficha comercial sin visual), **no mostrarla en la paleta de pintura**, o mostrarla deshabilitada con la acción "Asignar imagen…".
2. **Separar diseño de comercio en el vínculo.** Calcular un `designFingerprint` (solo el origen visual: hash de foto o SKM y escala) para autorizar la pintura, y dejar `catalogFingerprint` (sku, proveedor, formato) solo para maderera. Completar datos comerciales no debe bloquear la pintura.
3. **Mensajes veraces.** Reemplazar el texto genérico por la causa concreta: "no instalado en este modelo → instalando…", "vínculo de otra versión de la ficha → re-vinculando…", "archivo de la biblioteca alterado → revisar".
4. **Filtro de la paleta coherente con la condición de pintura.** `usableForPainting` (`SmartPaintPalette.tsx:22`) debe usar la misma regla que `change()` (`:111-114`): instalado y válido, **o** instalable automáticamente.
5. **Prueba de regresión que falta:** agregar a `tests/offline/immediate-palette.spec.ts` (y a una prueba Ruby) el caso "ficha aprobada o de foto **sin** material en `visuals.materials`", que hoy no existe en los dobles.

Se conserva: el UUID único, la verificación de hashes al **instalar** (no en cada clic), Undo, la protección de instancias compartidas y la regla "nunca convertir un canto en placa".

### 6.2 Corrección estructural (P0-2/P0-3, ver backlog)
- **Cachear la validación** por sesión y modelo: validar material y archivos una vez al seleccionar el material, no en cada clic. Invalidar con `MaterialsObserver`.
- **Plan por clic local**: resolver solo la ruta clicada, sin `inventory` global. El recorrido completo queda para la guía y la maderera.
- **Pintar instancia + caras amplias** según el modelo de OCL (ver `06_DECISION_ARQUITECTURA.md`).
