# Validación real pendiente — Codex local y Dot

La nube entrega una candidata 0.8.4 con pruebas automatizadas y capturas sintéticas. No se ejecutó SketchUp 2026 ni se cargaron los35 SKM en un modelo nativo desde nube. Las comprobaciones del importador usan archivos reales sobre una biblioteca QA aislada; no aprueban material, dimensiones ni pedidos.

## Preparación e identidad

1. Conservar el RBZ 0.8.3 y respaldar `%LOCALAPPDATA%/PlanosSanto` completo (catálogo, backups, material-assets y nuevos skm-import-assets). Usar copia de BM17/originales, catálogo QA aislado y nunca desinstalar OpenCutList del perfil habitual.
2. Cerrar TODAS las ventanas de SketchUp, instalar `PlanosSanto-0.8.4-candidata.rbz` desde Administrador de extensiones y volver a cerrar/abrir. No instalar el ZIP de entrega ni la referencia 0.8.2 ni el fixture0.5.3 de pruebas.
3. Verificar SHA contra `.sha256`, versión cargada 0.8.4, archivos según manifiesto y registro de comandos. No cargar parches en memoria del runner0.6.9 ni sustituir fuentes de Plugins. Los verificadores adjuntos son de solo lectura y su carga no ejecuta ensayos.
4. Registrar Windows/SketchUp/Ruby/OCL y escala de pantalla. La importación requiere REXML disponible en Ruby; se carga solo al analizar SKM. Si falta, devolver el mensaje y no instalar dependencias por cuenta propia ni declarar caída de otras funciones.

## Navegación y uso diario

- Comprobar Inicio, Materiales, Muebles, Maderera y Planos A4, teclado/Tab/foco, estado del modelo, material, mueble y guardado. Alternar conservando búsquedas/selección/borradores; una sola acción principal por contexto y funciones antiguas accesibles en opciones.
- Inicio lleva al selector de muebles o biblioteca y permite continuar mediante acciones reales. No se generan PDFs/TXT ni renombres por pulsar un acceso de navegación.
- Barras opcionales: principal 1 y herramientas 7, máximo 8 visibles. Materiales, placa, canto, quitar, muebles, pedido y planos; cuentagotas conserva menú/atajo y paleta. Verificar iconos lineales 24/32, tooltip, estado real activo/deshabilitado y motivo.
- Acoplar/ocultar cada barra, reiniciar y reabrir; no duplicaciones ni reaparición forzada. Probar atajo desde Extensiones y acceso inmediato mientras carga la ventana.
- La paleta compacta debe dejar el modelo visible; no incluye un falso viewportHTML. El material activo y su tipo/estado se ven sin autorizar instancias por defecto.

## Importar los35 SKM privados

1. Usar el ZIP original del usuario en PC local. No está incluido en RBZ/fuentes/ZIP público de entrega. Abrir Materiales > Importar biblioteca > ZIP o carpeta; analizar35 filas y miniaturas reales o explicación si no hay imagen utilizable.
2. Antes de confirmar, comprobar que modelo, selección, geometría y Undo no cambian. Seleccionar/excluir entradas y cancelar con Escape: devuelve foco al botón Importar sin perder contexto. Los accesos nativos deben bloquearse mientras hay vista previa pendiente.
3. Confirmar importación;35 candidatos quedan `kind=unknown`, `approved=false`, con SKU/proveedor/veta/formato/medidas pendientes. El nombre `Canto`, `Catno` o `18mm` es una sugerencia no verificada, nunca aprobación.
4. Cerrar/reabrir extensión y SketchUp; abrir otro SKP y comprobar biblioteca permanente y miniaturas. Distinguir Todo el taller / En este modelo: importación al taller NO significa carga nativa en el modelo.
5. Reimportar el mismo ZIP:35 duplicados,0 nuevos y revisión sin cambios si no hay selección nueva. Probar un SKM modificado y mismo nombre en una COPIA QA: conflicto explícito, renombrar candidato nuevo o excluir, nunca sobreescribir ficha/activo anterior.
6. Probar ZIP corrupto, cancelación y edición concurrente del catálogo: error legible y biblioteca/backups anteriores conservados. No utilizar archivos maliciosos de terceros; fixtures sintéticos de las fuentes cubren rutas/CRC/XML.
7. Completar datos reales de una placa y un canto; aprobar solo tras revisión técnica. Favoritos y filtros deben funcionar, faltantes visibles. Precios son opcionales y no se inventan.
8. Cargar explícitamente el SKM aprobado en el modelo con confirmación; comprobar textura, orientación/veta, binding propio y Undo según servicios actuales. Muestra/importación no carga todos los35 materiales en el SKP.
9. Verificar que rutas absolutas internas de document.xml no se muestran, no se usan para buscar imágenes ni se copian al índice público. El archivo SKM original se conserva opaco en archivo privado por SHA para la carga nativa; miniaturas se obtienen de entradas embebidas.

## Pintura, nombres y resaltado

