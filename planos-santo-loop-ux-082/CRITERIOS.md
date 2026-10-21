# Criterios de aceptación verificables

- [ ] Cinco destinos claros: Inicio, Materiales, Muebles, Maderera, Planos A4. Funciones avanzadas recuperables.
- [ ] Acceso pintar placa/canto con un clic desde SketchUp toolbar; paleta compacta muestra material activo y modo; UI no tapa viewport principal.
- [ ] Iconos originales y coherentes a 24/32 px para todas las acciones principales; tooltip, texto estado y atajo desde menú.
- [ ] Toolbar sin duplicaciones tras reiniciar/reload; acciones reusan handlers del código existente.
- [ ] Navegación y selección se mantienen cuando cambiás panel; estados de carga, guardado, error y sin datos legibles.
- [ ] La biblioteca muestra thumbnails reales o placeholder y estado. Importa 35 SKM sin duplicados, sin aprobar tipo por nombre y sin pérdidas de textura/backup.
- [ ] Abrir otro proyecto mantiene biblioteca del taller, sin modificar el modelo anterior.
- [ ] Muebles: seleccionar pieza → resaltado en modelo; renombrar con vista previa y confirmación sin cambios colaterales de definiciones compartidas.
- [ ] Maderera: TXT conserva las 9 columnas exactas y bloquea sin validar orientación/cantos/lotes.
- [ ] Planos: elegir 1/2 vistas A4; ocultar piezas sin cambiar modelo; PDF y notas/flechas no sufren regresión.
- [ ] 1280×720, 1920×1080, 100%/125%/150% de escala: contenidos accesibles; ventana compacta y maximizada operables.
- [ ] Teclado/contraste/foco/espaciado/tooltip, errores explican cómo resolverlos.
- [ ] Capturas «antes/después» comparables en pantallas principales; no valen solo mockups.
- [ ] Tests automáticos registrados con comandos y resultados; pruebas reales SketchUp marcadas PENDIENTES hasta ejecutadas por Codex local.
- [ ] RBZ candidata, manifest/hashes, instrucciones de instalación/rollback y lista de pendientes.


## Resultado de nube — candidata 0.8.4

Los checks de aceptación anteriores permanecen abiertos cuando incluyen SketchUp/DPI/operación real. Evidencia automatizada aprobada: cinco destinos, estados/contexto, iconos y registro de comandos con dobles, biblioteca35candidatos/35miniaturas, reimportación sin duplicados, resaltado readonly por ruta, renombrado/Undo, TXT nueve columnas, A4/notas/vistas, teclado/foco, comparación antes/después y paquete con hashes. Ver RESULTADO.json y verify-ux-084.log.

Zoom CSS1280×720/1920×1080 a100/125/150% no sustituye DPI nativo. Falta instalación, acciones y picking reales, persistencia de catálogo al reiniciar SketchUp/otro proyecto, carga nativa de SKM, ensayo selectorPDF158s y aceptación comercial. Validar con Codex local/Dot antes de marcar aceptación completa.
