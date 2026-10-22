# Instalar y probar el agregado de nombres — Planos Santo 0.5.1

Paquete: `../artifacts/PlanosSanto-0.5.1.rbz`. La 0.5.0 anterior se conserva. Este agregado cambia nombres de instancias y sus metadatos propios; sus pruebas reales deben hacerse sobre una copia del SKP del taller. No requiere servicio web ni enviar el modelo.

1. En SketchUp 2026: Administrador de extensiones → Instalar extensión → elegir `PlanosSanto-0.5.1.rbz`, sin descomprimir. Reiniciar SketchUp si se actualiza una versión cargada.
2. Abrir una copia de `CA AmSurrbac (1).skp`. Entrar a Extensiones → Planos Santo → Planos Santo.
3. Elegir el mueble en el árbol o usar Seleccionados desde SketchUp. Antes de generar guías, pulsar **Nombres de grupos y piezas**. Si hay una guía con cambios pendientes, guardarla primero.
4. En **Mueble / grupo**, confirmar la ruta del padre correcto. Revisar todos los niveles, nombres actuales y nombres nuevos. Los contenedores interiores se muestran pero no reciben automáticamente un prefijo de pieza.
5. Editar **Nombre del mueble**. Se recalcula la **Abreviatura**, que también puede sobrescribirse. Se pueden editar los nombres base de las piezas. Ningún nombre se escribe mientras se edita la vista previa.
6. Probar **Cancelar** o Escape y comprobar que el modelo sigue igual. Volver a abrir y pulsar una vez **Confirmar cambios**. Se actualizan el nombre del padre y los nombres de instancias hijas, conservando las definiciones.
7. Repetir la confirmación sin editar: debe informar **Sin cambios** sin crear otro paso de Deshacer. Cambiar el mueble a otro nombre: el prefijo gestionado se reemplaza sin acumularse. Un nombre ajeno que ya tenía guiones o prefijo se conserva completo como base; no se adivina qué parte borrar.
8. Pulsar Ctrl+Z en SketchUp: debe revertir todo el lote, incluidos nombres de la guía y metadatos del renombrado. Actualizar la vista previa para leer el estado después de Deshacer.
9. Volver a aplicar en la copia, guardar el SKP con Ctrl+S, cerrar SketchUp y reabrir el archivo. Revisar nombres, abreviaturas y bases. Regenerar las guías: deben mantener los códigos/notas/anclas existentes y mostrar los nombres confirmados.
10. En otro caso de prueba, elegir un padre cuya definición se repite o contiene subgrupos compartidos. Debe mostrar las rutas/advertencia y bloquear **Confirmar cambios**. No se ejecuta Hacer único. Resolver definiciones compartidas requiere una decisión aparte con pruebas; este agregado no las modifica.

Si el modelo cambió afuera del panel, la confirmación se rechaza hasta **Actualizar vista previa**. Un nombre aplicado pero con relectura fallida se informa expresamente como aplicado: guardar el SKP y volver a analizar antes de generar guías.

Las pruebas automáticas usaron geometría sintética y dobles de SketchUp. El panel se cargó desde los bytes empaquetados con red desconectada. No prueban `HtmlDialog#set_file`, Ctrl+Z ni guardado físico nativos en Windows. Completar `VALIDACION_SKETCHUP.md` después de esas verificaciones; su estado sigue PENDIENTE.

Para informar un error: versión exacta de SketchUp, versión del RBZ, ruta del mueble, nombres actuales/propuestos, pasos y mensaje mostrado. Conservar la copia original del modelo. No cambiar el registro a aprobado si algo falla.
