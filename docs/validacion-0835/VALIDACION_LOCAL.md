# Comprobación local de 0.8.35

1. Instalá `dist/PlanosSanto-0.8.35-candidata.rbz` y reiniciá SketchUp.
2. Trabajá sobre copias.
3. Siguen vigentes los pasos de 0.8.34: SKU automático; hacé un respaldo de la biblioteca antes.

## Paquete de obra

1. **Exportar.** En un modelo real con varios muebles, generá en Muebles y abrí Piezas. «Paquete de obra» guarda `<modelo>.obra.json`.
2. **Mismos nombres que el CSV.** Exportá también el CSV: cada nombre de mueble del JSON aparece igual en la columna «Mueble».
3. **Todos los muebles.** Ocultá una sección en Piezas y volvé a exportar: el paquete sigue trayendo todos los muebles (el CSV no).
4. **Cambios.** Mové una pieza en SketchUp sin regenerar y exportá: tiene que pedir que vuelvas a generar Piezas.
5. **Nombres repetidos.** Con dos muebles del mismo nombre, el aviso pide renombrar uno.
6. **App Santo.** Cargá el JSON en App Santo (cuando el visor esté listo) y comprobá que los muebles quedan en su lugar, con Z hacia arriba.
