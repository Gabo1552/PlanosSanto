# Decisiones a validar con el encargado; no bloquear toda la programación

- **Frente del mueble:** como se define en cada grupo (elección del encargado, ejes, cámara guardada o una referencia).
- **Convenciones de piezas:** `Lat`, `Piso`, `Tapa`, `Fondo`, `Puerta`, `List`, `Fte`, `Del Caj`; no expandir `PT`, `P`, `Banq`, `Ranu` sin validar con ejemplos reales.
- **Catálogo aprobado:** melaminas vigentes, cantos compatibles, precios/moneda/fecha, stock y proveedor; el corpus solo ofrece candidatos.
- **TXT proveedor:** confirmado TAB y nueve columnas exactas, pero pendiente validación práctica del encabezado, codificación, decimal `.`/`,` y orden de selección de materiales/cantos en la web. El sistema debe poder ajustar la serialización sin tocar la geometría.
- **Rotación (`rota`):** criterio del proveedor sobre veta y cantos. Usar valor conservador `0` ante duda y permitir corrección explícita.
- **Empaquetado:** estrategia de fork/adaptador que mantenga OCL intacto y evite conflicto de IDs, rutas, diccionarios y nombres de extensión. Verificar al instalar versión de prueba .rbz con OpenCutList oficial coexistiendo.
- **Planos A3:** definir cómo exportar PDF dentro del entorno SketchUp de Windows con la API realmente disponible; no asumir acceso al programa LayOut en todas las licencias sin verificar.
