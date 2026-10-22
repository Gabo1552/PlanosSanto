# Encargo para la sesión local de Claude Code — validación nativa 0.8.17

Pegá todo lo que está debajo de la línea como primer mensaje en Claude Code, abierto en la PC con SketchUp 2026 y dentro del clon de `Gabo1552/PlanosSanto`.

---

Validá en **SketchUp 2026 real (Windows)** la candidata **Planos Santo 0.8.17**. Reúne los **Hitos 1 a 7** (pintura y fotos, pincel diario, pedido desde el modelo, perfil de maderera, A4 y etiquetas, arquitectura y rendimiento, materiales y pincel avanzado).
- **No desarrolles funciones nuevas y no corrijas el producto.** Si algo falla, documentalo con la causa probable (archivo y línea si la ubicás).
- **No confundas pruebas simuladas con pruebas en SketchUp.** Todo lo que se probó hasta ahora fue con dobles de la API, así que nada cuenta como aprobado hasta esta corrida.

## 0. Preparación

1. Traé `main` actualizado:
   ```
   git fetch origin && git checkout main && git pull
   ```
   La versión de `sketchup_offline/version.json` tiene que decir **0.8.17**.
2. Verificá el instalador ya publicado. El SHA-256 de `dist/PlanosSanto-0.8.17-candidata.rbz` tiene que ser:
   ```
   e7967d39b5a820cdbd958aae69a7fb3bd042a5b6a3c550ab032fa226cf2f8332
   ```
   En PowerShell: `Get-FileHash dist\PlanosSanto-0.8.17-candidata.rbz -Algorithm SHA256`. Si no coincide, **detenete** y avisá.
3. Leé, en este orden:
   1. `docs/validacion-0811/GUIA_VALIDACION_0811.md`: la batería completa, ordenada por riesgo. Es la que manda.
   2. `docs/validacion-0812/ANEXO_0812.md`: qué cambió en la 0.8.12. **El Hito 4 ahora SÍ APLICA.** El paso 0.9 de la guía (versión sin subir) ya no aplica.
   3. `docs/validacion-0813/ANEXO_0813.md`: qué cambió en la 0.8.13 (latencia del pincel y tecla del cuentagotas).
   4. `docs/validacion-0814/ANEXO_0814.md`: **la corrección de F0** (la foto se rechazaba porque la copia temporal quedaba abierta) y qué insumos faltaban en la corrida anterior.
   4b. `docs/validacion-0815/ANEXO_0815.md`: **pintar sin ventanas** (barra y muestras dentro de la vista), copia de seguridad en Windows, pintar sin análisis, análisis automático y canto libre. Sus casos V1–V15 están en `docs/pintura-en-vista/VALIDACION_SKETCHUP.md`.
   4c. `docs/validacion-0816/ANEXO_0816.md`: **menos pasos**. Pedido sin tildes, propuesto y guardado solo; guía sin diálogos; pestaña «Piezas» al estilo OpenCutList. Trae 6 casos nuevos.
   4d. `docs/validacion-0817/ANEXO_0817.md`: **pintura y materiales como OpenCutList**. Cambio placa/canto, parada automática del pincel, sin cortes, vinculación automática, espesores predeterminados y ficha nueva. **La biblioteca migra a v3: respaldá antes de instalar.**
   5. El informe de la corrida 0.8.13: `docs/validacion-0813/validacion-nativa/INFORME_VALIDACION_0813.txt`, en `main` o en el PR #13.
   6. Lo que falló en la corrida nativa de la 0.8.8: `docs/hito1-pintura-088/validacion-nativa/INFORME_VALIDACION_088.txt` y `CORRECCIONES_PRIORIZADAS_088.txt`.
   7. El detalle de cada hito:
      - `docs/hito2-pincel/VALIDACION_SKETCHUP.md`: §5 pincel avanzado y §6 latencia;
      - `docs/hito3/VALIDACION_SKETCHUP.md`;
      - `docs/hito4/VALIDACION_SKETCHUP.md`: casos H4-1 a H4-15;
      - `docs/hito6/VALIDACION_SKETCHUP.md` y `docs/hito6/RENDIMIENTO.md` (números simulados);
      - `docs/hito7/CONTRATO_MATERIALES.md`.
