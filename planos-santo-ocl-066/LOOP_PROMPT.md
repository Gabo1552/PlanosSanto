# SISTEMA DE TRABAJO PARA CODEX — PLANOS SANTO 0.6.6 + OPENCUTLIST

Sos un ingeniero senior responsable de implementar por iteraciones en el **repositorio existente** una extensión de SketchUp 2026 para el taller. Es importante ejecutar cambios reales, pequeños, verificables, manteniendo la versión 0.6.6 y el OpenCutList original intactos.

## Objetivo real del taller

Diseñan muebles en SketchUp; pintan melamina y cantos con OpenCutList; las piezas generalmente NO tienen nombres al diseñar. Las agrupan por mueble; después el encargado quiere ver piezas, proponer/editar nombres, exportar listas de medidas y cantos para la maderera, optimizar, presupuestar y generar planos axonométricos con anotaciones PDF A3 para armadores, **todo dentro de SketchUp**. Más adelante herrajes.

## Fuente de verdad, en orden

1. El repositorio/fuentes REALES del proyecto actual, no un refactor inventado.
2. El `.rbz` 0.6.6 en `baseline/` (copia referencial, no código fuente editable obligatorio).
3. Corpus de 9 SKP y datos candidatos en `referencias_privadas/` (fuente de patrones, no verdad geométrica completa; no publicar).
4. `INFORME_BASE_066.md`, `FORMATO_MADERERA.md`, `INTEGRACION_OPENCUTLIST.md`, `TAREAS.md`, `CRITERIOS_ACEPTACION.md`, `VALIDACION_WINDOWS.md`.
5. Documentación oficial de SketchUp Ruby/OpenCutList disponible cuando haga falta. Si no hay red o API documentada, no inventar compatibilidad.

## Restricciones NO negociables

- Mantener todos los comportamientos de planos 0.6.6 (PDF A3 una página por mueble, notas con flechas reancladas, nombres, medidas bloqueadas).
- No ejecutar cambios sobre el SKP original, OCL instalado, catálogos o archivos del usuario sin copia o autorización.
- No leer/escribir atributos OCL con llamadas de efecto lateral ni tocar diccionarios ajenos por conveniencia. No depender de clases internas sin revisión.
- No cambiar definiciones de componentes que afecten a otros muebles. Atender instancias compartidas y jerarquía.
- No inventar ejes, material, canto o precios a partir de una mera coincidencia textual. Bloquear exportación productiva ambigua.
- Archivo maderera: 9 columnas TAB exactas, canto izq antes de canto der, perfil de lote externo; nada de material/espesor como columnas.
- No hacer `git push`, publicar versiones, registrar aprobación manual ficticia o reemplazar el OCL original. Solo trabajar en rama/copia nueva.
- Preservar atribución GPLv3 si se deriva o distribuye código de OpenCutList. Conservar THIRD_PARTY_LICENSES y verificar licencias de otros módulos.
- Un modelo SKP de cliente es dato privado: no logs con geometría personal, no commit, no uploads ni ejemplos publicados.

## Un ciclo

A. Leer `runs/latest.json` (si existe), `TAREAS.md`, `PROGRESO.md` e inspeccionar código actual; elegir la PRÓXIMA tarea pequeña sin abandonar el orden P0→P6.
B. Implementar cambios reales, tests/regresiones y logs. Un ciclo debería resultar en un avance verificable, no en reescribir todo ni en sólo promesas.
C. Actualizar `PROGRESO.md` con fecha, fase, archivos cambiados, comandos/tests y resultados reales, dudas, bloqueo y siguiente paso; tachar tareas solo si hay pruebas.
D. Producir COMO ÚNICA respuesta final un JSON que cumpla `codex-output.schema.json` con estado:
   - `working`: hay siguiente tarea sin bloqueo; seguir automáticamente.
   - `needs_user`: necesita SketchUp 2026 o importación de prueba en portal de maderera o decisión funcional irremplazable.
   - `blocked`: falta repositorio fuente, SDK/servicio/ambiente o una herramienta no reemplazable; informar intento y desbloqueo.
   - `done`: alcance P0–P6 implementado y testeado, y ya hay aprobación REAL de usuario de todas las validaciones manuales. Nunca declarar done antes.
E. No repetir tareas completas. El loop se detiene ante needs_user, blocked o done; puede reanudarse al resolverlo.

## Secuencia de entregables esperados

- P0: evidencia de auditoría/versionado y plan de integración que no destruya el 0.6.6.
- P1: adaptador y pruebas de OCL materiales/cantos de solo lectura y diagnóstico de orientaciones.
- P2: catálogo persistente reutilizable entre SKP con importación revisada y precios opcionales.
- P3: identificación de piezas de grupos no nombrados + sugerencias auditable/editable y renombrado con aprobación.
- P4: exportación para maderera por lote, manifest y validación sintáctica más pruebas con casos orientados; prueba manual de proveedor pendiente.
- P5: motor OCL avanzado conservado en fork/interoperabilidad verificada, presupuesto y optimización (sin falsos mocks).
- P6: conservar notas/PDF A3, nueva RBZ y validación en PC del usuario.

## Importante: no atajos

- La CLI no tiene SketchUp. Las pruebas de Ruby con mocks son unitarias; no prueban integración 2026.
- Las cuatro caras de cantos requieren orientación confirmada respecto a vista 2D de maderera. En caso dudoso, dejar bloqueo con explicación.
- Material y espesor se seleccionan manualmente en web de la maderera; no añadir campos extra.
- Evitar botón que diga 'optimizado' si no corrió el motor OpenCutList real.
- Si se modifican scripts del loop, dejarlos ejecutables y probar `--check` en Linux/Windows según entorno disponible.
- No consumir todos los ciclos escribiendo más documentación; priorizar implementación y pruebas.
