# P0.1 — Arquitectura real al comenzar OpenCutList

Fecha: 2026-10-17. Base conservada: **Planos Santo 0.6.4**, no la 0.3 mencionada en el paquete de trabajo. La 0.3 sigue disponible como exportador legado. La nueva 0.6.5 agrega solamente el diagnóstico P1 y su registro/paquete, sin reemplazar los motores de guías.

| Parte | Fuentes | Responsabilidad / límite verificado |
|---|---|---|
| Web | `app/`, `components/`, `lib/` | Next.js 15, React 19, TypeScript; importar exportación Ruby/ZIP, editar guías, persistencia local servidor, PDF. No interpreta SKP directamente. |
| Exportador legado | `sketchup/planos_santo/` | Ruby, recorrido de componentes/grupos, mallas trianguladas, mm, ZIP local y transporte autorizado; conserva versión 0.3. |
| Extensión local | `sketchup_offline/{planos_santo,bootstrap,offline,session,guide_store,names}.rb` | Registro independiente `PlanosSanto`, HtmlDialog, sesión/fingerprint, atributos de guía, renombrado deshacible de instancias y guardado SKP existente. |
| UI offline | `sketchup_offline/ui/` | React/Three.js empaquetado con esbuild, selección geométrica y lista al lado del dibujo; sin servidor necesario. |
| PDF | `lib/pdf*`, `lib/geometry*` y UI | pdf-lib/fontkit/fuentes locales, A3 horizontal, frente/atrás, cámaras guardadas, cotas movibles/ocultables, notas ancladas e ID ocultable. |
| Agrupación existente | `lib/pieceGroups.ts` y `names.rb` | Opcional: misma definición, geometría, medidas y material; comparte ID de fabricación/nombre y suma cantidades, conservando cada identidad física. Prevalece el criterio confirmado por el usuario sobre el documento adjunto anterior. |
| Diagnóstico nuevo | `sketchup_offline/p1_diagnostics.rb` | Contrato de observaciones separado de la guía; no cambia el importador ni convierte materiales/cantos en datos confirmados. |
| SDK C | `native/`, contrato en lector | Adaptador previsto; SDK no instalado. La vía real existente es la API Ruby del SketchUp del usuario. |
| Pruebas/build | `scripts/`, `tests/`, `sketchup*/test/` | `npm run verify`; Ruby usa dobles públicos de API, Playwright Chromium usa UI empaquetada. Esto NO prueba instalación/renderizado Ruby nativos en Windows. |

## Respaldo e integridad (P0.2/P0.4)

La rama inicial `work` no tiene commits y los archivos están sin seguimiento. Se eligió **respaldo de archivos**, sin fingir una rama base o commit: `artifacts/respaldo-064-antes-arranque-ocl.tar.gz`, 173 archivos, SHA256 `3fb26f30618d8907b31d33a3f3ec18a5005cc90bbeea1358ca36dba31748be1a`. Excluye corpus, SKP, datos de clientes, credenciales, dependencias y builds. El manifiesto adyacente registra exclusiones. Los RBZ anteriores no se reconstruyen ni se sobrescriben.

Los nueve SKP privados se extrajeron bajo `planos-santo-arranque/referencias_privadas/`, ignorados por Git **antes** de extraerlos. `python3 planos-santo-arranque/scripts/verificar_corpus.py`: nueve hashes SHA256 correctos, 13.559.119 bytes. El índice aporta **1523 nombres de definiciones**, que no equivalen a 1523 piezas ni instancias físicas. No se abrieron esos SKP en este entorno; no se conocen todavía su frente, cantos ni la clasificación real de todos sus elementos. No publicar corpus, catálogos candidatos, nombres de proyectos ni diagnósticos recibidos en ejemplos públicos/CI/RBZ.

## Regresiones que deben permanecer

Instalar/actualizar con carpetas DOS y arranque visible; guía y piezas originales; campos obra/módulo; selección sobre dibujo/tabla; nombres de instancia y Undo; rotación y ambas cámaras; agrupación optativa y cantidades; notas por instancia; guardar/cerrar; cotas movibles/ocultables y sin espesor; ID ocultable; guardar y después exportar sin falso cambio de geometría; PDF A3 una página/mueble; importación web/ZIP y exportador legado. Validación automatizada de referencia 0.6.4: 85 Ruby/543 assertions, 62 TypeScript, 38 E2E. Persiste la validación Windows pendiente de esas funciones.

## Ejecutar el entorno

Node 24, Python 3.12, Ruby 3.3 mediante `RUBY_BIN` o `/workspace/.tools/ruby/bin/ruby`, Chromium del sistema. Dependencias presentes (`npm ci` si se recrea el entorno); `npm run build:offline`, `npm run verify`; web con `npm run dev` o `npm run build` y `npm start`. Los scripts detectan Ruby; no instalar el SDK C para comprobar la extensión Ruby. SketchUp 2026 Windows debe ejecutar las comprobaciones nativas documentadas en `docs/prueba-p1-sketchup-2026.md`.
