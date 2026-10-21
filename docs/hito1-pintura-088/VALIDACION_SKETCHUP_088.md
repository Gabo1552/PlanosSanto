# Validación real en SketchUp 2026 — candidata 0.8.8 (Hito 1)

**Para:** Dot y Codex local · **Estado de la candidata:** `PENDIENTE DE VALIDACIÓN REAL`.

Las pruebas automáticas de la nube usan **dobles de la API de SketchUp**: no ejecutan SketchUp, no renderizan texturas y no miden gestos de Windows. Esta batería es la que decide si 0.8.8 se acepta.

## 0. Preparación (obligatoria)

1. **Cerrar todas** las ventanas de SketchUp.
2. Respaldar la carpeta `%LOCALAPPDATA%\PlanosSanto\` completa (catálogo, `photo-assets`, `material-assets`, `skm-import-assets`, `material-assets.json`).
3. Copiar 3 modelos reales a `pruebas\2026-10-xx\`. **No abrir los originales.**
   - **M-S:** mueble chico, 8–10 piezas.
   - **M-C:** con componentes repetidos, uno rotado 90° y uno espejado.
   - **M-L:** proyecto grande, ≥ 300 piezas.
4. Dejar OpenCutList 7.1.0 instalado: **no desinstalarlo**.
5. Instalar `PlanosSanto-0.8.8-candidata.rbz` desde el Administrador de extensiones y reiniciar SketchUp.
6. En la consola Ruby, ejecutar:
   ```ruby
   load 'C:/ruta/docs/hito1-pintura-088/verificar_088_sketchup.rb'
   PlanosSantoValidacion088.integridad
   ```
   Registrar el JSON resultante. Se espera `passed: true` y `paintModules: true`.

## 1. Batería (marcar PASS / FAIL / PENDIENTE en cada paso)

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| V1 | Material desde foto | En M-S: Barra → Pintar → **+ Material** → elegir un JPG propio → tipo placa, espesor 18 → **Guardar y pintar** | La paleta queda en "● Pintando" con la miniatura de la foto. Clic en una pieza: **cambia al instante a la foto real** |
| V2 | Textura real | Ventana Materiales de SketchUp → el material nuevo | Tiene imagen (no un color plano) y el tamaño de textura esperado |
| V3 | Otro modelo: instalación automática | Guardar M-S, abrir **M-C** (copia) → Barra → Pintar | El mosaico de la foto dice **"Se instala al elegir"**. Un clic sobre él: sin otra pantalla ni confirmación, la paleta pasa a "● Pintando" |
| V4 | Pintar directo un componente | En M-C, sin entrar a ningún grupo: clic sobre una pieza | Cambia de inmediato; las caras estrechas (cantos) **no cambian** |
| V5 | Cinco piezas seguidas | 5 clics sobre 5 piezas distintas, sin tocar la paleta | Las 5 cambian; nunca aparece un formulario |
| V6 | Cambiar de material sin salir | Elegir otra melamina en la paleta con el pincel activo; clic en otra pieza | El pincel **no se desactiva**; la pieza toma el material nuevo |
| V7 | SKU y proveedor | Ventana principal → Materiales → la ficha de la foto → completar SKU, proveedor, formato y aprobar → volver a Pintar | **Sigue pintando** sin re-vincular. (En Maderera puede pedir revisar la ficha: es esperado) |
| V8 | Componentes repetidos | En M-C, clic sobre una de dos puertas iguales | Cambia **solo esa**; la gemela queda igual |
| V9 | Cantos | Pintar canto (1 clic sobre el borde) en una pieza con cantos previos | Se pinta el canto elegido; los demás cantos y la placa no cambian; la gemela no cambia |
| V10 | Ctrl+Z | Después de V5, Ctrl+Z dos veces | Se deshacen exactamente las 2 últimas pintadas, una por vez |
| V11 | Escape | Con el pincel activo, Escape | Termina el pincel; el modelo no cambia |
| V12 | Persistencia | Guardar la copia de M-C, cerrar SketchUp, reabrir | Texturas, cantos y nombres intactos; volver a pintar funciona sin instalar de nuevo |
| V13 | SKM importado | Materiales → Importar SKM (una biblioteca real) → clasificar una como placa → Pintar en M-S | El mosaico dice "Se instala al elegir"; al elegirlo pinta |
| V14 | Ficha sin imagen | Crear una ficha manual "Prueba color" (solo datos comerciales) → Pintar | Aparece en **"Necesitan atención"** con "no tiene imagen, textura ni color". **Asignar color** → aparece como mosaico → pinta |
| V15 | Asignar foto | Crear otra ficha manual con SKU → "Necesitan atención" → **Asignar foto** → elegir JPG → Guardar y pintar | Pinta con la foto **y el SKU sigue cargado** |
| V16 | Archivo faltante | Cerrar SketchUp, renombrar un archivo `.skm` de `material-assets`, abrir otra copia → Pintar | Esa ficha aparece en "Necesitan atención" con **"Falta el archivo de textura"** (no "textura válida"). Restaurar el nombre al terminar |
| V17 | OpenCutList | En M-S: `PlanosSantoValidacion088.atributos_ocl`. Luego abrir OCL → Despiece | Las placas creadas por PS tienen `type: 2` y `std_thicknesses: "18mm"`, y los cantos `type: 4`. OCL las agrupa como placa o canto |
| V18 | Regresión: nombres, A4, maderera | En una copia de BM17: renombrar un mueble, generar el A4 exterior/doble y exportar el TXT | Igual que en 0.8.7 (9 columnas, A4 de 1 hoja) |
| V19 | Rendimiento del clic | En M-L: seleccionar una pieza → `PlanosSantoValidacion088.tiempo_clic('<catalogId listo>')`. Además, cronometrar (o filmar) 10 clics reales seguidos | Anotar la mediana en ms y la sensación de respuesta. Objetivo orientativo: < 300 ms por plan en M-L |

## 2. Qué devolver

- PASS / FAIL / PENDIENTE de V1 a V19, con capturas de la ventana completa en los pasos fallidos.
- Los JSON de `integridad`, `estados` (antes y después de V3) y `tiempo_clic`.
- La consola Ruby completa si aparece cualquier error.
- **No enviar** modelos de clientes, texturas comerciales ni fotos privadas. Basta con capturas recortadas.

## 3. Criterio de aceptación del Hito 1

- **Obligatorio:** PASS en V1, V3, V4, V5, V6, V7, V8, V10, V11, V12 y V14.
- V9, V13, V15–V19: PASS o un FAIL documentado con un plan de corrección acotado.
- Hasta cumplir ese criterio, la candidata se identifica como **pendiente de validación real**.
