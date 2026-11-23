# Paquete de obra (`planos-santo.obra.v1`)

Archivo que exporta Planos Santo (desde 0.8.35) para que **App Santo** muestre el proyecto en 3D con cada mueble coloreado según su etapa (cortado, canteado, armado en taller, instalado en obra).

- **Dónde se exporta:** pestaña **Piezas** → botón **«Paquete de obra»**, al lado de «Exportar» (CSV).
- **Nombre sugerido:** `<modelo>.obra.json`, UTF-8 sin BOM, JSON compacto.
- **Qué incluye:** **todos** los muebles generados en Muebles y todas sus piezas con geometría. No depende de filtros ni de secciones ocultas en Piezas (el CSV sí).
- **Solo lectura:** exportar no modifica el `.skp`, la guía ni el pedido.
- **Esquema ejecutable:** [`lib/obra.ts`](../../lib/obra.ts) (Zod). Es la fuente de verdad; este documento lo explica.
- **Ejemplo:** [`ejemplo.obra.json`](ejemplo.obra.json), generado por `tests/obra.test.ts` (modelo sintético: un bajo mesada de 600 × 563 × 720 con el fondo girado y una alacena rotada 90° en planta). La prueba falla si el ejemplo deja de coincidir con lo que exporta el código; `WRITE_OBRA_EXAMPLE=1 npx vitest run tests/obra.test.ts` lo regenera.

## Estructura

```json
{
  "schema": "planos-santo.obra.v1",
  "version": "0.8.35",
  "modelo": "Cocina SINTÉTICA",
  "exportado": "2026-11-23T12:00:00.000Z",
  "unidades": "mm",
  "muebles": [
    {
      "id": "101",
      "nombre": "M01 Bajo mesada",
      "codigo": "M01",
      "medidas": { "alto": 720, "ancho": 600, "profundidad": 563 },
      "piezas": [
        {
          "id": "101/1",
          "codigo": "M01·A",
          "nombre": "Lateral",
          "material": { "nombre": "Melamina Blanca 18", "sku": "MEL-18", "color": "#f0eee6" },
          "medidas": [720, 560, 18],
          "caja": { "min": [0, 0, 0], "max": [18, 560, 720] },
          "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 100, 1]
        }
      ]
    }
  ]
}
```

### Raíz

| Campo | Tipo | Detalle |
|---|---|---|
| `schema` | `"planos-santo.obra.v1"` | Cambia solo si se rompe la compatibilidad. Rechazar cualquier otro valor. |
| `version` | `"X.Y.Z"` | Versión de la extensión que lo exportó. Informativo. |
| `modelo` | texto (≤ 200) | Nombre del `.skp` (el mismo que en el CSV y en los PDF). |
| `exportado` | ISO 8601 UTC | Momento de la exportación. |
| `unidades` | `"mm"` | Siempre milímetros. |
| `muebles` | lista (1 a 500) | En el orden de Muebles. |

### Mueble

| Campo | Tipo | Detalle |
|---|---|---|
| `id` | texto | Ruta de `persistent_id` de SketchUp desde la raíz del modelo, separada por `/` (`"101"`, o `"7/101"` si el mueble está dentro de otro grupo). Estable mientras no se borre y se vuelva a crear el grupo. |
| `nombre` | texto (1 a 120) | **Idéntico a la columna «Mueble» del CSV de Piezas.** Es la clave con la que App Santo empareja con `ObraModulo`. |
| `codigo` | texto (≤ 10) | Código de módulo (`M01`…) guardado en la guía o leído del nombre; `""` si no tiene. |
| `medidas` | `{alto, ancho, profundidad}` mm | Las mismas cotas totales del plano A4: caja del mueble armado en su frente (alto según la vertical, profundidad según el frente). Redondeadas a 0,1 mm. |
| `piezas` | lista (1 a 500) | Una entrada por **pieza física** (dos laterales iguales son dos entradas). |

### Pieza

| Campo | Tipo | Detalle |
|---|---|---|
| `id` | texto | Ruta de `persistent_id` de la instancia (`"101/1"`). Única en todo el archivo, aunque el mismo componente aparezca en varios muebles. |
| `codigo` | texto (≤ 40) | Código módulo·pieza del CSV (`"M01·A"`); `""` si la guía no tiene códigos. |
| `nombre` | texto | Columna «Designación» del CSV. |
| `material.nombre` | texto | Ficha de la biblioteca o material pintado; `"Sin material"` si no tiene. |
| `material.sku` | texto o `null` | SKU de la ficha. `null` si el material no tiene ficha. |
| `material.color` | `"#rrggbb"` o `null` | Color de muestra. `null` si no se conoce: usar un gris neutro. |
| `medidas` | `[largo, ancho, espesor]` mm | Las mismas L, A y E del CSV (medidas de corte). |
| `caja` | `{min, max}` mm | Límites de la pieza **en sus ejes locales**. No siempre empieza en 0. |
| `transform` | 16 números | Matriz 4×4 local → mundo, **column-major** como `THREE.Matrix4.fromArray` (traslación en las posiciones 12, 13 y 14, en mm). Puede tener escala y espejo. |

