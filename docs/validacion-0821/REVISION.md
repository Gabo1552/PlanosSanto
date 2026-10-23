# Revisión independiente de las correcciones

- **Ruby/biblioteca y seguridad:** comparación compartida de listas normalizadas; JSON y ZIP validan antes de escribir y conservan las fichas originales. Sin hallazgos bloqueantes. RuboCop, Brakeman y bundler-audit no están instalados; no se atribuye un escaneo automatizado a esa revisión.
- **Escena TypeScript:** arreglo de tapas salientes sin mutar geometría, visibilidad nativa ni identidad. Pruebas de frente local, giro/espejo y mueble abierto. Se reprodujo un límite preexistente con tiradores planos orientados como una puerta; se acotó la afirmación y se registró en CAMBIOS.md.
- **Pedidos e interfaz:** mapa de cantos compartido, revalidación de giro y respuestas asíncronas revisados. Se detectó que dos fichas distintas pueden tener el mismo SKU; se corrigió añadiendo nombre/ordinal a sus etiquetas impresas cuando hay colisión. La prueba cruzada Ruby→PDF cubre el caso y el revisor confirmó que una ficha única conserva su etiqueta.
- **Regresión:** pruebas nuevas demostraron los fallos antes del arreglo. La prueba PDF/TXT lee el PDF producido con Poppler y verifica códigos y leyenda; no se limita a comparar objetos internos. La prueba de giro usa la interfaz y el controlador Ruby, exporta un TXT y comprueba sus columnas. Los ensayos usan datos sintéticos y dobles de SketchUp.

No se ejecutó SketchUp nativo en esta revisión ni se declara aceptación industrial. Resultados finales en RESULTADOS.json.
