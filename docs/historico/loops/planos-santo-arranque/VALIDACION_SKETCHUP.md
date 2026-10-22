# Validación humana obligatoria (SketchUp 2026 / maderera)

**Estado: PENDIENTE**. Solo el usuario/taller puede confirmar estas pruebas en la computadora. No aceptar el mero éxito de unit tests como validación real.

## Prueba 1 — Geometría y renombrado
1. Abrir **copia** de `CA AmSurrbac (1).skp` en SketchUp 2026.
2. Si todavía no hay un exportador dentro de la extensión, en *Ventana → Consola Ruby* ejecutar:

```ruby
load 'C:/ruta/a/PlanosSanto/planos-santo-arranque/referencias_privadas/exportar_jerarquia_sketchup.rb'
```

3. Exportar JSON local de diagnóstico, revisar que incluye instancias, grupos y caras y que NO ha modificado el SKP. El JSON también es privado.
4. Elegir un grupo con piezas sin nombre y confirmar que el plugin enumera **todas las instancias**, incluyendo subgrupos; verificar a mano 4 o más medidas, nombres y cantos.
5. Confirmar el **frente del mueble** antes de aceptar propuestas izquierda/derecha.
6. Editar un nombre, cambiar abreviatura de grupo, aplicar y deshacer. Verificar que no alteró la geometría ni otro mueble con definición compartida.

## Prueba 2 — Materiales y cortes
1. Abrir SketchUp/OpenCutList oficial en paralelo a la versión de desarrollo (sin reemplazarlo).
2. Confirmar que el catálogo de Planos Santo persiste tras cerrar y reabrir. Probar dos materiales similares de diferente sustrato.
3. Verificar cantos de una pieza rotada y con veta. Ejecutar una optimización y comparar número de placas y corte con OpenCutList oficial usando las mismas entradas.

## Prueba 3 — Pedido maderera (sin compra real)
1. Exportar lote **homogéneo** de prueba a TXT y pasar el validador automático.
2. En sitio proveedor, seleccionar material, espesor, canto principal y secundario correspondientes al manifest.
3. Probar importación sin confirmar compras/pedidos. Verificar cantidad, base/altura, 4 cantos y rotación visualmente en el sistema.
4. Registrar si acepta TXT UTF-8, separador decimal `.`, CRLF y sin encabezado. Documentar diferencias si aparecen.

## Prueba 4 — Planos PDF A3
1. Generar plano de al menos dos muebles con flechas; comparar cantidad de hojas y medidas contra modelo.
2. Guardar, cerrar y reabrir SKP: notas y nombres no desaparecen.
3. Revisar A3 horizontal 420x297mm, escala legible y una página por mueble.

## Aprobación final
Después de ejecutar y registrar el resultado de pruebas relevantes, crear **fuera del repositorio** el archivo:

- Windows: `%USERPROFILE%\.planos-santo\aprobacion-sketchup2026.txt`
- Linux: `~/.planos-santo/aprobacion-sketchup2026.txt`

con esta única línea exacta:

```
APROBADO PLANOS SANTO 2026
```

**No le pidas a Codex que cree esa marca**. El script solo la lee para no informar `done` antes de la aprobación externa. La marca no sustituye resultados de prueba ni evidencia documentada.
