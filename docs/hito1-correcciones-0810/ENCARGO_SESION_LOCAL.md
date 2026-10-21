# Encargo para la sesión local de Claude Code — validación nativa 0.8.10

Pegá esto como primer mensaje en Claude Code abierto en la PC con SketchUp 2026, dentro del clon de `Gabo1552/PlanosSanto`.

---

Validá en **SketchUp 2026 real (Windows)** la candidata **Planos Santo 0.8.10** del Hito 1. No desarrolles funciones nuevas y no empieces el Hito 2.

## 0. Preparación
1. `git fetch origin && git checkout claude/vibrant-ride-j0zfuu && git pull`. Es el PR Gabo1552/PlanosSanto#3.
2. Verificá el instalador: el SHA-256 de `dist/PlanosSanto-0.8.10-candidata.rbz` tiene que coincidir con `dist/PlanosSanto-0.8.10-candidata.rbz.sha256`.
3. Leé, en este orden:
   - `docs/hito1-pintura-088/validacion-nativa/INFORME_VALIDACION_088.txt` y `CORRECCIONES_PRIORIZADAS_088.txt`: lo que falló en la 0.8.8.
   - `docs/hito1-correcciones-089/VALIDACION_LOCAL.md`: la guía completa.
   - `docs/hito1-correcciones-0810/VALIDACION_0810.md`: el anexo de la 0.8.10.
4. **Seguridad, obligatorio:**
   - Respaldá `%LOCALAPPDATA%\PlanosSanto\` completo y los modelos. Trabajá **solo con copias** y con una biblioteca QA (`PLANOS_SANTO_DATA_DIR`).
   - No desinstales OpenCutList 7.1.0.
   - No cierres ni guardes ventanas de SketchUp ajenas sin confirmación humana.
   - No modifiques el código del producto. Si algo falla, documentalo: no lo parchees.
5. Cerrá todas las ventanas de SketchUp, instalá el RBZ desde el Administrador de extensiones y reiniciá SketchUp.

## 1. Primero lo que falló en la 0.8.8 (detenerse si falla A1 o A2)
En la consola Ruby:
```ruby
load 'C:/<ruta-del-repo>/docs/hito1-correcciones-0810/verificar_0810_sketchup.rb'
PlanosSantoValidacion0810.integridad          # version 0.8.10, passed: true
PlanosSantoValidacion0810.foto('C:/<ruta>/textura-1200.jpg')  # aceptada: true; guardar el bloque imageRep
PlanosSantoValidacion0810.colisiones
```

| Caso | Qué hacer | Qué se espera |
|---|---|---|
| A1 (V1) | **+ Material** con el JPG de 1200×1200 que falló (y la textura de madera que mandó Gabriel) → placa de 18 → Guardar y pintar → clic en una pieza | Muestra la vista previa y la pieza toma la textura real |
| A2 (V15) | Ficha con SKU → **Asignar foto** con el mismo JPG | Pinta con la foto y conserva el SKU |
| A3 | Un JPG de 24 MP, un `.txt` renombrado a `.jpg` y un JPG cortado | Los tres se rechazan y el modelo no cambia |
| A4 (V6) | Copia de M-S que tiene «Melamina petiribi18mm» → elegir Caju 18mm; repetir con el pincel activo | Caju se instala como material propio y pinta con su textura. El material previo queda intacto. Un Ctrl+Z deshace la instalación |
| A5 (V19) | En M-L: `tiempo_clic('<catalogId>')` + 10 clics reales que cambien material | Medianas de `clic` y `vistaPrevia`. Objetivo orientativo: `clic` < 300 ms |
| A6 | Modo canto: clic justo en el borde de una cara angosta; clic en una arista de esquina | El borde pinta esa cara de esa pieza; la esquina no pinta nada |
| A7 | Abrir Pintar desde la barra y después Pintar en la ventana principal; crear un material en una ventana | Queda una sola paleta y el material nuevo aparece sin reabrir |

## 2. Después
- **Foto nueva entre modelos:** V2, V3, V7 y V12 de `VALIDACION_LOCAL.md`, con una foto creada en la 0.8.10. Incluye textura, escala y UV al reabrir.
- **Regresión:** V4, V5, V8, V10, V11, V14, V16 y V17, más instancias **espejadas y rotadas** de un modelo real.
- **V18** (TXT de maderera): sigue pendiente si no hay un pedido revisado por una persona. No fabriques aprobaciones.

## 3. Qué devolver
1. Escribí `docs/hito1-correcciones-0810/validacion-nativa/INFORME_VALIDACION_0810.txt` con:
   - la matriz PASS / FAIL / PENDIENTE de A1–A7 y V2–V19, con la variante exacta probada en cada fila;
   - los JSON de `integridad`, `foto`, `colisiones` y `tiempo_clic`;
   - el texto completo de la consola Ruby ante cualquier error.
2. **Privacidad:** no subas modelos, SKM, fotos, texturas comerciales ni rutas personales (reemplazalas por `<local>`). Las capturas quedan en la PC.
3. Commiteá solo esa carpeta en la rama `claude/vibrant-ride-j0zfuu` y pusheá.
4. En el PR #3 comentá el resumen: aprobada o no aprobada, y la lista de fallas con archivo y línea si se pudo ubicar la causa.

**Criterio de aceptación del Hito 1:**
- Obligatorio: PASS en A1, A2, A4 y V2, V3, V7 y V12 con foto nueva, más V4, V5, V8, V10, V11 y V14.
- A5–A7: PASS o un FAIL documentado con un plan acotado.
- Hasta cumplirlo, la candidata sigue **pendiente de validación real**.
