# Revisión independiente 0.8.22

Se usaron agentes separados del autor de cada módulo, además de la revisión del integrador.

- Ruby → integración TS: formato de ficha, permisos de giro, descarte de respuestas antiguas y bloqueo durante validación. Sin P0/P1. Detectó dos P2: motivo «0 piezas» cuando faltaban medidas, y total sin avisar piezas fuera del cálculo. Ambos corregidos y cubiertos en harness UX.
- Motor TS → Ruby: allowlist del método, caché método/giro, revalidación y ausencia de descuento de canto. Sin cruce de métodos. Detectó limitación de veta forzada por pieza; registrada explícitamente en CAMBIOS/validación local, sin afirmar soporte.
- Revisión de seguridad: SVG originales solo contienen elementos gráficos, sin scripts/eventos/referencias externas; inclusión mediante img y datos embebidos. Método Ruby validado; comparadores de desarrollo usan argumentos, sin interpolación de shell. RBZ revisado sin SKP/SKM/fotos privadas ni motor GPL. 85 archivos de manifiesto y cuatro entradas de directorio.
- Revisión visual de captura integrada: logo correcto, resumen/detalle, métricas y TXT visibles. Colores de tablas y paleta compacta homogeneizados; semántica de avisos conservada.

La revisión de código y las pruebas con dobles no sustituyen aceptación nativa ni importación comercial.
