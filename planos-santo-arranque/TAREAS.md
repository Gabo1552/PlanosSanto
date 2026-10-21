# Backlog de arranque — tareas para el loop de Codex

## Etapa P0 — Antes de programar la personalización
- [x] P0.1 Inventario del repositorio REAL: extensión real 0.6.4 (legado 0.3 conservado), web/PDF actual, .rbz, scripts, pruebas. Guardar `docs/arquitectura-actual.md`; no borrar.
- [x] P0.2 Respaldo de archivos verificado (Git inicial sin commits) y lista de regresiones de funcionalidad existente. Asegurar ignore de corpus privado.
- [x] P0.3 Evaluar código OpenCutList oficial y su GPLv3, registrar commit/tag upstream, dependencias/build y riesgos de fork completo vs integración aditiva. Entregar **decisión motivada**, conservando originales y ID/namespace independiente.
- [x] P0.4 Confirmar integridad de los 9 SKP (hashes), 1523 nombres de definiciones no equivalentes a piezas; documentar qué se sabe/no se sabe.

## Etapa P1 — Verdad geométrica
- [x] P1.1 Revisar script de extracción Ruby y preparar integración temporal segura en SketchUp 2026, solo lectura, exportando JSON de jerarquía, instancias, transformaciones, materiales de caras y referencias a cantos.
- [ ] P1.2 Una prueba guiada por el usuario con copia de `CA AmSurrbac`; capturar datos y comprobar algunas medidas y orientaciones manualmente. Marcar `needs_user` si se requiere SketchUp real.
- [x] P1.3 Modelar instancia física con ruta de ancestros/persistent_id y detectar jerarquía de muebles por selección o agrupación verificable (no nombres textuales).
- [x] P1.4 Tests de piezas rotadas, instancias repetidas, grupos anidados, piezas sin nombre, dos muebles compartiendo definición, elementos que no son tablones.

Evidencia P0: `../docs/arquitectura-actual.md`, `../docs/opencutlist-integracion-p0.md`, respaldo/manifiesto en `../artifacts/`, verificador de corpus y sus hashes originales (privados). P0.2 usa la opción copia de resguardo porque no existe commit base; no se creó una rama ficticia ni se versionaron datos.

Evidencia P1.1/P1.3/P1.4: `../sketchup_offline/p1_diagnostics.rb`, `../sketchup_offline/test/p1_diagnostics_test.rb`, `../scripts/validar_diagnostico_p1.py`, `../docs/diagnostico-p1-contrato.md`. Las marcas significan código y pruebas automatizadas con API sintética; **P1.2 sigue pendiente**, por lo que la fase geométrica y la integración nativa no están aceptadas. No se clasifican cantos ni frente mediante nombres.

## Etapa P2 — Identificación y renombrado por mueble
- [ ] P2.1 Vista en HtmlDialog dentro de SketchUp: selector mueble, lista completa de piezas, selección/resaltado y vista despiezada si está disponible.
- [ ] P2.2 Motor de propuestas usando geometría (posición, orientación, proporciones) más vocabulario del corpus; nivel de confianza y descripción de por qué; abstenerse si falta frente del mueble.
- [ ] P2.3 Nombres editables, prefijo derivado del grupo o código elegido, vista previa y confirmación. Única operación de SketchUp deshacible, idempotente, sin renombrar definiciones compartidas.
- [ ] P2.4 Persistencia y reutilización local de correcciones confirmadas; auditoría y protección contra nombres ambiguos.

## Etapa P3 — Biblioteca propia de materiales y cantos
- [ ] P3.1 Catálogo persistente fuera de los .skp con SKU, proveedor, familia, sustrato, espesor, dimensiones de placa, textura/veta, colores, cantos compatibles (principal/secundario) y precios con vigencia.
- [ ] P3.2 Importador de candidatos OpenCutList + exportación/copia de seguridad; no inventar precios ni fusionar nombres similares automáticamente.
- [ ] P3.3 Selector rápido para pintar en SketchUp compatible con Smart Paint/caras; definir si se reutiliza funcionalidad original o si se necesita adaptador, sin cambiar formato OCL sin motivo.

## Etapa P4 — Maderera: exportación verificable
- [ ] P4.1 Modelo de pedido con orientación 2D explícita por pieza, caras/cantos exactos; marcar incertidumbres y bloquear exportación dudosa.
- [ ] P4.2 Partir pedidos en lotes por `material+espesor+canto_principal+canto_secundario`, con manifest de qué elegir en la web del proveedor.
- [ ] P4.3 Exportar **TXT con TAB, nueve campos exactos** `cant base altura detalle rota canto_arr canto_aba canto_izq canto_der`, en ese orden; pruebas con `scripts/validar_pedido_txt.py`.
- [ ] P4.4 Verificar `rota` conservadora, piezas duplicadas agregadas solo cuando todas las propiedades coinciden, decimales en mm, caracteres y sin encabezado por defecto.
- [ ] P4.5 Validar importación real en web de la maderera con un lote pequeño; registrar codificación, decimal y encabezado aceptados, sin enviar pedidos comerciales sin autorización.

## Etapa P5 — Conservar y simplificar OpenCutList
- [ ] P5.1 Mantener optimización de placas, listas de materiales y cantos, etiquetas, presupuestos/costos y funciones originales, con pruebas de paridad básicas.
- [ ] P5.2 Interfaz primaria minimalista: Muebles, Materiales/Cantos, Pedido maderera, Optimización/Presupuesto, Planos A3; originales poco usadas en modo avanzado.
- [ ] P5.3 Respetar licencias/atribuciones, no instalar encima del OCL oficial mientras esté en prueba.

## Etapa P6 — Planos dentro de SketchUp (sin página web)
- [ ] P6.1 Conservar editor de axonometrías/annotaciones actual y abrirlo en HtmlDialog local (offline), con flechas ancladas y lista de piezas.
- [ ] P6.2 Generar PDF A3 horizontal, exactamente una hoja por mueble, nombres/medidas/cantos y comentarios legibles. Elegir implementación soportada según API disponible y verificar PDF real.
- [ ] P6.3 Construir RBZ instalable aislado y prueba de instalación/desinstalación dentro de SketchUp 2026 en Windows.

## Fuera del MVP
- [ ] F1 Catálogo de herrajes, colocación rápida y consumo por mueble (después de estabilizar el flujo principal).

## Cierre de fase
Cada tarea debe tener: `código`, archivo(s) cambiado(s), test reproducible, resultado y si requiere prueba manual. **No marcar las fases 5/6 completadas por una maqueta o por no haber encontrado errores en un entorno sin SketchUp.**
