# Criterios objetivos de aceptación (primera fase: candidato automatizado)

## Barra
1. En SketchUp 2026, tras instalación en limpio, `Ver > Barras de herramientas` permite habilitar/ocultar `Planos Santo` y `Planos Santo - Herramientas` de manera independiente.
2. Los siete accesos esenciales aparecen con iconos diferentes, rutas internas correctas, tooltip, texto de estado y entradas de menú equivalentes. Si no existe una función, el botón no se entrega como funcional.
3. Al reiniciar o recargar no hay botones duplicados. La preferencia de visibilidad/posición se conserva.
4. Los estados `CHECKED/UNCHECKED/GRAYED` reflejan la herramienta realmente activa o la condición que la bloquea.

## Pintura
5. `Pintar placa`, `Pintar canto` y `Quitar canto` abren paleta compacta y activan modo correcto sin grabar cambios en ese paso. Con material sin confirmar, pide selección en lugar de inventar opciones.
6. Un clic sobre cara válida, seguido de los controles explícitos del servicio, aplica solo lo autorizado; muestrario/hover/cuentagotas no cambia geometría.
7. Shift+clic/Enter usa el comportamiento por lote de la herramienta actual; Esc, cambio de herramienta, modelo o diálogo cancelan correctamente las colas pendientes.
8. Se puede Deshacer un gesto con un único Undo nativo (y nada para no-op), con componentes anidados, rotados y compartidos sin editar otros muebles por accidente.
9. La compatibilidad con los materiales existentes de OpenCutList es de lectura; Planos Santo pinta con sus materiales propios aprobados aun si OCL no está instalado.

## Flujo de taller
10. Los botones Muebles, Maderera y Guías abren la sección requerida y recuperan la selección cuando sea segura. No renombrar sin revisión, no exportar TXT ni PDF automáticamente.
11. Biblioteca local, pedidos TXT, cantos, notas, nombres y PDF A4 no pierden funciones frente a 0.8.2.
12. El ZIP/RBZ incluye archivos fuente, manifiesto validado, documentación de licencia y versión incrementada.

## Pruebas / evidencia obligatoria
- [x] Ruby `-c` para todos los archivos Ruby del RBZ.
- [x] JS `node --check` (si se usa bundler, comprobar fuentes/build también).
- [x] Tests unitarios de comandos UI y cambios de modo.
- [x] Tests unitarios/regresión de pintado y guardarraíles de producción.
- [x] Script de verificación de hashes del RBZ final.
- [x] Registro de pruebas no ejecutables en nube como **PENDIENTE de validación real**.
- [ ] Instalar y probar dentro de SketchUp 2026 con Dot antes de declarar listo para producción.
