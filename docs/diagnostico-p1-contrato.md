# P1.1/P1.3 — Contrato local de observación

`sketchup_offline/p1_diagnostics.rb`, módulo independiente `PlanosSanto::P1Diagnostics`. Formato `planos-santo.diagnostic.v1`. Se ejecuta desde menú, antes de guardar el archivo pregunta dónde escribir. Cancelar no recorre el modelo. Nunca llama `save`, `start_operation`, `set_attribute`, renombra ni modifica entidades; no hay red. Solo escribe un JSON nuevo (`EXCL`, no sobreescritura); máximo 30 MiB. Un fallo de escritura elimina el archivo incompleto que creó. No cargarlo como si fuese la exportación de guía anterior: los contratos tienen propósitos diferentes.

## Identidades y alcance

Recorre **todo el modelo**, incluso ocultos, desde `model.entities` (no desde `active_entities`). Cada instancia física tiene `path` de persistent IDs de todos sus ancestros, más `model_guid` en el informe. `model_guid` es contexto observado, no se promete que sea un UUID de proyecto inmutable entre guardados/copias; un adaptador persistente deberá vincularlo al proyecto de la aplicación sin escribir desde este diagnóstico. Dos apariciones de una definición compartida conservan rutas distintas, también sus hijos. `selection_paths` antepone `active_path` si el usuario seleccionó dentro de un grupo abierto. Los padres con hijos son candidatos a contenedor; una hoja queda **sin clasificar**. Ningún nombre convierte automáticamente una entidad en mueble/tablón.

La geometría de definición se guarda una vez; sus claves `definition:<object_id>` son referencias **locales al informe**. `guid_revision` solo es evidencia de revisión; no es una identidad física estable ni se usa para renombrar. Faltantes de PID producen ID de sesión e incidencia con `complete:false`. Guardar el SKP o cambiar de sesión no promete estabilidad de claves internas de definición/material; las rutas de instancias existentes son la referencia persistente.

## Geometría, medidas y materiales

- Matrices locales/mundiales de 16 números, por columnas: base adimensional, **traslación en mm**. Vértices/loops/extremos de aristas en mm. No mezclar matrices en pulgadas con coordenadas en mm.
- Caras: PID, todos sus loops exterior/interiores (agujeros), triangulación de `Face#mesh(0)`, normal local, área local en mm² **sin escala de instancia**, materiales frente/dorso, aristas, tag/visibilidad. No se rellena una cara con agujeros mediante un abanico artificial. Si la API no entrega triángulos válidos, falla sin guardar una aproximación.
- Aristas: PID, extremos, caras adyacentes, material, soft/smooth/hidden y tag. Son referencias de geometría, no cantos confirmados.
- Instancias: material directo, heredado y efectivo. En cada aparición, material propio de cara prevalece y, si falta, se hereda el efectivo de la instancia; visibilidad de cara se combina con visibilidad de ancestros/instancia. Frente y dorso pueden tener material distinto. La pintura no confirma el material de fabricación.
- `axis_lengths_mm` conserva XYZ de **geometría directa** de la definición, escalados por normas de columnas mundiales. No ordena largo/ancho/espesor, no incluye hijos en el cálculo ni usa AABB mundial rotado. Un contenedor sin caras directas tiene medidas nulas. Escala no uniforme, espejo, singularidad y shear se informan; con shear estas longitudes no son un ortoedro de corte.
- Solo se listan materiales referenciados por entidades recorridas; no se vuelca la biblioteca completa, texturas/rutas ni precios. Atributos observados OCL: type, grained, std_sizes, std_thicknesses, std_widths, std_lengths, edge_decremented. Valores escritos por versiones diferentes pueden ser incompatibles: tipos no admitidos o cadenas enormes generan incidencia, no interpretación automática. Catálogo nunca aprobado automáticamente.

`production_ready` es siempre falso. Se requieren raíces de muebles verificadas, clasificación de tablones, contraste manual de medidas, frente de mueble, veta y correspondencia de cantos. No se deducen `canto_arr/aba/izq/der` a partir de una cara pintada.

## Límites explícitos

Máximos globales: 20.000 instancias, 10.000 definiciones, 100.000 caras, 600.000 puntos serializados (incluye repeticiones en loops/extremos), 300.000 aristas, 200.000 triángulos, 64 niveles y 30 MiB de archivo. Ciclos o límites dejan `complete:false` e incidencias; no se presenta un informe parcial como completo. `counts` mide observaciones consumidas durante el recorrido, incluso las del bloque que se interrumpió; no equivale a la cantidad física de tablones. Geometría única por definición no se multiplica por cantidad de instancias. Caras/aristas sueltas de raíz se conservan en `root_geometry`. Objetos no basados en caras/aristas/componentes, como textos/cotas/imágenes de SketchUp, están fuera del contrato de geometría de fabricación.

Comprobación estructural: `python3 scripts/validar_diagnostico_p1.py informe.json`. La comprobación devuelve cantidades agregadas; **no valida contra el SketchUp real ni acepta orientación/cantos para producción**. No subir informes reales a Git/CI ni incluirlos en RBZ; guardarlos en una carpeta privada local.