4. **Seguridad (obligatorio):**
   - Respaldá completo `%LOCALAPPDATA%\PlanosSanto\` y los modelos, y anotá sus SHA-256.
   - Trabajá **sólo con copias** y con una biblioteca QA (`PLANOS_SANTO_DATA_DIR` apuntando a una carpeta de prueba).
   - OpenCutList 7.1.0 tiene que quedar instalado. No lo desinstales ni lo actualices.
   - No cierres ni guardes ventanas de SketchUp ajenas sin confirmación humana.
   - No modifiques el código del producto ni cargues verificadores de versiones anteriores durante la corrida.
5. Cerrá todas las ventanas de SketchUp. Instalá `dist/PlanosSanto-0.8.17-candidata.rbz` desde el Administrador de extensiones y reiniciá SketchUp con la biblioteca QA.

## 1. Primero lo que más puede fallar

Detenete si falla la instalación o F0–F2. **F0–F3 son lo primero que hay que confirmar:** en la 0.8.13 fallaban, y se corrigieron en la 0.8.14 (la 0.8.17 lo incluye).

**Insumos:** si en la PC faltan los modelos A, B y BM17, el placard, la cocina de más de 40 piezas, el JPG original de la 0.8.8 o el caso Caju/petiribi, pedíselos a la persona antes de empezar. Si no están, esas filas quedan PENDIENTE, no FAIL. Las fotos sintéticas sirven para F0–F3, pero no reemplazan el JPG original.

En la consola Ruby:
```ruby
load 'C:/<ruta-del-repo>/docs/validacion-0811/verificar_0811_sketchup.rb'
V = PlanosSantoValidacion0811
V.resumen                                     # integridad passed: true (versión 0.8.17), cursores ok, perfilMaderera disponible: true
p Sketchup::ImageRep.method_defined?(:resize) # se espera false
V.foto('C:/<local>/jpg-1200.jpg')             # aceptada: true; guardar el bloque imageRep
V.colisiones                                  # antes de S2 (V6)
V.perfil_maderera                             # tiene que encontrar el perfil (Hito 4)
```

Seguí este orden, sin saltear:

| Orden | Bloque | Qué cubre | Obligatorio para aprobar |
|---|---|---|---|
| 1 | Guía §1: fotos e `ImageRep` | V1, V15, PNG con alfa, rechazos | F0, F1, F2 |
| 2 | Guía §2: SKM con nombre repetido | V6 con Caju 18mm y Ctrl+Z | S2, S3 |
| 3 | Guía §3: pincel de 1, 2 y 4 cantos y «Todas las iguales» | Criterio (a)–(f) del Hito 2, piezas espejadas | P-a…P-f, P-g |
| 4 | Guía §4: ModelWatch | Franja, observers, cambio de modelo | W1–W4, W7, W10, W11 |
| 5 | Guía §5: paquete .zip | Exportar, validar, importar en otra biblioteca, paquetes adulterados | Z1, Z2, Z4, Z6 |
| 6 | Guía §6: más de 1.500 piezas y caché de malla | scan, `tiempo_clic`, `tiempos_pincel`, huella, `analisis`, herrajes fuera del despiece, `replyStats` | R1, R3, R4, R5 (o FAIL con números), R9, R10, R11 |
| 7 | Anexo 0.8.12 §3 y anexo 0.8.13 §1: latencia | Clic en modo Cara o lote (no inmediato) en la obra grande, comparado con la línea base de la §6 del Hito 2 | Documentar con números |
| 8 | Guía §7 y anexo 0.8.13 §2: pincel avanzado | Alt/cuentagotas, profundidad, varias caras por lado, recientes, menú, falta pintar. Además, cambiar la tecla del cuentagotas con el pincel **detenido** y comprobar que no se revierte | AV1, AV2, AV3, AV4, AV5, AV7, AV8 |
| 9 | Guía §8: modelo → TXT (Hito 3) | `pedido`, propuesta, confirmación en bloque, aplicar a filas, TXT contra uno armado a mano, `edgeTotals` | T1, T3, T4, T5, T8 |
| 10 | `docs/hito4/VALIDACION_SKETCHUP.md`: Hito 4 | Perfil de maderera aprobado y sin aprobar, presupuesto, altas rápidas, migración v1→v2 con copia, paquete con fichas v1 | Lo que marque ese documento como obligatorio |
| 11 | Guía §9: A4 y etiquetas (Hito 5) | Codificar, referencias parciales, glifo de cantos, hoja 2, etiquetas en papel | A2, A3, A4 |
| 12 | Guía §10: ventanas y materiales | ARQ-06, duplicar, archivar, escala y giro, OCL, foco | M1–M5 |
| 13 | Guía §11: regresión | V2–V17 con foto nueva, TXT sin código | Ver §12 de la guía |

Notas para la corrida:
- **R5:** antes de `V.tiempos_pincel`, hacé 20 clics de placa y 20 de canto con 4 lados que **cambien** el material (no repasos).
- **`V.pedido` y `V.referencias_parciales`:** corrélos con Planos Santo abierto y el modelo analizado. No guardan nada.
- **Hito 4:** usá sólo SKU, proveedores y precios inventados. No adjuntes `catalog.json` ni `maderera-profiles.json` reales.

## 2. Qué devolver

1. Escribí `docs/validacion-0817/validacion-nativa/INFORME_VALIDACION_0817.txt` con:
   - el entorno: `Sketchup.version`, `RUBY_VERSION`, versión de Windows y escalado de pantalla, más el SHA-256 del RBZ instalado;
   - la matriz PASS / FAIL / PENDIENTE / NO APLICA de **cada fila** de la guía y de los anexos, con la variante exacta probada;
   - el texto completo de la consola Ruby ante cualquier error.
2. Guardá en esa misma carpeta:
   - los JSON del verificador que pide la §13 de la guía: `resumen`, `integridad`, `foto`, `colisiones`, `atributos_ocl`, `model_watch`, `huella`, `tiempo_clic`, `tiempos_pincel`, `paquete`, `analisis`, `pedido`, `referencias_parciales`, `ajustes_pincel` y `perfil_maderera`;
   - el `replyStats` del diagnóstico;
   - el TXT y el manifiesto, **sólo** si no tienen SKU ni precios reales.
3. **Privacidad:** no subas modelos, SKM, fotos, texturas comerciales, catálogos ni rutas personales (reemplazalas por `<local>`). Las capturas quedan en la PC.
4. Al terminar, comprobá que los originales y la biblioteca de producción coinciden con los SHA-256 iniciales, y anotalo en el informe.
5. Creá la rama `claude/validacion-nativa-0817` desde `main` y commiteá **sólo** la carpeta `docs/validacion-0817/validacion-nativa/`, con mensaje en español. Pusheá y abrí un PR borrador a `main`.
6. Respondé con el resumen:
   - aprobada o no aprobada, por hito;
   - la lista de fallas, con archivo y línea si se pudo ubicar la causa (sin parchearla);
   - las mediciones de rendimiento contra los objetivos (scan < 10 s; clic < 150 ms).

## 3. Criterio de aceptación

| Bloque | Condición |
|---|---|
| Instalación | `integridad` con `passed: true` en la versión 0.8.17, sin `mismatches`, `extras` ni `faltantes` |
| Hito 1 | PASS en F0–F2, S2–S3, V2, V3, V7 y V12 con foto nueva, y en V4, V5, V8, V10, V11 y V14 |
| Hito 2 | PASS en P-a…P-f y P-g |
| Hito 3 | PASS en T1 (20 % o menos en revisión), T3, T4, T5 y T8. La importación en el sistema de la maderera queda PENDIENTE |
| Hito 4 | PASS en los casos obligatorios de `docs/hito4/VALIDACION_SKETCHUP.md` |
| Hito 5 | PASS en A2, A3 y A4 |
| Hitos 6 y 7 | Sin FAIL bloqueante. La caché de malla no puede cambiar el despiece (R9–R11). Las mediciones fuera de objetivo se documentan con números |

Hasta cumplir todo esto, la candidata sigue **pendiente de validación real** y `productionApproved: false`.
