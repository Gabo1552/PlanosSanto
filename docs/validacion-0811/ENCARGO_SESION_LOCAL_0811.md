# Encargo para la sesión local de Claude Code — validación nativa 0.8.11

Pegá esto como primer mensaje en Claude Code abierto en la PC con SketchUp 2026, dentro del clon de `Gabo1552/PlanosSanto`.

---

Validá en **SketchUp 2026 real (Windows)** la candidata **Planos Santo 0.8.11**, que reúne los Hitos 1, 2, 3, 5, 6 y 7 más el pincel avanzado (el Hito 4, perfil de maderera, no está implementado). No desarrolles funciones nuevas y no corrijas el producto: si algo falla, documentalo.

## 0. Preparación
1. `git fetch origin && git checkout claude/noche-validacion-0811 && git pull`. La rama es la integración `claude/ux-extras-0811` (`9e881dd`) más la guía y el verificador de esta validación.
2. Leé, en este orden:
   - `docs/validacion-0811/GUIA_VALIDACION_0811.md`: **la batería completa, ordenada por riesgo**. Es la que manda.
   - `docs/hito1-pintura-088/validacion-nativa/INFORME_VALIDACION_088.txt` y `CORRECCIONES_PRIORIZADAS_088.txt`: lo que falló en la última corrida nativa.
   - Para el detalle de cada caso: `docs/hito1-correcciones-089/VALIDACION_LOCAL.md`, `docs/hito1-correcciones-0810/VALIDACION_0810.md`, `docs/hito2-pincel/VALIDACION_SKETCHUP.md` (incluida la §5 de pincel avanzado), `docs/hito3/VALIDACION_SKETCHUP.md`, `docs/hito6/VALIDACION_SKETCHUP.md`, `docs/hito6/RENDIMIENTO.md` (números simulados) y `docs/hito7/CONTRATO_MATERIALES.md`.
3. Construí el instalador: `npm ci` y `LANG=C.UTF-8 node scripts/build-offline.mjs`. Anotá el SHA-256 de `artifacts/PlanosSanto-<versión>.rbz`.
   - Si `sketchup_offline/version.json` todavía dice **0.8.10**, la subida de versión no se hizo: **no la hagas vos**. Seguí, identificá el RBZ por su SHA-256, usá `integridad(version: '0.8.10')` y registrá la observación (paso 0.9 de la guía).
