# Iconos y toolbar nativa SketchUp

## Inspiración visual
La captura de barra del usuario contiene dos estilos: los pictogramas multicolor de la izquierda y los **iconos lineales homogéneos de la derecha**. Se pide evolucionar hacia el segundo estilo: trazos ~2 px coherentes, esquinas redondeadas moderadamente, color grafito neutro + un acento solo para activo, siluetas distinguibles a 24/32 px. No copiar ilustraciones, marca ni logo de OpenCutList.

## Barra principal (máximo 8 accesos visibles, ajustable según espacio)
| Comando | Icono propuesto | Comportamiento real al pulsarlo |
|---|---|---|
| Abrir Planos Santo | logotipo S propio | Abre Inicio o trae la ventana al frente |
| Materiales | abanico de muestras | Abre catálogo en materiales activos |
| Pintar placa | tablón + pincel | Activa Tool SketchUp para placas y paleta compacta |
| Pintar canto | tablero con borde resaltado | Activa Tool para cantos y paleta compacta |
| Quitar canto | borde + borrador | Activa eliminación de cantos (no geometría) |
| Muebles y piezas | mueble / módulos | Abre jerarquía y nombres |
| Pedido maderera | lista de cortes / caja | Abre preparación de lote (no envía pedido) |
| Planos A4 | hoja con miniatura mueble | Abre editor de vistas A4 y PDF |

**Secundarios en la paleta/menú**: cuentagotas, recubrir cara, reemplazar, limpiar, restablecer, ejes inteligentes futuros. No sobrecargar barra con 20 botones.

## Requisitos de implementación
- Un solo `UI::Command` por función; cada acción debe invocar el mismo handler que su equivalente en el UI principal. No duplicar lógica.
- Asignar `small_icon` (24x24) y `large_icon` (32x32) con archivos locales; si usan SVG en Windows comprobar que se representen bien en SketchUp 2026. Incluir fallback PNG para la plataforma si corresponde.
- `tooltip` claro, `status_bar_text` útil, `menu_text` descriptivo; accesos también desde Extensiones > Planos Santo para atajos.
- `set_validation_proc` para habilitar/deshabilitar de acuerdo a modelo/selección, y devolver `MF_CHECKED` cuando el modo está activo si funciona en toolbar. No marcar como activo algo que no está seleccionado.
- Toolbar con `restore`; no crear duplicados al recargar la extensión.
- SVG locales o iconos originales inspirados en lineales; registrar licencias si se utilizan paquetes open source. No hotlinks/web/CDN. Probar legibilidad a 24 y 32, fondo claro/oscuro si SketchUp lo modifica, pantallas HiDPI.
- NUNCA mostrar botón que solo abre un modal genérico sin conducir a la función indicada.
- Sin modificar las operaciones SketchUp activas por detrás al abrir Materiales/Pedidos/Planos si está pintando; cancelar/cambiar Tool con estado coherente.
