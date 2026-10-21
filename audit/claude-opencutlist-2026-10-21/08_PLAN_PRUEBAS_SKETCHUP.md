# 08 — Plan de pruebas en SketchUp 2026

## Reglas
- Trabajar **solo sobre copias** de modelos reales, en una carpeta `pruebas/AAAA-MM-DD/`. Nunca abrir los originales con una candidata.
- Respaldar `%LOCALAPPDATA%\PlanosSanto\` (catálogo y activos) antes de cada sesión, y restaurarlo entre casos cuando el caso lo indique.
- Registrar por caso: versión de SketchUp, versión de PS, versión de OCL, modelo, pasos, **clics contados**, **ventanas abiertas**, tiempo (cronómetro o video), resultado, consola Ruby y una captura.
- Clasificar cada resultado como `PROBADO_EN_SKETCHUP`, `PARCIAL` o `BLOQUEADO`. Lo que no se ejecute queda `NO VERIFICADO`.
- OCL 7.1.0 instalado en paralelo durante todas las pruebas.

## Modelos de prueba (preparar)

| ID | Contenido | Para qué |
|---|---|---|
| M-S | Bajo de cocina 600 mm: 8–10 piezas, grupos dentro de un grupo padre | Recorridos básicos |
| M-C | Placard con **componentes compartidos** (2 puertas iguales, 4 estantes iguales), uno espejado y uno rotado 90° | Instancias compartidas, cantos, ejes |
| M-L | Proyecto completo de cocina (≥ 300 piezas, ≥ 5.000 caras) | Rendimiento |
| M-OCL | Modelo con materiales tipados en OCL (placa y canto) y cantos pintados con OCL | Compatibilidad |

## Casos

### Pintado (P0)
| ID | Caso | Esperado |
|---|---|---|
| R1–R5 | Reproducción de la falla (ver `05_CAUSA_PINTADO.md` §5) | 0.8.7: R1–R4 dan error y R5 funciona. Hotfix: todos funcionan o el mensaje dice la causa |
| T-PAINT-1 | Pintar 5 piezas seguidas en M-S sin abrir grupos | Cambio visible inmediato en cada una; 5 Undo independientes |
| T-PAINT-2 | Pintar una puerta compartida en M-C | Solo esa puerta cambia (o todas, si se eligió "todas"); la otra queda igual según la política; sin definiciones huérfanas |
| T-PAINT-3 | Pintar una pieza con cantos ya pintados | Los cantos se conservan |
| T-PAINT-4 | Ctrl+Z tras pintar; clic repetido sobre la misma pieza | Undo de un paso; el clic repetido no crea un Undo vacío |
| T-PAINT-5 | Cambiar de material sin salir de la herramienta; cuentagotas | No se desactiva el pincel |
| T-PERF | Medir el tiempo por clic en M-S y M-L (10 clics; mediana) | 0.8.7: línea base. Objetivo tras P0-2: ≤ 150 ms y sin crecer con el modelo |

### Cantos (P1)
| ID | Caso | Esperado |
|---|---|---|
| T-EDGE-1 | 1, 2 opuestos y 4 cantos en una pieza horizontal y en una vertical | Caras correctas; nunca una cara amplia |
| T-EDGE-2 | Pieza rotada 90° y pieza espejada | El lado arr/aba/izq/der coincide con el TXT de la maderera |
| T-EDGE-3 | Quitar canto | Vuelve la placa correcta; las otras instancias no cambian |

### Materiales (P0/P1)
| ID | Caso | Esperado |
|---|---|---|
| T-MAT-1 | Crear desde JPG con escala verificada (2750×1830 mm) | Textura real con el tamaño correcto; miniatura en la paleta |
| T-MAT-2 | Usar ese material en otro modelo | Se instala solo al pintar (hotfix) |
| T-MAT-3 | Importar ZIP de SKM con nombres repetidos | Vista previa con conflictos; nada se sobrescribe |
| T-MAT-4 | Completar SKU, proveedor y formato de un material ya usado | La pintura sigue funcionando (hotfix C3) |

### Nombres, planos y maderera
| ID | Caso | Esperado |
|---|---|---|
| T-NAME-1 | Renombrar un mueble de M-C con piezas compartidas | Bloqueo explicado o cambio sin filtrar a otros muebles; guardar, reabrir y persistir |
| T-GUIDE-1 | Guía A4 con 2 vistas, piezas ocultas solo en la interior, 3 notas con flecha | El PDF entra en 1 hoja legible; la geometría no cambia en el modelo |
| T-ORDER-1 | TXT de M-S; abrir en el importador del proveedor | 9 columnas en orden; mm; cantos 0/1/2; lotes separados por placa, espesor y canto |
| T-ORDER-2 | Comparar las medidas del TXT con la medición manual de 5 piezas | Diferencia ≤ 0,1 mm |

### Compatibilidad OCL
| ID | Caso | Esperado |
|---|---|---|
| T-OCL-1 | Abrir M-OCL con PS: lectura de tipos y cantos | PS reconoce placa y canto sin escribir en `ladb_opencutlist` |
| T-OCL-2 | Pintar con PS y generar el cutlist en OCL | OCL lista el material que se ve |
| T-OCL-3 | Pintar con OCL (Paint parts) y luego leer con PS | Sin discrepancia entre lo visible y lo listado, o documentar la diferencia |
| T-OCL-4 | Ambas extensiones activas; abrir y cerrar modelos; Undo cruzado | Sin errores en la consola |

## Evaluaciones no automatizables
- Legibilidad del PDF A4 impreso en papel (cotas, flechas, tamaño de letra).
- Que el operador entienda los mensajes de error sin ayuda.
- Comodidad del HUD sobre el modelo (tapa piezas o no; tamaño de las miniaturas).
- Aceptación del TXT por el sistema real de la maderera.
