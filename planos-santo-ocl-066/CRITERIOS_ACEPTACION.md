# Criterios para aceptar avances

## A. Integridad

- La 0.6.6 funciona sin cambios, su copia `.rbz` conserva SHA-256 y existe procedimiento reversible.
- PDF A3, anotaciones, sincronización de nombres e interfaces actuales siguen con pruebas de regresión.
- Datos de los 9 SKP no se subieron al repositorio público ni quedaron incluidos en el `.rbz` distribuible.

## B. Materiales / cantos

- El catálogo se conserva al cerrar SketchUp, cambiar de proyecto y abrir otro SKP.
- Incluye placas y cantos compatibles sin duplicados por nombre; datos importados quedan pendientes de aprobación.
- Reconoce material pintado + cantos en las caras mediante SketchUp/OCL. El reporte diferencia observación de asignación **confirmada**.
- Piezas rotadas/espejadas/heredadas y caras sin materiales no generan asignación silenciosa de un lado erróneo.

## C. Renombrado

- El encargado puede entrar a un mueble sin nombres, ver todas sus piezas, seleccionarlas y corregir sugerencias.
- Se conserva el nombre original, se renombra por instancia en una sola operación con Undo y no se duplican prefijos.
- Las ambigüedades (`piso` vs `estante`, `tapa` vs `base`) se señalan y requieren revisión.

## D. Maderera

- TXT válido con nueve columnas separadas por 8 tabulaciones, sin encabezados ni columnas de materiales/costes.
- Las partes se separan por material, espesor y definición de canto principal/secundario. Un manifest documenta cada lote.
- Cantidad física real, `base`/`altura`, `rota` y mapa de cantos correctos contra pieza real; sin adivinación en casos inciertos.
- Archivo aceptado por web de la maderera **después** de prueba manual. Validador sintáctico solo no basta.

## E. Optimización y presupuesto

- Motor de OCL original disponible o integración probada con la misma capacidad de lista de cortes, diagramas, materiales, etiquetas y costos.
- Presupuestos no inventan precios; separan información sin cargar o vieja de datos vigentes.
- Interfaz simplificada con opciones avanzadas conservadas.

## F. Prueba en Windows/SketchUp 2026

- Instalar RBZ nuevo con respaldo sin pisar OpenCutList/Planos Santo original; reiniciar SketchUp y revisar consola.
- Modelos CA AmSurrbac + dos proyectos distintos: revisar recuentos físicos, medidas, grupo y todas las caras con canto.
- Guardar, cerrar, reabrir, renombrar, deshacer y exportar A3; validar PDF una hoja por mueble.
- Probar un TXT pequeño en proveedor con lote seleccionado, anotar resultado.
- **Sin estas pruebas, el estado es `needs_user`, no `done`.**
