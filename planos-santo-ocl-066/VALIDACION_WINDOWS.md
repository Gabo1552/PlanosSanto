> Versión actual: **0.6.8**. Por pedido del usuario, hacer la aceptación nativa conjunta al final con [la guía actual](../docs/loop-ocl-068.md). Las casillas siguientes no fueron marcadas por Codex; solo el operador puede acreditar la prueba Windows/proveedor.

# Validación manual: Windows + SketchUp 2026 + portal maderera

Esta guía se ejecuta **cuando Codex entregue una nueva RBZ de prueba**. La CLI o un PDF demo no reemplazan estos pasos.

## Paso 0 — Respaldo
- [ ] Guardar copia del SKP real en una carpeta de pruebas y conservar PlanosSanto-0.6.6.rbz.
- [ ] Verificar que OpenCutList original esté funcionando, versión anotada.
- [ ] Instalar RBZ nuevo sin pisar versión anterior; si hay conflicto de extensiones, NO forzar. Anotar error de Consola Ruby.

## Paso 1 — Materiales
- [ ] Abrir CA AmSurrbac; verificar 3 materiales de placas y cantos seleccionados, o registrar los que realmente existan.
- [ ] Revisar contra OpenCutList original en el mismo SKP: cara superior/inferior, material del tablero, clasificación canto.
- [ ] Guardar biblioteca de melaminas/cantos; cambiar a otro SKP y comprobar persistencia.
- [ ] Completar un material nuevo, confirmar que no duplica el anterior y revisar si el precio está vacío si no se cargó.

## Paso 2 — Nombres por mueble
- [ ] Elegir un mueble con piezas Componente# o sin nombre; confirmar total físico y que aparezcan anidadas.
- [ ] Revisar sugerencias, corregir laterales/piso/tapa/estantes, aplicar y verificar Ctrl+Z / Ctrl+Y.
- [ ] Probar piezas de definiciones compartidas para que un renombre no cambie otro mueble.
- [ ] Guardar SKP, cerrar SketchUp, reabrir; verificar nombres persistentes.

## Paso 3 — Maderera
- [ ] Seleccionar un lote que tenga material, espesor y cantos principal/secundario definidos.
- [ ] En vista 2D, comprobar canto_arr/aba/izq/der en 3 piezas reales (una rotada o espejada).
- [ ] Comparar con medidas terminadas, medidas de corte y sentido de veta del proveedor; anotar regla aplicada.
- [ ] Generar TXT y manifest: 9 columnas, 8 tabulaciones, lotes separados, cantidad real.
- [ ] Subir **un TXT pequeño** al portal de la maderera, seleccionar material/espesor/cantos como normalmente; comprobar que acepte el archivo y se muestren bien caras y cortes; guardar evidencia del resultado (sin datos privados innecesarios).

## Paso 4 — Regresión
- [ ] Crear PDF A3 horizontal por mueble, piezas P01..., comentarios y flechas en sus lugares.
- [ ] Cerrar/abrir modelo y comprobar que comentarios no se perdieron.
- [ ] Mantener optimización/listados/etiquetas de OpenCutList original funcionales.

## Resultado

Registrar fecha, versión nueva, SketchUp 2026 build, modelo(s) de prueba, comparación de una tabla de 5 piezas, y resultado de importación del TXT.

Al completar y aceptar **todas** las verificaciones, generar en el entorno donde corre Codex un archivo de texto FUERA DEL REPOSITORIO, en `$HOME/.planos-santo/validacion-ocl-066.aprobada` (Windows: `$env:USERPROFILE\.planos-santo\validacion-ocl-066.aprobada`), con una línea exacta:

```
APROBADO PLANOS SANTO 2026 OCL 066
```

El archivo es confirmación **del encargado**, no debe generarlo Codex por su cuenta. El runner lo exige para indicar `done`.
