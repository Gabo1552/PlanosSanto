# Validación local — Planos Santo 0.8.21

Validar únicamente la candidata 0.8.21 instalada, sin cargar parches del producto ni runners que sustituyan módulos. Esta guía agrega las regresiones de la revisión a los casos C1–C19 de `docs/validacion-0820/ANEXO_0820.md`; los resultados previos no aprueban esta versión.

## Preparación

1. Actualizar el repositorio desde GitHub y comprobar `sketchup_offline/version.json` = `0.8.21`.
2. Respaldar la biblioteca y trabajar con copias de modelos y biblioteca QA (`PLANOS_SANTO_DATA_DIR`). Registrar hashes de los originales. Conservar OpenCutList si está instalado.
3. Cerrar todas las ventanas de SketchUp. Instalar `dist/PlanosSanto-0.8.21-candidata.rbz`, sin descomprimirlo, y reiniciar SketchUp 2026.
4. Comprobar el SHA256 contra `PlanosSanto-0.8.21-candidata.rbz.sha256` y `RESULTADOS.json` del paquete.
5. Cargar el verificador de solo lectura **de este checkout**:
   ```ruby
   load 'C:/<repo>/docs/validacion-0811/verificar_0811_sketchup.rb'
   PlanosSantoValidacion0811.integridad
   ```
   Debe informar versión 0.8.21, `passed: true`, sin archivos alterados, faltantes ni Ruby extra. La ruta histórica del verificador no significa que se deba instalar una versión anterior.

## Cuatro correcciones obligatorias

### R1 — Cantos PDF/TXT

- Preparar una placa QA de 18 mm, sin veta, y dos cantos distintos con SKU QA completos.
- Pintar un lateral de 700×450 mm con ABS-A en dos lados largos y un zócalo de 300×250 mm con PVC-B en un lado largo. Mantener ambos en la misma placa.
- Exportar el TXT y una guía A4 con «Incluir materiales y cantos del pedido».
- Esperado: placa con canto 1=ABS-A y canto 2=PVC-B; zócalo con `2·0·0·0` en ambos documentos. La leyenda no debe mezclar «1=ABS-A/PVC-B».
- Repetir con dos placas diferentes (también con SKU repetido) que tengan distintos productos como canto 1: la leyenda debe identificar la placa correspondiente.
- Una placa con tres productos de canto distintos continúa bloqueada para TXT; su A4 no debe afirmar códigos válidos de pedido. Revisar textos de pendientes.

### R2 — Biblioteca entre computadoras

- Crear ficha QA de placa con espesores `[18]`; exportar biblioteca JSON y paquete ZIP.
- En una biblioteca QA separada cambiar la misma ficha a `[18,36]` y exportarla. Importarla en la biblioteca original.
- Esperado: el cambio no desaparece como duplicado. JSON conserva una ficha diferenciada/conflicto; ZIP pide nombre de resolución o exclusión explícita. Confirmar que la ficha original mantiene sus valores.
- Repetir con canto de anchos `[22]` y `[22,45]`. Listas equivalentes con distinto orden deben seguir considerándose iguales.
- Cerrar y reabrir SketchUp; comprobar persistencia y conservación del archivo original.

### R3 — Giro y botones

- Placa QA sin veta de 600×800 mm; pieza de 700×450×18 mm, sin cantos.
- Con giro desactivado: aviso «no entra» y TXT bloqueado.
- Activar «Girar piezas en placas sin veta»: esperar la revisión; el diagrama debe admitirla y los botones individual y «Exportar todos» deben habilitarse.
- Exportar ambos recorridos; nueve columnas, rota=1. Desactivar giro debe volver a bloquear, incluso después de cerrar y reabrir la sección.
- Repetir con veta y con cantos asimétricos: no deben girarse para eludir el bloqueo.

### R4 — Mesada saliente

- Usar copia de un mueble con puertas y tapa que sobresalga 60 mm hacia delante. Confirmar el frente en Muebles.
- En Planos, exterior e interior: exterior conserva las puertas; interior las oculta automáticamente aunque la tapa sobresalga. Fondo, zócalo y tabla completa se conservan.
- Repetir con cajones y mueble rotado/espejado. Guardar, cerrar y reabrir; exportar PDF y comprobar notas, flechas y medidas.
- Verificar que geometría, transformaciones y visibilidad nativas permanecen intactas.

## Regresión mínima y entrega

Pintar desde JPG/PNG y SKM, cinco clics consecutivos, cantos conservados, instancia compartida aislada, Undo, nombres izquierdo/derecho al agrupar/desagrupar, anotaciones, A4 exterior/doble y guardado/reapertura. La aceptación comercial requiere importar un TXT de ensayo al proveedor.

Entregar matriz PASS/FAIL/PENDIENTE por caso, entorno SketchUp/Ruby/Windows/DPI, hash del RBZ, texto completo de errores y hashes finales de originales/biblioteca. Guardar evidencias privadas localmente. Si hay fallo, describirlo sin parchear el producto durante la corrida.

## Reproducir las pruebas automatizadas

Desde la raíz del checkout correspondiente a esta candidata:

```sh
npm ci
npm run build:offline
LANG=C.UTF-8 npm run test:offline:ruby
npm run typecheck
npm run lint
npm test
npm run test:offline:ui
node --import tsx docs/validacion-0821/generar_demo.ts
pdftoppm -scale-to 1400 -png -singlefile artifacts/PlanosSanto-0.8.21-DEMO-cantos.pdf artifacts/PlanosSanto-0.8.21-DEMO-cantos
python3 docs/validacion-0821/empaquetar.py
```

Se necesitan Ruby con Minitest, Node 22+, Python, Chromium y Poppler; `scripts/setup.sh` prepara el entorno de desarrollo. En Windows nativo, los casos manuales anteriores se ejecutan dentro de SketchUp y no se sustituyen por estos dobles. El PDF y TXT DEMO del paquete son sintéticos y no son instrucciones de fabricación.
