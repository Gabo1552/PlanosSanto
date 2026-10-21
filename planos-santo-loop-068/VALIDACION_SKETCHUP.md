# Validación obligatoria en SketchUp 2026 Windows

**Debe realizarla una persona con acceso a SketchUp y a la maderera.** Codex no puede marcarla como ejecutada sin evidencia.

1. [ ] Instalar la nueva `.rbz` en un perfil de prueba desde Administrador de extensiones, conservando la 0.6.8 original como respaldo. Abrir y cerrar sin error.
2. [ ] Con el modelo `CA AmSurrbac`, verificar que detecta el mueble de ocho piezas del ensayo anterior. Confirmar cantidades físicas contra SketchUp y no contra nombres de definiciones.
3. [ ] Probar otro SKP con varios muebles y piezas sin nombre: listar todas las ocurrencias, incluso en grupos anidados.
4. [ ] Cambiar el nombre y abreviatura de un grupo; revisar sugerencias de piezas y aplicar. Guardar, cerrar, reabrir: nombres persisten y los repetidos no se renombran en otros muebles.
5. [ ] Probar deshacer la operación de renombrado (Ctrl+Z de SketchUp) y confirmar recuperación.
6. [ ] Marcar el frente de un mueble y verificar posiciones izquierda/derecha de cada lateral, fondo y travesaño.
7. [ ] Revisar un tablón girado, uno espejado y uno compartido entre muebles; validar medidas y correspondencia de cantos con OpenCutList.
8. [ ] Verificar que cada canto pintado se asigna al lado 2D correcto (`arr`, `aba`, `izq`, `der`) y muestra el rol principal/secundario correcto.
9. [ ] Probar una pieza sin material confirmado y otra con geometría atípica: el sistema debe **bloquear exportación** sin perder esas filas.
10. [ ] Generar lotes por material, espesor, canto principal y secundario. Confirmar cantidades, TXT con 9 columnas y sin mezclas.
11. [ ] Importar **un TXT de prueba** en la maderera, revisar que interpreta lados, rotación y materiales; **no enviar a producción sin revisión**.
12. [ ] Crear/editar/mover/reenlazar nota con flecha; guardar y reabrir; generar PDF A3 horizontal, exactamente una hoja por mueble, sin recortes y legible.
13. [ ] Confirmar que la biblioteca local persiste entre proyectos sin sobreescribir la de OpenCutList.
14. [ ] Documentar versión de SketchUp, versión de OpenCutList, capturas/reporte, nombre de validante y fecha; completar `manual/validacion_usuario.json` basado en el ejemplo.

La aceptación del operador habilita la **validación real**; no implica que la versión esté automáticamente lista para todos los muebles del taller.