4. **Seguridad, obligatorio:**
   - Respaldá `%LOCALAPPDATA%\PlanosSanto\` completo y los modelos, con SHA-256. Trabajá **solo con copias** y con una biblioteca QA (`PLANOS_SANTO_DATA_DIR`).
   - OpenCutList 7.1.0 tiene que quedar instalado. No lo desinstales ni lo actualices.
   - No cierres ni guardes ventanas de SketchUp ajenas sin confirmación humana.
   - No modifiques el código del producto ni cargues verificadores de versiones anteriores durante la corrida.
5. Cerrá todas las ventanas de SketchUp, instalá el RBZ desde el Administrador de extensiones y reiniciá SketchUp con la biblioteca QA.

## 1. Primero lo que más puede fallar (detenerse si falla Instalación o F0–F2)
En la consola Ruby:
```ruby
load 'C:/<ruta-del-repo>/docs/validacion-0811/verificar_0811_sketchup.rb'
V = PlanosSantoValidacion0811
V.resumen                                   # integridad passed: true, cursores ok: true, perfilMaderera disponible: false, ajustesPincel
p Sketchup::ImageRep.method_defined?(:resize) # se espera false
V.foto('C:/<local>/jpg-1200.jpg')           # aceptada: true; guardar el bloque imageRep
V.colisiones                                # antes de S2 (V6)
```

Seguí la guía en este orden, sin saltear:

| Orden | Bloque de la guía | Qué cubre | Obligatorio para aprobar |
|---|---|---|---|
| 1 | §1 Fotos e `ImageRep` | V1, V15, PNG/alfa, rechazos | F0, F1, F2 |
| 2 | §2 SKM con nombre repetido | V6 con Caju 18mm y Ctrl+Z | S2, S3 |
| 3 | §3 Pincel 1/2/4 y «Todas las iguales» | Criterio (a)–(f) del Hito 2, espejadas | P-a…P-f, P-g |
| 4 | §4 ModelWatch | Franja, observers, cambio de modelo | W1–W4, W7, W10, W11 |
| 5 | §5 Paquete .zip | Exportar, validar, importar en otra biblioteca, adulterados | Z1, Z2, Z4, Z6 |
| 6 | §6 Más de 1.500 piezas y caché de malla | scan, `tiempo_clic`, `tiempos_pincel`, huella, `analisis`, herrajes fuera del despiece, `replyStats` | R1, R3, R4, R5 (o FAIL con números), R9, R10, R11 |
| 7 | §7 Pincel avanzado | Alt/cuentagotas, profundidad, varias caras por lado, recientes, menú, falta pintar | AV1, AV2, AV3, AV4, AV5, AV7, AV8 |
| 8 | §8 Modelo → TXT (Hito 3) | `pedido`, propuesta, confirmación en bloque, aplicar a filas, TXT contra uno a mano, `edgeTotals` | T1, T3, T4, T5, T8 |
| 9 | §9 A4 y etiquetas (Hito 5) | Codificar, referencias parciales, glifo de cantos, hoja 2, etiquetas en papel | A2, A3, A4 |
| 10 | §10 Ventanas y materiales | ARQ-06, duplicar, archivar, escala/giro, OCL, foco | M1–M5 |
| 11 | §11 Regresión | V2–V17 con foto nueva, TXT sin código, Hito 4 NO APLICA | ver §12 de la guía |

Para R5, hacé 20 clics de placa y 20 de canto con 4 lados que **cambien** material (no repasos) antes de `V.tiempos_pincel`. Corré `V.pedido` y `V.referencias_parciales` con Planos Santo abierto y el modelo analizado; no guardan nada.

## 2. Qué devolver
1. Escribí `docs/validacion-0811/validacion-nativa/INFORME_VALIDACION_0811.txt` con:
   - entorno (`Sketchup.version`, `RUBY_VERSION`, Windows, escalado) y SHA-256 del RBZ;
   - la matriz PASS / FAIL / PENDIENTE / NO APLICA de **cada fila** de la guía, con la variante exacta probada;
   - el texto completo de la consola Ruby ante cualquier error.
2. Guardá en esa carpeta los JSON del verificador que pide la §13 de la guía (`resumen`, `integridad`, `foto`, `colisiones`, `atributos_ocl`, `model_watch`, `huella`, `tiempo_clic`, `tiempos_pincel`, `paquete`, `analisis`, `pedido`, `referencias_parciales`, `ajustes_pincel`) y el `replyStats` del diagnóstico. El TXT y el manifiesto solo si no tienen SKU ni precios reales.
3. **Privacidad:** no subas modelos, SKM, fotos, texturas comerciales, catálogos ni rutas personales (reemplazalas por `<local>`). Las capturas quedan en la PC.
4. Al terminar, comprobá que los originales y la biblioteca de producción coinciden con los SHA-256 iniciales y anotalo en el informe.
5. Commiteá **solo** la carpeta `docs/validacion-0811/validacion-nativa/` en la rama `claude/noche-validacion-0811`, con mensaje en español, y pusheá.
6. Respondé con el resumen: aprobada o no aprobada por hito, y la lista de fallas con archivo y línea si se pudo ubicar la causa (sin parchearla).

**Criterio de aceptación (resumen de la §12 de la guía):**
- Instalación: `integridad` con `passed: true`, sin `mismatches`, `extras` ni `faltantes`.
- Hito 1: PASS en F0–F2, S2–S3, V2, V3, V7 y V12 con foto nueva, V4, V5, V8, V10, V11 y V14.
- Hito 2: PASS en P-a…P-f y P-g.
- Hito 3: PASS en T1 (20 % o menos en revisión), T3, T4, T5 y T8. La importación en el sistema de la maderera queda PENDIENTE.
- Hito 5: PASS en A2, A3 y A4.
- Hitos 6 y 7: sin FAIL bloqueante; la caché de malla no puede cambiar el despiece (R9–R11); las mediciones fuera de objetivo se documentan con números.
- Hito 4: NO APLICA.
- Hasta cumplirlo, y mientras la versión no diga 0.8.11, la candidata sigue **pendiente de validación real** y `productionApproved: false`.
