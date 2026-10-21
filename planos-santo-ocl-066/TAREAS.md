# Backlog incremental. Actualizar marcando [x] SOLO cuando exista código y prueba.

**Actualización 0.6.8:** el usuario pidió continuar y reunir la validación en SketchUp al final. Las marcas [x] significan implementado y probado automáticamente; la aceptación Windows/proveedor permanece pendiente. Ver `../docs/loop-ocl-068.md`. Las notas de 0.6.7 al pie son históricas.

## P0 — Auditoría y preparación (primero)
- [x] Localizar fuentes reales en `/workspace/PlanosSanto` o ruta actual: Ruby, UI React/TS, tests y empaquetador. Si solo existe `rbz` y no hay fuentes editables, documentar la carencia; reconstruir estructura **sin modificar ni perder el baseline** o pedir intervención.
- [x] Comparar contra `baseline/PlanosSanto-0.6.6.rbz`, registrar hash y límites de este release.
- [x] Crear rama o checkpoint, NO hacer `git init` destructivo, `reset --hard`, `push`, publicación ni despliegue sin orden.
- [x] Definir módulos para OCL, catálogo, estimaciones, exportación TXT y reconocer la versión única (evitar reportar 0.3.0 por error).
- [x] Verificar regresiones de notas/PDF A3, nombres y acciones existentes antes de cambios.

## P1 — Adaptador de lectura OCL + diagnóstico estructurado
- [x] Enumerar materiales en el SKP y metadatos de OpenCutList por API Ruby oficial en modo solo lectura.
- [x] Identificar tipos de placa/canto sin depender de nombre/color; diagnosticar material heredado, superficies pintadas (front/back), sin asignar un lado 2D falso.
- [x] Mantener una `capabilities`/`confidence` por material y pieza; advertencia al no poder resolver compatibilidad/versiones.
- [x] Tests de material principal, canto, cantos múltiples, caras no pintadas, rotación, espejo y ausencia OCL.

## P2 — Catálogo persistente del taller
- [x] Catálogo global versionado de placas/melaminas, espesores y tamaños, canto compatible (tipo, ancho, espesor, proveedor), precios opcionales, veta y fecha de actualización.
- [x] Importar los **58 registros realmente incluidos** (el backlog decía 111; faltan 53 en el ZIP, sin inventarlos) como **sugerencias sin aprobar** con deduplicación y conflictos visibles; no inventar precios.
- [x] Biblioteca local que sobreviva al abrir otro SKP/reiniciar SketchUp, copias de seguridad, export/import, migraciones y guardado atómico.
- [x] Interfaz resumida `Materiales y cantos`, selección de favoritos y modo avanzado para opciones OCL originales.
- [x] No editar material/atributo OCL en el modelo sin confirmación explícita del encargado.

## P3 — Administrador de muebles, nombres y previsualización
- [x] Mostrar árbol del mueble seleccionado y **todas** sus piezas (contenedores anidados, duplicados por instancia, ocultos marcados).
- [x] Proponer nombres de pieza automáticamente a partir de geometría/posición relativa y vocabulario de funciones de carpintería revisable; contraste del corpus nativo en validación final; permitir `sin clasificar` si ambigua y justificar sugerencia.
- [x] Permitir cambiar nombre del mueble y nombres propuestos, aprobar por lote o pieza; nombre en instancia, no mutar definiciones compartidas. Reusar NameManager 0.6.6.
- [x] Conservar el código de mueble/proyecto, corregir prefijos sin duplicarlos, permitir Undo de SketchUp y readvertir al modificar el modelo.
- [x] Resaltar pieza seleccionada y despiece sin alterar geometría original.
- [x] Tests con nombres automáticos (`Componente#`/`Grupo#`), anidados, espejados, grupos compartidos, puertas, pisos/estantes indistinguibles y variaciones de vocabulario.

## P4 — Exportador exacto para la maderera (prioritario)
- [x] Vista 2D de cada tablero y **mapeo verificable** cantos arriba/abajo/izquierda/derecha; flags de no ambigüedad.
- [x] Seleccionar/confirmar material, espesor, canto principal y secundario para cada lote; dividir TXT por combinación. Poner datos de elección en `manifest.json` separado.
- [x] Generar 9 columnas `cant base altura detalle rota canto_arr canto_aba canto_izq canto_der`, TAB real, sin columna material o espesor.
- [x] Respetar veta (rota 0/1), cantos 0/1/2 por lote; **nunca forzar rota=1 ni adivinar cantos**.
- [x] Detectar tamaño finished vs cut size, reducción por cantos/corte y no asumir dimensiones por ordenamiento numérico. Si hay dudas, bloquear generación de pedido.
- [x] Consolidar piezas solo si material, espesor, vista, veta, cantos y detalle son idénticos y corresponden a piezas físicas.
- [x] Validar contra `scripts/validar_pedido_txt.py`; salida atómica con no sobrescritura + manifest y trazabilidad al modelo.
- [x] Generar un archivo pequeño de prueba con dobles de API y validador sintáctico. **Aceptación real del portal pendiente al final**, no acreditada por ese archivo.

