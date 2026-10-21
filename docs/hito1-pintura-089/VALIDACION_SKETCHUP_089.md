# Validación real en SketchUp 2026 — candidata 0.8.9 (Hito 1)

**Para:** Dot y Codex local. **Estado:** `PENDIENTE DE VALIDACIÓN REAL`.

Mantener la misma preparación que en 0.8.8 (`docs/hito1-pintura-088/VALIDACION_SKETCHUP_088.md` §0):
- Respaldos de la biblioteca y de los modelos.
- Trabajar solo sobre copias.
- `PLANOS_SANTO_DATA_DIR` apuntando a la biblioteca de QA.
- OpenCutList 7.1.0 instalado.

Instalar `PlanosSanto-0.8.9-candidata.rbz` y reiniciar SketchUp. Después, en la consola Ruby:

```ruby
load 'C:/ruta/docs/hito1-pintura-089/verificar_089_sketchup.rb'
PlanosSantoValidacion089.integridad                 # passed: true, version 0.8.9
PlanosSantoValidacion089.foto('C:/ruta/al/jpg-de-V1.jpg')   # ANTES de V1: diagnóstico ImageRep + aceptada: true
PlanosSantoValidacion089.colisiones                 # ANTES de V6: fichas cuyo SKM trae un nombre existente
```

## 1. Orden de ejecución

**Bloque A: repetir primero lo que falló.** Si falla A1 o A2, detenerse y devolver el resultado.

| # | Prueba | Esperado |
|---|---|---|
| A1 = V1 | «+ Material» con el **mismo JPG** de 1200×1200 que falló (SHA-256 `4af47551…`) → placa 18 → Guardar y pintar → clic en una pieza | Vista previa visible. La paleta queda en «● Pintando». La pieza cambia a la foto real |
| A2 = V15 | Ficha manual con SKU → «Necesitan atención» → Asignar foto con el mismo JPG → Guardar y pintar | Pinta con la foto y **el SKU sigue cargado** |
| A3 | Rechazos que deben seguir: JPG de 24 MP, un `.txt` renombrado a `.jpg` y un JPG truncado | Los tres se rechazan con el mensaje de límites; el modelo no cambia |
| A4 = V6 | En la copia M-S que tiene «Melamina petiribi18mm»: elegir Caju 18mm. Repetir con Camellia activa después de 5 pintadas | Caju se instala **como material propio**, con nombre «Caju18mm» o con sufijo, y pinta con **su** textura. «Melamina petiribi18mm» queda con el mismo nombre, textura y sin vínculo. Un Ctrl+Z deshace la instalación completa |
| A5 = V19 | M-L: seleccionar una pieza → `PlanosSantoValidacion089.tiempo_clic('<catalogId listo>')`. Además, 10 clics reales **con escritura** sobre 10 piezas nuevas | Anotar las medianas de `clic` y `vistaPrevia`. Separar en la anotación los clics sin cambios. Objetivo orientativo: `clic` < 300 ms |
| A6 | Modo canto: clic cerca del borde inferior de una cara estrecha (donde en 0.8.8 no pasó nada) y clic exacto sobre una arista de esquina | El borde pinta **esa** cara estrecha, sin tocar la pieza vecina. La esquina ambigua no pinta nada |
| A7 | Abrir Pintar desde la barra (paleta separada) y después Pintar en la ventana principal. Crear un material o importar un SKM en una ventana | Queda **una** sola paleta. El material nuevo aparece en la otra ventana sin cerrarla |

**Bloque B: completar los pendientes con una foto nueva.** V2, V3, V7 y V12 de la batería 0.8.8, esta vez con una **foto creada en 0.8.9**:
- V2: textura real en la ventana Materiales.
- V3: «Se instala al elegir» en otro modelo.
- V7: SKU y proveedor sin re-vincular.
- V12: guardar, cerrar, reabrir; textura, escala y UV intactas, y repintar sin reinstalar.

**Bloque C: regresión corta.** V4, V5, V8, V10 y V11, con la variante de foto si es posible. Agregar la pintura de una instancia **espejada** y una **rotada** de un modelo real.

**V18 (TXT de maderera)** sigue pendiente. Necesita un pedido revisado por una persona; no fabricar aprobaciones.

## 2. Qué devolver

- PASS / FAIL / PENDIENTE de A1–A7, V2/V3/V7/V12 y el bloque C.
- El JSON de `foto`, `colisiones`, `tiempo_clic` e `integridad`.
- Las mismas reglas de privacidad que en 0.8.8: sin modelos, texturas comerciales ni fotos privadas.

## 3. Criterio de aceptación del Hito 1

- **Obligatorio:** PASS en A1, A2, A4 y en V2, V3, V7 y V12 con una foto nueva, más V4, V5, V8, V10, V11 y V14 (ya PASS en 0.8.8: repetir V4/V5 con foto).
- A5 a A7: PASS, o un FAIL documentado con un plan acotado.
- Hasta cumplirlo, la candidata se identifica como **pendiente de validación real** y el Hito 2 no empieza.
