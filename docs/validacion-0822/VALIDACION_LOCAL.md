# Validación local de candidata 0.8.22

Esta entrega está probada con Ruby y Chromium en Linux, con dobles de la API. No está aprobada para producción ni se ejecutó SketchUp real en la nube.

## Instalar y verificar

1. Conservar la instalación anterior, el modelo original y la biblioteca de producción. Trabajar con copias y catálogo QA.
2. Comprobar el SHA256 del RBZ contra `dist/PlanosSanto-0.8.22-candidata.rbz.sha256`.
3. Instalar el RBZ en el Administrador de extensiones. Cerrar TODAS las ventanas de SketchUp y volver a abrir.
4. Confirmar versión 0.8.22 y ejecutar en consola Ruby el verificador de solo lectura `docs/validacion-0811/verificar_0811_sketchup.rb`. No cargar archivos Ruby sueltos del repositorio para parchear la candidata.

## Recorrido nuevo

- Abrir un modelo QA con dos materiales y espesores distintos, varias piezas en distintos muebles. Generar/guardar la guía y abrir Maderera.
- Comprobar logo, azul noche, contraste, foco, textos largos y escalado Windows 100/125/150%. Las tarjetas agrupan por identidad de material y espesor, no por mueble; fichas diferentes con nombres iguales no se fusionan.
- Abrir una tarjeta por ratón y por Enter; se ve solo su detalle. Volver a materiales restaura foco. Revisar un material bloqueado, ausencia de formato y piezas excluidas: los totales deben indicar cálculo parcial.
- Elegir **General**, configurar sierra/refilado/giro. Confirmar formato desde la ficha y TXT de nueve columnas. Debe funcionar con OpenCutList ausente.
- Elegir **Experto**: los controles de General se reemplazan por parámetros fijos 4,4/10/50. Placa 2750×1830 → útil 2740×1820; placa personalizada 1734×932 → útil 1724×922. No depende de marca ni nombre. Con veta no gira; sin veta puede girar conservando el contrato físico de cantos.
- Guardar TXT, volver a otra sección y reabrir Maderera: método persistido. Volver a General recupera los valores anteriores. Confirmar que no se puede exportar durante una nueva validación.
- Caso A sintético: tres piezas 1500×1500 en placa 2750×1830, espesor18, dos lados largos con canto: tres placas; recorrido estimado37,3464m; canto neto9m, margen10,35m, compra11m. Pasos estimados4 si las tres distribuciones son iguales. Comparar con proveedor, no usar como prueba industrial única.
- Rechazos Experto: pieza40×30; pieza2745×600 en formato2750×1830; pieza2600×600 en formato2600×1830. Debe bloquear cálculo/TXT del material y explicar la causa. Una pieza válida no debe convertir un lote inválido en total completo.
- Enviar al proveedor un pedido de prueba acordado. Confirmar nueve columnas, coma/punto según contrato fijo, cantos1/2 y significado de rota1 en piezas con cantos asimétricos. Conservar respuesta; no aprobar el perfil comercial sin esa evidencia.

## Regresiones obligatorias

- Pintar pieza y canto, instancias compartidas y Undo; catálogo foto/SKM y reabrir.
- Nombres agrupados sin cambios implícitos y edición intencional reversible.
- A4 exterior/doble, ocultas por ruta, cotas, flechas/notas; guardar/reabrir, dimensiones297×210mm y cantidad de hojas aprobada por usuario según funcionamiento vigente.
- TXT de General con cantos asimétricos permanece rota0. Los nombres, materiales y geometría originales no cambian al abrir/cambiar/calcular/exportar Maderera.
- Pedido grande: registrar duración y fluidez, sin confundir tiempo de captura/automatización con tiempo del motor.

## Evidencia a devolver

Versión y hashes instalados antes/después; sistema/SketchUp/Ruby/OCL; lista PASS/FAIL/PENDIENTE por caso; capturas y TXT sanitizados; PDF QA; resultados de importación comercial y cualquier bloqueo reproducible. Los modelos, materiales y fotos privados no deben publicarse en GitHub. El archivo `RESULTADOS.json` de nube mantiene `nativeSketchupExecuted:false` y `productionApproved:false`.
