# Barra rápida e identidad de Planos Santo

Referencias: capturas del usuario de OpenCutList y de barra en SketchUp. **Imitar rapidez, NO copiar archivos gráficos.**

## Barra principal (cinco acciones, reconocibles)

- **Pintar** — entrada directa a modelo + paleta compacta. Modo de pieza/canto sin navegar por la ventana principal.
- **Muebles** — abre listado del grupo seleccionado y su renombrado en línea.
- **Maderera** — abre preparación del TXT; no exportar/envíar automáticamente.
- **Planos** — editor A4 de la selección.
- **Materiales** — catálogo visual y crear con foto (el 0.8.5 ya tiene servicio).

Comandos secundarios **no se eliminan**: canto, quitar canto, cuentagotas, avanzado y diagnóstico accesibles en paleta, menús o atajos. Ofrecer opciones para ocultar/mostrar barra sin duplicarla entre cargas.

## Sistema gráfico propuesto

- Marca Planos Santo original: fondo claro cálido, verde profundo como acción primaria, gris cálido para paneles, acento ámbar moderado para selección. Los colores se heredan del tema existente, no rehacer identidad entera.
- Iconos propios en trazos uniformes, *24×24* y *32×32*, líneas con grosor similar, bordes redondeados y símbolos reconocibles; no usar emoji ni assets de OpenCutList.
- Estados: activo visible (color + fondo + borde, no solo color), deshabilitado con razón al pasar puntero, aviso pendiente distinguible.
- `UI::Command` con tooltip específico, menú Extensiones y validación de estado; accesos configurables según soporte de SketchUp.
- Windows al 125% / 150% DPI: iconos nítidos, texto no cortado; mínimo ventana accesible.

## Prohibiciones

No crear docenas de iconos aislados sin cambiar el comportamiento real. No abrir la ventana gigante desde el botón Pintar. No fabricar botones que no respondan. No copiar directamente iconos ni textos de marca OpenCutList.