## P5 — Conservación del motor de optimización, materiales y presupuestos
- [x] Documentar decisión técnica **fork OCL GPLv3** vs interoperabilidad limitada y las dependencias reales. Priorizar reutilizar motor original para funciones avanzadas.
- [ ] Demostrar conservación/compatibilidad de optimización de placas (veta, espesor, kerf, formatos), listados, etiquetas, informes y costos. No presentar un botón simulado como implementación.
- [x] Presupuestos con precios voluntariamente cargados, fecha y fuente; componentes sin precio como `pendiente`, no 0 ni valor inventado.
- [ ] Probar que la instalación original OpenCutList no queda modificada y evitar choques de namespaces, menús, UUIDs y diccionarios.

## P6 — Integración con planos y QA
- [x] No romper el PDF A3 actual, notas con flechas, guardado de proyecto y versión 0.6.6 como respaldo.
- [x] Referenciar en los planos materiales/cantos solo tras resolverlos y marcarlos como revisados.
- [x] Empaquetar una **nueva** versión de `.rbz` (nunca sobreescribir el baseline) con instrucciones de instalación reversible.
- [ ] Completar pruebas automatizadas de Ruby/UI/ZIP/TXT. Obtener validación **manual** de SketchUp 2026 y maderera antes de afirmar listo para producción.
- [x] Registrar cambio, lista de módulos listos, pendientes técnicos y pasos siguientes en `PROGRESO.md`.

## Fuera del alcance inmediato
- Biblioteca de herrajes de inserción rápida: futura etapa, no frenar ni desplazar estas tareas.
- Automatizar inicio de sesión o subida al portal de la maderera: NO. Solo preparar los TXT y guía de selección manual.
- Entrenamiento de ML obligatorio: NO. Empezar con reglas auditables y ejemplos revisados.

## Evidencia de los ciclos de esta sesión

P0: baseline 0.6.6 idéntico, checkpoint de fuentes, privacidad y módulos registrados en `../docs/loop-ocl-067.md`. Se reutilizó la regresión 0.6.6 ya ejecutada, sin fingir una rama Git (no hay commit inicial).

P1 marcado como **implementado y probado automáticamente**, no como aceptado en producción: `../sketchup_offline/ocl_reader.rb`, `../sketchup_offline/ui/MaterialReview.tsx`, pruebas Ruby y E2E, replay de diagnóstico nativo previo. Estado de fase **needs_user**: comparar tipos y caras del lector nuevo en SketchUp 2026, guardar informe local y contrastar con OCL original; guía en `../docs/loop-ocl-067.md`. La enumeración de biblioteca completa solo fue probada con dobles de API; el diagnóstico real anterior incluía materiales aplicados.

P2–P6 siguen pendientes del orden del loop. No se importaron/aprobaron 111 candidatos, no hay catálogo global ni pedido TXT productivo, no se ejecutó optimización simulada, no se creó aceptación manual. Los A3 densos de 23/164 piezas conservan sus avisos pendientes.


## Continuación autorizada — 0.6.8

Catálogo (`catalog_store.rb`), propuestas (`nameSuggestions.ts`), pedido (`supplier_order.rb`/`workshop.rb`), interfaz y PDF compacto implementados. El portal sigue recibiendo un TXT por lote y un manifiesto separado. El acceso a OCL abre su diálogo real: no ejecuta un optimizador simulado. Presupuesto neto propio con precios opcionales/fechas y monedas separadas; sin desperdicio/optimización.

Los 58 candidatos se importaron a biblioteca privada de prueba y se exportaron como JSON opcional, todos sin aprobar y sin precios. No se incluyen en el RBZ. Criterios/corpus manual pendientes, junto con las pruebas de motor OCL original, conservación física del catálogo/SKP en Windows y aceptación del proveedor. La reproducción de los muebles de 23 y 164 piezas ahora genera dos A3 en modo compacto optativo; no acredita impresión ni ejecución nativa.

Evidencia final y checklist conjunto: `../docs/loop-ocl-068.md`, `../artifacts/validacion-loop-ocl-068.json`, `../CODEX_STATUS.json`.
