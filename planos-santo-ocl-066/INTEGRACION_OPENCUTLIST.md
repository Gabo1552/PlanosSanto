# Estrategia para personalizar OpenCutList sin romper el taller

**Origen oficial de OpenCutList:** https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension (GPL-3.0). Su motor ya contempla listas de corte, diagramas de optimización 1D/2D, materiales/cantos, etiquetas y estimaciones.

## Regla de arquitectura

1. **Primero, compatibilidad de solo lectura** desde Planos Santo usando el modelo y APIs públicas de SketchUp. Leer materiales/atributos de `ladb_opencutlist` sin mutarlos ni depender de clases internas que creen UUID u otros efectos de lectura. No introducir `require` de los archivos internos de OCL en la extensión del usuario.
2. **Para optimización, presupuestos, etiquetas y funciones completas**, evaluar un fork real de OpenCutList en un espacio separado (rama/paquete/licencia) frente a integración por interoperabilidad; decidir con informe de dependencias/costos. No reimplementar silenciosamente un optimizador básico como sustituto del motor completo.
3. El original y la versión de prueba deben poder coexistir: evitar conflictos de módulos Ruby, identificadores de extensión, menús, preferencias, diccionarios y archivos de recursos. Si una coexistencia segura no es factible, detener instalación y ofrecer mecanismo de ensayo reversible.
4. Conservar licencia GPLv3, autorías, avisos, licencias de terceros, código fuente correspondiente y cambios publicados según corresponda a la distribución. No fusionar código GPL con código incompatible sin resolver licencias.
5. Versionar el mapeo `OpenCutList material -> Planos Santo catalog`. Las claves internas de OCL pueden cambiar; evitar depender únicamente de nombres o colores. Incluir diagnósticos por cada versión que se soporte.
6. **Nunca** editar atributos de materiales o pintar caras en la primera fase de integración. El catálogo del taller es distinto del material del archivo `.skp`, y su sincronización debe ser explícita, previsualizada y reversible.

## Datos de cantos / orientación

- OpenCutList marca material de canto en caras del sólido; hay que asociar cada cara física al lado **arriba/abajo/izquierda/derecha de la vista 2D de la pieza**.
- Contemplar ejes locales, escala no uniforme, piezas espejadas, rotaciones, veta, piezas encastradas, caras ocultas y materiales heredados. Si no se puede determinar inequívocamente, bloquear exportación para producción hasta que el encargado confirme.
- `material/canto principal/secundario` se seleccionan por separado en la web del proveedor, no se mandan como columnas en TXT.
- El `canto principal/secundario` es un rol **por lote para la maderera**, no una propiedad universal del material.

## Catálogo persistente

- Biblioteca compartida entre proyectos con ficha de melamina/placa, marca, código, textura, espesor, formato, veta y costos; cantos compatibles con ancho, espesor y precio, proveedor e historial de actualización.
- Reutilizar información del modelo y OpenCutList mediante importación con vista previa y conciliación (nunca asumir que un mismo nombre significa el mismo producto).
- Guardado local transaccional en una ubicación de usuario estable (p. ej., directorio de datos de aplicación; no junto al `.rbz`). Respaldos, migración de esquema y exportar/importar catálogo.
- Modo básico por flujo: Diseñar/Pintar -> Muebles y piezas -> Maderera -> Optimización/Presupuesto -> Planos A3. Funciones originales se mantienen accesibles en modo avanzado.