## Cómo dibujarlo en three.js

SketchUp usa **Z hacia arriba**; three.js, **Y hacia arriba**. Poner todo dentro de un grupo girado −90° en X.

```js
import * as THREE from 'three';

export function obraScene(obra, etapaDe /* (nombreMueble) => color */) {
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;          // Z de SketchUp → Y de three.js
  root.scale.setScalar(0.001);             // mm → m (opcional)
  for (const mueble of obra.muebles) {
    const grupo = new THREE.Group();
    grupo.name = mueble.nombre;            // mismo texto que ObraModulo
    const color = etapaDe(mueble.nombre);
    for (const p of mueble.piezas) {
      const size = p.caja.max.map((v, i) => v - p.caja.min[i]);
      const geo = new THREE.BoxGeometry(...size);
      geo.translate(...p.caja.min.map((v, i) => v + size[i] / 2)); // caja en ejes locales
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(p.transform);  // local → mundo, en mm
      mesh.userData = { id: p.id, codigo: p.codigo, material: p.material };
      grupo.add(mesh);
    }
    root.add(grupo);
  }
  return root;
}
```

- `side: DoubleSide` cubre las piezas espejadas (determinante negativo).
- Para colorear por material en vez de por etapa: `p.material.color ?? '#b0b0b0'`.
- Las piezas no rectangulares (con curvas o cortes) se dibujan como su caja: es lo esperado para un visor de avance.

## Emparejamiento con App Santo

1. App Santo importa el CSV de Piezas y crea un `ObraModulo` por valor de «Mueble».
2. Al cargar el paquete, cada `muebles[].nombre` se busca entre los `ObraModulo` del proyecto por **igualdad exacta** de texto.
3. Garantías de la extensión:
   - El nombre sale del mismo dato que la columna «Mueble» del CSV (lo prueban `tests/obra.test.ts` y `tests/offline/piezas.spec.ts`, que generan los dos archivos del mismo modelo y los comparan).
   - Antes de abrir el diálogo, Ruby compara el paquete con los muebles generados vigentes: mismos muebles en el mismo orden, mismos nombres, cada pieza con geometría una sola vez y en el lugar del modelo. Si algo cambió, pide volver a generar Piezas.
4. Límites conocidos (del lado de App Santo):
   - **Nombres repetidos:** dos muebles con el mismo nombre no se pueden distinguir. La extensión exporta igual y avisa; conviene renombrar en Muebles.
   - **Renombrar después de importar el CSV** rompe el emparejamiento. Exportar CSV y paquete juntos, de la misma versión del modelo.
   - Sugerencia: guardar también `muebles[].id` en `ObraModulo` la primera vez; es más estable que el nombre si alguien corrige un nombre.

## Tamaño

Matrices con 6 decimales en rotación y 2 en traslación (error < 0,01 mm a 10 m); medidas y cajas con 2. Una cocina de 30 muebles y 720 piezas pesa unos 0,5 MB (la prueba exige < 2 MB). Tope del archivo: 16 MB.

## Cambios respecto del contrato propuesto

| Propuesto | Quedó | Motivo |
|---|---|---|
| `id` = `persistentId` | Ruta de `persistent_id` (`"101/1"`) | Un componente reutilizado tiene el mismo `persistent_id` en cada aparición anidada; la ruta es única y sigue siendo estable. Es la misma clave interna de la extensión (guías, Piezas, pedido). |
| `material.sku` «si hay» | `null` cuando no hay | Tipo fijo, fácil de validar. |
| `material.color` siempre | `"#rrggbb"` o `null` | Un material pintado sin ficha o una pieza sin material no tiene color confiable. |
| `codigo` «si hay» | `""` cuando no hay | Igual que el CSV. |
| — | Z hacia arriba | Se exporta en el sistema de SketchUp; la conversión a three.js es una rotación (ver arriba). |

## Versionado

- Agregar campos opcionales no cambia `schema`. App Santo debe ignorar campos que no conoce.
- `lib/obra.ts` es estricto a propósito: valida lo que exporta la extensión. Del lado de App Santo, validar sin rechazar campos extra (`z.object(...)` sin `.strict()`).
- Quitar o cambiar el significado de un campo pasa a `planos-santo.obra.v2`.
