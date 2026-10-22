# Restricciones — evitar cambios destructivos

- **No** reemplazar `src/` del repositorio con la carpeta `referencia/` ni instalar el RBZ desde un ambiente de nube en una máquina Windows ajena.
- **No** tocar modelos `.skp` originales ni borrar backups. Usar copias exclusivas de ensayo.
- **No** desinstalar OpenCutList. El objetivo es una extensión autónoma, pero todavía hay compatibilidad por validar.
- **No** marcar listo un pedido por tener nueve columnas correctas: también verificar orientación 2D, dimensión y cantos; en proveedor se seleccionan por separado melamina, espesor, canto principal y secundario.
- **No** borrar datos de biblioteca, del modelo o de OpenCutList al cambiar selección/modo. Los atributos OCL se leen; nunca escribirlos en este loop.
- **No** usar `allowShared:true`, `confirmed:true` o cambios de alcance en modo silencioso para saltar validaciones. La vista previa y el bloqueo por definiciones compartidas son condiciones de seguridad de producción.
- **No** modificar medidas, caras, componentes o nombres desde el cuentagotas.
- **No** iniciar exportaciones de pedidos, PDFs o renombrados con un clic de acceso: solo navegar al lugar correspondiente y pedir confirmación explícita.
- No exponer archivos privados del taller en repositorios públicos. No subir modelos de clientes a servicios externos sin autorización.
- Evitar nuevas dependencias de red. Conservar funcionamiento local de SketchUp 2026.
