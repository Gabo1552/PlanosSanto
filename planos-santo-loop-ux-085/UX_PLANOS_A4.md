# Editor de guías A4 — P1

**Contrato actual a preservar:** A4 horizontal **297×210 mm**; por defecto una página por mueble; una o dos vistas, exterior e interior, orientación ajustable, piezas ocultas solo de presentación, tabla de piezas, notas y flechas ancladas.

## Flujo objetivo

1. Seleccionar grupo/mueble → tocar **Planos A4**. Mostrar vista previa inmediata sin recorrer formulario de proyecto largo.
2. Toggle obvio `1 vista` / `2 vistas`; si hay una sola, elegir `Exterior` o `Interior`.
3. Rotar cámara arrastrando o con iconos; mostrar botón «Restablecer vista». El gesto **solo modifica cámara de la guía**, no la geometría en SketchUp.
4. En interior, modo `Ocultar pieza`: clic sobre una puerta o cualquier componente para quitarlo de la **representación interior**. Panel compacto con chips de piezas ocultas, botón «Mostrar todas» y deshacer. Nunca borrar la pieza del listado de materiales ni ocultarla en el modelo 3D real.
5. Comentario: clic sobre pieza/punto → cuadro breve → flecha anclada; editar, reanclar, mover, borrar. Una edición rápida no debe abrir varias pantallas.
6. El PDF debe usar exactamente la misma composición que se previsualiza. Mostrar tabla y nombres completos, medidas correctas y cotas sin cortes.
7. Cuando una hoja no sea legible, mostrar exactamente si el bloqueo es listado, textos, notas o vistas y ofrecer ajustar distribución/zoom/espaciado. **No ocultar piezas ni crear una segunda hoja automáticamente**.

## Casos de prueba

- Mueble simple con 1 vista; grande con 2; mueble con puertas ocultadas, y pieza interior ocultada aparte.
- Componentes anidados/repetidos y definiciones compartidas; ocultamiento por `route ID`, no por nombre de definición.
- Guardar → cerrar → reabrir: cámaras, ocultos, notas conservadas; `GuideStore` y `Session` sin corromper otras configuraciones.
- A4 real 297×210 mm, una hoja por mueble; renderizar y comparar con editor (no basta con validar dimensiones del archivo).

No volver al diseño anterior A3 ni reinventar exportador si pdf-lib local ya funciona.
