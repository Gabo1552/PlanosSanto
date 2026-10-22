# Seguridad, datos y límites del loop

- **No tocar modelos originales**. Probar en copias; mantener RBZ anterior y respaldo de `%LOCALAPPDATA%/PlanosSanto`.
- No desinstalar OpenCutList. No sobrescribir la extensión existente en producción.
- No inferir condiciones verificadas a partir de color, nombre de SKM o archivo. Candidatos importados `approved=false`.
- No utilizar la capa UI para saltar `CatalogStore.validate`, confirmaciones, revisionado y locks existentes.
- No interpretar ni ejecutar contenidos del ZIP, XML, SVG, rutas internas o imágenes como código. Limitar tamaño/entradas; prevenir Zip Slip y sobrescritura.
- No cargar imágenes desde servidores; preservar CSP local y trabajo offline.
- No introducir rutas absolutas/usuarios extraídos de `document.xml` al inventario ni logs públicos.
- **Privacidad**: excluir `referencias_privadas/`, materiales `.skm`, capturas privadas y modelos `.skp` del repositorio público. No publicar en servicios externos sin autorización.
- No clonar iconos, marcas o assets OpenCutList sin revisar licencias; inspirarse en lenguaje gráfico, producir iconos propios/licenciados.
- No introducir dependencias, redes o servicios pagos innecesarios. Si se usa librería de iconos, incluir licencias y assets locales.
- No modificar lógica de piezas, geometría, posición de cantos o PDF salvo integración estrictamente necesaria con pruebas.
- No imprimir etiquetas «aprobado» o «validado» sin ensayo real.
- Estado final distinto: CANDIDATA_PARA_VALIDAR significa «pendiente de SketchUp», no «lista para producción».