- Placa/canto/quitar reutilizan Pintura Inteligente; Activar exige material vigente y ejes/cara/alcance revisados. Cambio de modo no concede autorización compartida. Hover resalta superficie/rutas antes de aplicar; probar un clic, Shift/lote Enter, Esc y cambio de modelo.
- Un gesto/lote real se deshace en un Undo; no-op/hover/cancelación/cuentagotas no crean operaciones. Comparar geometría, dimensiones, nombres, materiales/UV y atributos/OCL.
- Cuentagotas frente/dorso toma UUID exacto aprobado, nunca pinta ni adivina materiales heredados/sin vínculo. Revisar mismos casos de0.8.3 en contexto de la nueva paleta.
- Muebles muestra dibujo mientras se cambia nombre. `Resaltar en SketchUp` usa Tool de lectura y ruta completa: anidados/rotados/espejados/definiciones compartidas, solo la ocurrencia indicada. No cambia selección, active_path, geometría, dimensiones ni Undo. Esc/clic finalizan.
- Vista previa de nombres y sincronización anteriores permanecen; agrupación por definición/medidas/material no renombra hasta edición explícita. Volver de modelo conserva nombres pendientes; otro modelo no recibe guardado de la guía anterior.

## Maderera y A4

- Revisar lote, material/espesor y cantos principal/secundario, orientación local/veta y alertas antes de TXT. Salida exacta nueve columnas TAB: cant/base/altura/detalle/rota/canto_arr/canto_aba/canto_izq/canto_der. Nada de material/espesor extra dentro del TXT; no enviar pedido comercial por este ensayo.
- BM17: una/dos vistas A4, cámara/zoom, ocultas interiores por ruta, etiquetas, cotas movibles y notas/flechas. Guardar/reabrir conserva configuración. PDF una página297×210mm y todas las17 unidades, texto legible, sin generar páginas extra ni recortar tabla.
- Repetir exportación con diálogo Guardar abierto al menos158segundos; archivo válido y mensaje de éxito sin error rojo. Cancelar tras158s y reintentar rápido. El arreglo0.8.2 sigue necesitando confirmación nativa; no usar Ruby.sleep como sustituto del selector humano.

## Pantallas, evidencia y retorno

Probar1280 × 720 y1920 × 1080 con DPI nativo100/125/150%, paleta compacta y ventana amplia. Las pruebas nube usaron zoom CSS y no prueban DPI de SketchUp. Deben verse completos dibujo, controles y nombres, sin scrollhorizontal excesivo ni foco detrás de modales. Comparar galería sintética incluida solo como referencia de distribución; no equivale a una captura real de la barra de SketchUp.

Devolver informe por caso PASS/FAIL/PENDIENTE, hashes de instalación antes/después, capturas nativas de cinco módulos/toolbar/paleta/importación, conteos y estados de35 SKM, persistencia global/SKP, snapshots/Undo, PDFs y render/texto/tamaño, TXT sintético validado y errores reproducibles. No transferir SKM/texturas comerciales salvo autorización; separar paquetes menores de32MiB si se adjuntan evidencias. Diferenciar gestos manuales y configuraciones sembradas por fixture.

Rollback: cerrar SketchUp, reinstalar0.8.3, restaurar copia completa del catálogo/activos si se requiere revertir los cambios del ensayo. No borrar originales/backups. No hay nueva migración de guide_v1, preferenciasps2/schema2 ni esquema1 de CatalogStore; los candidatos añaden procedencia en observed y activos privados separados.

Pendientes globales: SKU/materiales reales del taller, veta industrial, perfil QA sin OCL, rendimiento con bibliotecas/modelos grandes e importación comercial válida al proveedor. Sin aprobación de producción hasta pruebas reales y aceptación del taller.


## Verificadores de solo lectura

Extraer el paquete en una carpeta local. En Consola Ruby, adaptar únicamente la ruta:

```ruby
load 'C:/QA/PlanosSanto084/verificar_instalacion_sketchup.rb'
puts JSON.pretty_generate(PlanosSantoValidacion084.integridad)
```

El resultado debe indicar versión0.8.4,47 hashes de payload comprobados, mismatches vacío y modelo intacto. El manifiesto es el archivo48; no cuenta dentro de sus propios hashes. Esta consulta no pinta, no instala ni reemplaza producto.

Para preferencias, primero elegir opciones reales y Activar en UI. Luego consultar únicamente los valores efectivamente elegidos, por ejemplo mode/side/batch:

```ruby
load 'C:/QA/PlanosSanto084/verificar_preferencias_sketchup.rb'
puts JSON.pretty_generate(PlanosSantoPreferencias084.check(
  'mode' => 'sheet', 'side' => 'front', 'batch' => true
))
```

Adaptar ese Hash a la UI observada, no sembrar opciones con el verificador. Repetir tras cerrar todas las ventanas de SketchUp y reiniciar; verificar además que los permisos compartidos requieran autorización nueva. Las cinco muestras recientes pertenecen solo a la sesión de paleta, no se presentan como historial permanente.
