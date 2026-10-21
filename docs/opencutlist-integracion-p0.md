# P0.3 — Decisión de integración con OpenCutList

Revisión de código realizada el 2026-10-17, sin ejecutar su build ni instalar dependencias.

- Repositorio oficial: https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension
- Revisión fijada: **d03f4548e161ed25615b2ea828214a79e0f3e07a**, HEAD/master consultado con `git ls-remote` y clon verificado con `git show -s`.
- Constantes de esa revisión: **7.1.0**, build **202511301621** (`src/ladb_opencutlist/ruby/constants.rb`); fecha del commit 2026-02-09. No se afirma que sea la versión instalada en Windows del usuario ni la última publicación comercial.
- Licencia: [GNU GPLv3 del upstream fijado](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension/blob/d03f4548e161ed25615b2ea828214a79e0f3e07a/LICENSE). Registro del loader atribuye L’Air du Bois; `build/package.json` declara GPL-3.0.

## Hallazgos concretos

| Área | Código upstream revisado | Consecuencia |
|---|---|---|
| Registro | `src/ladb_opencutlist.rb` | Namespace `Ladb::OpenCutList`, loader `ladb_opencutlist.rb`; no reutilizar esos nombres para instalar Planos Santo. |
| Atributos | `ruby/plugin.rb`, `ruby/model/attributes/{material,definition}_attributes.rb` | Diccionario `ladb_opencutlist`. Obtener UUID mediante sus helpers puede escribir atributos (`material_attributes.rb:195`, `definition_attributes.rb:103`). El diagnóstico lee una lista limitada de claves con API pública, sin construir helpers ni generar UUID. |
| Despiece | `ruby/worker/cutlist/cutlist_generate_worker.rb` | Usa helpers de límites/visibilidad/atributos, definición y origen de material propio/heredado/hijo. No equivale a clasificar tablones por tres medidas ordenadas. |
| Optimización | `ruby/worker/cutlist/cutlist_cuttingdiagram{1d,2d}_worker.rb` | Depende de cutlist/grupos y packing; no exponerlo como API estable por su nombre de clase. |
| Herramientas | `ruby/worker/{materials/materials_smart_paint,cutlist/cutlist_labels,cutlist/cutlist_estimate}_worker.rb` | Smart Paint, etiquetas y presupuesto deben permanecer en el complemento oficial hasta disponer de pruebas de integración/paridad. |
| Build | `build/{package.json,gulpfile.js}`, raíz `CMakeLists.txt`, `Gemfile` | Gulp 4, LESS, Twig, JS, traducciones y RBZ; librerías C/C++ con CMake ≥3.18 y C++17, binarios específicos Windows/macOS. Gemfile incluye minitest/stubs solo para desarrollo. No es copiar un Ruby y cambiar el título. |

## Decisión: integración aditiva por fases

Planos Santo mantiene loader `planos_santo.rb`, namespace `PlanosSanto`, preferencias y paquete propios. OpenCutList oficial permanece instalado por separado; esta entrega no empaqueta/copía su código, no modifica sus atributos y no llama motores internos. El contrato `planos-santo.diagnostic.v1` observa geometría y atributos ya presentes. Funciona también sin OpenCutList y reporta namespace/versión/build si están cargados, sin forzar su carga. Detectar el namespace no prueba que todo su runtime esté activo.

Un fork completo requeriría mantener su frontend/build, binarios, actualizaciones y pruebas de paridad, además de las obligaciones GPL y de terceros. No hay evidencia geométrica ni pruebas Windows suficientes para asumir ese mantenimiento en P0/P1. Un futuro adaptador que invoque motores necesitará fijar compatibilidad, pruebas de contratos y revisar cómo se distribuye; si se incorpora o deriva código GPL se deberán conservar licencia/atribuciones y proporcionar el código fuente correspondiente y scripts exigidos por esa licencia. No se presenta este diagnóstico independiente como un fork de OpenCutList.

P3/P5 quedan pendientes: biblioteca aprobada y editor de materiales/cantos, conexión a Smart Paint, optimización, etiquetas y presupuestos en flujo unificado. Sus herramientas originales no se eliminan; **no se afirma paridad integrada ni prueba de coexistencia real hasta ejecutarla en SketchUp**. El catálogo adjunto es candidato, sin precios aprobados. No se exportarán pedidos productivos a partir de medidas/ejes/cantos inciertos.

## Reproducir auditoría sin instalar

Clonar el repositorio oficial en una carpeta de auditoría independiente y hacer checkout del hash fijado; consultar `LICENSE`, `src/ladb_opencutlist/ruby/constants.rb`, `ruby/plugin.rb` y los archivos de la tabla. El clon de esta sesión está en `/workspace/.cache/planos-santo-opencutlist-audit`. No se agregó como dependencia ni se incluyó en el RBZ.
