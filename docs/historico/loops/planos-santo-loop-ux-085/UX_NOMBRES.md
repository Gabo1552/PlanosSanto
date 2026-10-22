# Panel visual de muebles y nombres — P1

## Flujo objetivo

1. Con un mueble (grupo/contenedor) seleccionado, tocar **Muebles**. Mostrarlo directamente y listar sus piezas físicas y subgrupos; fallback a selector cuando no hay selección.
2. Tabla con ID estable `P01`, nombre actual o sugerido, medidas *solo lectura*, cantidad, icono para resaltar y distintivo de alerta si está ambiguo.
3. Doble clic o Enter en nombre = edición **inline**; Tab pasa a la siguiente pieza. Escape deshace edición no confirmada.
4. Proponer nombres de acuerdo con los patrones del taller (Proyecto + Mueble + Pieza) y geometría *cuando exista evidencia*, distinguiendo `sugerencia` de `confirmado`. Las piezas sin nombre no deben asumirse ya reconocidas.
5. **Aplicar renombrado**: una vista previa del lote, indicando originales/nuevos, advertencias por definición compartida y posibilidad de excluir filas. Una confirmación por lote, no una por pieza.
6. Resaltar en SketchUp mediante `PieceHighlightTool` sin seleccionar componentes incorrectos; respetar jerarquía `ruta de instancia` de `NameManager`.

## Casos importantes

- 752 nombres automáticos detectados en el corpus histórico; algunos son `Grupo#`/`Componente#`. No bloquear el flujo por falta de nombre original.
- Nombres ya modificados afuera del panel: no pisar cambios recientes; regenerar vista previa si cambió el modelo.
- Subgrupos y definiciones compartidas: renombrar *instancias* donde seguro; el `NameManager` actual registra rutas, revisar colisiones.
- Revisar `Piso`, `Base`, `Est`, `Lat`, `Fondo`, `Fte`, `Del Caj` como vocabulario tentativo; PT/Banq/Ranu no deducir automáticamente.
- El usuario puede cambiar nombre/abreviatura del grupo padre sin duplicar prefijos en las piezas.

## No hacer en esta iteración

No crear un «modelo inteligente» no evaluado ni simular porcentajes de acierto. Primero hacer **rápida** la revisión y corrección; toda clasificación geométrica debe tener test contra ejemplos anotados reales.
